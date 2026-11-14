/**
 * The one seam.
 *
 * This is the seam for browser-side Supabase account services; public
 * presentations go through the server-side Turso API instead. Supabase is used
 * for profiles, usernames, roles and account relationships under row-level
 * security. Clerk supplies the verified session. Convex is an optional,
 * bounded safety mirror and is not part of the presentation request path.
 *
 * `loadBackend()` resolves to the Supabase bundle or `null` when those account
 * services are not configured. A missing Supabase project keeps drafts local;
 * it does not redirect presentation reads to a second database.
 */

import { BACKEND_ENABLED, SAFETY_BACKUP_ENABLED, BACKEND_PROJECT, backendSummary } from './config';
import { supabaseBundle } from './supabase';
import * as library from './library';

export { BACKEND_ENABLED, SAFETY_BACKUP_ENABLED, BACKEND_PROJECT, backendSummary };
export { setAccessTokenGetter } from './supabase';
export { library };

export class NotConfiguredError extends Error {
  constructor() {
    super('This build has no cloud configured — records stay on this device.');
    this.name = 'NotConfiguredError';
  }
}

export interface BackendBundle {
  db: unknown;
  fs: ReturnType<typeof supabaseBundle>['fs'];
  /** Supabase profile and account reads/writes, with its own error messages. */
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
