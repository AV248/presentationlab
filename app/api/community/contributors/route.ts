import { readPublicContributors } from '@/server/communityMetrics';

export const runtime = 'nodejs';

const MAX_AGE_SECONDS = 15;

export async function GET() {
  const items = await readPublicContributors(200);
  return Response.json({ items }, {
    headers: {
      'Cache-Control': `public, max-age=${MAX_AGE_SECONDS}, s-maxage=${MAX_AGE_SECONDS}, stale-while-revalidate=60`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
}

function methodNotAllowed(request: Request) {
  return Response.json({ error: 'method_not_allowed', method: request.method }, {
    status: 405,
    headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export const HEAD = methodNotAllowed;
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
