#!/usr/bin/env node
/**
 * Apply `turso/schema.sql` to the reading room.
 *
 * `npm run db:turso`
 *
 * Idempotent, like the Postgres schema: every statement in the file uses
 * `if not exists`, so running it against a database that already has the
 * tables changes nothing. That makes this safe to run when you are unsure
 * whether you ran it before — which is the usual state of affairs.
 *
 * Requires, in `.env` or the environment:
 *   TURSO_DATABASE_URL   libsql://…  (or file: for a local one)
 *   TURSO_AUTH_TOKEN     the token for that database
 *
 * The token is never printed. A local `file:` database needs no token at all,
 * which is how this is testable without a Turso account:
 *   TURSO_DATABASE_URL=file:./.tmp/library.db npm run db:turso
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { ROOT, loadEnv, presence } from '../lib/env.mjs';

const env = loadEnv();

const url = (env.TURSO_DATABASE_URL ?? '').trim();
if (!url) {
  console.error('\n  TURSO_DATABASE_URL is not set.');
  console.error('  Create a database at turso.tech, then put its libsql:// URL in .env');
  console.error('  (and TURSO_AUTH_TOKEN beside it). For a local check, no token is needed:');
  console.error('    TURSO_DATABASE_URL=file:./.tmp/library.db npm run db:turso\n');
  process.exit(1);
}

const local = url.startsWith('file:');
const authToken = (env.TURSO_AUTH_TOKEN ?? '').trim();
if (!local && !authToken) {
  console.error('\n  TURSO_AUTH_TOKEN is not set, and this is not a file: database.');
  console.error('  Create a token for the database in the Turso dashboard and put it in .env.\n');
  process.exit(1);
}

/**
 * Split a SQL file into statements.
 *
 * A naive `split(';')` breaks on the triggers, whose bodies contain semicolons
 * inside `begin … end`. So this walks the text and only ends a statement on a
 * semicolon that is outside a string, a quoted identifier, or a trigger body —
 * which is enough for the SQL in this repository and refuses to guess at
 * anything it does not understand.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inTrigger = false;
  let quote = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const rest = sql.slice(i).toLowerCase();

    // Comments never reach the database.
    if (quote === null && char === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end - 1;
      continue;
    }

    if (quote !== null) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (!inTrigger && rest.startsWith('create trigger')) {
      inTrigger = true;
    } else if (inTrigger && /^end\s*;/.test(rest)) {
      // The body's own terminator: keep it and close the statement here.
      current += 'end';
      i += 2;
      inTrigger = false;
      statements.push(current.trim());
      current = '';
      continue;
    }

    if (char === ';' && !inTrigger) {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

const schemaPath = resolve(ROOT, 'turso/schema.sql');
const statements = splitStatements(readFileSync(schemaPath, 'utf8'));

console.log(`\n  turso/schema.sql → ${local ? url : 'the configured database'}`);
console.log(`  auth token: ${local ? 'not needed (local file)' : presence(env, 'TURSO_AUTH_TOKEN')}`);

const db = createClient({ url, authToken: authToken || undefined });

try {
  // Sequential, not batched: a failure should name the statement that caused it
  // rather than the batch it was in.
  for (const statement of statements) {
    await db.execute(statement);
  }

  const tables = await db.execute(
    "select type, name from sqlite_master where type in ('table','index','trigger') order by type, name",
  );
  const names = tables.rows.map((row) => String(row.name));
  const counts = { table: 0, index: 0, trigger: 0 };
  for (const row of tables.rows) counts[String(row.type)] = (counts[String(row.type)] ?? 0) + 1;

  console.log(`\n  Applied ${statements.length} statement(s).`);
  console.log(
    `  The database now holds ${counts.table} table(s), ${counts.index} index(es), ${counts.trigger} trigger(s).`,
  );
  if (!names.includes('library_fts')) {
    console.error('\n  library_fts is missing — full-text search would not work.');
    process.exitCode = 1;
  } else {
    console.log('  Full-text search is in place (library_fts).');
    console.log('\n  Next: npm run sync:turso   (fill it from Postgres)\n');
  }
} catch (error) {
  console.error(`\n  Failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  db.close();
}
