-- 개인 KPI 작성(제출 → 팀장 승인)과 분기 자기평가
-- 기존 팀 KPI(K1~)는 모두 'approved'. 팀원이 만든 KPI 는 'P' 번호를 써서 시트의 K 번호와 겹치지 않게 한다.

create sequence if not exists public.personal_kpi_seq start 1;
grant usage on sequence public.personal_kpi_seq to authenticated;

alter table public.kpis
  alter column id set default ('P' || nextval('public.personal_kpi_seq')),
  add column status text not null default 'approved' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  add column measure text not null default '',
  add column target text not null default '',
  add column weight int check (weight between 0 and 100),
  add column created_by uuid references public.profiles(id),
  add column lead_comment text not null default '',
  add column submitted_at timestamptz,
  add column approved_at timestamptz,
  add column updated_at timestamptz not null default now();

-- 팀원이 만든 KPI 는 만든 사람이 담당자. 상태 변경 시각 기록
create or replace function public.kpis_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_profile_id());
  else
    new.updated_at := now();
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then new.submitted_at := now(); end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then new.approved_at := now(); end if;
  return new;
end $$;
create trigger kpis_touch before insert or update on public.kpis
  for each row execute function public.kpis_touch();

create or replace function public.kpis_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null and not public.is_lead() then
    insert into public.kpi_owners (kpi_id, profile_id) values (new.id, new.created_by) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger kpis_owner after insert on public.kpis
  for each row execute function public.kpis_owner();

revoke execute on function public.kpis_touch() from public, anon, authenticated;
revoke execute on function public.kpis_owner() from public, anon, authenticated;

-- 권한: 승인된 KPI 는 모두 조회, 작성 중·제출·반려는 본인과 팀장만
drop policy kpis_read on public.kpis;
drop policy kpis_insert on public.kpis;
drop policy kpis_update on public.kpis;
create policy kpis_read on public.kpis for select to authenticated using (
  public.is_member() and (status = 'approved' or public.is_lead() or created_by = public.current_profile_id()));
create policy kpis_insert on public.kpis for insert to authenticated with check (
  public.is_lead() or (created_by = public.current_profile_id() and status in ('draft', 'submitted')));
create policy kpis_update on public.kpis for update to authenticated
  using (public.is_lead() or (created_by = public.current_profile_id() and status <> 'approved'))
  with check (public.is_lead() or (created_by = public.current_profile_id() and status in ('draft', 'submitted')));

-- 분기·연간 자기평가 (본인 작성, 팀장 조회)
create table public.kpi_reviews (
  id uuid primary key default gen_random_uuid(),
  kpi_id text not null references public.kpis(id),
  profile_id uuid not null references public.profiles(id),
  year int not null,
  period text not null check (period in ('Q1', 'Q2', 'Q3', 'Q4', 'Y')),
  achievement text not null default '',
  self_grade text,
  updated_at timestamptz not null default now(),
  unique (kpi_id, profile_id, year, period)
);
alter table public.kpi_reviews enable row level security;
grant select, insert, update on public.kpi_reviews to authenticated;
create policy reviews_read on public.kpi_reviews for select to authenticated
  using (public.is_lead() or profile_id = public.current_profile_id());
create policy reviews_insert on public.kpi_reviews for insert to authenticated
  with check (profile_id = public.current_profile_id());
create policy reviews_update on public.kpi_reviews for update to authenticated
  using (profile_id = public.current_profile_id()) with check (profile_id = public.current_profile_id());
