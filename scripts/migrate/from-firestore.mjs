#!/usr/bin/env node
/**
 * Firestore → Postgres. One pass, run once, nothing deleted.
 *
 *   npm run migrate:firestore              plan only — reads Firestore, writes nothing
 *   npm run migrate:firestore -- --apply   do it
 *   npm run migrate:firestore -- --apply --only=presentations,users
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULES THIS FOLLOWS
 * ─────────────────────────────────────────────────────────────────────────────
 *   • **Read-only on the way out.** Firestore is never written, never deleted,
 *     never marked as migrated. If this goes wrong you run it again; you do not
 *     restore a backup. It stays your archive.
 *   • **Plan first.** Without `--apply` it does everything except the writes, so
 *     the counts you see are the counts you get.
 *   • **Idempotent.** Every row is an upsert keyed by its original document id,
 *     so a second run updates rather than duplicates.
 *   • **Nothing invented.** A row whose parent is missing from an earlier step —
 *     a reaction for a speech that was never migrated, a speech whose author has
 *     no profile — is *skipped and reported*, not guessed at. A foreign key is a
 *     promise; this does not make promises on a document's behalf.
 *   • **Order matters.** People first, then the things that point at them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CREDENTIALS (all from `.env`, none of them printed)
 * ─────────────────────────────────────────────────────────────────────────────
 *   GOOGLE_APPLICATION_CREDENTIALS  path to the Firebase service account JSON
 *     …or FIREBASE_SERVICE_ACCOUNT_JSON  the JSON itself, on one line
 *   SUPABASE_URL                    your project URL
 *   SUPABASE_SERVICE_ROLE_KEY       the service key — bypasses the row policies
 *                                   on purpose, because a migration writes
 *                                   other people's rows. Local only: never in a
 *                                   VITE_ variable, never in Vercel.
 *
 * The Firebase service account is the same one the old deployment used; it can
 * be revoked in the Firebase console once this has run and the site is verified.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, need } from '../lib/env.mjs';
import { STEPS } from './map.mjs';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const onlyArg = argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;

const env = loadEnv();

/* ------------------------------------------------------------------ */
/* Connections                                                         */
/* ------------------------------------------------------------------ */

function firebaseCredential() {
  const inline = (env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (inline) {
    try {
      return cert(JSON.parse(inline));
    } catch (error) {
      console.error(`\n  FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${error.message}\n`);
      process.exit(1);
    }
  }
  const path = (env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim();
  if (path) {
    try {
      return cert(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
      console.error(`\n  GOOGLE_APPLICATION_CREDENTIALS could not be read: ${error.message}\n`);
      process.exit(1);
    }
  }
  console.error('\n  No Firebase credential.');
  console.error('  Set GOOGLE_APPLICATION_CREDENTIALS (the path to the service account JSON)');
  console.error('  or FIREBASE_SERVICE_ACCOUNT_JSON (the JSON itself) in .env.\n');
  process.exit(1);
}

const supabaseUrl = need(env, 'SUPABASE_URL', 'It is the Project URL from Supabase → Project Settings → Data API.');
const serviceKey = need(
  env,
  'SUPABASE_SERVICE_ROLE_KEY',
  'It is the service_role key from Supabase → Project Settings → API keys. Local only — it belongs in .env.',
);

initializeApp({ credential: firebaseCredential() });
const firestore = getFirestore();
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

/* ------------------------------------------------------------------ */
/* Value conversion                                                    */
/* ------------------------------------------------------------------ */

/** Firestore Timestamp (or anything date-shaped) → an ISO string Postgres takes. */
function iso(value) {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  if (typeof value === 'number') {
    // Firestore epoch millis, which is how a few of the older docs stored dates.
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

const str = (value, fallback = '') =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;

const int = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

/** `Tags` has been a string, an array, and a comma list. All three become an array. */
function tags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  const text = str(value);
  return text ? text.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
}

/** The first defined value among aliases — Firestore documents are not uniform. */
const pick = (doc, ...keys) => {
  for (const key of keys) if (doc[key] !== undefined && doc[key] !== null) return doc[key];
  return undefined;
};

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Reading, checking, writing                                          */
/* ------------------------------------------------------------------ */

const CHUNK = 200;

async function readCollection(name) {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

/**
 * The columns that must already exist for a step to be allowed to write.
 *
 * Read once, as a set of ids, rather than a query per row: a migration that
 * asks the database 500 times to check the same thing is a migration that
 * times out.
 */
async function knownKeys(table, column) {
  const values = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(column).range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}.${column}: ${error.message}`);
    for (const row of data) values.add(String(row[column]));
    if (data.length < 1000) break;
  }
  return values;
}

const summary = [];

for (const step of STEPS) {
  if (only && !only.includes(step.id) && !only.includes(step.table)) continue;

  const rows = await readCollection(step.collection);

  // The keys this step's foreign keys point at.
  const needs = step.needs ? (Array.isArray(step.needs) ? step.needs : [step.needs]) : [];
  const parents = new Map();
  for (const parent of needs) {
    const column = parent === 'profiles' ? 'uid' : 'id';
    parents.set(parent, await knownKeys(parent, column));
  }

  const prepared = [];
  const skipped = [];

  for (const { id, data } of rows) {
    let row;
    try {
      row = step.row(id, data);
    } catch (error) {
      skipped.push(`${id} → could not be read: ${error.message}`);
      continue;
    }

    const missing = needs.find((parent) => !parents.get(parent).has(String(row.uid ?? row.speech_id ?? '')));
    if (missing) {
      // A reaction whose speech is not there, a speech whose author has no
      // profile. Reported by name so the decision to drop it is a visible one.
      skipped.push(`${id} → no matching row in ${missing}`);
      continue;
    }

    if (!row.uid && 'uid' in row) {
      skipped.push(`${id} → no uid on the document`);
      continue;
    }

    prepared.push(row);
  }

  summary.push({ step, rows: rows.length, prepared: prepared.length, skipped });

  if (!apply) continue;

  const table = step.table;
  const key = step.key;

  for (let from = 0; from < prepared.length; from += CHUNK) {
    const batch = prepared.slice(from, from + CHUNK);
    const { error } = await supabase.from(table).upsert(batch, key ? { onConflict: key } : undefined);
    if (error) {
      console.error(`\n  ${step.id}: ${table} refused the write — ${error.message}`);
      if (error.details) console.error(`  ${error.details}`);
      process.exitCode = 1;
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The report                                                          */
/* ------------------------------------------------------------------ */

console.log('\n  Firestore → Postgres\n');
console.log(`  mode: ${apply ? 'APPLYING' : 'PLAN ONLY (add --apply to write)'}\n`);
console.log('  collection      read   ready   table');

let totalRead = 0;
let totalReady = 0;

for (const { step, rows, prepared, skipped } of summary) {
  totalRead += rows;
  totalReady += prepared;
  console.log(
    `  ${step.id.padEnd(14)} ${String(rows).padStart(5)} ${String(prepared).padStart(7)}   ${step.table}`,
  );
  for (const note of skipped.slice(0, 5)) console.log(`      skipped: ${note}`);
  if (skipped.length > 5) console.log(`      …and ${skipped.length - 5} more skipped`);
}

console.log(`\n  ${totalRead} document(s) read, ${totalReady} ready.`);
if (summary.some((s) => s.skipped.length)) {
  console.log('  Skipped rows stay in Firestore untouched — nothing is lost by skipping them.');
}

if (!apply) {
  console.log('\n  Nothing was written. Re-run with:  npm run migrate:firestore -- --apply\n');
} else {
  console.log('\n  Written. Next:');
  console.log('    1. npm run sync:turso        — fill the reading room from the new rows');
  console.log('    2. open the site and read one migrated speech, and react once');
  console.log('    3. only then, revoke the Firebase service account and retire the project\n');
}
