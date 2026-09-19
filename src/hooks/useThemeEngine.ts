import { useEffect } from 'react';
import { applyThemeVars } from '../design/compile';
import { useSettings } from '../store/settings';

/**
 * Single place where the five-axis selection becomes real CSS.
 * Runs on mount and on every change, and re-applies when the device's
 * reduced-motion preference flips.
 */
export function useThemeEngine() {
  const theme = useSettings((s) => s.theme);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let systemReduced = media.matches;

    const apply = () => {
      applyThemeVars(theme, {
        reducedMotion:
          reducedMotion === 'on' || (reducedMotion === 'auto' && systemReduced),
      });
    };

    apply();

    const onChange = (event: MediaQueryListEvent) => {
      systemReduced = event.matches;
      apply();
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme, reducedMotion]);
}
