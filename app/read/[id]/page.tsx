import type { Metadata } from 'next';
import { ReaderPage } from '@/screens/ReaderPage';
import { JsonLd } from '@/components/JsonLd';
import { buildPages, pageMetaFor } from '@/data/routes';

/**
 * One speech.
 *
 * The first genuinely server-rendered page in the project's history: 2.x built
 * these as static HTML files with a jsdom pass *after* the bundle, which meant
 * the tags and the text could drift apart. Here the same registry entry
 * produces both the `<head>` and the structured data, at build time, from one
 * source — and `generateStaticParams` lists every speech that has one, so all
 * of them are still static files.
 *
 * The page body stays a client component: reading a speech involves reactions,
 * sharing, theme and type controls. The *document* is what a crawler needs
 * server-rendered, and that is what this file adds.
 */

export function generateStaticParams() {
  return buildPages()
    .filter((page) => page.group === 'read')
    .map((page) => ({ id: page.path.replace(/^\/read\//, '') }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = pageMetaFor(`/read/${id}`);
  if (!meta) return { title: 'A speech' };

  return {
    // `absolute` because the registry title already carries the site name.
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: `/read/${id}` },
    openGraph: {
      type: 'article',
      title: meta.title,
      description: meta.description,
      url: `/read/${id}`,
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

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = pageMetaFor(`/read/${id}`);

  return (
    <>
      {meta?.jsonLd?.length ? <JsonLd data={meta.jsonLd} /> : null}
      <ReaderPage />
    </>
  );
}
