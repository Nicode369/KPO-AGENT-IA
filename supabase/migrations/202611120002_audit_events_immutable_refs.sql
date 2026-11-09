-- Phase 6 follow-up: keep hashed audit references immutable.
--
-- The initial audit_events foreign keys used `on delete set null`. Deleting a
-- user or group mutated columns that were already part of an event hash, which
-- broke verify_audit_chain for historical rows. Audit references must survive
-- the deletion of the entity they point to, so the FKs are removed.
--
-- This migration also repairs events whose group_id was nulled by the old
-- foreign keys. Group events store the same UUID in target_id, so the original
-- hashed value can be restored.

alter table public.audit_events
  drop constraint if exists audit_events_actor_id_fkey;
alter table public.audit_events
  drop constraint if exists audit_events_group_id_fkey;

update public.audit_events
set group_id = case
  when target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then target_id::uuid
end
where group_id is null
  and target_type = 'group'
  and event_type in ('group_created', 'group_activated', 'group_deactivated')
  and target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.audit_events
set actor_id = case
  when target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then target_id::uuid
end
where actor_id is null
  and event_type = 'user_registered'
  and target_type = 'profile'
  and target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

comment on column public.audit_events.actor_id is
  'Audit actor reference without a foreign key: the value must never change after hashing.';
comment on column public.audit_events.group_id is
  'Audit group reference without a foreign key: the value must never change after hashing.';

notify pgrst, 'reload schema';
