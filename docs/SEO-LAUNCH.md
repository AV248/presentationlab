# SEO launch checks

Presentation Buddy 3.1 uses the Next.js App Router. This checklist is about
external launch work and verifying the deployed site; it is not a claim about
rankings or guaranteed index counts. For hosting, see [VERCEL.md](VERCEL.md).
Do not upload a `dist/` static export: the live application needs its Next.js
runtime and API routes.

## Before launch

1. Set `VITE_SITE_URL` to the production origin and rebuild/redeploy. The site
   uses it for canonical and social metadata.
2. Run `npm run verify:all` locally. Check the build output for the actual route
   and metadata results; counts can change with the route inventory.
3. Confirm the deployed `/robots.txt` and `/sitemap.xml` use the production
   domain and that representative pages return the expected canonical URL,
   title and readable HTML.
4. Test direct navigation to `/`, a public `/read/<id>` page, `/topics`,
   `/write` and `/rehearse`. A browser visit alone does not prove that all
   routes are indexed.
5. Verify the production CSP and response headers from `next.config.ts`, plus
   the PWA manifest/service-worker behavior on the deployed origin.

## Search Console

1. Verify ownership of the production domain (DNS verification is a durable
   choice).
2. Submit `https://<production-domain>/sitemap.xml` in Google Search Console.
3. Use URL Inspection for the home page and a small set of representative
   public topic and presentation pages. Request indexing where appropriate.
4. Review the Pages/indexing reports over time. Crawling, indexing and rankings
   are controlled by search engines and are not guaranteed by a successful
   build or a sitemap submission.

## Content and social previews

Keep public content genuinely useful and sourced. For imported material,
retain the source account, original title/URL, license and import/fetch time;
never imply an archive text is original Presentation Buddy writing. Verify
social-card metadata on the deployed origin with a preview debugger before
promoting a link.

The repository generates share-card assets as part of `npm run build`; use the
build output and the page's actual Open Graph metadata rather than assuming a
fixed number of cards or indexed pages. A fresh original presentation or guide
may be shared from the product, but no publishing cadence or search placement
is promised here.
