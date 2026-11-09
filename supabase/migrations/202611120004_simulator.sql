create or replace function private.can_view_simulator(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_superadmin()
    or private.has_group_role(
      p_group_id,
      array['group_admin', 'supervisor']::public.group_role[]
    );
$$;

create or replace function private.can_manage_simulator(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_superadmin()
    or private.has_group_role(
      p_group_id,
      array['group_admin']::public.group_role[]
    );
$$;

revoke all on function private.can_view_simulator(uuid) from public, anon;
revoke all on function private.can_manage_simulator(uuid) from public, anon;
grant execute on function private.can_view_simulator(uuid) to authenticated;
grant execute on function private.can_manage_simulator(uuid) to authenticated;

create table public.simulator_cases (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  question text not null,
  expected_outcome text not null,
  expected_document_id uuid references public.documents (id) on delete set null,
  expected_terms text[] not null default '{}'::text[],
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulator_cases_title_valid check (length(trim(title)) between 2 and 120),
  constraint simulator_cases_question_valid check (length(trim(question)) between 3 and 1200),
  constraint simulator_cases_outcome_valid check (
    expected_outcome in (
      'answered',
      'rejected',
      'blocked',
      'insufficient_evidence',
      'out_of_scope',
      'error'
    )
  ),
  constraint simulator_cases_terms_valid check (cardinality(expected_terms) <= 10)
);

create index simulator_cases_group_created_idx
  on public.simulator_cases (group_id, created_at desc);
create index simulator_cases_group_active_idx
  on public.simulator_cases (group_id, is_active);

create table public.simulator_runs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'running',
  total_cases integer not null,
  completed_cases integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint simulator_runs_status_valid check (
    status in ('running', 'completed', 'failed')
  ),
  constraint simulator_runs_total_valid check (total_cases between 1 and 100),
  constraint simulator_runs_completed_valid check (
    completed_cases between 0 and total_cases
  )
);

create index simulator_runs_group_started_idx
  on public.simulator_runs (group_id, started_at desc);

create table public.simulator_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.simulator_runs (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  case_id uuid references public.simulator_cases (id) on delete set null,
  case_title text not null,
  question text not null,
  expected_outcome text not null,
  actual_outcome text not null,
  outcome_match boolean not null,
  expected_document_id uuid,
  source_match boolean,
  expected_terms text[] not null default '{}'::text[],
  terms_match boolean not null,
  answer text,
  abstained boolean not null default false,
  citation_count integer not null default 0,
  latency_ms integer,
  error text,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint simulator_results_expected_outcome_valid check (
    expected_outcome in (
      'answered',
      'rejected',
      'blocked',
      'insufficient_evidence',
      'out_of_scope',
      'error'
    )
  ),
  constraint simulator_results_actual_outcome_valid check (
    actual_outcome in (
      'answered',
      'rejected',
      'blocked',
      'insufficient_evidence',
      'out_of_scope',
      'error'
    )
  ),
  constraint simulator_results_latency_valid check (latency_ms is null or latency_ms >= 0),
  constraint simulator_results_unique_case unique (run_id, case_id),
  constraint simulator_results_sources_array check (jsonb_typeof(sources) = 'array')
);

create index simulator_results_run_created_idx
  on public.simulator_results (run_id, created_at);
create index simulator_results_group_created_idx
  on public.simulator_results (group_id, created_at desc);

alter table public.simulator_cases enable row level security;
alter table public.simulator_runs enable row level security;
alter table public.simulator_results enable row level security;

revoke all on public.simulator_cases, public.simulator_runs, public.simulator_results from public, anon;
grant select, insert, update, delete on public.simulator_cases to authenticated;
grant select, insert, update on public.simulator_runs to authenticated;
grant select, insert on public.simulator_results to authenticated;

create policy simulator_cases_select
  on public.simulator_cases
  for select
  to authenticated
  using (private.can_view_simulator(group_id));

create policy simulator_cases_insert
  on public.simulator_cases
  for insert
  to authenticated
  with check (
    private.can_manage_simulator(group_id)
    and created_by = (select auth.uid())
  );

create policy simulator_cases_update
  on public.simulator_cases
  for update
  to authenticated
  using (private.can_manage_simulator(group_id))
  with check (private.can_manage_simulator(group_id));

create policy simulator_cases_delete
  on public.simulator_cases
  for delete
  to authenticated
  using (private.can_manage_simulator(group_id));

create policy simulator_runs_select
  on public.simulator_runs
  for select
  to authenticated
  using (private.can_view_simulator(group_id));

create policy simulator_runs_insert
  on public.simulator_runs
  for insert
  to authenticated
  with check (
    private.can_view_simulator(group_id)
    and created_by = (select auth.uid())
  );

create policy simulator_runs_update
  on public.simulator_runs
  for update
  to authenticated
  using (
    private.can_view_simulator(group_id)
    and created_by = (select auth.uid())
  )
  with check (
    private.can_view_simulator(group_id)
    and created_by = (select auth.uid())
  );

create policy simulator_results_select
  on public.simulator_results
  for select
  to authenticated
  using (private.can_view_simulator(group_id));

create policy simulator_results_insert
  on public.simulator_results
  for insert
  to authenticated
  with check (
    private.can_view_simulator(group_id)
    and exists (
      select 1
      from public.simulator_runs r
      where r.id = simulator_results.run_id
        and r.group_id = simulator_results.group_id
        and r.created_by = (select auth.uid())
    )
  );

comment on table public.simulator_cases is
  'Preguntas de prueba con resultado esperado para evaluar el agente.';
comment on table public.simulator_runs is
  'Ejecuciones por lote del simulador, aisladas del historial real.';
comment on table public.simulator_results is
  'Resultado individual de un caso con métricas de acierto.';

notify pgrst, 'reload schema';
