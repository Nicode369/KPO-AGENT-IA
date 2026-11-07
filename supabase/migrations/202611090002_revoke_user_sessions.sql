-- Allow a superadministrator to revoke every active session of a user.
-- The profile timestamp makes revocation effective for access tokens that were
-- issued before the revocation; deleting auth.sessions also revokes refresh
-- tokens through the existing cascade.

alter table public.profiles
  add column if not exists sessions_revoked_at timestamptz;

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_superadmin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Invalid user' using errcode = '22023';
  end if;

  update public.profiles
  set sessions_revoked_at = now(),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon;
grant execute on function public.revoke_user_sessions(uuid) to authenticated;

notify pgrst, 'reload schema';
