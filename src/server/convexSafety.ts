import type { VerifiedIdentity } from './presentations';
import { serverEnv } from './env';

const CONVEX_URL = serverEnv('VITE_CONVEX_URL').replace(/\/+$/, '');

type BackupArgs = {
  presentationId: string;
  /** Short-lived Clerk session JWT; the Convex action uses it only to reread Turso. */
  clerkToken: string;
} & Record<string, string>;

type ReconcileArgs = { clerkToken: string } & Record<string, string>;

interface BackupResult {
  stored: boolean;
  reason?: string;
  sourceBytes: number;
  recoveryBytes: number;
  byteLimit: number;
}

interface ReconcileResult {
  removed: number;
  retained: number;
  limit: number;
}

async function safetyClient(identity: VerifiedIdentity) {
  if (!CONVEX_URL || !identity.convexToken) return null;
  const [{ ConvexHttpClient }, { makeFunctionReference }] = await Promise.all([
    import('convex/browser'),
    import('convex/server'),
  ]);
  const client = new ConvexHttpClient(CONVEX_URL, {
    logger: false,
    fetch: (input, init) => fetch(input, {
      ...init,
      signal: AbortSignal.timeout(8_000),
    }),
  });
  client.setAuth(identity.convexToken);
  return { client, makeFunctionReference };
}

/**
 * Ask Convex to fetch a canonical, already-selected Turso slice from the
 * authenticated app endpoint. No body is sent from this caller to Convex.
 */
export async function writeConvexSafetySnapshot(
  identity: VerifiedIdentity,
  presentationId: string,
): Promise<void> {
  try {
    const safety = await safetyClient(identity);
    if (!safety) return;
    const reference = safety.makeFunctionReference<'action', BackupArgs, BackupResult>(
      'safety:backupPresentation',
    );
    await safety.client.action(reference, {
      presentationId,
      clerkToken: identity.token,
    });
  } catch {
    // Convex is an optional repair aid, never a publish dependency or content source.
  }
}

/** Reconcile Convex against Turso's current global sample after a delete. */
export async function reconcileConvexSafetySamples(identity: VerifiedIdentity): Promise<void> {
  try {
    const safety = await safetyClient(identity);
    if (!safety) return;
    const reference = safety.makeFunctionReference<'action', ReconcileArgs, ReconcileResult>(
      'safety:reconcileSafetySamples',
    );
    await safety.client.action(reference, { clerkToken: identity.token });
  } catch {
    // A stale optional marker cannot affect canonical content or public reads.
  }
}
