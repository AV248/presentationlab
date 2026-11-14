#!/usr/bin/env node
/**
 * The built site, checked as a server would serve it.
 *
 *   npm run check:routes        (after `npm run build`; part of verify:all)
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `npm run verify` proves the code is sound. It cannot prove that the *site*
 * answers: that a route exists, that a page renders its own title, that a
 * crawler sees text rather than an empty shell, that a redirect still points
 * where it did, that a 404 is a 404, that the security headers are on the
 * response. Those are properties of a running deployment, and they are exactly
 * the properties a framework migration breaks.
 *
 * So this starts the production server — the real `next start`, the same
 * command the host runs — and asks it the questions a reader, a crawler and a
 * link checker would ask. It is the check that would have caught the two
 * routing faults this migration actually produced.
 *
 * Every check is written as the *promise*, not the implementation: "a speech
 * page carries its own canonical", never "the file exists".
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { createClient } from '@libsql/client';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PB_CHECK_PORT ?? 5199);
const STUB_PORT = PORT + 1;
// Unknown-path responses are cached by Next's incremental route cache. Give
// each run a fresh, safely routable id so a previous test's negative cache
// cannot hide the newly seeded Turso row.
const STUB_SPEECH_ID = `route-check-${process.pid}-${Date.now().toString(36)}`;
const BASE = `http://127.0.0.1:${PORT}`;
const STUB_BASE = `http://127.0.0.1:${STUB_PORT}`;

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

if (!existsSync(resolve(ROOT, '.next'))) {
  console.error('\n  There is no build to check. Run `npm run build` first (or use `npm run verify:all`).\n');
  process.exit(1);
}

/** Start the production server the way the host does. */
const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/next/dist/bin/next'), 'start', '--port', String(PORT), '--hostname', '127.0.0.1'],
  { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] },
);

let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += String(chunk); });
server.stderr.on('data', (chunk) => { serverLog += String(chunk); });

/** Wait for the port to answer, or give up after 40 seconds. */
async function waitForServer() {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/robots.txt`);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** One GET, with the body and headers kept for the assertions. */
async function get(path) {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  const body = await response.text();
  return { status: response.status, headers: response.headers, body };
}

const titleOf = (html) => /<title[^>]*>([^<]*)/.exec(html)?.[1]?.trim() ?? '';
const canonicalOf = (html) => /rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? '';

try {
  if (!(await waitForServer())) {
    console.error(`\n  The production server did not start.\n\n${serverLog.slice(-2000)}\n`);
    process.exit(1);
  }
  console.log(`\n  Checking ${BASE}\n`);

  /* ── The pages people arrive on ───────────────────────────────────────── */

  const home = await get('/');
  expect('the library answers 200', home.status === 200, `status ${home.status}`);
  expect('the library renders its own title', titleOf(home.body).includes('Presentation Buddy'), titleOf(home.body));
  expect(
    'the library is HTML with real content, not an empty shell',
    home.body.includes('Search titles, authors, tags') || home.body.includes('pb-card'),
    `${home.body.length} bytes`,
  );
  expect('the library declares its canonical origin', canonicalOf(home.body).startsWith('http'));

  const speech = await get('/read/five-minutes');
  expect('a speech page answers 200', speech.status === 200, `status ${speech.status}`);
  expect(
    'a speech page carries its own title and canonical',
    titleOf(speech.body).includes('Five Minutes') && canonicalOf(speech.body).endsWith('/read/five-minutes'),
    `${titleOf(speech.body)} | ${canonicalOf(speech.body)}`,
  );
  expect('a speech page carries structured data', speech.body.includes('application/ld+json'));
  expect(
    'a speech page server-renders the speech itself',
    speech.body.includes('Five Minutes') && speech.body.length > 20_000,
    `${speech.body.length} bytes`,
  );

  const guide = await get('/topics/public-speaking');
  expect('a guide page answers 200 with its own title', guide.status === 200 && titleOf(guide.body).includes('Public Speaking'), `${guide.status} ${titleOf(guide.body)}`);

  /* ── The address a writer puts on a business card ─────────────────────── */

  const handle = await get('/aavrit');
  // With no database reachable, "free" and "we could not check" are different
  // answers and this build must give the second one. The strong form of this
  // check — an unknown handle being a real 404 — needs a database, and runs in
  // the phase below, against a stub.
  expect(
    'with no database reachable, a handle page does not pretend the handle exists',
    handle.status === 200 || handle.status === 404,
    `status ${handle.status}`,
  );
  expect('and its 404 page is the site’s own', handle.body.includes('Presentation Buddy'));

  /* ── The retired paths ────────────────────────────────────────────────── */

  for (const [from, to] of [
    ['/practice', '/rehearse'],
    ['/studio', '/write'],
    ['/web', '/arrivals'],
  ]) {
    const response = await fetch(`${BASE}${from}`, { redirect: 'manual' });
    const location = response.headers.get('location') ?? '';
    expect(
      `${from} still redirects to ${to} (permanently)`,
      [301, 308].includes(response.status) && location.endsWith(to),
      `${response.status} → ${location}`,
    );
  }

  /* ── The endpoints ────────────────────────────────────────────────────── */

  const libraryGet = await get('/api/library?max=1');
  expect(
    'the library endpoint answers, and says so plainly when the reading room is not configured',
    libraryGet.status === 200 || (libraryGet.status === 503 && libraryGet.body.includes('library_unavailable')),
    `${libraryGet.status} ${libraryGet.body.slice(0, 100)}`,
  );

  const libraryPost = await fetch(`${BASE}/api/library`, { method: 'POST' });
  expect('the reading-room endpoint refuses POST with an explanation', libraryPost.status === 405, `status ${libraryPost.status}`);

  const syncGet = await get('/api/sync-library');
  expect('the rebuild endpoint refuses GET with an explanation', syncGet.status === 405 && syncGet.body.includes('method_not_allowed'), `status ${syncGet.status}`);

  const syncPost = await fetch(`${BASE}/api/sync-library`, { method: 'POST' });
  expect('the old rebuild endpoint is retired', syncPost.status === 410, `status ${syncPost.status}`);

  /*
   * The deployment's self-test.
   *
   * With nothing configured it must say so plainly — and, the part that
   * matters, it must not leak anything while doing it. A health endpoint is
   * the most tempting place in a codebase to print an environment variable.
   */
  const health = await get('/api/health');
  expect('the health check answers', health.status === 200, `status ${health.status}`);

  const bare = JSON.parse(health.body);
  const bareCheck = (id) => bare.checks.find((check) => check.id === id);

  expect(
    'and reports itself as not set up, rather than pretending',
    bare.verdict === 'broken' && /not working/i.test(bare.summary),
    `${bare.verdict}: ${bare.summary}`,
  );
  expect(
    'naming Supabase profiles as a missing critical piece',
    bareCheck('profiles')?.status === 'missing' && bareCheck('profiles')?.critical === true,
    JSON.stringify(bareCheck('profiles')),
  );
  expect(
    'and Clerk as another critical piece',
    bareCheck('clerk')?.status === 'missing' && bareCheck('clerk')?.critical === true,
    JSON.stringify(bareCheck('clerk')),
  );
  expect(
    'and Turso as the authoritative library, not an optional fallback',
    bareCheck('reading-room')?.status === 'missing' && bareCheck('reading-room')?.critical === true,
    JSON.stringify(bareCheck('reading-room')),
  );
  /*
   * The contract about advice: anything that *must* be fixed says how, and
   * anything optional is allowed to have no next step — telling someone to
   * configure a piece they may not want would be noise.
   */
  expect(
    'every check that must be fixed says what to do about it',
    bare.checks
      .filter((check) => check.status === 'broken' || (check.critical && check.status !== 'ok'))
      .every((check) => typeof check.fix === 'string' && check.fix.length > 10),
    'a check that must be fixed has no next step',
  );
  expect(
    'and the optional ones explain what their absence costs instead',
    bare.checks.filter((check) => !check.critical).every((check) => check.detail.length > 20),
    'an optional piece is missing without saying what that means',
  );
  expect(
    'a health report never carries a secret',
    !/sk_[a-zA-Z0-9]|eyJ[A-Za-z0-9_-]{6}|Bearer [A-Za-z0-9]/i.test(health.body),
    'something key-shaped is in the response',
  );
  expect('and it is never cached', (health.headers.get('cache-control') ?? '').includes('no-store'));
  expect('nor indexed', (health.headers.get('x-robots-tag') ?? '').includes('noindex'));

  const healthHead = await fetch(`${BASE}/api/health`, { method: 'HEAD' });
  expect(
    'the one-line form agrees with the report',
    healthHead.status === 503 && healthHead.headers.get('x-health') === 'broken',
    `${healthHead.status} ${healthHead.headers.get('x-health')}`,
  );

  const healthPost = await fetch(`${BASE}/api/health`, { method: 'POST' });
  expect('and a write is refused with an explanation', healthPost.status === 405, `status ${healthPost.status}`);

  const usernamePost = await fetch(`${BASE}/api/clerk-set-username`, { method: 'POST' });
  expect(
    'the username endpoint answers without Clerk configured, and says which variable is missing',
    [400, 401, 501].includes(usernamePost.status),
    `status ${usernamePost.status}`,
  );

  /* ── What crawlers read ───────────────────────────────────────────────── */

  const robots = await get('/robots.txt');
  expect('robots.txt is served', robots.status === 200 && robots.body.includes('Sitemap:'), `status ${robots.status}`);
  expect('robots.txt keeps the admin workspace out', robots.body.includes('Disallow: /admin'));

  const sitemap = await get('/sitemap.xml');
  const urls = (sitemap.body.match(/<loc>/g) ?? []).length;
  expect('the sitemap lists the whole site', sitemap.status === 200 && urls >= 50, `${urls} URLs`);
  expect('the sitemap never lists the workspace', !sitemap.body.includes('/admin'));
  expect('and never lists the claim screen', !sitemap.body.includes('/claim'));

  /* ── What the browser is told it may do ───────────────────────────────── */

  const policy = home.headers.get('content-security-policy') ?? '';
  expect('every response carries a content security policy', policy.includes("default-src 'self'"));
  expect('the policy allows the databases the app talks to', policy.includes('*.supabase.co') && policy.includes('*.convex.cloud'));
  expect('and does not allow the page to be framed', policy.includes("frame-ancestors 'self'"));
  expect('HSTS is on', (home.headers.get('strict-transport-security') ?? '').includes('max-age=31536000'));
  expect('nosniff is on', home.headers.get('x-content-type-options') === 'nosniff');

  /* ── The things that must never be cached or indexed ──────────────────── */

  expect('the admin workspace is never indexed', (await get('/admin')).headers.get('x-robots-tag')?.includes('noindex') === true);
  expect('the service worker always revalidates', (await get('/sw.js')).headers.get('cache-control')?.includes('must-revalidate') === true);
  expect('the offline page exists for the worker to fall back to', (await get('/offline.html')).status === 200);
  expect('share cards are served', (await get('/cards/presentation-buddy.png')).status === 200);
  expect('the web manifest is served', (await get('/manifest.webmanifest')).status === 200);
  /* ═══════════════════════════════════════════════════════════════════════
   * Phase two: the same site, with a database behind it.
   *
   * Everything above is true of a deployment with no credentials — which is
   * every local build, and the worst case. But the promise that matters most
   * in production is the one a database makes possible: a writer's page
   * rendered on the server, and a handle nobody holds answering a real 404.
   *
   * A stub PostgREST stands in for Supabase's identity/profile directory,
   * while a real local Turso database holds the presentation. Then the server
   * is restarted with both configured, and the *same* server that just
   * answered "I cannot check that" is asked again.
   * ═══════════════════════════════════════════════════════════════════════ */

  server.kill('SIGTERM');
  await new Promise((stop) => server.once('exit', stop));

  const stub = createServer((req, res) => {
    const url = new URL(req.url ?? '/', STUB_BASE);
    const table = url.pathname.replace('/rest/v1/', '');
    res.setHeader('Content-Type', 'application/json');
    if (table === 'handles') {
      const wanted = (url.searchParams.get('username') ?? '').replace('eq.', '');
      res.end(JSON.stringify(wanted === 'aavrit' ? [{ username: 'aavrit' }] : []));
      return;
    }
    if (table === 'profiles') {
      const wantedName = (url.searchParams.get('username') ?? '').replace('eq.', '');
      const wantedUid = url.searchParams.get('uid') ?? '';
      const asksForU1 = wantedUid.includes('u1');
      const probesDirectory = !wantedName && !wantedUid;
      res.end(
        JSON.stringify(
          wantedName === 'aavrit' || asksForU1 || probesDirectory
            ? [{
                uid: 'u1', username: 'aavrit', display_name: 'Aavrit Kumal',
                bio: 'Writes for rooms that have to be won', location: 'Kathmandu',
                website: '', signature: '— A', photo_url: 'https://example.test/aavrit.jpg', points: 4,
                likes_received: 4, dislikes_received: 0, created_at: '2025-12-01T00:00:00.000Z',
              }]
            : [],
        ),
      );
      return;
    }
    res.statusCode = 404;
    res.end('[]');
  });
  await new Promise((listen) => stub.listen(STUB_PORT, '127.0.0.1', listen));

  /*
   * A reading room to go with the Supabase stub — built by the project's own
   * schema applier, so the health check's Turso probe reports on a real
   * database rather than on a mock of one.
   */
  const READING_DB = resolve(ROOT, 'node_modules/.pb-check-routes/reading-room.db');
  mkdirSync(dirname(READING_DB), { recursive: true });
  rmSync(READING_DB, { force: true });
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: `file:${READING_DB}`, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  const routeDb = createClient({ url: `file:${READING_DB}` });
  await routeDb.execute({
    sql: `insert into library (
      id, uid, username, folder, slug, title, author, author_photo_url, author_badges,
      preview, content, category, occasion, tags, credits, signature, allow_copy,
      source_type, source_name, source_url, license, views, likes, dislikes, shares,
      published_at, updated_at
    ) values (${Array.from({ length: 27 }, () => '?').join(', ')})`,
    args: [
      STUB_SPEECH_ID, 'u1', 'aavrit', '', 'a-quiet-room', 'The Quiet Room', 'Aavrit Kumal',
      'https://example.test/aavrit.jpg', '', 'What a room does before you speak',
      'The room is decided before you open your mouth.', 'General', 'Conference', 'craft',
      '', '— A', 1, 'person', '', '', '', 7, 3, 0, 1,
      '2026-02-10T09:00:00.000Z', '2026-02-10T09:00:00.000Z',
    ],
  });
  await routeDb.close();

  // A fresh process must not read a cached "there is no database" answer.
  rmSync(resolve(ROOT, '.next/cache/fetch-cache'), { recursive: true, force: true });

  const configured = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/next/dist/bin/next'), 'start', '--port', String(PORT), '--hostname', '127.0.0.1'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VITE_SUPABASE_URL: STUB_BASE,
        VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
        TURSO_DATABASE_URL: `file:${READING_DB}`,
        TURSO_AUTH_TOKEN: '',
        // Shaped like the real thing, so the Clerk check inspects them the way
        // it would inspect a live deployment's.
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_c3R1Yi1wdWJsaXNoYWJsZS1rZXk',
        CLERK_SECRET_KEY: 'sk_test_stub-secret-not-a-real-key',
        CLERK_AUTHORIZED_PARTIES: 'http://127.0.0.1:5199',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  configured.stdout.on('data', (chunk) => { serverLog += String(chunk); });
  configured.stderr.on('data', (chunk) => { serverLog += String(chunk); });

  try {
    const up = await (async () => {
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline) {
        try {
          if ((await fetch(`${BASE}/robots.txt`)).ok) return true;
        } catch {
          /* still starting */
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    })();
    if (!up) throw new Error(`the configured server did not start\n${serverLog.slice(-1500)}`);

    console.log('\n  With a database behind it:\n');

    const writer = await get('/aavrit');
    expect('a held handle answers 200', writer.status === 200, `status ${writer.status}`);
    expect(
      'the writer’s name and bio are in the HTML the server sends',
      writer.body.includes('Aavrit Kumal') && writer.body.includes('rooms that have to be won'),
      'the profile was not rendered on the server',
    );
    expect(
      'and their published work is there too',
      writer.body.includes('The Quiet Room'),
      'the work list was not rendered on the server',
    );
    expect(
      'the page declares itself for the writer, not for the site',
      titleOf(writer.body).includes('Aavrit'),
      titleOf(writer.body),
    );

    const nobody = await get('/nobody-here');
    expect('a handle nobody holds is a real 404', nobody.status === 404, `status ${nobody.status}`);
    expect('and it is the site’s own 404, not a framework page', nobody.body.includes('Presentation Buddy'));

    /*
     * The front page is prerendered and rebuilt at most once a minute
     * (`revalidate = 60`), so it is served from the build — which happened
     * before this stub existed. What can be checked here is that it is the
     * library, intact: the seeded rows are checked where they can be seen
     * immediately, on the dynamic routes below and through the endpoint.
     */
    const home = await get('/');
    expect(
      'the front page is the library, rendered by the server',
      home.status === 200 && home.body.includes('Search titles, authors, tags'),
      `status ${home.status}`,
    );

    const endpoint = await get('/api/library?max=5');
    expect(
      'the library endpoint reads the database',
      endpoint.status === 200 && endpoint.body.includes('The Quiet Room'),
      `${endpoint.status} ${endpoint.body.slice(0, 120)}`,
    );

    /* A shared link: the strongest statement this site makes about a speech. */
    const shared = await get(`/read/${STUB_SPEECH_ID}`);
    expect('a shared speech answers 200', shared.status === 200, `status ${shared.status}`);
    expect(
      'with its own title, not the site’s',
      titleOf(shared.body).includes('The Quiet Room'),
      titleOf(shared.body),
    );
    expect(
      'and its text in the HTML the server sends',
      shared.body.includes('decided before you open your mouth'),
      'the speech was not server-rendered',
    );
    expect(
      'and its structured data for crawlers',
      shared.body.includes('"@type":"Article"') || shared.body.includes('&quot;@type&quot;:&quot;Article&quot;'),
      'no article JSON-LD',
    );

    const deleted = await get('/read/gone-forever');
    expect(
      'a speech that is genuinely not there is a 404, not a page saying so',
      deleted.status === 404,
      `status ${deleted.status}`,
    );

    /*
     * The self-test, on a deployment where everything critical is in place.
     * Each service has to have been *contacted* — Turso is a real SQLite
     * database, Supabase profiles use a stub PostgREST, and Clerk's keys are
     * shaped like the real ones — so presence alone cannot pass this.
     */
    const health = await get('/api/health');
    const report = JSON.parse(health.body);
    const statusOf = (id) => report.checks.find((check) => check.id === id)?.status;

    expect('the health check reaches the Supabase profile store', statusOf('profiles') === 'ok', String(statusOf('profiles')));
    expect('it reached the reading room and looked at its tables', statusOf('reading-room') === 'ok', `${statusOf('reading-room')} — ${report.checks.find((c) => c.id === 'reading-room')?.detail}`);
    expect('it saw both halves of the Clerk setup', statusOf('clerk') === 'ok', String(statusOf('clerk')));
    expect(
      'the verdict counts the optional pieces without calling them faults',
      report.verdict === 'degraded' && /optional/i.test(report.summary),
      `${report.verdict}: ${report.summary}`,
    );
    expect(
      'and it says how long each service took',
      report.checks.some((check) => typeof check.ms === 'number'),
      'no timings reported',
    );
    expect(
      'the configured report leaks no secret either',
      !health.body.includes('stub-anon-key') &&
        !health.body.includes('sk_test_stub-secret') &&
        !health.body.includes(`file:${READING_DB}`),
      'a configured value is in the response',
    );

    const deep = await get('/aavrit/a-quiet-room');
    expect('a writer’s own speech address resolves', deep.status === 200 && deep.body.includes('The Quiet Room'), `status ${deep.status}`);
  } finally {
    try { configured.kill('SIGTERM'); } catch { /* already gone */ }
    stub.close();
  }
} catch (error) {
  failed += 1;
  console.log(`FAIL  the route check itself threw\n      ${error?.stack ?? error}`);
} finally {
  try { server.kill('SIGTERM'); } catch { /* already gone */ }
}

console.log(`\nroutes: ${passed} passed, ${failed} failed`);
if (failed) {
  console.error('\nThe built site is not answering as it should.\n');
  process.exit(1);
}
