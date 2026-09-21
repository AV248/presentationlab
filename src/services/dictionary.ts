/**
 * The dictionary.
 *
 * Two jobs, one service:
 *   • while you read  — the meaning of an uncommon word, on tap
 *   • while you write — stronger alternatives for the word under the cursor
 *
 * Definitions come from the Free Dictionary API (dictionaryapi.dev, built on
 * Wiktionary), alternatives from Datamuse. Both are free, keyless and
 * CORS-open. Every lookup is cached in memory and in localStorage, so the
 * same word is never fetched twice, and a bundled offline core answers the
 * most common speaking vocabulary with no network at all.
 *
 * Nothing here ever blocks the UI: if the network is gone, the offline core
 * answers what it can and the rest simply says so.
 */

export interface Sense {
  partOfSpeech: string;
  definition: string;
  example?: string;
}

export interface Entry {
  word: string;
  phonetic?: string;
  senses: Sense[];
  synonyms: string[];
  antonyms: string[];
  source: 'offline' | 'wiktionary';
  sourceUrl?: string;
}

export interface Alternative {
  word: string;
  /** Datamuse relevance score, normalised 0–1. */
  score: number;
  /** Rough syllable count, used to keep suggestions speakable. */
  syllables: number;
}

/* ------------------------------------------------------------------ */
/* offline core                                                        */
/* ------------------------------------------------------------------ */

/**
 * A small, hand-written core of words that actually come up when people
 * write and read speeches. This is not a dictionary dump — it is the
 * vocabulary this app is about, so the feature works on a plane.
 */
const OFFLINE: Record<string, Omit<Entry, 'word' | 'source'>> = {
  eloquent: {
    phonetic: '/ˈɛləkwənt/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Fluent and persuasive in speaking or writing.',
        example: 'An eloquent speaker holds a room without raising their voice.',
      },
    ],
    synonyms: ['articulate', 'fluent', 'expressive', 'persuasive'],
    antonyms: ['inarticulate', 'halting'],
  },
  rhetoric: {
    phonetic: '/ˈrɛtərɪk/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The art of using language effectively and persuasively.',
        example: 'Classical rhetoric gave us ethos, pathos and logos.',
      },
    ],
    synonyms: ['oratory', 'persuasion', 'eloquence'],
    antonyms: [],
  },
  cadence: {
    phonetic: '/ˈkeɪd(ə)ns/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The rhythm and rise and fall of the voice in speech.',
        example: 'Her cadence slowed on the last line, and the room went quiet.',
      },
    ],
    synonyms: ['rhythm', 'lilt', 'intonation', 'metre'],
    antonyms: ['monotone'],
  },
  anecdote: {
    phonetic: '/ˈanɪkdəʊt/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'A short, true story told to illustrate a point.',
        example: 'One anecdote is worth three statistics.',
      },
    ],
    synonyms: ['story', 'account', 'episode'],
    antonyms: [],
  },
  poise: {
    phonetic: '/pɔɪz/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'Graceful, composed self-assurance under pressure.',
        example: 'Poise is not the absence of nerves; it is nerves with somewhere to go.',
      },
    ],
    synonyms: ['composure', 'self-possession', 'assurance'],
    antonyms: ['awkwardness', 'panic'],
  },
  succinct: {
    phonetic: '/səkˈsɪŋ(k)t/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Expressed clearly in very few words.',
        example: 'Be succinct: the shortest true sentence wins.',
      },
    ],
    synonyms: ['concise', 'terse', 'pithy', 'brief'],
    antonyms: ['rambling', 'verbose'],
  },
  verbose: {
    phonetic: '/vəˈbəʊs/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Using more words than are needed.',
        example: 'The verbose paragraph said one thing four times.',
      },
    ],
    synonyms: ['wordy', 'long-winded', 'prolix'],
    antonyms: ['succinct', 'concise'],
  },
  candour: {
    phonetic: '/ˈkandə/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'Honesty and directness, especially when it costs something.',
        example: 'The candour of admitting the mistake bought back the room.',
      },
    ],
    synonyms: ['frankness', 'honesty', 'openness'],
    antonyms: ['evasion'],
  },
  conviction: {
    phonetic: '/kənˈvɪkʃ(ə)n/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'A firmly held belief, or the quality of showing one.',
        example: 'Say it with conviction or cut the line entirely.',
      },
    ],
    synonyms: ['belief', 'certainty', 'assurance'],
    antonyms: ['doubt', 'hesitancy'],
  },
  nuance: {
    phonetic: '/ˈnjuːɑːns/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'A subtle difference in meaning, tone or feeling.',
        example: 'The nuance between "we failed" and "I failed" is the whole apology.',
      },
    ],
    synonyms: ['subtlety', 'shade', 'distinction'],
    antonyms: [],
  },
  gravitas: {
    phonetic: '/ˈɡravɪtas/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'Seriousness and weight of manner that earns attention.',
        example: 'Gravitas is mostly pace: slow down and you sound like you mean it.',
      },
    ],
    synonyms: ['dignity', 'weight', 'seriousness'],
    antonyms: ['flippancy'],
  },
  articulate: {
    phonetic: '/ɑːˈtɪkjʊlət/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Able to express thoughts clearly and effectively.',
      },
      {
        partOfSpeech: 'verb',
        definition: 'To put a thought into clear words.',
        example: 'She articulated what the whole team had been circling for a month.',
      },
    ],
    synonyms: ['eloquent', 'lucid', 'coherent'],
    antonyms: ['mumbling', 'incoherent'],
  },
  resonate: {
    phonetic: '/ˈrɛzəneɪt/',
    senses: [
      {
        partOfSpeech: 'verb',
        definition: 'To produce a feeling of shared recognition in someone.',
        example: 'The line about her father resonated more than the data did.',
      },
    ],
    synonyms: ['strike a chord', 'connect', 'land'],
    antonyms: ['fall flat'],
  },
  pivotal: {
    phonetic: '/ˈpɪvət(ə)l/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Of crucial importance; the point everything turns on.',
      },
    ],
    synonyms: ['crucial', 'decisive', 'central'],
    antonyms: ['minor', 'incidental'],
  },
  reticent: {
    phonetic: '/ˈrɛtɪs(ə)nt/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Reluctant to speak freely; holding something back.',
      },
    ],
    synonyms: ['reserved', 'guarded', 'taciturn'],
    antonyms: ['forthcoming', 'candid'],
  },
  oratory: {
    phonetic: '/ˈɒrət(ə)ri/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'Formal public speaking, especially done well.',
      },
    ],
    synonyms: ['rhetoric', 'public speaking', 'declamation'],
    antonyms: [],
  },
  peroration: {
    phonetic: '/ˌpɛrəˈreɪʃ(ə)n/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The closing section of a speech, where it gathers and lands.',
        example: 'Write the peroration first; everything else is the walk towards it.',
      },
    ],
    synonyms: ['conclusion', 'close', 'finale'],
    antonyms: ['exordium'],
  },
  exordium: {
    phonetic: '/ɛɡˈzɔːdɪəm/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The opening of a speech, whose only job is to earn the next minute.',
      },
    ],
    synonyms: ['opening', 'introduction', 'preamble'],
    antonyms: ['peroration'],
  },
  ethos: {
    phonetic: '/ˈiːθɒs/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'An appeal based on the speaker’s credibility and character.',
      },
    ],
    synonyms: ['credibility', 'character', 'standing'],
    antonyms: [],
  },
  pathos: {
    phonetic: '/ˈpeɪθɒs/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'An appeal to the audience’s emotions.',
      },
    ],
    synonyms: ['feeling', 'emotion', 'poignancy'],
    antonyms: [],
  },
  logos: {
    phonetic: '/ˈlɒɡɒs/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'An appeal to reason, evidence and logical structure.',
      },
    ],
    synonyms: ['reason', 'logic', 'argument'],
    antonyms: [],
  },
  anaphora: {
    phonetic: '/əˈnafərə/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition:
          'Repeating the same words at the start of successive clauses, for rhythm and force.',
        example: '"We shall fight on the beaches, we shall fight on the landing grounds…"',
      },
    ],
    synonyms: ['repetition'],
    antonyms: [],
  },
  cogent: {
    phonetic: '/ˈkəʊdʒ(ə)nt/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Clear, logical and convincing.',
      },
    ],
    synonyms: ['compelling', 'persuasive', 'convincing'],
    antonyms: ['weak', 'unconvincing'],
  },
  salient: {
    phonetic: '/ˈseɪlɪənt/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Most noticeable or important; the thing that stands out.',
      },
    ],
    synonyms: ['key', 'prominent', 'notable'],
    antonyms: ['minor'],
  },
  tenacity: {
    phonetic: '/tɪˈnasɪti/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The quality of holding on and not letting go.',
      },
    ],
    synonyms: ['persistence', 'doggedness', 'resolve'],
    antonyms: ['irresolution'],
  },
  humility: {
    phonetic: '/hjuːˈmɪlɪti/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'An honest, unexaggerated view of your own importance.',
      },
    ],
    synonyms: ['modesty', 'humbleness'],
    antonyms: ['arrogance', 'hubris'],
  },
  hubris: {
    phonetic: '/ˈhjuːbrɪs/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'Excessive pride, of the kind that precedes a fall.',
      },
    ],
    synonyms: ['arrogance', 'conceit'],
    antonyms: ['humility'],
  },
  empathy: {
    phonetic: '/ˈɛmpəθi/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The ability to feel what another person is feeling.',
      },
    ],
    synonyms: ['understanding', 'compassion', 'fellow feeling'],
    antonyms: ['indifference'],
  },
  discipline: {
    phonetic: '/ˈdɪsɪplɪn/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'Doing the thing on the days you do not feel like it.',
      },
    ],
    synonyms: ['self-control', 'regimen', 'rigour'],
    antonyms: ['indulgence'],
  },
  deliberate: {
    phonetic: '/dɪˈlɪb(ə)rət/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Done consciously and on purpose; unhurried and considered.',
        example: 'Deliberate practice is practice with a target and a correction.',
      },
    ],
    synonyms: ['intentional', 'considered', 'measured'],
    antonyms: ['accidental', 'hasty'],
  },
  candid: {
    phonetic: '/ˈkandɪd/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Truthful and straightforward, even when it is uncomfortable.',
      },
    ],
    synonyms: ['frank', 'honest', 'direct'],
    antonyms: ['guarded', 'evasive'],
  },
  visceral: {
    phonetic: '/ˈvɪs(ə)r(ə)l/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Felt in the body rather than reasoned; deep and instinctive.',
      },
    ],
    synonyms: ['instinctive', 'gut', 'primal'],
    antonyms: ['intellectual'],
  },
  ubiquitous: {
    phonetic: '/juːˈbɪkwɪtəs/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Present everywhere at once.',
      },
    ],
    synonyms: ['omnipresent', 'pervasive', 'universal'],
    antonyms: ['rare', 'scarce'],
  },
  paradigm: {
    phonetic: '/ˈparədʌɪm/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The whole pattern of assumptions a field works inside.',
      },
    ],
    synonyms: ['model', 'framework', 'pattern'],
    antonyms: [],
  },
  catalyst: {
    phonetic: '/ˈkat(ə)lɪst/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'The thing that makes a change happen faster than it would alone.',
      },
    ],
    synonyms: ['spark', 'trigger', 'impetus'],
    antonyms: ['inhibitor'],
  },
  ephemeral: {
    phonetic: '/ɪˈfɛm(ə)r(ə)l/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Lasting a very short time.',
      },
    ],
    synonyms: ['fleeting', 'transient', 'short-lived'],
    antonyms: ['enduring', 'permanent'],
  },
  meticulous: {
    phonetic: '/mɪˈtɪkjʊləs/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Showing great attention to detail; very careful.',
      },
    ],
    synonyms: ['thorough', 'painstaking', 'scrupulous'],
    antonyms: ['careless', 'slapdash'],
  },
  pragmatic: {
    phonetic: '/praɡˈmatɪk/',
    senses: [
      {
        partOfSpeech: 'adjective',
        definition: 'Dealing with things sensibly and practically rather than ideally.',
      },
    ],
    synonyms: ['practical', 'realistic', 'level-headed'],
    antonyms: ['idealistic', 'dogmatic'],
  },
  scrutiny: {
    phonetic: '/ˈskruːtɪni/',
    senses: [
      {
        partOfSpeech: 'noun',
        definition: 'Close, critical examination.',
      },
    ],
    synonyms: ['examination', 'inspection', 'study'],
    antonyms: ['glance'],
  },
  galvanise: {
    phonetic: '/ˈɡalv(ə)nʌɪz/',
    senses: [
      {
        partOfSpeech: 'verb',
        definition: 'To shock or excite a group into doing something.',
      },
    ],
    synonyms: ['spur', 'rouse', 'mobilise'],
    antonyms: ['discourage'],
  },
};

/* ------------------------------------------------------------------ */
/* the uncommon-word detector                                          */
/* ------------------------------------------------------------------ */

/**
 * The 700 or so words that make up most ordinary English. Anything outside
 * this list, longer than seven letters, is treated as "worth explaining"
 * when someone is reading. Kept deliberately small and inspectable: a real
 * frequency table would be a megabyte for a marginal gain.
 */
const COMMON = new Set(
  `the be to of and a in that have i it for not on with he as you do at this but his by from they we
  say her she or an will my one all would there their what so up out if about who get which go me when
  make can like time no just him know take people into year your good some could them see other than
  then now look only come its over think also back after use two how our work first well way even new
  want because any these give day most us is are was were been being has had did does doing said says
  went gone made making take taken took very much many more less little own same such through between
  under above before during while where why here again ever never always often sometimes every each
  another other something nothing anything everything someone anyone everyone nobody thing things
  place places part parts kind sort feel felt felt find found keep kept let put set seem seemed turn
  turned start started stop stopped help helped talk talked speak spoke spoken tell told ask asked
  write wrote written read reading call called try tried need needed leave left move moved live lived
  believe believed hold held bring brought happen happened must might shall should may can cannot
  around down off out up upon against without within along across behind beyond near next last long
  short high low big small large great little young old new right left true false real whole half
  best better worse worst early late soon still yet almost enough quite rather too also just only
  really actually simply perhaps maybe however therefore because although though unless until since
  whether either neither both few several many much most least more own sure certain clear plain
  simple hard easy free full empty open closed same different able ready willing happy sad angry
  afraid tired strong weak fast slow quiet loud bright dark warm cold hot cool light heavy soft
  house home room door window wall floor water fire earth air sun moon star sky sea river tree
  hand head eye face heart mind body life death time day night week month year hour minute second
  man woman child children friend family mother father brother sister son daughter people person
  world country city town street road school book word words story name number money job team
  company business market money price cost value power change growth idea ideas plan question
  answer problem answer reason result point line group system state case fact truth lie love hate
  hope fear joy pain work rest play game music voice sound word language english`
    .split(/\s+/)
    .filter(Boolean),
);

/** Suffix-stripped root, so "resonated" matches "resonate". */
function root(word: string): string {
  const w = word.toLowerCase();
  for (const suffix of ['ations', 'ation', 'ingly', 'ments', 'ment', 'ness', 'ing', 'ies', 'ied', 'ed', 'es', 's', 'ly']) {
    if (w.length - suffix.length >= 4 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}

/** Is this a word a general reader might want explained? */
export function isUncommon(word: string): boolean {
  const clean = word.toLowerCase().replace(/[^a-z-]/g, '');
  if (clean.length < 7) return false;
  if (COMMON.has(clean) || COMMON.has(root(clean))) return false;
  // Proper nouns are names, not vocabulary.
  if (/^[A-Z]/.test(word) && word !== word.toUpperCase()) return false;
  return true;
}

/** Every uncommon word in a passage, deduplicated, in order of appearance. */
export function uncommonWords(text: string, limit = 24): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const raw of text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (isUncommon(raw)) found.push(raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''));
    if (found.length >= limit) break;
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* caching                                                             */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'pb.dictionary.v1';
const MAX_CACHED = 400;

interface CacheShape {
  entries: Record<string, Entry | null>;
  alternatives: Record<string, Alternative[]>;
}

let memory: CacheShape = { entries: {}, alternatives: {} };
let hydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheShape;
      memory = {
        entries: parsed.entries ?? {},
        alternatives: parsed.alternatives ?? {},
      };
    }
  } catch {
    /* a corrupt cache is not worth a crash */
  }
}

let writeTimer: number | null = null;
function persist() {
  if (typeof window === 'undefined') return;
  if (writeTimer) window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    try {
      const trim = <T>(record: Record<string, T>) =>
        Object.fromEntries(Object.entries(record).slice(-MAX_CACHED));
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ entries: trim(memory.entries), alternatives: trim(memory.alternatives) }),
      );
    } catch {
      /* storage full or blocked — the in-memory cache still works */
    }
  }, 800);
}

/** Forget every cached lookup (offered in the Control Room). */
export function clearDictionaryCache() {
  memory = { entries: {}, alternatives: {} };
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function dictionaryCacheSize(): number {
  hydrate();
  return Object.keys(memory.entries).length + Object.keys(memory.alternatives).length;
}

/* ------------------------------------------------------------------ */
/* lookups                                                             */
/* ------------------------------------------------------------------ */

const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DATAMUSE = 'https://api.datamuse.com/words';

/** Give up quickly: a definition is a nicety, never a blocker. */
async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface ApiEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string; example?: string; synonyms?: string[]; antonyms?: string[] }[];
    synonyms?: string[];
    antonyms?: string[];
  }[];
  sourceUrls?: string[];
}

function fromOffline(word: string): Entry | null {
  const key = word.toLowerCase();
  const hit = OFFLINE[key] ?? OFFLINE[root(key)];
  if (!hit) return null;
  return { word: key, source: 'offline', ...hit };
}

/**
 * Look up one word. Answers instantly from the offline core or the cache
 * where possible, otherwise asks Wiktionary via dictionaryapi.dev.
 * Returns null when the word genuinely has no entry.
 */
export async function lookup(word: string): Promise<Entry | null> {
  hydrate();
  const key = word.toLowerCase().replace(/[^a-z'-]/g, '');
  if (!key) return null;

  if (key in memory.entries) return memory.entries[key];

  const offline = fromOffline(key);
  if (offline) {
    memory.entries[key] = offline;
    return offline;
  }

  const payload = await fetchJson<ApiEntry[]>(`${DICT_API}/${encodeURIComponent(key)}`);
  if (!payload || !Array.isArray(payload) || !payload.length) {
    // Try the stem before giving up: "resonated" → "resonate".
    const stem = root(key);
    if (stem !== key) {
      const stemmed = await lookup(stem);
      if (stemmed) {
        memory.entries[key] = stemmed;
        persist();
        return stemmed;
      }
    }
    memory.entries[key] = null;
    persist();
    return null;
  }

  const senses: Sense[] = [];
  const synonyms = new Set<string>();
  const antonyms = new Set<string>();

  for (const item of payload) {
    for (const meaning of item.meanings ?? []) {
      for (const synonym of meaning.synonyms ?? []) synonyms.add(synonym);
      for (const antonym of meaning.antonyms ?? []) antonyms.add(antonym);
      for (const definition of meaning.definitions ?? []) {
        for (const synonym of definition.synonyms ?? []) synonyms.add(synonym);
        for (const antonym of definition.antonyms ?? []) antonyms.add(antonym);
        if (definition.definition && senses.length < 4) {
          senses.push({
            partOfSpeech: meaning.partOfSpeech ?? '',
            definition: definition.definition,
            example: definition.example,
          });
        }
      }
    }
  }

  if (!senses.length) {
    memory.entries[key] = null;
    persist();
    return null;
  }

  const first = payload[0];
  const entry: Entry = {
    word: first.word || key,
    phonetic: first.phonetic || first.phonetics?.find((p) => p.text)?.text,
    senses,
    synonyms: [...synonyms].slice(0, 8),
    antonyms: [...antonyms].slice(0, 6),
    source: 'wiktionary',
    sourceUrl:
      first.sourceUrls?.[0] ?? `https://en.wiktionary.org/wiki/${encodeURIComponent(key)}`,
  };

  memory.entries[key] = entry;
  persist();
  return entry;
}

interface DatamuseWord {
  word: string;
  score?: number;
  numSyllables?: number;
}

/**
 * Stronger, more precise alternatives for a word you just typed.
 * Datamuse's `ml` (means-like) gives real synonyms rather than a thesaurus
 * dump; we filter out multi-word phrases and anything hard to say.
 */
export async function alternativesFor(word: string, limit = 8): Promise<Alternative[]> {
  hydrate();
  const key = word.toLowerCase().replace(/[^a-z'-]/g, '');
  if (key.length < 3) return [];

  if (key in memory.alternatives) return memory.alternatives[key].slice(0, limit);

  const payload = await fetchJson<DatamuseWord[]>(
    `${DATAMUSE}?ml=${encodeURIComponent(key)}&md=s&max=24`,
  );

  let results: Alternative[];
  if (payload?.length) {
    const top = payload[0]?.score ?? 1;
    results = payload
      .filter((item) => item.word && item.word !== key && !item.word.includes(' '))
      .map((item) => ({
        word: item.word,
        score: top > 0 ? Math.min(1, (item.score ?? 0) / top) : 0,
        syllables: item.numSyllables ?? Math.max(1, Math.ceil(item.word.length / 3)),
      }))
      .slice(0, 12);
  } else {
    // Offline fallback: the core's own synonym lists.
    const offline = fromOffline(key);
    results = (offline?.synonyms ?? []).map((synonym) => ({
      word: synonym,
      score: 0.8,
      syllables: Math.max(1, Math.ceil(synonym.length / 3)),
    }));
  }

  memory.alternatives[key] = results;
  persist();
  return results.slice(0, limit);
}

/** Every word the offline core knows — used by the Control Room and tests. */
export const OFFLINE_WORDS = Object.keys(OFFLINE);
