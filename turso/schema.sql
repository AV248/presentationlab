-- ============================================================================
--  Presentation Buddy — the reading room (Turso / SQLite)
-- ============================================================================
--
--  What this database is for: serving the *public* library — the list of
--  published writing and the full-text search over it — from close to whoever
--  is reading, without touching Postgres for every page view.
--
--  What it is not: the truth. Nothing durable is written here first.
--  `scripts/turso/sync.mjs` rebuilds it from Supabase (`public.speeches`),
--  which is the only place a speech is authored, edited or deleted. If this
--  database were wiped, the library would re-appear on the next sync.
--
--  Read-only in production: the app reaches it through `/api/library`, and the
--  database token used there is scoped to reading. The sync script holds the
--  only write token, and it runs as a build/deploy step or an owner action —
--  never from a visitor's browser.
--
--  Apply with:  npm run db:turso   (scripts/turso/apply.mjs)
-- ============================================================================

-- ----------------------------------------------------------------------------
--  The projection
-- ----------------------------------------------------------------------------
create table if not exists library (
  id           text primary key,          -- the speech id (stable across syncs)
  uid          text not null,
  username     text not null default '',
  folder       text not null default '',
  slug         text not null default '',
  title        text not null default 'Untitled',
  author       text not null default '',
  preview      text not null default '',
  content      text not null default '',
  category     text not null default 'General',
  occasion     text not null default '',
  tags         text not null default '',  -- ", " joined, as the UI expects
  credits      text not null default '',
  signature    text not null default '',
  allow_copy   integer not null default 1,
  views        integer not null default 0,
  likes        integer not null default 0,
  dislikes     integer not null default 0,
  shares       integer not null default 0,
  published_at text not null default '',  -- ISO date, as the UI expects
  updated_at   text not null default ''
);

-- The address a reader types. Unique per writer, matching the Postgres rule.
create unique index if not exists library_address_uniq
  on library (lower(username), folder, slug)
  where username <> '';

create index if not exists library_recent_idx on library (published_at desc);
create index if not exists library_username_idx on library (lower(username));
create index if not exists library_category_idx on library (category);

-- ----------------------------------------------------------------------------
--  Search
-- ----------------------------------------------------------------------------
--  An external-content FTS5 index: it stores pointers, not a second copy of
--  every speech, and is kept in step by triggers. `porter` stemming means
--  "speaking" finds "speak" — the reason search is worth doing here at all.
create virtual table if not exists library_fts using fts5(
  title,
  author,
  preview,
  content,
  category,
  content='library',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

create trigger if not exists library_fts_ai after insert on library begin
  insert into library_fts (rowid, title, author, preview, content, category)
  values (new.rowid, new.title, new.author, new.preview, new.content, new.category);
end;

create trigger if not exists library_fts_ad after delete on library begin
  insert into library_fts (library_fts, rowid, title, author, preview, content, category)
  values ('delete', old.rowid, old.title, old.author, old.preview, old.content, old.category);
end;

create trigger if not exists library_fts_au after update on library begin
  insert into library_fts (library_fts, rowid, title, author, preview, content, category)
  values ('delete', old.rowid, old.title, old.author, old.preview, old.content, old.category);
  insert into library_fts (rowid, title, author, preview, content, category)
  values (new.rowid, new.title, new.author, new.preview, new.content, new.category);
end;

-- ----------------------------------------------------------------------------
--  Counters, mirrored
-- ----------------------------------------------------------------------------
--  Postgres owns views/likes/dislikes/shares. They are copied here by the sync
--  so a reader sees a number without a round trip to Postgres. Nothing writes
--  these from the reader's side: a click goes to Postgres first, and the
--  updated number arrives with the next sync.
--
--  (The live layer — numbers that move while you watch them — is Convex's job.)
