import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { HandlePage } from '@/screens/ProfilePage';
import { JsonLd } from '@/components/JsonLd';
import {
  readPublicHandle,
  readWriterResult,
  readWriterWork,
  readWriterWorkResult,
  type PublicProfile,
} from '@/server/reading';
import { normalizeUsername, RESERVED_HANDLES } from '@/lib/identity';
import { presentationPath } from '@/lib/paths';
import { absoluteUrl } from '@/lib/seo';
import type { CloudSpeech } from '@/lib/speech';

function isReserved(username: string): boolean {
  return RESERVED_HANDLES.has(username);
}

function isValidHandle(username: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function profileStructuredData(profile: PublicProfile, username: string): Record<string, unknown> {
  const url = absoluteUrl(`/${encodeURIComponent(username)}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    name: `${profile.displayName} (@${username})`,
    mainEntity: {
      '@type': 'Person',
      name: profile.displayName,
      identifier: username,
      url,
      ...(profile.bio ? { description: profile.bio } : {}),
      ...(profile.photoURL ? { image: profile.photoURL } : {}),
      ...(profile.website ? { sameAs: [profile.website] } : {}),
    },
  };
}

function presentationStructuredData(work: CloudSpeech, username: string): Record<string, unknown> {
  const canonical = presentationPath({ ...work, username: work.username || username });
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: work.title,
    ...(work.preview ? { description: work.preview } : {}),
    url: absoluteUrl(canonical),
    mainEntityOfPage: absoluteUrl(canonical),
    ...(work.createdAt ? { datePublished: work.createdAt } : {}),
    ...(work.updatedAt ? { dateModified: work.updatedAt } : {}),
    author: { '@type': 'Person', name: work.author || username, url: absoluteUrl(`/${encodeURIComponent(username)}`) },
    ...(work.category ? { articleSection: work.category } : {}),
    ...(work.tags?.length ? { keywords: work.tags.join(', ') } : {}),
    isPartOf: { '@type': 'WebSite', name: 'Presentation Buddy', url: absoluteUrl('/') },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; rest?: string[] }>;
}): Promise<Metadata> {
  const { username: raw, rest } = await params;
  const username = normalizeUsername(raw ?? '');
  if (!isValidHandle(username) || isReserved(username)) return { robots: { index: false, follow: false } };

  if (rest?.length) {
    if (rest.length > 2) return { robots: { index: false, follow: false } };
    // A public content URL resolves its exact Turso row. It never downloads a
    // writer's full (and potentially very large) profile listing just to find
    // one title for Open Graph.
    const key = rest[rest.length - 1] ?? '';
    const folder = rest.length > 1 ? rest[0] ?? '' : undefined;
    const work = await readWriterWork(username, key, folder);
    if (!work) return { robots: { index: false, follow: false } };
    const title = `${work.title} · ${username} · Presentation Buddy`;
    const description = work.preview || `${work.title} by ${work.author || `@${username}`} on Presentation Buddy.`;
    const canonical = presentationPath({ ...work, username: work.username || username });
    return {
      title: { absolute: title },
      description,
      alternates: { canonical },
      openGraph: { type: 'article', title, description, url: canonical },
      twitter: { card: 'summary', title, description },
    };
  }

  const { profile } = await readPublicHandle(username);
  if (!profile) return { robots: { index: false, follow: false } };
  const title = `${profile.displayName} (@${username})`;
  const description = profile.bio || `Speeches and work by @${username} on Presentation Buddy.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/${encodeURIComponent(username)}` },
    openGraph: {
      type: 'profile', title, description, url: `/${encodeURIComponent(username)}`,
      ...(profile.photoURL ? { images: [{ url: profile.photoURL }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, ...(profile.photoURL ? { images: [profile.photoURL] } : {}) },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ username: string; rest?: string[] }>;
}) {
  const { username: raw, rest } = await params;
  const username = normalizeUsername(raw ?? '');
  if (!isValidHandle(username) || isReserved(username)) notFound();
  if (rest && rest.length > 2) notFound();

  const handlePromise = readPublicHandle(username);
  let worksPromise: Promise<CloudSpeech[]>;
  let worksStatus: 'available' | 'unavailable';

  if (!rest?.length) {
    const workResult = await readWriterResult(username);
    worksPromise = Promise.resolve(workResult.items);
    worksStatus = workResult.source === 'none' ? 'unavailable' : 'available';
  } else {
    const key = rest[rest.length - 1] ?? '';
    const folder = rest.length > 1 ? rest[0] ?? '' : undefined;
    const exact = await readWriterWorkResult(username, key, folder);
    if (exact.speech) {
      worksPromise = Promise.resolve([exact.speech]);
      worksStatus = 'available';
    } else if (exact.source === 'none') {
      worksPromise = Promise.resolve([]);
      worksStatus = 'unavailable';
    } else if (rest.length === 1) {
      // A one-segment URL may be a folder listing. Only fetch the lightweight
      // writer index after the direct content lookup did not find a work.
      const listing = await readWriterResult(username);
      worksPromise = Promise.resolve(listing.items);
      worksStatus = listing.source === 'none' ? 'unavailable' : 'available';
    } else {
      worksPromise = Promise.resolve([]);
      worksStatus = 'available';
    }
  }

  const [{ handleState, profile }, works] = await Promise.all([handlePromise, worksPromise]);
  if (handleState === 'free' && !profile) notFound();

  const work = rest?.length === 1
    ? works.find((item) => item.slug === rest[0] || item.id === rest[0])
    : rest?.length === 2
      ? works.find((item) => (item.folder ?? '') === rest[0] && (item.slug === rest[1] || item.id === rest[1]))
      : null;
  const structuredData = work
    ? [presentationStructuredData(work, username)]
    : profile ? [profileStructuredData(profile, username)] : [];

  return (
    <>
      {structuredData.length ? <JsonLd data={structuredData} /> : null}
      <HandlePage initial={{ username, profile, works, handleState, worksStatus }} />
    </>
  );
}

export const revalidate = 60;
