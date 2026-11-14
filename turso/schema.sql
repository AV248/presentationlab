-- ============================================================================
-- Presentation Buddy — published presentations (Turso / SQLite)
-- ============================================================================
-- Turso is the canonical home of published presentation bodies, versions,
-- reader counts, moderation state and prepared source arrivals. A draft stays
-- on the writer's device until an explicit Share. Supabase owns Clerk-linked
-- identity, usernames, profiles, social evidence, badges and admin flags.
-- Convex is only a bounded safety mirror (at most 1% of each sampled personal
-- body and at most about 1% of published works); it is never a content path.
--
-- Apply with `npm run db:turso`. The runtime ensures this idempotent schema
-- before a share. Existing legacy Supabase rows are retained for an explicit,
-- verified import; there is no destructive rebuild.

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
  source_title      text not null default '',
  source_fetched_at text not null default '',
  official_slug     text not null default '',
  source_item_id    text not null default '',
  license           text not null default '',
  moderation_status text not null default 'published',
  moderation_note   text not null default '',
  featured          integer not null default 0,
  -- A metadata-only cohort flag; rows still keep their sole full body here.
  safety_sampled    integer not null default 0 check (safety_sampled in (0, 1)),
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

-- Additive schema bookkeeping for one-time trigger upgrades; no user data lives here.
create table if not exists turso_schema_migrations (
  version    integer primary key,
  applied_at text not null
);

-- Every edit preserves its previous public state. Versions are private to the
-- writer/admin surface and never become a second current-content table.
create table if not exists presentation_versions (
  presentation_id text not null,
  version         integer not null,
  title           text not null,
  preview         text not null default '',
  content         text not null,
  category        text not null default '',
  credits         text not null default '',
  folder          text not null default '',
  slug            text not null default '',
  allow_copy      integer not null default 1,
  created_by      text not null,
  created_at      text not null,
  change_note     text not null default '',
  primary key (presentation_id, version)
);
create index if not exists presentation_versions_recent_idx
  on presentation_versions (presentation_id, created_at desc);

-- Source responses wait here as candidates. Nothing appears publicly until a
-- curator/admin approves it; every row retains source, licence and fetch time.
create table if not exists arrival_entries (
  id                 text primary key,
  source_id          text not null,
  title              text not null,
  author             text not null default '',
  preview            text not null default '',
  content            text not null,
  source_url         text not null,
  license            text not null,
  fetched_at         text not null,
  tags               text not null default '',
  status             text not null default 'candidate'
                     check (status in ('candidate', 'approved', 'published', 'rejected')),
  official_slug      text not null default '',
  curator_note       text not null default '',
  published_speech_id text not null default '',
  updated_at         text not null
);
create index if not exists arrival_entries_queue_idx
  on arrival_entries (status, fetched_at desc);
create index if not exists arrival_entries_source_idx
  on arrival_entries (source_id, fetched_at desc);

-- A single shared throttle/lease keeps the daily scheduled refresh respectful
-- across serverless instances. The public cron route cannot bypass this lock.
create table if not exists arrival_refresh_control (
  id               integer primary key check (id = 1),
  last_started_at  text not null default '',
  last_finished_at text not null default '',
  lock_until       text not null default '',
  last_status      text not null default 'idle',
  last_note        text not null default ''
);

-- Evidence for all-time Sole eligibility: at every new author-read record,
-- retain all people who tied the highest author total once it cleared 10,000.
create table if not exists sole_leader_history (
  uid               text not null,
  record_reads      integer not null check (record_reads >= 10000),
  first_held_at     text not null,
  presentation_id   text not null default '',
  primary key (uid, record_reads)
);
create index if not exists sole_leader_history_recent_idx
  on sole_leader_history (first_held_at desc);

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

-- Legacy compatibility table from the prior rebuild. New badge ownership is
-- in Supabase (`badge_assignments`) and this table is no longer read or written.
-- It remains in place so an old database is upgraded without deleting evidence.
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
