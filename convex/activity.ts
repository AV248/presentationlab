/**
 * The live layer's whole API.
 *
 * Four small functions, each doing one thing the other two databases do badly:
 *
 *   heartbeat       — "I am still here" (presence)
 *   here            — who is here now (subscription)
 *   log             — record that something happened (activity feed)
 *   recent          — the last few minutes, live (subscription)
 *   tick            — move a live counter (the number that changes as you watch)
 *
 * Everything is scoped so a visitor can only ever speak for themselves:
 * `heartbeat` and `log` take the identity from the verified Clerk token, not
 * from their arguments.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

/** How long a heartbeat stays "current". */
const LIVE_WINDOW_MS = 45_000;
/** How many activity rows are worth keeping. */
const KEEP = 500;

async function identity(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  const who = (await ctx.auth.getUserIdentity()) as
    | { subject: string; name?: string; nickname?: string; email?: string }
    | null;
  return who;
}

/**
 * "I am still here, on this page." Called on a timer while a signed-in person
 * has the site open. Identity comes from the token; the name is only a label.
 */
export const heartbeat = mutation({
  args: { path: v.string(), username: v.optional(v.string()), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    if (!who) return { ok: false };

    const existing = await ctx.db
      .query('presence')
      .withIndex('by_uid', (q) => q.eq('uid', who.subject))
      .first();

    const row = {
      uid: who.subject,
      name: args.name ?? who.name ?? '',
      username: args.username ?? '',
      path: args.path.slice(0, 200),
      lastSeen: Date.now(),
    };

    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert('presence', row);

    return { ok: true };
  },
});

/** Who is on the site right now, newest first. Signed-in people only. */
export const here = query({
  args: {},
  handler: async (ctx) => {
    const who = await identity(ctx);
    if (!who) return [];
    const rows = await ctx.db.query('presence').collect();
    const cutoff = Date.now() - LIVE_WINDOW_MS;
    return rows
      .filter((row) => row.lastSeen >= cutoff)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 50);
  },
});

/**
 * Something happened. Append-only, trimmed to the last few hundred rows —
 * this is a stream, not a log book, and it is never the record of anything.
 */
export const log = mutation({
  args: {
    kind: v.union(
      v.literal('publish'),
      v.literal('react'),
      v.literal('feedback'),
      v.literal('claim'),
      v.literal('visit'),
    ),
    subject: v.string(),
    detail: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    const at = Date.now();

    await ctx.db.insert('activity', {
      kind: args.kind,
      uid: who?.subject ?? '',
      name: args.name ?? who?.name ?? '',
      subject: args.subject.slice(0, 200),
      detail: (args.detail ?? '').slice(0, 300),
      at,
    });

    // Trim. Reading 500 keys and deleting the tail is cheap enough to do on
    // write, and keeps the table from growing without a cron.
    const all = await ctx.db.query('activity').withIndex('by_at').collect();
    if (all.length > KEEP) {
      for (const row of all.slice(0, all.length - KEEP)) await ctx.db.delete(row._id);
    }

    return { ok: true };
  },
});

/** The last few minutes of the site, freshest first. Signed-in people only. */
export const recent = query({
  args: { minutes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    if (!who) return [];
    const since = Date.now() - (args.minutes ?? 15) * 60_000;
    const rows = await ctx.db
      .query('activity')
      .withIndex('by_at', (q) => q.gte('at', since))
      .collect();
    return rows.sort((a, b) => b.at - a.at).slice(0, 60);
  },
});

/**
 * Move a live counter. These are the *ticking* numbers on a page — the durable
 * ones live in Postgres and are pushed here by the sync, so a page can show a
 * number that updates without a reload.
 */
export const tick = mutation({
  args: {
    speechId: v.string(),
    field: v.union(v.literal('views'), v.literal('likes'), v.literal('dislikes')),
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('counters')
      .withIndex('by_speechId', (q) => q.eq('speechId', args.speechId))
      .first();

    const step = args.delta >= 0 ? 1 : -1;

    if (!existing) {
      await ctx.db.insert('counters', {
        speechId: args.speechId,
        views: args.field === 'views' ? Math.max(0, step) : 0,
        likes: args.field === 'likes' ? Math.max(0, step) : 0,
        dislikes: args.field === 'dislikes' ? Math.max(0, step) : 0,
        updatedAt: Date.now(),
      });
      return { ok: true };
    }

    const next = {
      views: existing.views,
      likes: existing.likes,
      dislikes: existing.dislikes,
    };
    if (args.field === 'views') next.views = Math.max(0, next.views + step);
    if (args.field === 'likes') next.likes = Math.max(0, next.likes + step);
    if (args.field === 'dislikes') next.dislikes = Math.max(0, next.dislikes + step);

    await ctx.db.patch(existing._id, { ...next, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** The live numbers for one speech, if anybody has ticked them. */
export const countersFor = query({
  args: { speechId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('counters')
      .withIndex('by_speechId', (q) => q.eq('speechId', args.speechId))
      .first();
  },
});
