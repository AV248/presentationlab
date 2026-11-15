#!/usr/bin/env node
/** Ensure the public VITE_ environment bridge survives browser bundling. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const ROOT = process.cwd();
const PUBLIC = [
  'VITE_SITE_URL',
  'VITE_CLERK_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_CONVEX_URL',
];
const values = Object.fromEntries(PUBLIC.map((name, index) => [
  name,
  `https://pb-${name.toLowerCase().replaceAll('_', '-')}-${index}.example`,
]));
const source = readFileSync(resolve(ROOT, 'src/lib/env.ts'), 'utf8');
const nextConfig = readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8');
let passed = 0;
let failed = 0;

function expect(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

for (const name of PUBLIC) {
  expect(
    `${name} is accessed as a literal process.env member`,
    source.includes(`process.env.${name}`),
  );
  expect(
    `${name} is explicitly forwarded by next.config.ts`,
    nextConfig.includes(`${name}: env.${name} ?? ''`),
  );
}

expect(
  'the browser bridge does not alias the process.env object',
  !/\b(?:const|let)\s+\w+\s*=\s*process\.env\s*;/.test(source),
);

const define = Object.fromEntries([
  ...PUBLIC.map((name) => [`process.env.${name}`, JSON.stringify(values[name])]),
  ['process.env.NODE_ENV', JSON.stringify('production')],
]);
const result = await build({
  entryPoints: [resolve(ROOT, 'src/lib/env.ts')],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  write: false,
  minify: true,
  define,
});
const bundle = result.outputFiles.map((file) => file.text).join('\n');
for (const name of PUBLIC) {
  expect(`${name} reaches the browser bundle`, bundle.includes(values[name]));
}
expect('the built browser bridge has no unresolved process.env reads', !/process\.env(?:\.|\[)/.test(bundle));

console.log(`\nenvironment bridge: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
