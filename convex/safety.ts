import { action, internalMutation } from './_generated/server';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

const MAX_PRESENTATION_CHARS = 200_000;
const MAX_SAMPLE_IDS = 20_000;
const TRUSTED_SITE_ORIGIN = (
  process.env.VITE_SITE_URL || 'https://presentationbuddy.aavrit.dedyn.io'
).replace(/\/+$/, '');

interface SafetyState {
  actorUid: string;
  canonicalCount: number;
  sampledIds: string[];
}

interface SafetySnapshot extends SafetyState {
  presentationId: string;
  ownerUid: string;
  selected: boolean;
  checksum?: string;
  sourceBytes?: number;
  recoverySlice?: string;
  recoveryBytes?: number;
  byteLimit?: number;
  updatedAt?: string;
}

interface StoreArgs {
  presentationId: string;
  ownerUid: string;
  checksum: string;
  sourceBytes: number;
  recoverySlice: string;
  recoveryBytes: number;
  updatedAt: string;
  canonicalCount: number;
  sampledIds: string[];
}

interface StoreResult {
  stored: boolean;
  reason?: string;
  sourceBytes: number;
  recoveryBytes: number;
  byteLimit: number;
}

function safeSampleSet(canonicalCount: number, sampledIds: string[]): Set<string> {
  if (!Number.isSafeInteger(canonicalCount) || canonicalCount < 0
    || sampledIds.length > MAX_SAMPLE_IDS
    || sampledIds.length > Math.floor(canonicalCount / 100)
    || sampledIds.some((id) => !/^[\w-]{1,100}$/.test(id))) {
    throw new Error('The canonical safety sample is outside its global limit.');
  }
  const result = new Set(sampledIds);
  if (result.size !== sampledIds.length) throw new Error('The canonical safety sample contains duplicate ids.');
  return result;
}

function apiUrl(path: string): string {
  const origin = new URL(TRUSTED_SITE_ORIGIN);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') {
    throw new Error('The canonical safety origin must use HTTPS.');
  }
  return new URL(path, origin).toString();
}

async function requestCanonical<T>(path: string, clerkToken: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clerkToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`The canonical safety endpoint returned ${response.status}.`);
  return await response.json() as T;
}

/**
 * Private writer. Public callers cannot send text to this mutation: the only
 * caller is the action below, after it has fetched the selected Turso slice
 * from the fixed, authenticated application endpoint.
 */
export const storeVerifiedSnapshot = internalMutation({
  args: {
    presentationId: v.string(),
    ownerUid: v.string(),
    checksum: v.string(),
    sourceBytes: v.number(),
    recoverySlice: v.string(),
    recoveryBytes: v.number(),
    updatedAt: v.string(),
    canonicalCount: v.number(),
    sampledIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<StoreResult> => {
    if (!/^[\w-]{1,100}$/.test(args.presentationId)
      || !/^[\w-]{1,100}$/.test(args.ownerUid)
      || !/^[a-f0-9]{64}$/.test(args.checksum)
      || args.sourceBytes < 0
      || args.sourceBytes > MAX_PRESENTATION_CHARS * 4
      || args.recoverySlice.length > MAX_PRESENTATION_CHARS
      || args.updatedAt.length > 40) {
      throw new Error('Invalid canonical safety snapshot details.');
    }

    const sampledIds = safeSampleSet(args.canonicalCount, args.sampledIds);
    const byteLimit = Math.floor(args.sourceBytes / 100);
    const actualRecoveryBytes = new TextEncoder().encode(args.recoverySlice).length;
    if (args.recoveryBytes !== actualRecoveryBytes
      || args.recoveryBytes > byteLimit
      || (args.sourceBytes < 100 && args.recoverySlice !== '')
      || !sampledIds.has(args.presentationId)) {
      throw new Error('The recovery slice or sample membership is invalid.');
    }

    const existingRows = await ctx.db.query('presentationSafety').collect();
    let retained = 0;
    for (const existing of existingRows) {
      if (!sampledIds.has(existing.presentationId)) {
        await ctx.db.delete(existing._id);
      } else {
        retained += 1;
      }
    }

    const existing = existingRows.find((row) => row.presentationId === args.presentationId);
    if (existing && existing.ownerUid !== args.ownerUid) {
      throw new Error('Only the canonical owner can update a safety marker.');
    }

    const record = {
      presentationId: args.presentationId,
      ownerUid: args.ownerUid,
      checksum: args.checksum,
      sourceBytes: args.sourceBytes,
      recoverySlice: args.recoverySlice,
      recoveryBytes: args.recoveryBytes,
      updatedAt: args.updatedAt.slice(0, 40),
    };
    if (existing) {
      if (existing.updatedAt > record.updatedAt) {
        return {
          stored: false,
          reason: 'stale_snapshot',
          sourceBytes: args.sourceBytes,
          recoveryBytes: args.recoveryBytes,
          byteLimit,
        };
      }
      await ctx.db.replace(existing._id, record);
    } else {
      if (retained >= sampledIds.size || retained >= Math.floor(args.canonicalCount / 100)) {
        return {
          stored: false,
          reason: 'global_sample_cap',
          sourceBytes: args.sourceBytes,
          recoveryBytes: args.recoveryBytes,
          byteLimit,
        };
      }
      await ctx.db.insert('presentationSafety', record);
    }
    return { stored: true, sourceBytes: args.sourceBytes, recoveryBytes: args.recoveryBytes, byteLimit };
  },
});

/** Keep Convex membership exactly within Turso's current selected cohort. */
export const reconcileSample = internalMutation({
  args: {
    canonicalCount: v.number(),
    sampledIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const selected = safeSampleSet(args.canonicalCount, args.sampledIds);
    const rows = await ctx.db.query('presentationSafety').collect();
    let removed = 0;
    for (const row of rows) {
      if (!selected.has(row.presentationId)) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    return { removed, retained: rows.length - removed, limit: Math.floor(args.canonicalCount / 100) };
  },
});

/**
 * Publicly callable only as a fetch-through: it accepts an id and Clerk
 * session, never body text. It rereads the selected, owner-scoped slice from
 * the trusted app/Turso path before invoking either internal mutation.
 */
export const backupPresentation = action({
  args: {
    presentationId: v.string(),
    clerkToken: v.string(),
  },
  handler: async (ctx, args): Promise<StoreResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error('A signed-in owner is required for a safety snapshot.');
    if (!/^[\w-]{1,100}$/.test(args.presentationId) || args.clerkToken.length > 12_000) {
      throw new Error('Invalid safety snapshot request.');
    }

    const snapshot = await requestCanonical<SafetySnapshot>(
      '/api/presentations/safety-snapshot',
      args.clerkToken,
      { presentationId: args.presentationId },
    );
    if (snapshot.actorUid !== identity.subject
      || snapshot.ownerUid !== identity.subject
      || snapshot.presentationId !== args.presentationId) {
      throw new Error('The canonical safety response does not match the signed-in owner.');
    }

    const sampledIds = safeSampleSet(snapshot.canonicalCount, snapshot.sampledIds);
    if (!snapshot.selected) {
      const reconcile = makeFunctionReference<
        'mutation',
        { canonicalCount: number; sampledIds: string[] },
        { removed: number; retained: number; limit: number }
      >('safety:reconcileSample');
      await ctx.runMutation(reconcile, { canonicalCount: snapshot.canonicalCount, sampledIds: snapshot.sampledIds });
      return {
        stored: false,
        reason: 'not_in_global_sample',
        sourceBytes: 0,
        recoveryBytes: 0,
        byteLimit: 0,
      };
    }

    const sourceBytes = snapshot.sourceBytes;
    const recoverySlice = snapshot.recoverySlice;
    const recoveryBytes = snapshot.recoveryBytes;
    const byteLimit = snapshot.byteLimit;
    if (typeof sourceBytes !== 'number' || typeof recoverySlice !== 'string'
      || typeof recoveryBytes !== 'number' || typeof byteLimit !== 'number'
      || typeof snapshot.checksum !== 'string' || typeof snapshot.updatedAt !== 'string'
      || byteLimit !== Math.floor(sourceBytes / 100)
      || recoveryBytes !== new TextEncoder().encode(recoverySlice).length
      || recoveryBytes > byteLimit
      || !sampledIds.has(snapshot.presentationId)) {
      throw new Error('The canonical server returned an invalid recovery slice.');
    }

    const store = makeFunctionReference<'mutation', StoreArgs, StoreResult>('safety:storeVerifiedSnapshot');
    return await ctx.runMutation(store, {
      presentationId: snapshot.presentationId,
      ownerUid: snapshot.ownerUid,
      checksum: snapshot.checksum,
      sourceBytes,
      recoverySlice,
      recoveryBytes,
      updatedAt: snapshot.updatedAt,
      canonicalCount: snapshot.canonicalCount,
      sampledIds: snapshot.sampledIds,
    });
  },
});

/** Reconcile after deletion/status changes; no client-supplied count is trusted. */
export const reconcileSafetySamples = action({
  args: { clerkToken: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error('A signed-in account is required.');
    if (args.clerkToken.length > 12_000) throw new Error('Invalid safety reconciliation request.');

    const state = await requestCanonical<SafetyState>(
      '/api/presentations/safety-state',
      args.clerkToken,
      {},
    );
    if (state.actorUid !== identity.subject) {
      throw new Error('The canonical safety state does not match the signed-in account.');
    }
    const selected = safeSampleSet(state.canonicalCount, state.sampledIds);
    const reconcile = makeFunctionReference<
      'mutation',
      { canonicalCount: number; sampledIds: string[] },
      { removed: number; retained: number; limit: number }
    >('safety:reconcileSample');
    return await ctx.runMutation(reconcile, {
      canonicalCount: state.canonicalCount,
      sampledIds: [...selected],
    });
  },
});
