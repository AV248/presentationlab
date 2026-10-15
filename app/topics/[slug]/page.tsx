import type { Metadata } from 'next';
import { TopicPage } from '@/screens/TopicPage';
import { JsonLd } from '@/components/JsonLd';
import { buildPages, pageMetaFor } from '@/data/routes';

/**
 * One speaking guide.
 *
 * Server-rendered for the same reason the speech pages are: these are the
 * pages people find by searching ("how to open a wedding toast"), so their
 * title, description, canonical and structured data belong in the HTML that
 * arrives, not in a tag a script adds a moment later.
 */

export function generateStaticParams() {
  return buildPages()
    .filter((page) => page.group === 'topic')
    .map((page) => ({ slug: page.path.replace(/^\/topics\//, '') }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = pageMetaFor(`/topics/${slug}`);
  if (!meta) return { title: 'Speaking guides' };

  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: `/topics/${slug}` },
    openGraph: {
      type: 'website',
      title: meta.title,
      description: meta.description,
      url: `/topics/${slug}`,
      ...(meta.card ? { images: [{ url: `/cards/${meta.card}.png`, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      ...(meta.card ? { images: [`/cards/${meta.card}.png`] } : {}),
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = pageMetaFor(`/topics/${slug}`);

  return (
    <>
      {meta?.jsonLd?.length ? <JsonLd data={meta.jsonLd} /> : null}
      <TopicPage />
    </>
  );
}
