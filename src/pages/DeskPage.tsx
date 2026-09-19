import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookMarked,
  Feather,
  Globe,
  Quote,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useLibrary } from '../store/library';
import { useSpeeches } from '../hooks/useCollection';
import { useUi } from '../store/ui';
import { MILESTONES, LETTER_PROMPTS, pick } from '../lib/heart';
import { formatDate } from '../lib/text';

type Tab = 'lines' | 'notes' | 'letters' | 'marks' | 'shelf';

/**
 * Your desk: the things you kept.
 * Lines that stopped you, notes in the margin, letters to yourself, and the
 * small firsts worth remembering.
 */
export function DeskPage() {
  const savedLines = useLibrary((s) => s.savedLines);
  const marginNotes = useLibrary((s) => s.marginNotes);
  const letters = useLibrary((s) => s.letters);
  const milestones = useLibrary((s) => s.milestones);
  const shelf = useLibrary((s) => s.shelf);
  const removeLine = useLibrary((s) => s.removeLine);
  const removeMarginNote = useLibrary((s) => s.removeMarginNote);
  const removeLetter = useLibrary((s) => s.removeLetter);
  const removeFromShelf = useLibrary((s) => s.removeFromShelf);
  const bookmarks = useLibrary((s) => s.bookmarks);
  const items = useSpeeches();
  const toast = useUi((s) => s.toast);

  const [tab, setTab] = useState<Tab>('lines');
  const [prompt] = useState(() => pick(LETTER_PROMPTS));

  const bookmarked = useMemo(
    () => items.filter((item) => bookmarks.includes(item.id)),
    [bookmarks, items],
  );

  const earned = MILESTONES.filter((milestone) => milestones[milestone.id as keyof typeof milestones]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'lines', label: 'Lines kept', count: savedLines.length },
    { id: 'notes', label: 'Margin notes', count: marginNotes.length },
    { id: 'letters', label: 'Letters', count: letters.length },
    { id: 'marks', label: 'Firsts', count: earned.length },
    { id: 'shelf', label: 'Web shelf', count: shelf.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 32px)' }}>
        <span className="pb-eyebrow">Your desk</span>
        <h1 style={{ fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', margin: '10px 0 10px' }}>
          The things you kept
        </h1>
        <p className="pb-soft" style={{ maxInlineSize: '54ch', lineHeight: 1.7 }}>
          Reading is easy to forget. This is what you decided was worth holding on to — a sentence
          here, an argument with a page there, a note to yourself on the day it felt hard.
        </p>
        {savedLines.length > 0 && (
          <blockquote
            className="pb-prose"
            style={{
              marginTop: 20,
              padding: '14px 18px',
              borderLeft: '2px solid var(--c-accent)',
              fontStyle: 'italic',
              fontSize: '1.02rem',
            }}
          >
            “{savedLines[0].text}”
            <footer className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 8, fontStyle: 'normal' }}>
              — {savedLines[0].author}, <em>{savedLines[0].speechTitle}</em>
            </footer>
          </blockquote>
        )}
      </section>

      <div className="pb-well" style={{ display: 'flex', gap: 4, padding: 4, overflowX: 'auto' }}>
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`pb-btn pb-btn-sm ${tab === entry.id ? '' : 'pb-btn-ghost'}`}
            style={{ background: tab === entry.id ? 'var(--c-accent-soft)' : undefined, whiteSpace: 'nowrap' }}
          >
            {entry.label} <span style={{ opacity: 0.55 }}>{entry.count}</span>
          </button>
        ))}
      </div>

      {tab === 'lines' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {savedLines.length === 0 ? (
            <Empty
              icon={Quote}
              title="No lines kept yet"
              body="While reading, select a sentence and press the quote-mark button. It lands here, with the speech it came from."
            />
          ) : (
            savedLines.map((line) => (
              <article key={line.id} className="pb-panel" style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: '1rem', lineHeight: 1.7, fontStyle: 'italic' }}>“{line.text}”</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                  <Link
                    to={`/read/${encodeURIComponent(line.speechId)}`}
                    className="pb-muted"
                    style={{ fontSize: '0.78rem', flex: 1 }}
                  >
                    {line.speechTitle} · {line.author} · kept {formatDate(line.savedAt)}
                  </Link>
                  <button
                    type="button"
                    className="pb-icon-btn"
                    onClick={() => removeLine(line.id)}
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'notes' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {marginNotes.length === 0 ? (
            <Empty
              icon={StickyNote}
              title="The margins are clean"
              body="Open any speech and press the note button. Argue with it, agree with it, mark the bit you want to steal."
            />
          ) : (
            marginNotes.map((note) => (
              <article key={note.id} className="pb-panel" style={{ padding: '14px 18px' }}>
                <p className="pb-margin-note">{note.text}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                  <Link to={`/read/${encodeURIComponent(note.speechId)}`} className="pb-muted" style={{ fontSize: '0.78rem', flex: 1 }}>
                    Written {formatDate(note.at)}
                  </Link>
                  <button type="button" className="pb-icon-btn" onClick={() => removeMarginNote(note.id)} aria-label="Remove note">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'letters' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {letters.length === 0 ? (
            <Empty
              icon={Feather}
              title="No letters yet"
              body="Finish a rehearsal and Presentation Buddy will offer to write one to you. The next one might start with: “"
              tail={`${prompt}”`}
            />
          ) : (
            letters.map((letter) => (
              <article key={letter.id} className="pb-panel" style={{ padding: '14px 18px' }}>
                <p className="pb-margin-note">{letter.text}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                  <span className="pb-muted" style={{ fontSize: '0.78rem', flex: 1 }}>
                    After rehearsing {letter.speechTitle} · {formatDate(letter.at)}
                  </span>
                  <button type="button" className="pb-icon-btn" onClick={() => removeLetter(letter.id)} aria-label="Remove letter">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'marks' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="pb-rule">
            <span>Small firsts</span>
          </div>
          {MILESTONES.map((milestone) => {
            const at = milestones[milestone.id as keyof typeof milestones];
            return (
              <div
                key={milestone.id}
                className="pb-panel"
                style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', opacity: at ? 1 : 0.5 }}
              >
                <span
                  className="pb-ornament"
                  style={{ fontSize: '1.1rem', color: at ? 'var(--c-accent)' : 'var(--c-ink-muted)' }}
                  aria-hidden="true"
                >
                  {at ? '❧' : '❍'}
                </span>
                <div>
                  <div style={{ fontWeight: 650, fontSize: '0.95rem' }}>{milestone.title}</div>
                  <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.6, marginTop: 3 }}>
                    {milestone.line}
                  </p>
                  {at && (
                    <span className="pb-muted" style={{ fontSize: '0.72rem' }}>
                      {formatDate(at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {tab === 'shelf' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shelf.length === 0 ? (
            <Empty
              icon={Globe}
              title="Your shelf is empty"
              body="Visit “From the web” to find public-domain speeches and keep the ones you want to read offline."
            />
          ) : (
            shelf.map((speech) => (
              <article key={speech.id} className="pb-panel" style={{ padding: '14px 18px' }}>
                <h3 style={{ fontSize: '1rem' }}>{speech.title}</h3>
                <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                  {speech.licence} · {speech.source}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Link to={`/read/${encodeURIComponent(speech.id)}`} className="pb-btn pb-btn-sm">
                    Read
                  </Link>
                  <a className="pb-btn pb-btn-sm pb-btn-ghost" href={speech.sourceUrl} target="_blank" rel="noreferrer noopener">
                    Original ↗
                  </a>
                  <button
                    type="button"
                    className="pb-icon-btn"
                    onClick={() => {
                      removeFromShelf(speech.id);
                      toast('Removed from your shelf', 'success');
                    }}
                    aria-label="Remove from shelf"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {bookmarked.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="pb-rule">
            <span>On your desk</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {bookmarked.map((item) => (
              <Link key={item.id} to={`/read/${encodeURIComponent(item.id)}`} className="pb-chip" style={{ padding: '6px 12px' }}>
                <BookMarked size={11} /> {item.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  body,
  tail,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
  tail?: string;
}) {
  return (
    <div className="pb-panel" style={{ padding: '40px 24px', textAlign: 'center' }}>
      <Icon size={26} style={{ color: 'var(--c-accent)', margin: '0 auto 12px' }} />
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <p className="pb-muted" style={{ maxWidth: 440, margin: '0 auto', lineHeight: 1.7 }}>
        {body}
        {tail ? <em>{tail}</em> : null}
      </p>
    </div>
  );
}
