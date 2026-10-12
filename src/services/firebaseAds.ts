/**
 * Firebase — the ADS project.
 *
 * A completely separate Firebase project (`a-a-v-r-i-t`) whose only job is
 * to serve the `servingads` collection.
 *
 * Why a second project rather than another collection in the first one?
 *
 *   • **Blast radius.** This app has no write access to the ads project and
 *     no service account for it. A bug — or a compromised credential — in
 *     the main app cannot alter, delete or spam ad content, and an ad
 *     operator's mistake cannot touch presentations, profiles or reactions.
 *
 *   • **Separate rules.** The ads project's rules are a single public read.
 *     There is no user data in it to protect, so there are no user-scoped
 *     rules to get wrong.
 *
 *   • **Independent quota.** Ad traffic is the noisiest traffic on the site.
 *     Giving it its own project means a spike in impressions cannot starve
 *     the reads that actually matter.
 *
 * Only `firebase/app` and `firebase/firestore` are imported — no Auth. The
 * collection is public-read, so there is nothing to sign in to, and leaving
 * Auth out keeps the Firebase SDK's largest module out of this chunk.
 *
 * As everywhere else: if the variables are missing this resolves to
 * "not configured" and the caller quietly shows house ads.
 */

import type { FirebaseOptions } from 'firebase/app';

const env = import.meta.env ?? ({} as ImportMetaEnv);

const ADS_API_KEY = (env.VITE_ADS_FIREBASE_API_KEY as string | undefined)?.trim();
const ADS_PROJECT_ID = (env.VITE_ADS_FIREBASE_PROJECT_ID as string | undefined)?.trim();

export const ADS_ENABLED = Boolean(ADS_API_KEY && ADS_PROJECT_ID);

/** Firestore app names must be unique per project within one page. */
const ADS_APP_NAME = 'presentation-buddy-ads';

/** The only collection this app is allowed to touch. */
export const ADS_COLLECTION = 'servingads';

export interface FirestoreLike {
  collection: (db: unknown, path: string) => unknown;
  getDocs: (query: unknown) => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>;
  query: (col: unknown, ...constraints: unknown[]) => unknown;
  where: (field: string, op: string, value: unknown) => unknown;
  orderBy: (field: string, dir?: 'asc' | 'desc') => unknown;
  limit: (n: number) => unknown;
}

export interface AdsBundle {
  db: unknown;
  fs: FirestoreLike;
}

let adsPromise: Promise<AdsBundle | null> | null = null;

export function loadAdsFirebase(): Promise<AdsBundle | null> {
  if (!ADS_ENABLED) return Promise.resolve(null);
  if (adsPromise) return adsPromise;

  adsPromise = (async () => {
    try {
      const [{ initializeApp, getApp }, fsMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ]);

      const config: FirebaseOptions = {
        apiKey: ADS_API_KEY,
        authDomain: (env.VITE_ADS_FIREBASE_AUTH_DOMAIN as string | undefined) ?? undefined,
        projectId: ADS_PROJECT_ID,
        storageBucket: (env.VITE_ADS_FIREBASE_STORAGE_BUCKET as string | undefined) ?? undefined,
        messagingSenderId: (env.VITE_ADS_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? undefined,
        appId: (env.VITE_ADS_FIREBASE_APP_ID as string | undefined) ?? undefined,
        measurementId: (env.VITE_ADS_FIREBASE_MEASUREMENT_ID as string | undefined) ?? undefined,
      };

      // Warm invocations of this module (React strict mode, a route change
      // back) must reuse the named app instead of re-initialising it.
      let app;
      try {
        app = getApp(ADS_APP_NAME);
      } catch {
        app = initializeApp(config, ADS_APP_NAME);
      }

      return {
        db: fsMod.getFirestore(app),
        fs: {
          collection: fsMod.collection as FirestoreLike['collection'],
          getDocs: fsMod.getDocs as unknown as FirestoreLike['getDocs'],
          query: fsMod.query as FirestoreLike['query'],
          where: fsMod.where as FirestoreLike['where'],
          orderBy: fsMod.orderBy as FirestoreLike['orderBy'],
          limit: fsMod.limit as FirestoreLike['limit'],
        },
      } satisfies AdsBundle;
    } catch {
      // A second Firebase app is a nice-to-have. Losing it must never take
      // the page down.
      return null;
    }
  })();

  return adsPromise;
}
