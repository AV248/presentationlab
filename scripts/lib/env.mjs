/**
 * The same environment the app reads, for scripts that run outside Vite.
 *
 * Vite loads `.env` into `import.meta.env` for the browser bundle, and the dev
 * server injects `process.env` for the API handlers. A script run by `node` gets
 * neither, so it reads the file itself. Precedence matches Vite's: a real
 * environment variable wins over the file, which is what makes
 * `FOO=bar npm run …` behave the way everyone expects.
 *
 * Nothing here prints a value. Scripts report *names* — whether something is
 * set, and never what it is set to.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** The repository root, from anywhere inside it. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `KEY=value`, quotes optional, `#` starts a comment. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** `.env` merged under the real environment. */
export function loadEnv() {
  const file = resolve(ROOT, '.env');
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  return { ...fromFile, ...process.env };
}

/**
 * Read a variable, or explain exactly what is missing and where it goes.
 *
 * The message names the variable, says which file or dashboard it belongs in,
 * and never asks for it to be pasted into a terminal — a script that needs a
 * secret should find it in `.env`, where it already lives.
 */
export function need(env, name, how) {
  const value = (env[name] ?? '').trim();
  if (!value) {
    console.error(`\n  ${name} is not set.\n  ${how}\n`);
    process.exit(1);
  }
  return value;
}

/** `set` / `missing`, for a plan that is printed before anything happens. */
export const presence = (env, name) => ((env[name] ?? '').trim() ? 'set' : 'missing');

/** A short, non-secret fingerprint: which key is it, without being the key. */
export const fingerprint = (value) => (value ? `${value.slice(0, 6)}… (${value.length} chars)` : '—');
