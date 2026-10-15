/**
 * What moves, and how each Firestore document becomes a Postgres row.
 *
 * This file has no side effects on purpose: it is the *description* of the
 * migration, kept apart from the thing that runs it, so that it can be checked
 * without a Firebase credential and without a database.
 *
 * `scripts/check-schema.mjs` reads it and asserts that every column these
 * builders produce exists in `supabase/schema.sql`. That check matters more here
 * than anywhere else: a migration that writes to a column which does not exist
 * does not crash — it silently leaves the value behind, and the data is simply
 * gone. Naming the columns correctly is the whole job, so the naming gets a test.
 */

/* ------------------------------------------------------------------ */
/* Value conversion                                                    */
/* ------------------------------------------------------------------ */

/** Firestore Timestamp (or anything date-shaped) → an ISO string Postgres takes. */
function iso(value) {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  if (typeof value === 'number') {
    // Firestore epoch millis, which is how a few of the older docs stored dates.
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

const str = (value, fallback = '') =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;

const int = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

/** `Tags` has been a string, an array, and a comma list. All three become an array. */
function tags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  const text = str(value);
  return text ? text.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
}

/** The first defined value among aliases — Firestore documents are not uniform. */
const pick = (doc, ...keys) => {
  for (const key of keys) if (doc[key] !== undefined && doc[key] !== null) return doc[key];
  return undefined;
};

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

/**
 * One entry per collection to move.
 *
 * `collection` is the Firestore collection, `table` the Postgres table, and
 * `row` builds the columns. Each is written to be safe to run against a
 * half-migrated database, because that is exactly the state it runs in.
 */
const STEPS = [
  {
    id: 'users',
    collection: 'users',
    table: 'profiles',
    key: 'uid',
    row: (id, doc) => ({
      uid: id,
      username: str(pick(doc, 'username')),
      display_name: str(pick(doc, 'displayName', 'display_name', 'name')),
      email: str(pick(doc, 'email')),
      photo_url: str(pick(doc, 'photoURL', 'photoUrl', 'photoURL')),
      provider: str(pick(doc, 'providerId', 'provider'), 'clerk'),
      bio: str(pick(doc, 'bio')),
      location: str(pick(doc, 'location')),
      website: str(pick(doc, 'website')),
      signature: str(pick(doc, 'signature')),
      likes_received: int(pick(doc, 'likesReceived')),
      dislikes_received: int(pick(doc, 'dislikesReceived')),
      points: int(pick(doc, 'points')),
      created_at: iso(pick(doc, 'createdAt')) ?? new Date().toISOString(),
      updated_at: iso(pick(doc, 'updatedAt')) ?? new Date().toISOString(),
      last_seen: iso(pick(doc, 'lastSeen')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'bloggers',
    collection: 'bloggers',
    table: 'profiles',
    key: 'uid',
    /**
     * Merged into `profiles`, not carried as a second table.
     *
     * A person's score belongs to the person. Keeping it in two places is how
     * the numbers start disagreeing with each other, and Postgres is perfectly
     * able to hold two counters on one row. The document id *is* the uid, so
     * this lands on the same row the step above just wrote.
     */
    row: (id, doc) => ({
      uid: id,
      username: str(pick(doc, 'username')),
      display_name: str(pick(doc, 'displayName', 'name')),
      likes_received: int(pick(doc, 'likesReceived')),
      dislikes_received: int(pick(doc, 'dislikesReceived')),
      points: int(pick(doc, 'points')),
      updated_at: iso(pick(doc, 'updatedAt')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'handles',
    collection: 'handles',
    table: 'handles',
    key: 'username',
    row: (id, doc) => ({
      username: str(pick(doc, 'username')) || id,
      uid: pick(doc, 'uid') ? String(doc.uid) : null,
      reserved: Boolean(pick(doc, 'reserved')),
      reserved_for_email: str(pick(doc, 'reservedForEmail')),
      reserved_at: iso(pick(doc, 'reservedAt')),
      assigned_to: pick(doc, 'assignedTo') ? String(doc.assignedTo) : null,
      assigned_email: str(pick(doc, 'assignedEmail')),
      note: str(pick(doc, 'note')),
      created_at: iso(pick(doc, 'createdAt')) ?? new Date().toISOString(),
      updated_at: iso(pick(doc, 'updatedAt')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'admins',
    collection: 'admins',
    table: 'admins',
    key: 'uid',
    // A role can only belong to someone who has a profile: `admins.uid` is a
    // foreign key, and a role for a person who does not exist is not a role.
    needs: 'profiles',
    row: (id, doc) => ({
      uid: id,
      role: ['owner', 'admin'].includes(str(pick(doc, 'role'))) ? str(doc.role) : 'admin',
      email: str(pick(doc, 'email')),
      granted_at: iso(pick(doc, 'grantedAt', 'createdAt')) ?? new Date().toISOString(),
      note: str(pick(doc, 'note')),
    }),
  },
  {
    id: 'presentations',
    collection: 'presentations',
    table: 'speeches',
    key: 'id',
    needs: 'profiles',
    row: (id, doc) => {
      const created = iso(pick(doc, 'createdAt', 'Date', 'date')) ?? new Date().toISOString();
      return {
        id,
        uid: String(pick(doc, 'uid') ?? ''),
        username: str(pick(doc, 'username')),
        author: str(pick(doc, 'Author', 'author')),
        folder: str(pick(doc, 'folder')),
        slug: str(pick(doc, 'slug')),
        title: str(pick(doc, 'Title', 'title'), 'Untitled'),
        content: str(pick(doc, 'Content', 'content')),
        preview: str(pick(doc, 'Preview', 'preview')),
        category: str(pick(doc, 'Category', 'category'), 'General'),
        occasion: str(pick(doc, 'Occasion', 'occasion')),
        tags: tags(pick(doc, 'Tags', 'tags')),
        credits: str(pick(doc, 'Credits', 'credits')),
        signature: str(pick(doc, 'Signature', 'signature')),
        allow_copy: pick(doc, 'allowCopy') !== false,
        ad: Boolean(pick(doc, 'ad')),
        status: str(pick(doc, 'status'), 'published'),
        views: int(pick(doc, 'views')),
        likes: int(pick(doc, 'likes')),
        dislikes: int(pick(doc, 'dislikes')),
        shares: int(pick(doc, 'shares')),
        created_at: created,
        published_at: iso(pick(doc, 'Date', 'date')) ?? created,
        updated_at: iso(pick(doc, 'updatedAt')) ?? created,
      };
    },
  },
  {
    id: 'bloggerblogs',
    collection: 'bloggerblogs',
    table: 'posts',
    key: 'id',
    needs: 'profiles',
    row: (id, doc) => {
      const created = iso(pick(doc, 'createdAt', 'Date')) ?? new Date().toISOString();
      return {
        id,
        uid: String(pick(doc, 'uid') ?? ''),
        title: str(pick(doc, 'Title', 'title'), 'Untitled note'),
        body: str(pick(doc, 'Content', 'body', 'content')),
        author: str(pick(doc, 'Author', 'author')),
        created_at: created,
        updated_at: iso(pick(doc, 'updatedAt')) ?? created,
      };
    },
  },
  {
    id: 'reactions',
    collection: 'reactions',
    table: 'reactions',
    key: null, // composite primary key: uid + speech_id, read from the fields
    needs: ['profiles', 'speeches'],
    row: (_id, doc) => ({
      uid: String(pick(doc, 'uid') ?? _id.split('_')[0] ?? ''),
      speech_id: String(pick(doc, 'speechId') ?? _id.split('_')[1] ?? ''),
      kind: str(pick(doc, 'kind')) === 'dislike' ? 'dislike' : 'like',
      created_at: iso(pick(doc, 'createdAt')) ?? new Date().toISOString(),
      updated_at: iso(pick(doc, 'updatedAt')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'shares',
    collection: 'shares',
    table: 'shares',
    key: null,
    needs: ['profiles', 'speeches'],
    row: (_id, doc) => ({
      uid: String(pick(doc, 'uid') ?? _id.split('_')[0] ?? ''),
      speech_id: String(pick(doc, 'speechId') ?? _id.split('_')[1] ?? ''),
      created_at: iso(pick(doc, 'createdAt')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'servingads',
    collection: 'servingads',
    table: 'ads',
    key: 'id',
    row: (id, doc) => ({
      id,
      title: str(pick(doc, 'Title', 'title')),
      preview: str(pick(doc, 'DescriptionPreview', 'preview')),
      body: str(pick(doc, 'Content', 'content')),
      image_url: str(pick(doc, 'ImageURL', 'imageUrl', 'image')),
      redirect_url: str(pick(doc, 'RedirectURL', 'redirectURL', 'redirectUrl', 'url')),
      weight: int(pick(doc, 'weight')) || 1,
      active: pick(doc, 'active', 'Active') !== false,
      created_at: iso(pick(doc, 'createdAt')) ?? new Date().toISOString(),
      updated_at: iso(pick(doc, 'updatedAt')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'sponsors',
    collection: 'sponsors',
    table: 'sponsors',
    key: 'id',
    row: (id, doc) => ({
      id,
      name: str(pick(doc, 'name', 'Name')),
      url: str(pick(doc, 'url', 'URL')),
      blurb: str(pick(doc, 'blurb', 'Blurb')),
      weight: int(pick(doc, 'weight')) || 1,
      active: pick(doc, 'active') !== false,
      created_at: iso(pick(doc, 'createdAt')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'feedback',
    collection: 'feedback',
    table: 'feedback',
    key: 'id',
    row: (id, doc) => ({
      id,
      uid: pick(doc, 'uid') ? String(doc.uid) : null,
      rating: Math.min(5, Math.max(1, int(pick(doc, 'rating')) || 5)),
      text: str(pick(doc, 'text')),
      path: str(pick(doc, 'path')),
      created_at: iso(pick(doc, 'createdAt', 'clientAt')) ?? new Date().toISOString(),
    }),
  },
  {
    id: 'siteSettings',
    collection: 'siteSettings',
    table: 'site_settings',
    key: 'key',
    row: (id, doc) => ({
      key: id,
      // The document is kept whole as JSON — it is a settings bag and the reader
      // asks for one key at a time — but any Firestore Timestamp inside it is
      // flattened to a plain ISO string first, so nothing downstream has to know
      // what a Firestore Timestamp looked like.
      value: Object.fromEntries(
        Object.entries(doc).map(([key, value]) => [key, iso(value) && typeof value === 'object' && !Array.isArray(value) ? iso(value) : value]),
      ),
      updated_at: iso(pick(doc, 'updatedAt')) ?? new Date().toISOString(),
    }),
  },
];

export { STEPS };
