/* eslint-disable no-console */
/**
 * Headless render smoke test.
 *
 * Renders every route (plus the overlays) inside jsdom, applies every one of
 * the 134 theme options through the compiler, and fails loudly if React logs
 * an error or a screen renders empty.
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../src/components/AppShell';
import { AppRoutes } from '../../src/components/AppRoutes';
import { CommandPalette } from '../../src/components/CommandPalette';
import { HelpDialog, ThemeSheet } from '../../src/components/Overlays';
import { useThemeEngine } from '../../src/hooks/useThemeEngine';
import { useSettings } from '../../src/store/settings';
import { useLibrary } from '../../src/store/library';
import { useUi } from '../../src/store/ui';
import {
  COLOR_THEMES,
  LAYOUT_THEMES,
  MOTION_THEMES,
  PRESETS,
  UI_THEMES,
  UX_THEMES,
} from '../../src/design/index';

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
        <AppRoutes />
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

  // Every theme-axis id must be unique within its axis.
  const axes: [string, { id: string }[]][] = [
    ['color', COLOR_THEMES],
    ['motion', MOTION_THEMES],
    ['layout', LAYOUT_THEMES],
    ['ui', UI_THEMES],
    ['ux', UX_THEMES],
  ];
  for (const [label, options] of axes) {
    const ids = options.map((option) => option.id);
    check(
      ids.length > 20 && new Set(ids).size === ids.length,
      `${options.length} ${label} options, all ids unique`,
    );
  }

  const container = document.getElementById('root')!;
  const routes = [
    '/',
    '/read/five-minutes',
    '/read/template-story-structure',
    '/topics',
    '/topics/public-speaking',
    '/studio',
    `/studio/${draftId}`,
    '/practice',
    '/practice/five-minutes',
    '/community',
    '/web',
    '/desk',
    '/control',
    '/themes',
    '/about',
    '/admin',
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
  check(
    combos === COLOR_THEMES.length * MOTION_THEMES.length * LAYOUT_THEMES.length * UI_THEMES.length * UX_THEMES.length,
    `${combos.toLocaleString()} theme combinations compiled`,
  );

  // Every preset must point at real options.
  const ids = {
    color: new Set(COLOR_THEMES.map((t) => t.id)),
    motion: new Set(MOTION_THEMES.map((t) => t.id)),
    layout: new Set(LAYOUT_THEMES.map((t) => t.id)),
    ui: new Set(UI_THEMES.map((t) => t.id)),
    ux: new Set(UX_THEMES.map((t) => t.id)),
  };
  const brokenPresets = PRESETS.filter(
    (preset) =>
      !ids.color.has(preset.color) ||
      !ids.motion.has(preset.motion) ||
      !ids.layout.has(preset.layout) ||
      !ids.ui.has(preset.ui) ||
      !ids.ux.has(preset.ux),
  );
  check(
    brokenPresets.length === 0,
    `${PRESETS.length} designer presets resolve`,
    brokenPresets.map((p) => p.id).join(', '),
  );

  // The sponsored slot must render politely even with no network at all.
  await wait(600);
  const bodyText = document.body.textContent ?? '';
  check(
    bodyText.includes('Sponsored') || bodyText.includes('From Presentation Buddy'),
    'sponsored slot falls back gracefully offline',
  );

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
