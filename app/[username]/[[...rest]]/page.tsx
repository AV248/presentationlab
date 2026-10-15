/**
 * One writer's own site: /username, /username/<speech> and
 * /username/<folder>/<speech>.
 *
 * One optional catch-all route, not three routes, because Next.js will not
 * allow sibling dynamic segments to be named differently at the same depth
 * (`[slug]` next to `[folder]` is a build error) — and because the URL grammar
 * really is one rule: a handle, then zero or more path pieces. The screen
 * decides what the pieces mean; `profilePath` in src/lib/identity.ts is what
 * writes them.
 *
 * Dynamic on purpose: a new writer is reachable the moment they claim a
 * handle, with no rebuild.
 */
import { HandlePage } from '@/screens/ProfilePage';

export default function Page() {
  return <HandlePage />;
}
