
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

export const runtime = 'nodejs';

const env = process.env;

const CLERK_SECRET_KEY = (env.CLERK_SECRET_KEY ?? '').trim();

/** Origins allowed to present a session token here. */
const AUTHORIZED_PARTIES = (env.CLERK_AUTHORIZED_PARTIES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/**
 * Username shape, mirroring src/lib/identity.ts **and** the `handles` policy in
 * supabase/schema.sql: 3–24 characters, lowercase letters, digits and
 * underscores, with no leading, trailing or doubled underscore. Kept in sync by
 * hand — the three must agree, or a name one layer accepts is refused by
 * another.
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
    // Imported inside the handler on purpose, and with a literal specifier: a
    // load failure becomes a named 501 below rather than an opaque 500 before
    // any of our error handling runs. (2.x had to police this with a build
    // script, `check:api`; the Next.js compiler traces dependencies itself, so
    // the script retired in 3.0 — the literal is still what makes it work.)
    sdk = await import('@clerk/backend');
  } catch (error) {
    sdkError = `The Clerk server SDK failed to load: ${(error as Error).message}`;
  }
  return sdk;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function send(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Vary: 'Authorization',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
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

/** The caller, as far as a serverless platform can tell. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** One POST body, size-capped, parsed as JSON. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > 4_096) return null;
  try {
    const text = await request.text();
    if (!text || text.length > 4_096) return null;
    const parsed = JSON.parse(text) as unknown;
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

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    // The last line of defence: nothing above should throw, and if it does the
    // visitor gets a clean 500 while the detail is logged, not returned.
    console.error('[clerk-set-username]', error);
    return send(500, { error: 'internal_error' });
  }
}

async function handle(request: Request) {
  if (rateLimited(clientKey(request))) {
    return Response.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  if (!CLERK_SECRET_KEY) {
    return send(501, {
      error: 'clerk_not_configured',
      message:
        'CLERK_SECRET_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables. It must never have a VITE_ prefix.',
    });
  }

  const header = request.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() ?? null;
  if (!bearer) return send(401, { error: 'missing_session_token' });

  const clerk = await loadSdk();
  if (!clerk) {
    return send(501, {
      error: 'clerk_sdk_unavailable',
      message: sdkError ?? 'The Clerk server SDK is unavailable.',
    });
  }

  const body = await readBody(request);
  const raw = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!raw) {
    return send(400, {
      error: 'username_required',
      message: 'A username has to be named. Usernames are never removed by this endpoint.',
    });
  }
  const shapeProblem = usernameProblem(raw);
  if (shapeProblem) {
    return send(400, {
      error: 'username_invalid',
      message: `${shapeProblem} Usernames are 3–24 characters: lowercase letters, numbers and single underscores.`,
    });
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
    return send(401, { error: 'invalid_session_token' });
  }

  if (!userId) return send(401, { error: 'invalid_session_token' });

  const client = clerk.createClerkClient({ secretKey: CLERK_SECRET_KEY });

  /* One username per person: read first, and refuse to overwrite. */
  let existing: string | null = null;
  try {
    const user = await client.users.getUser(userId);
    existing = user.username ?? null;
  } catch {
    return send(502, {
      error: 'clerk_unreachable',
      message: 'Clerk could not be reached to read the current username. Please try again.',
    });
  }

  if (existing && existing.toLowerCase() !== raw) {
    return send(409, {
      error: 'username_immutable',
      message: `Your username is @${existing} and cannot be changed.`,
    });
  }

  if (existing) {
    // Same name: a retry after a dropped connection. Nothing to do.
    return send(200, { username: existing, changed: false });
  }

  try {
    const updated = await client.users.updateUser(userId, { username: raw });
    return send(200, { username: updated.username ?? raw, changed: true });
  } catch (error) {
    const codes = clerkErrorCodes(error);

    if (codes.includes('immutable_attribute_modification_not_allowed')) {
      return send(409, {
        error: 'username_immutable',
        message:
          'Clerk has this username locked as immutable and the write was refused. The owner can set it from the Clerk dashboard, or turn off "Allow users to change their username" so the app may set it once.',
      });
    }

    if (codes.some((code) => code.includes('identifier_exists') || code.includes('username_exists'))) {
      return send(409, {
        error: 'username_taken',
        message: 'That username is already taken in Clerk. Please choose another.',
      });
    }

    if (codes.some((code) => code.includes('format') || code.includes('param_nil') || code.includes('invalid'))) {
      return send(400, {
        error: 'username_invalid',
        message: 'Clerk rejected that username as invalid. Use 3–24 letters, numbers or single underscores.',
      });
    }

    // Anything else: a real failure, reported as one, with the codes logged
    // for the operator rather than returned to the visitor.
    console.error('[clerk-set-username] updateUser failed', codes.join(',') || error);
    return send(502, {
      error: 'username_update_failed',
      message: 'Clerk did not accept the username just now. Please try again in a moment.',
    });
  }
}

/** Anything that is not POST gets the reason, in words, rather than a bare 405. */
function methodNotAllowed(request: Request) {
  return Response.json(
    {
      error: 'method_not_allowed',
      method: request.method,
      message:
        'This endpoint only accepts POST. It is an API, not a page: the site calls it with a POST and a bearer token. Opening this URL in a browser sends a GET, so seeing this message that way is expected — and it does prove the function is deployed.',
    },
    { status: 405, headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' } },
  );
}

export const GET = (request: Request) => methodNotAllowed(request);
export const PUT = (request: Request) => methodNotAllowed(request);
export const PATCH = (request: Request) => methodNotAllowed(request);
export const DELETE = (request: Request) => methodNotAllowed(request);
