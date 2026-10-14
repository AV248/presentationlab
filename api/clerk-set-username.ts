/**
 * POST /api/clerk-set-username — set a username in Clerk, once, forever.
 *
 * ── Why this endpoint exists ────────────────────────────────────────────────
 * Clerk is where a username lives. The browser could set it with
 * `user.update({ username })` — but only while the instance lets end users
 * change that identifier. Turn on Clerk's **Restrict changes** toggle for
 * usernames (User & authentication → User model → User permissions) and the
 * Frontend API refuses *every* end-user write, including the very first one:
 *
 *   immutable_attribute_modification_not_allowed
 *   "Your username is immutable and cannot be modified or removed."
 *
 * That toggle is exactly the guarantee this app wants — one username per
 * person, unchangeable — so the answer is not to weaken it. Clerk's own
 * documentation notes that *administrators* keep full control of identifiers
 * through the Backend API. This endpoint is that administrator: it verifies
 * the caller's Clerk session here, then writes the username with the secret
 * key. The restriction stays on, the claim still works, and the browser never
 * holds anything capable of setting it.
 *
 * ── The rules it enforces ───────────────────────────────────────────────────
 *   • Authenticated: a verified Clerk session token is required; the username
 *     is written to *that* user and to nobody else.
 *   • One per person: if the user already has a username, this endpoint
 *     refuses — unless it is the same name (idempotent retry).
 *   • Never removed: an empty or missing username is a 400, not a deletion.
 *   • Format-checked, because a server must not trust the client's copy of
 *     the rules (see src/lib/identity.ts for the canonical pattern).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const env = process.env;

const CLERK_SECRET_KEY = (env.CLERK_SECRET_KEY ?? '').trim();

/** Origins allowed to present a session token here. */
const AUTHORIZED_PARTIES = (env.CLERK_AUTHORIZED_PARTIES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/**
 * Username shape, mirroring src/lib/identity.ts **and** the `handles` rule in
 * firestore.rules: 3–24 characters, lowercase letters, digits and underscores,
 * with no leading, trailing or doubled underscore. Kept in sync by hand — the
 * three must agree or a name one layer accepts is refused by another.
 */
function usernameProblem(raw: string): string | null {
  if (raw.length < 3) return 'At least 3 characters.';
  if (raw.length > 24) return 'At most 24 characters.';
  if (!/^[a-z0-9_]+$/.test(raw)) return 'Letters, numbers and underscores only.';
  if (/^_|_$/.test(raw) || raw.includes('__')) return 'Underscores cannot lead, trail or double up.';
  return null;
}

/* ------------------------------------------------------------------ */
/* SDK, loaded lazily                                                  */
/* ------------------------------------------------------------------ */

type ClerkModule = typeof import('@clerk/backend');
let sdk: ClerkModule | null = null;
let sdkError: string | null = null;

async function loadSdk(): Promise<ClerkModule | null> {
  if (sdk || sdkError) return sdk;
  try {
    sdk = await import('@clerk/backend');
  } catch (error) {
    // Imported inside the handler on purpose: a load failure on the host
    // becomes a named 501 below, never an opaque 500 before any of our
    // error handling runs.
    sdkError = `The Clerk server SDK failed to load: ${(error as Error).message}`;
  }
  return sdk;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function send(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify(body));
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    if (hits.size > 2_000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function clientKey(req: IncomingMessage): string {
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

/** One POST body, size-capped, parsed as JSON. */
async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 4_096) return null;
    chunks.push(buffer);
  }
  if (!chunks.length) return null;
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Clerk's error shape, structurally — the SDK's class is not exported here. */
interface ClerkishError {
  status?: number;
  errors?: { code?: string; message?: string; longMessage?: string; meta?: { paramName?: string } }[];
}

function clerkErrorCodes(error: unknown): string[] {
  const detail = error as ClerkishError | null;
  return (detail?.errors ?? []).map((entry) => entry.code ?? '').filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
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

  const bearer = readBearer(req);
  if (!bearer) {
    send(res, 401, { error: 'missing_session_token' });
    return;
  }

  const clerk = await loadSdk();
  if (!clerk) {
    send(res, 501, { error: 'clerk_sdk_unavailable', message: sdkError ?? 'The Clerk server SDK is unavailable.' });
    return;
  }

  const body = await readBody(req);
  const raw = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!raw) {
    send(res, 400, {
      error: 'username_required',
      message: 'A username has to be named. Usernames are never removed by this endpoint.',
    });
    return;
  }
  const shapeProblem = usernameProblem(raw);
  if (shapeProblem) {
    send(res, 400, {
      error: 'username_invalid',
      message: `${shapeProblem} Usernames are 3–24 characters: lowercase letters, numbers and single underscores.`,
    });
    return;
  }

  /* Verify the session — this is the whole security of the endpoint. */
  let userId: string | null = null;
  try {
    const claims = (await clerk.verifyToken(bearer, {
      secretKey: CLERK_SECRET_KEY,
      ...(AUTHORIZED_PARTIES.length ? { authorizedParties: AUTHORIZED_PARTIES } : {}),
    })) as { sub?: string };
    userId = typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    // A wrong key, an expired session and a forged token are one answer, so
    // this endpoint cannot be used to probe which of them is true.
    send(res, 401, { error: 'invalid_session_token' });
    return;
  }

  if (!userId) {
    send(res, 401, { error: 'invalid_session_token' });
    return;
  }

  const client = clerk.createClerkClient({ secretKey: CLERK_SECRET_KEY });

  /* One username per person: read first, and refuse to overwrite. */
  let existing: string | null = null;
  try {
    const user = await client.users.getUser(userId);
    existing = user.username ?? null;
  } catch {
    send(res, 502, {
      error: 'clerk_unreachable',
      message: 'Clerk could not be reached to read the current username. Please try again.',
    });
    return;
  }

  if (existing && existing.toLowerCase() !== raw) {
    send(res, 409, {
      error: 'username_immutable',
      message: `Your username is @${existing} and cannot be changed.`,
    });
    return;
  }

  if (existing) {
    // Same name: a retry after a dropped connection. Nothing to do.
    send(res, 200, { username: existing, changed: false });
    return;
  }

  try {
    const updated = await client.users.updateUser(userId, { username: raw });
    send(res, 200, { username: updated.username ?? raw, changed: true });
  } catch (error) {
    const codes = clerkErrorCodes(error);

    if (codes.includes('immutable_attribute_modification_not_allowed')) {
      send(res, 409, {
        error: 'username_immutable',
        message:
          'Clerk has this username locked as immutable and the write was refused. The owner can set it from the Clerk dashboard, or turn off "Allow users to change their username" so the app may set it once.',
      });
      return;
    }

    if (codes.some((code) => code.includes('identifier_exists') || code.includes('username_exists'))) {
      send(res, 409, {
        error: 'username_taken',
        message: 'That username is already taken in Clerk. Please choose another.',
      });
      return;
    }

    if (codes.some((code) => code.includes('format') || code.includes('param_nil') || code.includes('invalid'))) {
      send(res, 400, {
        error: 'username_invalid',
        message: 'Clerk rejected that username as invalid. Use 3–24 letters, numbers or single underscores.',
      });
      return;
    }

    // Anything else: a real failure, reported as one, with the codes logged
    // for the operator rather than returned to the visitor.
    console.error('[clerk-set-username] updateUser failed', codes.join(',') || error);
    send(res, 502, {
      error: 'username_update_failed',
      message: 'Clerk did not accept the username just now. Please try again in a moment.',
    });
  }
}

/**
 * Exported entry point. The wrapper is the last line of defence: nothing
 * above should throw, and if it does the visitor gets a clean 500 while the
 * detail is logged rather than returned.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await handleRequest(req, res);
  } catch (error) {
    console.error('[clerk-set-username]', error);
    if (!res.headersSent) send(res, 500, { error: 'internal_error' });
    else res.end();
  }
}
