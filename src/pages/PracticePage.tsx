import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Gauge,
  Maximize2,
  Minimize2,
  MirrorRectangular,
  Pause,
  Play,
  RotateCcw,
  Type,
} from 'lucide-react';
import { useSpeeches } from '../hooks/useCollection';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { formatClock, wordCount } from '../lib/text';
import {
  isFullscreen,
  releaseWakeLock,
  requestWakeLock,
  toggleFullscreen,
} from '../lib/platform';

export function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const items = useSpeeches();
  const practice = useSettings((s) => s.practice);
  const patchPractice = useSettings((s) => s.patchPractice);
  const toast = useUi((s) => s.toast);

  const [selectedId, setSelectedId] = useState<string>(id ?? '');
  const item = useMemo(
    () => items.find((speech) => speech.id === selectedId) ?? null,
    [items, selectedId],
  );

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
    stop();
    setCountdown(practice.countdown);
  }, [practice.countdown, stop]);

  useEffect(() => {
    offsetRef.current = 0;
    setOffset(0);
    setElapsed(0);
    stop();
  }, [selectedId, stop]);

  // Countdown before the scroll begins.
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

  // Scroll + clock loop.
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
          toast('Rehearsal complete — how did that feel?', 'success');
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
  }, [running, item, practice.wpm, words, stop, toast]);

  // Keyboard shortcuts for the rehearsal room.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
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
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🎙️</div>
          <h2 style={{ marginBottom: 8 }}>Nothing loaded</h2>
          <p className="pb-muted" style={{ maxWidth: 460, margin: '0 auto 18px' }}>
            Choose a speech above, or head to the library and press “Rehearse” on any card.
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
              title="Mirror the text (for beam-splitter glass)"
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
                  background: 'var(--c-scrim)',
                  fontFamily: 'var(--x-font-display)',
                  fontSize: 'clamp(4rem, 18vw, 9rem)',
                  fontWeight: 700,
                  color: 'var(--c-accent)',
                }}
              >
                {countdown}
              </div>
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
            <div
              style={{
                flex: '1 1 200px',
                height: 6,
                borderRadius: 999,
                background: 'var(--c-surface-3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(progress * 100)}%`,
                  background: 'var(--grad-brand)',
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
