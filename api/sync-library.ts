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

import type { IncomingMessage, ServerResponse } from 'node:http';
import { projectLibrary } from './_project.js';

const TURSO_URL = (process.env.TURSO_DATABASE_URL ?? '').trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN ?? '').trim();
// The browser's own variables, reused: a `VITE_` value is public by design and
// Vercel gives the same value to the function runtime, so there is no reason to
// make the operator type the same URL twice under two names.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'POST, OPTIONS');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    send(res, 405, {
      error: 'method_not_allowed',
      method: req.method,
      message:
        'This endpoint only accepts POST. It rebuilds the reading room from Postgres and is called by the site after a speech changes.',
    });
    return;
  }

  // Not configured is not an error here. Reading falls back to Postgres, so a
  // deployment without Turso is a complete site that is simply not fast yet.
  if (!TURSO_URL || !TURSO_TOKEN) {
    send(res, 503, {
      error: 'library_not_configured',
      message:
        'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set, so there is nothing to refresh. Reading is being served from Postgres.',
    });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    send(res, 503, {
      error: 'backend_not_configured',
      message: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are needed: the copy is built from Postgres.',
    });
    return;
  }

  const token = bearer(req);
  if (!token) {
    send(res, 401, {
      error: 'missing_session_token',
      message: 'Sign in first — the refresh reads Postgres as the person asking for it.',
    });
    return;
  }

  // Confirm the token is a real session before spending a database read on it.
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!who.ok) {
      send(res, 401, { error: 'invalid_session_token' });
      return;
    }
  } catch (error) {
    send(res, 502, { error: 'identity_check_failed', message: (error as Error).message });
    return;
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

    send(res, 200, {
      ok: true,
      synced: result.synced,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    });
  } catch (error) {
    send(res, 502, { error: 'sync_failed', message: (error as Error).message });
  }
}
