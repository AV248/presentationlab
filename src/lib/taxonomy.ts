import { LIBRARY, type Speech } from '../data/speeches';
import { slugifySegment } from './paths';

export type TaxonomyKind = 'category' | 'tag';

export interface TaxonomyEntry {
  slug: string;
  label: string;
  count: number;
}

export function taxonomySlug(value: string): string {
  return slugifySegment(value.trim());
}

export function parseTaxonomyTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).map((tag) => tag.trim()).filter(Boolean);
    } catch {
      // Older Turso rows use comma-separated text instead of JSON.
    }
  }
  return raw.split(',').map((tag) => tag.trim().replace(/^['\"]|['\"]$/g, '')).filter(Boolean);
}

export function taxonomyFromSpeeches(speeches: Pick<Speech, 'category' | 'tags'>[], kind: TaxonomyKind): TaxonomyEntry[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const speech of speeches) {
    const values = kind === 'category' ? [speech.category] : speech.tags;
    for (const value of values) {
      const label = value.trim();
      const slug = taxonomySlug(label);
      if (!slug) continue;
      const previous = counts.get(slug);
      counts.set(slug, { label: previous?.label ?? label, count: (previous?.count ?? 0) + 1 });
    }
  }
  return [...counts.entries()]
    .map(([slug, entry]) => ({ slug, ...entry }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function labelForTaxonomySlug(slug: string, kind: TaxonomyKind, extra: TaxonomyEntry[] = []): string {
  const fromExtra = extra.find((entry) => entry.slug === slug)?.label;
  if (fromExtra) return fromExtra;
  const fromLibrary = taxonomyFromSpeeches(LIBRARY, kind).find((entry) => entry.slug === slug)?.label;
  return fromLibrary ?? slug.split('-').filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

export function speechesForTaxonomy<T extends Pick<Speech, 'id' | 'category' | 'tags'>>(
  speeches: T[],
  kind: TaxonomyKind,
  slug: string,
): T[] {
  return speeches.filter((speech) => kind === 'category'
    ? taxonomySlug(speech.category) === slug
    : speech.tags.some((tag) => taxonomySlug(tag) === slug));
}
