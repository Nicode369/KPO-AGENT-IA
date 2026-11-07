-- Keep the invitation code available to group administrators in the history.
-- Validation still uses code_hash; the plaintext code is only returned by the
-- security-definer list RPC to a superadmin or the group administrator.

alter table public.invitations
  add column if not exists code text;

alter table public.invitations
  drop constraint if exists invitations_code_format;

alter table public.invitations
  add constraint invitations_code_format
  check (
    code is null
    or code ~ '^[A-Z0-9]{6}$'
    or code ~ '^[A-F0-9]{48}$'
  );

create or replace function public.create_invitation(
  p_group_id uuid,
  p_role public.group_role,
  p_max_uses integer default 1,
  p_expires_at timestamptz default (now() + interval '365 days')
)
returns table (invitation_id uuid, invitation_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := '';
  v_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_byte integer;
begin
  if not private.is_superadmin()
     and not private.has_group_role(p_group_id, array['group_admin']::public.group_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 500
     or p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '365 days' then
    raise exception 'Invalid invitation limits' using errcode = '22023';
  end if;

  if p_role = 'group_admin' and not private.is_superadmin() then
    raise exception 'Only a superadministrator can invite group administrators' using errcode = '42501';
  end if;

  for i in 1..6 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    v_code := v_code || substr(v_alphabet, 1 + (v_byte % length(v_alphabet)), 1);
  end loop;

  insert into public.invitations (group_id, role, code, code_hash, max_uses, expires_at, created_by)
  values (
    p_group_id,
    p_role,
    v_code,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    p_max_uses,
    p_expires_at,
    auth.uid()
  )
  returning id into v_id;

  return query select v_id, v_code, p_expires_at;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_stored_code text;
  v_invitation public.invitations%rowtype;
  v_bootstrap_superadmin boolean := false;
begin
  v_bootstrap_superadmin :=
    coalesce(new.raw_app_meta_data ->> 'bootstrap_superadmin' = 'true', false)
    and not exists (select 1 from public.profiles p where p.is_superadmin);

  if not v_bootstrap_superadmin then
    v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invitation_code', '')));
    if v_code ~ '^[A-Z0-9]{6}$' then
      v_stored_code := v_code;
    elsif v_code ~ '^[A-F0-9]{48}$' then
      v_stored_code := lower(v_code);
    else
      raise exception 'A valid invitation is required to register' using errcode = '23514';
    end if;

    select i.* into v_invitation
    from public.invitations i
    where i.code_hash = encode(extensions.digest(convert_to(v_stored_code, 'UTF8'), 'sha256'), 'hex')
    for update;

    if not found and v_code ~ '^[A-Z0-9]{6}$' then
      select i.* into v_invitation
      from public.invitations i
      where i.code_hash = encode(extensions.digest(convert_to(lower(v_code), 'UTF8'), 'sha256'), 'hex')
      for update;
    end if;

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

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'invitation_code',
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'bootstrap_superadmin'
  where id = new.id;

  return new;
end;
$$;

drop function if exists public.list_group_invitations(uuid);

create function public.list_group_invitations(p_group_id uuid)
returns table (
  invitation_id uuid,
  role public.group_role,
  code text,
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
  select i.id, i.role, i.code, i.max_uses, i.use_count, i.expires_at, i.created_at, i.revoked_at, i.created_by
  from public.invitations i
  where i.group_id = p_group_id
  order by i.created_at desc;
end;
$$;

revoke all on function public.create_invitation(uuid, public.group_role, integer, timestamptz) from public, anon;
grant execute on function public.create_invitation(uuid, public.group_role, integer, timestamptz) to authenticated;
revoke all on function public.list_group_invitations(uuid) from public, anon;
grant execute on function public.list_group_invitations(uuid) to authenticated;

notify pgrst, 'reload schema';
