/**
 * Clerk session → Firebase custom token.
 *
 * Deployed by Vercel as a Node serverless function at
 * POST /api/clerk-firebase-token. The Vite dev server mounts this same
 * handler locally (see vite.config.ts) so development behaves identically.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Clerk owns sign-in. Firestore owns the data, and its security rules match
 * on `request.auth.uid`. Firestore cannot validate a Clerk JWT by itself, so
 * the two need bridging: this function takes a Clerk session token, verifies
 * it *server-side* with the Clerk secret key, and only then mints a Firebase
 * custom token for the same person.
 *
 * The Firebase Admin credential lives here and nowhere else. If it were in
 * the browser bundle it would be a full read/write key to the database —
 * that is the mistake this design exists to make impossible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT GUARANTEES
 * ─────────────────────────────────────────────────────────────────────────────
 *   • the caller really holds a valid, unexpired Clerk session
 *   • the minted token's uid is the Clerk user id — taken from the verified
 *     JWT subject, never from anything the request body claims
 *   • no service account is configured → 501, not a crash
 *   • every response is no-store; tokens are never cached by a CDN
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyToken } from '@clerk/backend';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/* ------------------------------------------------------------------ */
/* Configuration                                                        */
/* ------------------------------------------------------------------ */

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY?.trim() ?? '';
const SERVICE_ACCOUNT_RAW = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ?? '';

/**
 * Optional: comma-separated list of origins allowed to mint tokens.
 *
 * Clerk JWTs carry an `azp` (authorized party). Checking it means a token
 * issued to some *other* site that happens to share this instance cannot be
 * replayed here. Set it to your production domain (e.g.
 * "https://your-domain.com") once you have one.
 */
const AUTHORIZED_PARTIES = (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/* ------------------------------------------------------------------ */
/* Service account parsing                                              */
/* ------------------------------------------------------------------ */

/**
 * Google emits snake_case in the downloaded JSON; some tools re-emit it
 * camelCase. Accept both rather than failing on a cosmetic difference.
 */
interface RawServiceAccount {
  type?: string;
  project_id?: string;
  private_key?: string;
  client_email?: string;
  projectId?: string;
  privateKey?: string;
  clientEmail?: string;
}

function parseServiceAccount(raw: string): ServiceAccount | null {
  if (!raw) return null;

  let json = raw;

  // A service account JSON contains real newlines inside the private key,
  // which is awkward to paste into a single-line env var. Accept base64 of
  // the original file as the lossless alternative.
  if (raw.startsWith('base64:')) {
    try {
      json = Buffer.from(raw.slice('base64:'.length), 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(json) as RawServiceAccount;

    const projectId = parsed.project_id ?? parsed.projectId;
    const privateKey = parsed.private_key ?? parsed.privateKey;
    const clientEmail = parsed.client_email ?? parsed.clientEmail;

    if (!projectId || !privateKey || !clientEmail) return null;

    return {
      projectId,
      // Some paste paths leave the two characters \ and n where the key's
      // newlines should be. A correctly parsed key already has real
      // newlines, so this is a no-op in the normal case.
      privateKey: privateKey.replace(/\\n/g, '\n'),
      clientEmail,
    };
  } catch {
    return null;
  }
}

let adminApp: App | null | undefined;
/** Why the Admin SDK is unavailable, in words safe to send to a client. */
let adminError: string | null = null;

function getAdminApp(): App | null {
  if (adminApp !== undefined) return adminApp;

  const serviceAccount = parseServiceAccount(SERVICE_ACCOUNT_RAW);
  if (!serviceAccount) {
    adminApp = null;
    adminError =
      'FIREBASE_SERVICE_ACCOUNT_JSON is missing, or does not contain project_id, private_key and client_email.';
    return null;
  }

  try {
    adminApp = getApps().length
      ? (getApps()[0] as App)
      : initializeApp({ credential: cert(serviceAccount) });
    adminError = null;
  } catch (error) {
    // cert() throws on a key that was truncated or mangled being pasted into
    // an env var — the most likely real-world misconfiguration. Report it as
    // a configuration problem with the actual reason, rather than letting it
    // escape as an unexplained 500.
    adminApp = null;
    adminError = `FIREBASE_SERVICE_ACCOUNT_JSON could not be used: ${(error as Error).message}`;
  }

  return adminApp;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function send(res: ServerResponse, status: number, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // A token endpoint must never be cached — not by the browser, not by a
  // shared CDN, not by a corporate proxy.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Vary', 'Authorization');
  // Defense in depth: this endpoint is not a page and never will be.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(payload);
}

/**
 * Coarse in-memory rate limit.
 *
 * Serverless instances are ephemeral, so this is per-instance rather than
 * global — enough to blunt a script hammering the endpoint, not a substitute
 * for a real WAF. Each mint costs one Firebase Admin operation, so even a
 * modest cap prevents the noisy-neighbour problem.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    // Opportunistic cleanup: the map would otherwise grow without bound on a
    // long-lived warm instance.
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function clientKey(req: IncomingMessage): string {
  // Vercel puts the real client address here; on other hosts fall back to
  // the socket address. Never trust a client-supplied header for this.
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/* ------------------------------------------------------------------ */
/* Handler                                                              */
/* ------------------------------------------------------------------ */

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // Preflight: no body, no credentials, nothing to mint.
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (rateLimited(clientKey(req))) {
    res.setHeader('Retry-After', '60');
    send(res, 429, { error: 'rate_limited' });
    return;
  }

  if (!CLERK_SECRET_KEY) {
    send(res, 501, {
      error: 'clerk_not_configured',
      message:
        'CLERK_SECRET_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables. It must never have a VITE_ prefix.',
    });
    return;
  }

  if (!getAdminApp()) {
    send(res, 501, {
      error: 'firebase_admin_not_configured',
      message:
        `${adminError ?? 'The Firebase Admin credential is unavailable.'} ` +
        'It must be the full service-account JSON on one line, or base64: prefixed. ' +
        'Until it is set, visitors can sign in to Clerk and browse the library, but writes ' +
        'that require Firestore authentication will be rejected.',
    });
    return;
  }

  const sessionToken = readBearer(req);
  if (!sessionToken) {
    send(res, 401, { error: 'missing_session_token' });
    return;
  }

  /* Verify the Clerk session. This is the whole security of the endpoint. */
  let claims: { sub?: string; email?: string; name?: string; azp?: string };
  try {
    claims = (await verifyToken(sessionToken, {
      secretKey: CLERK_SECRET_KEY,
      ...(AUTHORIZED_PARTIES.length ? { authorizedParties: AUTHORIZED_PARTIES } : {}),
    })) as { sub?: string; email?: string; name?: string; azp?: string };
  } catch {
    // Deliberately uniform: a wrong key, an expired session and a forged
    // token all produce the same answer, so the endpoint cannot be used to
    // probe which of those is true.
    send(res, 401, { error: 'invalid_session_token' });
    return;
  }

  const uid = typeof claims.sub === 'string' ? claims.sub : null;
  if (!uid) {
    send(res, 401, { error: 'invalid_session_token' });
    return;
  }

  try {
    const customToken = await getAuth(getAdminApp()!).createCustomToken(uid, {
      // Claims are hints for the client UI only. Firestore rules must never
      // trust them — `request.auth.token.email_verified` can be forged by
      // anyone holding an Admin credential, which is not the threat model
      // here, but the rules do not rely on these regardless.
      provider: 'clerk',
      email: typeof claims.email === 'string' ? claims.email : undefined,
      name: typeof claims.name === 'string' ? claims.name : undefined,
    });

    send(res, 200, { token: customToken, uid });
  } catch {
    send(res, 502, { error: 'token_mint_failed' });
  }
}

/**
 * Exported entry point.
 *
 * The wrapper is the last line of defence: nothing above should throw, but if
 * it does, the visitor gets a clean 500 instead of an unhandled rejection —
 * and, importantly, the error is logged rather than returned, so a surprise
 * failure cannot leak internals to the client.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await handleRequest(req, res);
  } catch (error) {
    console.error('[clerk-firebase-token]', error);
    if (!res.headersSent) send(res, 500, { error: 'internal_error' });
    else res.end();
  }
}
