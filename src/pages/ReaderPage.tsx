import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  CheckCircle2,
  CircleAlert,
  Download,
  Focus,
  Gauge,
  Headphones,
  Minus,
  Plus,
  Printer,
  Quote,
  Ruler,
  Copy,
  PenLine,
  Mic2,
  StickyNote,
} from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { ReactionBar } from '../components/ReactionBar';
import { AdGate } from '../components/AdGate';
import { useSpeech, useSpeeches } from '../hooks/useCollection';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useCloud } from '../store/cloud';
import { registerView } from '../services/data';
import { fetchWebSpeech as fetchWebText } from '../services/webSources';
import { analyse, formatCount, formatDate, readingMinutes } from '../lib/text';
import { copyText, downloadFile, supportsSpeechSynthesis } from '../lib/platform';
import { useGate } from '../components/SignIn';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const item = useSpeech(id);
  const items = useSpeeches();
  const toast = useUi((s) => s.toast);
  const gate = useGate();

  const pushHistory = useLibrary((s) => s.pushHistory);
  const setProgress = useLibrary((s) => s.setProgress);
  const toggleBookmark = useLibrary((s) => s.toggleBookmark);
  const duplicateSpeech = useLibrary((s) => s.duplicateSpeech);
  const addMarginNote = useLibrary((s) => s.addMarginNote);
  const removeMarginNote = useLibrary((s) => s.removeMarginNote);
  const marginNotes = useLibrary((s) => s.marginNotes);
  const saveLine = useLibrary((s) => s.saveLine);
  const updateShelfItem = useLibrary((s) => s.updateShelfItem);
  const connect = useCloud((s) => s.connect);

  const reader = useSettings((s) => s.reader);
  const patchReader = useSettings((s) => s.patchReader);
  const setLastSpeech = useSettings((s) => s.setLastSpeech);

  const articleRef = useRef<HTMLElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(1);
  const [progress, setLocalProgress] = useState(0);
  const [adDone, setAdDone] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const stats = useMemo(() => analyse(item?.content ?? ''), [item?.content]);
  const speechId = item?.id;

  useEffect(() => {
    if (!item) return;
    pushHistory(item.id);
    setLastSpeech(item.id);
    setAdDone(false);
    // A real view, counted once per open on the shared document.
    if (item.source === 'cloud') void registerView(item.id);
    // Web speeches arrive with an intro; pull the full text when opened.
    if (item.source === 'web' && item.content.length < 1500) {
      void fetchWebText({
        id: item.id,
        title: item.title,
        author: item.author,
        preview: item.preview,
        content: item.content,
        sourceUrl: item.sourceUrl ?? '',
        source: 'Wikisource',
        licence: item.licence ?? 'Public domain',
        fetchedAt: new Date().toISOString(),
      }).then((full: { content: string }) => {
        if (full.content && full.content !== item.content) updateShelfItem(item.id, full);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechId]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  const onScroll = useCallback(() => {
    const node = articleRef.current;
    if (!node || !speechId) return;
    const rect = node.getBoundingClientRect();
    const total = rect.height - window.innerHeight * 0.7;
    const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
    const value = Math.min(1, scrolled / Math.max(total, 1));
    setLocalProgress((current) => (Math.abs(current - value) < 0.01 ? current : value));
    setProgress(speechId, value);
  }, [speechId, setProgress]);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [onScroll]);

  if (!item) {
    return (
      <div className="pb-panel" style={{ padding: 40, textAlign: 'center' }}>
        <h2>We couldn’t find that speech</h2>
        <p className="pb-muted" style={{ margin: '10px 0 18px' }}>
          It may have been removed, or the link may be from another device.
        </p>
        <Link to="/" className="pb-btn pb-btn-primary">
          Back to the library
        </Link>
      </div>
    );
  }

  const index = items.findIndex((i) => i.id === item.id);
  const previous = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const related = items.filter((i) => i.id !== item.id && i.category === item.category).slice(0, 4);
  const notes = marginNotes.filter((note) => note.speechId === item.id);

  const adVisible = item.ad && !adDone;

  const toggleSpeech = () => {
    if (!supportsSpeechSynthesis()) {
      toast('Text-to-speech is not available in this browser', 'warn');
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(item.content.replace(/[#>*`-]/g, ' '));
      utterance.rate = rate;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      setSpeaking(true);
    };
    speak();
  };

  const exportFile = (type: 'md' | 'txt') => {
    const body =
      type === 'md'
        ? `# ${item.title}\n\n_${item.author} · ${item.occasion}_\n\n${item.content}\n`
        : `${item.title}\n${item.author} — ${item.occasion}\n\n${item.content}\n`;
    downloadFile(`${item.title.replace(/[^\w\d]+/g, '-').toLowerCase()}.${type}`, body, 'text/plain');
    toast(`Downloaded ${type.toUpperCase()}`, 'success');
  };

  const keepLine = () => {
    const selection = window.getSelection()?.toString().trim();
    if (!selection) {
      toast('Select a sentence with your finger or cursor first.', 'info');
      return;
    }
    gate(() => {
      saveLine({
        text: selection.slice(0, 400),
        speechId: item.id,
        speechTitle: item.title,
        author: item.author,
      });
      toast('Kept in your commonplace book', 'success');
      window.getSelection()?.removeAllRanges();
    }, 'Sign in to keep lines you want to remember.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: 2,
          width: `${Math.round(progress * 100)}%`,
          background: 'var(--c-accent)',
          zIndex: 60,
          transition: 'width 120ms linear',
        }}
        aria-hidden="true"
      />

      {adVisible && <AdGate speechId={item.id} onFinish={() => setAdDone(true)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ flex: 1 }} />
        {previous && (
          <button
            type="button"
            className="pb-btn pb-btn-sm pb-btn-ghost"
            onClick={() => navigate(`/read/${encodeURIComponent(previous.id)}`)}
          >
            <ArrowLeft size={14} /> {previous.title.slice(0, 20)}
          </button>
        )}
        {next && (
          <button
            type="button"
            className="pb-btn pb-btn-sm pb-btn-ghost"
            onClick={() => navigate(`/read/${encodeURIComponent(next.id)}`)}
          >
            {next.title.slice(0, 20)} <ArrowRight size={14} />
          </button>
        )}
      </div>

      <header className="pb-panel anim-enter" style={{ padding: 'clamp(18px, 3vw, 30px)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <span className="pb-eyebrow">
              {item.category} · {item.occasion}
            </span>
            <h1 style={{ fontSize: 'clamp(1.5rem, 3.4vw, 2.2rem)', margin: '8px 0 10px' }}>{item.title}</h1>
            <p className="pb-soft" style={{ fontSize: '0.98rem', lineHeight: 1.7 }}>{item.preview}</p>

            <div className="pb-muted" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.8rem', marginTop: 12 }}>
              <span>{item.author}</span>
              <span>{formatDate(item.createdAt)}</span>
              <span>{stats.minutes} min read</span>
              <span>{formatCount(item.words)} words</span>
              {item.views !== null && <span>Read {formatCount(item.views)} times</span>}
              {item.source === 'web' && item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--c-accent)' }}>
                  Original on {item.source} ↗
                </a>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="pb-btn pb-btn-sm"
                onClick={() => navigate(`/practice/${encodeURIComponent(item.id)}`)}
              >
                <Mic2 size={15} /> Rehearse
              </button>
              <button
                type="button"
                className="pb-btn pb-btn-sm"
                onClick={() => {
                  const newId = duplicateSpeech(item.id, item);
                  if (newId) {
                    toast('Copied into your drafts', 'success');
                    navigate(`/studio/${newId}`);
                  }
                }}
              >
                <PenLine size={15} /> Remix
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="pb-icon-btn"
                onClick={() => toggleBookmark(item.id)}
                aria-pressed={item.bookmarked}
                title="Keep on your desk"
              >
                <BookMarked size={16} fill={item.bookmarked ? 'var(--c-accent)' : 'none'} />
              </button>
              <button
                type="button"
                className="pb-icon-btn"
                onClick={toggleSpeech}
                aria-pressed={speaking}
                title={speaking ? 'Stop listening' : 'Listen'}
              >
                <Headphones size={16} color={speaking ? 'var(--c-accent)' : undefined} />
              </button>
              <button
                type="button"
                className="pb-icon-btn"
                onClick={keepLine}
                title="Save the sentence you have selected"
              >
                <Quote size={16} />
              </button>
              <button
                type="button"
                className="pb-icon-btn"
                onClick={() => setShowNotes((v) => !v)}
                aria-pressed={showNotes}
                title="Notes in the margin"
              >
                <StickyNote size={16} color={showNotes ? 'var(--c-accent)' : undefined} />
              </button>
              <button
                type="button"
                className="pb-icon-btn"
                onClick={async () => {
                  const ok = await copyText(`${item.title}\n\n${item.content}`);
                  toast(ok ? 'Speech copied' : 'Copy failed', ok ? 'success' : 'error');
                }}
                title="Copy text"
              >
                <Copy size={16} />
              </button>
              <button type="button" className="pb-icon-btn" onClick={() => exportFile('md')} title="Download">
                <Download size={16} />
              </button>
              <button type="button" className="pb-icon-btn" onClick={() => window.print()} title="Print / PDF">
                <Printer size={16} />
              </button>
            </div>

            {speaking && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem' }}>
                <Gauge size={14} />
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.1}
                  value={rate}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setRate(value);
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(item.content.replace(/[#>*`-]/g, ' '));
                    utterance.rate = value;
                    utterance.onend = () => setSpeaking(false);
                    window.speechSynthesis.speak(utterance);
                  }}
                  style={{ flex: 1, accentColor: 'var(--c-accent)' }}
                  aria-label="Voice speed"
                />
                <span className="pb-mono">{rate.toFixed(1)}×</span>
              </label>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--c-line-soft)',
          }}
        >
          <ReactionBar item={item} onCountsChange={() => void connect(true)} />
          {item.ad && (
            <span className="pb-chip" title="This speech is preceded by a short sponsor slot">
              Sponsor-supported
            </span>
          )}
          {item.tags.slice(0, 6).map((tag) => (
            <span key={tag} className="pb-chip" style={{ fontSize: '0.72rem' }}>
              #{tag}
            </span>
          ))}
        </div>
      </header>

      {showNotes && (
        <section className="pb-panel anim-enter" style={{ padding: '14px 18px' }}>
          <span className="pb-eyebrow">In the margin</span>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!noteDraft.trim()) return;
              gate(() => {
                addMarginNote({ speechId: item.id, text: noteDraft.trim() });
                setNoteDraft('');
                toast('Note saved to this speech', 'success');
              }, 'Sign in to leave notes in the margin.');
            }}
            style={{ display: 'flex', gap: 8, marginTop: 10 }}
          >
            <input
              className="pb-input"
              placeholder="What are you thinking as you read this?"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              aria-label="Margin note"
              maxLength={400}
            />
            <button type="submit" className="pb-btn pb-btn-sm">
              Add
            </button>
          </form>
          {notes.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {notes.map((note) => (
                <li key={note.id} className="pb-margin-note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ flex: 1 }}>{note.text}</span>
                  <button
                    type="button"
                    onClick={() => removeMarginNote(note.id)}
                    className="pb-muted"
                    style={{ fontSize: '0.72rem' }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section
        className="pb-panel"
        style={{ padding: '10px 14px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <span className="pb-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ruler size={14} /> Reading
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="pb-icon-btn"
            onClick={() => patchReader({ scale: Math.max(0.85, reader.scale - 0.08) })}
            aria-label="Smaller text"
          >
            <Minus size={15} />
          </button>
          <span className="pb-mono" style={{ fontSize: '0.78rem', minWidth: 42, textAlign: 'center' }}>
            {Math.round(reader.scale * 100)}%
          </span>
          <button
            type="button"
            className="pb-icon-btn"
            onClick={() => patchReader({ scale: Math.min(1.6, reader.scale + 0.08) })}
            aria-label="Larger text"
          >
            <Plus size={15} />
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
          Width
          <input
            type="range"
            min={44}
            max={92}
            value={reader.measure}
            onChange={(event) => patchReader({ measure: Number(event.target.value) })}
            style={{ width: 100, accentColor: 'var(--c-accent)' }}
            aria-label="Reading width"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
          Lines
          <input
            type="range"
            min={1.35}
            max={2.2}
            step={0.05}
            value={reader.lineHeight}
            onChange={(event) => patchReader({ lineHeight: Number(event.target.value) })}
            style={{ width: 90, accentColor: 'var(--c-accent)' }}
            aria-label="Line height"
          />
        </label>
        <button
          type="button"
          className={`pb-btn pb-btn-sm ${reader.focusMode ? 'pb-btn-primary' : ''}`}
          onClick={() => patchReader({ focusMode: !reader.focusMode })}
          aria-pressed={reader.focusMode}
        >
          <Focus size={14} /> Focus
        </button>
        <button
          type="button"
          className={`pb-btn pb-btn-sm ${reader.readingRuler ? 'pb-btn-primary' : ''}`}
          onClick={() => patchReader({ readingRuler: !reader.readingRuler })}
          aria-pressed={reader.readingRuler}
        >
          Ruler
        </button>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: reader.focusMode ? 'minmax(0,1fr)' : 'minmax(0, 1fr) minmax(0, 300px)',
          gap: 18,
          alignItems: 'start',
        }}
        data-reader-grid
      >
        <article
          ref={articleRef}
          className={`pb-panel ${reader.readingRuler ? 'pb-ruler' : ''}`}
          style={{ padding: 'clamp(20px, 4vw, 44px)' }}
        >
          <Markdown
            text={item.content}
            className="pb-prose"
            style={
              {
                '--pb-measure': `${reader.measure}ch`,
                '--pb-leading': String(reader.lineHeight),
                fontSize: `${1.05 * reader.scale}rem`,
                margin: '0 auto',
              } as CSSProperties
            }
          />

          {item.source === 'web' && (
            <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 24, lineHeight: 1.7 }}>
              {item.licence}. Text served from {item.source} and reproduced here so you can rehearse
              with it.{' '}
              <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--c-accent)' }}>
                See the original page ↗
              </a>
            </p>
          )}

          <div className="pb-rule" style={{ marginTop: 30 }}>
            <span>❧</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
            <button type="button" className="pb-btn pb-btn-sm" onClick={() => exportFile('txt')}>
              <Download size={14} /> .txt
            </button>
            <button type="button" className="pb-btn pb-btn-sm" onClick={() => exportFile('md')}>
              <Download size={14} /> .md
            </button>
            <button
              type="button"
              className="pb-btn pb-btn-sm"
              onClick={() => {
                setProgress(item.id, 1);
                toast('Marked as finished', 'success');
              }}
            >
              <CheckCircle2 size={14} /> Mark finished
            </button>
            <button
              type="button"
              className="pb-btn pb-btn-sm pb-btn-ghost"
              onClick={() => navigate(`/practice/${encodeURIComponent(item.id)}`)}
            >
              <Mic2 size={14} /> Say it out loud
            </button>
          </div>
        </article>

        {!reader.focusMode && (
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="pb-panel" style={{ padding: 18 }}>
              <span className="pb-eyebrow">Coach</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0' }}>
                <Metric label="Speaking time" value={`${readingMinutes(item.content)} min`} />
                <Metric label="Readability" value={stats.level} />
                <Metric label="Ease score" value={String(stats.ease)} />
                <Metric label="Sentences" value={String(stats.sentences)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.structure
                  .filter((finding) => !finding.ok)
                  .slice(0, 3)
                  .map((finding) => (
                    <p key={finding.id} style={{ fontSize: '0.78rem', display: 'flex', gap: 8, color: 'var(--c-ink-muted)', lineHeight: 1.55 }}>
                      <CircleAlert size={14} style={{ flex: '0 0 auto', color: 'var(--c-warn)', marginTop: 2 }} />
                      <span>
                        <strong style={{ color: 'var(--c-ink)' }}>{finding.label}:</strong> {finding.detail}
                      </span>
                    </p>
                  ))}
                {stats.structure.every((finding) => finding.ok) && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--c-ok)', display: 'flex', gap: 8, lineHeight: 1.6 }}>
                    <CheckCircle2 size={15} style={{ flex: '0 0 auto', marginTop: 2 }} />
                    This speech covers every structural base.
                  </p>
                )}
              </div>
            </div>

            {related.length > 0 && (
              <div className="pb-panel" style={{ padding: 18 }}>
                <span className="pb-eyebrow">More in {item.category}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
                  {related.map((speech) => (
                    <Link key={speech.id} to={`/read/${encodeURIComponent(speech.id)}`} style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                      {speech.title}
                      <span className="pb-muted" style={{ display: 'block', fontSize: '0.72rem', fontWeight: 400 }}>
                        {speech.minutes} min · {speech.author}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-well" style={{ padding: '10px 12px' }}>
      <div style={{ fontFamily: 'var(--x-font-display)', fontWeight: 700, fontSize: '1.05rem' }}>{value}</div>
      <div className="pb-muted" style={{ fontSize: '0.7rem' }}>{label}</div>
    </div>
  );
}
