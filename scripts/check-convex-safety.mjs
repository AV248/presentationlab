#!/usr/bin/env node
/** Verify the optional Convex safety boundary and bounded global cohort offline. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { loadModule } from './lib/bundle.mjs';

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

const { makeSafetySlice } = await loadModule('convex/lib/safetySlice.ts', 'check-safety-slice');
const ascii = makeSafetySlice('a'.repeat(10_000));
expect(
  'the recovery prefix uses exactly one percent of ASCII body bytes',
  ascii.sourceBytes === 10_000 && ascii.recoveryBytes === 100 && ascii.byteLimit === 100,
  JSON.stringify(ascii),
);

const unicode = makeSafetySlice('😀'.repeat(1_000));
expect(
  'the UTF-8 cap never splits a multibyte character',
  unicode.sourceBytes === 4_000 && unicode.recoveryBytes <= unicode.byteLimit
    && unicode.recoverySlice === '😀'.repeat(10),
  JSON.stringify({ sourceBytes: unicode.sourceBytes, recoveryBytes: unicode.recoveryBytes, byteLimit: unicode.byteLimit }),
);

const short = makeSafetySlice('A short line.');
expect(
  'works under 100 bytes keep no body text in Convex',
  short.sourceBytes < 100 && short.recoveryBytes === 0 && short.recoverySlice === '',
  JSON.stringify(short),
);

const schema = readFileSync(resolve(ROOT, 'convex/schema.ts'), 'utf8');
const table = /presentationSafety:\s*defineTable\(\{([\s\S]*?)\}\)/.exec(schema)?.[1] ?? '';
expect(
  'Convex persists only ids, checksum, byte counts, timestamp and the bounded slice',
  Boolean(table) && table.includes('recoverySlice') && table.includes('recoveryBytes')
    && !/^\s*content\s*:/m.test(table),
  table,
);

const convex = readFileSync(resolve(ROOT, 'convex/safety.ts'), 'utf8');
expect(
  'the public backup entry point is an action, not a caller-writable mutation',
  /export\s+const\s+backupPresentation\s*=\s*action\(/.test(convex)
    && /export\s+const\s+storeVerifiedSnapshot\s*=\s*internalMutation\(/.test(convex)
    && !/export\s+const\s+backupPresentation\s*=\s*mutation\(/.test(convex),
);
expect(
  'the action accepts only a presentation id and Clerk session, never body text',
  /backupPresentation\s*=\s*action\(\s*\{\s*args:\s*\{\s*presentationId:\s*v\.string\(\),\s*clerkToken:\s*v\.string\(\)/s.test(convex)
    && !/content:\s*v\.string\(\)/.test(convex),
);
expect(
  'Convex fetches the slice from the pinned canonical API and checks the verified owner',
  convex.includes("'/api/presentations/safety-snapshot'")
    && convex.includes('snapshot.ownerUid !== identity.subject')
    && convex.includes('snapshot.actorUid !== identity.subject')
    && convex.includes('TRUSTED_SITE_ORIGIN'),
);
expect(
  'the private write independently checks UTF-8 byte counts and the one-percent limit',
  convex.includes('new TextEncoder().encode(args.recoverySlice).length')
    && convex.includes('args.recoveryBytes > byteLimit')
    && convex.includes('byteLimit = Math.floor(args.sourceBytes / 100)'),
);
expect(
  'Convex enforces the global one-in-one-hundred cap and reconciles to Turso membership',
  convex.includes('Math.floor(canonicalCount / 100)')
    && convex.includes('Math.floor(args.canonicalCount / 100)')
    && convex.includes("'/api/presentations/safety-state'")
    && convex.includes('!selected.has(row.presentationId)'),
);

const server = readFileSync(resolve(ROOT, 'src/server/presentations.ts'), 'utf8');
expect(
  'the canonical endpoint rereads only an owner-owned published personal Turso row',
  server.includes("source_type = 'person' and moderation_status = 'published'")
    && server.includes("String(row.uid ?? '') !== identity.uid")
    && server.includes('readSafetySnapshot'),
);
expect(
  'Turso sampling membership and the published denominator arrive in one read transaction',
  server.includes("db.transaction('read')")
    && server.includes('safety_sampled = 1')
    && server.includes('Math.floor(canonicalCount / 100)'),
);

const sampling = readFileSync(resolve(ROOT, 'turso/safety-sampling.sql'), 'utf8');
expect(
  'Turso keeps the oldest personal slots within floor(published / 100) across inserts, updates and deletes',
  sampling.includes('library_safety_sample_ai')
    && sampling.includes('library_safety_sample_au')
    && sampling.includes('library_safety_sample_ad')
    && sampling.includes('count(*) / 100')
    && sampling.includes("when new.moderation_status = 'published'")
    && sampling.includes('order by candidate.published_at asc, candidate.id asc'),
);
expect(
  'the sample flag upgrades additively before the sampling triggers are installed',
  readFileSync(resolve(ROOT, 'turso/schema.sql'), 'utf8').includes('safety_sampled')
    && readFileSync(resolve(ROOT, 'src/server/turso.ts'), 'utf8').includes("['safety_sampled', 'integer not null default 0']")
    && readFileSync(resolve(ROOT, 'scripts/turso/apply.mjs'), 'utf8').includes("['safety_sampled', 'integer not null default 0']"),
);
expect(
  'runtime and operator upgrades replace old cohort trigger bodies in a versioned transaction',
  readFileSync(resolve(ROOT, 'turso/schema.sql'), 'utf8').includes('turso_schema_migrations')
    && readFileSync(resolve(ROOT, 'src/server/turso.ts'), 'utf8').includes("db.transaction('write')")
    && readFileSync(resolve(ROOT, 'src/server/turso.ts'), 'utf8').includes('drop trigger if exists')
    && readFileSync(resolve(ROOT, 'src/server/turso.ts'), 'utf8').includes('version = 2')
    && readFileSync(resolve(ROOT, 'scripts/turso/apply.mjs'), 'utf8').includes('version = 2')
    && readFileSync(resolve(ROOT, 'scripts/turso/apply.mjs'), 'utf8').includes('drop trigger if exists'),
);

const client = readFileSync(resolve(ROOT, 'src/services/data.ts'), 'utf8');
expect(
  'optional Convex work is queued after Turso replies, not awaited before Share',
  client.includes('queueSafetyWork(token,')
    && client.includes("fetch('/api/presentations/safety'")
    && !/const safetyToken = await optionalConvexToken\(\)/.test(client),
);

const legacyLiveFiles = ['convex/activity.ts', 'src/services/backend/live.ts'];
expect(
  'retired live presence/activity clients are absent',
  legacyLiveFiles.every((path) => {
    try { readFileSync(resolve(ROOT, path)); return false; }
    catch { return true; }
  }),
);

console.log(`\nConvex safety: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
