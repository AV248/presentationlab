import { verifyClerkRequest, isAdministrator, PresentationError } from '@/server/presentations';
import { healthReport } from '@/server/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    if (!await isAdministrator(identity)) return json(403, { error: 'forbidden' });
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    const report = await healthReport(host ? `${proto}://${host}` : '');
    return json(200, report);
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return json(status, { error: 'unauthorized', message: status === 401 ? 'Sign in to the workspace again.' : 'The database report is unavailable.' });
  }
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
}

export async function POST() {
  return json(405, { error: 'method_not_allowed' });
}
