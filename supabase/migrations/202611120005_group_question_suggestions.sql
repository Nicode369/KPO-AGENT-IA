-- Seedable question panel per group. Reads are limited to active group members;
-- writes stay in scripts/service_role because the product has no admin CRUD.

create table if not exists public.group_question_suggestions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  question text not null,
  category text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_question_suggestions_question_valid check (
    length(trim(question)) between 3 and 1200
  ),
  constraint group_question_suggestions_position_valid check (position >= 0),
  constraint group_question_suggestions_unique unique (group_id, question)
);

create index if not exists group_question_suggestions_group_idx
  on public.group_question_suggestions (group_id, is_active, position);

alter table public.group_question_suggestions enable row level security;

revoke all on public.group_question_suggestions from public, anon;
grant select on public.group_question_suggestions to authenticated;
grant all on public.group_question_suggestions to service_role;

drop policy if exists group_question_suggestions_select on public.group_question_suggestions;
create policy group_question_suggestions_select
  on public.group_question_suggestions
  for select
  to authenticated
  using (
    private.is_superadmin()
    or private.has_group_role(
      group_id,
      array['group_admin', 'supervisor', 'analyst']::public.group_role[]
    )
  );

notify pgrst, 'reload schema';
