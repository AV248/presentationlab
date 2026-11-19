import { ensurePresentationStore, PresentationError, type VerifiedIdentity } from './presentations';
import { turso, TURSO_CONFIGURED } from './turso';

export type PresentationReactionKind = 'like' | 'dislike';

export interface PresentationReactionState {
  kind: PresentationReactionKind | null;
  likes: number;
  dislikes: number;
}

function record(row: unknown): Record<string, unknown> | undefined {
  return row && typeof row === 'object' ? row as Record<string, unknown> : undefined;
}

/**
 * Toggle one signed-in person's reaction in the same database as the work.
 * The reaction row and its signed counter delta commit together in Turso; they
 * no longer depend on a foreign key into Supabase's retired `speeches` table.
 * Counter deltas preserve any historical total when the new ledger is empty.
 */
export async function setPresentationReaction(
  identity: Pick<VerifiedIdentity, 'uid'>,
  speechId: string,
  kind: PresentationReactionKind,
): Promise<PresentationReactionState> {
  const db = await ensurePresentationStore();
  try {
    const tx = await db.transaction('write');
    try {
      const presentationResult = await tx.execute({
        sql: "select id from library where id = ? and moderation_status = 'published' limit 1",
        args: [speechId],
      });
      if (!presentationResult.rows.length) {
        throw new PresentationError('That published presentation could not be found.', 404, 'presentation_not_found');
      }

      const previousResult = await tx.execute({
        sql: 'select kind from presentation_reactions where uid = ? and speech_id = ? limit 1',
        args: [identity.uid, speechId],
      });
      const previous = String(record(previousResult.rows[0])?.kind ?? '') as PresentationReactionKind | '';
      const next: PresentationReactionKind | null = previous === kind ? null : kind;
      const now = new Date().toISOString();

      let likeDelta = 0;
      let dislikeDelta = 0;
      if (!next) {
        await tx.execute({
          sql: 'delete from presentation_reactions where uid = ? and speech_id = ?',
          args: [identity.uid, speechId],
        });
        if (previous === 'like') likeDelta = -1;
        if (previous === 'dislike') dislikeDelta = -1;
      } else if (previous) {
        await tx.execute({
          sql: `update presentation_reactions set kind = ?, updated_at = ?
                where uid = ? and speech_id = ?`,
          args: [next, now, identity.uid, speechId],
        });
        if (previous === 'like') likeDelta -= 1;
        if (previous === 'dislike') dislikeDelta -= 1;
        if (next === 'like') likeDelta += 1;
        if (next === 'dislike') dislikeDelta += 1;
      } else {
        const inserted = await tx.execute({
          sql: `insert into presentation_reactions (uid, speech_id, kind, created_at, updated_at)
                select ?, ?, ?, ?, ?
                where exists (select 1 from library where id = ? and moderation_status = 'published')`,
          args: [identity.uid, speechId, next, now, now, speechId],
        });
        if (!inserted.rowsAffected) {
          throw new PresentationError('That published presentation could not be found.', 404, 'presentation_not_found');
        }
        if (next === 'like') likeDelta = 1;
        if (next === 'dislike') dislikeDelta = 1;
      }

      // Apply just this person's signed delta. Existing counters are kept as
      // the baseline because older reactions may predate the Turso ledger.
      const updated = await tx.execute({
        sql: `update library
              set likes = max(0, coalesce(likes, 0) + ?),
                  dislikes = max(0, coalesce(dislikes, 0) + ?)
              where id = ? and moderation_status = 'published'`,
        args: [likeDelta, dislikeDelta, speechId],
      });
      if (!updated.rowsAffected) {
        throw new PresentationError('That published presentation could not be found.', 404, 'presentation_not_found');
      }
      const countsResult = await tx.execute({
        sql: "select likes, dislikes from library where id = ? and moderation_status = 'published' limit 1",
        args: [speechId],
      });
      const counts = record(countsResult.rows[0]);
      if (!counts) throw new PresentationError('That published presentation could not be found.', 404, 'presentation_not_found');
      await tx.commit();
      return { kind: next, likes: Number(counts.likes ?? 0), dislikes: Number(counts.dislikes ?? 0) };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    if (error instanceof PresentationError) throw error;
    throw new PresentationError('That reaction could not be saved. Try again shortly.', 503, 'reaction_write_failed');
  } finally {
    db.close();
  }
}

/** Record one counted share per signed-in person and published presentation. */
export async function recordPresentationShare(
  identity: Pick<VerifiedIdentity, 'uid'>,
  speechId: string,
): Promise<number> {
  const db = await ensurePresentationStore();
  try {
    const tx = await db.transaction('write');
    try {
      const inserted = await tx.execute({
        sql: `insert or ignore into presentation_shares (uid, speech_id, created_at)
              select ?, ?, ?
              where exists (select 1 from library where id = ? and moderation_status = 'published')`,
        args: [identity.uid, speechId, new Date().toISOString(), speechId],
      });
      if (!inserted.rowsAffected) {
        const existing = await tx.execute({
          sql: "select shares from library where id = ? and moderation_status = 'published' limit 1",
          args: [speechId],
        });
        if (!existing.rows.length) {
          throw new PresentationError('That published presentation could not be found.', 404, 'presentation_not_found');
        }
      } else {
        await tx.execute({ sql: 'update library set shares = shares + 1 where id = ?', args: [speechId] });
      }
      const result = await tx.execute({
        sql: "select shares from library where id = ? and moderation_status = 'published' limit 1",
        args: [speechId],
      });
      const row = record(result.rows[0]);
      if (!row) throw new PresentationError('That published presentation could not be found.', 404, 'presentation_not_found');
      await tx.commit();
      return Number(row.shares ?? 0);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    if (error instanceof PresentationError) throw error;
    throw new PresentationError('The share happened, but its count could not be saved.', 503, 'share_write_failed');
  } finally {
    db.close();
  }
}

/** Read only this authenticated reader's current, still-published reactions. */
export async function readMyPresentationReactions(uid: string): Promise<Record<string, PresentationReactionKind>> {
  if (!uid || !TURSO_CONFIGURED) return {};
  const db = await turso();
  if (!db) return {};
  try {
    const table = await db.execute({
      sql: "select 1 from sqlite_master where type = 'table' and name = 'presentation_reactions' limit 1",
    });
    if (!table.rows.length) return {};
    const result = await db.execute({
      sql: `select r.speech_id, r.kind from presentation_reactions r
            join library l on l.id = r.speech_id
            where r.uid = ? and l.moderation_status = 'published'
            order by r.updated_at desc limit 300`,
      args: [uid],
    });
    const reactions: Record<string, PresentationReactionKind> = {};
    for (const raw of result.rows) {
      const row = record(raw);
      const id = String(row?.speech_id ?? '');
      const kind = String(row?.kind ?? '');
      if (id && (kind === 'like' || kind === 'dislike')) reactions[id] = kind;
    }
    return reactions;
  } catch {
    return {};
  } finally {
    db.close();
  }
}
