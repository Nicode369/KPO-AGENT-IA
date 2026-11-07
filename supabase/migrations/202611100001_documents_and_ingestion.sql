-- Phase 4: private document storage, versions, extraction, chunks and review.
-- The ingestion Worker uses the service role for writes. Authenticated users only
-- read documents they are authorized to see; state changes go through RPCs.

create extension if not exists vector with schema extensions;

set search_path = public, extensions;

do $$
begin
  create type public.document_status as enum (
    'uploaded',
    'processing',
    'pending_review',
    'approved',
    'published',
    'retired',
    'rejected',
    'error'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_visibility as enum ('restricted', 'common');
exception when duplicate_object then null;
end $$;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  document_type text not null,
  norm_number text,
  title text not null,
  version integer not null default 1,
  version_label text,
  status public.document_status not null default 'uploaded',
  visibility public.document_visibility not null default 'restricted',
  effective_from date,
  effective_until date,
  source_hash text not null,
  source_bucket text not null,
  source_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  review_notes text,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_type_format check (document_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint documents_title_length check (length(trim(title)) between 1 and 300),
  constraint documents_version_positive check (version > 0),
  constraint documents_source_hash_format check (source_hash ~ '^[a-f0-9]{64}$'),
  constraint documents_size_positive check (size_bytes between 1 and 26214400),
  constraint documents_mime_allowed check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  constraint documents_effective_range check (
    effective_until is null or effective_from is null or effective_until >= effective_from
  ),
  constraint documents_group_hash_unique unique (group_id, source_hash)
);

create index if not exists documents_group_status_idx
  on public.documents (group_id, status, created_at desc);
create index if not exists documents_status_idx
  on public.documents (status, created_at desc);
create index if not exists documents_group_updated_idx
  on public.documents (group_id, updated_at desc);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version integer not null,
  source_hash text not null,
  source_bucket text not null,
  source_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  extracted_bucket text,
  extracted_path text,
  chunk_count integer not null default 0,
  status public.document_status not null default 'uploaded',
  processing_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint document_versions_positive check (version > 0),
  constraint document_versions_chunk_count check (chunk_count >= 0),
  constraint document_versions_unique unique (document_id, version),
  constraint document_versions_hash_format check (source_hash ~ '^[a-f0-9]{64}$'),
  constraint document_versions_size_positive check (size_bytes between 1 and 26214400)
);

create index if not exists document_versions_document_idx
  on public.document_versions (document_id, version desc);
create index if not exists document_versions_status_idx
  on public.document_versions (status, created_at desc);

create table if not exists public.document_access (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (document_id, group_id)
);

create index if not exists document_access_document_idx
  on public.document_access (document_id);
create index if not exists document_access_group_idx
  on public.document_access (group_id);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_id uuid not null references public.document_versions (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  content_hash text not null,
  page integer,
  section text,
  article text,
  numeral text,
  token_count integer not null default 0,
  embedding vector(1024),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_chunks_index_nonnegative check (chunk_index >= 0),
  constraint document_chunks_content_nonempty check (length(trim(content)) > 0),
  constraint document_chunks_hash_format check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint document_chunks_token_count check (token_count >= 0),
  constraint document_chunks_unique unique (version_id, chunk_index)
);

create index if not exists document_chunks_document_idx
  on public.document_chunks (document_id, version_id, chunk_index);
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_id uuid references public.document_versions (id) on delete set null,
  event_type text not null,
  actor_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_events_type_format check (event_type ~ '^[a-z][a-z0-9_]{1,63}$')
);

create index if not exists document_events_document_idx
  on public.document_events (document_id, created_at desc);

create or replace function private.can_manage_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and (
        private.is_superadmin()
        or private.has_group_role(d.group_id, array['group_admin']::public.group_role[])
      )
  );
$$;

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
    where d.id = p_document_id
      and (
        private.is_superadmin()
        or exists (
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
            and (
              gm.role in ('group_admin', 'supervisor')
              or d.status in ('approved', 'published')
            )
        )
        or (
          d.visibility = 'common'
          and d.status in ('approved', 'published')
          and exists (
            select 1
            from public.group_memberships gm
            where gm.user_id = (select auth.uid())
              and gm.status = 'active'
          )
        )
      )
  );
$$;

revoke all on function private.can_manage_document(uuid) from public, anon;
revoke all on function private.can_read_document(uuid) from public, anon;
grant execute on function private.can_manage_document(uuid) to authenticated;
grant execute on function private.can_read_document(uuid) to authenticated;

create or replace function public.approve_document(
  p_document_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
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

  if v_document.status <> 'pending_review' then
    raise exception 'Document is not pending review' using errcode = '23514';
  end if;

  update public.documents
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      review_notes = nullif(trim(coalesce(p_notes, '')), ''),
      processing_error = null,
      updated_at = now()
  where id = p_document_id;

  update public.document_versions
  set status = 'approved'
  where document_id = p_document_id
    and version = v_document.version;

  insert into public.document_events (document_id, version_id, event_type, actor_id, metadata)
  select p_document_id, dv.id, 'approved', auth.uid(),
         jsonb_build_object('notes', nullif(trim(coalesce(p_notes, '')), ''))
  from public.document_versions dv
  where dv.document_id = p_document_id
    and dv.version = v_document.version;
end;
$$;

create or replace function public.publish_document(p_document_id uuid)
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

  if v_document.status <> 'approved' then
    raise exception 'Document is not approved' using errcode = '23514';
  end if;

  select id into v_version_id
  from public.document_versions
  where document_id = p_document_id
    and version = v_document.version;

  if v_version_id is null or not exists (
    select 1 from public.document_chunks where version_id = v_version_id
  ) then
    raise exception 'Document has no indexed chunks' using errcode = '23514';
  end if;

  update public.documents
  set status = 'published',
      published_at = now(),
      updated_at = now()
  where id = p_document_id;

  update public.document_versions
  set status = 'published'
  where id = v_version_id;

  insert into public.document_events (document_id, version_id, event_type, actor_id, metadata)
  values (p_document_id, v_version_id, 'published', auth.uid(), '{}'::jsonb);
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

  if v_document.status not in ('approved', 'published') then
    raise exception 'Document cannot be retired from its current state' using errcode = '23514';
  end if;

  update public.documents
  set status = 'retired',
      retired_at = now(),
      review_notes = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
  where id = p_document_id;

  update public.document_versions
  set status = 'retired'
  where document_id = p_document_id
    and version = v_document.version;

  insert into public.document_events (document_id, version_id, event_type, actor_id, metadata)
  select p_document_id, dv.id, 'retired', auth.uid(),
         jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  from public.document_versions dv
  where dv.document_id = p_document_id
    and dv.version = v_document.version;
end;
$$;

create or replace function public.reject_document(
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

  if v_document.status <> 'pending_review' then
    raise exception 'Document is not pending review' using errcode = '23514';
  end if;

  update public.documents
  set status = 'rejected',
      review_notes = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
  where id = p_document_id;

  update public.document_versions
  set status = 'rejected'
  where document_id = p_document_id
    and version = v_document.version;

  insert into public.document_events (document_id, version_id, event_type, actor_id, metadata)
  select p_document_id, dv.id, 'rejected', auth.uid(),
         jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  from public.document_versions dv
  where dv.document_id = p_document_id
    and dv.version = v_document.version;
end;
$$;

create or replace function public.update_document_metadata(
  p_document_id uuid,
  p_title text,
  p_document_type text,
  p_norm_number text default null,
  p_version_label text default null,
  p_effective_from date default null,
  p_effective_until date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_document(p_document_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) not between 1 and 300 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;

  if p_document_type is null or p_document_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'Invalid document type' using errcode = '22023';
  end if;

  if p_effective_from is not null and p_effective_until is not null
     and p_effective_until < p_effective_from then
    raise exception 'Invalid effective range' using errcode = '22023';
  end if;

  update public.documents
  set title = trim(p_title),
      document_type = p_document_type,
      norm_number = nullif(trim(coalesce(p_norm_number, '')), ''),
      version_label = nullif(trim(coalesce(p_version_label, '')), ''),
      effective_from = p_effective_from,
      effective_until = p_effective_until,
      updated_at = now()
  where id = p_document_id;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  insert into public.document_events (document_id, event_type, actor_id, metadata)
  values (p_document_id, 'metadata_updated', auth.uid(), '{}'::jsonb);
end;
$$;

create or replace function public.set_document_access(
  p_document_id uuid,
  p_visibility public.document_visibility,
  p_group_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_document(p_document_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_visibility is null then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_group_ids, '{}'::uuid[])) as group_id
    where not exists (
      select 1 from public.groups g where g.id = group_id and g.is_active
    )
  ) then
    raise exception 'Invalid group access' using errcode = '22023';
  end if;

  update public.documents
  set visibility = p_visibility,
      updated_at = now()
  where id = p_document_id;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  delete from public.document_access where document_id = p_document_id;

  if p_visibility = 'restricted' then
    insert into public.document_access (document_id, group_id)
    select distinct p_document_id, group_id
    from unnest(coalesce(p_group_ids, '{}'::uuid[])) as group_id
    on conflict (document_id, group_id) do nothing;
  end if;

  insert into public.document_events (document_id, event_type, actor_id, metadata)
  values (
    p_document_id,
    'access_updated',
    auth.uid(),
    jsonb_build_object('visibility', p_visibility, 'groups', coalesce(p_group_ids, '{}'::uuid[]))
  );
end;
$$;

revoke all on function public.approve_document(uuid, text) from public, anon;
revoke all on function public.publish_document(uuid) from public, anon;
revoke all on function public.retire_document(uuid, text) from public, anon;
revoke all on function public.reject_document(uuid, text) from public, anon;
revoke all on function public.update_document_metadata(uuid, text, text, text, text, date, date) from public, anon;
revoke all on function public.set_document_access(uuid, public.document_visibility, uuid[]) from public, anon;
grant execute on function public.approve_document(uuid, text) to authenticated;
grant execute on function public.publish_document(uuid) to authenticated;
grant execute on function public.retire_document(uuid, text) to authenticated;
grant execute on function public.reject_document(uuid, text) to authenticated;
grant execute on function public.update_document_metadata(uuid, text, text, text, text, date, date) to authenticated;
grant execute on function public.set_document_access(uuid, public.document_visibility, uuid[]) to authenticated;

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_access enable row level security;
alter table public.document_chunks enable row level security;
alter table public.document_events enable row level security;

revoke all on public.documents, public.document_versions, public.document_access,
  public.document_chunks, public.document_events from anon, authenticated;

grant select on public.documents, public.document_versions, public.document_access,
  public.document_chunks, public.document_events to authenticated;
grant all on public.documents, public.document_versions, public.document_access,
  public.document_chunks, public.document_events to service_role;

drop policy if exists documents_select_authorized on public.documents;
create policy documents_select_authorized
  on public.documents for select to authenticated
  using ((select private.can_read_document(id)));

drop policy if exists document_versions_select_authorized on public.document_versions;
create policy document_versions_select_authorized
  on public.document_versions for select to authenticated
  using ((select private.can_read_document(document_id)));

drop policy if exists document_access_select_manager on public.document_access;
create policy document_access_select_manager
  on public.document_access for select to authenticated
  using ((select private.can_manage_document(document_id)));

drop policy if exists document_chunks_select_authorized on public.document_chunks;
create policy document_chunks_select_authorized
  on public.document_chunks for select to authenticated
  using ((select private.can_read_document(document_id)));

drop policy if exists document_events_select_manager on public.document_events;
create policy document_events_select_manager
  on public.document_events for select to authenticated
  using ((select private.can_manage_document(document_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents-original',
    'documents-original',
    false,
    26214400,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  ),
  (
    'documents-processed',
    'documents-processed',
    false,
    26214400,
    array['text/markdown', 'text/plain', 'application/json']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documents_original_admin_read on storage.objects;
create policy documents_original_admin_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents-original'
    and (
      (select private.is_superadmin())
      or exists (
        select 1
        from public.group_memberships gm
        where gm.user_id = (select auth.uid())
          and gm.status = 'active'
          and gm.role in ('group_admin', 'supervisor')
          and gm.group_id::text = (storage.foldername(name))[2]
      )
    )
  );

drop policy if exists documents_processed_admin_read on storage.objects;
create policy documents_processed_admin_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents-processed'
    and (
      (select private.is_superadmin())
      or exists (
        select 1
        from public.group_memberships gm
        where gm.user_id = (select auth.uid())
          and gm.status = 'active'
          and gm.role in ('group_admin', 'supervisor')
          and gm.group_id::text = (storage.foldername(name))[2]
      )
    )
  );

comment on table public.documents is 'Logical document and current version metadata.';
comment on table public.document_versions is 'Immutable original version metadata and extraction results.';
comment on table public.document_chunks is 'Authorized document fragments with pgvector embeddings.';
comment on table public.document_events is 'Document lifecycle history for phase 4 review and audit.';
comment on table public.document_access is 'Additional group grants for restricted documents.';

notify pgrst, 'reload schema';
