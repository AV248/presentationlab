/**
 * Secret hygiene gate.
 *
 * Vite inlines every VITE_-prefixed variable into the JavaScript bundle that
 * ships to the browser. That makes one paste — putting a Clerk secret key or
 * a Firebase service account under the wrong prefix — a full credential
 * disclosure to anyone who opens devtools.
 *
 * This script fails the build when that happens, and when .env is (still) in
 * git. It runs as part of `npm run verify` and can be wired into CI.
 *
 * Checks that FAIL:
 *   • .env tracked by git
 *   • a VITE_ variable holding a Clerk secret key (sk_...)
 *   • a VITE_ variable holding a PEM private key or a service account
 *   • a VITE_ variable whose NAME says SECRET / PRIVATE / SERVICE_ACCOUNT
 *
 * Checks that WARN:
 *   • Clerk test keys in a production build
 *   • a publishable key that is not shaped like pk_...
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

/* ------------------------------------------------------------------ */
/* Load .env (the same file the dev server and Vite read)               */
/* ------------------------------------------------------------------ */

function parseEnv(text) {
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

const fileEnv = existsSync(resolve(root, '.env'))
  ? parseEnv(readFileSync(resolve(root, '.env'), 'utf8'))
  : {};

// Real environment variables take precedence, exactly as Vite does.
const env = { ...fileEnv, ...process.env };

/* ------------------------------------------------------------------ */
/* 1. .env must not be in git                                           */
/* ------------------------------------------------------------------ */

try {
  execFileSync('git', ['ls-files', '--error-unmatch', '.env'], {
    cwd: root,
    stdio: 'pipe',
  });
  errors.push(
    '.env is tracked by git. Run:  git rm --cached .env  and make sure .env is in .gitignore. ' +
      'Any credential already committed should be rotated.',
  );
} catch {
  /* not tracked — correct */
}

/* ------------------------------------------------------------------ */
/* 2. Nothing secret under a VITE_ prefix                               */
/* ------------------------------------------------------------------ */

const VITE_PATTERNS = [
  {
    name: 'a Clerk secret key',
    test: (value) => /^sk_(test|live)_/i.test(value.trim()),
  },
  {
    name: 'a PEM private key',
    test: (value) => value.includes('BEGIN PRIVATE KEY') || value.includes('BEGIN RSA PRIVATE KEY'),
  },
  {
    name: 'a service account',
    test: (value) =>
      value.includes('"type":"service_account"') ||
      value.includes("type: 'service_account'") ||
      (value.includes('private_key') && value.includes('client_email')),
  },
  {
    name: 'a Firebase Admin / bearer credential',
    test: (value) => /^ya29\./.test(value.trim()),
  },
];

const NAME_SMELLS = ['SECRET', 'PRIVATE', 'SERVICE_ACCOUNT', 'TOKEN', 'PASSWORD'];

for (const [key, value] of Object.entries(env)) {
  if (!key.startsWith('VITE_') || typeof value !== 'string' || !value.trim()) continue;

  for (const pattern of VITE_PATTERNS) {
    if (pattern.test(value)) {
      errors.push(
        `${key} is ${pattern.name} but starts with VITE_, so it would be bundled into the ` +
          `browser JavaScript. Remove the VITE_ prefix and read it server-side instead.`,
      );
    }
  }

  // A variable *named* SECRET that is publicly bundled is a mistake even if
  // we cannot recognise its value.
  if (NAME_SMELLS.some((smell) => key.slice(5).includes(smell))) {
    const looksPublic = /^(pk_|AIza|https?:)/i.test(value.trim());
    if (!looksPublic) {
      errors.push(
        `${key} is bundled into the browser (VITE_ prefix) but its name suggests a secret. ` +
          `Public values only belong under VITE_.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3. Clerk key shape                                                   */
/* ------------------------------------------------------------------ */

const clerkKey = (env.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim();
if (clerkKey) {
  if (clerkKey.startsWith('sk_')) {
    // Already reported above; no need to repeat.
  } else if (!/^pk_(test|live)_/.test(clerkKey)) {
    warnings.push(
      'VITE_CLERK_PUBLISHABLE_KEY does not look like a Clerk publishable key ' +
        '(expected pk_test_… or pk_live_…). Sign-in will be disabled.',
    );
  } else if (clerkKey.startsWith('pk_test_') && process.env.VERCEL_ENV === 'production') {
    warnings.push(
      'Clerk DEVELOPMENT keys are set on a production deployment. Clerk blocks test keys in ' +
        'production after a small number of users — switch to pk_live_ / sk_live_ before launch.',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Report                                                               */
/* ------------------------------------------------------------------ */

for (const warning of warnings) console.warn(`  warn    ${warning}`);

if (errors.length) {
  console.error('');
  console.error('  Secret check failed:');
  for (const error of errors) console.error(`    ✗ ${error}`);
  console.error('');
  process.exit(1);
}

console.log('PASS  no secrets bundled into the client');
