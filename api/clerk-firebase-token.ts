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
import { createSign } from 'node:crypto';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS NO FIREBASE ADMIN SDK HERE
 * ─────────────────────────────────────────────────────────────────────────────
 * Minting a Firebase custom token means signing one JWT with the service
 * account's private key. That is a single RS256 signature, and Node's own
 * `crypto` does it — so this function needs no Firebase SDK at all.
 *
 * It used to import `firebase-admin`, which was correct until it was not.
 * `firebase-admin@14` requires Node 22, and it reaches `jose@6`, an
 * **ESM-only** package, through `jwks-rsa`. On a runtime whose CommonJS cannot
 * `require()` an ES module, both its CommonJS *and* its ESM entry points fail
 * with *"require() of ES Module … not supported"*, both SDKs report "failed to
 * load", and every request to this endpoint answered 501 — with the
 * configuration blamed, wrongly.
 *
 * Dropping the dependency removes that entire class of failure, shrinks the
 * cold start, and keeps the security properties identical: the private key
 * still never leaves the server, the uid still comes from the verified Clerk
 * subject, and the token still expires an hour later.
 */

// The Clerk SDK is still imported lazily, inside the handler. A static import
// that fails on the host takes the whole function down as an unexplained 500
// before any of our error handling runs. A lazy import turns that into a
// named, actionable 501 instead.
type ClerkModule = typeof import('@clerk/backend');

/* ------------------------------------------------------------------ */
/* Loading the SDK                                                     */
/* ------------------------------------------------------------------ */

/**
 * Load a dependency in whichever way this runtime allows.
 *
 * This is not paranoia — it is a bug that reached production through
 * `firebase-admin` and an ESM-only package of its own (that dependency has
 * since been removed entirely; see the note above). A compiled handler may be
 * CommonJS, in which case a dynamic `import()` can be rewritten into
 * `require()`, and requiring an ESM-only dependency fails with
 * *"require() of ES Module … not supported"* on any Node older than the
 * versions that allow it (22.12 / 20.19). The SDK then "fails to load" and
 * every request answers 501 — with the configuration blamed, wrongly.
 *
 * Three routes, in order of reliability:
 *
 *   1. `new Function('specifier', 'return import(specifier)')` — a real
 *      dynamic import that no transform can rewrite, because the bundler
 *      never sees an import here at all. This is how a CommonJS file reaches
 *      an ES module, and it loads the ESM build, whose own ESM imports are
 *      always legal.
 *   2. `createRequire` — the CommonJS entry point, for a runtime that cannot
 *      perform a dynamic import.
 *   3. a plain `await import(...)`, last, for an ESM runtime where (1) is
 *      somehow unavailable.
 *
 * Every failure is collected, so the message names the module and the reason
 * instead of only "failed to load".
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string,
) => Promise<T>;

async function loadModule<T>(specifier: string): Promise<T> {
  const failures: string[] = [];

  try {
    return await dynamicImport<T>(specifier);
  } catch (error) {
    failures.push(`import(): ${(error as Error).message}`);
  }

  try {
    const { createRequire } = await import('node:module');
    const nodeRequire = createRequire(`${process.cwd()}/index.js`);
    return nodeRequire(specifier) as T;
  } catch (error) {
    failures.push(`require(): ${(error as Error).message}`);
  }

  try {
    return (await import(specifier)) as T;
  } catch (error) {
    failures.push(`fallback import(): ${(error as Error).message}`);
  }

  throw new Error(`could not load ${specifier} — ${failures.join(' | ')}`);
}

let sdk: ClerkModule | null = null;
let sdkError: string | null = null;

async function loadSdk(): Promise<ClerkModule | null> {
  if (sdk || sdkError) return sdk;
  try {
    sdk = await loadModule<ClerkModule>('@clerk/backend');
  } catch (error) {
    // A packaging problem, not a missing variable — say which it is, because
    // the two have completely different fixes.
    sdkError =
      `The Clerk server SDK could not be loaded: ${(error as Error).message} ` +
      'This is a packaging problem in the deployment (the function must be able to resolve ' +
      '@clerk/backend), not a missing variable.';
  }
  return sdk;
}

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
  private_key_id?: string;
  client_email?: string;
  projectId?: string;
  privateKey?: string;
  privateKeyId?: string;
  clientEmail?: string;
}

/** What this endpoint needs from the service account — no SDK required. */
interface ServiceAccount {
  projectId: string;
  privateKey: string;
  clientEmail: string;
  /** The key's own id, used as the JWT `kid` so Google can pick the key. */
  privateKeyId: string;
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
    const privateKeyId = parsed.private_key_id ?? parsed.privateKeyId ?? '';

    if (!projectId || !privateKey || !clientEmail) return null;

    // A pasted key can arrive with literal backslash-n where its newlines
    // should be. `createSign` needs the real thing, so normalise here rather
    // than failing later with an opaque crypto error.
    const normalisedKey = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;

    return { projectId, privateKey: normalisedKey, clientEmail, privateKeyId };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Minting the custom token                                             */
/* ------------------------------------------------------------------ */

interface CustomTokenOptions {
  serviceAccount: ServiceAccount;
  /** The Clerk user id — the token's subject, and the Firebase uid. */
  uid: string;
  /** Extra claims for the UI only; Firestore rules never trust these. */
  claims?: Record<string, unknown>;
  /** For tests. Seconds since the epoch. */
  now?: number;
}

/** base64url without padding, which is what a JWT segment is. */
function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A Firebase custom token, signed directly with the service account's key.
 *
 * The shape is Google's, not ours: a JWT whose `iss`/`sub` are the service
 * account's address, whose `aud` is the Identity Toolkit, whose `uid` is the
 * Firebase user id, and whose signature is RS256 over the first two segments
 * with the `kid` header naming the key. Firebase verifies it with the public
 * half of that key — which is why this works without any Firebase SDK, and
 * why the private key must never leave the server.
 *
 * `exp` is one hour: long enough for the browser to redeem it immediately,
 * short enough that a leaked response is worthless. It is deliberately *not*
 * a session token — Firebase exchanges it for a refresh token on first use.
 */
export function mintFirebaseCustomToken({ serviceAccount, uid, claims, now }: CustomTokenOptions): string {
  const issuedAt = now ?? Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(serviceAccount.privateKeyId ? { kid: serviceAccount.privateKeyId } : {}),
  };

  const payload = {
    iss: serviceAccount.clientEmail,
    sub: serviceAccount.clientEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: issuedAt,
    exp: issuedAt + 3600,
    uid,
    ...(claims ? { claims } : {}),
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  let signature: Buffer;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    signature = signer.sign(serviceAccount.privateKey);
  } catch (error) {
    // A truncated or mangled key surfaces here rather than as a token that
    // Firebase later refuses — this is the error worth naming out loud.
    throw new Error(`the private key could not sign: ${(error as Error).message}`);
  }

  return `${signingInput}.${base64url(signature)}`;
}

/* ------------------------------------------------------------------ */
/* Configuration state                                                  */
/* ------------------------------------------------------------------ */

/** Parsed once per instance; a bad value is reported, never cached as good. */
let serviceAccount: ServiceAccount | null | undefined;
/** Why the service account is unusable, in words safe to send to a client. */
let adminError: string | null = null;

function getServiceAccount(): ServiceAccount | null {
  if (serviceAccount !== undefined) return serviceAccount;
  serviceAccount = parseServiceAccount(SERVICE_ACCOUNT_RAW);
  adminError = serviceAccount
    ? null
    : 'FIREBASE_SERVICE_ACCOUNT_JSON is missing, or does not contain project_id, private_key and client_email.';
  return serviceAccount;
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
    res.setHeader('Allow', 'POST, OPTIONS');
    send(res, 405, {
      error: 'method_not_allowed',
      method: req.method,
      message:
        'This endpoint only accepts POST. It is an API, not a page: the site calls it with a POST and a bearer token. Opening this URL in a browser sends a GET, so seeing this message that way is expected — and it does prove the function is deployed.',
    });
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

  if (!getServiceAccount()) {
    send(res, 501, {
      error: 'firebase_admin_not_configured',
      message:
        `${adminError ?? 'The Firebase service account is unavailable.'} ` +
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

  const clerk = await loadSdk();
  if (!clerk) {
    send(res, 501, {
      error: 'clerk_sdk_unavailable',
      message: sdkError ?? 'The Clerk server SDK is unavailable.',
    });
    return;
  }

  /* Verify the Clerk session. This is the whole security of the endpoint. */
  let claims: { sub?: string; email?: string; name?: string; azp?: string };
  try {
    claims = (await clerk.verifyToken(sessionToken, {
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
    const customToken = mintFirebaseCustomToken({
      serviceAccount: getServiceAccount()!,
      uid,
      claims: {
        // Hints for the client UI, plus the marker Firestore rules look for
        // (`provider == 'clerk'`) to accept a signed-in person. The rules do
        // not trust anything else in here.
        provider: 'clerk',
        email: typeof claims.email === 'string' ? claims.email : undefined,
        name: typeof claims.name === 'string' ? claims.name : undefined,
      },
    });

    send(res, 200, { token: customToken, uid });
  } catch (error) {
    // Almost always a mangled private key: logged for the operator, and named
    // in the response, so it is never another silent 502.
    console.error('[clerk-firebase-token] minting failed', error);
    send(res, 502, {
      error: 'token_mint_failed',
      message:
        'The service account could not sign a token. Check that FIREBASE_SERVICE_ACCOUNT_JSON was not truncated.',
    });
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
