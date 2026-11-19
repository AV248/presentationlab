import { serverEnvAny } from './env';
import { publicCommunityAuthor, type PublicCommunityPost } from '../lib/community';

const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const READ_TIMEOUT_MS = 3000;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function mapPost(row: Record<string, unknown>): PublicCommunityPost | null {
  const id = text(row.id).trim();
  if (!id) return null;
  const createdAt = text(row.created_at ?? row.createdAt);
  return {
    id,
    title: text(row.title ?? row.Title).trim() || 'Untitled note',
    body: text(row.body ?? row.Content ?? row.content),
    author: publicCommunityAuthor(row.author ?? row.Author),
    uid: text(row.uid),
    createdAt,
    updatedAt: text(row.updated_at ?? row.updatedAt) || createdAt,
  };
}

async function queryPosts(params: Record<string, string>): Promise<PublicCommunityPost[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const url = new URL('/rest/v1/posts', SUPABASE_URL);
  url.searchParams.set('select', 'id,title,body,author,uid,created_at,updated_at');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      next: { revalidate: 60 },
    });
    if (!response.ok) return [];
    const rows = await response.json() as Record<string, unknown>[];
    return rows.map(mapPost).filter((post): post is PublicCommunityPost => Boolean(post));
  } catch {
    return [];
  }
}

export async function readCommunityPosts(limit = 100): Promise<PublicCommunityPost[]> {
  return queryPosts({
    order: 'created_at.desc',
    limit: String(Math.min(Math.max(Math.floor(limit), 1), 200)),
  });
}

export async function readCommunityPost(id: string): Promise<PublicCommunityPost | null> {
  if (!id || id.length > 160 || /[/?#]/.test(id)) return null;
  const [post] = await queryPosts({ id: `eq.${id}`, limit: '1' });
  return post ?? null;
}
