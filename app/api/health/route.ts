import { healthReport } from '@/server/health';

/**
 * `GET /api/health` — is this deployment working?
 *
 * The question the environment panel cannot answer, because it only ever sees
 * the browser's half: *does each service actually answer?* This endpoint talks
 * to Clerk, Supabase, Turso and Convex with the deployment's own credentials —
 * over the server, where the secrets live — and reports what came back.
 *
 *   200  { verdict: 'ready' | 'degraded' | 'broken', summary, checks: […] }
 *   405  anything but GET
 *
 * A `broken` verdict is still a `200`: the request succeeded, and the news is
 * in the body. A health endpoint that answers with an error status cannot be
 * told apart from a health endpoint that is itself down.
 *
 * Deliberately never returns a value — no URL, no token, no key. A caller
 * learns `configured` or `absent`. See `src/server/health.ts`.
 *
 * `no-store`, because a cached health report is worse than no health report.
 */

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // The host the request actually arrived on, for the canonical-address check.
  // `x-forwarded-host` first: behind Vercel the request's own URL is the
  // internal one.
  const forwarded = request.headers.get('x-forwarded-host');
  const host = forwarded ?? request.headers.get('host') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : '';

  const report = await healthReport(origin);

  return Response.json(report, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function HEAD() {
  const report = await healthReport('');
  // A one-line answer for uptime checks that only read the status code.
  return new Response(null, {
    status: report.verdict === 'broken' ? 503 : 200,
    headers: {
      'X-Health': report.verdict,
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function methodNotAllowed(method: string) {
  return Response.json(
    {
      error: 'method_not_allowed',
      method,
      message: 'This endpoint only accepts GET. It reports the state of this deployment: GET /api/health',
    },
    { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
}

export const POST = (request: Request) => methodNotAllowed(request.method);
export const PUT = (request: Request) => methodNotAllowed(request.method);
export const PATCH = (request: Request) => methodNotAllowed(request.method);
export const DELETE = (request: Request) => methodNotAllowed(request.method);
