export interface SafetySlice {
  sourceBytes: number;
  recoverySlice: string;
  recoveryBytes: number;
  byteLimit: number;
}

const utf8 = new TextEncoder();

/** Return a UTF-8-safe prefix capped at one percent of the full body bytes. */
export function makeSafetySlice(content: string): SafetySlice {
  const sourceBytes = utf8.encode(content).length;
  const byteLimit = Math.floor(sourceBytes / 100);
  if (byteLimit === 0) return { sourceBytes, recoverySlice: '', recoveryBytes: 0, byteLimit };

  let recoverySlice = '';
  let recoveryBytes = 0;
  for (const character of content) {
    const size = utf8.encode(character).length;
    if (recoveryBytes + size > byteLimit) break;
    recoverySlice += character;
    recoveryBytes += size;
  }
  return { sourceBytes, recoverySlice, recoveryBytes, byteLimit };
}
