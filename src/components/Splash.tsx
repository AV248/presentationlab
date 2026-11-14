'use client';

import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store/settings';

const PETALS = [
  { x: '15%', y: '24%', delay: '0.4s', duration: '2.8s', glyph: '✿', color: '#bb6f62' },
  { x: '82%', y: '31%', delay: '1.1s', duration: '3.4s', glyph: '✧', color: '#d59c42' },
  { x: '23%', y: '73%', delay: '1.6s', duration: '3.1s', glyph: '·', color: '#577d68' },
  { x: '77%', y: '77%', delay: '0.8s', duration: '3.6s', glyph: '✿', color: '#c88769' },
];

/**
 * First arrival: the Rise is drawn from the ground and its round mark climbs
 * each step before the wordmark appears. It plays once per session, can be
 * skipped, and yields immediately to reduced-motion preferences.
 */
export function Splash() {
  // A fixed initial value keeps server and browser markup identical. The
  // session check happens after hydration, never in a render initializer.
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const finishOpening = useRef<() => void>(() => undefined);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('pb.splash.seen')) return;
    } catch {
      // Private browsing can deny storage; the animation still works.
    }

    let finished = false;
    let hideTimer = 0;
    const settings = useSettings.getState();
    const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reduced = settings.reducedMotion === 'on' || systemReduced || settings.theme.motion === 'still';
    const markSeen = () => {
      try { sessionStorage.setItem('pb.splash.seen', '1'); }
      catch { /* private mode */ }
    };
    const hide = () => {
      if (finished) return;
      finished = true;
      markSeen();
      setLeaving(true);
      hideTimer = window.setTimeout(() => setShow(false), 390);
    };
    const skipWithPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.pb-splash-skip')) return;
      hide();
    };
    const skipWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };

    finishOpening.current = hide;
    setShow(true);
    setLeaving(false);
    const finishTimer = window.setTimeout(hide, reduced ? 40 : 2250);
    window.addEventListener('pointerdown', skipWithPointer);
    window.addEventListener('keydown', skipWithEscape);

    return () => {
      window.clearTimeout(finishTimer);
      window.clearTimeout(hideTimer);
      finishOpening.current = () => undefined;
      window.removeEventListener('pointerdown', skipWithPointer);
      window.removeEventListener('keydown', skipWithEscape);
    };
  }, []);

  if (!show) return null;
  return (
    <div className={`pb-splash${leaving ? ' pb-splash-leave' : ''}`} role="status" aria-label="Presentation Buddy opening">
      <button
        type="button"
        className="pb-splash-skip"
        onClick={() => finishOpening.current()}
        aria-label="Skip the opening animation"
      >
        Skip
      </button>
      <div className="pb-splash-atmosphere" aria-hidden="true">
        {PETALS.map((petal, index) => (
          <span
            key={index}
            className="pb-splash-petal"
            style={{
              left: petal.x,
              top: petal.y,
              color: petal.color,
              animationDelay: petal.delay,
              animationDuration: petal.duration,
            }}
          >
            {petal.glyph}
          </span>
        ))}
      </div>
      <svg className="pb-splash-mark" viewBox="0 0 32 32" width="112" height="112" aria-hidden="true">
        <path
          className="pb-splash-stairs"
          d="M5 25.5 H11.5 V18.5 H18 V11.5 H24.5"
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="pb-splash-dot-rest" cx="24.5" cy="8.9" r="2.6" fill="var(--c-accent)" />
        <circle className="pb-splash-dot-motion" cx="5" cy="25.5" r="2.6" fill="var(--c-accent)">
          <animateMotion
            dur="1.55s"
            begin="0.24s"
            fill="freeze"
            calcMode="spline"
            keyTimes="0;0.15;0.3;0.45;0.6;0.75;1"
            keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"
            path="M0 0 Q3.25 -1.2 6.5 0 Q7.6 -3.5 6.5 -7 Q9.75 -8.2 13 -7 Q14.1 -10.5 13 -14 Q16.25 -15.2 19.5 -14 Q20.8 -16.4 19.5 -16.6"
          />
        </circle>
      </svg>
      <div className="pb-splash-word">Presentation <span>Buddy</span></div>
      <div className="pb-splash-tag">A quiet room for words that want to travel.</div>
    </div>
  );
}
