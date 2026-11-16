import { JsonLd } from '@/components/JsonLd';
import { TaxonomyDirectory } from '@/components/TaxonomyDirectory';
import { routeMetadata } from '@/lib/routeMeta';
import { absoluteUrl } from '@/lib/seo';
import { readTaxonomyDirectory, taxonomyPath } from '@/server/taxonomyPages';

export const metadata = routeMetadata('/tag');
export const revalidate = 300;

export default async function Page() {
  const entries = await readTaxonomyDirectory('tag');
  const url = absoluteUrl('/tag');
  const data = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Speech Tags',
    url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        '@type': 'ListItem', position: index + 1, name: entry.label,
        url: absoluteUrl(taxonomyPath('tag', entry.slug)),
      })),
    },
  }];
  return <><JsonLd data={data} /><TaxonomyDirectory kind="tag" entries={entries} /></>;
}
