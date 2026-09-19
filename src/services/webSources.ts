/**
 * Web sources.
 *
 * Presentation Buddy can pull real speeches off the internet so the library
 * keeps growing on its own. Everything here is public-domain text from
 * Wikisource, fetched live in the visitor's browser and attributed with a
 * link back to the original page. Nothing is invented, and nothing is
 * claimed as our own.
 */

export interface WebSpeech {
  id: string;
  title: string;
  author: string;
  preview: string;
  content: string;
  sourceUrl: string;
  source: 'Wikisource';
  licence: string;
  fetchedAt: string;
}

const API = 'https://en.wikisource.org/w/api.php';

interface SearchResult {
  pageid: number;
  title: string;
  extract?: string;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .trim();
}

/** Tidy a Wikisource extract into readable paragraphs. */
function tidy(raw: string, limit?: number): string {
  const text = stripHtml(raw)
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter((block) => block.length > 40)
    .join('\n\n');
  return limit && text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function asSpeech(result: SearchResult, content: string): WebSpeech {
  return {
    id: `wiki-${result.pageid}`,
    title: result.title,
    author: 'Public domain · Wikisource',
    preview: tidy(content, 220),
    content: tidy(content, 9000) || 'This page has no readable text yet — open it on Wikisource.',
    sourceUrl: `https://en.wikisource.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`,
    source: 'Wikisource',
    licence: 'Public domain',
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Search Wikisource's Speeches category (falling back to a plain search when
 * the category query is unavailable).
 */
export async function searchWebSpeeches(query: string, limit = 12): Promise<WebSpeech[]> {
  const term = query.trim();
  const searches = term
    ? [`incategory:"Speeches" ${term}`, `insource:"${term}" incategory:"Speeches"`, term]
    : ['incategory:"Speeches"', 'speech address oration'];

  for (const search of searches) {
    try {
      const url = `${API}?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(
        search,
      )}&gsrnamespace=0&gsrlimit=${Math.max(limit, 8)}&prop=extracts&exintro=1&explaintext=1`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        query?: { pages?: Record<string, SearchResult & { ns?: number; missing?: string }> };
      };
      const pages = Object.values(payload.query?.pages ?? {}).filter(
        (page) => page && page.pageid && !page.missing,
      );
      if (!pages.length) continue;
      return pages
        .filter((page) => (page.extract ?? '').length > 80)
        .slice(0, limit)
        .map((page) => asSpeech(page, page.extract ?? ''));
    } catch {
      /* try the next query shape */
    }
  }
  return [];
}

/** Fetch the full plain text of one Wikisource page. */
export async function fetchWebSpeech(speech: WebSpeech): Promise<WebSpeech> {
  try {
    const title = decodeURIComponent(speech.sourceUrl.split('/wiki/')[1] ?? '').replace(/_/g, ' ');
    const url = `${API}?action=query&format=json&origin=*&prop=extracts&explaintext=1&titles=${encodeURIComponent(
      title,
    )}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return speech;
    const payload = (await response.json()) as {
      query?: { pages?: Record<string, SearchResult> };
    };
    const page = Object.values(payload.query?.pages ?? {})[0];
    if (!page?.extract) return speech;
    return asSpeech({ ...page, title: page.title || speech.title }, page.extract);
  } catch {
    return speech;
  }
}

/** A small, honest starter set shown until someone searches. */
export const CURATED_WEB_TITLES = [
  'Gettysburg Address',
  'The Four Freedoms speech',
  'Blood, Toil, Tears and Sweat',
  'Speech to the Electors of Bristol',
  'Ain’t I a Woman?',
];

export async function fetchCuratedWebSpeeches(): Promise<WebSpeech[]> {
  try {
    const url = `${API}?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(
      CURATED_WEB_TITLES.join('|'),
    )}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      query?: { pages?: Record<string, SearchResult & { missing?: string }> };
    };
    return Object.values(payload.query?.pages ?? {})
      .filter((page) => page.pageid && !page.missing && (page.extract ?? '').length > 80)
      .map((page) => asSpeech(page, page.extract ?? ''));
  } catch {
    return [];
  }
}
