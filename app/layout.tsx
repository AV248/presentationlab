import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Providers } from './providers';
import { SITE_URL, SITE_NAME, SITE_TAGLINE, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from '@/lib/seo';
import '../src/styles/index.css';

/**
 * The document.
 *
 * Everything that used to be a hand-written `index.html` — the social tags,
 * the canonical URL, the icon set, the font preload, the `<noscript>` escape
 * hatch — is here, and every tag that varies per page is now produced by the
 * framework instead of being patched in by a build script.
 *
 * Three details worth knowing:
 *
 *   • `suppressHydrationWarning` on `<html>` is not sloppiness: the theme
 *     engine writes `data-theme` and the CSS custom properties onto that
 *     element from `localStorage` before React hydrates. Without it, every
 *     visitor with a theme of their own would produce a hydration warning.
 *   • The fonts are loaded by a plain stylesheet plus a `preload`, not by the
 *     usual media-swap inline handler. A font that depends on a script is a
 *     font you cannot see the day a content policy changes.
 *   • `metadataBase` is what makes the relative canonical and Open Graph URLs
 *     absolute. It comes from `VITE_SITE_URL`, the one origin variable the
 *     project has always had.
 */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Pres. Buddy',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    url: '/',
    locale: 'en_US',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#f3ebdf',
  colorScheme: 'light dark',
};

const GFonts =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Spectral:wght@400;500;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;600&family=Caveat:wght@400;600&family=DM+Serif+Display:ital@0;1&family=Work+Sans:wght@400;500;600;700&family=Archivo:wght@500;600;700;800&display=swap';

/** The site-level structured data: one entity, described once. */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  applicationCategory: 'WritingApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Read the session flag before the browser paints the server-rendered
          // curtain. Repeated visits skip it without a frame of flash; first
          // visits keep the page behind the full opening animation.
          dangerouslySetInnerHTML={{ __html: "try { if (sessionStorage.getItem('pb.splash.seen')) document.documentElement.dataset.pbSplashSeen = 'true'; } catch {}" }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" as="style" href={GFonts} />
        <link rel="stylesheet" href={GFonts} />
        <script
          type="application/ld+json"
          // Static, authored here — never interpolated user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
        <noscript>
          <div
            style={{
              padding: 40,
              fontFamily: 'Georgia, serif',
              maxWidth: 560,
              margin: '0 auto',
              lineHeight: 1.7,
            }}
          >
            <h1>Presentation Buddy</h1>
            <p>
              A free, beautifully themeable workspace to write speeches, coach your structure,
              rehearse with a teleprompter and pacing timer, and read a curated library of real
              example speeches. Enable JavaScript to open the studio.
            </p>
            <p>
              <a href="/read/five-minutes">The Five Minutes That Change Everything</a> ·{' '}
              <a href="/topics/public-speaking">The Public Speaking Guide</a> ·{' '}
              <a href="/about">About</a>
            </p>
          </div>
        </noscript>
      </body>
    </html>
  );
}
