import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LibraryPage } from '../pages/LibraryPage';
import { ReaderPage } from '../pages/ReaderPage';
import { TopicsPage } from '../pages/TopicsPage';
import { TopicPage } from '../pages/TopicPage';
import { NotFoundPage } from '../pages/NotFoundPage';

/**
 * The single route table, shared by the live app, the jsdom smoke test and
 * the prerenderer. Landing pages (library, reader, topics) load eagerly;
 * the heavier tools are split so the first paint never waits on them.
 */
const StudioPage = lazy(() =>
  import('../pages/StudioPage').then((m) => ({ default: m.StudioPage })),
);
const PracticePage = lazy(() =>
  import('../pages/PracticePage').then((m) => ({ default: m.PracticePage })),
);
const CommunityPage = lazy(() =>
  import('../pages/CommunityPage').then((m) => ({ default: m.CommunityPage })),
);
const WebPage = lazy(() => import('../pages/WebPage').then((m) => ({ default: m.WebPage })));
const DeskPage = lazy(() => import('../pages/DeskPage').then((m) => ({ default: m.DeskPage })));
const ControlPage = lazy(() =>
  import('../pages/ControlPage').then((m) => ({ default: m.ControlPage })),
);
const ThemesPage = lazy(() =>
  import('../pages/ThemesPage').then((m) => ({ default: m.ThemesPage })),
);
const AboutPage = lazy(() =>
  import('../pages/AboutPage').then((m) => ({ default: m.AboutPage })),
);
const AdminPage = lazy(() =>
  import('../pages/AdminPage').then((m) => ({ default: m.AdminPage })),
);

function RouteFallback() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        minHeight: '38vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--c-ink-muted)',
        fontSize: '0.9rem',
      }}
    >
      Loading…
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/read/:id" element={<ReaderPage />} />
        <Route path="/topics" element={<TopicsPage />} />
        <Route path="/topics/:slug" element={<TopicPage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/studio/:id" element={<StudioPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/practice/:id" element={<PracticePage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/web" element={<WebPage />} />
        <Route path="/desk" element={<DeskPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/themes" element={<ThemesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
