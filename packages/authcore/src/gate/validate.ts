import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { extractSetup, runSetupChecks, type GateFinding } from "./checks.ts";
import type { Client as PgClient } from "pg";

export interface FullGateResult {
  readonly findings: GateFinding[];
  readonly failures: number;
  readonly pending: number;
}

/**
 * Optional database-presence verification. NEVER mutates: read-only SELECTs
 * against a caller-provided scratch-database URL (export AUTHCORE_GATE_DB_URL).
 * A missing variable yields an explicitly PENDING finding — never a claimed pass.
 */
export async function validateAuthcorePackage(pkgRoot: string): Promise<GateFinding[]> {
  const configPath = join(pkgRoot, "drizzle.config.ts");
  let configText: string;
  try {
    configText = await readFile(configPath, "utf8");
  } catch (err) {
    return [
      {
        check: "drizzle-config",
        pass: false,
        detail: `drizzle.config.ts not readable at ${configPath}: ${(err as Error).message}`,
      },
    ];
  }

  const setup = extractSetup(configText);
  if (setup === null) {
    return [
      {
        check: "drizzle-config",
        pass: false,
        detail: "drizzle.config.ts could not be parsed for out/schema/schemaFilter — refusing to guess",
      },
    ];
  }

  const findings: GateFinding[] = runSetupChecks(pkgRoot, configText);

  // Parity probe: the imported config must agree with the parsed text. This
  // guarantees text-extraction drift surfaces as a failure, not a false pass.
  try {
    const parsedConfig = await import(pathToFileURL(configPath).href);
    const defaultExport = parsedConfig as { default?: Record<string, unknown> };
    const migrations = defaultExport.default?.migrations as
      | { table?: unknown; schema?: unknown }
      | undefined;
    if (migrations === undefined) {
      findings.push({
        check: "config-import-parity",
        pass: false,
        detail: "imported drizzle.config.ts default export exposes no migrations block",
      });
    } else {
      const realTable = typeof migrations.table === "string" ? migrations.table : null;
      const parityOk = realTable !== null && realTable === setup.journalTable;
      findings.push({
        check: "config-import-parity",
        pass: parityOk,
        detail: parityOk
          ? "imported drizzle.config.ts agrees with the parsed values"
          : `imported journal table (${String(realTable)}) disagrees with parsed value (${String(setup.journalTable)})`,
      });
    }
  } catch (err) {
    findings.push({
      check: "config-import-parity",
      pass: false,
      detail: `importing drizzle.config.ts failed: ${(err as Error).message}`,
    });
  }

  return findings;
}

export async function checkDatabasePresence(databaseUrl: string | undefined): Promise<GateFinding> {
  if (databaseUrl === undefined || databaseUrl === "") {
    return {
      check: "db-presence",
      pass: true,
      pending: true,
      detail:
        "PENDING — not a pass: no database was provided. Set AUTHCORE_GATE_DB_URL to a dedicated scratch-database URL to verify schema/journal presence in real PostgreSQL",
    };
  }

  let client: PgClient;
  try {
    const pgMod = await import("pg");
    const ClientCtor = pgMod.Client ?? (pgMod as unknown as { default: typeof pgMod }).default.Client;
    client = new ClientCtor({ connectionString: databaseUrl });
    await client.connect();
  } catch (err) {
    return {
      check: "db-presence",
      pass: false,
      detail: `could not connect to the provided scratch database: ${(err as Error).message}`,
    };
  }

  try {
    const usersReg = await client.query(`SELECT to_regclass('authcore."users"') AS reg`);
    const journalRows = await client.query(`SELECT COUNT(*)::int AS n FROM "drizzle"."authcore_migrations"`);
    const reg = usersReg.rows[0]?.reg ?? null;
    const journalCount = Number(journalRows.rows[0]?.n ?? 0);

    if (reg === null) {
      return {
        check: "db-presence",
        pass: false,
        detail: 'database reachable, but authcore."users" does not exist — migrations did not land (the known silent-skip signature)',
      };
    }
    if (journalCount < 1) {
      return {
        check: "db-presence",
        pass: false,
        detail: "authcore_migrations journal is present but has no rows despite an existing users table",
      };
    }
    return {
      check: "db-presence",
      pass: true,
      detail: `schema + users + journal present (${String(journalCount)} journal rows)`,
    };
  } catch (err) {
    return {
      check: "db-presence",
      pass: false,
      detail: `database queries failed: ${(err as Error).message}`,
    };
  } finally {
    await client.end();
  }
}
