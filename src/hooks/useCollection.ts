import { useMemo } from 'react';
import type { Speech } from '../data/speeches';
import { LIBRARY } from '../data/speeches';
import { useLibrary, type StoredSpeech } from '../store/library';
import { useCloud } from '../store/cloud';
import { useAuth } from '../store/auth';
import { useProfile } from '../store/profile';
import { wordCount, readingMinutes } from '../lib/text';
import type { WebSpeech } from '../services/webSources';
import type { CloudSpeech } from '../lib/speech';

export type ItemSource = 'user' | 'cloud' | 'library' | 'web';

export interface CollectionItem extends Speech {
  source: ItemSource;
  status?: 'draft' | 'published';
  /** Real counters, or null when this speech has no counter (never invented). */
  views: number | null;
  likes: number | null;
  dislikes: number | null;
  shares: number | null;
  ad: boolean;
  uid?: string;
  username?: string;
  authorPhotoURL?: string;
  authorBadges?: string[];
  sourceType?: 'person' | 'archive' | 'admin';
  sourceName?: string;
  sourceURL?: string;
  license?: string;
  myReaction: 'like' | 'dislike' | null;
  bookmarked: boolean;
  progress: number;
  words: number;
  minutes: number;
  updatedAt?: string;
  /** Web-only metadata. */
  sourceUrl?: string;
  licence?: string;
  attribution?: string;
  /** Lower numbers sit higher in the collection. */
  rank: number;
}

const RANK: Record<ItemSource, number> = { user: 0, cloud: 1, library: 2, web: 3 };

interface Seed {
  speech: Speech;
  source: ItemSource;
  stored?: StoredSpeech;
  web?: WebSpeech;
}

function decorate(
  seed: Seed,
  ctx: {
    reactions: Record<string, 'like' | 'dislike'>;
    bookmarks: string[];
    progress: Record<string, number>;
    author?: { uid: string; username: string; displayName: string; photoURL: string };
  },
): CollectionItem {
  const { speech, source, stored, web } = seed;
  const cloud = web
    ? null
    : (source === 'cloud' ? (speech as unknown as { views?: number }) : null);
  void cloud;

  const webExtra = web
    ? { sourceUrl: web.sourceUrl, licence: web.licence, attribution: web.author }
    : {};

  const base = speech as Speech & {
    views?: number;
    likes?: number;
    dislikes?: number;
    shares?: number;
    ad?: boolean;
    uid?: string;
    username?: string;
    authorPhotoURL?: string;
    authorBadges?: string[];
    sourceType?: 'person' | 'archive' | 'admin';
    sourceName?: string;
    sourceURL?: string;
    license?: string;
  };

  const hasCounters = source === 'cloud' && typeof base.views === 'number';

  return {
    ...speech,
    source,
    status: stored?.status,
    updatedAt: stored?.updatedAt,
    views: hasCounters ? (base.views as number) : null,
    likes: hasCounters ? (base.likes ?? 0) : null,
    dislikes: hasCounters ? (base.dislikes ?? 0) : null,
    shares: hasCounters ? (base.shares ?? 0) : null,
    ad: Boolean(base.ad),
    uid: base.uid ?? (source === 'user' ? ctx.author?.uid : undefined),
    username: base.username ?? stored?.username ?? (source === 'user' ? ctx.author?.username : undefined),
    authorPhotoURL: base.authorPhotoURL ?? (source === 'user' ? ctx.author?.photoURL : undefined),
    authorBadges: base.authorBadges ?? [],
    sourceType: base.sourceType,
    sourceName: base.sourceName,
    sourceURL: base.sourceURL,
    license: base.license,
    ...(source === 'user' && ctx.author?.displayName ? { author: ctx.author.displayName } : {}),
    myReaction: ctx.reactions[speech.id] ?? null,
    bookmarked: ctx.bookmarks.includes(speech.id),
    progress: ctx.progress[speech.id] ?? 0,
    // A row handed over by the server carries its preview but not its body —
    // the list only needs the preview, and shipping every speech's full text
    // into the HTML of every page would be a cost with no reader-visible
    // benefit. The estimate falls back to the preview in that case, which is
    // within a minute of the truth and is corrected the moment the browser
    // fetches the rows for real.
    words: wordCount(speech.content || speech.preview),
    minutes: readingMinutes(speech.content || speech.preview),
    rank: RANK[source],
    ...webExtra,
  };
}

/**
 * Every speech in the collection: the reader's own drafts, everything
 * published by other people, the bundled starter library, and what the open
 * archives have brought in.
 *
 * `seed` is what a server component already read — the published rows, ready
 * before the browser has run. It is used only until the browser's own fetch
 * lands, and only for the cloud rows, so a page can be rendered as real HTML
 * without changing what it does once it is live.
 */
export function useSpeeches(seed?: CloudSpeech[]): CollectionItem[] {
  const mine = useLibrary((s) => s.mine);
  const shelf = useLibrary((s) => s.shelf);
  const hidden = useLibrary((s) => s.hidden);
  const bookmarks = useLibrary((s) => s.bookmarks);
  const progress = useLibrary((s) => s.progress);
  const fetched = useCloud((s) => s.items);
  const cloudItems = fetched.length ? fetched : (seed ?? []);
  const reactions = useAuth((s) => s.reactions);
  const user = useAuth((s) => s.user);
  const profileUsername = useProfile((s) => s.username);

  return useMemo(() => {
    const hiddenSet = new Set(hidden);
    const ctx = {
      reactions,
      bookmarks,
      progress,
      ...(user ? {
        author: {
          uid: user.uid,
          username: profileUsername || user.username || '',
          displayName: user.displayName || profileUsername || user.username || '',
          photoURL: user.photoURL || '',
        },
      } : {}),
    };

    const seeds: Seed[] = [
      ...mine.map((item) => ({ speech: item as Speech, source: 'user' as ItemSource, stored: item })),
      ...cloudItems
        .filter((item) => !mine.some((draft) => draft.cloudId === item.id))
        .map((item) => ({ speech: item as Speech, source: 'cloud' as ItemSource })),
      ...LIBRARY.map((item) => ({ speech: item, source: 'library' as ItemSource })),
      ...shelf.map((item) => ({
        speech: {
          id: item.id,
          kind: 'speech' as const,
          title: item.title,
          author: item.author,
          category: 'From the web',
          occasion: 'Public archive',
          level: 'Standard' as const,
          tags: ['public domain', item.sourceId],
          sourceType: 'archive' as const,
          sourceName: item.source,
          sourceURL: item.sourceUrl,
          license: item.licence,
          authorBadges: ['grey'],
          preview: item.preview,
          content: item.content,
          createdAt: item.fetchedAt.slice(0, 10),
        } satisfies Speech,
        source: 'web' as ItemSource,
        web: item,
      })),
    ];

    return seeds
      .filter((seed) => !hiddenSet.has(seed.speech.id))
      .map((seed) => decorate(seed, ctx))
      .sort((a, b) => {
        // New speeches by people come first, always.
        if (a.rank !== b.rank) return a.rank - b.rank;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [mine, cloudItems, shelf, hidden, bookmarks, progress, reactions, user, profileUsername]);
}

export function useSpeech(id: string | undefined, seed?: CloudSpeech[]): CollectionItem | undefined {
  const items = useSpeeches(seed);
  return useMemo(() => items.find((item) => item.id === id), [items, id]);
}

export interface ContributorRow {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  posts: number;
  likesReceived: number;
  dislikesReceived: number;
  points: number;
}

export function useCategories(): { name: string; count: number }[] {
  const items = useSpeeches();
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [items]);
}

export function useTags(): { name: string; count: number }[] {
  const items = useSpeeches();
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) map.set(tag, (map.get(tag) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);
  }, [items]);
}
