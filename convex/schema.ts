import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Convex is a repair/safety mirror only. It is not the home of shared work,
 * drafts, social metrics, presence or live activity. For each published
 * globally sampled personal presentation it may keep a tiny recovery slice
 * (no more than 1% of UTF-8 body bytes), plus identifiers and a checksum.
 *
 * The three `legacy*` tables describe documents written by the retired live
 * feature. They remain schema-valid during rollout so a deployment with old
 * rows can accept this schema; no current function reads or writes them. Purge
 * those historical rows before removing their definitions in a later deploy.
 */
export default defineSchema({
  presentationSafety: defineTable({
    presentationId: v.string(),
    ownerUid: v.string(),
    checksum: v.string(),
    sourceBytes: v.number(),
    recoverySlice: v.string(),
    recoveryBytes: v.number(),
    updatedAt: v.string(),
  })
    .index('by_presentationId', ['presentationId'])
    .index('by_ownerUid', ['ownerUid']),

  presence: defineTable({
    uid: v.string(),
    name: v.string(),
    username: v.string(),
    path: v.string(),
    lastSeen: v.number(),
  })
    .index('by_uid', ['uid'])
    .index('by_lastSeen', ['lastSeen']),

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
    subject: v.string(),
    detail: v.string(),
    at: v.number(),
  })
    .index('by_at', ['at'])
    .index('by_uid', ['uid']),

  counters: defineTable({
    speechId: v.string(),
    views: v.number(),
    likes: v.number(),
    dislikes: v.number(),
    updatedAt: v.number(),
  }).index('by_speechId', ['speechId']),
});
