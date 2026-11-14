/**
 * The old server-side Supabase → Turso rebuild endpoint is retired.
 *
 * Keeping a 410 response at the old URL prevents a stale client or external
 * integration from clearing the authoritative Turso library. Legacy content
 * may only be imported by the additive, local-only `npm run sync:turso` tool.
 */

export const runtime = 'nodejs';

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export function POST() {
  return json(410, {
    error: 'legacy_sync_retired',
    message: 'Presentations are written directly to Turso now. The old rebuild endpoint is intentionally disabled; use the reviewed local import command only for legacy data.',
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}

function methodNotAllowed(request: Request) {
  return json(405, { error: 'method_not_allowed', method: request.method });
}

export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
