# Deploying Presentation Buddy

> **3.1:** the framework is Next.js and the build command is `npm run build` again. See
> [NEXTJS.md](NEXTJS.md) for the deploy changes, and for the build-command trick that still
> works when you would rather not use a terminal.

The build output in `dist/` is a pile of static files. Any static host will
serve it. What follows is everything the host has to get right.

```bash
npm ci
npm run verify     # typecheck + headless render of every route
npm run build      # bundle → 32 cards → 57 prerendered pages → sitemap
# upload dist/
```

---

## 1. The three things a host must do

**Serve prerendered files first.** Every indexable route is a real file:
`/rehearse` is `dist/rehearse/index.html`. If the host rewrites everything to
`index.html` before checking disk, Google gets the empty shell on every URL
and the prerendering is wasted.

**Fall back to `/index.html` for anything else.** Routes with no static file
(`/admin`, `/read/<a-cloud-speech-id>`) are client-rendered.

**Serve `dist/404.html` with a 404 status** for unknown paths.

## 2. Redirects

`public/_redirects` is Netlify-style. 2.4 renamed the three working rooms and
the old paths must keep their ranking:

| From | To | Code |
| --- | --- | --- |
| `/practice`, `/practice/*` | `/rehearse`, `/rehearse/:splat` | 301 |
| `/studio`, `/studio/*` | `/write`, `/write/:splat` | 301 |
| `/web` | `/arrivals` | 301 |

The app also redirects these client-side, so a visitor never lands on a dead
route even if the host ignores the file. The 301s are what move the *ranking*.

## 3. Headers

`public/_headers` covers Netlify and Cloudflare Pages. Two rules matter most:

- **`/assets/*` is immutable** — filenames are content-hashed.
- **HTML and `/sw.js` must revalidate** — otherwise a deploy never lands.

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name presentationbuddy.aavrit.dedyn.io;
  root /var/www/presentationbuddy/dist;

  add_header X-Frame-Options SAMEORIGIN always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

  # 2.4 route renames.
  location = /practice { return 301 /rehearse; }
  location ^~ /practice/ { rewrite ^/practice/(.*)$ /rehearse/$1 permanent; }
  location = /studio   { return 301 /write; }
  location ^~ /studio/ { rewrite ^/studio/(.*)$ /write/$1 permanent; }
  location = /web      { return 301 /arrivals; }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location = /sw.js {
    add_header Cache-Control "public, max-age=0, must-revalidate";
  }

  # Prerendered file first, directory index second, shell last.
  location / {
    try_files $uri $uri/index.html /index.html;
  }

  error_page 404 /404.html;
}
```

### Caddy

```
presentationbuddy.aavrit.dedyn.io {
  root * /var/www/presentationbuddy/dist
  redir /practice /rehearse permanent
  redir /studio   /write    permanent
  redir /web      /arrivals permanent
  header /assets/* Cache-Control "public, max-age=31536000, immutable"
  header /sw.js    Cache-Control "public, max-age=0, must-revalidate"
  try_files {path} {path}/index.html /index.html
  file_server
}
```

## 4. The databases

Optional in the truest sense: with no variables set, the app is fully local and
every cloud feature degrades to a quiet "not configured". With them, it is a
shared library with accounts.

Three databases, each with one job — Postgres is the truth, Turso serves
reading, Convex carries presence. The full picture and every setting:
[ARCHITECTURE.md](ARCHITECTURE.md). The short version:

1. **Supabase** — create a project, then paste `supabase/schema.sql` into the
   SQL editor and run it. Connect Clerk under **Authentication → Third-party
   auth**. That is the entire setup: tables, indexes, policies and the two
   counter functions arrive together.
2. **Turso** — create a database, then `npm run db:turso` and
   `npm run sync:turso`. Optional; without it reads come from Postgres.
3. **Convex** — `npx convex deploy`, add Clerk as a provider, and create the
   JWT template named `convex`. Optional; without it the site is simply quiet.
4. Copy `.env.example` to `.env` and fill in the values — nine variables, and
   [ENV.md](ENV.md) is the list in order.

### About the policies

They live inside the schema, beside the tables they guard, which is the reason
Postgres replaced Firestore here. A rule that names a column that does not exist
is a rule you discover in production; a foreign key is one you discover in the
editor.

The interesting part is still the counters. A like has to move a number on a row
you do not own, and in the Firestore version that had to be permitted by a rule
allowing any signed-in person to change `likes` and nothing else. It is now a
database function — `react_to_speech()` — that moves the reaction row, the
speech's counters and the author's score inside one transaction. Nothing about
the write is the client's to get wrong, and the totals can always be recomputed
from the rows underneath them.

Field names are still **capitalised** in the app (`Title`, `Content`, `Author`)
— that is the schema from v1, and the mapping into real columns happens in one
file. `npm run check:schema` fails the build if a field is mapped to a column
that does not exist.

### Making the first owner

Roles live in `admins`, and only an `owner` may write them, so the first one
comes from the database itself:

1. Sign in to the site once, so a `profiles` row exists for you.
2. Clerk Dashboard → **Users** → copy your user id.
3. Supabase → **SQL Editor**:

   ```sql
   select public.bootstrap_owner('<clerk-user-id>', 'amaavrit@yahoo.com');
   ```

4. Reload. `/admin` is now reachable.

It refuses if a role already exists — which is exactly what you want it to do.

## 5. Search Console

1. Verify the domain (DNS TXT is the durable option).
2. Submit `https://presentationbuddy.aavrit.dedyn.io/sitemap.xml`.
3. Use **URL Inspection → Request indexing** on `/`, `/rehearse` and
   `/topics` to seed the crawl.
4. Confirm the **Rich results** test passes for `/` (FAQ + SoftwareApplication
   + WebSite/SearchAction) and for any `/read/*` page (Article).

Indexing takes days to weeks. Nothing in the build shortens that; it only
removes the technical reasons a page would be skipped.
