import { publicCommunityAuthor } from '../lib/community';
import { serverEnvAny } from './env';
import { turso, TURSO_CONFIGURED } from './turso';

const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');

export interface PublicContributor {
  uid: string;
  name: string;
  photoURL: string | null;
  posts: number;
  likesReceived: number;
  dislikesReceived: number;
  points: number;
}

function row(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

/** Public leaderboard values come from canonical Turso counters and works. */
export async function readPublicContributors(max = 200): Promise<PublicContributor[]> {
  if (!TURSO_CONFIGURED || !SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const db = await turso();
  if (!db) return [];
  try {
    const results = await db.execute({
      sql: `select uid, count(*) as posts,
                   coalesce(sum(likes), 0) as likes_received,
                   coalesce(sum(dislikes), 0) as dislikes_received
            from library
            where moderation_status = 'published' and source_type = 'person' and uid <> ''
            group by uid
            order by likes_received desc, posts desc
            limit ?`,
      args: [Math.min(Math.max(Math.floor(max), 1), 500)],
    });

    const stats = results.rows.map((raw) => {
      const value = row(raw);
      return {
        uid: String(value?.uid ?? ''),
        posts: Number(value?.posts ?? 0),
        likesReceived: Number(value?.likes_received ?? 0),
        dislikesReceived: Number(value?.dislikes_received ?? 0),
      };
    }).filter((person) => /^[A-Za-z0-9_-]{1,128}$/.test(person.uid));
    if (!stats.length) return [];

    const url = new URL('/rest/v1/profiles', SUPABASE_URL);
    url.searchParams.set('select', 'uid,display_name,photo_url');
    url.searchParams.set('uid', `in.(${stats.map((person) => `"${person.uid}"`).join(',')})`);
    const response = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 15 },
    });
    if (!response.ok) return [];
    const profiles = await response.json() as Record<string, unknown>[];
    const directory = new Map(profiles.map((profile) => [
      String(profile.uid ?? ''),
      {
        name: publicCommunityAuthor(profile.display_name),
        photoURL: typeof profile.photo_url === 'string' ? profile.photo_url : null,
      },
    ]));

    return stats.map((person) => {
      const profile = directory.get(person.uid);
      return {
        ...person,
        name: profile?.name || 'Anonymous',
        photoURL: profile?.photoURL ?? null,
        points: Math.max(0, person.likesReceived - Math.floor(person.dislikesReceived / 3)),
      };
    }).sort((a, b) => b.points - a.points || b.likesReceived - a.likesReceived || b.posts - a.posts);
  } catch {
    return [];
  } finally {
    db.close();
  }
}
