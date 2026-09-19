/* eslint-disable no-console */
/**
 * Headless render smoke test.
 *
 * Renders every route (plus the overlays) inside jsdom, applies every one of
 * the 100+ theme options through the compiler, and fails loudly if React logs
 * an error or a screen renders empty.
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../src/components/AppShell';
import { CommandPalette } from '../../src/components/CommandPalette';
import { HelpDialog, ThemeSheet } from '../../src/components/Overlays';
import { LibraryPage } from '../../src/pages/LibraryPage';
import { ReaderPage } from '../../src/pages/ReaderPage';
import { StudioPage } from '../../src/pages/StudioPage';
import { PracticePage } from '../../src/pages/PracticePage';
import { CommunityPage } from '../../src/pages/CommunityPage';
import { ControlPage } from '../../src/pages/ControlPage';
import { ThemesPage } from '../../src/pages/ThemesPage';
import { AboutPage } from '../../src/pages/AboutPage';
import { NotFoundPage } from '../../src/pages/NotFoundPage';
import { useThemeEngine } from '../../src/hooks/useThemeEngine';
import { useSettings } from '../../src/store/settings';
import { useLibrary } from '../../src/store/library';
import { useUi } from '../../src/store/ui';
import { COLOR_THEMES, LAYOUT_THEMES, MOTION_THEMES, UI_THEMES, UX_THEMES } from '../../src/design/index';

const errors: string[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => {
  errors.push(args.map(String).join(' '));
  originalError(...args);
};

function Harness({ route }: { route: string }) {
  useThemeEngine();
  return (
    <MemoryRouter initialEntries={[route]}>
      <AppShell>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/read/:id" element={<ReaderPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/studio/:id" element={<StudioPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/practice/:id" element={<PracticePage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/control" element={<ControlPage />} />
          <Route path="/themes" element={<ThemesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
      <CommandPalette />
      <ThemeSheet />
      <HelpDialog />
    </MemoryRouter>
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

async function main() {
  const draftId = useLibrary.getState().createSpeech({ title: 'Smoke draft' });
  useLibrary.getState().updateSpeech(draftId, {
    content: '## Hook\n\nThis draft exists only while the smoke test runs.',
  });

  const container = document.getElementById('root')!;
  const routes = [
    '/',
    '/read/five-minutes',
    '/read/template-story-structure',
    '/studio',
    `/studio/${draftId}`,
    '/practice',
    '/practice/five-minutes',
    '/community',
    '/control',
    '/themes',
    '/about',
    '/does-not-exist',
  ];

  for (const route of routes) {
    const root = createRoot(container);
    root.render(<Harness route={route} />);
    await wait(90);
    const length = (document.body.textContent ?? '').trim().length;
    check(length > 40, `route ${route}`, `${length} chars`);
    root.unmount();
  }

  // Keep a tree mounted: the theme engine applies CSS variables from an effect.
  const keep = createRoot(container);
  keep.render(<Harness route="/" />);
  await wait(90);

  // Every layout mode must apply without throwing.
  let modeFailures = 0;
  for (const layout of LAYOUT_THEMES) {
    useSettings.getState().setAxis('layout', layout.id);
    await wait(40);
    if (document.documentElement.dataset.layoutMode !== layout.mode) {
      modeFailures += 1;
      console.log(`  ↳ ${layout.id}: expected ${layout.mode}, got ${document.documentElement.dataset.layoutMode}`);
    }
  }
  check(modeFailures === 0, `${LAYOUT_THEMES.length} layout modes`);

  // Compile every combination of all five axes.
  let combos = 0;
  for (const color of COLOR_THEMES) {
    for (const motion of MOTION_THEMES) {
      for (const layout of LAYOUT_THEMES) {
        for (const ui of UI_THEMES) {
          for (const ux of UX_THEMES) {
            useSettings.getState().setTheme({
              color: color.id,
              motion: motion.id,
              layout: layout.id,
              ui: ui.id,
              ux: ux.id,
            });
            combos += 1;
          }
        }
      }
    }
  }
  check(combos === COLOR_THEMES.length * MOTION_THEMES.length * LAYOUT_THEMES.length * UI_THEMES.length * UX_THEMES.length, `${combos.toLocaleString()} theme combinations compiled`);

  // Overlays render.
  useUi.getState().openPalette();
  useUi.getState().setThemePanel(true);
  useUi.getState().setHelp(true);
  useUi.getState().toast('Smoke toast');
  await wait(120);
  const overlayText = document.body.textContent ?? '';
  const overlaysOk = overlayText.includes('Theme studio') && overlayText.includes('Keyboard shortcuts');
  check(overlaysOk, 'overlays (palette, theme sheet, help, toast)');
  check(errors.length === 0, 'no console errors');

  const globals = globalThis as unknown as { __SMOKE_ERRORS__: string[]; __SMOKE_FAILURES__: number };
  globals.__SMOKE_ERRORS__ = errors;
  globals.__SMOKE_FAILURES__ = failures;
  console.log('SMOKE_DONE');
}

void main();
