-- Phase 6: append-only audit events with a SHA-256 hash chain.
-- Every relevant administrative, authentication and document event is appended
-- through private.append_audit_event, which serializes the chain with an
-- advisory lock and records the previous event hash.

create table if not exists public.audit_events (
  seq bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid() unique,
  event_type text not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  group_id uuid references public.groups (id) on delete set null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  prev_hash text,
  event_hash text not null,
  created_at timestamptz not null default now(),
  constraint audit_events_type_format check (event_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint audit_events_hash_format check (
    event_hash ~ '^[0-9a-f]{64}$'
    and (prev_hash is null or prev_hash ~ '^[0-9a-f]{64}$')
  )
);

create index if not exists audit_events_created_idx
  on public.audit_events (created_at desc, seq desc);
create index if not exists audit_events_type_created_idx
  on public.audit_events (event_type, created_at desc);
create index if not exists audit_events_actor_idx
  on public.audit_events (actor_id, created_at desc);
create index if not exists audit_events_group_created_idx
  on public.audit_events (group_id, created_at desc);
create index if not exists audit_events_target_idx
  on public.audit_events (target_type, target_id);

alter table public.audit_events enable row level security;

revoke all on public.audit_events from anon, authenticated, service_role;
grant select on public.audit_events to service_role;

create or replace function private.audit_event_hash(
  p_prev_hash text,
  p_id uuid,
  p_event_type text,
  p_actor_id uuid,
  p_actor_email text,
  p_group_id uuid,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb,
  p_created_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        coalesce(p_prev_hash, ''),
        p_id::text,
        coalesce(p_event_type, ''),
        coalesce(p_actor_id::text, ''),
        coalesce(p_actor_email, ''),
        coalesce(p_group_id::text, ''),
        coalesce(p_target_type, ''),
        coalesce(p_target_id, ''),
        coalesce(p_metadata, '{}'::jsonb)::text,
        to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function private.append_audit_event(
  p_event_type text,
  p_actor_id uuid default null,
  p_actor_email text default null,
  p_group_id uuid default null,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_target_type text := nullif(trim(coalesce(p_target_type, '')), '');
  v_target_id text := nullif(trim(coalesce(p_target_id, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_prev_hash text;
  v_event_hash text;
  v_created_at timestamptz := clock_timestamp();
begin
  if v_event_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'Invalid audit event type' using errcode = '22023';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    v_metadata := jsonb_build_object('value', v_metadata);
  end if;

  perform pg_advisory_xact_lock(hashtext('public.audit_events.chain')::bigint);

  select e.event_hash
  into v_prev_hash
  from public.audit_events e
  order by e.seq desc
  limit 1;

  v_event_hash := private.audit_event_hash(
    v_prev_hash,
    v_id,
    v_event_type,
    p_actor_id,
    v_actor_email,
    p_group_id,
    v_target_type,
    v_target_id,
    v_metadata,
    v_created_at
  );

  insert into public.audit_events (
    id,
    event_type,
    actor_id,
    actor_email,
    group_id,
    target_type,
    target_id,
    metadata,
    prev_hash,
    event_hash,
    created_at
  )
  values (
    v_id,
    v_event_type,
    p_actor_id,
    v_actor_email,
    p_group_id,
    v_target_type,
    v_target_id,
    v_metadata,
    v_prev_hash,
    v_event_hash,
    v_created_at
  );

  return v_id;
end;
$$;

create or replace function public.append_audit_event(
  p_event_type text,
  p_actor_id uuid default null,
  p_actor_email text default null,
  p_group_id uuid default null,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.append_audit_event(
    p_event_type,
    p_actor_id,
    p_actor_email,
    p_group_id,
    p_target_type,
    p_target_id,
    p_metadata
  );
$$;

create or replace function public.verify_audit_chain(p_limit integer default null)
returns table (
  is_valid boolean,
  checked bigint,
  broken_event_id uuid,
  broken_seq bigint,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.audit_events%rowtype;
  v_prev text := null;
  v_expected text;
  v_checked bigint := 0;
  v_has_previous boolean := false;
begin
  for v_row in
    select e.*
    from public.audit_events e
    order by e.seq asc
    limit greatest(coalesce(p_limit, 2147483647), 0)
  loop
    if v_has_previous and v_row.prev_hash is distinct from v_prev then
      return query
        select false, v_checked, v_row.id, v_row.seq,
          'Cadena rota: prev_hash no coincide con el evento anterior.'::text;
      return;
    end if;

    v_expected := private.audit_event_hash(
      v_row.prev_hash,
      v_row.id,
      v_row.event_type,
      v_row.actor_id,
      v_row.actor_email,
      v_row.group_id,
      v_row.target_type,
      v_row.target_id,
      v_row.metadata,
      v_row.created_at
    );

    if v_row.event_hash is distinct from v_expected then
      return query
        select false, v_checked, v_row.id, v_row.seq,
          'Hash alterado: el evento no coincide con su contenido.'::text;
      return;
    end if;

    v_prev := v_row.event_hash;
    v_has_previous := true;
    v_checked := v_checked + 1;
  end loop;

  return query
    select true, v_checked, null::uuid, null::bigint,
      'Cadena de auditoría íntegra.'::text;
end;
$$;

revoke all on function public.append_audit_event(text, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.verify_audit_chain(integer) from public, anon, authenticated;
grant execute on function public.append_audit_event(text, uuid, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.verify_audit_chain(integer) to service_role;

-- Profiles: registration, account state, superadmin grants and session revocation.
create or replace function private.audit_profiles_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.id);
  v_actor_email text;
begin
  if tg_op = 'INSERT' then
    perform private.append_audit_event(
      'user_registered',
      new.id,
      new.email,
      null,
      'profile',
      new.id::text,
      jsonb_build_object('is_superadmin', new.is_superadmin)
    );
    return new;
  end if;

  select p.email into v_actor_email from public.profiles p where p.id = v_actor;

  if new.is_active is distinct from old.is_active then
    perform private.append_audit_event(
      case when new.is_active then 'profile_activated' else 'profile_deactivated' end,
      v_actor,
      v_actor_email,
      null,
      'profile',
      new.id::text,
      jsonb_build_object('target_email', new.email, 'is_active', new.is_active)
    );
  end if;

  if new.is_superadmin is distinct from old.is_superadmin then
    perform private.append_audit_event(
      case when new.is_superadmin then 'superadmin_granted' else 'superadmin_revoked' end,
      v_actor,
      v_actor_email,
      null,
      'profile',
      new.id::text,
      jsonb_build_object('target_email', new.email)
    );
  end if;

  if new.sessions_revoked_at is distinct from old.sessions_revoked_at then
    perform private.append_audit_event(
      'profile_sessions_revoked',
      v_actor,
      v_actor_email,
      null,
      'profile',
      new.id::text,
      jsonb_build_object('target_email', new.email)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_profiles_changes on public.profiles;
create trigger audit_profiles_changes
  after insert or update on public.profiles
  for each row execute function private.audit_profiles_changes();

-- Groups.
create or replace function private.audit_group_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
begin
  select p.email into v_actor_email from public.profiles p where p.id = v_actor;

  if tg_op = 'INSERT' then
    perform private.append_audit_event(
      'group_created',
      v_actor,
      v_actor_email,
      new.id,
      'group',
      new.id::text,
      jsonb_build_object('name', new.name, 'slug', new.slug)
    );
  elsif new.is_active is distinct from old.is_active then
    perform private.append_audit_event(
      case when new.is_active then 'group_activated' else 'group_deactivated' end,
      v_actor,
      v_actor_email,
      new.id,
      'group',
      new.id::text,
      jsonb_build_object('name', new.name, 'slug', new.slug)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_group_changes on public.groups;
create trigger audit_group_changes
  after insert or update on public.groups
  for each row execute function private.audit_group_changes();

-- Invitations: creation and revocation.
create or replace function private.audit_invitation_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(new.created_by, auth.uid());
  v_actor_email text;
begin
  select p.email into v_actor_email from public.profiles p where p.id = v_actor;

  if tg_op = 'INSERT' then
    perform private.append_audit_event(
      'invitation_created',
      v_actor,
      v_actor_email,
      new.group_id,
      'invitation',
      new.id::text,
      jsonb_build_object(
        'role', new.role::text,
        'max_uses', new.max_uses,
        'expires_at', new.expires_at
      )
    );
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform private.append_audit_event(
      'invitation_revoked',
      coalesce(auth.uid(), v_actor),
      v_actor_email,
      new.group_id,
      'invitation',
      new.id::text,
      jsonb_build_object('role', new.role::text)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_invitation_changes on public.invitations;
create trigger audit_invitation_changes
  after insert or update on public.invitations
  for each row execute function private.audit_invitation_changes();

-- Invitation redemption.
create or replace function private.audit_invitation_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = new.user_id;

  perform private.append_audit_event(
    'invitation_redeemed',
    new.user_id,
    v_email,
    new.group_id,
    'invitation',
    new.invitation_id::text,
    jsonb_build_object('user_id', new.user_id)
  );

  return new;
end;
$$;

drop trigger if exists audit_invitation_redemption on public.invitation_redemptions;
create trigger audit_invitation_redemption
  after insert on public.invitation_redemptions
  for each row execute function private.audit_invitation_redemption();

-- Group memberships: creation, role changes and status changes.
create or replace function private.audit_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.user_id);
  v_actor_email text;
begin
  select u.email into v_actor_email from auth.users u where u.id = v_actor;

  if tg_op = 'INSERT' then
    perform private.append_audit_event(
      'membership_created',
      v_actor,
      v_actor_email,
      new.group_id,
      'membership',
      new.id::text,
      jsonb_build_object(
        'user_id', new.user_id,
        'role', new.role::text,
        'status', new.status::text
      )
    );
    return new;
  end if;

  if new.role is distinct from old.role then
    perform private.append_audit_event(
      'membership_role_changed',
      v_actor,
      v_actor_email,
      new.group_id,
      'membership',
      new.id::text,
      jsonb_build_object(
        'user_id', new.user_id,
        'old_role', old.role::text,
        'new_role', new.role::text
      )
    );
  end if;

  if new.status is distinct from old.status then
    perform private.append_audit_event(
      'membership_status_changed',
      v_actor,
      v_actor_email,
      new.group_id,
      'membership',
      new.id::text,
      jsonb_build_object(
        'user_id', new.user_id,
        'old_status', old.status::text,
        'new_status', new.status::text
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_membership_changes on public.group_memberships;
create trigger audit_membership_changes
  after insert or update on public.group_memberships
  for each row execute function private.audit_membership_changes();

-- Document lifecycle events are already recorded in document_events.
-- Mirror them into the hash chain with the document group and version.
create or replace function private.audit_document_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(new.actor_id, auth.uid());
  v_actor_email text;
  v_group_id uuid;
  v_metadata jsonb;
begin
  select d.group_id into v_group_id from public.documents d where d.id = new.document_id;
  select u.email into v_actor_email from auth.users u where u.id = v_actor;

  v_metadata := case
    when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)) = 'object'
      then coalesce(new.metadata, '{}'::jsonb)
    else jsonb_build_object('value', new.metadata)
  end;

  perform private.append_audit_event(
    'document_' || new.event_type,
    v_actor,
    v_actor_email,
    v_group_id,
    'document',
    new.document_id::text,
    v_metadata || jsonb_build_object(
      'version_id', new.version_id,
      'document_event_id', new.id
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_document_event on public.document_events;
create trigger audit_document_event
  after insert on public.document_events
  for each row execute function private.audit_document_event();

comment on table public.audit_events is 'Append-only audit events protected by a SHA-256 hash chain.';
comment on function public.append_audit_event(text, uuid, text, uuid, text, text, jsonb) is 'Service-role only entry point to append a chained audit event.';
comment on function public.verify_audit_chain(integer) is 'Recomputes the audit hash chain and reports the first broken event.';

notify pgrst, 'reload schema';
