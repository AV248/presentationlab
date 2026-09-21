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

/**
 * The app's own pages.
 *
 * `priority` and `changefreq` are real signals, not decoration: the
 * rehearsal room is the product, so it ranks just under the home page,
 * and arrivals genuinely changes every day. Pages that are tools rather
 * than content (settings, themes) sit lower on purpose — we would rather
 * Google spend its crawl budget on the library.
 */
const SECTIONS: {
  path: string;
  title: string;
  description: string;
  priority?: number;
  changefreq?: 'daily' | 'weekly' | 'monthly';
}[] = [
  {
    path: '/rehearse',
    title: `Rehearsal Room — fullscreen teleprompter, pacing timer and breathing cues`,
    description:
      'Rehearse out loud in a distraction-free fullscreen stage: teleprompter scroll, words-per-minute pacing, countdowns and breathing cues. Free for students.',
    priority: 0.95,
    changefreq: 'weekly',
  },
  {
    path: '/write',
    title: `Writing Desk — speech editor with a built-in dictionary`,
    description:
      'Write your speech in a calm editor with live structure coaching and a word smith that suggests stronger alternatives as you type. Free and works offline.',
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    path: '/community',
    title: 'Community — shared speeches and the open mic',
    description:
      'Read speeches published by the community, climb the contributor leaderboard with real reactions, and share your own work on the open mic.',
    priority: 0.7,
    changefreq: 'daily',
  },
  {
    path: '/arrivals',
    title: 'Fresh Arrivals — five new speeches from the open archives every session',
    description:
      'Every session brings five new public-domain speeches drawn live from Wikisource, Project Gutenberg and Wikiquote, each one credited to its source.',
    priority: 0.85,
    changefreq: 'daily',
  },
  {
    path: '/desk',
    title: 'Your Desk — saved lines, margin notes and reading history',
    description:
      'Your private desk: bookmarked speeches, memorable lines you saved, margin notes and your reading history — kept on your device, always free.',
    priority: 0.5,
    changefreq: 'monthly',
  },
  {
    path: '/control',
    title: 'Control Room — reading, theme and data settings',
    description:
      'Tune Presentation Buddy: reader typography, rehearsal defaults, offline behaviour and your local data. Every setting explained, nothing hidden.',
    priority: 0.3,
    changefreq: 'monthly',
  },
  {
    path: '/themes',
    title: 'Theme Studio — 134 options across five design axes',
    description:
      'Design your own workspace: 30 colour worlds, 26 arrangements, 26 materials, 26 type systems and 26 motion personalities — 13.7 million combinations.',
    priority: 0.6,
    changefreq: 'monthly',
  },
  {
    path: '/about',
    title: 'About Presentation Buddy — what it is and how it works',
    description:
      'Presentation Buddy is a free, local-first workspace for writing and rehearsing talks: themeable, offline-capable, with a curated speech library.',
    priority: 0.6,
    changefreq: 'monthly',
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
      // The WebSite block carries a SearchAction, which is what lets Google
      // render a search box directly under the result for a branded query.
      {
        ...website,
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: 'ProductivityApplication',
        operatingSystem: 'Any',
        description: SITE_TAGLINE,
        browserRequirements: 'Requires JavaScript.',
        softwareVersion: '2.4',
        featureList: [
          'Fullscreen rehearsal stage with teleprompter and pacing timer',
          'Speech editor with structure coaching and a built-in thesaurus',
          'Integrated dictionary that defines uncommon words as you read',
          'Public-domain speech library refreshed from open archives',
          'Works offline as an installable app',
        ],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: organization,
      },
      // A short FAQ on the home page: these are the questions people
      // actually type, and answering them here is what wins the snippet.
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Is Presentation Buddy free?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. Every feature — the rehearsal room, the writing desk, the dictionary and the whole speech library — is free, and the app works offline with no account required.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I practise a speech out loud?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Open the rehearsal room, choose or paste your speech, and start the stage. The page goes fullscreen, your words scroll at your chosen words-per-minute, and a timer tracks whether you are running over or under.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I use it on my phone?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. Presentation Buddy is built mobile-first and installs as an app on iOS and Android, including the fullscreen rehearsal stage.',
            },
          },
        ],
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
      priority: section.priority ?? 0.7,
      changefreq: section.changefreq ?? 'monthly',
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
