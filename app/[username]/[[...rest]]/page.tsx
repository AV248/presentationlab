import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { HandlePage } from '@/screens/ProfilePage';
import { JsonLd } from '@/components/JsonLd';
import { readHandleState, readProfile, readWriter, type PublicProfile } from '@/server/reading';
import { normalizeUsername, RESERVED_HANDLES } from '@/lib/identity';
import { presentationPath } from '@/lib/paths';
import { absoluteUrl } from '@/lib/seo';
import type { CloudSpeech } from '@/lib/speech';

function isReserved(username: string): boolean {
  return RESERVED_HANDLES.has(username);
}

function findWork(rest: string[] | undefined, username: string, works: CloudSpeech[]): CloudSpeech | null {
  const pieces = Array.isArray(rest) ? rest : [];
  if (pieces.length < 1 || pieces.length > 2) return null;
  const slug = pieces[pieces.length - 1] ?? '';
  const folder = pieces.length > 1 ? pieces[0] ?? '' : '';
  const withUsername = (work: CloudSpeech) => ({ ...work, username: work.username || username });
  const exact = works.find((work) => (work.folder ?? '') === folder && ((work.slug ?? '') === slug || work.id === slug));
  const legacy = !folder ? works.find((work) => (work.slug ?? '') === slug || work.id === slug) : undefined;
  const match = exact ?? legacy;
  return match ? withUsername(match) : null;
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
  if (!username || isReserved(username)) return { robots: { index: false, follow: false } };

  const [profile, works] = await Promise.all([readProfile(username), rest?.length ? readWriter(username) : Promise.resolve([])]);
  const work = findWork(rest, username, works);
  if (rest?.length && !work) return { robots: { index: false, follow: false } };
  if (work) {
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
  if (!username || isReserved(username)) notFound();

  const [state, profile, works] = await Promise.all([
    readHandleState(username),
    readProfile(username),
    readWriter(username),
  ]);
  if (state === 'free' && !profile) notFound();

  const work = findWork(rest, username, works);
  const structuredData = work
    ? [presentationStructuredData(work, username)]
    : profile ? [profileStructuredData(profile, username)] : [];

  return (
    <>
      {structuredData.length ? <JsonLd data={structuredData} /> : null}
      <HandlePage initial={{ username, profile, works, handleState: state }} />
    </>
  );
}

export const revalidate = 60;
