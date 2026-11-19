#!/usr/bin/env node
/** Public community views must never publish a member's account email as a name. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadModule } from './lib/bundle.mjs';
import { ROOT } from './lib/env.mjs';

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
const originalFetch = globalThis.fetch;
try {
  process.env.VITE_SUPABASE_URL = 'https://community-check.example.test';
  process.env.VITE_SUPABASE_ANON_KEY = 'public-test-key';

  const { publicCommunityAuthor } = await loadModule('src/lib/community.ts', 'check-community-privacy');
  expect('a normal community display name remains public', publicCommunityAuthor('Aavrit') === 'Aavrit');
  expect('a missing public name is presented as Anonymous', publicCommunityAuthor('  ') === 'Anonymous');
  expect('a bare account email is never used as a public name', publicCommunityAuthor('person@example.test') === 'Anonymous');
  expect('an email embedded in an author label is also hidden', publicCommunityAuthor('Person <person@example.test>') === 'Anonymous');

  let selectedEmailColumn = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    selectedEmailColumn = (url.searchParams.get('select') ?? '').split(',').includes('email');
    return new Response(JSON.stringify([
      { id: 'legacy-email-author', title: 'A note', body: 'Body', author: 'person@example.test', uid: 'user_1' },
      { id: 'public-name-author', title: 'Another note', body: 'Body', author: 'Aavrit', uid: 'user_2' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const { readCommunityPosts } = await loadModule('src/server/community.ts', 'check-community-reader-privacy');
  const posts = await readCommunityPosts(10);
  expect('public post query does not request account email', !selectedEmailColumn);
  expect('legacy email author is redacted before server rendering', posts[0]?.author === 'Anonymous');
  expect('server rendering preserves a normal public name', posts[1]?.author === 'Aavrit');

  const page = readFileSync(resolve(ROOT, 'src/screens/CommunityPage.tsx'), 'utf8');
  expect('the community client has no signed-in email fallback', !/\buser\s*(?:!|\?)?\s*\.\s*email\b/.test(page));
  expect('the community client sanitizes public post and contributor names', page.includes('publicCommunityAuthor(post.author)') && page.includes('publicCommunityAuthor(user?.displayName)'));
  const data = readFileSync(resolve(ROOT, 'src/services/data.ts'), 'utf8');
  const postsReader = data.split('export async function fetchPosts(): Promise<Post[]> {')[1]?.split('\nexport async function publishPost')[0] ?? '';
  expect('public feed fetches posts through the server-side sanitizer', postsReader.includes("fetch('/api/community/posts'") && !postsReader.includes("f.collection(db, 'bloggerblogs')"));
} catch (error) {
  console.error('\nThe community privacy check could not run.\n', error);
  failed += 1;
} finally {
  globalThis.fetch = originalFetch;
  process.env = savedEnv;
}

console.log(`\ncommunity privacy: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
