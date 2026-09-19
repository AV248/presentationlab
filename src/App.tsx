import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Ambient } from './components/Ambient';
import { Toasts } from './components/Toasts';
import { CommandPalette } from './components/CommandPalette';
import { HelpDialog, ThemeSheet } from './components/Overlays';
import { SignInSheet } from './components/SignIn';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { StudioPage } from './pages/StudioPage';
import { PracticePage } from './pages/PracticePage';
import { CommunityPage } from './pages/CommunityPage';
import { ControlPage } from './pages/ControlPage';
import { ThemesPage } from './pages/ThemesPage';
import { AboutPage } from './pages/AboutPage';
import { WebPage } from './pages/WebPage';
import { DeskPage } from './pages/DeskPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useThemeEngine } from './hooks/useThemeEngine';
import { useCloud } from './store/cloud';
import { useAuth } from './store/auth';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App() {
  useThemeEngine();

  useEffect(() => {
    // Listen for Google / Microsoft sign-in state.
    useAuth.getState().init();
  }, []);

  useEffect(() => {
    // Optional cloud sync, deferred until the browser is idle so the first
    // paint is never waiting on a network call.
    const run = () => void useCloud.getState().connect();
    const idle = window.requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
    if (typeof idle === 'function') idle(run, { timeout: 2500 });
    else window.setTimeout(run, 1200);
  }, []);

  return (
    <HashRouter>
      <Ambient />
      <ScrollToTop />
      <AppShell>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/read/:id" element={<ReaderPage />} />
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
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ErrorBoundary>
      </AppShell>
      <CommandPalette />
      <ThemeSheet />
      <SignInSheet />
      <HelpDialog />
      <Toasts />
    </HashRouter>
  );
}
