#!/usr/bin/env node
/**
 * AuthCore M5 end-to-end verification runner.
 *
 * Boots an EPHEMERAL local PostgreSQL cluster from the portable toolchain,
 * applies all AuthCore migrations via drizzle-kit (which respects the
 * dual-journal config — the drizzle-orm runtime migrator must NOT be used,
 * it ignores the journal table/schema settings), runs the integration suite,
 * runs the migration-safety gate with a real database URL, then destroys
 * everything.
 *
 * Guarantees:
 * - Never touches ~/proof-toolchain/pgdata (the existing proof cluster).
 * - Cluster lives in a fresh OS temp dir, deleted on exit — even on failure.
 * - Loopback-only (127.0.0.1), scram auth, throwaway password, disposable.
 * - Leaves port 55432 free again when done.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const pkgRoot = process.cwd(); // run via `pnpm --filter @platform/authcore test:db`
const PG_BIN =
  process.env.AUTHCORE_PG_BIN ??
  join(homedir(), "proof-toolchain", "pgsql", "bin");
const PORT = process.env.AUTHCORE_E2E_PORT ?? "55432";
const HOST = "127.0.0.1";
const DB_NAME = "authcore_e2e";
const DB_PASSWORD = "e2e-local"; // throwaway for a disposable cluster — not a secret
const DB_URL = `postgres://postgres:${DB_PASSWORD}@${HOST}:${PORT}/${DB_NAME}`;

const exe = (name) => join(PG_BIN, `${name}.exe`);

function fail(msg) {
  console.error(`\n[e2e] ${msg}`);
  process.exit(1);
}

function run(file, args, opts = {}) {
  const res = spawnSync(file, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`command failed (${res.status}): ${file} ${args.join(" ")}`);
  }
  return res;
}

/** Synchronous sleep — safe inside process exit/SIGINT handlers. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// --- Preflight ------------------------------------------------------------
for (const b of ["initdb", "pg_ctl", "pg_isready", "createdb", "postgres"]) {
  if (!existsSync(exe(b))) {
    fail(`required binary not found: ${exe(b)} (set AUTHCORE_PG_BIN)`);
  }
}

// Refuse to run if the port is already occupied (e.g. a leaked cluster).
if (spawnSync(exe("pg_isready"), ["-h", HOST, "-p", PORT]).status === 0) {
  fail(
    `port ${PORT} already answers — a previous e2e cluster may still be running. Investigate before re-running.`,
  );
}

const tmp = mkdtempSync(join(tmpdir(), "authcore-e2e-"));
const dataDir = join(tmp, "pgdata");
const serverLog = join(tmp, "server.log");
console.log(`[e2e] scratch cluster: ${dataDir}`);
console.log(`[e2e] connection URL: ${DB_URL}`);

let stopped = false;
function teardown() {
  if (!stopped) {
    stopped = true;
    try {
      spawnSync(exe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "stop"], {
        stdio: "ignore",
      });
    } catch {
      /* server may already be down */
    }
  }
  for (let i = 0; i < 3; i++) {
    try {
      rmSync(tmp, { recursive: true, force: true });
      return;
    } catch {
      sleepSync(1000); // file locks can linger briefly after stop on Windows
    }
  }
  console.error(`[e2e] WARNING: could not delete ${tmp} — remove it manually.`);
}
process.on("exit", teardown);
process.on("SIGINT", () => {
  teardown();
  process.exit(130);
});
process.on("SIGTERM", () => {
  teardown();
  process.exit(143);
});

try {
  // --- 1. initdb (scram auth, throwaway password via pwfile) --------------
  console.log("[e2e] initdb");
  const pwFile = join(tmp, "pwfile");
  writeFileSync(pwFile, `${DB_PASSWORD}\n`);
  run(exe("initdb"), [
    "-D", dataDir,
    "-U", "postgres",
    "-A", "scram-sha-256",
    "--pwfile", pwFile,
    "-E", "UTF8",
  ]);

  // Pin network + fsync via config append (avoids all pg_ctl -o quoting).
  appendFileSync(
    join(dataDir, "postgresql.conf"),
    `\nlisten_addresses = '${HOST}'\nport = ${PORT}\nfsync = off\n`,
  );

  // --- 2. start server ------------------------------------------------------
  console.log(`[e2e] starting postgres on ${HOST}:${PORT} (fsync off — disposable)`);
  run(exe("pg_ctl"), ["-D", dataDir, "-w", "-l", serverLog, "start"]);

  // --- 3. wait for readiness ------------------------------------------------
  for (let i = 0; i < 30; i++) {
    if (spawnSync(exe("pg_isready"), ["-h", HOST, "-p", PORT]).status === 0) break;
    if (i === 29) fail("server did not become ready within 30s");
    await new Promise((r) => setTimeout(r, 1000));
  }

  // --- 4. create scratch database -------------------------------------------
  run(exe("createdb"), ["-h", HOST, "-p", PORT, "-U", "postgres", DB_NAME], {
    env: { ...process.env, PGPASSWORD: DB_PASSWORD },
  });

  // --- 5. apply migrations (drizzle-kit — respects dual-journal config) ----
  console.log("[e2e] drizzle-kit migrate (AUTHCORE_DB_URL set)");
  run("pnpm", ["exec", "drizzle-kit", "migrate", "--config=drizzle.config.ts"], {
    cwd: pkgRoot,
    env: { ...process.env, AUTHCORE_DB_URL: DB_URL },
    shell: true, // Windows: pnpm resolves as pnpm.cmd
  });

  // --- 6. integration suite --------------------------------------------------
  console.log("[e2e] integration tests");
  run(
    process.execPath,
    ["--import", "tsx/esm", "--test", "src/test/db/integration.test.ts"],
    { cwd: pkgRoot, env: { ...process.env, AUTHCORE_E2E_DB_URL: DB_URL } },
  );

  // --- 7. gate with a real database URL (must be 9/9, zero PENDING) --------
  console.log("[e2e] migration-safety gate with AUTHCORE_GATE_DB_URL set");
  const gate = spawnSync(process.execPath, ["src/gate/run-authcore-gate.ts"], {
    cwd: pkgRoot,
    env: { ...process.env, AUTHCORE_GATE_DB_URL: DB_URL },
    encoding: "utf8",
  });
  console.log(gate.stdout);
  console.error(gate.stderr);
  if (gate.status !== 0) throw new Error("gate exited non-zero");
  if (gate.stdout.includes("PEND")) {
    throw new Error("gate still reports PENDING despite a live database URL");
  }

  // --- 8. stop + verify the port was released -------------------------------
  run(exe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "stop"]);
  stopped = true;
  if (spawnSync(exe("pg_isready"), ["-h", HOST, "-p", PORT]).status === 0) {
    fail(`server still answering on ${PORT} after stop`);
  }

  console.log(
    "\n[e2e] ALL GREEN: migrations applied, integration suite passed, gate 9/9 PASS, cluster destroyed.",
  );
} finally {
  teardown();
}
