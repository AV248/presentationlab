import { LIBRARY } from './speeches';
import { TOPICS, speechesForTopic } from './topics';
import {
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  absoluteUrl,
} from '../lib/seo';

/**
 * The public route registry: every indexable URL the site serves, with the
 * title, description, social card and structured data baked into its
 * prerendered HTML at build time. Consumed by:
 *   • scripts/cards      — which pages get a 1200×630 share card (32)
 *   • scripts/prerender  — which routes become static HTML files   (57)
 *   • scripts/sitemap    — which URLs go into sitemap.xml          (56)
 */

export type PageType = 'website' | 'article';

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  type: PageType;
  /** Sitemap hinting. */
  priority: number;
  changefreq: 'daily' | 'weekly' | 'monthly';
  /** Slug of the generated share card (dist/cards/<card>.png), if any. */
  card: string | null;
  jsonLd: Record<string, unknown>[];
  /** "home" | "read" | "topic" | "topics" | "section" | "404" */
  group: string;
}

const organization = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl('/icons/icon-512.png'),
};

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_TAGLINE,
  publisher: organization,
};

/* ------------------------------------------------------------------ */
/* sections (the app's own pages)                                       */
/* ------------------------------------------------------------------ */

const SECTIONS: { path: string; title: string; description: string }[] = [
  {
    path: '/studio',
    title: `Writing Studio — speech editor with a structure coach`,
    description:
      'Write your speech in a calm editor, get live coaching on structure, word choice and pacing, and export when it is ready. Free and works offline.',
  },
  {
    path: '/practice',
    title: `Rehearsal Room — teleprompter, pacing timer and breathing cues`,
    description:
      'Rehearse your talk with a teleprompter, words-per-minute pacing, countdowns and breathing cues. The free rehearsal room of Presentation Buddy.',
  },
  {
    path: '/community',
    title: 'Community — shared speeches and the open mic',
    description:
      'Read speeches published by the community, climb the contributor leaderboard with real reactions, and share your own work on the open mic.',
  },
  {
    path: '/web',
    title: 'Great Speeches from History — public-domain library',
    description:
      'Fetch famous public-domain speeches from open archives and read them in your own theme — history’s greatest talks, one click away and free.',
  },
  {
    path: '/desk',
    title: 'Your Desk — saved lines, margin notes and reading history',
    description:
      'Your private desk: bookmarked speeches, memorable lines you saved, margin notes and your reading history — kept on your device, always free.',
  },
  {
    path: '/control',
    title: 'Control Room — reading, theme and data settings',
    description:
      'Tune Presentation Buddy: reader typography, rehearsal defaults, offline behaviour and your local data. Every setting explained, nothing hidden.',
  },
  {
    path: '/themes',
    title: 'Theme Studio — 134 options across five design axes',
    description:
      'Design your own workspace: 30 colour worlds, 26 arrangements, 26 materials, 26 type systems and 26 motion personalities — 13.7 million combinations.',
  },
  {
    path: '/about',
    title: 'About Presentation Buddy — what it is and how it works',
    description:
      'Presentation Buddy is a free, local-first workspace for writing and rehearsing talks: themeable, offline-capable, with a curated speech library.',
  },
];

/** The 9 flagship reads that get their own social share card. */
const CARD_READS = [
  'five-minutes',
  'thank-you-yes-i-cried',
  'library-and-the-internet',
  'lead-without-the-title',
  'toast-i-practised',
  'quiet-ones',
  'template-story-structure',
  'new-standard',
  'honest-pitch',
];

const stripMd = (text: string) =>
  text
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/* ------------------------------------------------------------------ */

export function buildPages(): PageMeta[] {
  const pages: PageMeta[] = [];

  /* home */
  pages.push({
    path: '/',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description:
      'A free, beautifully themeable workspace for people who present: write speeches, coach your structure, rehearse with a teleprompter, and read a curated library of real example talks.',
    type: 'website',
    priority: 1.0,
    changefreq: 'daily',
    card: 'presentation-buddy',
    group: 'home',
    jsonLd: [
      website,
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: 'ProductivityApplication',
        operatingSystem: 'Any',
        description: SITE_TAGLINE,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  });

  /* sections */
  for (const section of SECTIONS) {
    pages.push({
      path: section.path,
      title: `${section.title} · ${SITE_NAME}`,
      description: section.description,
      type: 'website',
      priority: 0.7,
      changefreq: 'monthly',
      card: section.path.slice(1),
      group: 'section',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: section.title,
          description: section.description,
          url: absoluteUrl(section.path),
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
        },
      ],
    });
  }

  /* topics index */
  pages.push({
    path: '/topics',
    title: `Speaking Guides — topics, occasions and frameworks · ${SITE_NAME}`,
    description:
      'Guides and example speeches for every occasion: public speaking, wedding toasts, keynotes, pitches, graduation, leadership and speech templates.',
    type: 'website',
    priority: 0.9,
    changefreq: 'weekly',
    card: null,
    group: 'topics',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Speaking Guides',
        description: 'Guides and example speeches for every speaking occasion.',
        url: absoluteUrl('/topics'),
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
        hasPart: TOPICS.map((topic, index) => ({
          '@type': 'WebPage',
          position: index + 1,
          name: topic.title,
          url: absoluteUrl(`/topics/${topic.slug}`),
        })),
      },
    ],
  });

  /* topic hubs */
  for (const topic of TOPICS) {
    const speeches = speechesForTopic(topic);
    pages.push({
      path: `/topics/${topic.slug}`,
      title: `${topic.title} · ${SITE_NAME}`,
      description: topic.description,
      type: 'website',
      priority: 0.85,
      changefreq: 'weekly',
      card: `topic-${topic.slug}`,
      group: 'topic',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: topic.title,
          description: topic.description,
          url: absoluteUrl(`/topics/${topic.slug}`),
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: speeches.map((speech, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: speech.title,
              url: absoluteUrl(`/read/${speech.id}`),
            })),
          },
        },
      ],
    });
  }

  /* reads */
  for (const speech of LIBRARY) {
    pages.push({
      path: `/read/${speech.id}`,
      title: `${speech.title} · ${SITE_NAME}`,
      description: stripMd(speech.preview).slice(0, 158),
      type: 'article',
      priority: 0.8,
      changefreq: 'monthly',
      card: CARD_READS.includes(speech.id) ? `read-${speech.id}` : null,
      group: 'read',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: speech.title,
          description: stripMd(speech.preview),
          author: { '@type': 'Organization', name: speech.author },
          publisher: organization,
          datePublished: speech.createdAt,
          dateModified: speech.createdAt,
          articleSection: speech.category,
          keywords: speech.tags.join(', '),
          mainEntityOfPage: absoluteUrl(`/read/${speech.id}`),
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
        },
      ],
    });
  }

  /* 404 — prerendered so unknown paths still boot the app, never indexed */
  pages.push({
    path: '/404',
    title: `Page not found · ${SITE_NAME}`,
    description: 'That page does not exist — but the library does.',
    type: 'website',
    priority: 0,
    changefreq: 'monthly',
    card: null,
    group: '404',
    jsonLd: [],
  });

  return pages;
}

/** Pages that receive a share card should equal 32 (checked by the build). */
export function buildCardPages(): { path: string; card: string; title: string; description: string; group: string }[] {
  return buildPages()
    .filter((page) => page.card !== null)
    .map((page) => ({
      path: page.path,
      card: page.card as string,
      title: page.title,
      description: page.description,
      group: page.group,
    }));
}

/** Look up the registry entry for one path (used by the pages themselves). */
export function pageMetaFor(path: string): PageMeta | undefined {
  return buildPages().find((page) => page.path === path);
}

/** Sitemap excludes the 404 page only. */
export function buildSitemapUrls(): { loc: string; priority: number; changefreq: string }[] {
  return buildPages()
    .filter((page) => page.group !== '404')
    .map((page) => ({
      loc: absoluteUrl(page.path),
      priority: page.priority,
      changefreq: page.changefreq,
    }));
}

/** Route paths the prerenderer should write as static HTML. */
export function buildPrerenderRoutes(): PageMeta[] {
  return buildPages();
}
