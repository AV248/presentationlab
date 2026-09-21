import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, Repeat2, Sparkles } from 'lucide-react';
import { alternativesFor, lookup, type Alternative, type Entry } from '../services/dictionary';

/**
 * The word smith.
 *
 * While you write, it watches the word under your cursor and offers
 * stronger, shorter or more precise alternatives — one click swaps it in.
 * It only speaks up for words worth reconsidering (four letters or more,
 * not a function word), and it never interrupts: no popups over the text,
 * no autocomplete stealing your keystrokes. It is a shelf beside the desk,
 * not a hand on your pen.
 */

/** Function words are not worth a thesaurus trip. */
const SKIP = new Set(
  `the and for with that this from have has had was were been being are you your our their they them
  then than into out about who which what when where why how will would could should may might must
  not but all any some such only very just also its it's here there each both more most less least
  over under after before while until since because although though upon onto off down
  i me my we us he she him her his hers do does did done get got go goes going`.split(/\s+/),
);

export interface WordSmithProps {
  /** The full text being edited. */
  value: string;
  /** Caret position inside `value`. */
  caret: number;
  /** Replace the word under the caret with a new one. */
  onReplace: (from: number, to: number, replacement: string) => void;
  /** Rendered in a narrow rail; keeps the control compact. */
  compact?: boolean;
}

interface Target {
  word: string;
  start: number;
  end: number;
}

/** Find the word the caret is sitting in or just after. */
export function wordAtCaret(text: string, caret: number): Target | null {
  if (!text) return null;
  const position = Math.max(0, Math.min(caret, text.length));
  const isWordChar = (ch: string) => /[A-Za-z'’-]/.test(ch);

  let start = position;
  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  let end = position;
  while (end < text.length && isWordChar(text[end])) end += 1;

  const word = text.slice(start, end).replace(/^['’-]+|['’-]+$/g, '');
  if (word.length < 4) return null;
  if (SKIP.has(word.toLowerCase())) return null;
  if (!/^[A-Za-z]/.test(word)) return null;
  return { word, start, end };
}

export function WordSmith({ value, caret, onReplace, compact = false }: WordSmithProps) {
  const target = useMemo(() => wordAtCaret(value, caret), [value, caret]);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!target) {
      setAlternatives([]);
      setEntry(null);
      return undefined;
    }

    const token = (requestRef.current += 1);
    const word = target.word.toLowerCase();
    setLoading(true);

    // Wait for a pause in typing: nobody wants a request per keystroke.
    const timer = window.setTimeout(() => {
      void Promise.all([alternativesFor(word, compact ? 6 : 9), lookup(word)]).then(
        ([found, definition]) => {
          if (requestRef.current !== token) return;
          setAlternatives(found);
          setEntry(definition);
          setLoading(false);
        },
      );
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [target, compact]);

  if (!target) {
    return (
      <div className="pb-smith pb-smith-empty">
        <Sparkles size={15} aria-hidden="true" />
        <p>
          Put your cursor on a word and its alternatives appear here — with what it actually means,
          so you swap it for the right one and not just a longer one.
        </p>
      </div>
    );
  }

  const casedLike = (replacement: string) => {
    const original = target.word;
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
    return replacement;
  };

  return (
    <div className="pb-smith">
      <div className="pb-smith-head">
        <Repeat2 size={14} aria-hidden="true" />
        <strong>{target.word}</strong>
        {entry?.phonetic && <span className="pb-smith-phonetic">{entry.phonetic}</span>}
        {loading && <Loader2 size={13} className="pb-spin" aria-hidden="true" />}
      </div>

      {entry?.senses[0] && (
        <p className="pb-smith-sense">
          {entry.senses[0].partOfSpeech && <em>{entry.senses[0].partOfSpeech}</em>}{' '}
          {entry.senses[0].definition}
        </p>
      )}

      {alternatives.length > 0 ? (
        <>
          <span className="pb-smith-label">Instead, try</span>
          <ul className="pb-smith-list">
            {alternatives.map((alternative) => (
              <li key={alternative.word}>
                <button
                  type="button"
                  className="pb-smith-swap"
                  onClick={() => onReplace(target.start, target.end, casedLike(alternative.word))}
                  title={`Replace “${target.word}” with “${alternative.word}”`}
                >
                  <span className="pb-smith-word">{alternative.word}</span>
                  <span className="pb-smith-syll">
                    {alternative.syllables} syl
                    <ArrowRight size={11} aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="pb-smith-note">
            Shorter words with fewer syllables land harder when spoken aloud.
          </p>
        </>
      ) : (
        !loading && (
          <p className="pb-smith-note">
            No close alternatives for this one — which often means it is already the exact word.
          </p>
        )
      )}
    </div>
  );
}
