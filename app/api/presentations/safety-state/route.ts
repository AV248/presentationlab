import {
  PresentationError,
  readSafetySampleState,
  verifyClerkRequest,
} from '@/server/presentations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    const state = await readSafetySampleState(identity);
    return Response.json(state, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
        Vary: 'Authorization',
      },
    });
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 500;
    const body = error instanceof PresentationError
      ? { error: error.code, message: error.message }
      : { error: 'safety_state_failed', message: 'The optional safety state could not be read.' };
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
}

export function GET() {
  return Response.json(
    { error: 'method_not_allowed', message: 'Use POST to read the bounded safety sample state.' },
    { status: 405, headers: { Allow: 'POST, OPTIONS' } },
  );
}
