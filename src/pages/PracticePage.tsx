import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Feather,
  Gauge,
  HeartHandshake,
  Maximize2,
  Minimize2,
  MirrorRectangular,
  Pause,
  Play,
  RotateCcw,
  Type,
  Wind,
} from 'lucide-react';
import { useSpeeches } from '../hooks/useCollection';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useLibrary } from '../store/library';
import { formatClock, wordCount } from '../lib/text';
import {
  isFullscreen,
  releaseWakeLock,
  requestWakeLock,
  toggleFullscreen,
} from '../lib/platform';
import { AFTER_PRACTICE, LETTER_PROMPTS, breathPhase, pick } from '../lib/heart';

export function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const items = useSpeeches();
  const practice = useSettings((s) => s.practice);
  const patchPractice = useSettings((s) => s.patchPractice);
  const toast = useUi((s) => s.toast);
  const addLetter = useLibrary((s) => s.addLetter);
  const markMilestone = useLibrary((s) => s.markMilestone);

  const [selectedId, setSelectedId] = useState<string>(id ?? '');
  const item = useMemo(() => items.find((speech) => speech.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    if (id) setSelectedId(id);
  }, [id]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const [running, setRunning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [finished, setFinished] = useState(false);

  /* The human parts: who it is for, a breath, and a letter afterwards. */
  const [intention, setIntention] = useState('');
  const [breathing, setBreathing] = useState(false);
  const [breathElapsed, setBreathElapsed] = useState(0);
  const [letter, setLetter] = useState('');
  const [letterPrompt] = useState(() => pick(LETTER_PROMPTS));
  const [closing] = useState(() => pick(AFTER_PRACTICE));

  const words = item ? wordCount(item.content) : 0;
  const targetSeconds = item ? Math.round((words / practice.wpm) * 60) : 0;

  const stop = useCallback(() => {
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void releaseWakeLock();
  }, []);

  const restart = useCallback(() => {
    offsetRef.current = 0;
    setOffset(0);
    setElapsed(0);
    setFinished(false);
    stop();
    setCountdown(practice.countdown);
  }, [practice.countdown, stop]);

  useEffect(() => {
    offsetRef.current = 0;
    setOffset(0);
    setElapsed(0);
    setFinished(false);
    stop();
  }, [selectedId, stop]);

  useEffect(() => {
    if (countdown <= 0) return;
    const tick = window.setTimeout(() => {
      setCountdown((value) => {
        if (value - 1 === 0) {
          setRunning(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearTimeout(tick);
  }, [countdown]);

  useEffect(() => {
    if (!breathing) return undefined;
    const started = performance.now();
    const id = window.setInterval(() => setBreathElapsed(performance.now() - started), 100);
    return () => window.clearInterval(id);
  }, [breathing]);

  const breath = breathPhase(breathElapsed);

  useEffect(() => {
    if (!running || !item) return undefined;

    void requestWakeLock();
    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const container = containerRef.current;
      const inner = innerRef.current;
      if (container && inner) {
        const distance = Math.max(0, inner.scrollHeight - container.clientHeight);
        const duration = Math.max(1, (words / practice.wpm) * 60);
        const pxPerSecond = distance / duration;
        offsetRef.current = Math.min(distance, offsetRef.current + pxPerSecond * delta);
        setOffset(offsetRef.current);
        if (offsetRef.current >= distance - 0.5) {
          stop();
          setFinished(true);
          if (markMilestone('first-rehearsal')) {
            toast('First rehearsal done. That is the hardest one.', 'success');
          }
        }
      }

      setElapsed((value) => value + delta);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void releaseWakeLock();
    };
  }, [running, item, practice.wpm, words, stop, toast, markMilestone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!item) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (running) stop();
        else if (countdown === 0) setRunning(true);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        patchPractice({ wpm: Math.min(260, practice.wpm + 5) });
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        patchPractice({ wpm: Math.max(60, practice.wpm - 5) });
      }
      if (event.key.toLowerCase() === 'r') restart();
      if (event.key.toLowerCase() === 'f') {
        void (async () => {
          const next = await toggleFullscreen(containerRef.current ?? undefined);
          setFullscreen(next);
        })();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, running, countdown, stop, restart, patchPractice, practice.wpm]);

  useEffect(() => {
    const sync = () => setFullscreen(isFullscreen());
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => () => void releaseWakeLock(), []);

  const paceDelta = targetSeconds ? elapsed - targetSeconds : 0;
  const progress = item ? Math.min(1, offset / Math.max(1, innerRef.current?.scrollHeight ?? 1)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <span className="pb-eyebrow">Rehearsal room</span>
          <h1 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.8rem)' }}>
            {item ? item.title : 'Pick something to rehearse'}
          </h1>
        </div>
        <div style={{ flex: 1 }} />
        <select
          className="pb-select"
          style={{ width: 'auto', minWidth: 220, maxWidth: '100%' }}
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          aria-label="Choose a speech"
        >
          <option value="">Choose a speech…</option>
          {items.map((speech) => (
            <option key={speech.id} value={speech.id}>
              {speech.title} · {speech.minutes} min
            </option>
          ))}
        </select>
      </div>

      {!item ? (
        <div className="pb-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: 10 }} aria-hidden="true">
            🎙️
          </div>
          <h2 style={{ marginBottom: 8 }}>Nothing loaded</h2>
          <p className="pb-muted" style={{ maxWidth: 460, margin: '0 auto 18px', lineHeight: 1.7 }}>
            Choose a speech above, or pick one in the library and press “Rehearse”.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="pb-btn pb-btn-primary">
              Browse the library
            </Link>
            <Link to="/studio" className="pb-btn">
              Write something first
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Who is this for? */}
          <section className="pb-panel" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <HeartHandshake size={16} style={{ color: 'var(--c-accent)' }} />
              <strong style={{ fontSize: '0.9rem' }}>Before you start</strong>
            </div>
            <label className="pb-muted" style={{ fontSize: '0.82rem', display: 'block', marginBottom: 8, lineHeight: 1.6 }}>
              Who is this for? One name, or one kind of person. Saying it out loud changes how you say
              everything else.
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="pb-input"
                style={{ flex: '1 1 220px' }}
                placeholder="e.g. the new apprentices, or: my sister"
                value={intention}
                onChange={(event) => setIntention(event.target.value)}
                aria-label="Who is this speech for"
                maxLength={120}
              />
              <button
                type="button"
                className={`pb-btn ${breathing ? 'pb-btn-primary' : ''}`}
                onClick={() => {
                  setBreathing((value) => !value);
                  setBreathElapsed(0);
                }}
                aria-pressed={breathing}
              >
                <Wind size={15} /> {breathing ? 'Stop breathing' : 'Breathe first'}
              </button>
            </div>

            {breathing && (
              <div
                className="pb-well anim-enter"
                style={{ marginTop: 12, padding: '18px', textAlign: 'center' }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    margin: '0 auto 12px',
                    borderRadius: 999,
                    border: '2px solid var(--c-accent)',
                    display: 'grid',
                    placeItems: 'center',
                    transform: `scale(${breath.label === 'Breathe in' ? 1.15 : breath.label === 'Breathe out' ? 0.85 : 1})`,
                    transition: 'transform 600ms ease',
                    background: 'var(--c-accent-soft)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--x-font-display)', fontSize: '1.5rem' }}>
                    {Math.ceil(breath.remaining / 1000)}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--x-font-display)', fontSize: '1.05rem' }}>{breath.label}</div>
                <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 6 }}>
                  Four counts in, four held, six out. Three rounds is enough to change your voice.
                </p>
              </div>
            )}
          </section>

          <section
            className="pb-panel"
            style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <button
              type="button"
              className="pb-btn pb-btn-primary"
              onClick={() => {
                if (running) stop();
                else if (countdown > 0) setCountdown(0);
                else if (offset > 0) setRunning(true);
                else restart();
              }}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              {running ? 'Pause' : offset > 0 ? 'Resume' : `Start (${practice.countdown}s)`}
            </button>
            <button type="button" className="pb-btn" onClick={restart}>
              <RotateCcw size={15} /> Restart
            </button>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
              <Gauge size={15} />
              <input
                type="range"
                min={70}
                max={220}
                step={5}
                value={practice.wpm}
                onChange={(event) => patchPractice({ wpm: Number(event.target.value) })}
                style={{ width: 110, accentColor: 'var(--c-accent)' }}
                aria-label="Words per minute"
              />
              <span className="pb-mono" style={{ minWidth: 62 }}>
                {practice.wpm} wpm
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
              <Type size={15} />
              <input
                type="range"
                min={0.7}
                max={2.2}
                step={0.1}
                value={practice.fontScale}
                onChange={(event) => patchPractice({ fontScale: Number(event.target.value) })}
                style={{ width: 90, accentColor: 'var(--c-accent)' }}
                aria-label="Text size"
              />
            </label>

            <button
              type="button"
              className={`pb-btn pb-btn-sm ${practice.mirror ? 'pb-btn-primary' : ''}`}
              onClick={() => patchPractice({ mirror: !practice.mirror })}
              aria-pressed={practice.mirror}
              title="Mirror the text for beam-splitter glass"
            >
              <MirrorRectangular size={14} /> Mirror
            </button>
            <button
              type="button"
              className={`pb-btn pb-btn-sm ${practice.cueLine ? 'pb-btn-primary' : ''}`}
              onClick={() => patchPractice({ cueLine: !practice.cueLine })}
              aria-pressed={practice.cueLine}
            >
              Cue line
            </button>
            <button
              type="button"
              className="pb-btn pb-btn-sm pb-btn-ghost"
              onClick={async () => {
                const next = await toggleFullscreen(containerRef.current ?? undefined);
                setFullscreen(next);
              }}
              title="Fullscreen (F)"
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <TimerChip label="Elapsed" value={formatClock(Math.round(elapsed))} />
              <TimerChip
                label={paceDelta >= 0 ? 'Over' : 'Under'}
                value={formatClock(Math.round(Math.abs(paceDelta)))}
                tone={Math.abs(paceDelta) > 30 ? 'var(--c-warn)' : 'var(--c-ok)'}
              />
              <TimerChip label="Target" value={formatClock(targetSeconds)} />
            </div>
          </section>

          <div
            ref={containerRef}
            className="pb-panel pb-prompt-frame"
            style={{
              position: 'relative',
              height: 'min(62vh, 640px)',
              minHeight: 320,
              overflow: 'hidden',
              padding: fullscreen ? '6vh 8vw' : '3vh 6vw',
            }}
          >
            {practice.cueLine && <div className="pb-cue-line" />}
            {countdown > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  zIndex: 3,
                  fontFamily: 'var(--x-font-display)',
                  fontSize: 'clamp(4rem, 18vw, 9rem)',
                  fontWeight: 700,
                  color: 'var(--c-accent)',
                }}
              >
                {countdown}
              </div>
            )}
            {intention.trim() && countdown > 0 && (
              <p
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: '12%',
                  textAlign: 'center',
                  fontSize: '1rem',
                  color: 'var(--c-ink-muted)',
                  zIndex: 3,
                }}
              >
                This one is for {intention.trim()}.
              </p>
            )}
            <div
              ref={innerRef}
              className="pb-prompt"
              style={{
                ['--prompt-scale' as string]: String(practice.fontScale),
                transform: `translateY(${-offset}px)${practice.mirror ? ' scaleX(-1)' : ''}`,
                transition: running ? 'none' : 'transform 260ms ease',
                whiteSpace: 'pre-wrap',
                textAlign: 'center',
              }}
            >
              {item.content.replace(/^#{1,6}\s+/gm, '').replace(/^>\s?/gm, '')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', height: 6, borderRadius: 999, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(progress * 100)}%`,
                  background: 'var(--c-accent)',
                  transition: 'width 120ms linear',
                }}
              />
            </div>
            <span className="pb-muted" style={{ fontSize: '0.78rem' }}>
              {words} words · {Math.round(progress * 100)}% through · space play/pause · ↑↓ pace · R restart · F fullscreen
            </span>
            <Link to={`/read/${encodeURIComponent(item.id)}`} className="pb-btn pb-btn-sm">
              Open reader
            </Link>
          </div>

          {finished && (
            <section className="pb-panel anim-enter" style={{ padding: '18px 20px' }}>
              <div className="pb-rule" style={{ marginBottom: 14 }}>
                <span>❧ After the run</span>
              </div>
              <p style={{ fontSize: '1.02rem', lineHeight: 1.7, marginBottom: 14 }}>{closing}</p>

              <label className="pb-label" htmlFor="letter">
                A letter to yourself, before the real thing
              </label>
              <p className="pb-muted" style={{ fontSize: '0.82rem', marginBottom: 8, lineHeight: 1.6 }}>
                {letterPrompt}
              </p>
              <textarea
                id="letter"
                className="pb-textarea"
                style={{ minHeight: 110 }}
                value={letter}
                onChange={(event) => setLetter(event.target.value)}
                placeholder="Dear me, before I walk in…"
                maxLength={2000}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="pb-btn pb-btn-primary"
                  disabled={!letter.trim()}
                  onClick={() => {
                    addLetter({ speechId: item.id, speechTitle: item.title, text: letter.trim() });
                    setLetter('');
                    toast('Kept on your desk', 'success');
                  }}
                >
                  <Feather size={15} /> Keep this letter
                </button>
                <button type="button" className="pb-btn" onClick={restart}>
                  <RotateCcw size={15} /> Run it again
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TimerChip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="pb-well" style={{ padding: '6px 12px', textAlign: 'center', minWidth: 92 }}>
      <div className="pb-mono" style={{ fontSize: '1.05rem', fontWeight: 600, color: tone ?? 'var(--c-ink)' }}>
        {value}
      </div>
      <div className="pb-muted" style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
    </div>
  );
}
