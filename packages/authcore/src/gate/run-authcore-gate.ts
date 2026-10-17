import { join } from "node:path";
import { validateAuthcorePackage, checkDatabasePresence } from "./validate.ts";

const pkgRoot = join(import.meta.dirname, "..", "..");
const findings = await validateAuthcorePackage(pkgRoot);
const dbFinding = await checkDatabasePresence(process.env["AUTHCORE_GATE_DB_URL"]);
findings.push(dbFinding);

const failures = findings.filter((f) => !f.pass).length;
const pending = findings.filter((f) => f.pending === true).length;

console.log("=== AuthCore migration-safety gate ===");
for (const f of findings) {
  const mark = f.pending === true ? "PEND" : f.pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${f.check} — ${f.detail}`);
}

if (failures > 0) {
  console.error(`\nGATE FAILED with ${String(failures)} failure(s).`);
  if (pending > 0) console.warn(`(Also ${String(pending)} pending database check(s).)`);
  process.exitCode = 1;
} else {
  const pendingNote =
    pending > 0
      ? ` ${String(pending)} database-presence check PENDING — configuration is safe, but real-PostgreSQL presence is still unverified until AUTHCORE_GATE_DB_URL is provided.`
      : "";
  console.log(`\nGATE: configuration checks all passed.${pendingNote}`);
}
