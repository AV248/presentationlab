import { useEffect } from 'react';
import { applyThemeVars } from '../design/compile';
import { useSettings } from '../store/settings';
import { festivalById } from '../data/festivals';
import { fetchSiteFestival } from '../services/profiles';
import { useProfile } from '../store/profile';
import { useState, useEffect as useFx } from 'react';

/**
 * Single place where the five-axis selection becomes real CSS.
 * Runs on mount and on every change, and re-applies when the device's
 * reduced-motion preference flips.
 */
export function useThemeEngine() {
  const theme = useSettings((s) => s.theme);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const override = useProfile((s) => s.festivalOverride);
  const [siteFestival, setSiteFestival] = useState<string | null>(null);
  useFx(() => { let alive = true; void fetchSiteFestival().then((id) => { if (alive) setSiteFestival(id); }); return () => { alive = false; }; }, []);
  const festival = festivalById(override ?? siteFestival);
  useFx(() => {
    const root = document.documentElement;
    root.dataset.festival = festival.id;
    if (festival.id !== 'none') {
      root.style.setProperty('--c-accent', festival.accent);
      root.style.setProperty('--c-accent-2', festival.accent2);
      root.style.setProperty('--c-glow', festival.glow);
    } else {
      root.style.removeProperty('--c-accent'); root.style.removeProperty('--c-accent-2'); root.style.removeProperty('--c-glow');
    }
  }, [festival, theme]);

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
