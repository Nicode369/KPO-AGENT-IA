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
  v_code text;
  v_id uuid;
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

revoke all on function public.create_invitation(uuid, public.group_role, integer, timestamptz) from public, anon;
grant execute on function public.create_invitation(uuid, public.group_role, integer, timestamptz) to authenticated;
