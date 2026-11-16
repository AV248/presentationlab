import type { MetadataRoute } from 'next';
import { buildSitemapUrls } from '@/data/routes';
import { communityPostPath } from '@/lib/community';
import { taxonomySlug } from '@/lib/taxonomy';
import { presentationPath } from '@/lib/paths';
import { absoluteUrl } from '@/lib/seo';
import { readCommunityPosts } from '@/server/community';
import { readSitemapPresentations, readSitemapProfiles } from '@/server/reading';

/** Refresh live public content without pretending every page changed at build time. */
export const revalidate = 300;

type SitemapEntry = MetadataRoute.Sitemap[number];

function meaningfulDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function latestDate(current: Date | undefined, candidate: string): Date | undefined {
  const next = meaningfulDate(candidate);
  if (!next) return current;
  return !current || next > current ? next : current;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls = new Map<string, SitemapEntry>();
  for (const page of buildSitemapUrls()) {
    urls.set(page.loc, {
      url: page.loc,
      priority: page.priority,
      changeFrequency: page.changefreq as 'daily' | 'weekly' | 'monthly',
      ...(page.lastModified ? { lastModified: page.lastModified } : {}),
    });
  }

  const [presentations, profiles, posts] = await Promise.all([
    readSitemapPresentations(),
    readSitemapProfiles(),
    readCommunityPosts(200),
  ]);

  for (const speech of presentations) {
    const path = presentationPath(speech);
    const url = absoluteUrl(path);
    urls.set(url, {
      url,
      lastModified: meaningfulDate(speech.lastModified) ?? meaningfulDate(speech.publishedAt),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  const taxonomyDates = new Map<string, Date | undefined>();
  for (const speech of presentations) {
    const paths = [
      ...(speech.category ? [`/category/${taxonomySlug(speech.category)}`] : []),
      ...speech.tags.map((tag) => `/tag/${taxonomySlug(tag)}`).filter((path) => !path.endsWith('/')),
    ];
    for (const path of paths) taxonomyDates.set(path, latestDate(taxonomyDates.get(path), speech.lastModified || speech.publishedAt));
  }
  for (const [path, lastModified] of taxonomyDates) {
    if (path === '/category/' || path === '/tag/') continue;
    const url = absoluteUrl(path);
    const previous = urls.get(url);
    const previousDate = previous?.lastModified instanceof Date
      ? previous.lastModified
      : typeof previous?.lastModified === 'string' ? meaningfulDate(previous.lastModified) : undefined;
    const mergedDate = latestDate(previousDate, lastModified?.toISOString() ?? '');
    urls.set(url, {
      url,
      ...(mergedDate ? { lastModified: mergedDate } : {}),
      changeFrequency: 'weekly',
      priority: path.startsWith('/category/') ? 0.72 : 0.62,
    });
  }

  for (const profile of profiles) {
    const url = absoluteUrl(`/${encodeURIComponent(profile.username)}`);
    urls.set(url, {
      url,
      ...(meaningfulDate(profile.lastModified) ? { lastModified: meaningfulDate(profile.lastModified) } : {}),
      changeFrequency: 'weekly',
      priority: 0.35,
    });
  }

  for (const post of posts) {
    const url = absoluteUrl(communityPostPath(post));
    urls.set(url, {
      url,
      ...(meaningfulDate(post.updatedAt || post.createdAt) ? { lastModified: meaningfulDate(post.updatedAt || post.createdAt) } : {}),
      changeFrequency: 'weekly',
      priority: 0.55,
    });
  }

  return [...urls.values()];
}
