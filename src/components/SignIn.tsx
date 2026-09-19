import { useEffect } from 'react';
import { Check, Heart, PencilLine, Share2, X } from 'lucide-react';
import { useUi } from '../store/ui';
import { useAuth } from '../store/auth';
import { isFirebaseAvailable } from '../store/auth';
import type { SignInProvider } from '../services/auth';

const PROVIDERS: { id: SignInProvider; name: string; icon: React.ReactNode; note: string }[] = [
  {
    id: 'google',
    name: 'Continue with Google',
    icon: (
      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-3.59-13.48-8.71l-7.98 6.2C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    ),
    note: 'Fastest on Android, Chrome and Gmail accounts.',
  },
  {
    id: 'microsoft',
    name: 'Continue with Microsoft',
    icon: (
      <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    ),
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
  const configured = isFirebaseAvailable();

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
          <div className="pb-well" style={{ padding: 16, fontSize: '0.86rem' }}>
            <strong>Sign-in is not switched on for this installation.</strong>
            <p className="pb-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
              Add the Firebase environment variables (see <span className="pb-mono">.env.example</span>)
              and enable the Google and Microsoft providers in the Firebase console. Everything else
              in Presentation Buddy keeps working without it.
            </p>
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
          to you. Nothing else. No password ever reaches us — that is handled by Google or Microsoft.
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
