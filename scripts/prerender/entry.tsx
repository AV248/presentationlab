/**
 * Prerender entry — bundled by scripts/prerender/run.mjs and executed inside
 * jsdom. Renders a route with the same shell and pages as the live app but
 * with EAGER imports, so no capture can ever contain a Suspense fallback.
 */
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '../../src/components/AppShell';
import { LibraryPage } from '../../src/pages/LibraryPage';
import { ReaderPage } from '../../src/pages/ReaderPage';
import { TopicsPage } from '../../src/pages/TopicsPage';
import { TopicPage } from '../../src/pages/TopicPage';
import { StudioPage } from '../../src/pages/StudioPage';
import { PracticePage } from '../../src/pages/PracticePage';
import { CommunityPage } from '../../src/pages/CommunityPage';
import { WebPage } from '../../src/pages/WebPage';
import { DeskPage } from '../../src/pages/DeskPage';
import { ControlPage } from '../../src/pages/ControlPage';
import { ThemesPage } from '../../src/pages/ThemesPage';
import { AboutPage } from '../../src/pages/AboutPage';
import { NotFoundPage } from '../../src/pages/NotFoundPage';
import { useSettings } from '../../src/store/settings';
import { applyThemeVars, AXIS_DEFAULTS } from '../../src/design/compile';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function StaticApp({ route }: { route: string }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <AppShell>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/read/:id" element={<ReaderPage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/topics/:slug" element={<TopicPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/web" element={<WebPage />} />
          <Route path="/desk" element={<DeskPage />} />
          <Route path="/control" element={<ControlPage />} />
          <Route path="/themes" element={<ThemesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </MemoryRouter>
  );
}

let root: Root | null = null;
let mountedAt = 0;

/**
 * Mounts a route and waits for its content to settle (two consecutive
 * samples with identical length, max ~6s). Returns the captured innerHTML
 * of #root plus the <html> attributes the theme engine applied.
 */
export async function renderRoute(route: string): Promise<{
  html: string;
  htmlAttrs: Record<string, string>;
}> {
  const container = document.getElementById('root');
  if (!container) throw new Error('root missing');

  // Render the app as a returning visitor: no first-run overlay in captures.
  useSettings.setState({ onboarded: true });
  applyThemeVars(AXIS_DEFAULTS);

  if (root) {
    root.unmount();
    container.replaceChildren();
  }
  root = createRoot(container);
  root.render(<StaticApp route={route} />);
  mountedAt = Date.now();

  let lastLength = -1;
  let stableRounds = 0;
  for (let rounds = 0; rounds < 40; rounds += 1) {
    await wait(150);
    const length = (container.textContent ?? '').length;
    if (length > 200 && length === lastLength) {
      stableRounds += 1;
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }
    lastLength = length;
  }
  await wait(80);

  const htmlAttrs: Record<string, string> = {};
  for (const attr of Array.from(document.documentElement.attributes)) {
    if (attr.name === 'style' || attr.name.startsWith('data-')) htmlAttrs[attr.name] = attr.value;
  }
  void mountedAt;

  return { html: container.innerHTML, htmlAttrs };
}
