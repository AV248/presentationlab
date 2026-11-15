'use client';

/**
 * Sign-in methods, drawn in Presentation Buddy's clothes — and honest about
 * failure when it happens.
 *
 * Clerk still owns every step — the session, MFA, bot checks, the account
 * page. All this component does is name the two providers people actually
 * arrive with (Google and Microsoft) instead of hiding them behind a generic
 * "Continue". Clerk's own modal stays one tap away for e-mail codes,
 * passkeys and everything else enabled in the dashboard.
 *
 * Redirect-based, deliberately: a popup is blocked by enough in-app browsers
 * and strict setups that the redirect is the honest default. Clerk returns
 * people to /sso-callback, which finishes the handshake and sends them back
 * to the page they were reading.
 *
 * ── Why the diagnostics exist ─────────────────────────────────────────────
 * "I signed in and came back signed out" has exactly four causes, and none of
 * them is visible without looking: the wrong Clerk instance (a live site
 * holding a development key), session cookies the browser refused (third-party
 * blocking), an origin Clerk does not know about, or a blocked bootstrap
 * script. So this component shows the facts — instance, frontend API host,
 * this origin, session state — and, when a round trip comes back empty, says
 * which of the four to check first. No support ticket needed to find out.
 */
import { useEffect, useState } from 'react';
import { useClerk, useSignIn, useAuth as useClerkAuth } from '@clerk/react';
import { AlertTriangle, Mail } from 'lucide-react';
import { GoogleMark, MicrosoftMark } from './AuthMarks';
import {
  CLERK_FRONTEND_API,
  CLERK_INSTANCE,
  CLERK_IS_LIVE,
  CLERK_SSO_CALLBACK_PATH,
  SIGNIN_PENDING_KEY,
  clerkAuthMessage,
} from '../services/clerk';
import { useUi } from '../store/ui';

type OAuthStrategy = 'oauth_google' | 'oauth_microsoft';

const METHODS: {
  id: OAuthStrategy;
  strategy: OAuthStrategy;
  name: string;
  note: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'oauth_google',
    strategy: 'oauth_google',
    name: 'Continue with Google',
    note: 'Fastest on Android, Chrome and Gmail accounts.',
    icon: <GoogleMark />,
  },
  {
    id: 'oauth_microsoft',
    strategy: 'oauth_microsoft',
    name: 'Continue with Microsoft',
    note: 'For Windows, Edge, and work or school accounts.',
    icon: <MicrosoftMark />,
  },
];

/** How long a pending sign-in marker stays meaningful. */
const PENDING_WINDOW_MS = 15 * 60 * 1000;

/** The four causes of "came back signed out", in the order worth checking. */
const CAUSES = [
  {
    head: 'This build is using a Clerk development key.',
    body: 'A pk_test_ key talks to a development instance whose cookies live on a third-party domain — browsers that block those make a finished sign-in disappear. The line above shows which instance this page is on; production keys start pk_live_.',
  },
  {
    head: 'The browser refused the session cookie.',
    body: 'Try a normal window (not private), with third-party cookies allowed for clerk.aavrit.dedyn.io — or a different browser. In-app browsers (Instagram, WhatsApp, Gmail) are the worst offenders.',
  },
  {
    head: 'This origin is not registered with Clerk.',
    body: 'Clerk → Domains must list the address in the address bar (for example https://presentationbuddy.aavrit.dedyn.io). Until it does, the session has nowhere to land.',
  },
  {
    head: 'The bootstrap script was blocked.',
    body: 'A Content-Security-Policy or an ad blocker can stop cdn.protect.clerk.com. Open the browser console: a CSP violation here names the exact host to allow.',
  },
];

export function ClerkAuthButtons() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { fetchStatus: signInFetchStatus, signIn } = useSignIn();
  const closeSheet = useUi((s) => s.closeSignIn);
  const [busy, setBusy] = useState<OAuthStrategy | 'email' | 'create' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cameBackEmpty, setCameBackEmpty] = useState(false);

  /**
   * Where to land after the round trip: the page they left, minus the
   * callback itself. Clerk appends its parameters to the callback URL, so
   * sending people "back" there would loop the handshake.
   */
  const destination = () => {
    const here = `${window.location.pathname}${window.location.search}`;
    return here.startsWith(CLERK_SSO_CALLBACK_PATH) ? '/' : here;
  };

  /**
   * Did we just come back from a provider without a session? If the marker
   * set on the way out is still here while Clerk reports signed out, yes —
   * and the visitor deserves to be told, not left guessing.
   */
  useEffect(() => {
    if (!isLoaded) return;
    let at = 0;
    try {
      at = Number(sessionStorage.getItem(SIGNIN_PENDING_KEY) ?? 0);
    } catch {
      return;
    }
    if (!at || Date.now() - at > PENDING_WINDOW_MS) return;
    if (isSignedIn) {
      setCameBackEmpty(false);
      return;
    }
    setCameBackEmpty(true);
  }, [isLoaded, isSignedIn]);

  const withProvider = async (strategy: OAuthStrategy) => {
    setNote(null);
    if (signInFetchStatus === 'fetching') {
      setNote('Still waking up sign-in — try once more in a moment.');
      return;
    }
    // Leave a breadcrumb: if we come back and Clerk still says signed out,
    // the sheet above this component will explain why.
    try {
      sessionStorage.setItem(SIGNIN_PENDING_KEY, String(Date.now()));
    } catch { /* private mode */ }
    setBusy(strategy);
    try {
      const { error } = await signIn.sso({
        strategy,
        redirectUrl: destination(),
        redirectCallbackUrl: CLERK_SSO_CALLBACK_PATH,
      });
      if (error) {
        setBusy(null);
        setNote(clerkAuthMessage(error));
      }
      // The browser is leaving for the provider; the button stays busy on
      // purpose so nobody double-clicks their way into two attempts.
    } catch (error) {
      setBusy(null);
      setNote(clerkAuthMessage(error));
    }
  };

  /** Clerk's own modal: e-mail codes, passkeys, whatever else is enabled. */
  const withClerkModal = (which: 'signIn' | 'signUp') => {
    setNote(null);
    setBusy(which === 'signIn' ? 'email' : 'create');
    // Ours closes first so Clerk's modal is never stacked behind this sheet.
    closeSheet();
    if (which === 'signIn') void clerk.openSignIn();
    else void clerk.openSignUp();
  };

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cameBackEmpty && (
        <div
          className="pb-well"
          role="alert"
          style={{
            padding: 14,
            borderColor: 'var(--c-warn)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <strong style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.92rem' }}>
            <AlertTriangle size={15} style={{ color: 'var(--c-warn)', flex: '0 0 auto' }} />
            You came back from the provider, but no session arrived.
          </strong>
          <p className="pb-soft" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>
            The sign-in itself worked — Clerk is{' '}
            {isLoaded ? 'loaded' : 'still loading'} on this page and reports{' '}
            {isSignedIn ? 'a session' : 'no session'}. That means the round trip finished, but this
            browser could not hold on to the session. The four causes, in the order worth checking:
          </p>
          <ol style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 8 }}>
            {CAUSES.map((cause) => (
              <li key={cause.head} className="pb-soft" style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
                <strong>{cause.head}</strong> {cause.body}
              </li>
            ))}
          </ol>
          <p className="pb-muted" style={{ fontSize: '0.76rem', lineHeight: 1.6 }}>
            The details below are the facts to check the list against.
          </p>
        </div>
      )}

      {METHODS.map((method) => (
        <div key={method.strategy} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            type="button"
            className="pb-btn pb-btn-lg pb-btn-block"
            onClick={() => void withProvider(method.strategy)}
            disabled={busy !== null}
            style={{ justifyContent: 'flex-start' }}
          >
            {busy === method.strategy ? (
              <span className="pb-spinner" aria-hidden="true" />
            ) : (
              <span style={{ display: 'flex' }}>{method.icon}</span>
            )}
            {busy === method.strategy ? 'Taking you to sign in…' : method.name}
          </button>
          <p className="pb-muted" style={{ fontSize: '0.74rem' }}>{method.note}</p>
        </div>
      ))}

      <div className="pb-rule" style={{ margin: '6px 0 2px' }}>
        <span>or</span>
      </div>

      <button
        type="button"
        className="pb-btn pb-btn-lg pb-btn-block pb-btn-primary"
        onClick={() => withClerkModal('signIn')}
        disabled={busy !== null}
        style={{ justifyContent: 'flex-start' }}
      >
        {busy === 'email' ? <span className="pb-spinner" aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}
        Continue with e-mail or another way
      </button>

      <button
        type="button"
        className="pb-btn pb-btn-lg pb-btn-block"
        onClick={() => withClerkModal('signUp')}
        disabled={busy !== null}
      >
        Create an account
      </button>

      {note && (
        <p style={{ color: 'var(--c-bad)', fontSize: '0.82rem', lineHeight: 1.6 }} role="alert">
          {note}
        </p>
      )}

      <p className="pb-muted" style={{ fontSize: '0.76rem', lineHeight: 1.6 }}>
        Google, Microsoft, e-mail and whichever other methods are switched on appear in one step.
        {!CLERK_IS_LIVE && (
          <>
            {' '}
            <strong>Development keys are in use</strong> — add your live Clerk keys before launching.
          </>
        )}
      </p>

      <details className="pb-well" style={{ padding: '10px 12px' }}>
        <summary
          className="pb-muted"
          style={{ fontSize: '0.78rem', cursor: 'pointer', userSelect: 'none' }}
        >
          Trouble signing in? The facts
        </summary>
        <dl
          className="pb-mono"
          style={{
            fontSize: '0.72rem',
            lineHeight: 1.8,
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 10,
            rowGap: 2,
            wordBreak: 'break-word',
          }}
        >
          <dt className="pb-muted">Clerk instance</dt>
          <dd>{CLERK_INSTANCE}</dd>
          <dt className="pb-muted">Frontend API</dt>
          <dd>{CLERK_FRONTEND_API || '(unknown)'}</dd>
          <dt className="pb-muted">This origin</dt>
          <dd>{origin}</dd>
          <dt className="pb-muted">Clerk loaded</dt>
          <dd>{String(isLoaded)}</dd>
          <dt className="pb-muted">Session</dt>
          <dd>{String(isSignedIn)}</dd>
        </dl>
        <p className="pb-muted" style={{ fontSize: '0.74rem', lineHeight: 1.6, marginTop: 8 }}>
          The Frontend API line is the tell: on a live site it must read the address Clerk serves
          sign-in from for this site (for example clerk.aavrit.dedyn.io). If it reads something
          ending in .clerk.accounts.dev, this build is on development keys — swap
          VITE_CLERK_PUBLISHABLE_KEY for the pk_live_ value and redeploy. The other three causes are
          in the checklist above; Clerk → Logs shows the server side, filterable to
          oauth_callback.failed.
        </p>
      </details>
    </div>
  );
}
