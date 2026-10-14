import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build as esbuild } from 'esbuild';
import { pathToFileURL } from 'node:url';

/**
 * Load the project .env into `process.env`.
 *
 * Vite only exposes VITE_-prefixed variables to the *browser*; the serverless
 * function in api/ reads `process.env` directly (CLERK_SECRET_KEY and
 * FIREBASE_SERVICE_ACCOUNT_JSON must never be prefixed). Without this the
 * dev server would report the endpoint as unconfigured even though .env is
 * right there.
 */
function loadServerEnv(root: string) {
  let raw = '';
  try {
    raw = readFileSync(resolve(root, '.env'), 'utf8');
  } catch {
    return; // no .env — the app is fully functional without one
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Strip one layer of matching quotes, which people add around values
    // containing $ or newlines.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // An existing real environment variable always wins — that is how
    // Vercel's own values override a checked-out .env.
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

/**
 * Mount api/*.ts as dev-server middleware.
 *
 * In production Vercel compiles these files into real serverless functions.
 * Running the identical handler locally is the difference between finding a
 * broken token exchange now versus after a deploy.
 *
 * Every file in api/ is served at /api/<name>, so adding an endpoint needs no
 * change here — a request for an endpoint that does not exist falls through
 * to the normal 404 handling.
 */
function serverlessApi(root: string): Plugin {
  return {
    name: 'pb-serverless-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      loadServerEnv(root);

      const outDir = resolve(root, 'node_modules/.pb-api');

      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const match = /^\/api\/([a-z0-9-]+)\/?$/.exec(path);
        if (!match) {
          next();
          return;
        }

        const entry = resolve(root, 'api', `${match[1]}.ts`);
        if (!existsSync(entry)) {
          next();
          return;
        }

        try {
          await mkdir(outDir, { recursive: true });
          const outfile = resolve(outDir, `${match[1]}.mjs`);
          await esbuild({
            entryPoints: [entry],
            bundle: true,
            format: 'esm',
            platform: 'node',
            target: 'node20',
            packages: 'external', // resolve firebase-admin / @clerk/backend at runtime
            outfile,
            logLevel: 'error',
          });

          // Cache-bust so edits to a handler are picked up on reload.
          const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
          await mod.default(req, res);
        } catch (error) {
          server.config.logger.error(
            `[api] ${match[1]} failed: ${(error as Error).message}`,
          );
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'dev_handler_failed' }));
          }
        }
      });
    },
  };
}

// Presentation Buddy is a fully static, offline-capable single page app
// deployed at the root of its own domain. Every indexable route is
// prerendered to a static HTML file after bundling, so real paths (no hash)
// resolve straight to .html files and every absolute asset URL is correct.
export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [react(), tailwindcss(), serverlessApi(process.cwd())],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The sandbox preview proxies the dev server behind an https host, so
    // allow any hostname to reach it.
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    target: 'es2020',
    cssTarget: 'chrome100',
    chunkSizeWarningLimit: 900,
    // Sourcemaps stay off in production: the app is open source, and shipping
    // them would hand an attacker a perfectly readable map of the bundle.
    sourcemap: mode === 'development',
  },
}));
