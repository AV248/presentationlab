'use client';

import { useEffect, useState } from 'react';
/** Entry (2.6): empty screen → the stairs of "The Rise" draw themselves up,
 * step by step → the dot blinks awake above the top step → wordmark fades in.
 * Once per session, ~1.8s, click/key to skip, honours reduced motion. */
const LEAVES = [
  { left: '6%', dur: '7.5s', delay: '0s', color: '#c96f2e', size: 13 },
  { left: '16%', dur: '9s', delay: '1.2s', color: '#a8542a', size: 10 },
  { left: '27%', dur: '8s', delay: '0.5s', color: '#d9a441', size: 15 },
  { left: '38%', dur: '10s', delay: '2s', color: '#7a7d3a', size: 11 },
  { left: '49%', dur: '7s', delay: '1.6s', color: '#b0532f', size: 14 },
  { left: '60%', dur: '9.5s', delay: '0.2s', color: '#c98a2e', size: 10 },
  { left: '71%', dur: '8.4s', delay: '2.6s', color: '#96502c', size: 13 },
  { left: '82%', dur: '7.8s', delay: '1s', color: '#8a8540', size: 12 },
  { left: '91%', dur: '9.2s', delay: '0.8s', color: '#cf7a33', size: 11 },
  { left: '96%', dur: '8.8s', delay: '2.2s', color: '#a8641f', size: 9 },
];

export function Splash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('pb.splash.seen')) return undefined;
    } catch {
      // Keep the splash available when session storage is disabled.
    }

    setShow(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const done = window.setTimeout(() => setLeaving(true), reduced ? 250 : 1750);
    const gone = window.setTimeout(() => { setShow(false); try { sessionStorage.setItem('pb.splash.seen', '1'); } catch { /* ignore */ } }, reduced ? 450 : 2150);
    const skip = () => { setLeaving(true); window.setTimeout(() => setShow(false), 120); try { sessionStorage.setItem('pb.splash.seen', '1'); } catch { /* ignore */ } };
    window.addEventListener('pointerdown', skip); window.addEventListener('keydown', skip);
    return () => { window.clearTimeout(done); window.clearTimeout(gone); window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip); };
  }, []);
  if (!show) return null;
  return (
    <div className={`pb-splash${leaving ? ' pb-splash-leave' : ''}`} role="img" aria-label="Presentation Buddy">
      {/* Delightful retro autumn: leaves drifting down a pure, empty sky. */}
      <div className="pb-splash-leaves" aria-hidden="true">
        {LEAVES.map((leaf, i) => (
          <span key={i} className="pb-splash-leaf" style={{ left: leaf.left, animationDuration: leaf.dur, animationDelay: leaf.delay, background: leaf.color, width: leaf.size, height: leaf.size }} />
        ))}
      </div>
      <svg className="pb-splash-mark" viewBox="0 0 32 32" width="112" height="112" aria-hidden="true">
        <path className="pb-splash-stairs" d="M5 25.5 H11.5 V18.5 H18 V11.5 H24.5" fill="none" stroke="var(--c-accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="pb-splash-dot" cx="24.5" cy="5" r="2.6" fill="var(--c-accent)" />
      </svg>
      <div className="pb-splash-word">Presentation <span>Buddy</span></div>
      <div className="pb-splash-tag">Qualities are not gifted, they are built.</div>
    </div>
  );
}
