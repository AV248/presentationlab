import { useMemo } from 'react';
import type { Speech } from '../data/speeches';
import { LIBRARY } from '../data/speeches';
import { useLibrary, baseLikes, baseViews, type StoredSpeech } from '../store/library';
import { useCloud } from '../store/cloud';
import { wordCount, readingMinutes } from '../lib/text';

export type ItemSource = 'library' | 'user' | 'cloud';

export interface CollectionItem extends Speech {
  source: ItemSource;
  status?: 'draft' | 'published';
  likes: number;
  views: number;
  likedByMe: boolean;
  bookmarked: boolean;
  progress: number;
  words: number;
  minutes: number;
  updatedAt?: string;
  remoteId?: string;
}

export function useSpeeches(): CollectionItem[] {
  const mine = useLibrary((s) => s.mine);
  const hidden = useLibrary((s) => s.hidden);
  const likes = useLibrary((s) => s.likes);
  const views = useLibrary((s) => s.views);
  const bookmarks = useLibrary((s) => s.bookmarks);
  const progress = useLibrary((s) => s.progress);
  const cloudItems = useCloud((s) => s.items);

  return useMemo(() => {
    const hiddenSet = new Set(hidden);
    const decorate = (speech: Speech, source: ItemSource, stored?: StoredSpeech): CollectionItem => ({
      ...speech,
      source,
      status: stored?.status,
      updatedAt: stored?.updatedAt,
      remoteId: speech.id,
      likes: baseLikes(speech.id) + (likes[speech.id] ? 1 : 0),
      views: (baseViews(speech.id) as number) + (views[speech.id] ?? 0),
      likedByMe: Boolean(likes[speech.id]),
      bookmarked: bookmarks.includes(speech.id),
      progress: progress[speech.id] ?? 0,
      words: wordCount(speech.content),
      minutes: readingMinutes(speech.content),
    });

    const library = LIBRARY.filter((s) => !hiddenSet.has(s.id)).map((s) => decorate(s, 'library'));
    const user = mine.map((s) => decorate(s, 'user', s));
    const cloud = cloudItems
      .filter((s) => !hiddenSet.has(s.id))
      .map((s) => decorate(s, 'cloud'));

    return [...user, ...library, ...cloud];
  }, [mine, hidden, likes, views, bookmarks, progress, cloudItems]);
}

export function useSpeech(id: string | undefined): CollectionItem | undefined {
  const items = useSpeeches();
  return useMemo(() => items.find((item) => item.id === id), [items, id]);
}

export interface LeaderboardAuthor {
  name: string;
  speeches: number;
  likes: number;
  words: number;
  items: CollectionItem[];
}

export function useLeaderboard(): LeaderboardAuthor[] {
  const items = useSpeeches();
  return useMemo(() => {
    const map = new Map<string, LeaderboardAuthor>();
    for (const item of items) {
      if (item.source === 'user' && item.status !== 'published') continue;
      const existing = map.get(item.author);
      if (existing) {
        existing.speeches += 1;
        existing.likes += item.likes;
        existing.words += item.words;
        existing.items.push(item);
      } else {
        map.set(item.author, {
          name: item.author,
          speeches: 1,
          likes: item.likes,
          words: item.words,
          items: [item],
        });
      }
    }
    return [...map.values()].sort((a, b) => b.likes - a.likes);
  }, [items]);
}

export function useCategories(): { name: string; count: number }[] {
  const items = useSpeeches();
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
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
