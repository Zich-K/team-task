-- 회의록. 할 일은 저장 시 업무(tasks)로 등록되고 meeting_items.task_id 로 연결된다.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  series text,                                  -- 정기 회의 이름 (같은 이름끼리 지난 회차 할 일을 이어서 본다)
  meeting_at timestamptz not null default now(),
  attendee_ids uuid[] not null default '{}',
  external_attendees text not null default '',
  group_id uuid references public.task_groups(id),  -- 관련 메인 업무 (할 일의 기본 메인 업무)
  agenda text not null default '',
  decisions text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index meetings_at on public.meetings (meeting_at desc);
create index meetings_series on public.meetings (series);

create table public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  content text not null,
  assignee_id uuid references public.profiles(id),
  due_date date,
  task_id uuid references public.tasks(id),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index meeting_items_meeting on public.meeting_items (meeting_id);
create index meeting_items_task on public.meeting_items (task_id);

create or replace function public.meetings_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_profile_id());
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(public.current_profile_id(), new.updated_by);
  return new;
end $$;
create trigger meetings_touch before insert or update on public.meetings
  for each row execute function public.meetings_touch();
revoke execute on function public.meetings_touch() from public, anon, authenticated;

alter table public.meetings enable row level security;
alter table public.meeting_items enable row level security;
grant select, insert, update on public.meetings to authenticated;
grant select, insert, update, delete on public.meeting_items to authenticated;

-- 팀원 모두 조회·작성·수정 (업무와 같은 규칙). 회의록 삭제는 deleted_at 으로만
create policy meetings_read on public.meetings for select to authenticated using (public.is_member());
create policy meetings_insert on public.meetings for insert to authenticated with check (public.is_member());
create policy meetings_update on public.meetings for update to authenticated using (public.is_member()) with check (public.is_member());
create policy items_read on public.meeting_items for select to authenticated using (public.is_member());
create policy items_write on public.meeting_items for all to authenticated using (public.is_member()) with check (public.is_member());
