/**
 * Firebase — the ads collection, in the DATA project.
 *
 * Ad documents live in `servingads`, in the same Firebase project as the rest
 * of the site. There used to be a second project (`a-a-v-r-i-t`) for them,
 * kept separate for blast-radius reasons; what that bought in theory — a bug
 * in the app cannot touch the ads — it paid for in seven extra environment
 * variables, a second rules file, a second console and a second thing to
 * misconfigure. For one read-only collection, that was not a trade worth
 * making, so the separation now comes from rules instead:
 *
 *   match /servingads/{adId} {
 *     allow read: if true;            // every visitor sees the ads
 *     allow write: if isAdmin();      // only a role-holder, never the web app
 *   }
 *
 * The site still performs **no write** to this collection. Ads are created and
 * edited in the Firebase console (or, later, by an admin tool); the browser
 * only reads and renders them. Every field is treated as untrusted input and
 * validated in `./ads.ts` before it goes near the DOM.
 *
 * As everywhere else: when the project is not configured, this resolves to
 * "not configured" and the caller quietly shows house ads.
 */

import { FIREBASE_ENABLED, loadFirebase } from './firebase';

/** Ads are available exactly when the data project is. */
export const ADS_ENABLED = FIREBASE_ENABLED;

/** The only collection this module reads. */
export const ADS_COLLECTION = 'servingads';

export interface FirestoreLike {
  collection: (db: unknown, path: string) => unknown;
  getDocs: (query: unknown) => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>;
  /** Present in the browser SDK; bypasses any local cache when reading. */
  getDocsFromServer?: (query: unknown) => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>;
  query: (col: unknown, ...constraints: unknown[]) => unknown;
  where: (field: string, op: string, value: unknown) => unknown;
  orderBy: (field: string, dir?: 'asc' | 'desc') => unknown;
  limit: (n: number) => unknown;
}

export interface AdsBundle {
  db: unknown;
  fs: FirestoreLike;
}

/**
 * The data project's Firestore, shaped for the ad reader. `loadFirebase()` is
 * already memoised, so this adds no second SDK load — ads and speeches share
 * one connection.
 */
export async function loadAdsFirebase(): Promise<AdsBundle | null> {
  if (!FIREBASE_ENABLED) return null;
  const bundle = await loadFirebase();
  if (!bundle) return null;
  return {
    db: bundle.db,
    fs: {
      collection: bundle.fs.collection as FirestoreLike['collection'],
      getDocs: bundle.fs.getDocs as unknown as FirestoreLike['getDocs'],
      getDocsFromServer: (bundle.fs as unknown as { getDocsFromServer?: unknown })
        .getDocsFromServer as unknown as FirestoreLike['getDocsFromServer'],
      query: bundle.fs.query as FirestoreLike['query'],
      where: bundle.fs.where as FirestoreLike['where'],
      orderBy: bundle.fs.orderBy as FirestoreLike['orderBy'],
      limit: bundle.fs.limit as FirestoreLike['limit'],
    },
  };
}
