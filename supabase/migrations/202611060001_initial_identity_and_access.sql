-- Initial identity, group membership, invitation, and RLS schema.
-- Source of truth for application authorization is this database schema.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.group_role as enum ('group_admin', 'supervisor', 'analyst');
create type public.membership_status as enum ('pending', 'active', 'disabled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_superadmin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(email))
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_nonempty check (length(trim(name)) between 2 and 120),
  constraint groups_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.group_role not null,
  status public.membership_status not null default 'pending',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_memberships_user_status_idx
  on public.group_memberships (user_id, status, group_id);
create index group_memberships_group_role_status_idx
  on public.group_memberships (group_id, role, status, user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  role public.group_role not null,
  code_hash text not null unique,
  max_uses integer not null default 1,
  use_count integer not null default 0,
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint invitations_max_uses_positive check (max_uses between 1 and 500),
  constraint invitations_use_count_valid check (use_count between 0 and max_uses)
);

create index invitations_group_created_idx on public.invitations (group_id, created_at desc);

create table public.invitation_redemptions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  group_id uuid not null references public.groups (id) on delete restrict,
  redeemed_at timestamptz not null default now(),
  unique (invitation_id, user_id)
);

create index invitation_redemptions_group_time_idx
  on public.invitation_redemptions (group_id, redeemed_at desc);

create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_superadmin
      and p.is_active
  );
$$;

create or replace function private.has_group_role(
  p_group_id uuid,
  p_roles public.group_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_memberships gm
    join public.groups g on g.id = gm.group_id
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and g.is_active
      and p.is_active
      and gm.role = any(p_roles)
  );
$$;

create or replace function private.can_manage_group_user(
  p_group_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_superadmin() or (
    private.has_group_role(p_group_id, array['group_admin']::public.group_role[])
    and exists (
      select 1
      from public.group_memberships target_membership
      where target_membership.group_id = p_group_id
        and target_membership.user_id = p_target_user_id
    )
  );
$$;

revoke all on function private.is_superadmin() from public, anon;
revoke all on function private.has_group_role(uuid, public.group_role[]) from public, anon;
revoke all on function private.can_manage_group_user(uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_superadmin() to authenticated;
grant execute on function private.has_group_role(uuid, public.group_role[]) to authenticated;
grant execute on function private.can_manage_group_user(uuid, uuid) to authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_invitation public.invitations%rowtype;
  v_bootstrap_superadmin boolean := false;
begin
  -- The bootstrap flag can only be set in app_metadata by a trusted Auth admin.
  -- It is accepted only while the project has no superadministrator.
  v_bootstrap_superadmin :=
    coalesce(new.raw_app_meta_data ->> 'bootstrap_superadmin' = 'true', false)
    and not exists (select 1 from public.profiles p where p.is_superadmin);

  if not v_bootstrap_superadmin then
    v_code := lower(trim(coalesce(new.raw_user_meta_data ->> 'invitation_code', '')));
    if length(v_code) < 32 or length(v_code) > 128 then
      raise exception 'A valid invitation is required to register' using errcode = '23514';
    end if;

    select i.* into v_invitation
    from public.invitations i
    where i.code_hash = encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex')
    for update;

    if not found
      or v_invitation.revoked_at is not null
      or v_invitation.expires_at <= now()
      or v_invitation.use_count >= v_invitation.max_uses then
      raise exception 'A valid invitation is required to register' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.groups g
      where g.id = v_invitation.group_id and g.is_active
    ) then
      raise exception 'A valid invitation is required to register' using errcode = '23514';
    end if;

    update public.invitations
    set use_count = use_count + 1
    where id = v_invitation.id;

    insert into public.invitation_redemptions (invitation_id, user_id, group_id)
    values (v_invitation.id, new.id, v_invitation.group_id);
  end if;

  insert into public.profiles (id, email, full_name, is_superadmin)
  values (
    new.id,
    lower(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_bootstrap_superadmin
  );

  if not v_bootstrap_superadmin then
    insert into public.group_memberships (group_id, user_id, role, status, invited_by)
    values (
      v_invitation.group_id,
      new.id,
      v_invitation.role,
      case when new.email_confirmed_at is null then 'pending'::public.membership_status else 'active'::public.membership_status end,
      v_invitation.created_by
    );
  end if;

  -- Do not retain the one-time code in editable user metadata or future JWTs.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'invitation_code',
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'bootstrap_superadmin'
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.handle_auth_user_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(new.email), updated_at = now()
  where id = new.id;

  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.group_memberships
    set status = 'active', updated_at = now()
    where user_id = new.id and status = 'pending';
  end if;

  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_auth_user_confirmation();

create or replace function public.create_group(p_name text, p_slug text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  if not private.is_superadmin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  insert into public.groups (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning * into v_group;
  return v_group;
end;
$$;

create or replace function public.create_invitation(
  p_group_id uuid,
  p_role public.group_role,
  p_max_uses integer default 1,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns table (invitation_id uuid, invitation_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_id uuid;
begin
  if not private.is_superadmin()
     and not private.has_group_role(p_group_id, array['group_admin']::public.group_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 500
     or p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '90 days' then
    raise exception 'Invalid invitation limits' using errcode = '22023';
  end if;

  if p_role = 'group_admin' and not private.is_superadmin() then
    raise exception 'Only a superadministrator can invite group administrators' using errcode = '42501';
  end if;

  v_code := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.invitations (group_id, role, code_hash, max_uses, expires_at, created_by)
  values (
    p_group_id,
    p_role,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    p_max_uses,
    p_expires_at,
    auth.uid()
  )
  returning id into v_id;

  return query select v_id, v_code, p_expires_at;
end;
$$;

create or replace function public.list_group_invitations(p_group_id uuid)
returns table (
  invitation_id uuid,
  role public.group_role,
  max_uses integer,
  use_count integer,
  expires_at timestamptz,
  created_at timestamptz,
  revoked_at timestamptz,
  created_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_superadmin()
     and not private.has_group_role(p_group_id, array['group_admin']::public.group_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select i.id, i.role, i.max_uses, i.use_count, i.expires_at, i.created_at, i.revoked_at, i.created_by
  from public.invitations i
  where i.group_id = p_group_id
  order by i.created_at desc;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select i.group_id into v_group_id
  from public.invitations i
  where i.id = p_invitation_id;

  if not found or (
    not private.is_superadmin()
    and not private.has_group_role(v_group_id, array['group_admin']::public.group_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = p_invitation_id;
end;
$$;

create or replace function public.update_group_membership(
  p_membership_id uuid,
  p_role public.group_role,
  p_status public.membership_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_user_id uuid;
  v_is_superadmin boolean := private.is_superadmin();
begin
  select gm.group_id, gm.user_id into v_group_id, v_user_id
  from public.group_memberships gm
  where gm.id = p_membership_id;

  if not found or (
    not v_is_superadmin
    and not private.has_group_role(v_group_id, array['group_admin']::public.group_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_role = 'group_admin' and not v_is_superadmin then
    raise exception 'Only a superadministrator can assign group administrator role' using errcode = '42501';
  end if;

  if p_status = 'active' and not exists (
    select 1 from auth.users u where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'The user must verify their email before activation' using errcode = '23514';
  end if;

  if not v_is_superadmin and v_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'A group administrator cannot deactivate their own membership' using errcode = '42501';
  end if;

  update public.group_memberships
  set role = p_role, status = p_status, updated_at = now()
  where id = p_membership_id;
end;
$$;

create or replace function public.set_profile_active(
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_superadmin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not p_is_active and p_user_id = auth.uid() then
    raise exception 'A superadministrator cannot deactivate their own account' using errcode = '42501';
  end if;

  if not p_is_active and exists (
    select 1 from public.profiles p where p.id = p_user_id and p.is_superadmin and p.is_active
  ) and (
    select count(*) from public.profiles p where p.is_superadmin and p.is_active
  ) <= 1 then
    raise exception 'At least one active superadministrator must remain' using errcode = '23514';
  end if;

  update public.profiles
  set is_active = p_is_active, updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.create_invitation(uuid, public.group_role, integer, timestamptz) from public, anon;
revoke all on function public.list_group_invitations(uuid) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.update_group_membership(uuid, public.group_role, public.membership_status) from public, anon;
revoke all on function public.set_profile_active(uuid, boolean) from public, anon;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.create_invitation(uuid, public.group_role, integer, timestamptz) to authenticated;
grant execute on function public.list_group_invitations(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.update_group_membership(uuid, public.group_role, public.membership_status) to authenticated;
grant execute on function public.set_profile_active(uuid, boolean) to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_redemptions enable row level security;

revoke all on public.profiles, public.groups, public.group_memberships,
  public.invitations, public.invitation_redemptions from anon, authenticated;

grant select on public.profiles, public.groups, public.group_memberships to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant all on public.profiles, public.groups, public.group_memberships,
  public.invitations, public.invitation_redemptions to service_role;

create policy profiles_read_self_or_manager
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_superadmin())
    or exists (
      select 1
      from public.group_memberships gm
      where gm.user_id = profiles.id
        and (select private.can_manage_group_user(gm.group_id, profiles.id))
    )
  );

create policy profiles_update_own_name
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()) and is_active);

create policy groups_read_authorized
  on public.groups for select to authenticated
  using (
    (select private.is_superadmin())
    or (is_active and exists (
      select 1 from public.group_memberships gm
      where gm.group_id = groups.id
        and gm.user_id = (select auth.uid())
        and gm.status = 'active'
    ))
  );

create policy memberships_read_self_or_manager
  on public.group_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_manage_group_user(group_id, user_id))
  );

comment on table public.profiles is 'Application profile; privileged flags are never client-writable.';
comment on table public.groups is 'Tenant boundary for users and future document access.';
comment on table public.group_memberships is 'User role and activation state within a group.';
comment on table public.invitations is 'Only a SHA-256 hash is stored; the generated code is returned once.';
comment on table public.invitation_redemptions is 'Historical use record for each invitation.';
