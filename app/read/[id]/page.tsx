import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ReaderPage } from '@/screens/ReaderPage';
import { JsonLd } from '@/components/JsonLd';
import { siteUrl } from '@/lib/seo';
import type { CloudSpeech } from '@/lib/speech';
import { buildPages, pageMetaFor } from '@/data/routes';
import { readSpeechResult } from '@/server/reading';

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

  /**
   * A published speech, whose title exists only in the database.
   *
   * Worth the second read: a link to someone's speech, pasted into a chat or
   * a timeline, is judged entirely by the card that unfurls. "A speech" is not
   * a card anyone clicks. This is also the same cached read the page itself
   * makes, so it costs one request in a minute, not two.
   */
  if (!meta) {
    const { speech } = await readSpeechResult(id);
    if (!speech) return { title: 'A speech', robots: { index: false, follow: false } };
    const title = `${speech.title} · Presentation Buddy`;
    const description =
      speech.preview || `${speech.title} by ${speech.author || 'a member'} on Presentation Buddy.`;
    return {
      title: { absolute: title },
      description,
      alternates: { canonical: `/read/${id}` },
      openGraph: { type: 'article', title, description, url: `/read/${id}` },
      twitter: { card: 'summary', title, description },
    };
  }

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

  /*
   * Two ways to know what this page says.
   *
   * A bundled speech — one of the pieces that ships with the app — is known
   * from `src/data/routes.ts`, and it is known at build time: its metadata,
   * structured data and text are all here already.
   *
   * A published speech by a person is known only to the database, so it is
   * read here. That is what makes a shared link open instantly and read
   * correctly to a crawler, and what means a phone on a slow connection sees
   * the speech rather than a spinner.
   *
   * Read failures are not page failures: `initial` is simply absent, and the
   * screen does what it always did — fetches in the browser, and shows its
   * honest not-found state if the speech really does not exist.
   */
  const bundled = pageMetaFor(`/read/${id}`);
  const found = bundled ? null : await readSpeechResult(id);

  /**
   * A speech that genuinely is not there is a 404.
   *
   * `source === 'none'` means no database answered at all — an unconfigured
   * deployment, or one whose database is down — and that must NOT be reported
   * as "this speech does not exist". A missing speech is a fact; a database
   * nobody could reach is a circumstance. Only the first one is a 404; the
   * second renders the reader, which says so itself.
   */
  if (!bundled && !found?.speech && found?.source !== 'none') notFound();

  return (
    <>
      {bundled?.jsonLd?.length ? <JsonLd data={bundled.jsonLd} /> : null}
      {!bundled && found?.speech ? <JsonLd data={[speechJsonLd(id, found.speech)]} /> : null}
      <ReaderPage initial={found?.speech ?? undefined} />
    </>
  );
}

/**
 * The structured data for a published speech.
 *
 * Deliberately conservative: only the fields the database actually holds, and
 * no rating or engagement numbers. Counts that move every minute are the kind
 * of thing a crawler learns to distrust, and an invented one is worse.
 */
function speechJsonLd(id: string, speech: CloudSpeech): Record<string, unknown> {
  const url = `${siteUrl()}/read/${id}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: speech.title,
    ...(speech.preview ? { description: speech.preview } : {}),
    url,
    mainEntityOfPage: url,
    ...(speech.createdAt ? { datePublished: speech.createdAt } : {}),
    ...(speech.author ? { author: { '@type': 'Person', name: speech.author } } : {}),
    ...(speech.tags?.length ? { keywords: speech.tags.join(', ') } : {}),
    isPartOf: { '@type': 'WebSite', name: 'Presentation Buddy', url: siteUrl() },
  };
}

export const dynamicParams = true;

/**
 * Refresh a shared speech's HTML at most once a minute.
 *
 * Someone editing their speech, or deleting it, should not have to wait for a
 * deploy for the change to take effect. Sixty seconds keeps it a cached file
 * for everything that reads it in between.
 */
export const revalidate = 60;
