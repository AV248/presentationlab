import { isAdministrator, PresentationError, verifyClerkRequest } from '@/server/presentations';
import { DEEP_REVIEW_REPORT } from '@/server/deepReviewReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Authorization',
    },
  });
}

export async function GET(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    if (!await isAdministrator(identity)) return json(403, { error: 'forbidden' });
    return json(200, { report: DEEP_REVIEW_REPORT });
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return json(status, {
      error: status === 401 ? 'unauthorized' : 'report_unavailable',
      message: status === 401
        ? 'Sign in again to read the private review.'
        : 'Administrator access could not be checked.',
    });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
}

function methodNotAllowed(request: Request) {
  return json(405, { error: 'method_not_allowed', method: request.method });
}
export const HEAD = methodNotAllowed;
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
