export class RequestBodyTooLarge extends Error {
  constructor() {
    super('request_too_large');
    this.name = 'RequestBodyTooLarge';
  }
}

/** Read a JSON object while enforcing a byte cap even for chunked requests. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyTooLarge();
  if (!request.body) throw new SyntaxError('Empty JSON body.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const input = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(input));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('Expected a JSON object.');
  }
  return parsed as Record<string, unknown>;
}
