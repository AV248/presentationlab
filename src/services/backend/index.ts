/**
 * The one seam.
 *
 * Everything in the app that touches a database comes through here:
 * `loadBackend()` resolves to a bundle, or to `null` when this build has no
 * cloud configured at all (in which case the site stays fully local, as it
 * always has).
 *
 * Three databases sit behind it, each with a single job:
 *
 *   Supabase (Postgres)  the truth — durable records, row-level security
 *   Turso (SQLite edge)  the reading room — published writing and search
 *   Convex               the live layer — presence, activity, ticking numbers
 *
 * Only the first is required. The other two are invited: the reading room
 * speeds up the public library, the live layer makes the site feel inhabited.
 * If either is absent the app notices nothing, because neither is the record
 * of anything.
 */

import { BACKEND_ENABLED, LIVE_ENABLED, BACKEND_PROJECT, backendSummary } from './config';
import { supabaseBundle } from './supabase';
import * as library from './library';
import * as live from './live';

export { BACKEND_ENABLED, LIVE_ENABLED, BACKEND_PROJECT, backendSummary };
export { setAccessTokenGetter } from './supabase';
export { setLiveTokenGetter } from './live';
export { library, live };

export class NotConfiguredError extends Error {
  constructor() {
    super('This build has no cloud configured — records stay on this device.');
    this.name = 'NotConfiguredError';
  }
}

export interface BackendBundle {
  db: unknown;
  fs: ReturnType<typeof supabaseBundle>['fs'];
  /** Durable writes and reads, with the database's own error messages. */
  rpc: ReturnType<typeof supabaseBundle>['rpc'];
}

let bundlePromise: Promise<BackendBundle | null> | null = null;

export function loadBackend(): Promise<BackendBundle | null> {
  if (!BACKEND_ENABLED) return Promise.resolve(null);
  if (!bundlePromise) {
    bundlePromise = Promise.resolve().then(() => {
      const bundle = supabaseBundle();
      return {
        db: bundle.db,
        fs: bundle.fs,
        rpc: bundle.rpc,
      };
    });
  }
  return bundlePromise;
}

/** Slug helpers used by the library readers. */
export { fetchLibrary, searchLibrary, fetchOne } from './library';
