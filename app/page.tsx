import { LibraryPage } from '@/screens/LibraryPage';
import { readLibrary } from '@/server/reading';
import { routeMetadata } from '@/lib/routeMeta';
import type { CloudSpeech } from '@/lib/speech';

/**
 * Rebuild this page at most once a minute.
 *
 * Without this line the framework renders the page once, at build time, and
 * serves that same HTML until the next deploy — so a speech published this
 * morning would not appear on the front page until someone happened to push a
 * commit. With it, the page is still a cached file for a minute at a time
 * (which is what makes the busiest page on the site fast), and it catches up
 * on its own.
 */
export const revalidate = 60;

/**
 * The library — the front page.
 *
 * ── Why this is a server component ──────────────────────────────────────────
 * This is the page a search engine reads first, and the page most people open
 * first. Its list is therefore read here, on the server, and handed to the
 * screen as `initial`: the titles, authors, previews and counters are all in
 * the HTML that arrives.
 *
 * The screen is still the same client component and still fetches its own
 * copy once it is live (that is how reacting, previewing and the reader's own
 * drafts work). The seed is only what the first render shows.
 *
 * ── Why the bodies are dropped ──────────────────────────────────────────────
 * A list needs a preview, not a speech. Sending the full text of a dozen
 * speeches into the HTML of the busiest page on the site would cost every
 * visitor bandwidth to render excerpts the size of a paragraph.
 */
export const metadata = routeMetadata('/');

/** Enough to fill the first screen and a scroll, and no more. */
const SEED = 12;

function forList(speech: CloudSpeech): CloudSpeech {
  return { ...speech, content: '' };
}

export default async function Page() {
  // A failure here is not a failure of the page: publishing is optional and
  // the bundled starter library renders either way.
  const { items } = await readLibrary({ max: SEED });
  return <LibraryPage initial={items.map(forList)} />;
}
