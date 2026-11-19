import { readCommunityPosts } from '@/server/community';

export const runtime = 'nodejs';

const MAX_AGE_SECONDS = 15;
const MAX_ITEMS = 200;

export async function GET(request: Request) {
  const rawLimit = Number(new URL(request.url).searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_ITEMS)
    : 100;
  const items = await readCommunityPosts(limit);
  return Response.json({ items }, {
    headers: {
      'Cache-Control': `public, max-age=${MAX_AGE_SECONDS}, s-maxage=${MAX_AGE_SECONDS}, stale-while-revalidate=60`,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
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

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
