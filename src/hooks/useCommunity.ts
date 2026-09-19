import { useCallback, useEffect, useState } from 'react';
import { fetchContributors, fetchPosts, type Contributor, type Post } from '../services/data';
import { FIREBASE_ENABLED } from '../services/firebase';

interface CommunityData {
  contributors: Contributor[];
  posts: Post[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

let cache: { contributors: Contributor[]; posts: Post[]; at: number } | null = null;

/**
 * Leaderboard and open-mic posts, straight from Firestore.
 * Only real accounts appear here — there are no placeholder people.
 */
export function useCommunity(): CommunityData {
  const [contributors, setContributors] = useState<Contributor[]>(cache?.contributors ?? []);
  const [posts, setPosts] = useState<Post[]>(cache?.posts ?? []);
  const [loading, setLoading] = useState(!cache && FIREBASE_ENABLED);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    cache = null;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
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
