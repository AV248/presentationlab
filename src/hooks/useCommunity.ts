import { useCallback, useEffect, useState } from 'react';
import { fetchContributors, fetchPosts, type Contributor, type Post } from '../services/data';
import { BACKEND_ENABLED } from '../services/backend';

interface CommunityData {
  contributors: Contributor[];
  posts: Post[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

let cache: { contributors: Contributor[]; posts: Post[]; at: number } | null = null;

/**
 * Leaderboard and open-mic posts, straight from the database.
 * Only real accounts appear here — there are no placeholder people.
 */
export function useCommunity(initialPosts: Post[] = []): CommunityData {
  const [contributors, setContributors] = useState<Contributor[]>(cache?.contributors ?? []);
  const [posts, setPosts] = useState<Post[]>(cache?.posts ?? initialPosts);
  const [loading, setLoading] = useState(!cache && BACKEND_ENABLED && initialPosts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    cache = null;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!BACKEND_ENABLED) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([fetchContributors(), fetchPosts()])
      .then(([people, notes]) => {
        if (!alive) return;
        cache = { contributors: people, posts: notes, at: Date.now() };
        setContributors(people);
        setPosts(notes);
        setError(null);
      })
      .catch((err: unknown) => {
        if (alive) setError((err as Error)?.message ?? 'Could not reach the community.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  return { contributors, posts, loading, error, refresh };
}
