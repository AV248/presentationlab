import { useEffect, useState } from 'react';
/** Entry (2.6): empty screen → the stairs of "The Rise" draw themselves up,
 * step by step → the dot blinks awake above the top step → wordmark fades in.
 * Once per session, ~1.8s, click/key to skip, honours reduced motion. */
export function Splash() {
  const [show, setShow] = useState(() => { try { return !sessionStorage.getItem('pb.splash.seen'); } catch { return true; } });
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!show) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const done = window.setTimeout(() => setLeaving(true), reduced ? 250 : 1750);
    const gone = window.setTimeout(() => { setShow(false); try { sessionStorage.setItem('pb.splash.seen', '1'); } catch { /* ignore */ } }, reduced ? 450 : 2150);
    const skip = () => { setLeaving(true); window.setTimeout(() => setShow(false), 120); try { sessionStorage.setItem('pb.splash.seen', '1'); } catch { /* ignore */ } };
    window.addEventListener('pointerdown', skip); window.addEventListener('keydown', skip);
    return () => { window.clearTimeout(done); window.clearTimeout(gone); window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip); };
  }, [show]);
  if (!show) return null;
  return (
    <div className={`pb-splash${leaving ? ' pb-splash-leave' : ''}`} role="img" aria-label="Presentation Buddy">
      <svg className="pb-splash-mark" viewBox="0 0 32 32" width="112" height="112" aria-hidden="true">
        <path className="pb-splash-stairs" d="M5 25.5 H11.5 V18.5 H18 V11.5 H24.5" fill="none" stroke="var(--c-accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="pb-splash-dot" cx="24.5" cy="5" r="2.6" fill="var(--c-accent)" />
      </svg>
      <div className="pb-splash-word">Presentation <span>Buddy</span></div>
      <div className="pb-splash-tag">Qualities are not gifted, they are built.</div>
    </div>
  );
}
