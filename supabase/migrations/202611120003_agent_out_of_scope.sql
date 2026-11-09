alter table public.agent_queries
  drop constraint if exists agent_queries_outcome_valid;

alter table public.agent_queries
  add constraint agent_queries_outcome_valid check (
    outcome in (
      'answered',
      'rejected',
      'blocked',
      'insufficient_evidence',
      'out_of_scope',
      'error'
    )
  );

update public.agent_queries
set outcome = 'out_of_scope',
    outcome_reason = 'no_relevant_sources'
where outcome = 'insufficient_evidence'
  and outcome_reason = 'no_authorized_sources';

comment on constraint agent_queries_outcome_valid on public.agent_queries is
  'Allowed agent outcomes, including out_of_scope for queries without relevant published sources.';

notify pgrst, 'reload schema';
