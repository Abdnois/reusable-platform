import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  DEFAULT_JOURNAL_TABLE,
  checkJournalTable,
  checkMetadataSchema,
  checkOutDir,
  checkSchemaFilter,
  extractSetup,
  runSetupChecks,
} from "../gate/checks.ts";
import { validateAuthcorePackage } from "../gate/validate.ts";

const REAL_PKG_ROOT = join(import.meta.dirname, "..", "..");

const GOOD_CONFIG = `import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["authcore"],
  migrations: { table: "authcore_migrations", schema: "drizzle" },
});
`;

function failureDetail(findings: { check: string; pass: boolean; detail: string }[], check: string): string {
  return findings.filter((f) => f.check === check).map((f) => f.detail).join(" | ");
}

async function makeFixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), "authcore-gate-fixture-"));
}

async function wipe(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Writes the tree a *good* package needs: schema file + one committed migration. */
async function seedGoodFixture(dir: string): Promise<void> {
  await mkdir(join(dir, "src", "db"), { recursive: true });
  await writeFile(
    join(dir, "src", "db", "schema.ts"),
    'import { pgSchema } from "drizzle-orm/pg-core";\nexport const s = pgSchema("authcore");\n',
    "utf8",
  );
  await mkdir(join(dir, "drizzle", "meta"), { recursive: true });
  await writeFile(
    join(dir, "drizzle", "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [{ idx: 0, version: "7", when: 0, tag: "0000_x", breakpoints: true }],
    }),
    "utf8",
  );
  await writeFile(join(dir, "drizzle", "0000_x.sql"), "-- 0000_x\n", "utf8");
}

// ---- config-level checks (pure text, no filesystem) ---------------------

test("extraction reads every enforced value from a good config", () => {
  const setup = extractSetup(GOOD_CONFIG);
  assert.ok(setup !== null);
  assert.equal(setup.journalTable, "authcore_migrations");
  assert.equal(setup.metadataSchema, "drizzle");
  assert.deepEqual(setup.schemaFilter, ["authcore"]);
  assert.equal(setup.outDir, "./drizzle");
  assert.equal(setup.schemaPath, "./src/db/schema.ts");
});

test("unparseable config returns null so callers fail loudly", () => {
  assert.equal(extractSetup("nothing relevant"), null);
});

test("good config passes journal, metadata, filter and out-dir checks", () => {
  const setup = extractSetup(GOOD_CONFIG)!;
  for (const f of [checkJournalTable(setup), checkMetadataSchema(setup), checkSchemaFilter(setup), checkOutDir(setup)]) {
    assert.equal(f.pass, true, f.detail);
  }
});

test("missing migrations.table override fails and mentions the proven collision", () => {
  const setup = extractSetup(GOOD_CONFIG.replace('migrations: { table: "authcore_migrations", schema: "drizzle" },', ""))!;
  const f = checkJournalTable(setup);
  assert.equal(f.pass, false);
  assert.match(f.detail, /proven to collide between cores/u);
});

test("explicit default journal table is forbidden", () => {
  const setup = extractSetup(GOOD_CONFIG.replace("authcore_migrations", DEFAULT_JOURNAL_TABLE))!;
  const f = checkJournalTable(setup);
  assert.equal(f.pass, false);
  assert.match(f.detail, /forbidden default/u);
});

test("journal owned by another core's prefix fails", () => {
  const setup = extractSetup(GOOD_CONFIG.replace("authcore_migrations", "commerce_migrations"))!;
  const f = checkJournalTable(setup);
  assert.equal(f.pass, false);
  assert.match(f.detail, /not owned by AuthCore/u);
});

test("metadata schema other than drizzle fails", () => {
  const setup = extractSetup(GOOD_CONFIG.replace('schema: "drizzle"', 'schema: "authcore"'))!;
  const f = checkMetadataSchema(setup);
  assert.equal(f.pass, false);
  assert.match(f.detail, /not the expected/u);
});

test("schemaFilter naming a foreign schema fails", () => {
  const setup = extractSetup(GOOD_CONFIG.replace('schemaFilter: ["authcore"]', 'schemaFilter: ["authcore", "commerce"]'))!;
  const f = checkSchemaFilter(setup);
  assert.equal(f.pass, false);
  assert.match(f.detail, /foreign entries: commerce/u);
});

test("out-dir pointing at another package fails", () => {
  const setup = extractSetup(GOOD_CONFIG.replace('out: "./drizzle"', 'out: "../commercecore/drizzle"'))!;
  const f = checkOutDir(setup);
  assert.equal(f.pass, false);
  assert.match(f.detail, /another workspace package/u);
});

// ---- package-tree checks (filesystem fixtures) --------------------------

test("unreadable config yields one direct failure, not a guess", async () => {
  const dir = await makeFixture();
  const findings = runSetupChecks(dir, "");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.check, "drizzle-config");
  assert.equal(findings[0]?.pass, false);
  await wipe(dir);
});

test("missing schema file fails", async () => {
  const dir = await makeFixture();
  const findings = runSetupChecks(dir, GOOD_CONFIG);
  assert.match(failureDetail(findings, "schema-file"), /not found/u);
  await wipe(dir);
});

test("no generated journal (or empty journal) fails", async () => {
  const dir = await makeFixture();
  const findings = runSetupChecks(dir, GOOD_CONFIG);
  const detail = failureDetail(findings, "generated-output");
  assert.ok(/no generated migration journal|journal has no entries/u.test(detail));
  await wipe(dir);
});

test("journal referencing a missing sql file fails", async () => {
  const dir = await makeFixture();
  await mkdir(join(dir, "drizzle", "meta"), { recursive: true });
  await writeFile(
    join(dir, "drizzle", "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [{ idx: 0, version: "7", when: 0, tag: "0000_ghost", breakpoints: true }],
    }),
    "utf8",
  );
  const findings = runSetupChecks(dir, GOOD_CONFIG);
  assert.match(failureDetail(findings, "generated-output"), /0000_ghost/u);
  await wipe(dir);
});

test("a full good fixture directory passes every tree check", async () => {
  const dir = await makeFixture();
  await seedGoodFixture(dir);
  const findings = runSetupChecks(dir, GOOD_CONFIG);
  const failures = findings.filter((f) => !f.pass);
  assert.deepEqual(failures, [], JSON.stringify(failures.map((f) => ({ check: f.check, detail: f.detail }))));
  await wipe(dir);
});

test("source referencing another core violates the boundary", async () => {
  const dir = await makeFixture();
  await seedGoodFixture(dir);
  await writeFile(
    join(dir, "src", "evil.ts"),
    "import x from '@platform/commercecore';\nexport default x;\n",
    "utf8",
  );
  const findings = runSetupChecks(dir, GOOD_CONFIG);
  assert.match(failureDetail(findings, "core-boundary"), /references another core/u);
  await wipe(dir);
});

// ---- integration ---------------------------------------------------------

test("REAL package passes its full gate with parity probe", async () => {
  const findings = await validateAuthcorePackage(REAL_PKG_ROOT);
  const failures = findings.filter((f) => !f.pass);
  assert.deepEqual(
    failures,
    [],
    `real AuthCore package failed its own gate: ${JSON.stringify(failures.map((f) => ({ check: f.check, detail: f.detail })))}`,
  );
  assert.ok(findings.some((f) => f.check === "config-import-parity"));
});
