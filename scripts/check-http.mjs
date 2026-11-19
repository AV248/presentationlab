#!/usr/bin/env node
/** Bounded JSON request parsing, including chunked bodies without Content-Length. */
import { loadModule } from './lib/bundle.mjs';

let passed = 0;
let failed = 0;
function expect(label, condition) {
  if (condition) { passed += 1; console.log(`PASS  ${label}`); }
  else { failed += 1; console.log(`FAIL  ${label}`); }
}

const { readJsonObject, RequestBodyTooLarge } = await loadModule('src/server/http.ts', 'check-http-body');
const normal = new Request('https://example.test/api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'Namaste, शब्दहरू' }),
});
const parsed = await readJsonObject(normal, 256);
expect('bounded JSON parser preserves Unicode fields', parsed.text === 'Namaste, शब्दहरू');

const chunked = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('{"text":"'));
    controller.enqueue(new TextEncoder().encode('x'.repeat(128)));
    controller.enqueue(new TextEncoder().encode('"}'));
    controller.close();
  },
});
const streaming = new Request('https://example.test/api', {
  method: 'POST',
  body: chunked,
  duplex: 'half',
});
let oversized = false;
try { await readJsonObject(streaming, 64); }
catch (error) { oversized = error instanceof RequestBodyTooLarge; }
expect('chunked oversized bodies are rejected without relying on Content-Length', oversized);

const nonObject = new Request('https://example.test/api', { method: 'POST', body: '[]' });
let rejectedArray = false;
try { await readJsonObject(nonObject, 64); }
catch { rejectedArray = true; }
expect('JSON arrays are rejected when an object is required', rejectedArray);

console.log(`\nHTTP input: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
