/**
 * Web sources — the library that grows by itself.
 *
 * Presentation Buddy pulls real speeches off the open internet so there is
 * always something new to read and rehearse. Every session has a goal:
 * **five new arrivals**, fetched live in the visitor's own browser, each one
 * carrying its source, its licence and a link back to the original page.
 *
 * Nothing here is written by us, nothing is invented, and nothing is
 * claimed as our own. Three independent archives are used so the flow does
 * not stop when one of them is unreachable:
 *
 *   • Wikisource   — public-domain speeches and addresses (CC BY-SA / PD)
 *   • Project Gutenberg (via Gutendex) — public-domain orations and lectures
 *   • Wikiquote     — sourced excerpts from notable speeches (CC BY-SA)
 */

export type SourceId = 'wikisource' | 'gutenberg' | 'wikiquote';

export interface SourceMeta {
  id: SourceId;
  name: string;
  home: string;
  /** What the licence actually permits, in plain words. */
  licence: string;
  blurb: string;
}

export const SOURCES: Record<SourceId, SourceMeta> = {
  wikisource: {
    id: 'wikisource',
    name: 'Wikisource',
    home: 'https://en.wikisource.org',
    licence: 'Public domain / CC BY-SA 4.0',
    blurb:
      'The free library of source texts. Speeches and addresses transcribed and checked by volunteers.',
  },
  gutenberg: {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    home: 'https://www.gutenberg.org',
    licence: 'Public domain in the United States',
    blurb:
      'Over seventy thousand digitised books, including collected orations and lecture series.',
  },
  wikiquote: {
    id: 'wikiquote',
    name: 'Wikiquote',
    home: 'https://en.wikiquote.org',
    licence: 'CC BY-SA 4.0',
    blurb: 'Sourced quotations, including passages from speeches with full citations.',
  },
};

export interface WebSpeech {
  id: string;
  title: string;
  author: string;
  preview: string;
  content: string;
  sourceUrl: string;
  /** Human-readable source name, kept as a string for stored-shelf compatibility. */
  source: string;
  sourceId: SourceId;
  licence: string;
  fetchedAt: string;
}

/* ------------------------------------------------------------------ */
/* shared helpers                                                       */
/* ------------------------------------------------------------------ */

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/\s+\n/g, '\n')
    .trim();
}

/** Tidy raw archive text into readable paragraphs. */
function tidy(raw: string, limit?: number): string {
  const text = stripHtml(raw)
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter((block) => block.length > 40)
    .join('\n\n');
  return limit && text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Every network call is time-boxed: an archive that hangs must not hang us. */
const SOURCE_USER_AGENT = 'PresentationBuddy/3.1 (https://dedyn.io/; mailto:amaavrit@yahoo.com)';

/**
 * Public archive traffic is made from the server route, never a reader's
 * browser. That lets Wikimedia see a useful User-Agent and lets Next cache
 * each public source response instead of making every visit a fresh query.
 */
async function fetchJson<T>(url: string, timeoutMs = 9000): Promise<T | null> {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const server = typeof window === 'undefined';
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(server ? { 'User-Agent': SOURCE_USER_AGENT } : {}),
      },
      signal: controller?.signal,
      ...(server ? { cache: 'force-cache' as const, next: { revalidate: 1800 } } : { cache: 'no-store' as const }),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const server = typeof window === 'undefined';
  try {
    const response = await fetch(url, {
      headers: server ? { 'User-Agent': SOURCE_USER_AGENT, Accept: 'text/plain, text/html;q=0.9, */*;q=0.8' } : undefined,
      signal: controller?.signal,
      ...(server ? { cache: 'force-cache' as const, next: { revalidate: 86400 } } : { cache: 'no-store' as const }),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Wikisource                                                           */
/* ------------------------------------------------------------------ */

const WS_API = 'https://en.wikisource.org/w/api.php';

interface MwPage {
  pageid: number;
  title: string;
  extract?: string;
  ns?: number;
  missing?: string;
}

function wikisourceSpeech(page: MwPage, content: string): WebSpeech {
  const meta = SOURCES.wikisource;
  return {
    id: `ws-${page.pageid}`,
    title: page.title,
    author: 'Public domain · Wikisource',
    preview: tidy(content, 220),
    content: tidy(content, 9000) || 'This page has no readable text yet — open it at the source.',
    sourceUrl: `https://en.wikisource.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    source: meta.name,
    sourceId: 'wikisource',
    licence: meta.licence,
    fetchedAt: new Date().toISOString(),
  };
}

async function searchWikisource(query: string, limit: number, variation = 0): Promise<WebSpeech[]> {
  const term = query.trim();
  const searches = term
    ? [`incategory:"Speeches" ${term}`, `insource:"${term}" incategory:"Speeches"`, term]
    : ['incategory:"Speeches"', 'speech address oration lecture'];

  for (const search of searches) {
    const pageOffset = (stableSeed(search) + variation * 13) % 20;
    const url = `${WS_API}?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(
      search,
    )}&gsrnamespace=0&gsrlimit=${Math.max(limit, 8)}&gsroffset=${pageOffset}&prop=extracts&exintro=1&explaintext=1`;
    const payload = await fetchJson<{ query?: { pages?: Record<string, MwPage> } }>(url);
    const pages = Object.values(payload?.query?.pages ?? {}).filter(
      (page) => page && page.pageid && !page.missing && (page.extract ?? '').length > 80,
    );
    if (pages.length) return pages.slice(0, limit).map((page) => wikisourceSpeech(page, page.extract ?? ''));
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Project Gutenberg (Gutendex)                                         */
/* ------------------------------------------------------------------ */

const GUTENDEX = 'https://gutendex.com/books';

interface GutenBook {
  id: number;
  title: string;
  authors?: { name?: string }[];
  subjects?: string[];
  formats?: Record<string, string>;
}

function gutenbergSpeech(book: GutenBook, body: string): WebSpeech {
  const meta = SOURCES.gutenberg;
  const author = book.authors?.[0]?.name ?? 'Unknown author';
  return {
    id: `pg-${book.id}`,
    title: book.title.replace(/\s*\n\s*/g, ' ').trim(),
    author: `${author} · Project Gutenberg`,
    preview: tidy(body, 220),
    content: tidy(body, 9000) || 'This text could not be read — open it at the source.',
    sourceUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    source: meta.name,
    sourceId: 'gutenberg',
    licence: meta.licence,
    fetchedAt: new Date().toISOString(),
  };
}

/** Strip Gutenberg's licence boilerplate down to the actual text. */
function unwrapGutenberg(raw: string): string {
  const startMatch = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i.exec(raw);
  const endMatch = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(raw);
  const start = startMatch ? startMatch.index + startMatch[0].length : 0;
  const end = endMatch ? endMatch.index : raw.length;
  return raw.slice(start, end).replace(/\r\n/g, '\n').trim();
}

async function searchGutenberg(query: string, limit: number): Promise<WebSpeech[]> {
  const term = query.trim() || 'speeches';
  const payload = await fetchJson<{ results?: GutenBook[] }>(
    `${GUTENDEX}?search=${encodeURIComponent(term)}&topic=oratory&languages=en`,
  );
  let books = payload?.results ?? [];
  if (!books.length) {
    const fallback = await fetchJson<{ results?: GutenBook[] }>(
      `${GUTENDEX}?search=${encodeURIComponent(`${term} speeches`)}&languages=en`,
    );
    books = fallback?.results ?? [];
  }
  if (!books.length) return [];

  const picked = books.slice(0, limit);
  const speeches: WebSpeech[] = [];
  for (const book of picked) {
    const textUrl =
      book.formats?.['text/plain; charset=utf-8'] ??
      book.formats?.['text/plain; charset=us-ascii'] ??
      book.formats?.['text/plain'];
    // Without a plain-text format we would only have a title, which is not a read.
    if (!textUrl) continue;
    const raw = await fetchText(textUrl.replace(/^http:/, 'https:'));
    if (!raw) continue;
    const body = unwrapGutenberg(raw).slice(0, 14000);
    if (body.length < 400) continue;
    speeches.push(gutenbergSpeech(book, body));
    if (speeches.length >= limit) break;
  }
  return speeches;
}

/* ------------------------------------------------------------------ */
/* Wikiquote                                                            */
/* ------------------------------------------------------------------ */

const WQ_API = 'https://en.wikiquote.org/w/api.php';

function wikiquoteSpeech(page: MwPage, content: string): WebSpeech {
  const meta = SOURCES.wikiquote;
  return {
    id: `wq-${page.pageid}`,
    title: page.title,
    author: 'Sourced quotations · Wikiquote',
    preview: tidy(content, 220),
    content: tidy(content, 9000) || 'No readable passage yet — open it at the source.',
    sourceUrl: `https://en.wikiquote.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    source: meta.name,
    sourceId: 'wikiquote',
    licence: meta.licence,
    fetchedAt: new Date().toISOString(),
  };
}

async function searchWikiquote(query: string, limit: number): Promise<WebSpeech[]> {
  const term = query.trim() || 'speech';
  const url = `${WQ_API}?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(
    `${term} speech`,
  )}&gsrnamespace=0&gsrlimit=${Math.max(limit, 6)}&prop=extracts&exintro=1&explaintext=1`;
  const payload = await fetchJson<{ query?: { pages?: Record<string, MwPage> } }>(url);
  const pages = Object.values(payload?.query?.pages ?? {}).filter(
    (page) => page && page.pageid && !page.missing && (page.extract ?? '').length > 120,
  );
  return pages.slice(0, limit).map((page) => wikiquoteSpeech(page, page.extract ?? ''));
}

/* ------------------------------------------------------------------ */
/* the public surface                                                   */
/* ------------------------------------------------------------------ */

/** Search every archive at once and interleave the results. */
async function searchWebSpeechesDirect(query: string, limit: number): Promise<WebSpeech[]> {
  const per = Math.max(3, Math.ceil(limit / 2));
  const [wikisource, wikiquote, gutenberg] = await Promise.all([
    searchWikisource(query, per).catch(() => []),
    searchWikiquote(query, Math.ceil(per / 2)).catch(() => []),
    searchGutenberg(query, 2).catch(() => []),
  ]);

  // Interleave so no single archive dominates the top of the page.
  const lanes = [wikisource, gutenberg, wikiquote];
  const out: WebSpeech[] = [];
  for (let i = 0; out.length < limit; i += 1) {
    const before = out.length;
    for (const lane of lanes) {
      if (lane[i]) out.push(lane[i]);
      if (out.length >= limit) break;
    }
    if (out.length === before) break;
  }
  return out;
}

export async function searchWebSpeeches(query: string, limit = 12): Promise<WebSpeech[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 12, 1), 20);
  if (typeof window === 'undefined') return searchWebSpeechesDirect(query.trim().slice(0, 120), safeLimit);
  const params = new URLSearchParams({ mode: 'search', q: query.trim().slice(0, 120), limit: String(safeLimit) });
  const response = await fetch(`/api/arrivals?${params}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('The archives could not be reached.');
  const payload = await response.json() as { speeches?: WebSpeech[] };
  return Array.isArray(payload.speeches) ? payload.speeches : [];
}

/** Fetch the full text of a single item, whichever archive it came from. */
async function fetchWebSpeechDirect(speech: WebSpeech): Promise<WebSpeech> {
  if (speech.sourceId === 'gutenberg') {
    const id = speech.id.replace(/^pg-/, '');
    const book = await fetchJson<GutenBook>(`${GUTENDEX}/${id}`);
    const textUrl =
      book?.formats?.['text/plain; charset=utf-8'] ??
      book?.formats?.['text/plain; charset=us-ascii'] ??
      book?.formats?.['text/plain'];
    if (!textUrl) return speech;
    const raw = await fetchText(textUrl.replace(/^http:/, 'https:'));
    if (!raw) return speech;
    return { ...speech, content: tidy(unwrapGutenberg(raw).slice(0, 40000), 30000) };
  }

  const api = speech.sourceId === 'wikiquote' ? WQ_API : WS_API;
  const title = decodeURIComponent(speech.sourceUrl.split('/wiki/')[1] ?? '').replace(/_/g, ' ');
  if (!title) return speech;
  const payload = await fetchJson<{ query?: { pages?: Record<string, MwPage> } }>(
    `${api}?action=query&format=json&origin=*&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}`,
  );
  const page = Object.values(payload?.query?.pages ?? {})[0];
  if (!page?.extract) return speech;
  return { ...speech, content: tidy(page.extract, 30000) };
}

export async function fetchWebSpeech(speech: WebSpeech): Promise<WebSpeech> {
  if (typeof window === 'undefined') return fetchWebSpeechDirect(speech);
  try {
    const response = await fetch('/api/arrivals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mode: 'text', speech }),
    });
    if (!response.ok) return speech;
    const payload = await response.json() as { speech?: WebSpeech };
    return payload.speech && typeof payload.speech.content === 'string' ? payload.speech : speech;
  } catch {
    return speech;
  }
}

/** Resolve a stable public archive id directly, so saved arrival links work on a fresh device. */
export async function readWebSpeechById(id: string): Promise<WebSpeech | null> {
  const match = /^(ws|wq|pg)-(\d{1,12})$/.exec(id);
  if (!match) return null;
  const [, prefix, numericId] = match;

  if (prefix === 'pg') {
    const book = await fetchJson<GutenBook>(`${GUTENDEX}/${numericId}`);
    if (!book?.id) return null;
    const seed = gutenbergSpeech(book, '');
    const full = await fetchWebSpeechDirect(seed);
    return full.content.length > 80 ? full : null;
  }

  const sourceId: SourceId = prefix === 'wq' ? 'wikiquote' : 'wikisource';
  const api = sourceId === 'wikiquote' ? WQ_API : WS_API;
  const payload = await fetchJson<{ query?: { pages?: Record<string, MwPage> } }>(
    `${api}?action=query&format=json&prop=extracts&explaintext=1&exchars=30000&pageids=${numericId}`,
  );
  const page = Object.values(payload?.query?.pages ?? {}).find((candidate) => candidate.pageid === Number(numericId) && !candidate.missing);
  if (!page?.title || !page.extract) return null;
  const meta = SOURCES[sourceId];
  const sourceUrl = `${meta.home}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
  const content = tidy(page.extract, 30000);
  if (!content) return null;
  return {
    id,
    title: page.title,
    author: sourceId === 'wikiquote' ? 'Sourced quotations · Wikiquote' : 'Public domain · Wikisource',
    preview: tidy(content, 220),
    content,
    sourceUrl,
    source: meta.name,
    sourceId,
    licence: meta.licence,
    fetchedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* the session goal: five new arrivals                                  */
/* ------------------------------------------------------------------ */

export const ARRIVALS_GOAL = 5;

/**
 * Rotating themes, so two sessions in a row never open on the same five
 * speeches. The seed is the day plus the session, not a random number, so
 * a reload during one sitting is stable while tomorrow is different.
 */
const ARRIVAL_THEMES = [
  'freedom',
  'courage',
  'justice',
  'peace',
  'science',
  'education',
  'labour',
  'suffrage',
  'independence',
  'farewell',
  'inaugural',
  'reform',
  'memorial',
  'dissent',
  'union',
  'hope',
];

const SESSION_KEY = 'pb.arrivals.session';

/** A stable number for this browsing session (survives reloads for a day). */
export function sessionSeed(): number {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { day: string; seed: number };
      if (parsed.day === today) return parsed.seed;
    }
    const seed = Math.floor(Math.random() * 10_000);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ day: today, seed }));
    return seed;
  } catch {
    // No sessionStorage (private mode, prerender): fall back to the date.
    return today.split('-').reduce((sum, part) => sum + Number(part), 0);
  }
}

export interface ArrivalsResult {
  speeches: WebSpeech[];
  /** The theme these arrivals were gathered under, shown in the UI. */
  theme: string;
  /** Which archives actually answered this time. */
  answered: SourceId[];
  /** Archives that were asked but could not be reached. */
  unreachable: SourceId[];
}

/**
 * Fetch this session's new arrivals, spread across the archives. Known ids
 * are skipped, so an automatic top-up never repeats a presentation already
 * shown in this tab.
 */
async function fetchArrivalsDirect(
  known: string[],
  goal: number,
  offset: number,
  baseSeed: number,
): Promise<ArrivalsResult> {
  const seed = baseSeed + offset;
  const theme = ARRIVAL_THEMES[seed % ARRIVAL_THEMES.length];
  const knownSet = new Set(known);

  const settled = await Promise.allSettled([
    searchWikisource(theme, goal, seed),
    searchGutenberg(theme, 2),
    searchWikiquote(theme, 3),
  ]);

  const ids: SourceId[] = ['wikisource', 'gutenberg', 'wikiquote'];
  const answered: SourceId[] = [];
  const unreachable: SourceId[] = [];
  const lanes: WebSpeech[][] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.length) {
      answered.push(ids[index]);
      lanes.push(result.value);
    } else {
      unreachable.push(ids[index]);
      lanes.push([]);
    }
  });

  // Round-robin across archives so the five are not all from one place.
  const speeches: WebSpeech[] = [];
  const seen = new Set<string>();
  for (let i = 0; speeches.length < goal; i += 1) {
    const before = speeches.length;
    for (const lane of lanes) {
      const candidate = lane[i];
      if (!candidate) continue;
      if (knownSet.has(candidate.id) || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      speeches.push(candidate);
      if (speeches.length >= goal) break;
    }
    if (speeches.length === before) break;
  }

  return { speeches, theme, answered, unreachable };
}

export async function fetchArrivals(
  known: string[] = [],
  goal = ARRIVALS_GOAL,
  offset = 0,
  seed = sessionSeed(),
): Promise<ArrivalsResult> {
  const safeGoal = Math.min(Math.max(Math.floor(goal) || ARRIVALS_GOAL, 1), ARRIVALS_GOAL);
  const safeOffset = Math.min(Math.max(Math.floor(offset) || 0, 0), 64);
  const safeKnown = known.filter((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id)).slice(-40);
  if (typeof window === 'undefined') return fetchArrivalsDirect(safeKnown, safeGoal, safeOffset, seed);

  const params = new URLSearchParams({
    mode: 'batch',
    goal: String(safeGoal),
    offset: String(safeOffset),
    seed: String(Math.max(0, Math.floor(seed)) % 1_000_000),
    known: safeKnown.join(','),
  });
  const response = await fetch(`/api/arrivals?${params}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('The archives could not be reached.');
  return await response.json() as ArrivalsResult;
}

/** Kept for the library's quiet first-load top-up. */
export async function fetchCuratedWebSpeeches(): Promise<WebSpeech[]> {
  const { speeches } = await fetchArrivals([], ARRIVALS_GOAL);
  return speeches;
}
