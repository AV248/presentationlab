import { useEffect, useState } from 'react';
import { applyThemeVars } from '../design/compile';
import { useSettings } from '../store/settings';
import { festivalById } from '../data/festivals';
import { fetchSiteFestival } from '../services/profiles';

/**
 * The user's own five-axis theme is the base. The festival is a thin seasonal
 * layer over it (accent family + greeting) — never a replacement, never
 * selectable by visitors, and in 2.6.2 settled silently: the only place it can
 * be chosen is the owner's own settings row, `site_settings.theme`.
 */
export function useThemeEngine() {
  const theme = useSettings((s) => s.theme);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const [siteFestival, setSiteFestival] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchSiteFestival().then((id) => { if (alive) setSiteFestival(id); });
    return () => { alive = false; };
  }, []);

  const festival = festivalById(siteFestival);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let systemReduced = media.matches;

    const apply = () => {
      applyThemeVars(theme, {
        reducedMotion:
          reducedMotion === 'on' || (reducedMotion === 'auto' && systemReduced),
      });
      // Festival layer goes on AFTER the user's theme, every time, so a
      // theme change can never wash the season away.
      const root = document.documentElement;
      root.dataset.festival = festival.id;
      if (festival.id !== 'none') {
        root.style.setProperty('--c-accent', festival.accent);
        root.style.setProperty('--c-accent-2', festival.accent2);
        root.style.setProperty('--c-glow', festival.glow);
      } else {
        root.style.removeProperty('--c-accent');
        root.style.removeProperty('--c-accent-2');
        root.style.removeProperty('--c-glow');
      }
    };

    apply();

    const onChange = (event: MediaQueryListEvent) => {
      systemReduced = event.matches;
      apply();
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme, reducedMotion, festival]);
}
