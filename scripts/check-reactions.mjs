#!/usr/bin/env node
/** Local Turso transaction check for the canonical reaction/share paths. */
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadModule } from './lib/bundle.mjs';
import { createClient } from '@libsql/client';
import { ROOT } from './lib/env.mjs';

const WORK = resolve(ROOT, 'node_modules/.pb-check-reactions');
const DB_FILE = resolve(WORK, 'reading-room.db');
const DB_URL = `file:${DB_FILE}`;
let passed = 0;
let failed = 0;

function expect(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

const savedEnv = { ...process.env };
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
Object.assign(process.env, {
  TURSO_DATABASE_URL: DB_URL,
  TURSO_AUTH_TOKEN: '',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
});

let db;
try {
  const reactions = await loadModule('src/server/reactions.ts', 'reaction-ledger-local');
  db = createClient({ url: DB_URL });
  // The same additive schema preparation used by a verified server write.
  await reactions.setPresentationReaction({ uid: 'reader-1' }, 'work-1', 'like').catch(() => null);
  await db.execute({
    sql: `insert into library (id, uid, username, title, content, source_type,
           moderation_status, likes, dislikes, shares, published_at, updated_at)
          values (?, ?, ?, ?, ?, 'person', 'published', ?, ?, ?, ?, ?)`,
    args: ['work-1', 'writer-1', 'writer', 'A work', 'A short body', 10, 2, 4, new Date().toISOString(), new Date().toISOString()],
  });

  const identity = { uid: 'reader-1' };
  let state = await reactions.setPresentationReaction(identity, 'work-1', 'like');
  expect('a Turso presentation accepts its first like', state.kind === 'like' && state.likes === 11 && state.dislikes === 2, JSON.stringify(state));

  state = await reactions.setPresentationReaction(identity, 'work-1', 'like');
  expect('clicking the same reaction removes only that reader’s like', state.kind === null && state.likes === 10 && state.dislikes === 2, JSON.stringify(state));

  state = await reactions.setPresentationReaction(identity, 'work-1', 'dislike');
  expect('a dislike updates the matching public counter', state.kind === 'dislike' && state.likes === 10 && state.dislikes === 3, JSON.stringify(state));

  state = await reactions.setPresentationReaction(identity, 'work-1', 'like');
  expect('changing one’s mind transfers one count, not two', state.kind === 'like' && state.likes === 11 && state.dislikes === 2, JSON.stringify(state));

  const mine = await reactions.readMyPresentationReactions('reader-1');
  expect('the private reaction lookup returns only the reader’s current selection', mine['work-1'] === 'like', JSON.stringify(mine));

  const firstShare = await reactions.recordPresentationShare(identity, 'work-1');
  const repeatShare = await reactions.recordPresentationShare(identity, 'work-1');
  expect('shares are counted once per person without resetting the historical baseline', firstShare === 5 && repeatShare === 5, `${firstShare} then ${repeatShare}`);

  await db.execute({ sql: "update library set moderation_status = 'held' where id = ?", args: ['work-1'] });
  let hiddenRejected = false;
  try { await reactions.setPresentationReaction(identity, 'work-1', 'dislike'); }
  catch (error) { hiddenRejected = error?.status === 404; }
  expect('a held presentation can no longer receive reactions', hiddenRejected);
  expect('held presentations are omitted from personal public reaction state', Object.keys(await reactions.readMyPresentationReactions('reader-1')).length === 0);
} catch (error) {
  console.error('\nThe local reaction/share transaction check could not run.\n', error);
  failed += 1;
} finally {
  await db?.close();
  process.env = savedEnv;
}

console.log(`\nreactions: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
