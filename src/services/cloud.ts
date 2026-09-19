/**
 * Optional cloud layer — Firestore via its REST API.
 *
 * Presentation Buddy is local-first: the bundled library and everything you
 * write live on your device. If Firebase environment variables are present,
 * the app *also* reads the `presentations` collection, so a shared library
 * can appear alongside the built-in one.
 *
 * Using REST instead of the Firebase web SDK keeps the initial bundle small
 * (no 500 kB SDK download) and means every call is a plain fetch that fails
 * softly — the cloud is an enhancement, never a requirement.
 */

import type { Speech } from '../data/speeches';

const env = import.meta.env ?? ({} as ImportMetaEnv);

const API_KEY = (env.VITE_FIREBASE_API_KEY as string | undefined)?.trim();
const PROJECT_ID = (env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim();

export const CLOUD_ENABLED = Boolean(API_KEY && PROJECT_ID);
export const CLOUD_PROJECT = PROJECT_ID ?? null;

export type CloudStatus = 'off' | 'connecting' | 'online' | 'error';

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/* ------------------------------------------------------------------ */
/* Firestore REST value decoding                                        */
/* ------------------------------------------------------------------ */

type FirestoreValue = Record<string, unknown>;

function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  for (const key of [
    'stringValue',
    'booleanValue',
    'integerValue',
    'doubleValue',
    'timestampValue',
    'bytesValue',
    'referenceValue',
    'geoPointValue',
  ]) {
    if (key in value) return value[key];
  }
  if ('nullValue' in value) return null;
  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(fields)) out[key] = decodeValue(inner);
    return out;
  }
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: FirestoreValue[] }).values ?? [];
    return values.map(decodeValue);
  }
  return undefined;
}

function docId(name: string | undefined): string {
  if (!name) return `doc-${Math.random().toString(36).slice(2, 8)}`;
  return name.split('/').pop() ?? name;
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString);
  return asString(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalise(fields: Record<string, FirestoreValue>, id: string): Speech {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) data[key] = decodeValue(value);

  const content = asString(data.Content ?? data.content);
  const title = asString(data.Title ?? data.title) || 'Untitled presentation';

  return {
    id: `cloud-${id}`,
    kind: 'speech',
    title,
    author: asString(data.Author ?? data.author) || 'Community',
    category: asString(data.Category ?? data.category) || 'Community',
    occasion: asString(data.Occasion ?? data.occasion) || 'Shared speech',
    level: 'Standard',
    tags: asArray(data.Tags ?? data.tags),
    preview:
      asString(data.Preview ?? data.preview) || content.replace(/[#>*`]/g, '').slice(0, 180),
    content: content || 'This presentation has no body text yet.',
    createdAt:
      asString(data.Date ?? data.date) ||
      asString(data.createdAt) ||
      new Date().toISOString().slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Requests                                                             */
/* ------------------------------------------------------------------ */

function url(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${separator}key=${API_KEY}`;
}

export interface CloudResult {
  items: Speech[];
  status: CloudStatus;
  error?: string;
}

export async function fetchCloudSpeeches(): Promise<CloudResult> {
  if (!CLOUD_ENABLED) return { items: [], status: 'off' };
  try {
    const response = await fetch(url('/presentations?pageSize=60'), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return {
        items: [],
        status: 'error',
        error:
          response.status === 403 || response.status === 401
            ? 'Firestore rules do not allow public reads'
            : `Cloud responded ${response.status}`,
      };
    }
    const payload = (await response.json()) as {
      documents?: { name?: string; fields?: Record<string, FirestoreValue> }[];
    };
    const items = (payload.documents ?? []).map((doc) =>
      normalise(doc.fields ?? {}, docId(doc.name)),
    );
    return { items, status: 'online' };
  } catch (error) {
    return {
      items: [],
      status: 'error',
      error: error instanceof Error ? error.message : 'Cloud unreachable',
    };
  }
}

/**
 * Best-effort view counter. Firestore rules usually forbid unauthenticated
 * writes, so a failure here is expected and simply ignored.
 */
export async function bumpCloudViews(id: string): Promise<void> {
  if (!CLOUD_ENABLED) return;
  try {
    const docPath = encodeURIComponent(id.replace(/^cloud-/, ''));
    await fetch(url(`/presentations/${docPath}?updateMask.fieldPaths=views`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { views: { integerValue: '1' } },
      }),
    });
  } catch {
    /* read-only rules are a perfectly normal configuration */
  }
}

export async function publishToCloud(speech: Speech): Promise<{ ok: boolean; error?: string }> {
  if (!CLOUD_ENABLED) return { ok: false, error: 'Cloud sync is not configured.' };
  try {
    const docPath = encodeURIComponent(speech.id.replace(/^cloud-/, ''));
    const response = await fetch(url(`/presentations?documentId=${docPath}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          Title: { stringValue: speech.title },
          Content: { stringValue: speech.content },
          Preview: { stringValue: speech.preview },
          Category: { stringValue: speech.category },
          Tags: { stringValue: speech.tags.join(', ') },
          Author: { stringValue: speech.author },
          Date: { stringValue: new Date().toISOString().slice(0, 10) },
          views: { integerValue: '0' },
        },
      }),
    });
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 403
            ? 'Firestore rules do not allow public writes'
            : `Cloud responded ${response.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Publish failed' };
  }
}
