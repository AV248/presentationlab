/**
 * The projection: Postgres → Turso.
 *
 * Shared by the endpoint (`POST /api/sync-library`) and the command line
 * (`npm run sync:turso`), so there is exactly one definition of what the
 * reading room contains. Two copies of this would eventually disagree, and a
 * reading room that depends on which path ran last is worse than none.
 *
 * The rules it follows:
 *
 *   • **The truth decides.** Only rows with `status = 'published'` are copied,
 *     and they are copied fresh: the table is emptied and refilled inside one
 *     write transaction. A speech that was unpublished, edited or deleted
 *     therefore cannot survive here as a stale ghost.
 *   • **Nothing durable is written.** Turso holds a copy, never the original.
 *   • **Failure is loud but not fatal.** A caller gets a real error; readers
 *     never notice, because `src/services/backend/library.ts` falls back to
 *     Postgres and Postgres is where those rows came from.
 */

/** How many rows one page of the read carries. */
const PAGE = 500;

/** The row shape we copy, as PostgREST returns it. */
interface SpeechRow {
  id: string;
  uid: string;
  username: string;
  author: string;
  folder: string;
  slug: string;
  title: string;
  preview: string;
  content: string;
  category: string;
  occasion: string;
  tags: string[] | string | null;
  credits: string;
  signature: string;
  allow_copy: boolean | null;
  ad: boolean | null;
  views: number | null;
  likes: number | null;
  dislikes: number | null;
  shares: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectOptions {
  supabaseUrl: string;
  /** The anon key with the caller's token, or the service key for a full sync. */
  apiKey: string;
  /** The Clerk session token; omitted only when `apiKey` is the service key. */
  sessionToken?: string;
  tursoUrl: string;
  tursoToken: string;
}

export interface ProjectResult {
  /** How many speeches the reading room now holds. */
  synced: number;
  /** How many rows were read from Postgres (equal to `synced`). */
  read: number;
}

/** Turn one Postgres row into the columns the reading room stores. */
function toLibraryRow(row: SpeechRow) {
  const tags = Array.isArray(row.tags) ? row.tags.join(', ') : String(row.tags ?? '');
  return [
    String(row.id ?? ''),
    String(row.uid ?? ''),
    String(row.username ?? ''),
    String(row.folder ?? ''),
    String(row.slug ?? ''),
    String(row.title ?? 'Untitled'),
    String(row.author ?? ''),
    String(row.preview ?? ''),
    String(row.content ?? ''),
    String(row.category ?? 'General'),
    String(row.occasion ?? ''),
    tags,
    String(row.credits ?? ''),
    String(row.signature ?? ''),
    row.allow_copy === false ? 0 : 1,
    Number(row.views ?? 0),
    Number(row.likes ?? 0),
    Number(row.dislikes ?? 0),
    Number(row.shares ?? 0),
    // The reader's date is the day the piece went up, which is what both the
    // Postgres fallback and the app's own reader use. One meaning, one column.
    String(row.created_at ?? ''),
    String(row.updated_at ?? ''),
  ];
}

/** Every published speech, oldest page first, following PostgREST's paging. */
async function readPublished(options: ProjectOptions): Promise<SpeechRow[]> {
  const rows: SpeechRow[] = [];
  const auth = options.sessionToken ? `Bearer ${options.sessionToken}` : `Bearer ${options.apiKey}`;

  for (let offset = 0; ; offset += PAGE) {
    const url = new URL('/rest/v1/speeches', options.supabaseUrl);
    url.searchParams.set('select', '*');
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', String(PAGE));
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, {
      headers: { apikey: options.apiKey, Authorization: auth, Accept: 'application/json' },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Postgres refused the read (${response.status}). ${detail.slice(0, 200)}`.trim(),
      );
    }

    const page = (await response.json()) as SpeechRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  return rows;
}

/**
 * Rebuild the reading room from the truth.
 *
 * One transaction, so a reader either sees the previous contents or the new
 * ones — never a half-emptied table. `batch(…, 'write')` is the only place
 * Turso is written from this codebase.
 */
export async function projectLibrary(options: ProjectOptions): Promise<ProjectResult> {
  const rows = await readPublished(options);

  const { createClient } = await import('@libsql/client');
  const db = createClient({ url: options.tursoUrl, authToken: options.tursoToken });

  const insert =
    'insert into library (' +
    'id, uid, username, folder, slug, title, author, preview, content, category, occasion, ' +
    'tags, credits, signature, allow_copy, views, likes, dislikes, shares, published_at, updated_at' +
    ') values (' + Array.from({ length: 21 }, () => '?').join(', ') + ')';

  try {
    await db.batch(
      [
        'delete from library',
        ...rows.map((row) => ({ sql: insert, args: toLibraryRow(row) })),
      ],
      'write',
    );
  } catch (error) {
    const message = (error as Error).message ?? '';
    // A missing table is a setup mistake, and saying which one saves a hunt.
    if (/no such table/i.test(message)) {
      throw new Error(
        `${message} — apply turso/schema.sql to this database first: npm run db:turso`,
      );
    }
    throw error;
  } finally {
    db.close();
  }

  return { synced: rows.length, read: rows.length };
}
