import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { PublicSpeechIndex } from '@/components/PublicSpeechIndex';
import { buildPages } from '@/data/routes';
import { absoluteUrl } from '@/lib/seo';
import { presentationPath } from '@/lib/paths';
import { readTaxonomyPage } from '@/server/taxonomyPages';

export function generateStaticParams() {
  return buildPages().filter((page) => page.group === 'category')
    .map((page) => ({ slug: page.path.replace(/^\/category\//, '') }));
}

async function pageData(slug: string) {
  return readTaxonomyPage('category', slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await pageData(slug);
  if (!data) return { title: 'Category not found', robots: { index: false, follow: false } };
  const title = `${data.label} Speeches & Presentations · Presentation Buddy`;
  const path = `/category/${slug}`;
  return {
    title: { absolute: title },
    description: data.description,
    alternates: { canonical: path },
    openGraph: { type: 'website', title, description: data.description, url: path },
    twitter: { card: 'summary', title, description: data.description },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await pageData(slug);
  if (!data) notFound();
  const url = absoluteUrl(`/category/${slug}`);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${data.label} Speeches & Presentations`,
      description: data.description,
      url,
      isPartOf: { '@type': 'WebSite', name: 'Presentation Buddy', url: absoluteUrl('/') },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: data.items.length,
        itemListElement: data.items.map((speech, index) => ({
          '@type': 'ListItem', position: index + 1, name: speech.title,
          url: absoluteUrl(presentationPath(speech)),
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Categories', item: absoluteUrl('/category') },
        { '@type': 'ListItem', position: 3, name: data.label, item: url },
      ],
    },
  ];
  return <><JsonLd data={jsonLd} /><PublicSpeechIndex data={data} /></>;
}

export const dynamicParams = true;
export const revalidate = 300;
