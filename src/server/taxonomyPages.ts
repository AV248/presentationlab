import { LIBRARY, type Speech } from '../data/speeches';
import type { CloudSpeech } from '../lib/speech';
import { slugifySegment } from '../lib/paths';
import { taxonomyFromSpeeches, speechesForTaxonomy, type TaxonomyEntry, type TaxonomyKind } from '../lib/taxonomy';
import { readCategory, readSitemapPresentations, readTag } from './reading';

export interface PublicIndexSpeech {
  id: string;
  title: string;
  author: string;
  preview: string;
  category: string;
  tags: string[];
  username?: string;
  slug?: string;
  folder?: string;
}

export interface TaxonomyPageData {
  kind: TaxonomyKind;
  slug: string;
  label: string;
  description: string;
  items: PublicIndexSpeech[];
  relatedCategories: TaxonomyEntry[];
  relatedTags: TaxonomyEntry[];
}

function indexSpeech(speech: Speech | CloudSpeech): PublicIndexSpeech {
  return {
    id: speech.id,
    title: speech.title,
    author: speech.author,
    preview: speech.preview,
    category: speech.category,
    tags: speech.tags,
    ...(speech.username ? { username: speech.username } : {}),
    ...(speech.slug ? { slug: speech.slug } : {}),
    ...('folder' in speech && speech.folder ? { folder: speech.folder } : {}),
  };
}

function combinedEntries(kind: TaxonomyKind, live: Awaited<ReturnType<typeof readSitemapPresentations>>): TaxonomyEntry[] {
  const counts = new Map<string, TaxonomyEntry>();
  for (const entry of taxonomyFromSpeeches(LIBRARY, kind)) counts.set(entry.slug, entry);
  for (const entry of taxonomyFromSpeeches(live, kind)) {
    const previous = counts.get(entry.slug);
    counts.set(entry.slug, {
      slug: entry.slug,
      label: previous?.label ?? entry.label,
      count: (previous?.count ?? 0) + entry.count,
    });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function readTaxonomyDirectory(kind: TaxonomyKind): Promise<TaxonomyEntry[]> {
  const live = await readSitemapPresentations();
  return combinedEntries(kind, live);
}

export async function readTaxonomyPage(kind: TaxonomyKind, slug: string): Promise<TaxonomyPageData | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const live = await readSitemapPresentations();
  const entries = combinedEntries(kind, live);
  const taxonomy = entries.find((entry) => entry.slug === slug);
  if (!taxonomy) return null;

  const staticItems = speechesForTaxonomy(LIBRARY, kind, slug);
  const cloud = kind === 'category'
    ? await readCategory(taxonomy.label, 500)
    : await readTag(taxonomy.label, 500);
  const unique = new Map<string, PublicIndexSpeech>();
  for (const item of [...cloud.items, ...staticItems]) unique.set(item.id, indexSpeech(item));
  const items = [...unique.values()];

  const relatedCategories = combinedEntries('category', live).filter((entry) => entry.slug !== slug).slice(0, 10);
  const relatedTags = combinedEntries('tag', live).filter((entry) => entry.slug !== slug).slice(0, 16);
  const label = taxonomy.label;
  const count = items.length;
  const noun = kind === 'category' ? `${label} speeches` : `speeches tagged ${label}`;
  return {
    kind,
    slug,
    label,
    description: `Read ${count} public example ${noun.toLowerCase()} in Presentation Buddy, then follow a related speech to its own page.`,
    items,
    relatedCategories,
    relatedTags,
  };
}

export function taxonomyPath(kind: TaxonomyKind, labelOrSlug: string): string {
  return `/${kind}/${slugifySegment(labelOrSlug)}`;
}
