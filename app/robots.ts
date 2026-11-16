import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/** Public pages are crawlable; personal workspaces are not. robots.txt is not access control. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/read/', '/topics/', '/category/', '/tag/', '/community/'],
        disallow: [
          '/admin', '/admin/', '/dbms', '/dbms/',
          '/desk', '/desk/', '/settings', '/settings/', '/control', '/control/',
          '/claim', '/claim/', '/sso-callback', '/sso-callback/',
          '/*?utm_', '/*&', '/*?sort=', '/*?kind=', '/*?source=', '/*?category=',
        ],
      },
      {
        userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended'],
        allow: '/',
      },
      { userAgent: 'AhrefsBot', crawlDelay: 10 },
      { userAgent: 'SemrushBot', crawlDelay: 10 },
      { userAgent: 'MJ12bot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
