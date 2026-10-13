-- 팀 업무관리 v2 초기 스키마
-- 원칙: 하드 삭제 없음(deleted_at), 원본 행은 legacy jsonb 로 그대로 보존

create extension if not exists pg_trgm;

-- ── 이름 정규화 (띄어쓰기·기호 차이로 같은 업무가 갈라지는 것 방지) ──
create or replace function public.norm_title(t text) returns text
language sql immutable as $$
  select lower(regexp_replace(coalesce(t, ''), '[[:space:]_\-\[\]\(\)/·.,]', '', 'g'))
$$;

-- ── 팀원 ──
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  legacy_id text unique,
  name text not null,
  email text unique,
  role text not null default 'member' check (role in ('lead', 'member')),
  color text not null default 'blue',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid() and active
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where auth_user_id = auth.uid() and active)
$$;

create or replace function public.is_lead() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where auth_user_id = auth.uid() and active and role = 'lead')
$$;

-- 가입 시 이메일로 팀원 명단과 연결 (명단에 없는 이메일은 아무 데이터도 볼 수 없음)
create or replace function public.link_profile_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_profile_on_signup();

-- ── 메인 업무(업무 묶음) ──
create table public.task_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  norm_key text generated always as (public.norm_title(title)) stored,
  merged_into uuid references public.task_groups(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create unique index task_groups_norm_key_active on public.task_groups (norm_key) where merged_into is null;
create index task_groups_title_trgm on public.task_groups using gin (title gin_trgm_ops);

-- ── KPI ──
create table public.kpis (
  id text primary key,
  year int not null default 2026,
  category text not null,
  title text not null,
  owner_text text not null default '',
  period text not null default '연간',
  note text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  legacy jsonb
);

create table public.kpi_owners (
  kpi_id text references public.kpis(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  primary key (kpi_id, profile_id)
);

-- ── 업무 ──
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  group_id uuid not null references public.task_groups(id),
  sub_title text not null default '',
  title text not null default '',
  assignee_id uuid references public.profiles(id),
  status text not null default '예정' check (status in ('예정', '진행 중', '보류', '완료')),
  start_date date,
  end_date date,
  note text not null default '',
  block_note text not null default '',
  priority smallint check (priority between 1 and 3),
  kpi_id text references public.kpis(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  legacy jsonb
);
create index tasks_group on public.tasks (group_id);
create index tasks_assignee on public.tasks (assignee_id);
create index tasks_end on public.tasks (end_date);
create index tasks_kpi on public.tasks (kpi_id);
create index tasks_title_trgm on public.tasks using gin (title gin_trgm_ops);

create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id),
  before jsonb,
  after jsonb
);
create index task_history_task on public.task_history (task_id, changed_at);

create or replace function public.tasks_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_profile_id());
    new.updated_by := coalesce(new.updated_by, new.created_by);
    if new.status = '완료' and new.completed_at is null and new.legacy_id is null then
      new.completed_at := now();
    end if;
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(public.current_profile_id(), new.updated_by);
  if new.status = '완료' and old.status <> '완료' then new.completed_at := now(); end if;
  if new.status <> '완료' then new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.tasks_touch();

create or replace function public.tasks_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_history (task_id, changed_by, before, after)
  values (new.id, public.current_profile_id(),
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'legacy' end,
          to_jsonb(new) - 'legacy');
  return new;
end $$;
create trigger tasks_log after insert or update on public.tasks
  for each row execute function public.tasks_log();

-- ── 일정(휴가 등) ──
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'leave' check (type in ('leave', 'meeting', 'etc')),
  title text not null,
  event_date date not null,
  event_time text not null default '',
  profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  legacy jsonb
);

-- ── 공휴일 ──
create table public.holidays (
  day date primary key,
  name text not null default ''
);

-- ── 설정(주간 리포트 표시 설정 등) ──
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

-- ── 평가 ──
create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  year int not null,
  period text not null check (period in ('Q1', 'Q2', 'Q3', 'Q4', 'Y')),
  overall_grade text,
  overall_comment text not null default '',
  evidence jsonb,
  ai_summary text,
  status text not null default 'draft' check (status in ('draft', 'released')),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, year, period)
);

create table public.evaluation_items (
  evaluation_id uuid references public.evaluations(id) on delete cascade,
  kpi_id text references public.kpis(id),
  grade text,
  comment text not null default '',
  primary key (evaluation_id, kpi_id)
);

-- ── 권한 (RLS) ──
alter table public.profiles enable row level security;
alter table public.task_groups enable row level security;
alter table public.kpis enable row level security;
alter table public.kpi_owners enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;
alter table public.calendar_events enable row level security;
alter table public.holidays enable row level security;
alter table public.app_settings enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_items enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- 팀원 명단: 팀원은 조회, 팀장만 수정
create policy profiles_read on public.profiles for select to authenticated using (public.is_member());
create policy profiles_write on public.profiles for update to authenticated using (public.is_lead()) with check (public.is_lead());
create policy profiles_insert on public.profiles for insert to authenticated with check (public.is_lead());

-- 업무·업무묶음·일정·설정: 팀원 모두 조회/추가/수정 (기존과 동일), 삭제는 deleted_at 으로만
create policy groups_read on public.task_groups for select to authenticated using (public.is_member());
create policy groups_insert on public.task_groups for insert to authenticated with check (public.is_member());
create policy groups_update on public.task_groups for update to authenticated using (public.is_member()) with check (public.is_member());

create policy tasks_read on public.tasks for select to authenticated using (public.is_member());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_member());
create policy tasks_update on public.tasks for update to authenticated using (public.is_member()) with check (public.is_member());

create policy history_read on public.task_history for select to authenticated using (public.is_member());

create policy cal_read on public.calendar_events for select to authenticated using (public.is_member());
create policy cal_insert on public.calendar_events for insert to authenticated with check (public.is_member());
create policy cal_update on public.calendar_events for update to authenticated using (public.is_member()) with check (public.is_member());

create policy settings_read on public.app_settings for select to authenticated using (public.is_member());
create policy settings_insert on public.app_settings for insert to authenticated with check (public.is_member());
create policy settings_update on public.app_settings for update to authenticated using (public.is_member()) with check (public.is_member());

-- KPI·공휴일: 팀원 조회, 팀장 수정
create policy kpis_read on public.kpis for select to authenticated using (public.is_member());
create policy kpis_insert on public.kpis for insert to authenticated with check (public.is_lead());
create policy kpis_update on public.kpis for update to authenticated using (public.is_lead()) with check (public.is_lead());
create policy kpi_owners_read on public.kpi_owners for select to authenticated using (public.is_member());
create policy kpi_owners_write on public.kpi_owners for all to authenticated using (public.is_lead()) with check (public.is_lead());
grant delete on public.kpi_owners to authenticated;
create policy holidays_read on public.holidays for select to authenticated using (public.is_member());
create policy holidays_write on public.holidays for all to authenticated using (public.is_lead()) with check (public.is_lead());

-- 평가: 팀장은 전체, 팀원은 공개(released)된 본인 평가만
create policy eval_lead on public.evaluations for all to authenticated using (public.is_lead()) with check (public.is_lead());
create policy eval_self on public.evaluations for select to authenticated
  using (status = 'released' and profile_id = public.current_profile_id());
create policy eval_items_lead on public.evaluation_items for all to authenticated using (public.is_lead()) with check (public.is_lead());
create policy eval_items_self on public.evaluation_items for select to authenticated
  using (exists (select 1 from public.evaluations e where e.id = evaluation_id
                 and e.status = 'released' and e.profile_id = public.current_profile_id()));
grant delete on public.evaluation_items to authenticated;

-- 업무 묶음 합치기 (팀장): 업무를 대상 묶음으로 옮기고 원래 묶음은 merged_into 로 남겨 이력 보존
create or replace function public.merge_task_groups(source uuid, target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_lead() then raise exception '팀장만 합칠 수 있습니다'; end if;
  if source = target then return; end if;
  update public.tasks set group_id = target where group_id = source;
  update public.task_groups set merged_into = target where id = source;
end $$;
revoke execute on function public.merge_task_groups(uuid, uuid) from public, anon;
grant execute on function public.merge_task_groups(uuid, uuid) to authenticated;
