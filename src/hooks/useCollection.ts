import { useMemo } from 'react';
import type { Speech } from '../data/speeches';
import { LIBRARY } from '../data/speeches';
import { useLibrary, type StoredSpeech } from '../store/library';
import { useCloud } from '../store/cloud';
import { useAuth } from '../store/auth';
import { wordCount, readingMinutes } from '../lib/text';
import type { WebSpeech } from '../services/webSources';

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
    uid: base.uid,
    myReaction: ctx.reactions[speech.id] ?? null,
    bookmarked: ctx.bookmarks.includes(speech.id),
    progress: ctx.progress[speech.id] ?? 0,
    words: wordCount(speech.content),
    minutes: readingMinutes(speech.content),
    rank: RANK[source],
    ...webExtra,
  };
}

export function useSpeeches(): CollectionItem[] {
  const mine = useLibrary((s) => s.mine);
  const shelf = useLibrary((s) => s.shelf);
  const hidden = useLibrary((s) => s.hidden);
  const bookmarks = useLibrary((s) => s.bookmarks);
  const progress = useLibrary((s) => s.progress);
  const cloudItems = useCloud((s) => s.items);
  const reactions = useAuth((s) => s.reactions);

  return useMemo(() => {
    const hiddenSet = new Set(hidden);
    const ctx = { reactions, bookmarks, progress };

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
          occasion: 'Public domain library',
          level: 'Standard' as const,
          tags: ['public domain', 'wikisource'],
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
  }, [mine, cloudItems, shelf, hidden, bookmarks, progress, reactions]);
}

export function useSpeech(id: string | undefined): CollectionItem | undefined {
  const items = useSpeeches();
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
