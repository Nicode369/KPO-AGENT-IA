-- Phase 4 hardening: track the published version explicitly and scope
-- version/chunk reads to that version. A document may keep serving its
-- published version while a newer version is uploaded, reviewed or rejected.

alter table public.documents
  add column if not exists published_version_id uuid
  references public.document_versions (id) on delete set null;

create index if not exists documents_published_version_idx
  on public.documents (published_version_id)
  where published_version_id is not null;

update public.documents d
set published_version_id = dv.id
from public.document_versions dv
where d.status = 'published'
  and d.published_version_id is null
  and dv.document_id = d.id
  and dv.version = d.version;

create or replace function private.can_read_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    join public.groups g on g.id = d.group_id
    where d.id = p_document_id
      and (
        private.is_superadmin()
        or (
          g.is_active
          and (
            exists (
              select 1
              from public.group_memberships gm
              where gm.user_id = (select auth.uid())
                and gm.status = 'active'
                and (
                  gm.group_id = d.group_id
                  or exists (
                    select 1
                    from public.document_access da
                    where da.document_id = d.id
                      and da.group_id = gm.group_id
                  )
                )
                and gm.role in ('group_admin', 'supervisor')
            )
            or (
              d.published_version_id is not null
              and d.status <> 'retired'
              and (
                exists (
                  select 1
                  from public.group_memberships gm
                  join public.groups member_group on member_group.id = gm.group_id
                  where gm.user_id = (select auth.uid())
                    and gm.status = 'active'
                    and member_group.is_active
                    and (
                      gm.group_id = d.group_id
                      or exists (
                        select 1
                        from public.document_access da
                        where da.document_id = d.id
                          and da.group_id = gm.group_id
                      )
                    )
                )
                or (
                  d.visibility = 'common'
                  and exists (
                    select 1
                    from public.group_memberships gm
                    join public.groups member_group on member_group.id = gm.group_id
                    where gm.user_id = (select auth.uid())
                      and gm.status = 'active'
                      and member_group.is_active
                  )
                )
              )
            )
          )
        )
      )
  );
$$;

revoke all on function private.can_read_document(uuid) from public, anon;
grant execute on function private.can_read_document(uuid) to authenticated;

drop policy if exists document_versions_select_authorized on public.document_versions;
create policy document_versions_select_authorized
  on public.document_versions for select to authenticated
  using (
    (select private.can_manage_document(document_id))
    or (
      (select private.can_read_document(document_id))
      and id = (
        select d.published_version_id
        from public.documents d
        where d.id = document_id
      )
    )
  );

drop policy if exists document_chunks_select_authorized on public.document_chunks;
create policy document_chunks_select_authorized
  on public.document_chunks for select to authenticated
  using (
    (select private.can_manage_document(document_id))
    or (
      (select private.can_read_document(document_id))
      and version_id = (
        select d.published_version_id
        from public.documents d
        where d.id = document_id
      )
    )
  );

create or replace function public.publish_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
begin
  if not private.can_manage_document(p_document_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  if v_document.status <> 'approved' then
    raise exception 'Document is not approved' using errcode = '23514';
  end if;

  select * into v_version
  from public.document_versions
  where document_id = p_document_id
    and version = v_document.version;

  if not found then
    raise exception 'Document version not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.document_chunks where version_id = v_version.id
  ) then
    raise exception 'Document has no indexed chunks' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.documents other
    where other.group_id = v_document.group_id
      and other.id <> p_document_id
      and other.source_hash = v_version.source_hash
  ) then
    raise exception 'Source already registered in this group' using errcode = '23505';
  end if;

  if v_document.published_version_id is not null
     and v_document.published_version_id <> v_version.id then
    update public.document_versions
    set status = 'retired'
    where id = v_document.published_version_id;
  end if;

  update public.documents
  set status = 'published',
      published_version_id = v_version.id,
      source_hash = v_version.source_hash,
      source_bucket = v_version.source_bucket,
      source_path = v_version.source_path,
      mime_type = v_version.mime_type,
      size_bytes = v_version.size_bytes,
      published_at = now(),
      updated_at = now()
  where id = p_document_id;

  update public.document_versions
  set status = 'published'
  where id = v_version.id;

  insert into public.document_events (document_id, version_id, event_type, actor_id, metadata)
  values (
    p_document_id,
    v_version.id,
    'published',
    auth.uid(),
    jsonb_build_object(
      'version', v_version.version,
      'previous_version_id', v_document.published_version_id
    )
  );
end;
$$;

create or replace function public.retire_document(
  p_document_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_version_id uuid;
begin
  if not private.can_manage_document(p_document_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  if v_document.status not in ('approved', 'published')
     and v_document.published_version_id is null then
    raise exception 'Document cannot be retired from its current state' using errcode = '23514';
  end if;

  select id into v_version_id
  from public.document_versions
  where document_id = p_document_id
    and version = v_document.version;

  update public.documents
  set status = 'retired',
      published_version_id = null,
      retired_at = now(),
      review_notes = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
  where id = p_document_id;

  update public.document_versions
  set status = 'retired'
  where id = v_version_id
     or id = v_document.published_version_id;

  insert into public.document_events (document_id, version_id, event_type, actor_id, metadata)
  values (
    p_document_id,
    v_version_id,
    'retired',
    auth.uid(),
    jsonb_build_object(
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'published_version_id', v_document.published_version_id
    )
  );
end;
$$;

revoke all on function public.publish_document(uuid) from public, anon;
revoke all on function public.retire_document(uuid, text) from public, anon;
grant execute on function public.publish_document(uuid) to authenticated;
grant execute on function public.retire_document(uuid, text) to authenticated;

notify pgrst, 'reload schema';
