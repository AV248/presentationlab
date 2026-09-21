import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Loader2, X } from 'lucide-react';
import { lookup, type Entry } from '../services/dictionary';

/**
 * The word lens.
 *
 * While you read, any uncommon word is quietly underlined. Tap it and the
 * meaning arrives in a small card anchored to the word — no page change, no
 * new tab, no losing your place in the sentence.
 *
 * The lens is a single shared popover driven by whatever word was last
 * clicked, so a page with two hundred marked words still only ever mounts
 * one of these.
 */

interface LensState {
  word: string;
  x: number;
  y: number;
}

export function useWordLens() {
  const [state, setState] = useState<LensState | null>(null);

  const open = useCallback((word: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setState({
      word,
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.bottom + window.scrollY,
    });
  }, []);

  const close = useCallback(() => setState(null), []);

  return { state, open, close };
}

export function WordLensCard({
  word,
  x,
  y,
  onClose,
}: {
  word: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    setEntry(undefined);
    lookup(word).then((found) => {
      if (alive) setEntry(found);
    });
    return () => {
      alive = false;
    };
  }, [word]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // A frame's delay, or the click that opened the lens closes it again.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onPointer), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose]);

  // Keep the card on screen on narrow phones.
  const width = 300;
  const half = width / 2;
  const viewport = typeof window === 'undefined' ? 360 : window.innerWidth;
  const left = Math.max(12 + half, Math.min(x, viewport - 12 - half));

  return (
    <div
      ref={cardRef}
      className="pb-lens"
      role="dialog"
      aria-label={`Meaning of ${word}`}
      style={{ left, top: y + 8, width }}
    >
      <div className="pb-lens-head">
        <BookOpen size={14} aria-hidden="true" />
        <strong className="pb-lens-word">{entry?.word ?? word}</strong>
        {entry?.phonetic && <span className="pb-lens-phonetic">{entry.phonetic}</span>}
        <button type="button" className="pb-lens-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      {entry === undefined && (
        <p className="pb-lens-status">
          <Loader2 size={13} className="pb-spin" aria-hidden="true" /> Looking it up…
        </p>
      )}

      {entry === null && (
        <p className="pb-lens-status">
          No entry for this one. It may be a name, a place, or a word the dictionary has not caught
          up with.
        </p>
      )}

      {entry && (
        <>
          <ol className="pb-lens-senses">
            {entry.senses.slice(0, 3).map((sense, index) => (
              <li key={index}>
                {sense.partOfSpeech && <em className="pb-lens-pos">{sense.partOfSpeech}</em>}{' '}
                {sense.definition}
                {sense.example && <span className="pb-lens-example">“{sense.example}”</span>}
              </li>
            ))}
          </ol>

          {entry.synonyms.length > 0 && (
            <p className="pb-lens-related">
              <span className="pb-lens-label">Close to</span> {entry.synonyms.slice(0, 5).join(', ')}
            </p>
          )}
          {entry.antonyms.length > 0 && (
            <p className="pb-lens-related">
              <span className="pb-lens-label">Opposite</span> {entry.antonyms.slice(0, 4).join(', ')}
            </p>
          )}

          <p className="pb-lens-source">
            {entry.source === 'offline' ? (
              'From the built-in speaking dictionary — works offline.'
            ) : (
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer noopener">
                Wiktionary <ExternalLink size={10} />
              </a>
            )}
          </p>
        </>
      )}
    </div>
  );
}
