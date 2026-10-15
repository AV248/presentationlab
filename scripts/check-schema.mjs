/**
 * Does every field the app writes actually exist as a column?
 *
 * The data layer is deliberately forgiving: `src/services/backend/supabase.ts`
 * maps the app's field names onto real snake_case columns, warns in development
 * about anything it does not recognise, and drops it rather than inventing a
 * column. That is the right behaviour at runtime — a stale field must never take
 * the site down — but it also means a typo fails *silently*, as a value that is
 * simply never saved.
 *
 * This check turns that silence into a build failure. It reads the two sources
 * of truth and compares them directly:
 *
 *   src/services/backend/supabase.ts   the app side: collection → table, field → column
 *   supabase/schema.sql                the database side: table → columns
 *
 * It caught three real defects the first time it ran (`Date`, `Author` and two
 * `handles` columns were mapped to columns that did not exist). Run by
 * `npm run verify`.
 *
 * Text parsing, not execution: this has to work before the app is built, and on
 * a machine with no database. Anything it cannot parse is reported as a failure
 * rather than skipped, because a check that quietly does nothing is worse than
 * no check at all.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const enginePath = resolve(root, 'src/services/backend/supabase.ts');
const schemaPath = resolve(root, 'supabase/schema.sql');

const engine = readFileSync(enginePath, 'utf8');
const schema = readFileSync(schemaPath, 'utf8');

/* ------------------------------------------------------------------ */
/* The database side                                                   */
/* ------------------------------------------------------------------ */

const columnTypes = 'text|int|integer|bigint|boolean|bool|timestamptz|timestamp|jsonb|json|numeric|uuid';

const tables = new Map();

for (const match of schema.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, name, body] = match;
  const columns = new Set();
  for (const line of body.split('\n')) {
    const column = new RegExp(`^\\s*([a-z_][a-z0-9_]*)\\s+(${columnTypes})\\b`).exec(line);
    if (column) columns.add(column[1]);
  }
  tables.set(name, columns);
}

// Columns added after the table was first created. Without this pass the check
// would flag every later addition, which is exactly the noise that gets a check
// switched off.
for (const match of schema.matchAll(/alter table public\.(\w+)\s+add column if not exists (\w+)/g)) {
  tables.get(match[1])?.add(match[2]);
}

if (tables.size === 0) {
  console.error('FAIL  supabase/schema.sql — no tables could be parsed.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* The app side                                                        */
/* ------------------------------------------------------------------ */

/** Shared field maps, referenced by name from the collection specs. */
const shared = new Map();
for (const match of engine.matchAll(/^const ([A-Z][A-Z0-9_]*): FieldMap = \{([\s\S]*?)\n\};/gm)) {
  shared.set(match[1], match[2]);
}

const collectionsBlock = /const COLLECTIONS: Record<string, CollectionSpec> = \{([\s\S]*?)\n\};/.exec(engine);
if (!collectionsBlock) {
  console.error('FAIL  supabase.ts — COLLECTIONS could not be parsed.');
  process.exit(1);
}

const specPattern = /(\w+):\s*\{\s*table:\s*'(\w+)',\s*id:\s*'(\w+)',([\s\S]*?)\n  \},/g;

const problems = [];
let checked = 0;

for (const spec of collectionsBlock[1].matchAll(specPattern)) {
  const [collection, table, primaryKey, body] = [spec[1], spec[2], spec[3], spec[4]];
  checked += 1;

  const columns = tables.get(table);
  if (!columns) {
    problems.push(`${collection} → table "${table}" does not exist in supabase/schema.sql`);
    continue;
  }

  // `fields: SPEECH` is the shared map; `fields: { … }` is written out here.
  const inline = /fields:\s*\{([\s\S]*?)\}/.exec(body)?.[1] ?? '';
  const sharedName = /fields:\s*([A-Z][A-Z0-9_]*)/.exec(body)?.[1];
  const source = `${inline}\n${sharedName ? shared.get(sharedName) ?? '' : ''}`;

  const mapped = new Set([...source.matchAll(/f\('(\w+)'(?:,\s*'[a-z]+')?\)/g)].map((m) => m[1]));

  for (const field of /counters:\s*\[([^\]]*)\]/.exec(body)?.[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean) ?? []) {
    mapped.add(field);
  }

  if (mapped.size === 0) {
    problems.push(`${collection} → table "${table}" maps no fields at all (parse failure?)`);
    continue;
  }

  if (!columns.has(primaryKey) && primaryKey !== 'uid') {
    problems.push(`${collection} → "${table}.${primaryKey}" (the id column) does not exist`);
  }

  const phantom = [...mapped].filter((column) => !columns.has(column)).sort();
  if (phantom.length) {
    problems.push(`${collection} → "${table}" maps column(s) that do not exist: ${phantom.join(', ')}`);
  }
}

if (checked === 0) {
  console.error('FAIL  supabase.ts — no collection specs were parsed.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* The migration writes columns too                                    */
/* ------------------------------------------------------------------ */

/**
 * A migration has no types to catch its mistakes. `insert into … (colunm)` is
 * an error, but an object key that no longer matches a column name is not: the
 * value is simply not written, and the record arrives looking complete except
 * for the part that mattered. So the mapping module is loaded and every column
 * it produces is checked against the same list of tables.
 *
 * `row()` builders are pure — no network, no credentials — which is the reason
 * they live in their own file.
 */
let migrationChecked = 0;
try {
  const { STEPS } = await import('./migrate/map.mjs');
  for (const step of STEPS) {
    const columns = tables.get(step.table);
    if (!columns) {
      problems.push(`migration "${step.id}" targets table "${step.table}", which does not exist`);
      continue;
    }
    // An empty document is the interesting case: it must still produce the
    // column names, and every default must be a value Postgres accepts.
    const row = step.row('sample-id', {});
    const produced = Object.keys(row);
    if (!produced.length) {
      problems.push(`migration "${step.id}" produced no columns`);
      continue;
    }
    const unknown = produced.filter((column) => !columns.has(column)).sort();
    if (unknown.length) {
      problems.push(`migration "${step.id}" → "${step.table}" writes unknown column(s): ${unknown.join(', ')}`);
    }
    for (const [column, value] of Object.entries(row)) {
      if (value !== null && !['string', 'number', 'boolean', 'object'].includes(typeof value)) {
        problems.push(`migration "${step.id}" → "${step.table}.${column}" produced a ${typeof value}`);
      }
    }
    migrationChecked += 1;
  }
} catch (error) {
  problems.push(`the migration map could not be loaded: ${error.message}`);
}

if (migrationChecked === 0 && !problems.length) {
  problems.push('no migration steps were checked — the map loaded nothing');
}

/* ------------------------------------------------------------------ */

if (problems.length) {
  console.error(`FAIL  field map vs schema — ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`      ${problem}`);
  console.error('\n      Add the column to supabase/schema.sql, or fix the name in supabase.ts.');
  process.exit(1);
}

console.log(
  `PASS  field map vs schema  (${checked} collections and ${migrationChecked} migration step(s) ` +
    `across ${tables.size} tables — every column accounted for)`,
);
