import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration-safety gate for AuthCore.
 *
 * WHY THIS EXISTS (see docs/adr/0002): the negative control proved that a
 * plausible drizzle-kit misconfiguration — two cores sharing the default
 * journal table — prints "[✓] migrations applied successfully!" with exit 0
 * while the second core's migrations never run. Exit codes from drizzle-kit
 * are therefore NOT proof. This gate asserts the configuration and in-package
 * artifacts directly, and the database-presence part runs over an explicitly
 * provided scratch-database URL (read-only SELECTs; never mutates anything).
 */

export interface GateFinding {
  readonly check: string;
  readonly pass: boolean;
  readonly pending?: boolean;
  readonly detail: string;
}

export const DEFAULT_JOURNAL_TABLE = "__drizzle_migrations" as const;
export const EXPECTED_METADATA_SCHEMA = "drizzle" as const;
export const EXPECTED_OUT_DIR = "./drizzle" as const;
export const OWN_SCHEMA_NAME = "authcore" as const;
/** Every AuthCore artifact's name must start with this prefix (journal rows/tables). */
export const OWN_PREFIX = "authcore_" as const;

export interface ExtractedSetup {
  journalTable: string | null;
  metadataSchema: string | null;
  schemaFilter: string[] | null;
  outDir: string | null;
  schemaPath: string | null;
}

const MIGRATIONS_BLOCK = /migrations:\s*\{([\s\S]*?)\}/;

/**
 * Extracts the setup values we enforce from raw drizzle.config.ts text.
 * Pure text parsing keeps negative-test fixtures free of drizzle-kit imports;
 * the runner additionally imports the real config and compares values, so a
 * parsing drift here surfaces as a failure instead of a false pass.
 */
export function extractSetup(configText: string): ExtractedSetup | null {
  const block = MIGRATIONS_BLOCK.exec(configText)?.[1];
  const withoutBlock = block ? configText.replace(MIGRATIONS_BLOCK, "") : configText;

  const outDir = /(?:^|[\s/(])out:\s*["']([^"']+)["']/.exec(withoutBlock)?.[1] ?? null;
  const schemaPath = /(?:^|[\s/(])schema:\s*["']([^"']+)["']/.exec(withoutBlock)?.[1] ?? null;
  const filterMatch = /schemaFilter:\s*\[([^\]]*)\]/.exec(withoutBlock)?.[1];
  const schemaFilter = filterMatch === undefined
    ? null
    : [...filterMatch.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!);

  if (outDir === null && schemaPath === null && schemaFilter === null) return null;

  return {
    journalTable: block ? /\btable:\s*["']([^"']+)["']/.exec(block)?.[1] ?? null : null,
    metadataSchema: block ? /\bschema:\s*["']([^"']+)["']/.exec(block)?.[1] ?? null : null,
    schemaFilter,
    outDir,
    schemaPath,
  };
}

function find(check: string, pass: boolean, passDetail: string, failDetail: string): GateFinding {
  return { check, pass, detail: pass ? passDetail : failDetail };
}

/** The central trap: a shared default journal makes migrations silently skip. */
export function checkJournalTable(setup: ExtractedSetup): GateFinding {
  const jt = setup.journalTable;
  if (jt === null) {
    return {
      check: "journal-table-override",
      pass: false,
      detail: "`migrations.table` is not set in drizzle.config.ts. The default journal table has been proven to collide between cores and silently skip migrations — this configuration is forbidden.",
    };
  }
  if (jt === DEFAULT_JOURNAL_TABLE) {
    return {
      check: "journal-table-override",
      pass: false,
      detail: `journal table is set to the forbidden default "${jt}"; this collides across cores and silently skips migrations`,
    };
  }
  if (!jt.startsWith(OWN_PREFIX)) {
    return {
      check: "journal-table-override",
      pass: false,
      detail: `journal table "${jt}" is not owned by AuthCore (must start with "${OWN_PREFIX}", e.g. "authcore_migrations")`,
    };
  }
  return { check: "journal-table-override", pass: true, detail: `journal table "${jt}" is uniquely owned` };
}

export function checkMetadataSchema(setup: ExtractedSetup): GateFinding {
  const ms = setup.metadataSchema;
  if (ms === null) {
    return {
      check: "journal-metadata-schema",
      pass: true,
      detail: `metadata schema unset, toolkit default "${EXPECTED_METADATA_SCHEMA}" applies (acceptable)`,
    };
  }
  return find(
    "journal-metadata-schema",
    ms === EXPECTED_METADATA_SCHEMA,
    `metadata schema is "${ms}"`,
    `metadata schema "${ms}" is not the expected "${EXPECTED_METADATA_SCHEMA}"; only the one shared metadata schema is proven`,
  );
}

export function checkSchemaFilter(setup: ExtractedSetup): GateFinding {
  const filter = setup.schemaFilter;
  if (filter === null) {
    return {
      check: "schema-filter",
      pass: false,
      detail: "schemaFilter is missing; without it push/pull actions are not scoped to authcore",
    };
  }
  const foreign = filter.filter((s) => s !== OWN_SCHEMA_NAME);
  if (foreign.length > 0) {
    return {
      check: "schema-filter",
      pass: false,
      detail: `schemaFilter must list only "${OWN_SCHEMA_NAME}", found foreign entries: ${foreign.join(", ")}`,
    };
  }
  return { check: "schema-filter", pass: true, detail: "schemaFilter correctly scoped to authcore only" };
}

export function checkOutDir(setup: ExtractedSetup): GateFinding {
  const out = setup.outDir;
  if (out === null) {
    return {
      check: "out-dir",
      pass: false,
      detail: "drizzle-kit `out` is missing from the config",
    };
  }
  if (out.toLowerCase().includes("commercecore") || out.toLowerCase().includes("apps/")) {
    return {
      check: "out-dir",
      pass: false,
      detail: `out dir "${out}" points into another workspace package; AuthCore migrations must live inside packages/authcore`,
    };
  }
  return { check: "out-dir", pass: true, detail: `migrations output at ${out} (inside AuthCore)` };
}

/** Package-tree artifacts: schema file, generated output, and boundary scan. Runs against a real directory. */
export function checkPackageTree(pkgRoot: string, setup: ExtractedSetup): GateFinding[] {
  const findings: GateFinding[] = [];

  const schemaPath = setup.schemaPath;
  if (schemaPath === null) {
    findings.push({ check: "schema-file", pass: false, detail: "config `schema` path is missing" });
  } else {
    const abs = join(pkgRoot, schemaPath);
    if (!existsSync(abs)) {
      findings.push({ check: "schema-file", pass: false, detail: `schema file not found at ${schemaPath}` });
    } else {
      const text = readFileSync(abs, "utf8");
      findings.push(
        find(
          "schema-file",
          text.includes(`pgSchema("${OWN_SCHEMA_NAME}")`),
          `${schemaPath} declares pgSchema("${OWN_SCHEMA_NAME}")`,
          `${schemaPath} does not declare pgSchema("${OWN_SCHEMA_NAME}")`,
        ),
      );
    }
  }

  const journalFile = join(pkgRoot, setup.outDir ?? ".", "meta", "_journal.json");
  if (!existsSync(journalFile)) {
    findings.push({
      check: "generated-output",
      pass: false,
      detail: "no generated migration journal (meta/_journal.json); run `pnpm --filter @platform/authcore generate`",
    });
  } else {
    let entries: Array<{ tag: string }> = [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(journalFile, "utf8"));
      const maybeEntries = (parsed as { entries?: unknown }).entries;
      if (Array.isArray(maybeEntries)) {
        entries = maybeEntries.filter(
          (e): e is { tag: string } =>
            typeof e === "object" && e !== null && typeof (e as { tag?: unknown }).tag === "string",
        );
      }
    } catch {
      findings.push({ check: "generated-output", pass: false, detail: "meta/_journal.json is not valid JSON" });
    }
    if (entries.length === 0) {
      findings.push({
        check: "generated-output",
        pass: false,
        detail: "journal has no entries — no migration is committed to run",
      });
    } else {
      const missing: string[] = [];
      for (const e of entries) {
        if (!existsSync(join(pkgRoot, setup.outDir ?? ".", `${e.tag}.sql`))) missing.push(e.tag);
      }
      findings.push(
        find(
          "generated-output",
          missing.length === 0,
          `${entries.length} journal entr${entries.length === 1 ? "y" : "ies"} with matching .sql files`,
          `journal references missing migration files: ${missing.join(", ")}`,
        ),
      );
    }
  }

  // Hard boundary: AuthCore runtime source must never import another core.
  // The gate's own machinery (src/gate, src/test) legitimately writes the other
  // core's name in checks and fixtures, so it is excluded from the scan.
  const offending = scanSourceForForeignCoreImports(join(pkgRoot, "src"));
  findings.push(
    find(
      "core-boundary",
      offending.length === 0,
      "no references to other cores in AuthCore source",
      `AuthCore source references another core in: ${offending.join(", ")}`,
    ),
  );

  return findings;
}

/**
 * Detects import specifiers that name another core (e.g.
 * `import ... from "@platform/commercecore"` or `import("@platform/commercecore")`).
 * Prose mentions — in doc comments or gate fixtures — do not match: only actual
 * code references another core's package specifiers.
 */
const FOREIGN_CORE_IMPORT_RE =
  /(?:from|import)\s*\(?\s*["'][^"']*(?:@platform\/)?commercecore[^"']*['"]/i;

function scanSourceForForeignCoreImports(dir: string, depth: number = 0, acc: string[] = []): string[] {
  if (depth > 8 || !existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p.endsWith(`${join("src", "gate")}`) || p.endsWith(`${join("src", "test")}`)) continue;
      scanSourceForForeignCoreImports(p, depth + 1, acc);
    } else if (name.endsWith(".ts") && FOREIGN_CORE_IMPORT_RE.test(readFileSync(p, "utf8"))) acc.push(p);
  }
  return acc;
}

/** All configuration + package-tree checks over a concrete package directory. */
export function runSetupChecks(pkgRoot: string, configText: string): GateFinding[] {
  const setup = extractSetup(configText);
  if (setup === null) {
    return [
      {
        check: "drizzle-config",
        pass: false,
        detail: "drizzle.config.ts not readable or missing out/schema/schemaFilter — refusing to guess",
      },
    ];
  }
  return [
    checkJournalTable(setup),
    checkMetadataSchema(setup),
    checkSchemaFilter(setup),
    checkOutDir(setup),
    ...checkPackageTree(pkgRoot, setup),
  ];
}
