'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Ambient } from '@/components/Ambient';
import { Toasts } from '@/components/Toasts';
import { CommandPalette } from '@/components/CommandPalette';
import { HelpDialog, ThemeSheet } from '@/components/Overlays';
import { SignInSheet } from '@/components/SignIn';
import { Splash } from '@/components/Splash';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/components/AuthProvider';
import { useThemeEngine } from '@/hooks/useThemeEngine';
import { useCloud } from '@/store/cloud';
import { useAuth } from '@/store/auth';

/**
 * Everything that has to exist exactly once, around every page.
 *
 * This is 2.x's `App.tsx` with the router taken out of it: the App Router now
 * owns the route, so `{children}` is slotted into the shell instead of a
 * `<Routes>` table being rendered inside it. The Clerk provider, the theme
 * engine, the cloud connection, the overlays and the offline worker are
 * unchanged — same order, same reasons.
 */

/** A new page starts at the top, as a page does. */
function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

/** Offline support: cache the shell so Presentation Buddy opens anywhere. */
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is a bonus, never a blocker */
      });
    };
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useThemeEngine();
  useServiceWorker();

  useEffect(() => {
    // Listen for Google / Microsoft sign-in state.
    useAuth.getState().init();
  }, []);

  useEffect(() => {
    // Optional cloud sync, deferred until the browser is idle so the first
    // paint is never waiting on a network call.
    const run = () => void useCloud.getState().connect();
    const idle = window.requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (typeof idle === 'function') idle(run, { timeout: 2500 });
    else window.setTimeout(run, 1200);
  }, []);

  return (
    <AuthProvider>
      <Splash />
      <Ambient />
      <ScrollToTop />
      <AppShell>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppShell>
      <CommandPalette />
      <ThemeSheet />
      <SignInSheet />
      <HelpDialog />
      <FeedbackDialog />
      <Toasts />
    </AuthProvider>
  );
}
