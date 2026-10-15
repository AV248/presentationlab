import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { HandlePage } from '@/screens/ProfilePage';
import { readHandleState, readProfile, readWriter } from '@/server/reading';
import { normalizeUsername, RESERVED_HANDLES } from '@/lib/identity';

/**
 * One writer's own site: /username, /username/<speech> and
 * /username/<folder>/<speech>.
 *
 * One optional catch-all route, not three routes, because Next.js will not
 * allow sibling dynamic segments to be named differently at the same depth
 * (`[slug]` next to `[folder]` is a build error) — and because the URL grammar
 * really is one rule: a handle, then zero or more path pieces. The screen
 * decides what the pieces mean; `profilePath` in `src/lib/identity.ts` is what
 * writes them.
 *
 * ── This page is rendered on the server, and that matters ───────────────────
 * A writer's page is the address they put on a slide, a résumé, a business
 * card. Rendering it here means:
 *
 *   • **the status code is true** — a handle nobody holds is a real `404`, not
 *     a page that says "not found" while answering `200`. Before this, every
 *     typo and every abandoned link looked like a working page to a crawler;
 *   • the name, the bio and the published work are in the HTML that arrives,
 *     so the page is readable and rankable before any JavaScript runs;
 *   • the interaction — following, reacting, the reader, the theme — is
 *     unchanged, because `HandlePage` is still the same client component and
 *     simply receives what the server already fetched.
 */

/** The reserved list lives in one place; the server is where it is enforced. */
function isReserved(username: string): boolean {
  return RESERVED_HANDLES.has(username);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const handle = normalizeUsername(username ?? '');
  if (!handle || isReserved(handle)) return { robots: { index: false, follow: false } };

  const profile = await readProfile(handle);
  if (!profile) {
    // A free handle is a 404 (see the page below); either way there is nothing
    // here worth indexing.
    return { robots: { index: false, follow: false } };
  }

  const title = `${profile.displayName} (@${handle})`;
  const description = profile.bio || `Speeches and work by @${handle} on Presentation Buddy.`;

  return {
    title,
    description,
    alternates: { canonical: `/${handle}` },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: `/${handle}`,
      ...(profile.photoURL ? { images: [{ url: profile.photoURL }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ username: string; rest?: string[] }>;
}) {
  const { username } = await params;
  const handle = normalizeUsername(username ?? '');

  // A handle that could never exist: 404, once, here.
  if (!handle || isReserved(handle)) notFound();

  /**
   * Two reads, both public, both cached for a minute.
   *
   * They are what turns this route from "render a spinner and hope" into a
   * page: the profile row, the published work, and the state of the handle
   * itself. `unknown` (the database refused or could not be reached) is *not*
   * treated as free — the screen keeps its honest "we could not check"
   * message for that case, because guessing there would be worse than saying
   * nothing.
   */
  const [state, profile, works] = await Promise.all([
    readHandleState(handle),
    readProfile(handle),
    readWriter(handle),
  ]);

  /**
   * Nobody holds this name, and the database is sure.
   *
   * `notFound()` rather than a rendered apology: the status code is the one
   * thing a crawler, a link checker and a social card scraper all read before
   * any HTML.
   */
  if (state === 'free' && !profile) notFound();

  return (
    <HandlePage
      // A speech or a folder deeper in the tree is resolved by the screen's own
      // rules, from the same URL pieces it already reads.
      initial={{ username: handle, profile, works, handleState: state }}
    />
  );
}
