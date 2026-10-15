/**
 * Presentation Buddy — the live layer (Convex).
 *
 * What this database is for: the things that are true *right now* and stop
 * being interesting ten seconds later —
 *
 *   • who is on the site at this moment
 *   • what just happened (a speech published, a reaction given, feedback sent)
 *   • counters that move while you are looking at them
 *
 * What it is not: the truth. Nothing here is authoritative. If this data
 * vanished, no record would be lost — the durable copy lives in Supabase, and
 * the reading library in Turso. That is deliberate: it is what lets three
 * databases coexist without ever disagreeing about a fact.
 *
 * Identity: Clerk. `convex/auth.config.ts` trusts the Clerk JWT template named
 * `convex`, so `ctx.auth.getUserIdentity()` returns the same uid the Postgres
 * policies use.
 */

import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  /**
   * Who is here. One row per person, refreshed by a heartbeat; rows go stale
   * on their own (`lastSeen` in the past means they left).
   */
  presence: defineTable({
    uid: v.string(),
    name: v.string(),
    username: v.string(),
    path: v.string(),
    lastSeen: v.number(),
  })
    .index('by_uid', ['uid'])
    .index('by_lastSeen', ['lastSeen']),

  /**
   * The activity stream. Append-only, capped, and cheap to read — the admin
   * dashboard shows the last few minutes of the site while it happens.
   */
  activity: defineTable({
    kind: v.union(
      v.literal('publish'),
      v.literal('react'),
      v.literal('feedback'),
      v.literal('claim'),
      v.literal('visit'),
    ),
    uid: v.string(),
    name: v.string(),
    /** What it happened to: a speech id, a handle, a path. */
    subject: v.string(),
    detail: v.string(),
    at: v.number(),
  })
    .index('by_at', ['at'])
    .index('by_uid', ['uid']),

  /**
   * Live counters — a *view* of the durable numbers, not their home. The app
   * increments these so a page can show a number ticking up; Supabase remains
   * the record, and a sync reconciles the two (see `reconcile` in activity.ts).
   */
  counters: defineTable({
    speechId: v.string(),
    views: v.number(),
    likes: v.number(),
    dislikes: v.number(),
    updatedAt: v.number(),
  }).index('by_speechId', ['speechId']),
});
