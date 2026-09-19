/** Text analysis helpers that power the writing coach and the reader. */

export const WORDS_PER_MINUTE = 130;

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^---+$/gm, '')
    .trim();
}

export function wordCount(text: string): number {
  const clean = stripMarkdown(text).trim();
  if (!clean) return 0;
  return clean.split(/\s+/).length;
}

export function characterCount(text: string): number {
  return stripMarkdown(text).length;
}

export function sentenceCount(text: string): number {
  const clean = stripMarkdown(text);
  const parts = clean.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 1);
  return Math.max(1, parts.length);
}

export function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length || 1;
}

export function readingMinutes(text: string, wpm = WORDS_PER_MINUTE): number {
  const minutes = wordCount(text) / wpm;
  return Math.max(1, Math.round(minutes));
}

export function speakSeconds(text: string, wpm = WORDS_PER_MINUTE): number {
  return Math.round((wordCount(text) / wpm) * 60);
}

/** Rough syllable counter — good enough for readability scoring. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

export function fleschReadingEase(text: string): number {
  const clean = stripMarkdown(text);
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 10) return 70;
  const sentences = Math.max(1, sentenceCount(clean));
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function readingLevel(score: number): string {
  if (score >= 80) return 'Very easy';
  if (score >= 70) return 'Easy';
  if (score >= 60) return 'Conversational';
  if (score >= 50) return 'Fairly dense';
  if (score >= 40) return 'Dense';
  return 'Heavy';
}

export const FILLER_WORDS = [
  'basically',
  'actually',
  'literally',
  'honestly',
  'obviously',
  'very',
  'really',
  'just',
  'quite',
  'simply',
  'totally',
  'stuff',
  'things',
  'kind of',
  'sort of',
  'you know',
  'i mean',
  'in order to',
  'utilize',
  'leverage',
  'synergy',
  'going forward',
  'at the end of the day',
  'needless to say',
  'to be honest',
];

/** Word-boundary aware count that avoids regex lookbehind (older Safari). */
function countPhrase(haystack: string, phrase: string): number {
  let count = 0;
  let index = haystack.indexOf(phrase);
  while (index !== -1) {
    const before = index === 0 ? ' ' : haystack[index - 1];
    const after = index + phrase.length < haystack.length ? haystack[index + phrase.length] : ' ';
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) count += 1;
    index = haystack.indexOf(phrase, index + phrase.length);
  }
  return count;
}

export function findFillers(text: string): { word: string; count: number }[] {
  const lower = stripMarkdown(text).toLowerCase().replace(/\s+/g, ' ');
  return FILLER_WORDS.map((word) => ({ word, count: countPhrase(lower, word) }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function longSentences(text: string, limit = 32): string[] {
  const clean = stripMarkdown(text).replace(/\s+/g, ' ');
  return clean
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length > limit)
    .slice(0, 6);
}

const PASSIVE_HINTS = [
  'was',
  'were',
  'been',
  'being',
  'is being',
  'has been',
  'have been',
  'will be',
  'by the',
];

export function passiveHits(text: string): string[] {
  const clean = stripMarkdown(text);
  const hits: string[] = [];
  const sentences = clean.split(/[.!?]+(?:\s|$)/).map((s) => s.trim());
  for (const sentence of sentences) {
    const lower = ` ${sentence.toLowerCase()} `;
    const hasBe = /\b(was|were|been|being|is|are)\b/.test(lower);
    const hasPast = /\b\w+ed\b/.test(lower);
    const hasBy = /\bby\b/.test(lower);
    if (hasBe && hasPast && (hasBy || PASSIVE_HINTS.some((h) => lower.includes(` ${h} `)))) {
      hits.push(sentence);
    }
  }
  return hits.slice(0, 5);
}

export function repeatedWords(text: string, min = 4): { word: string; count: number }[] {
  const stop = new Set(
    'the and for with that this from have has been will you your our their but not are they them then than into out about would could should there here what when where which while who how all any can one more most some such only very just also into over'.split(
      ' ',
    ),
  );
  const counts = new Map<string, number>();
  for (const raw of stripMarkdown(text).toLowerCase().match(/[a-z']{4,}/g) ?? []) {
    if (stop.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= min)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export interface StructureFinding {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export function structureCheck(text: string): StructureFinding[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const first = paragraphs[0] ?? '';
  const last = paragraphs[paragraphs.length - 1] ?? '';
  const words = wordCount(text);
  const hasHeading = /^#{1,6}\s+/m.test(text);
  const questions = (text.match(/\?/g) ?? []).length;
  const numbers = (text.match(/\b\d[\d.,%]*\b/g) ?? []).length;

  const openers = first.slice(0, 220);
  const hooks =
    /\?/.test(openers) ||
    /\b(imagine|picture|last (week|year|month)|once|nobody|everyone|i used to|here is|this is)\b/i.test(openers);

  return [
    {
      id: 'hook',
      label: 'Opening hook',
      ok: hooks,
      detail: hooks
        ? 'Your first lines reach for the audience with a question, a scene or a reversal.'
        : 'Try opening with a question, a specific scene, or a reversal of expectation.',
    },
    {
      id: 'structure',
      label: 'Signposted structure',
      ok: hasHeading || paragraphs.length >= 4,
      detail: hasHeading
        ? 'Headings give the audience a map of where you are going.'
        : 'Add a heading or two so listeners can follow your argument.',
    },
    {
      id: 'evidence',
      label: 'Concrete evidence',
      ok: numbers >= 2,
      detail:
        numbers >= 2
          ? `You use ${numbers} concrete figures — specifics are what people repeat afterwards.`
          : 'Add at least one or two concrete numbers; claims without figures are forgettable.',
    },
    {
      id: 'rhetoric',
      label: 'Audience questions',
      ok: questions >= 1,
      detail: questions >= 1
        ? `You ask ${questions} question${questions > 1 ? 's' : ''} — good, questions wake a room up.`
        : 'Ask the audience a question at least once; it re-engages drifting attention.',
    },
    {
      id: 'close',
      label: 'Landing',
      ok: last.length > 40 && !/^(thanks|thank you)\b/i.test(last),
      detail:
        last.length > 40
          ? 'You finish on a real closing thought rather than trailing off.'
          : 'Write a deliberate final paragraph — the last thing you say is what survives.',
    },
    {
      id: 'length',
      label: 'Length',
      ok: words >= 120 && words <= 1400,
      detail:
        words < 120
          ? `Only ${words} words so far — most talks need at least 150 to make one full point.`
          : words > 1400
            ? `${words} words is a long read (about ${readingMinutes(text)} min) — consider trimming.`
            : `${words} words · about ${readingMinutes(text)} minute${readingMinutes(text) === 1 ? '' : 's'} aloud.`,
    },
  ];
}

export interface TextStats {
  words: number;
  characters: number;
  sentences: number;
  paragraphs: number;
  minutes: number;
  seconds: number;
  ease: number;
  level: string;
  fillers: { word: string; count: number }[];
  long: string[];
  passive: string[];
  repeats: { word: string; count: number }[];
  structure: StructureFinding[];
}

export function analyse(text: string): TextStats {
  return {
    words: wordCount(text),
    characters: characterCount(text),
    sentences: sentenceCount(text),
    paragraphs: paragraphCount(text),
    minutes: readingMinutes(text),
    seconds: speakSeconds(text),
    ease: fleschReadingEase(text),
    level: readingLevel(fleschReadingEase(text)),
    fillers: findFillers(text),
    long: longSentences(text),
    passive: passiveHits(text),
    repeats: repeatedWords(text),
    structure: structureCheck(text),
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(Math.abs(totalSeconds) / 60);
  const s = Math.abs(totalSeconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
