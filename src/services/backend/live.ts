/**
 * Convex — the live layer.
 *
 * What lives here is true *now* and stops mattering in a minute: who is on the
 * site, what just happened, and numbers that tick while you watch them. None of
 * it is authoritative — the durable copy of every fact is in Postgres — and
 * that is the point. A database that may lose data must never be the one
 * holding the record.
 *
 * Entirely optional. With no `VITE_CONVEX_URL` the whole module is inert:
 * `LIVE_ENABLED` is false, the heartbeat never starts, the activity feed is
 * empty, and nothing else in the app notices.
 */

import { CONVEX_URL, LIVE_ENABLED } from './config';

export { LIVE_ENABLED };

type ConvexLike = {
  setAuth: (fetchToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>) => void;
  mutation: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  query: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (
    name: string,
    args: Record<string, unknown>,
    callback: (value: unknown) => void,
  ) => () => void;
  close?: () => Promise<void>;
};

let clientPromise: Promise<ConvexLike | null> | null = null;
let tokenGetter: (() => Promise<string | null>) | null = null;

/** Clerk again: the same token, accepted by Convex's Clerk provider. */
export function setLiveTokenGetter(getter: (() => Promise<string | null>) | null): void {
  tokenGetter = getter;
}

async function client(): Promise<ConvexLike | null> {
  if (!LIVE_ENABLED) return null;
  if (!clientPromise) {
    clientPromise = import('convex/browser')
      .then(({ ConvexClient }) => {
        const instance = new ConvexClient(CONVEX_URL) as unknown as ConvexLike;
        instance.setAuth(async () => (tokenGetter ? await tokenGetter() : null));
        return instance;
      })
      .catch(() => null);
  }
  return clientPromise;
}

/** "I am still here." Called on a timer by the app while somebody reads. */
export async function heartbeat(path: string, username = '', name = ''): Promise<void> {
  const live = await client();
  if (!live) return;
  try {
    await live.mutation('activity:heartbeat', { path, username, name });
  } catch {
    /* presence is a courtesy — never an error the reader should see */
  }
}

export type ActivityKind = 'publish' | 'react' | 'feedback' | 'claim' | 'visit';

/** Something happened. Fire-and-forget, by design. */
export async function logActivity(
  kind: ActivityKind,
  subject: string,
  detail = '',
  name = '',
): Promise<void> {
  const live = await client();
  if (!live) return;
  try {
    await live.mutation('activity:log', { kind, subject, detail, name });
  } catch {
    /* the stream is best effort */
  }
}

/** Move a live counter — the number that changes while you are looking at it. */
export async function tick(speechId: string, field: 'views' | 'likes' | 'dislikes'): Promise<void> {
  const live = await client();
  if (!live) return;
  try {
    await live.mutation('activity:tick', { speechId, field, delta: 1 });
  } catch {
    /* the durable counter in Postgres is the one that matters */
  }
}

export interface ActivityRow {
  kind: ActivityKind;
  uid: string;
  name: string;
  subject: string;
  detail: string;
  at: number;
}

/**
 * Subscribe to live activity. Returns an unsubscribe function; if the live
 * layer is not configured, the callback is never called and unsubscribing is
 * a no-op — so a caller never has to branch on whether it is available.
 */
export async function subscribeActivity(
  onRows: (rows: ActivityRow[]) => void,
  minutes = 15,
): Promise<() => void> {
  const live = await client();
  if (!live) return () => undefined;
  try {
    return live.onUpdate('activity:recent', { minutes }, (value) => {
      onRows(Array.isArray(value) ? (value as ActivityRow[]) : []);
    });
  } catch {
    return () => undefined;
  }
}

/** Who is on the site right now. Same contract as `subscribeActivity`. */
export async function subscribePresence(
  onRows: (rows: { uid: string; name: string; username: string; path: string; lastSeen: number }[]) => void,
): Promise<() => void> {
  const live = await client();
  if (!live) return () => undefined;
  try {
    return live.onUpdate('activity:here', {}, (value) => {
      onRows(Array.isArray(value) ? (value as { uid: string; name: string; username: string; path: string; lastSeen: number }[]) : []);
    });
  } catch {
    return () => undefined;
  }
}
