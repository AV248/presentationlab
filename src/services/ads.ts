import { loadFirebase, FIREBASE_ENABLED } from './firebase';

/**
 * Sponsored slots ("ads") are real documents in the Firestore `ads`
 * collection, managed from the /admin workspace:
 *
 *   ads/{id}  { title, body, url, cta?, weight?, active, createdAt, updatedAt,
 *               impressions?, clicks? }
 *
 * Rules: public read of active ads; only admins/owner may write.
 *
 * The fetch degrades quietly everywhere: no config, no network or a denied
 * read simply falls back to house ads (small promos for the app's own
 * features, labelled as such) so the layout never jumps and the console
 * never logs an error.
 */

export interface Ad {
  id: string;
  title: string;
  body: string;
  url: string;
  cta: string;
  weight: number;
  active: boolean;
  /** House ads are Presentation Buddy's own — no advertiser is invented. */
  house: boolean;
}

const CACHE_KEY = 'pb.ads.v1';
const CACHE_TTL = 10 * 60 * 1000;

export const HOUSE_ADS: Ad[] = [
  {
    id: 'house-themes',
    title: '13.7 million ways this page can look',
    body: 'Five design axes, 134 hand-set options and 14 curated presets. Open the theme studio and make the workspace yours.',
    url: '/themes',
    cta: 'Open the theme studio',
    weight: 2,
    active: true,
    house: true,
  },
  {
    id: 'house-rehearse',
    title: 'Your talk improves on the third rehearsal',
    body: 'Teleprompter, pacing timer and breathing cues — rehearse any speech in this library with the tools built for it.',
    url: '/rehearse',
    cta: 'Rehearse a speech',
    weight: 2,
    active: true,
    house: true,
  },
  {
    id: 'house-publish',
    title: 'Have a talk you are proud of?',
    body: 'Publish it to the shared library for other speakers to read and react to. Real audience, real applause.',
    url: '/write',
    cta: 'Start writing',
    weight: 1,
    active: true,
    house: true,
  },
];

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function num(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mapAd(id: string, data: Record<string, unknown>): Ad | null {
  const title = str(data.title ?? data.Title);
  const url = str(data.url ?? data.Link ?? data.link);
  const body = str(data.body ?? data.Content ?? data.content ?? data.description ?? data.Description);
  if (!title || !url) return null;
  return {
    id,
    title,
    body,
    url,
    cta: str(data.cta ?? data.CTA, 'Learn more'),
    weight: Math.max(1, num(data.weight, 1)),
    active: data.active !== false,
    house: false,
  };
}

interface CacheShape {
  at: number;
  ads: Ad[];
}

function readCache(): Ad[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!Array.isArray(parsed.ads) || Date.now() - parsed.at > CACHE_TTL) return null;
    return parsed.ads;
  } catch {
    return null;
  }
}

function writeCache(ads: Ad[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), ads } satisfies CacheShape));
  } catch {
    /* a full cache never costs an ad */
  }
}

let flight: Promise<Ad[]> | null = null;

/** Active ads from Firestore. Empty array on any failure — never throws. */
export async function fetchActiveAds(options: { fresh?: boolean } = {}): Promise<Ad[]> {
  if (!FIREBASE_ENABLED) return [];
  if (!options.fresh) {
    const cached = readCache();
    if (cached) return cached;
  }
  if (flight) return flight;

  flight = (async () => {
    try {
      const bundle = await loadFirebase();
      if (!bundle) return [];
      const snap = await bundle.fs.getDocs(
        bundle.fs.query(bundle.fs.collection(bundle.db, 'ads'), bundle.fs.limit(40)),
      );
      const ads = snap.docs
        .map((doc) => mapAd(doc.id, doc.data()))
        .filter((ad): ad is Ad => ad !== null && ad.active);
      writeCache(ads);
      return ads;
    } catch {
      return [];
    } finally {
      window.setTimeout(() => {
        flight = null;
      }, 1000);
    }
  })();

  return flight;
}

/** Every ad (active or not) for the admin workspace. */
export async function fetchAllAds(): Promise<Ad[]> {
  const bundle = await loadFirebase();
  if (!bundle) return [];
  const snap = await bundle.fs.getDocs(
    bundle.fs.query(bundle.fs.collection(bundle.db, 'ads'), bundle.fs.limit(100)),
  );
  return snap.docs
    .map((doc) => mapAd(doc.id, doc.data()))
    .filter((ad): ad is Ad => Boolean(ad))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export interface AdInput {
  title: string;
  body: string;
  url: string;
  cta: string;
  weight: number;
  active: boolean;
}

export async function createAd(input: AdInput): Promise<{ id: string }> {
  const bundle = await loadFirebase();
  if (!bundle) throw new Error('The ad desk needs a configured, reachable Firestore.');
  const ref = await bundle.fs.addDoc(bundle.fs.collection(bundle.db, 'ads'), {
    ...input,
    impressions: 0,
    clicks: 0,
    createdAt: bundle.fs.serverTimestamp(),
    updatedAt: bundle.fs.serverTimestamp(),
  });
  writeCache([]);
  return { id: ref.id };
}

export async function updateAd(id: string, patch: Partial<AdInput>): Promise<void> {
  const bundle = await loadFirebase();
  if (!bundle) throw new Error('The ad desk needs a configured, reachable Firestore.');
  await bundle.fs.updateDoc(bundle.fs.doc(bundle.db, 'ads', id), {
    ...patch,
    updatedAt: bundle.fs.serverTimestamp(),
  });
  writeCache([]);
}

export async function deleteAd(id: string): Promise<void> {
  const bundle = await loadFirebase();
  if (!bundle) throw new Error('The ad desk needs a configured, reachable Firestore.');
  await bundle.fs.deleteDoc(bundle.fs.doc(bundle.db, 'ads', id));
  writeCache([]);
}

/** Best-effort analytics. A denied write is a perfectly normal outcome. */
export async function recordAdEvent(id: string, kind: 'impression' | 'click'): Promise<void> {
  if (id.startsWith('house-')) return;
  try {
    const bundle = await loadFirebase();
    if (!bundle) return;
    await bundle.fs.updateDoc(bundle.fs.doc(bundle.db, 'ads', id), {
      [kind === 'impression' ? 'impressions' : 'clicks']: bundle.fs.increment(1),
    });
  } catch {
    /* counters never interrupt the reader */
  }
}

/** Deterministic weighted pick so one page view does not reshuffle on rerender. */
export function pickAd(ads: Ad[], seed: string): Ad | null {
  if (!ads.length) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const total = ads.reduce((sum, ad) => sum + ad.weight, 0);
  let roll = hash % total;
  for (const ad of ads) {
    roll -= ad.weight;
    if (roll < 0) return ad;
  }
  return ads[ads.length - 1];
}
