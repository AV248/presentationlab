import { projectLibrary } from '@/server/project';
import { ensureLibrarySchema } from '@/server/reading';

/**
 * Refresh the reading room.
 *
 * POST /api/sync-library
 *   Authorization: Bearer <clerk session token>
 *
 * Publishing a speech writes it to Postgres, which is the truth. Turso is a
 * copy of that truth, so something has to carry a new speech across — this is
 * that something, and the app calls it after a publish, an edit or a delete.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ANY SIGNED-IN PERSON MAY CALL IT
 * ─────────────────────────────────────────────────────────────────────────────
 * This is not a privileged operation, and pretending otherwise would break the
 * ordinary case: the people who publish are authors, not admins.
 *
 * What a caller can achieve is bounded by what they can already do:
 *   • they cannot invent a speech — every row is read from Postgres, where the
 *     policies decide what exists, and only `published` rows are copied;
 *   • they cannot hide a speech — the rebuild is from the truth, so a row they
 *     removed here comes straight back;
 *   • they cannot read anything new — the reading room holds published work,
 *     which the whole world can already read.
 *
 * The worst case is that somebody with an account repeats the work: a page of
 * rows from Postgres and one transaction in Turso. Requiring a session is what
 * keeps that from being anonymous traffic, and the app calls it at most once
 * per publish. The response is honest about what it did either way.
 *
 * The service key never appears here; the caller's own token does the reading,
 * so Postgres applies the same policies it would for any other request.
 */

export const runtime = 'nodejs';

const TURSO_URL = (process.env.TURSO_DATABASE_URL ?? '').trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN ?? '').trim();
// The browser's own variables, reused: a public variable is public by design
// and the host gives the same value to the function runtime, so there is no
// reason to make the operator type the same URL twice under two names.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

function send(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}

export async function POST(request: Request) {
  // Not configured is not an error here. Reading falls back to Postgres, so a
  // deployment without Turso is a complete site that is simply not fast yet.
  if (!TURSO_URL || !TURSO_TOKEN) {
    return send(503, {
      error: 'library_not_configured',
      message:
        'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set, so there is nothing to refresh. Reading is being served from Postgres.',
    });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return send(503, {
      error: 'backend_not_configured',
      message:
        'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are needed: the copy is built from Postgres.',
    });
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  if (!token) {
    return send(401, {
      error: 'missing_session_token',
      message: 'Sign in first — the refresh reads Postgres as the person asking for it.',
    });
  }

  // Confirm the token is a real session before spending a database read on it.
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!who.ok) return send(401, { error: 'invalid_session_token' });
  } catch (error) {
    return send(502, { error: 'identity_check_failed', message: (error as Error).message });
  }

  /**
   * Make sure the reading room has its tables.
   *
   * This is what removes "apply turso/schema.sql first, from a terminal on
   * your own machine" from the setup. The file is the project's own schema,
   * every statement in it is `if not exists`, and it creates empty tables —
   * there is nothing here that can overwrite data or reveal any. It runs only
   * on this path, which already required a signed-in caller, and at most once
   * per process.
   */
  const schema = await ensureLibrarySchema();
  if (!schema.ok) {
    return send(502, {
      error: 'library_schema_unavailable',
      message: `The reading room could not be prepared: ${schema.note}`,
    });
  }

  const started = Date.now();
  try {
    const result = await projectLibrary({
      supabaseUrl: SUPABASE_URL,
      apiKey: SUPABASE_ANON_KEY,
      sessionToken: token,
      tursoUrl: TURSO_URL,
      tursoToken: TURSO_TOKEN,
    });

    return send(200, {
      ok: true,
      synced: result.synced,
      // Said out loud rather than hidden: a caller seeing `schema: applied` is
      // watching the reading room being built for the first time.
      schema: schema.note,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return send(502, { error: 'sync_failed', message: (error as Error).message });
  }
}

/** GET and friends: the reason, in words, rather than a bare 405. */
function methodNotAllowed(request: Request) {
  return Response.json(
    {
      error: 'method_not_allowed',
      method: request.method,
      message:
        'This endpoint only accepts POST. It rebuilds the reading room from Postgres and is called by the site after a speech changes.',
    },
    { status: 405, headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' } },
  );
}

export const GET = (request: Request) => methodNotAllowed(request);
export const PUT = (request: Request) => methodNotAllowed(request);
export const PATCH = (request: Request) => methodNotAllowed(request);
export const DELETE = (request: Request) => methodNotAllowed(request);
