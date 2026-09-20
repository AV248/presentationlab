import { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Ambient } from './components/Ambient';
import { Toasts } from './components/Toasts';
import { CommandPalette } from './components/CommandPalette';
import { HelpDialog, ThemeSheet } from './components/Overlays';
import { SignInSheet } from './components/SignIn';
import { AppRoutes } from './components/AppRoutes';
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
    <BrowserRouter>
      <Ambient />
      <ScrollToTop />
      <AppShell>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AppShell>
      <CommandPalette />
      <ThemeSheet />
      <SignInSheet />
      <HelpDialog />
      <Toasts />
    </BrowserRouter>
  );
}
