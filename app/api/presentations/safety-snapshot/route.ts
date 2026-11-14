import {
  PresentationError,
  readSafetySnapshot,
  verifyClerkRequest,
} from '@/server/presentations';

export const runtime = 'nodejs';

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      Vary: 'Authorization',
    },
  });
}

export async function POST(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    const raw = await request.text();
    if (!raw || raw.length > 2048) throw new PresentationError('The safety request is empty or too large.');
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { throw new PresentationError('The safety request could not be read.'); }
    const presentationId = body && typeof body === 'object' && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).presentationId === 'string'
      ? (body as Record<string, unknown>).presentationId as string
      : '';
    if (!presentationId) throw new PresentationError('The presentation id is missing.');
    return json(200, await readSafetySnapshot(identity, presentationId));
  } catch (error) {
    if (error instanceof PresentationError) {
      return json(error.status, { error: error.code, message: error.message });
    }
    return json(500, { error: 'safety_snapshot_failed', message: 'The optional safety snapshot could not be read.' });
  }
}

export function GET() {
  return json(405, { error: 'method_not_allowed', message: 'Use POST to request a bounded safety snapshot.' });
}
