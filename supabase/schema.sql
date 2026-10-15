-- ============================================================================
--  Presentation Buddy — the truth (Supabase / Postgres)
-- ============================================================================
--
--  This file is the source of truth for every durable record on the site:
--  people, handles, roles, ads, speeches, reactions, feedback, settings.
--
--  Two other databases work alongside it, each with one job:
--
--    • Turso   — a derived, read-only projection of *published* writing, with
--                full-text search, served to readers from close to them.
--                It is rebuilt from this database, never written by the app.
--    • Convex  — the live layer: who is here now, what just happened. Its
--                contents are ephemeral on purpose and are never the
--                authoritative copy of anything.
--
--  One writer per entity is the rule that keeps three databases honest. The
--  app writes durable facts *here*; everything else is derived or ephemeral.
--
--  ── Identity ───────────────────────────────────────────────────────────────
--  Clerk owns sign-in. Supabase trusts Clerk as a third-party auth provider
--  (Dashboard → Authentication → Third-party auth → Clerk), so every request
--  arrives with a verified Clerk JWT and:
--
--      auth.jwt() ->> 'sub'      →  the person's Clerk user id  (our "uid")
--      auth.jwt() ->> 'email'    →  their verified address
--
--  There is no Firebase, no custom token, and no bridge endpoint any more.
--
--  ── How to apply ───────────────────────────────────────────────────────────
--  Supabase Dashboard → SQL Editor → paste this whole file → Run.
--  It is idempotent: running it twice changes nothing.
--
--  Then bootstrap the first owner (once, at the end of this file):
--      select public.bootstrap_owner('<clerk-user-id>', 'you@example.com');
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";     -- gen_random_uuid()


-- ============================================================================
--  Identity helpers
-- ============================================================================

-- The signed-in person's id, or null. Never trust a uid from a request body.
create or replace function public.current_uid()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(nullif(auth.jwt() ->> 'email', ''), ''))
$$;

-- Does the caller hold a role? SECURITY DEFINER so the check itself is not
-- subject to the row policies on `admins` (which would recurse).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where uid = public.current_uid()
      and role in ('admin', 'owner')
  )
$$;

create or replace function public.is_site_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where uid = public.current_uid()
      and role = 'owner'
  )
$$;

-- The one-time door for the first owner, and the reason this file can be given
-- to somebody without opening anything: it works only while `admins` is empty.
create or replace function public.bootstrap_owner(p_uid text, p_email text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.admins limit 1) then
    return 'refused: an owner already exists';
  end if;
  if p_uid is null or length(p_uid) < 3 then
    return 'refused: pass a Clerk user id';
  end if;

  insert into public.profiles (uid, email)
  values (p_uid, lower(coalesce(p_email, '')))
  on conflict (uid) do nothing;

  insert into public.admins (uid, role, email)
  values (p_uid, 'owner', lower(coalesce(p_email, '')));

  return 'ok: ' || p_uid || ' is now the owner';
end;
$$;

-- An address a writer can no longer live at: the site's own pages.
create or replace function public.username_taken(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.handles where username = p_username)
$$;


-- ============================================================================
--  People
-- ============================================================================

create table if not exists public.profiles (
  uid               text primary key,
  username          text,
  display_name      text not null default '',
  email             text not null default '',
  photo_url         text not null default '',
  provider          text not null default 'clerk',
  bio               text not null default '',
  location          text not null default '',
  website           text not null default '',
  signature         text not null default '',
  -- The leaderboard, kept here rather than in a second table: one row per
  -- person is the whole model, and a duplicate copy of a fact is a duplicate
  -- thing to disagree with. Maintained by public.react_to_speech.
  likes_received    int not null default 0 check (likes_received >= 0),
  dislikes_received int not null default 0 check (dislikes_received >= 0),
  points            int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_seen         timestamptz not null default now()
);

create table if not exists public.admins (
  uid           text primary key references public.profiles(uid) on delete cascade,
  role          text not null check (role in ('owner', 'admin')),
  email         text not null default '',
  display_name  text not null default '',
  note          text not null default '',
  granted_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- What the workspace keeps to itself: the salted hash of the /admin password.
-- Readable only by role-holders, because a password prompt that leaked its own
-- hash would be worse than no prompt.
create table if not exists public.admin_private (
  id          text primary key default 'gate',
  salt        text not null default '',
  hash        text not null default '',
  iterations  int  not null default 210000,
  updated_at  timestamptz not null default now()
);

-- Handles: the site's address book. A row with `uid` is held by that person; a
-- row with `reserved = true` and no uid is held back from the public.
create table if not exists public.handles (
  username            text primary key,
  uid                 text references public.profiles(uid) on delete set null,
  reserved            boolean not null default false,
  reserved_for_email  text not null default '',
  reserved_at         timestamptz,
  assigned_to         text,
  assigned_email      text not null default '',
  note                text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint handles_shape check (
    username ~ '^[a-z0-9_]{3,24}$'
    and username !~ '^_'
    and username !~ '_$'
    and username !~ '__'
  )
);


-- ============================================================================
--  Writing
-- ============================================================================

create table if not exists public.speeches (
  id            text primary key,
  uid           text not null references public.profiles(uid) on delete cascade,
  username      text not null default '',
  author        text not null default '',
  folder        text not null default '',
  slug          text not null default '',
  title         text not null default 'Untitled',
  content       text not null default '',
  preview       text not null default '',
  category      text not null default 'General',
  occasion      text not null default '',
  tags          text[] not null default '{}',
  credits       text not null default '',
  signature     text not null default '',
  allow_copy    boolean not null default true,
  ad            boolean not null default false,
  status        text not null default 'published' check (status in ('draft', 'published')),
  views         int not null default 0 check (views >= 0),
  likes         int not null default 0 check (likes >= 0),
  dislikes      int not null default 0 check (dislikes >= 0),
  shares        int not null default 0 check (shares >= 0),
  created_at    timestamptz not null default now(),
  published_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint speeches_folder_depth check (folder !~ '/'),
  constraint speeches_slug_shape check (slug = '' or slug ~ '^[a-z0-9-]{1,60}$'),
  constraint speeches_folder_shape check (folder = '' or folder ~ '^[a-z0-9-]{1,60}$')
);

-- The address rule, enforced by the database rather than by convention:
-- one work per address, per writer. Two writers may both have /their-name/my-day.
create unique index if not exists speeches_address_uniq
  on public.speeches (lower(username), folder, slug)
  where username <> '';

create index if not exists speeches_username_idx on public.speeches (lower(username));
create index if not exists speeches_uid_idx on public.speeches (uid);
create index if not exists speeches_published_idx on public.speeches (created_at desc) where status = 'published';

-- One reaction per person per work. The primary key is the rule.
create table if not exists public.reactions (
  uid        text not null references public.profiles(uid) on delete cascade,
  speech_id  text not null references public.speeches(id) on delete cascade,
  kind       text not null check (kind in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (uid, speech_id)
);

-- One share per person per speech: the row is the record, the counter follows.
create table if not exists public.shares (
  uid        text not null references public.profiles(uid) on delete cascade,
  speech_id  text not null references public.speeches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (uid, speech_id)
);

-- A real view: one row per open. Counters live in speeches.views.
create table if not exists public.speech_views (
  id         text primary key,
  speech_id  text not null references public.speeches(id) on delete cascade,
  uid        text,
  created_at timestamptz not null default now()
);


-- ============================================================================
--  The rest of the site
-- ============================================================================

create table if not exists public.ads (
  id            text primary key,
  title         text not null,
  preview       text not null default '',
  body          text not null default '',
  image_url     text not null default '',
  redirect_url  text not null default '',
  weight        int not null default 1 check (weight between 1 and 10),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.sponsors (
  id         text primary key,
  name       text not null default '',
  url        text not null default '',
  blurb      text not null default '',
  weight     int not null default 1,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id         text primary key,
  title      text not null default '',
  body       text not null default '',
  uid        text,
  author     text not null default '',
  kind       text not null default 'note',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id         text primary key,
  uid        text,
  rating     int not null check (rating between 1 and 5),
  text       text not null default '',
  path       text not null default '',
  created_at timestamptz not null default now()
);

-- One row per setting: the festival theme, and anything else the owner sets.
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);


-- ============================================================================
--  Counters, atomically
-- ============================================================================
-- Reading a counter is public; *writing* one must not be, or anybody could set
-- their own view count to a million. This function is the only way in, and it
-- moves exactly one integer by one.

create or replace function public.bump_counter(p_speech_id text, p_field text, p_delta int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_field not in ('views', 'likes', 'dislikes', 'shares') then
    raise exception 'unknown counter: %', p_field;
  end if;
  if p_delta not in (-1, 1) then
    raise exception 'counters move by one';
  end if;
  if auth.role() <> 'authenticated' then
    raise exception 'sign in first';
  end if;

  execute format(
    'update public.speeches set %I = greatest(0, %I + $1), updated_at = now() where id = $2',
    p_field, p_field
  ) using p_delta, p_speech_id;
end;
$$;

-- Reactions keep their own tally in step with the reactions table, so the
-- numbers can always be rebuilt from the rows (and vice versa).
create or replace function public.sync_reaction_counts(p_speech_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.speeches s
  set likes = coalesce((select count(*) from public.reactions r where r.speech_id = s.id and r.kind = 'like'), 0),
      dislikes = coalesce((select count(*) from public.reactions r where r.speech_id = s.id and r.kind = 'dislike'), 0),
      updated_at = now()
  where s.id = p_speech_id;
end;
$$;

-- Reacting: the reaction row, the speech's counters and the author's score all
-- move together or not at all. Doing this in the database rather than in a
-- browser tab means two people reacting at the same instant cannot lose a
-- count, and the numbers can always be rebuilt from `reactions` alone.
create or replace function public.react_to_speech(p_speech_id text, p_kind text)
returns table (kind text, likes int, dislikes int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.current_uid();
  v_previous text;
  v_author text;
begin
  if v_uid is null then
    raise exception 'sign in first';
  end if;
  if p_kind not in ('like', 'dislike') then
    raise exception 'unknown reaction: %', p_kind;
  end if;

  select r.kind into v_previous
  from public.reactions r
  where r.uid = v_uid and r.speech_id = p_speech_id;

  if v_previous = p_kind then
    -- Same reaction twice takes it back.
    delete from public.reactions where uid = v_uid and speech_id = p_speech_id;
    v_previous := null;
    kind := null;
  else
    insert into public.reactions (uid, speech_id, kind)
    values (v_uid, p_speech_id, p_kind)
    on conflict (uid, speech_id) do update set kind = excluded.kind, updated_at = now();
    kind := p_kind;
  end if;

  select s.uid into v_author from public.speeches s where s.id = p_speech_id;

  update public.speeches s
  set likes = coalesce((select count(*) from public.reactions r where r.speech_id = s.id and r.kind = 'like'), 0),
      dislikes = coalesce((select count(*) from public.reactions r where r.speech_id = s.id and r.kind = 'dislike'), 0)
  where s.id = p_speech_id;

  if v_author is not null then
    update public.profiles p
    set likes_received = coalesce((select count(*) from public.reactions r
                                    join public.speeches s on s.id = r.speech_id
                                   where s.uid = v_author and r.kind = 'like'), 0),
        dislikes_received = coalesce((select count(*) from public.reactions r
                                       join public.speeches s on s.id = r.speech_id
                                      where s.uid = v_author and r.kind = 'dislike'), 0),
        points = coalesce((select count(*) from public.reactions r
                            join public.speeches s on s.id = r.speech_id
                           where s.uid = v_author and r.kind = 'like'), 0)
                 - floor(coalesce((select count(*) from public.reactions r
                                    join public.speeches s on s.id = r.speech_id
                                   where s.uid = v_author and r.kind = 'dislike'), 0) / 3.0)
    where p.uid = v_author;
  end if;

  select s.likes, s.dislikes into likes, dislikes from public.speeches s where s.id = p_speech_id;
  return next;
end;
$$;

-- Sharing: counted once per person. A repeat share is a no-op that still
-- returns the current number, so the button reads sensibly when clicked twice.
create or replace function public.record_share(p_speech_id text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.current_uid();
  v_inserted int := 0;
  v_total int;
begin
  if v_uid is null then
    raise exception 'sign in first';
  end if;

  insert into public.shares (uid, speech_id) values (v_uid, p_speech_id)
  on conflict (uid, speech_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.speeches set shares = shares + 1 where id = p_speech_id;
  end if;

  select shares into v_total from public.speeches where id = p_speech_id;
  return coalesce(v_total, 0);
end;
$$;

-- Timestamps: one trigger keeps `updated_at` honest for every table that has it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'handles', 'speeches', 'ads', 'admin_private']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;


-- ============================================================================
--  Later additions
-- ============================================================================
--  `create table if not exists` does not add columns to a table that already
--  exists, so anything introduced after this file was first applied is
--  repeated here. Re-pasting the whole file is therefore safe on a database
--  that already holds an older copy of the schema.

alter table public.admins   add column if not exists note        text not null default '';
alter table public.admins   add column if not exists granted_at  timestamptz not null default now();
alter table public.posts    add column if not exists updated_at  timestamptz not null default now();
alter table public.handles  add column if not exists reserved_at  timestamptz;
alter table public.handles   add column if not exists assigned_to  text;
alter table public.reactions add column if not exists updated_at   timestamptz not null default now();
alter table public.speeches  add column if not exists author       text not null default '';
alter table public.speeches  add column if not exists published_at timestamptz not null default now();

-- ============================================================================
--  Row-level security
-- ============================================================================
--  Default deny. Everything below is an explicit permission, and the identity
--  behind each one comes from the verified Clerk JWT — never from a request
--  body, and never from the client's word about who it is.

alter table public.profiles       enable row level security;
alter table public.admins         enable row level security;
alter table public.admin_private  enable row level security;
alter table public.handles        enable row level security;
alter table public.speeches       enable row level security;
alter table public.reactions      enable row level security;
alter table public.speech_views   enable row level security;
alter table public.ads            enable row level security;
alter table public.sponsors       enable row level security;
alter table public.posts          enable row level security;
alter table public.feedback       enable row level security;
alter table public.site_settings  enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
-- Reading stays free: /:username has to be able to show a person's page.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
  with check (uid = public.current_uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (uid = public.current_uid() or public.is_admin())
  with check (uid = public.current_uid() or public.is_admin());

-- ── admins ──────────────────────────────────────────────────────────────────
-- A role is visible to role-holders; only the owner (or the empty-table
-- bootstrap) may grant one.
drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select using (public.is_admin() or uid = public.current_uid());

drop policy if exists admins_write on public.admins;
create policy admins_write on public.admins for all
  using (public.is_site_owner())
  with check (public.is_site_owner());

-- ── admin_private ───────────────────────────────────────────────────────────
drop policy if exists admin_private_all on public.admin_private;
create policy admin_private_all on public.admin_private for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── handles ─────────────────────────────────────────────────────────────────
drop policy if exists handles_read on public.handles;
create policy handles_read on public.handles for select using (true);

-- Claim a free name for yourself, or let a role-holder reserve/hand one out.
drop policy if exists handles_insert on public.handles;
create policy handles_insert on public.handles for insert
  with check (
    (uid = public.current_uid() and coalesce(reserved, false) = false)
    or public.is_admin()
  );

-- The holder may maintain their own row but never hand it to somebody else.
-- The exception is a name reserved *for this person*: that claim is the whole
-- point of reserving it, and nobody else can make it.
drop policy if exists handles_update on public.handles;
create policy handles_update on public.handles for update
  using (
    public.is_admin()
    or uid = public.current_uid()
    or (
      reserved = true
      and uid is null
      and reserved_for_email <> ''
      and reserved_for_email = public.current_email()
    )
  )
  with check (
    public.is_admin()
    or uid = public.current_uid()
    or (
      reserved = false
      and uid = public.current_uid()
    )
  );

drop policy if exists handles_delete on public.handles;
create policy handles_delete on public.handles for delete using (public.is_admin());

-- ── speeches ────────────────────────────────────────────────────────────────
drop policy if exists speeches_read on public.speeches;
create policy speeches_read on public.speeches for select using (true);

drop policy if exists speeches_insert on public.speeches;
create policy speeches_insert on public.speeches for insert
  with check (uid = public.current_uid() and length(title) > 0 and length(content) <= 200000);

drop policy if exists speeches_update on public.speeches;
create policy speeches_update on public.speeches for update
  using (uid = public.current_uid() or public.is_admin())
  with check (uid = public.current_uid() or public.is_admin());

drop policy if exists speeches_delete on public.speeches;
create policy speeches_delete on public.speeches for delete
  using (uid = public.current_uid() or public.is_admin());

-- ── shares ──────────────────────────────────────────────────────────────────
drop policy if exists shares_read on public.shares;
create policy shares_read on public.shares for select using (uid = public.current_uid() or public.is_admin());
drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares for insert with check (uid = public.current_uid());

-- ── reactions ───────────────────────────────────────────────────────────────
drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select using (true);

drop policy if exists reactions_write on public.reactions;
create policy reactions_write on public.reactions for all
  using (uid = public.current_uid() or public.is_admin())
  with check (uid = public.current_uid());

-- ── view log ────────────────────────────────────────────────────────────────
drop policy if exists speech_views_insert on public.speech_views;
create policy speech_views_insert on public.speech_views for insert
  with check (public.current_uid() is not null or uid is null);

drop policy if exists speech_views_read on public.speech_views;
create policy speech_views_read on public.speech_views for select using (public.is_admin());

-- ── ads, sponsors, posts, feedback, settings ────────────────────────────────
drop policy if exists ads_read on public.ads;
create policy ads_read on public.ads for select using (true);
drop policy if exists ads_write on public.ads;
create policy ads_write on public.ads for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sponsors_read on public.sponsors;
create policy sponsors_read on public.sponsors for select using (true);
drop policy if exists sponsors_write on public.sponsors;
create policy sponsors_write on public.sponsors for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (true);
drop policy if exists posts_write on public.posts;
create policy posts_write on public.posts for all
  using (uid = public.current_uid() or public.is_admin())
  with check (uid = public.current_uid() or public.is_admin());

-- Feedback is written by anybody signed in, read by the owner alone.
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert
  with check (public.current_uid() is not null);
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select using (public.is_admin());

drop policy if exists settings_read on public.site_settings;
create policy settings_read on public.site_settings for select using (true);
drop policy if exists settings_write on public.site_settings;
create policy settings_write on public.site_settings for all
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
--  Bootstrap the first owner  (run once, by hand)
-- ============================================================================
--  Replace the id with your own Clerk user id (Clerk dashboard → Users → your
--  account → the id starting `user_`). It refuses if an owner already exists,
--  so this file can be run again safely.
--
--    select public.bootstrap_owner('user_XXXXXXXX', 'amaavrit@yahoo.com');
--
--  Then everything else — reserving handles, editing ads, the password on
--  /admin — happens inside the site.
