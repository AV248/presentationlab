import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronDown,
  Clapperboard,
  Feather,
  FlipHorizontal,
  Gauge,
  HeartHandshake,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Type,
  Wind,
  X,
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
import { pageMetaFor } from '../data/routes';
import { SITE_URL, usePageMeta } from '../lib/seo';

/**
 * The Rehearsal Room — the centre of this app.
 *
 * Everything else exists so that you can end up here: a full-screen stage,
 * your words moving at your pace, a clock that tells you the truth, and a
 * letter to yourself when the run is done.
 *
 * 2.4 makes the stage the page rather than a panel inside it. Entering
 * the stage hides every control until you move; the teleprompter fills the
 * screen on a phone exactly as it does on a laptop.
 */
export function PracticePage() {
  const meta = pageMetaFor('/rehearse');
  usePageMeta(meta?.title ?? 'Rehearsal Room', {
    description: meta?.description,
    image: meta?.card ? `${SITE_URL}/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
  });

  const { id } = useParams<{ id: string }>();
  const items = useSpeeches();
  const practice = useSettings((s) => s.practice);
  const patchPractice = useSettings((s) => s.patchPractice);
  const toast = useUi((s) => s.toast);
  const addLetter = useLibrary((s) => s.addLetter);
  const markMilestone = useLibrary((s) => s.markMilestone);

  const [selectedId, setSelectedId] = useState<string>(id ?? '');
  const item = useMemo(
    () => items.find((speech) => speech.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (id) setSelectedId(id);
  }, [id]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const idleRef = useRef<number | null>(null);

  const [running, setRunning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [onStage, setOnStage] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
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
    if (countdown <= 0) return undefined;
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
    const timer = window.setInterval(() => setBreathElapsed(performance.now() - started), 100);
    return () => window.clearInterval(timer);
  }, [breathing]);

  const breath = breathPhase(breathElapsed);

  /* ---- the scroll engine ---- */
  useEffect(() => {
    if (!running || !item) return undefined;

    void requestWakeLock();
    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const viewport = viewportRef.current;
      const inner = innerRef.current;
      if (viewport && inner) {
        const distance = Math.max(0, inner.scrollHeight - viewport.clientHeight);
        const duration = Math.max(1, (words / practice.wpm) * 60);
        const pxPerSecond = distance / duration;
        offsetRef.current = Math.min(distance, offsetRef.current + pxPerSecond * delta);
        setOffset(offsetRef.current);
        if (offsetRef.current >= distance - 0.5) {
          stop();
          setFinished(true);
          setChromeVisible(true);
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

  /* ---- on stage, the controls fade until you move ---- */
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => setChromeVisible(false), 2600);
  }, []);

  useEffect(() => {
    if (!onStage || !running) {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      setChromeVisible(true);
      return undefined;
    }
    wakeChrome();
    return () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [onStage, running, wakeChrome]);

  const enterStage = useCallback(async () => {
    setOnStage(true);
    const next = await toggleFullscreen(stageRef.current ?? undefined);
    setFullscreen(next);
    if (!running && countdown === 0 && offset === 0) restart();
  }, [countdown, offset, restart, running]);

  const leaveStage = useCallback(async () => {
    stop();
    if (isFullscreen()) {
      await toggleFullscreen(stageRef.current ?? undefined);
    }
    setFullscreen(false);
    setOnStage(false);
    setChromeVisible(true);
  }, [stop]);

  /* ---- keys ---- */
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
        wakeChrome();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        patchPractice({ wpm: Math.max(60, practice.wpm - 5) });
        wakeChrome();
        return;
      }
      if (event.key.toLowerCase() === 'r') restart();
      if (event.key.toLowerCase() === 'f') void (onStage ? leaveStage() : enterStage());
      if (event.key === 'Escape' && onStage) void leaveStage();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    item,
    running,
    countdown,
    stop,
    restart,
    patchPractice,
    practice.wpm,
    onStage,
    enterStage,
    leaveStage,
    wakeChrome,
  ]);

  // The browser can leave fullscreen without us (Esc, gesture, OS).
  useEffect(() => {
    const sync = () => {
      const active = isFullscreen();
      setFullscreen(active);
      if (!active && onStage) {
        setOnStage(false);
        setChromeVisible(true);
      }
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [onStage]);

  useEffect(() => () => void releaseWakeLock(), []);

  const paceDelta = targetSeconds ? elapsed - targetSeconds : 0;
  const distance = Math.max(1, (innerRef.current?.scrollHeight ?? 1) - (viewportRef.current?.clientHeight ?? 0));
  const progress = item ? Math.min(1, offset / distance) : 0;
  const stageText = item ? item.content.replace(/^#{1,6}\s+/gm, '').replace(/^>\s?/gm, '') : '';

  /* ------------------------------------------------------------------ */
  /* the stage                                                           */
  /* ------------------------------------------------------------------ */

  const stage = (
    <div
      ref={stageRef}
      className="pb-stage"
      data-on-stage={onStage}
      data-chrome={chromeVisible}
      onMouseMove={onStage ? wakeChrome : undefined}
      onTouchStart={onStage ? wakeChrome : undefined}
    >
      <div ref={viewportRef} className="pb-stage-viewport">
        {practice.cueLine && <div className="pb-cue-line" aria-hidden="true" />}

        {countdown > 0 && (
          <div className="pb-stage-countdown" aria-live="polite">
            <span>{countdown}</span>
            {intention.trim() && <p>This one is for {intention.trim()}.</p>}
          </div>
        )}

        <div
          ref={innerRef}
          className="pb-prompt"
          style={{
            ['--prompt-scale' as string]: String(practice.fontScale),
            transform: `translateY(${-offset}px)${practice.mirror ? ' scaleX(-1)' : ''}`,
            transition: running ? 'none' : 'transform 260ms ease',
          }}
        >
          {stageText}
        </div>
      </div>

      {/* progress hairline, always visible, never in the way */}
      <div className="pb-stage-progress" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {/* stage controls: a single bar, fading when you stop moving */}
      <div className="pb-stage-bar">
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          onClick={() => {
            if (running) stop();
            else if (countdown > 0) setCountdown(0);
            else if (offset > 0) setRunning(true);
            else restart();
            wakeChrome();
          }}
        >
          {running ? <Pause size={16} /> : <Play size={16} />}
          <span className="pb-hide-xs">{running ? 'Pause' : offset > 0 ? 'Resume' : 'Start'}</span>
        </button>

        <button type="button" className="pb-icon-btn" onClick={restart} title="Restart (R)" aria-label="Restart">
          <RotateCcw size={16} />
        </button>

        <label className="pb-stage-slider" title="Pace">
          <Gauge size={15} aria-hidden="true" />
          <input
            type="range"
            min={70}
            max={220}
            step={5}
            value={practice.wpm}
            onChange={(event) => {
              patchPractice({ wpm: Number(event.target.value) });
              wakeChrome();
            }}
            aria-label="Words per minute"
          />
          <span className="pb-mono">{practice.wpm}</span>
        </label>

        <label className="pb-stage-slider pb-hide-sm" title="Text size">
          <Type size={15} aria-hidden="true" />
          <input
            type="range"
            min={0.7}
            max={2.6}
            step={0.1}
            value={practice.fontScale}
            onChange={(event) => {
              patchPractice({ fontScale: Number(event.target.value) });
              wakeChrome();
            }}
            aria-label="Text size"
          />
        </label>

        <button
          type="button"
          className="pb-icon-btn pb-hide-sm"
          onClick={() => patchPractice({ mirror: !practice.mirror })}
          aria-pressed={practice.mirror}
          title="Mirror for beam-splitter glass"
          aria-label="Mirror text"
        >
          <FlipHorizontal size={16} />
        </button>

        <div className="pb-stage-clocks">
          <TimerChip label="Elapsed" value={formatClock(Math.round(elapsed))} />
          <TimerChip
            label={paceDelta >= 0 ? 'Over' : 'Under'}
            value={formatClock(Math.round(Math.abs(paceDelta)))}
            tone={Math.abs(paceDelta) > 30 ? 'var(--c-warn)' : 'var(--c-ok)'}
          />
          <TimerChip label="Target" value={formatClock(targetSeconds)} className="pb-hide-sm" />
        </div>

        <button
          type="button"
          className="pb-icon-btn"
          onClick={() => void (onStage ? leaveStage() : enterStage())}
          title={onStage ? 'Leave the stage (Esc)' : 'Go full screen (F)'}
          aria-label={onStage ? 'Leave full screen' : 'Enter full screen'}
        >
          {onStage || fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {onStage && (
          <button
            type="button"
            className="pb-icon-btn pb-stage-exit"
            onClick={() => void leaveStage()}
            aria-label="Close the stage"
            title="Close the stage (Esc)"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );

  /* ------------------------------------------------------------------ */

  if (!item) {
    return (
      <div className="pb-page">
        <RehearseHero items={items} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="pb-panel pb-empty">
          <Clapper />
          <h2>Pick something to say out loud</h2>
          <p>
            Choose a speech above, open one from the library and press <strong>Rehearse</strong>, or
            write your own first. The stage works the same either way.
          </p>
          <div className="pb-empty-actions">
            <Link to="/" className="pb-btn pb-btn-primary">
              Browse the library
            </Link>
            <Link to="/write" className="pb-btn">
              Write something first
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-page" data-rehearsing={onStage}>
      {!onStage && (
        <RehearseHero
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          title={item.title}
          minutes={Math.max(1, Math.round(targetSeconds / 60))}
          words={words}
          onStart={() => void enterStage()}
        />
      )}

      {!onStage && (
        <section className="pb-panel pb-before">
          <div className="pb-before-head">
            <HeartHandshake size={16} aria-hidden="true" />
            <strong>Before you start</strong>
          </div>
          <label className="pb-before-label" htmlFor="intention">
            Who is this for? One name, or one kind of person. Saying it out loud changes how you say
            everything else.
          </label>
          <div className="pb-before-row">
            <input
              id="intention"
              className="pb-input"
              placeholder="e.g. the new apprentices, or: my sister"
              value={intention}
              onChange={(event) => setIntention(event.target.value)}
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
              <Wind size={15} /> {breathing ? 'Stop' : 'Breathe first'}
            </button>
          </div>

          {breathing && (
            <div className="pb-breath anim-enter">
              <div
                className="pb-breath-ring"
                style={{
                  transform: `scale(${
                    breath.label === 'Breathe in' ? 1.15 : breath.label === 'Breathe out' ? 0.85 : 1
                  })`,
                }}
              >
                <span>{Math.ceil(breath.remaining / 1000)}</span>
              </div>
              <div className="pb-breath-label">{breath.label}</div>
              <p>Four counts in, four held, six out. Three rounds is enough to change your voice.</p>
            </div>
          )}
        </section>
      )}

      {stage}

      {!onStage && (
        <div className="pb-stage-footnote">
          <span>
            {words} words · {Math.round(progress * 100)}% through
          </span>
          <span className="pb-keys">
            <kbd className="pb-kbd">Space</kbd> play · <kbd className="pb-kbd">↑↓</kbd> pace ·{' '}
            <kbd className="pb-kbd">R</kbd> restart · <kbd className="pb-kbd">F</kbd> full screen
          </span>
          <Link to={`/read/${encodeURIComponent(item.id)}`} className="pb-btn pb-btn-sm">
            Open reader
          </Link>
        </div>
      )}

      {finished && !onStage && (
        <section className="pb-panel anim-enter pb-after">
          <div className="pb-rule">
            <span>❧ After the run</span>
          </div>
          <p className="pb-after-closing">{closing}</p>

          <label className="pb-label" htmlFor="letter">
            A letter to yourself, before the real thing
          </label>
          <p className="pb-after-prompt">{letterPrompt}</p>
          <textarea
            id="letter"
            className="pb-textarea"
            style={{ minHeight: 110 }}
            value={letter}
            onChange={(event) => setLetter(event.target.value)}
            placeholder="Dear me, before I walk in…"
            maxLength={2000}
          />
          <div className="pb-after-actions">
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
            <button type="button" className="pb-btn" onClick={() => void enterStage()}>
              <RotateCcw size={15} /> Run it again
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RehearseHero({
  items,
  selectedId,
  onSelect,
  title,
  minutes,
  words,
  onStart,
}: {
  items: { id: string; title: string; minutes: number }[];
  selectedId: string;
  onSelect: (id: string) => void;
  title?: string;
  minutes?: number;
  words?: number;
  onStart?: () => void;
}) {
  return (
    <section className="pb-panel pb-rehearse-hero anim-enter">
      <div className="pb-rehearse-hero-text">
        <span className="pb-eyebrow">The Rehearsal Room</span>
        <h1 className="pb-page-title">{title ?? 'Say it out loud, before it counts'}</h1>
        <p className="pb-page-sub">
          {title
            ? `${words?.toLocaleString()} words · about ${minutes} minute${minutes === 1 ? '' : 's'} at your pace. Go full screen and let it run.`
            : 'A full-screen stage, your words at your pace, and a clock that tells you the truth. The only part of speaking that actually builds the skill is the part where you say it.'}
        </p>
      </div>

      <div className="pb-rehearse-hero-controls">
        <div className="pb-select-wrap">
          <select
            className="pb-select"
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
            aria-label="Choose a speech to rehearse"
          >
            <option value="">Choose a speech…</option>
            {items.map((speech) => (
              <option key={speech.id} value={speech.id}>
                {speech.title} · {speech.minutes} min
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
        {onStart && (
          <button type="button" className="pb-btn pb-btn-primary pb-btn-lg" onClick={onStart}>
            <Maximize2 size={17} /> Take the stage
          </button>
        )}
      </div>
    </section>
  );
}

function Clapper() {
  return (
    <span className="pb-empty-mark" aria-hidden="true">
      <Clapperboard size={26} />
    </span>
  );
}

function TimerChip({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`pb-timer ${className ?? ''}`}>
      <span className="pb-mono" style={{ color: tone ?? 'var(--c-ink)' }}>
        {value}
      </span>
      <span className="pb-timer-label">{label}</span>
    </div>
  );
}
