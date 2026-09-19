import { useSettings } from '../store/settings';
import { useMemo } from 'react';

/**
 * Ambient light field behind the app. It reacts to the colour theme and the
 * motion theme's ambient personality, and disappears entirely when motion is
 * frozen, ambient art is switched off, or the device asks for reduced motion.
 */
export function Ambient() {
  const ambientOn = useSettings((s) => s.ambient);
  const motion = useSettings((s) => s.theme.motion);
  const reduced = useSettings((s) => s.reducedMotion);

  const reducedBySystem =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const frozen = reduced === 'on' || (reduced === 'auto' && reducedBySystem) || motion === 'still';

  const orbs = useMemo(
    () => [
      { top: '-12%', left: '-6%', size: 420, color: 'var(--c-accent)', delay: '0s' },
      { top: '18%', right: '-10%', size: 460, color: 'var(--c-accent-2)', delay: '-6s' },
      { bottom: '-16%', left: '28%', size: 520, color: 'var(--c-accent-3)', delay: '-12s' },
    ],
    [],
  );

  return (
    <div className="pb-ambient" aria-hidden="true" data-ambient-off={!ambientOn || frozen}>
      {orbs.map((orb, index) => (
        <div
          key={index}
          className="pb-orb"
          style={{
            top: orb.top,
            left: orb.left,
            right: orb.right,
            bottom: orb.bottom,
            width: orb.size,
            height: orb.size,
            background: orb.color,
            animationDelay: orb.delay,
          }}
        />
      ))}
    </div>
  );
}
