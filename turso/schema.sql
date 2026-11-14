-- ============================================================================
-- Presentation Buddy — published presentations (Turso / SQLite)
-- ============================================================================
-- Turso is the authoritative store for shared presentation content. A draft
-- remains on the writer's device until the writer explicitly shares it; a
-- share creates a row in `library`. Supabase owns identity, profiles,
-- usernames, roles and user-specific relationships, but never the speech body.
-- Convex remains optional and live-only (presence/activity), not a backup.
--
-- Apply with `npm run db:turso`. The runtime also ensures this schema when an
-- authenticated writer shares. Existing Supabase rows are retained until an
-- explicit, verified one-time import; there is no destructive rebuild.

-- The authoritative published-work table. `library` is kept as the table
-- name so existing public URLs/search readers remain stable during migration.
create table if not exists library (
  id                text primary key,
  uid               text not null,
  username          text not null default '',
  folder            text not null default '',
  slug              text not null default '',
  title             text not null default 'Untitled',
  author            text not null default '',
  author_photo_url  text not null default '',
  author_badges     text not null default '',
  preview           text not null default '',
  content           text not null default '',
  category          text not null default '',
  occasion          text not null default '',
  tags              text not null default '',
  credits           text not null default '',
  signature         text not null default '',
  allow_copy        integer not null default 1,
  source_type       text not null default 'person',
  source_name       text not null default '',
  source_url        text not null default '',
  license           text not null default '',
  views             integer not null default 0,
  likes             integer not null default 0,
  dislikes          integer not null default 0,
  shares            integer not null default 0,
  published_at      text not null default '',
  updated_at        text not null default ''
);

create unique index if not exists library_address_uniq
  on library (lower(username), folder, slug)
  where username <> '' and slug <> '';
create index if not exists library_recent_idx on library (published_at desc);
create index if not exists library_username_idx on library (lower(username));
create index if not exists library_category_idx on library (category);
create index if not exists library_uid_idx on library (uid);

-- One opening per first-party, session-scoped reader and day. We never store an
-- IP address or a Clerk id for anonymous readers. This dedupes reloads and
-- StrictMode effect replay without turning a visit count into a guessed number.
create table if not exists presentation_views (
  speech_id  text not null,
  session_id text not null,
  view_day   text not null,
  created_at text not null,
  primary key (speech_id, session_id, view_day)
);
create index if not exists presentation_views_recent_idx on presentation_views (created_at desc);

-- Sole awards are permanent evidence that an author's work held the global
-- read-count record after crossing the first 10,000 real, deduplicated reads.
create table if not exists author_badges (
  uid              text not null,
  badge            text not null check (badge = 'sole'),
  speech_id        text not null,
  views_at_award   integer not null check (views_at_award >= 10000),
  awarded_at       text not null,
  primary key (uid, badge)
);

-- FTS5 is a search index over the authoritative rows, not a second content
-- store. Triggers keep it accurate on insert, edit and delete.
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
