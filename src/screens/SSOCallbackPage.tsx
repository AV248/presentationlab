'use client';

/**
 * /sso-callback — Clerk's handshake, finished politely.
 *
 * Redirect-based sign-in (Google, Microsoft, e-mail links) comes back here
 * with Clerk's parameters on the URL. The invisible <AuthenticateWithRedirectCallback/>
 * does the work; this page exists so the wait is not a blank screen, and so
 * a refusal is explained in words instead of a bounce back to the library
 * with no reason given.
 *
 * When something *does* go wrong, the reason arrives as URL parameters. The
 * common ones are decoded below — a provider refusing consent, a client
 * secret that no longer matches, a redirect URI that is not registered, an
 * organisation that will not allow this account. Those are exactly the
 * riddles worth naming out loud.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/clerk-react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { CLERK_ENABLED } from '../services/clerk';
import { usePageMeta } from '../lib/usePageMeta';

/** Provider refusals worth explaining, keyed by the code that reaches us. */
const REASONS: Record<string, string> = {
  access_denied: 'The sign-in was declined at the provider — often an organisation policy, or the consent screen was closed.',
  invalid_client: 'The provider rejected our credentials. The client secret for this connection needs to be re-pasted into Clerk.',
  redirect_uri_mismatch: 'The provider did not recognise our callback address. Its redirect URI list needs https://clerk.aavrit.dedyn.io/v1/oauth_callback.',
  consent_required: 'This account’s organisation needs an administrator to approve the app once.',
  AADSTS50020: 'That Microsoft account cannot sign in to this app as configured — personal and work accounts must both be allowed on the Entra app.',
  AADSTS65001: 'Microsoft is waiting for an administrator to grant consent for “User.Read”.',
  AADSTS700016: 'The Microsoft app registration could not be found in that tenant — the connection is probably set to the wrong tenant.',
  oauth_not_enabled: 'That sign-in method is not switched on in the Clerk dashboard yet.',
  external_account_not_found: 'No account here uses that provider yet — create one first.',
  session_exists: 'You are already signed in.',
};

function explain(): { code: string; message: string } | null {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('__clerk_status');
  if (status === 'failed' || status === 'expired') {
    const raw = params.get('__clerk_error') ?? params.get('__clerk_reason') ?? '';
    const code = raw || status;
    return {
      code,
      message:
        REASONS[code] ??
        (status === 'expired'
          ? 'That sign-in attempt timed out — they do, after a few minutes. Starting again fixes it.'
          : 'The provider did not let us finish. Trying again usually helps; if it repeats, the reason is above.'),
    };
  }
  return null;
}

export function SSOCallbackPage() {
  usePageMeta('Finishing sign-in', { robots: 'noindex, follow' });
  if (!CLERK_ENABLED) return <CallbackShell failed={null} />;
  return <ClerkHandshake />;
}

function ClerkHandshake() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const [failed] = useState(() => explain());
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, []);

  // Clerk normally redirects on its own (right back to the page they left).
  // This is the belt to that pair of braces: signed in is signed in.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || failed) return undefined;
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 500);
    return () => window.clearTimeout(timer);
  }, [isLoaded, isSignedIn, failed, navigate]);

  return (
    <>
      {!failed && <AuthenticateWithRedirectCallback />}
      <CallbackShell failed={failed} slow={slow} />
    </>
  );
}

function CallbackShell({
  failed,
  slow = false,
}: {
  failed: { code: string; message: string } | null;
  slow?: boolean;
}) {
  return (
    <div
      style={{
        minBlockSize: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(24px,6vw,64px) 16px',
      }}
    >
      <section
        className="pb-panel anim-enter"
        style={{ maxInlineSize: 520, width: '100%', padding: 'clamp(20px,4vw,32px)', textAlign: 'center' }}
        aria-live="polite"
      >
        <span className="pb-eyebrow" style={{ justifyContent: 'center' }}>
          <ShieldCheck size={12} /> {failed ? 'Sign-in stopped' : 'Sign-in'}
        </span>

        {failed ? (
          <>
            <h1 style={{ fontSize: 'clamp(1.3rem,3vw,1.7rem)', margin: '10px 0 8px' }}>
              That attempt did not finish
            </h1>
            <p className="pb-soft" style={{ lineHeight: 1.65 }}>{failed.message}</p>
            {failed.code && failed.code !== 'failed' && failed.code !== 'expired' && (
              <p className="pb-mono pb-muted" style={{ fontSize: '0.74rem', marginTop: 8, wordBreak: 'break-word' }}>
                {failed.code}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <a className="pb-btn pb-btn-primary" href="/">
                <ArrowLeft size={15} aria-hidden="true" /> Back to the library
              </a>
              <a className="pb-btn" href="/claim">Sign in again</a>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 'clamp(1.3rem,3vw,1.7rem)', margin: '10px 0 8px' }}>
              {slow ? 'Almost there' : 'Finishing sign-in…'}
            </h1>
            <p className="pb-soft" style={{ lineHeight: 1.65 }}>
              {slow
                ? 'This is taking longer than it should. If nothing happens, head back and try again — nothing is lost.'
                : 'One moment — you will be back exactly where you were.'}
            </p>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
              <span className="pb-spinner" aria-hidden="true" />
            </div>
            {slow && (
              <p style={{ marginTop: 16 }}>
                <a className="pb-btn" href="/">
                  <ArrowLeft size={15} aria-hidden="true" /> Back to the library
                </a>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
