# Deploying Presentation Buddy

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

## 4. Firebase

Entirely optional — without it the app is fully local, and every cloud
feature degrades to a quiet "not configured".

1. Create a project, enable **Authentication → Google** and **Microsoft**.
2. Add `presentationbuddy.aavrit.dedyn.io` under **Authentication → Settings
   → Authorized domains**. Sign-in fails with `auth/unauthorized-domain`
   without this, and it is the single most common deploy mistake.
3. Create a **Firestore** database.
4. Deploy the rules — they are not optional, the defaults are wide open:
   ```bash
   firebase deploy --only firestore:rules
   ```
5. Copy `.env.example` to `.env` and fill in the web config.

### About the rules

Counters are the interesting part. A like has to move a number on a document
you do not own, so `firestore.rules` allows any signed-in person to change
`views`, `likes`, `dislikes` and `shares` — and nothing else — on any speech.
`diff().affectedKeys().hasOnly([...])` enforces that: touch the title or the
body in the same write and the owner check applies instead. Each counter is
also capped at `previous + 1`, so a hostile client cannot write `likes = 1e9`.

Field names are **capitalised** (`Title`, `Content`, `Author`) — that is the
original schema from v1 and the client still writes it. The rules validate
those exact keys.

### Making the first admin

Roles live in `admins/{uid}` and only an `owner` may write them, so the first
one has to be created from the console by hand:

1. Sign in to the live site once so Firebase creates your account.
2. **Authentication → Users** → copy your UID.
3. **Firestore** → create collection `admins` → document ID = your UID →
   field `role` (string) = `owner`.
4. Reload. `/admin` is now reachable.

## 5. Search Console

1. Verify the domain (DNS TXT is the durable option).
2. Submit `https://presentationbuddy.aavrit.dedyn.io/sitemap.xml`.
3. Use **URL Inspection → Request indexing** on `/`, `/rehearse` and
   `/topics` to seed the crawl.
4. Confirm the **Rich results** test passes for `/` (FAQ + SoftwareApplication
   + WebSite/SearchAction) and for any `/read/*` page (Article).

Indexing takes days to weeks. Nothing in the build shortens that; it only
removes the technical reasons a page would be skipped.
