create table if not exists public.schedule_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer'))
);

create table if not exists public.schedules (
  id text primary key check (id = 'current'),
  lessons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lessons) = 'array' and jsonb_array_length(lessons) <= 100),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.schedule_access enable row level security;
alter table public.schedules enable row level security;

revoke all on public.schedule_access from anon, authenticated;
revoke all on public.schedules from anon, authenticated;
grant select on public.schedule_access to authenticated;
grant select, insert, update on public.schedules to authenticated;

create policy "Users can read their own schedule role"
  on public.schedule_access
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Approved users can read the schedule"
  on public.schedules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.schedule_access
      where schedule_access.user_id = (select auth.uid())
        and schedule_access.role in ('editor', 'viewer')
    )
  );

create policy "Only the editor can create the schedule"
  on public.schedules
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.schedule_access
      where schedule_access.user_id = (select auth.uid())
        and schedule_access.role = 'editor'
    )
  );

create policy "Only the editor can update the schedule"
  on public.schedules
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.schedule_access
      where schedule_access.user_id = (select auth.uid())
        and schedule_access.role = 'editor'
    )
  )
  with check (
    exists (
      select 1
      from public.schedule_access
      where schedule_access.user_id = (select auth.uid())
        and schedule_access.role = 'editor'
    )
  );

-- No policies grant access to the anon role or to delete rows.
