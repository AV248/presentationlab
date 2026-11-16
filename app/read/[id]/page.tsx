import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ReaderPage } from '@/screens/ReaderPage';
import { JsonLd } from '@/components/JsonLd';
import { absoluteUrl } from '@/lib/seo';
import { presentationPath } from '@/lib/paths';
import type { CloudSpeech } from '@/lib/speech';
import { buildPages, pageMetaFor } from '@/data/routes';
import { readSpeechResult } from '@/server/reading';
import { readWebSpeechById, type WebSpeech } from '@/services/webSources';

export function generateStaticParams() {
  return buildPages()
    .filter((page) => page.group === 'read')
    .map((page) => ({ id: page.path.replace(/^\/read\//, '') }));
}

function isArchiveId(id: string): boolean {
  return /^(ws|wq|pg)-\d{1,12}$/.test(id);
}

function archiveSpeech(web: WebSpeech): CloudSpeech {
  return {
    id: web.id,
    kind: 'speech',
    title: web.title,
    author: web.author,
    category: 'From the archives',
    occasion: `${web.source} source text`,
    level: 'Standard',
    tags: [web.sourceId, 'archive'],
    preview: web.preview,
    content: web.content,
    createdAt: '',
    uid: '',
    sourceType: 'archive',
    sourceName: web.source,
    sourceURL: web.sourceUrl,
    license: web.licence,
    allowCopy: true,
    views: 0,
    likes: 0,
    dislikes: 0,
    shares: 0,
    ad: false,
    updatedAt: web.fetchedAt,
    createdMs: 0,
  };
}

function articleJsonLd(speech: CloudSpeech): Record<string, unknown> {
  const canonicalPath = presentationPath(speech);
  const url = absoluteUrl(canonicalPath);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: speech.title,
    ...(speech.preview ? { description: speech.preview } : {}),
    url,
    mainEntityOfPage: url,
    ...(speech.createdAt ? { datePublished: speech.createdAt } : {}),
    ...(speech.updatedAt ? { dateModified: speech.updatedAt } : {}),
    author: { '@type': speech.username ? 'Person' : 'Organization', name: speech.author || 'Presentation Buddy' },
    ...(speech.category ? { articleSection: speech.category } : {}),
    ...(speech.tags?.length ? { keywords: speech.tags.join(', ') } : {}),
    ...(speech.sourceURL ? { isBasedOn: speech.sourceURL } : {}),
    ...(speech.license ? { license: speech.license } : {}),
    isPartOf: { '@type': 'WebSite', name: 'Presentation Buddy', url: absoluteUrl('/') },
  };
}

async function resolveSpeech(id: string): Promise<CloudSpeech | null> {
  const { speech } = await readSpeechResult(id);
  if (speech) return speech;
  if (!isArchiveId(id)) return null;
  const web = await readWebSpeechById(id);
  return web ? archiveSpeech(web) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = pageMetaFor(`/read/${id}`);
  if (meta) {
    return {
      title: { absolute: meta.title },
      description: meta.description,
      alternates: { canonical: `/read/${encodeURIComponent(id)}` },
      openGraph: {
        type: 'article', title: meta.title, description: meta.description, url: `/read/${encodeURIComponent(id)}`,
        ...(meta.card ? { images: [{ url: `/cards/${meta.card}.png`, width: 1200, height: 630 }] } : {}),
      },
      twitter: {
        card: 'summary_large_image', title: meta.title, description: meta.description,
        ...(meta.card ? { images: [`/cards/${meta.card}.png`] } : {}),
      },
    };
  }

  const speech = await resolveSpeech(id);
  if (!speech) return { title: 'A speech', robots: { index: false, follow: false } };
  const title = `${speech.title} · Presentation Buddy`;
  const description = speech.preview || `${speech.title} by ${speech.author || 'a member'} on Presentation Buddy.`;
  const canonical = presentationPath(speech);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { type: 'article', title, description, url: canonical },
    twitter: { card: 'summary', title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundled = pageMetaFor(`/read/${id}`);
  const readResult = bundled ? null : await readSpeechResult(id);
  let speech = readResult?.speech ?? null;
  if (!bundled && !speech && isArchiveId(id)) {
    const web = await readWebSpeechById(id);
    speech = web ? archiveSpeech(web) : null;
  }

  if (!bundled && !speech && readResult?.source !== 'none') notFound();
  if (!bundled && !speech && isArchiveId(id)) notFound();

  return (
    <>
      {bundled?.jsonLd?.length ? <JsonLd data={bundled.jsonLd} /> : null}
      {!bundled && speech ? <JsonLd data={[articleJsonLd(speech)]} /> : null}
      <ReaderPage initial={speech ?? undefined} />
    </>
  );
}

export const dynamicParams = true;
export const revalidate = 60;
