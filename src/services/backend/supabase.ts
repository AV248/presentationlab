/**
 * Supabase — the truth.
 *
 * This module is the engine the rest of the app talks to for durable records.
 * It presents the same small surface the app has always used — a document at
 * `collection/id`, `setDoc`/`updateDoc`/`deleteDoc`, `query(where/orderBy/limit)`
 * — and translates each call into SQL over PostgREST, with row-level security
 * doing the authorising.
 *
 * Two things are deliberate:
 *
 *   • **The identity is Clerk's.** Every request carries the Clerk session
 *     token, so Postgres sees `auth.jwt() ->> 'sub'` as the same uid the rest of
 *     the app uses. No bridge, no custom token, no second identity.
 *   • **The schema is typed, the traffic is not.** Callers still speak
 *     `Title`/`images`-style field names; the map below turns those into real
 *     snake_case columns with real types, and drops anything unknown instead of
 *     inventing a column. That way the data model can be strict while the
 *     hundred call sites stay untouched.
 *
 * Nothing here decides who may do what: the policies in `supabase/schema.sql`
 * do. A write the person is not allowed is refused by Postgres, and the error
 * message is passed through rather than dressed up.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKEND_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

/* ------------------------------------------------------------------ */
/* Sentinels                                                           */
/* ------------------------------------------------------------------ */

/** `increment(1)` — a counter that moves, not a value that is set. */
export interface Increment { __increment: number }
/** `serverTimestamp()` — let the database decide the time. */
export interface ServerTimestamp { __serverTimestamp: true }

export function increment(by: number): Increment {
  return { __increment: by };
}
export function serverTimestamp(): ServerTimestamp {
  return { __serverTimestamp: true };
}
export function isIncrement(value: unknown): value is Increment {
  return Boolean(value && typeof value === 'object' && '__increment' in (value as object));
}
export function isServerTimestamp(value: unknown): value is ServerTimestamp {
  return Boolean(value && typeof value === 'object' && '__serverTimestamp' in (value as object));
}

/* ------------------------------------------------------------------ */
/* Collections → tables, and their fields                              */
/* ------------------------------------------------------------------ */

type FieldKind = 'text' | 'num' | 'bool' | 'ts' | 'array' | 'json';
interface FieldSpec { column: string; kind: FieldKind }
type FieldMap = Record<string, FieldSpec>;

const f = (column: string, kind: FieldKind = 'text'): FieldSpec => ({ column, kind });

/**
 * Every collection the app uses, and where it really lives.
 *
 * `id` is the primary key column; `fields` is the whole vocabulary. If a caller
 * writes a key that is not here, it is reported in development and skipped —
 * silently inventing columns is how a data layer rots.
 */
export interface CollectionSpec {
  table: string;
  id: string;
  fields: FieldMap;
  /** A counter column that `increment()` is allowed to move. */
  counters?: string[];
}

const SPEECH: FieldMap = {
  Title: f('title'), Content: f('content'), Preview: f('preview'),
  Category: f('category'), Occasion: f('occasion'), Author: f('author'),
  Tags: f('tags', 'array'), Credits: f('credits'), Signature: f('signature'),
  allowCopy: f('allow_copy', 'bool'), ad: f('ad', 'bool'), status: f('status'),
  uid: f('uid'), username: f('username'), slug: f('slug'), folder: f('folder'),
  views: f('views', 'num'), likes: f('likes', 'num'),
  dislikes: f('dislikes', 'num'), shares: f('shares', 'num'),
  createdAt: f('created_at', 'ts'), updatedAt: f('updated_at', 'ts'),
  Date: f('published_at', 'ts'),
};

const COLLECTIONS: Record<string, CollectionSpec> = {
  presentations: {
    table: 'speeches',
    id: 'id',
    counters: ['views', 'likes', 'dislikes', 'shares'],
    fields: SPEECH,
  },
  users: {
    table: 'profiles',
    id: 'uid',
    fields: {
      uid: f('uid'), email: f('email'), displayName: f('display_name'),
      photoURL: f('photo_url'), providerId: f('provider'), lastSeen: f('last_seen', 'ts'),
      createdAt: f('created_at', 'ts'), updatedAt: f('updated_at', 'ts'),
      username: f('username'), bio: f('bio'), location: f('location'),
      website: f('website'), signature: f('signature'),
      likesReceived: f('likes_received', 'num'), dislikesReceived: f('dislikes_received', 'num'),
      points: f('points', 'num'), name: f('display_name'),
    },
  },
  handles: {
    table: 'handles',
    id: 'username',
    fields: {
      username: f('username'), uid: f('uid'), reserved: f('reserved', 'bool'),
      reservedForEmail: f('reserved_for_email'), assignedTo: f('assigned_to'),
      assignedEmail: f('assigned_email'), note: f('note'),
      reservedAt: f('reserved_at', 'ts'), createdAt: f('created_at', 'ts'),
      updatedAt: f('updated_at', 'ts'),
    },
  },
  admins: {
    table: 'admins',
    id: 'uid',
    fields: {
      uid: f('uid'), role: f('role'), email: f('email'),
      displayName: f('display_name'), name: f('display_name'),
      note: f('note'), grantedAt: f('granted_at', 'ts'),
      createdAt: f('created_at', 'ts'),
    },
  },
  adminPrivate: {
    table: 'admin_private',
    id: 'id',
    fields: {
      salt: f('salt'), hash: f('hash'), iterations: f('iterations', 'num'),
      updatedAt: f('updated_at', 'ts'),
    },
  },
  servingads: {
    table: 'ads',
    id: 'id',
    fields: {
      Title: f('title'), DescriptionPreview: f('preview'), Content: f('body'),
      ImageURL: f('image_url'), RedirectURL: f('redirect_url'),
      weight: f('weight', 'num'), active: f('active', 'bool'),
      createdAt: f('created_at', 'ts'), updatedAt: f('updated_at', 'ts'),
    },
  },
  reactions: {
    table: 'reactions',
    id: 'uid',
    fields: {
      uid: f('uid'), speechId: f('speech_id'), kind: f('kind'),
      createdAt: f('created_at', 'ts'), updatedAt: f('updated_at', 'ts'),
    },
  },
  sponsors: {
    table: 'sponsors',
    id: 'id',
    fields: {
      name: f('name'), url: f('url'), blurb: f('blurb'),
      weight: f('weight', 'num'), active: f('active', 'bool'),
      createdAt: f('created_at', 'ts'),
    },
  },
  bloggerblogs: {
    table: 'posts',
    id: 'id',
    // Both spellings of every field, because posts have been written by two
    // versions of this app and the older one used the v1 names.
    fields: {
      Title: f('title'), Content: f('body'), title: f('title'), body: f('body'),
      Author: f('author'), author: f('author'),
      uid: f('uid'), Date: f('created_at', 'ts'),
      createdAt: f('created_at', 'ts'), updatedAt: f('updated_at', 'ts'),
      kind: f('kind'),
    },
  },
  feedback: {
    table: 'feedback',
    id: 'id',
    fields: {
      uid: f('uid'), rating: f('rating', 'num'), text: f('text'),
      path: f('path'), createdAt: f('created_at', 'ts'),
    },
  },
  siteSettings: {
    table: 'site_settings',
    id: 'key',
    // One JSON column, and one app field naming it. Three aliases pointing at
    // the same column produced three keys on every read, only one of which any
    // caller used — the other two were a standing invitation to read the wrong
    // one and see nothing.
    fields: { key: f('key'), value: f('value', 'json'), updatedAt: f('updated_at', 'ts') },
  },
};

/** A text column written from an array field (`Tags`). */
function toColumn(spec: FieldSpec, value: unknown): unknown {
  if (value === undefined) return undefined;
  switch (spec.kind) {
    case 'num': return typeof value === 'number' ? value : Number(value) || 0;
    case 'bool': return value === true || value === 'true';
    case 'array': {
      if (Array.isArray(value)) return value.map(String);
      const text = String(value ?? '').trim();
      return text ? text.split(',').map((part) => part.trim()).filter(Boolean) : [];
    }
    case 'json': return value;
    case 'ts': return value instanceof Date ? value.toISOString() : (value as string) ?? null;
    default: return value === null ? null : String(value);
  }
}

/** …and back again, so a reader sees exactly what the UI expects. */
function fromColumn(spec: FieldSpec, value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  switch (spec.kind) {
    case 'num': return Number(value) || 0;
    case 'bool': return value === true;
    case 'array': return Array.isArray(value) ? value.join(', ') : String(value);
    case 'ts': return typeof value === 'string' ? value : new Date(value as string).toISOString();
    default: return value;
  }
}

/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */

export interface DocRef { __kind: 'doc'; spec: CollectionSpec; id: string }
export interface QueryRef {
  __kind: 'query';
  spec: CollectionSpec;
  filters: { field: string; op: string; value: unknown }[];
  order?: { field: string; dir: 'asc' | 'desc' };
  max?: number;
}
export interface DocSnapshot {
  id: string;
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
}
export interface QuerySnapshot {
  docs: { id: string; data: () => Record<string, unknown> }[];
}

let clientPromise: Promise<SupabaseClient | null> | null = null;
let tokenGetter: (() => Promise<string | null>) | null = null;

/**
 * Clerk supplies the token. Called once by the auth bridge as soon as a Clerk
 * session exists; until then every request is anonymous, which is exactly what
 * the public reads need.
 */
export function setAccessTokenGetter(getter: (() => Promise<string | null>) | null): void {
  tokenGetter = getter;
}

async function client(): Promise<SupabaseClient | null> {
  if (!BACKEND_ENABLED) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        // PostgREST wants a fresh JWT on each request; Clerk's `getToken()`
        // hands one over, and Supabase verifies it as a third-party issuer.
        accessToken: async () => (tokenGetter ? await tokenGetter() : null),
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }
  return clientPromise;
}

/** Failures carry the database's own words — a policy refusal is not a mystery. */
export class BackendError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
  }
}

function specFor(collectionName: string): CollectionSpec {
  const spec = COLLECTIONS[collectionName];
  if (!spec) {
    throw new BackendError(
      `No table is mapped for "${collectionName}". Add it to COLLECTIONS in src/services/backend/supabase.ts.`,
    );
  }
  return spec;
}

function rowToDoc(spec: CollectionSpec, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [appField, field] of Object.entries(spec.fields)) {
    if (!(field.column in row)) continue;
    out[appField] = fromColumn(field, row[field.column]);
  }
  // Keep a couple of raw columns the readers always want.
  if (spec.id in row) out.id = row[spec.id];
  return out;
}

function docToRow(
  spec: CollectionSpec,
  data: Record<string, unknown>,
  { partial }: { partial: boolean },
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const field = spec.fields[key];
    if (!field) {
      unknown.push(key);
      continue;
    }
    if (isServerTimestamp(value)) continue; // the column default or trigger decides
    if (isIncrement(value)) continue; // handled separately, by an RPC
    const column = toColumn(field, value);
    if (column !== undefined) row[field.column] = column;
  }
  if (unknown.length && process.env.NODE_ENV !== 'production') {
    console.warn(`[pb] ignored unmapped fields for ${spec.table}:`, unknown.join(', '));
  }
  if (!partial && Object.keys(row).length === 0) {
    throw new BackendError('Refusing to write an empty document.');
  }
  return row;
}

/* ------------------------------------------------------------------ */
/* The surface the app calls                                           */
/* ------------------------------------------------------------------ */

export function doc(_db: unknown, path: string, id: string): DocRef {
  return { __kind: 'doc', spec: specFor(path), id };
}

export function collection(_db: unknown, path: string): CollectionSpec {
  return specFor(path);
}

export function where(field: string, op: string, value: unknown) {
  return { __kind: 'where' as const, field, op, value };
}
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
  return { __kind: 'orderBy' as const, field, dir };
}
export function limit(n: number) {
  return { __kind: 'limit' as const, n };
}

export function query(col: CollectionSpec, ...constraints: unknown[]): QueryRef {
  const ref: QueryRef = { __kind: 'query', spec: col, filters: [] };
  for (const constraint of constraints) {
    if (!constraint || typeof constraint !== 'object') continue;
    const c = constraint as { __kind?: string; field?: string; op?: string; value?: unknown; dir?: 'asc' | 'desc'; n?: number };
    if (c.__kind === 'where' && c.field && c.op) ref.filters.push({ field: c.field, op: c.op, value: c.value });
    if (c.__kind === 'orderBy' && c.field) ref.order = { field: c.field, dir: c.dir ?? 'asc' };
    if (c.__kind === 'limit' && typeof c.n === 'number') ref.max = c.n;
  }
  return ref;
}

export async function getDoc(ref: DocRef): Promise<DocSnapshot> {
  const supabase = await client();
  if (!supabase) return { id: ref.id, exists: () => false, data: () => undefined };
  const { data, error } = await supabase
    .from(ref.spec.table)
    .select('*')
    .eq(ref.spec.id, ref.id)
    .maybeSingle();
  if (error) throw new BackendError(error.message, error.code);
  return {
    id: ref.id,
    exists: () => Boolean(data),
    data: () => (data ? rowToDoc(ref.spec, data as Record<string, unknown>) : undefined),
  };
}

export async function getDocs(ref: QueryRef): Promise<QuerySnapshot> {
  const supabase = await client();
  if (!supabase) return { docs: [] };
  let builder = supabase.from(ref.spec.table).select('*');
  for (const filter of ref.filters) {
    const field = ref.spec.fields[filter.field];
    if (!field) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[pb] filtered on unmapped field "${filter.field}"`);
      continue;
    }
    const value = toColumn(field, filter.value);
    switch (filter.op) {
      case '==': builder = builder.eq(field.column, value); break;
      case '!=': builder = builder.neq(field.column, value); break;
      case '>': builder = builder.gt(field.column, value); break;
      case '>=': builder = builder.gte(field.column, value); break;
      case '<': builder = builder.lt(field.column, value); break;
      case '<=': builder = builder.lte(field.column, value); break;
      case 'in': builder = builder.in(field.column, Array.isArray(value) ? value : [value]); break;
      case 'array-contains': builder = builder.contains(field.column, value as string[]); break;
      default: builder = builder.eq(field.column, value);
    }
  }
  if (ref.order) {
    const field = ref.spec.fields[ref.order.field];
    if (field) builder = builder.order(field.column, { ascending: ref.order.dir === 'asc' });
  }
  builder = builder.limit(ref.max ?? 500);
  const { data, error } = await builder;
  if (error) throw new BackendError(error.message, error.code);
  return {
    docs: (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return { id: String(record[ref.spec.id] ?? ''), data: () => rowToDoc(ref.spec, record) };
    }),
  };
}

/** Move one counter atomically — the only way an integer here may change. */
async function bumpCounter(spec: CollectionSpec, id: string, appField: string, delta: number): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  const field = spec.fields[appField];
  if (!field || !spec.counters?.includes(appField)) {
    throw new BackendError(`"${appField}" is not a counter on ${spec.table}.`);
  }
  // Speeches keep their counters in a security-definer function so a number
  // can never be set to whatever a client fancies.
  if (spec.table === 'speeches') {
    const { error } = await supabase.rpc('bump_counter', {
      p_speech_id: id,
      p_field: appField,
      p_delta: delta >= 0 ? 1 : -1,
    });
    if (error) throw new BackendError(error.message, error.code);
    return;
  }
  const current = await getDoc({ __kind: 'doc', spec, id });
  const value = Number(current.data()?.[appField] ?? 0) + delta;
  const { error } = await supabase
    .from(spec.table)
    .update({ [field.column]: Math.max(0, value) })
    .eq(spec.id, id);
  if (error) throw new BackendError(error.message, error.code);
}

export async function setDoc(
  ref: DocRef,
  data: Record<string, unknown>,
  options?: { merge?: boolean },
): Promise<void> {
  const supabase = await client();
  if (!supabase) throw new BackendError('The site has no cloud configured for this build.');
  const row = docToRow(ref.spec, data, { partial: Boolean(options?.merge) });
  row[ref.spec.id] = ref.id;

  const counters = Object.entries(data).filter(([, value]) => isIncrement(value));
  if (counters.length) {
    delete row[ref.spec.id];
    for (const [field, value] of counters) {
      await bumpCounter(ref.spec, ref.id, field, (value as Increment).__increment);
    }
  }

  if (Object.keys(row).length) {
    const { error } = await supabase.from(ref.spec.table).upsert(row, {
      onConflict: ref.spec.id,
    });
    if (error) throw new BackendError(error.message, error.code);
  }
}

export async function updateDoc(ref: DocRef, data: Record<string, unknown>): Promise<void> {
  const supabase = await client();
  if (!supabase) throw new BackendError('The site has no cloud configured for this build.');

  const counters = Object.entries(data).filter(([, value]) => isIncrement(value));
  const row = docToRow(ref.spec, data, { partial: true });
  if (Object.keys(row).length) {
    const { error } = await supabase.from(ref.spec.table).update(row).eq(ref.spec.id, ref.id);
    if (error) throw new BackendError(error.message, error.code);
  }
  for (const [field, value] of counters) {
    await bumpCounter(ref.spec, ref.id, field, (value as Increment).__increment);
  }
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  const { error } = await supabase.from(ref.spec.table).delete().eq(ref.spec.id, ref.id);
  if (error) throw new BackendError(error.message, error.code);
}

export async function addDoc(col: CollectionSpec, data: Record<string, unknown>): Promise<{ id: string }> {
  const supabase = await client();
  if (!supabase) throw new BackendError('The site has no cloud configured for this build.');
  const id = (data.id as string) || crypto.randomUUID();
  const row = { ...docToRow(col, data, { partial: false }), [col.id]: id };
  const { error } = await supabase.from(col.table).insert(row);
  if (error) throw new BackendError(error.message, error.code);
  return { id };
}

/** Call a database function — the atomic operations live in SQL, not here. */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await client();
  if (!supabase) throw new BackendError('The site has no cloud configured for this build.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new BackendError(error.message, error.code);
  return data as T;
}

/** Kept for the shapes that still pass dates around. */
export const Timestamp = {
  fromDate: (date: Date) => date.toISOString(),
};

/** The database handle a caller passes back to `doc`/`collection`. */
export const db = { backend: 'supabase' as const };

/**
 * The bundle `loadBackend()` hands out: the same members the app has always
 * used, so no call site needed rewriting when the database underneath changed.
 */
export function supabaseBundle() {
  return {
    auth: { currentUser: null },
    db,
    fs: {
      doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
      query, where, orderBy, limit, increment, serverTimestamp, rpc, Timestamp,
    },
    rpc,
  };
}
