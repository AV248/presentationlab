import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { LibraryPage } from '../pages/LibraryPage';
import { ReaderPage } from '../pages/ReaderPage';
import { TopicsPage } from '../pages/TopicsPage';
import { TopicPage } from '../pages/TopicPage';
import { NotFoundPage } from '../pages/NotFoundPage';

/**
 * The single route table, shared by the live app, the jsdom smoke test and
 * the prerenderer.
 *
 * 2.4 renamed the three working rooms to the verbs people actually use:
 *   /practice → /rehearse    /studio → /write    /web → /arrivals
 * The old paths still resolve, permanently redirecting so no shared link
 * and no indexed URL ever breaks.
 */
const PracticePage = lazy(() =>
  import('../pages/PracticePage').then((m) => ({ default: m.PracticePage })),
);
const StudioPage = lazy(() =>
  import('../pages/StudioPage').then((m) => ({ default: m.StudioPage })),
);
const ArrivalsPage = lazy(() =>
  import('../pages/ArrivalsPage').then((m) => ({ default: m.ArrivalsPage })),
);
const CommunityPage = lazy(() =>
  import('../pages/CommunityPage').then((m) => ({ default: m.CommunityPage })),
);
const DeskPage = lazy(() => import('../pages/DeskPage').then((m) => ({ default: m.DeskPage })));
const ControlPage = lazy(() =>
  import('../pages/ControlPage').then((m) => ({ default: m.ControlPage })),
);
const ThemesPage = lazy(() =>
  import('../pages/ThemesPage').then((m) => ({ default: m.ThemesPage })),
);
const AboutPage = lazy(() => import('../pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const AdminPage = lazy(() => import('../pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ClaimPage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.ClaimPage })));
const HandlePage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.HandlePage })));
const SSOCallbackPage = lazy(() =>
  import('../pages/SSOCallbackPage').then((m) => ({ default: m.SSOCallbackPage })),
);

function RouteFallback() {
  return (
    <div className="pb-route-loading" role="status" aria-label="Loading">
      <span className="pb-spinner" aria-hidden="true" />
    </div>
  );
}

/** Carry the :id across a renamed route so old deep links keep working. */
function RedirectWithId({ to }: { to: string }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `${to}/${id}` : to} replace />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/read/:id" element={<ReaderPage />} />
        <Route path="/topics" element={<TopicsPage />} />
        <Route path="/topics/:slug" element={<TopicPage />} />

        {/* the three working rooms */}
        <Route path="/rehearse" element={<PracticePage />} />
        <Route path="/rehearse/:id" element={<PracticePage />} />
        <Route path="/write" element={<StudioPage />} />
        <Route path="/write/:id" element={<StudioPage />} />
        <Route path="/arrivals" element={<ArrivalsPage />} />

        <Route path="/community" element={<CommunityPage />} />
        <Route path="/desk" element={<DeskPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/themes" element={<ThemesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/claim" element={<ClaimPage />} />

        {/* Clerk returns here mid-sign-in. Declared before /:username so the
            handle wildcard can never swallow it. */}
        <Route path="/sso-callback" element={<SSOCallbackPage />} />

        {/* 2.6 handles: /:username and /:username/:slug (own content only) */}
        <Route path="/:username" element={<HandlePage />} />
        <Route path="/:username/:slug" element={<HandlePage />} />

        {/* 2.3 paths, kept alive forever */}
        <Route path="/practice" element={<Navigate to="/rehearse" replace />} />
        <Route path="/practice/:id" element={<RedirectWithId to="/rehearse" />} />
        <Route path="/studio" element={<Navigate to="/write" replace />} />
        <Route path="/studio/:id" element={<RedirectWithId to="/write" />} />
        <Route path="/web" element={<Navigate to="/arrivals" replace />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
