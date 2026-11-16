import { loadBackend, BACKEND_ENABLED } from './backend';

/**
 * Ads are available exactly when the durable store is: the `servingads`
 * collection lives in Postgres beside everything else, and the site reads it
 * under a row policy that lets everybody read and only role-holders write.
 */
export const ADS_ENABLED = BACKEND_ENABLED;

/**
 * Sponsored slots.
 *
 * Ads are rows in the site's own `ads` table — one database, not a second
 * project — readable by everyone and writable only by a role-holder (see the
 * ads policies in supabase/schema.sql).
 *
 * Row shape (the capitalised field names are the app's, kept from the original
 * Presentation Lab so the same records migrate unchanged):
 *
 *   servingads/{id}
 *     Title              string  headline
 *     Content            string  full body copy
 *     ImageURL           string  https image
 *     DescriptionPreview string  one-line teaser shown on the card
 *     RedirectURL        string  https destination for the click
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY FIELD IS UNTRUSTED INPUT
 * ─────────────────────────────────────────────────────────────────────────────
 * This collection is edited outside this codebase, so a document could contain
 * `RedirectURL: "javascript:..."` — by accident, or because someone with
 * access to that project turned malicious. Rendering that into an <a href>
 * would be script execution on our origin, with our users' sessions.
 *
 * So both URL fields are parsed andScheme-checked before they are allowed
 * near the DOM; anything that is not http(s) — or a same-origin path — is
 * dropped and the ad is skipped entirely. Titles and copy are rendered as
 * React text, never as HTML.
 *
 * This collection is read-only from here. No write of any kind is attempted:
 * not to record impressions, not to count clicks. Advertiser analytics belong
 * to the RedirectURL they control.
 *
 * As always: no config, no network, or a denied read falls back to house ads
 * (small promos for this app's own features, labelled as such), so the layout
 * never jumps and the console never logs an error.
 */

export interface Ad {
  id: string;
  title: string;
  /** Short teaser shown on the card (DescriptionPreview, or a trim of Content). */
  body: string;
  /** Full copy (Content), kept for the expanded rail variant. */
  content: string;
  /** Validated https image, or null when absent or unsafe. */
  imageUrl: string | null;
  /** Validated http(s) destination or same-origin path; empty when the ad is informational. */
  url: string;
  cta: string;
  weight: number;
  /** House ads are Presentation Buddy's own — no advertiser is invented. */
  house: boolean;
}

const CACHE_KEY = 'pb.servingads.v1';
/**
 * A minute, not ten.
 *
 * Ten minutes was long enough that an ad edited in the console looked like it
 * had not been saved at all — the single most confusing thing about this
 * collection. The cache still exists (it keeps a page from re-reading on every
 * render), but it now expires quickly, and an admin save clears it outright.
 */
const CACHE_TTL = 60 * 1000;
const MAX_ADS = 40;

export const HOUSE_ADS: Ad[] = [
  {
    id: 'house-share-heart',
    title: 'Someone you know is quietly dreading a presentation',
    body: 'They will not ask for help. But a link that arrives at the right moment — with a rehearsal room inside it — can change the night before, and the morning after. Pass it on, gently.',
    content: 'They will not ask for help. But a link that arrives at the right moment — with a rehearsal room inside it — can change the night before, and the morning after. Pass it on, gently.',
    imageUrl: null,
    url: '/',
    cta: 'Share Presentation Buddy',
    weight: 3,
    house: true,
  },
  {
    id: 'house-share-first',
    title: 'Every confident speaker was once terrified in a smaller room',
    body: 'This place exists so that first, shaky rehearsal happens somewhere kind. If it helped you find one true sentence, it might help them find theirs.',
    content: 'This place exists so that first, shaky rehearsal happens somewhere kind. If it helped you find one true sentence, it might help them find theirs.',
    imageUrl: null,
    url: '/',
    cta: 'Share the rehearsal room',
    weight: 2,
    house: true,
  },
  {
    id: 'house-themes',
    title: '13.7 million ways this page can look',
    body: 'Five design axes, 134 hand-set options and 14 curated presets. Open the theme studio and make the workspace yours.',
    content: 'Five design axes, 134 hand-set options and 14 curated presets. Open the theme studio and make the workspace yours.',
    imageUrl: null,
    url: '/themes',
    cta: 'Open the theme studio',
    weight: 2,
    house: true,
  },
  {
    id: 'house-rehearse',
    title: 'Your talk improves on the third rehearsal',
    body: 'Teleprompter, pacing timer and breathing cues — rehearse any speech in this library with the tools built for it.',
    content: 'Teleprompter, pacing timer and breathing cues — rehearse any speech in this library with the tools built for it.',
    imageUrl: null,
    url: '/rehearse',
    cta: 'Rehearse a speech',
    weight: 2,
    house: true,
  },
  {
    id: 'house-publish',
    title: 'Have a talk you are proud of?',
    body: 'Publish it to the shared library for other speakers to read and react to. Real audience, real applause.',
    content: 'Publish it to the shared library for other speakers to read and react to. Real audience, real applause.',
    imageUrl: null,
    url: '/write',
    cta: 'Start writing',
    weight: 1,
    house: true,
  },
];

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function num(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Accept a same-origin path or an absolute http(s) URL. Reject everything
 * else — `javascript:`, `data:`, `vbscript:`, `file:`, and the
 * protocol-relative `//host` form, which would silently leave the origin.
 */
function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Internal route. Kept relative so it resolves on any deployment origin
  // (preview URLs, the production domain, localhost).
  if (value.startsWith('/') && !value.startsWith('//')) return value;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

const safeImageUrl = safeUrl;

/* ------------------------------------------------------------------ */
/* Mapping                                                              */
/* ------------------------------------------------------------------ */

function mapAd(id: string, data: Record<string, unknown>): Ad | null {
  if (data.active === false || data.Active === false) return null;
  // The collection is capitalised; the lowercase spellings are accepted so
  // that a document written by some other tool still renders.
  const title = str(data.Title ?? data.title);
  const rawDestination = str(data.RedirectURL ?? data.redirectURL ?? data.redirectUrl ?? data.url);
  const url = rawDestination ? safeUrl(rawDestination) : '';

  // A destination is optional for an informational ad. If one is supplied,
  // it must be safe; unsafe destinations are never rendered as links.
  if (!title || (rawDestination && !url)) return null;

  const content = str(data.Content ?? data.content);
  const preview = str(data.DescriptionPreview ?? data.descriptionPreview ?? data.description);

  return {
    id,
    title,
    body: preview || content.slice(0, 180),
    content,
    imageUrl: safeImageUrl(str(data.ImageURL ?? data.imageURL ?? data.imageUrl)),
    url: url ?? '',
    cta: url ? str(data.CTA ?? data.cta, 'Learn more') : '',
    weight: Math.max(1, num(data.weight, 1)),
    house: false,
  };
}

/* ------------------------------------------------------------------ */
/* Cache                                                                */
/* ------------------------------------------------------------------ */

interface CacheShape {
  at: number;
  /** Raw ad documents, not mapped ads — see readCache. */
  ads: { id?: unknown } & Record<string, unknown>[];
}

function readCache(): Ad[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!Array.isArray(parsed.ads) || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL) return null;

    // Cached documents are re-validated rather than trusted. localStorage is
    // readable by any script on the origin, and a stale shape from an older
    // release would otherwise flow straight into the DOM.
    return parsed.ads
      .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate) && typeof candidate === 'object')
      .map((candidate) => mapAd(String(candidate.id ?? ''), candidate))
      .filter((ad): ad is Ad => ad !== null);
  } catch {
    return null;
  }
}

function writeCache(ads: Ad[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), ads }));
  } catch {
    /* a full cache never costs an ad */
  }
}

export function clearAdCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------------ */
/* Fetching                                                             */
/* ------------------------------------------------------------------ */

let flight: Promise<Ad[]> | null = null;

/**
 * Active ads from the `servingads` collection. Empty array on any failure —
 * never throws, never logs.
 */
export async function fetchActiveAds(options: { fresh?: boolean } = {}): Promise<Ad[]> {
  if (!BACKEND_ENABLED) return [];

  if (!options.fresh) {
    const cached = readCache();
    if (cached) return cached;
  }
  if (flight) return flight;

  flight = (async () => {
    try {
      const bundle = await loadBackend();
      if (!bundle) return [];

      const { fs, db } = bundle;
      // PostgREST answers from the database, so there is no local cache to
      // outrun: a save in the workspace is visible on the next read.
      const snap = await fs.getDocs(
        fs.query(fs.collection(db, 'servingads'), fs.limit(MAX_ADS)),
      );

      const ads = snap.docs
        .map((doc) => mapAd(doc.id, doc.data()))
        .filter((ad): ad is Ad => ad !== null);

      writeCache(ads);
      return ads;
    } catch {
      // A denied read, an offline device and a typo'd project id all land
      // here. House ads cover it.
      return [];
    } finally {
      window.setTimeout(() => {
        flight = null;
      }, 1000);
    }
  })();

  return flight;
}

/**
 * Every ad in the collection, for the admin overview.
 *
 * Read-only by design: this app holds no write credential for the ads
 * project, so the function exists to *show* what is live, not to change it.
 */
export async function fetchAllAds(): Promise<Ad[]> {
  const ads = await fetchActiveAds({ fresh: true });
  return [...ads].sort((a, b) => a.title.localeCompare(b.title));
}

/** Deterministic weighted pick so one page view does not reshuffle on rerender. */
export function pickAd(ads: Ad[], seed: string): Ad | null {
  if (!ads.length) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const total = ads.reduce((sum, ad) => sum + ad.weight, 0);
  if (total <= 0) return ads[hash % ads.length] ?? null;
  let roll = hash % total;
  for (const ad of ads) {
    roll -= ad.weight;
    if (roll < 0) return ad;
  }
  return ads[ads.length - 1] ?? null;
}
