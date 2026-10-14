import { useEffect } from 'react';
import { Check, Heart, PencilLine, Share2, X } from 'lucide-react';
import { EnvCheckPanel } from './EnvCheckPanel';
import { GoogleMark, MicrosoftMark } from './AuthMarks';
import { useUi } from '../store/ui';
import { SignIn } from '@clerk/clerk-react';
import { useAuth, isSignInAvailable } from '../store/auth';
import { CLERK_ENABLED } from '../services/clerk';
import type { SignInProvider } from '../services/auth';

const PROVIDERS: { id: SignInProvider; name: string; icon: React.ReactNode; note: string }[] = [
  {
    id: 'google',
    name: 'Continue with Google',
    icon: <GoogleMark />,
    note: 'Fastest on Android, Chrome and Gmail accounts.',
  },
  {
    id: 'microsoft',
    name: 'Continue with Microsoft',
    icon: <MicrosoftMark />,
    note: 'Best on Windows, Edge and work or school accounts.',
  },
];

/** The sign-in sheet. Opens whenever a visitor asks to do something that needs an account. */
export function SignInSheet() {
  const open = useUi((s) => s.signInOpen);
  const close = useUi((s) => s.closeSignIn);
  const reason = useUi((s) => s.signInReason);
  const pending = useAuth((s) => s.pending);
  const error = useAuth((s) => s.error);
  const signInWith = useAuth((s) => s.signInWith);
  const clearError = useAuth((s) => s.clearError);
  const configured = isSignInAvailable();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="pb-overlay" onClick={close} role="presentation">
      <div
        className="pb-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <span className="pb-eyebrow">A small formality</span>
            <h2 style={{ fontSize: '1.3rem', marginTop: 6 }}>Sign in to take part</h2>
          </div>
          <button type="button" className="pb-icon-btn" onClick={close} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <p className="pb-soft" style={{ fontSize: '0.9rem', marginBottom: 18, lineHeight: 1.65 }}>
          {reason || 'Reading the library is free and always will be.'} Signing in lets you like,
          share and publish — and it is the only way your name appears on the leaderboard.
        </p>

        {!configured ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="pb-well" style={{ padding: 16, fontSize: '0.86rem' }}>
              <strong>Sign-in is not switched on for this installation.</strong>
              <p className="pb-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
                The variables below tell you exactly which one is missing. Everything else in Presentation
                Buddy keeps working without them.
              </p>
            </div>
            <EnvCheckPanel compact />
          </div>
                ) : CLERK_ENABLED ? (
          /* Clerk's own form, shown directly — no wall of our own buttons in
             front of it. Whatever is enabled in the Clerk dashboard appears
             here, and nothing that is not. `routing="hash"` keeps the flow
             inside this sheet instead of navigating away from the page. */
          <div className="pb-clerk-panel">
            <SignIn routing="hash" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="pb-btn pb-btn-lg pb-btn-block"
                onClick={() => void signInWith(provider.id)}
                disabled={pending !== null}
                style={{ justifyContent: 'flex-start' }}
              >
                {pending === provider.id ? (
                  <span className="pb-spinner" />
                ) : (
                  <span style={{ display: 'flex' }}>{provider.icon}</span>
                )}
                {pending === provider.id ? 'Opening a sign-in window…' : provider.name}
              </button>
            ))}
            {PROVIDERS.map((provider) => (
              <p
                key={`${provider.id}-note`}
                className="pb-muted"
                style={{ fontSize: '0.74rem', marginTop: -6 }}
              >
                {provider.note}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p style={{ color: 'var(--c-bad)', fontSize: '0.84rem', marginTop: 14 }}>
            {error}{' '}
            <button
              type="button"
              onClick={clearError}
              style={{ color: 'var(--c-ink-muted)', textDecoration: 'underline' }}
            >
              Dismiss
            </button>
          </p>
        )}

        <div className="pb-rule" style={{ marginTop: 22 }}>
          <span>What signing in unlocks</span>
        </div>

        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {[
            { icon: Heart, text: 'Like and dislike, so the leaderboard reflects real readers.' },
            { icon: Share2, text: 'Share a speech and have the share counted against it.' },
            { icon: PencilLine, text: 'Publish your own speeches and open-mic notes.' },
          ].map((row) => (
            <li key={row.text} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <Check size={15} style={{ color: 'var(--c-ok)', flex: '0 0 auto', marginTop: 2 }} />
              <span className="pb-soft" style={{ fontSize: '0.86rem', lineHeight: 1.6 }}>
                {row.text}
              </span>
            </li>
          ))}
        </ul>

        <p className="pb-muted" style={{ fontSize: '0.76rem', marginTop: 18, lineHeight: 1.6 }}>
          We store your name, e-mail address and profile picture so your speeches can be attributed
          to you. Nothing else. No password ever reaches us — that is handled by{' '}
          {CLERK_ENABLED ? 'Clerk' : 'Google or Microsoft'}.
        </p>
      </div>
    </div>
  );
}

/** Gate helper: runs `action` if signed in, otherwise opens the sign-in sheet. */
export function useGate() {
  const user = useAuth((s) => s.user);
  const openSignIn = useUi((s) => s.openSignIn);

  return (action: () => void, reason: string) => {
    if (user) action();
    else openSignIn(reason);
  };
}
