-- Bounded Convex safety cohort. The denominator is every published canonical
-- presentation; only personal work is eligible for a content slice. The
-- triggers maintain exactly the oldest eligible min(quota, available) rows.

create index if not exists library_safety_sample_idx
  on library (moderation_status, safety_sampled, source_type);

-- Reconcile membership to the oldest eligible rows whenever a published row
-- is inserted. An official row can open a denominator slot for personal work,
-- and a newly inserted older legacy row can displace a previously selected row.
create trigger if not exists library_safety_sample_ai
  after insert on library
  when new.moderation_status = 'published'
begin
  update library
     set safety_sampled = 0
   where safety_sampled = 1
     and id not in (
       select candidate.id
         from library as candidate
        where candidate.moderation_status = 'published'
          and candidate.source_type = 'person'
        order by candidate.published_at asc, candidate.id asc
        limit (select count(*) / 100 from library where moderation_status = 'published')
     );

  update library
     set safety_sampled = 1
   where safety_sampled = 0
     and id in (
       select candidate.id
         from library as candidate
        where candidate.moderation_status = 'published'
          and candidate.source_type = 'person'
        order by candidate.published_at asc, candidate.id asc
        limit (select count(*) / 100 from library where moderation_status = 'published')
     );
end;

-- Status and provenance changes can both alter eligibility and the denominator.
create trigger if not exists library_safety_sample_au
  after update of moderation_status, source_type on library
begin
  update library
     set safety_sampled = 0
   where safety_sampled = 1
     and id not in (
       select candidate.id
         from library as candidate
        where candidate.moderation_status = 'published'
          and candidate.source_type = 'person'
        order by candidate.published_at asc, candidate.id asc
        limit (select count(*) / 100 from library where moderation_status = 'published')
     );

  update library
     set safety_sampled = 1
   where safety_sampled = 0
     and id in (
       select candidate.id
         from library as candidate
        where candidate.moderation_status = 'published'
          and candidate.source_type = 'person'
        order by candidate.published_at asc, candidate.id asc
        limit (select count(*) / 100 from library where moderation_status = 'published')
     );
end;

create trigger if not exists library_safety_sample_ad
  after delete on library
begin
  update library
     set safety_sampled = 0
   where safety_sampled = 1
     and id not in (
       select candidate.id
         from library as candidate
        where candidate.moderation_status = 'published'
          and candidate.source_type = 'person'
        order by candidate.published_at asc, candidate.id asc
        limit (select count(*) / 100 from library where moderation_status = 'published')
     );

  update library
     set safety_sampled = 1
   where safety_sampled = 0
     and id in (
       select candidate.id
         from library as candidate
        where candidate.moderation_status = 'published'
          and candidate.source_type = 'person'
        order by candidate.published_at asc, candidate.id asc
        limit (select count(*) / 100 from library where moderation_status = 'published')
     );
end;

-- Repair older installations additively using the same deterministic rule.
-- The first pass removes ineligible or no-longer-oldest markers; the second
-- backfills the oldest eligible personal presentations up to the global cap.
update library
   set safety_sampled = 0
 where safety_sampled = 1
   and id not in (
     select candidate.id
       from library as candidate
      where candidate.moderation_status = 'published'
        and candidate.source_type = 'person'
      order by candidate.published_at asc, candidate.id asc
      limit (select count(*) / 100 from library where moderation_status = 'published')
   );

update library
   set safety_sampled = 1
 where safety_sampled = 0
   and id in (
     select candidate.id
       from library as candidate
      where candidate.moderation_status = 'published'
        and candidate.source_type = 'person'
      order by candidate.published_at asc, candidate.id asc
      limit (select count(*) / 100 from library where moderation_status = 'published')
   );
