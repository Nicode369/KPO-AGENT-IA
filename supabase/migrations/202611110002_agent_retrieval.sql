-- Phase 5: authorized retrieval over published chunks and auditable agent queries.

create table if not exists public.agent_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_ids uuid[] not null default '{}'::uuid[],
  question text not null,
  answer text,
  model text,
  prompt_version text,
  abstained boolean not null default false,
  outcome text not null default 'answered',
  outcome_reason text,
  latency_ms integer,
  source_count integer not null default 0,
  grounding_score double precision,
  controls jsonb not null default '{}'::jsonb,
  question_hash text,
  answer_hash text,
  created_at timestamptz not null default now(),
  constraint agent_queries_question_length check (length(trim(question)) between 1 and 4000),
  constraint agent_queries_source_count check (source_count between 0 and 50),
  constraint agent_queries_latency check (latency_ms is null or latency_ms >= 0),
  constraint agent_queries_outcome_valid check (
    outcome in ('answered', 'rejected', 'blocked', 'insufficient_evidence', 'error')
  ),
  constraint agent_queries_grounding check (
    grounding_score is null or grounding_score between -1 and 1
  )
);

alter table public.agent_queries
  add column if not exists outcome text not null default 'answered',
  add column if not exists outcome_reason text,
  add column if not exists grounding_score double precision,
  add column if not exists controls jsonb not null default '{}'::jsonb,
  add column if not exists question_hash text,
  add column if not exists answer_hash text;

do $$
begin
  alter table public.agent_queries
    add constraint agent_queries_outcome_valid check (
      outcome in ('answered', 'rejected', 'blocked', 'insufficient_evidence', 'error')
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.agent_queries
    add constraint agent_queries_grounding check (
      grounding_score is null or grounding_score between -1 and 1
    );
exception when duplicate_object then null;
end $$;

create index if not exists agent_queries_user_time_idx
  on public.agent_queries (user_id, created_at desc);
create index if not exists agent_queries_time_idx
  on public.agent_queries (created_at desc);

create table if not exists public.agent_query_sources (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.agent_queries (id) on delete cascade,
  chunk_id uuid references public.document_chunks (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  rank integer not null,
  similarity double precision,
  document_title text,
  document_version integer,
  created_at timestamptz not null default now(),
  constraint agent_query_sources_rank_positive check (rank > 0),
  constraint agent_query_sources_unique_rank unique (query_id, rank)
);

alter table public.agent_query_sources
  add column if not exists document_title text,
  add column if not exists document_version integer;

create index if not exists agent_query_sources_query_idx
  on public.agent_query_sources (query_id, rank);
create index if not exists agent_query_sources_document_idx
  on public.agent_query_sources (document_id);

alter table public.agent_queries enable row level security;
alter table public.agent_query_sources enable row level security;

revoke all on public.agent_queries, public.agent_query_sources from anon, authenticated;
grant select on public.agent_queries, public.agent_query_sources to authenticated;
grant all on public.agent_queries, public.agent_query_sources to service_role;

drop policy if exists agent_queries_select_own on public.agent_queries;
create policy agent_queries_select_own
  on public.agent_queries for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists agent_query_sources_select_own on public.agent_query_sources;
create policy agent_query_sources_select_own
  on public.agent_query_sources for select to authenticated
  using (
    exists (
      select 1
      from public.agent_queries q
      where q.id = query_id
        and q.user_id = (select auth.uid())
    )
  );

create or replace function public.match_document_chunks(
  p_query_embedding text,
  p_match_count integer default 8,
  p_document_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  version_id uuid,
  version integer,
  title text,
  content text,
  page integer,
  section text,
  article text,
  numeral text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with candidates as (
    select
      dc.id as chunk_id,
      dc.document_id,
      dc.version_id,
      dv.version,
      dc.content,
      dc.page,
      dc.section,
      dc.article,
      dc.numeral,
      1 - (dc.embedding <=> p_query_embedding::extensions.vector(1024)) as similarity
    from public.document_chunks dc
    join public.documents d on d.id = dc.document_id
    join public.document_versions dv on dv.id = dc.version_id
    where dc.embedding is not null
      and d.published_version_id = dc.version_id
      and d.status <> 'retired'
      and private.can_read_document(d.id)
      and (p_document_ids is null or d.id = any(p_document_ids))
  )
  select
    c.chunk_id,
    c.document_id,
    c.version_id,
    c.version,
    d.title,
    c.content,
    c.page,
    c.section,
    c.article,
    c.numeral,
    c.similarity
  from candidates c
  join public.documents d on d.id = c.document_id
  order by c.similarity desc
  limit greatest(1, least(coalesce(p_match_count, 8), 50));
$$;

revoke all on function public.match_document_chunks(text, integer, uuid[]) from public, anon;
grant execute on function public.match_document_chunks(text, integer, uuid[]) to authenticated;

drop function if exists public.record_agent_query(text, text, text, text, boolean, integer, uuid[], jsonb);

create or replace function public.record_agent_query(
  p_question text,
  p_answer text,
  p_model text,
  p_prompt_version text,
  p_abstained boolean,
  p_outcome text,
  p_outcome_reason text,
  p_latency_ms integer,
  p_group_ids uuid[],
  p_sources jsonb,
  p_grounding_score double precision default null,
  p_controls jsonb default '{}'::jsonb,
  p_question_hash text default null,
  p_answer_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query_id uuid;
  v_source jsonb;
  v_rank integer := 0;
  v_source_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_question is null or length(trim(p_question)) = 0 then
    raise exception 'Question is required' using errcode = '22023';
  end if;

  if p_outcome is null
     or p_outcome not in ('answered', 'rejected', 'blocked', 'insufficient_evidence', 'error') then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;

  if p_sources is not null and jsonb_typeof(p_sources) = 'array' then
    v_source_count := jsonb_array_length(p_sources);
  end if;

  insert into public.agent_queries (
    user_id,
    group_ids,
    question,
    answer,
    model,
    prompt_version,
    abstained,
    outcome,
    outcome_reason,
    latency_ms,
    source_count,
    grounding_score,
    controls,
    question_hash,
    answer_hash
  )
  values (
    auth.uid(),
    coalesce(p_group_ids, '{}'::uuid[]),
    left(trim(p_question), 4000),
    p_answer,
    p_model,
    p_prompt_version,
    coalesce(p_abstained, false),
    p_outcome,
    p_outcome_reason,
    p_latency_ms,
    least(v_source_count, 50),
    p_grounding_score,
    coalesce(p_controls, '{}'::jsonb),
    p_question_hash,
    p_answer_hash
  )
  returning id into v_query_id;

  if p_sources is not null and jsonb_typeof(p_sources) = 'array' then
    for v_source in select * from jsonb_array_elements(p_sources)
    loop
      exit when v_rank >= 50;
      v_rank := v_rank + 1;
      insert into public.agent_query_sources (
        query_id,
        chunk_id,
        document_id,
        rank,
        similarity,
        document_title,
        document_version
      )
      values (
        v_query_id,
        nullif(v_source->>'chunk_id', '')::uuid,
        nullif(v_source->>'document_id', '')::uuid,
        v_rank,
        nullif(v_source->>'similarity', '')::double precision,
        nullif(v_source->>'title', ''),
        nullif(v_source->>'version', '')::integer
      );
    end loop;
  end if;

  return v_query_id;
end;
$$;

revoke all on function public.record_agent_query(text, text, text, text, boolean, text, text, integer, uuid[], jsonb, double precision, jsonb, text, text) from public, anon;
grant execute on function public.record_agent_query(text, text, text, text, boolean, text, text, integer, uuid[], jsonb, double precision, jsonb, text, text) to authenticated;

comment on table public.agent_queries is 'Auditable RAG questions and generated answers per user.';
comment on table public.agent_query_sources is 'Authorized chunks used as evidence for an agent answer.';
comment on function public.match_document_chunks(text, integer, uuid[]) is 'Cosine retrieval restricted to published versions and RLS-authorized documents.';
comment on function public.record_agent_query(text, text, text, text, boolean, text, text, integer, uuid[], jsonb, double precision, jsonb, text, text) is 'Atomically records an agent query, outcome, hashes and evidence.';

notify pgrst, 'reload schema';
