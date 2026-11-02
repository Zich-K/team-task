-- 조회 권한(viewer): 보기만 하고 아무것도 쓰지 못한다. 첫 대상은 경영기획부문 대표님 (2026-11 사용자 결정)
-- 보이는 메뉴: 대시보드·팀원별 업무·팀 합본·회의록·성과 리포트 (메뉴는 화면에서 거른다)
-- 회의록 알림 메일은 받는다 (meeting-mail 은 활동 중인 사람 전원에게 보내므로 따로 바꿀 것 없음)
--
-- is_member() 는 그대로 "읽기 가능"으로 두고, 쓰기 정책만 is_writer() 로 바꾼다.
-- 지금 있는 사람은 모두 lead/member 라 기존 사용자에게는 달라지는 것이 없다.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('lead', 'member', 'viewer'));
alter table public.profiles drop constraint profiles_title_check;
alter table public.profiles add constraint profiles_title_check check (title in ('팀원', '팀장', '실장', '대표'));

create or replace function public.is_writer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where auth_user_id = auth.uid() and active and role in ('lead', 'member'))
$$;
revoke execute on function public.is_writer() from public, anon;
grant execute on function public.is_writer() to authenticated;

-- 업무
drop policy groups_insert on public.task_groups;
drop policy groups_update on public.task_groups;
create policy groups_insert on public.task_groups for insert to authenticated with check (public.is_writer());
create policy groups_update on public.task_groups for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy tasks_insert on public.tasks;
drop policy tasks_update on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_writer());
create policy tasks_update on public.tasks for update to authenticated using (public.is_writer()) with check (public.is_writer());

-- 일정·설정
drop policy cal_insert on public.calendar_events;
drop policy cal_update on public.calendar_events;
create policy cal_insert on public.calendar_events for insert to authenticated with check (public.is_writer());
create policy cal_update on public.calendar_events for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy settings_insert on public.app_settings;
drop policy settings_update on public.app_settings;
create policy settings_insert on public.app_settings for insert to authenticated with check (public.is_writer());
create policy settings_update on public.app_settings for update to authenticated using (public.is_writer()) with check (public.is_writer());

-- KPI
drop policy kpis_insert on public.kpis;
create policy kpis_insert on public.kpis for insert to authenticated with check (
  public.is_lead() or (public.is_writer() and created_by = public.current_profile_id() and status in ('draft', 'submitted')));
drop policy kpis_update on public.kpis;
create policy kpis_update on public.kpis for update to authenticated
  using (public.is_lead() or (public.is_writer() and (created_by = public.current_profile_id() or status = 'approved')))
  with check (public.is_lead()
    or (public.is_writer() and created_by = public.current_profile_id() and status in ('draft', 'submitted', 'rejected'))
    or (public.is_writer() and status = 'approved'));

drop policy kpi_owners_write on public.kpi_owners;
create policy kpi_owners_write on public.kpi_owners for all to authenticated
  using (public.is_writer()) with check (public.is_writer());

drop policy reviews_insert on public.kpi_reviews;
drop policy reviews_update on public.kpi_reviews;
create policy reviews_insert on public.kpi_reviews for insert to authenticated
  with check (public.is_writer() and profile_id = public.current_profile_id());
create policy reviews_update on public.kpi_reviews for update to authenticated
  using (public.is_writer() and profile_id = public.current_profile_id())
  with check (public.is_writer() and profile_id = public.current_profile_id());

-- 회의록: 조회 권한은 최종 저장된 것만 본다 (작성 중인 초안은 안 보임)
drop policy meetings_read on public.meetings;
drop policy meetings_insert on public.meetings;
drop policy meetings_update on public.meetings;
create policy meetings_read on public.meetings for select to authenticated
  using (public.is_writer() or (public.is_member() and status = 'final'));
create policy meetings_insert on public.meetings for insert to authenticated with check (public.is_writer());
create policy meetings_update on public.meetings for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy items_read on public.meeting_items;
drop policy items_write on public.meeting_items;
create policy items_read on public.meeting_items for select to authenticated
  using (public.is_writer() or (public.is_member() and exists (
    select 1 from public.meetings m where m.id = meeting_items.meeting_id and m.status = 'final')));
create policy items_write on public.meeting_items for all to authenticated using (public.is_writer()) with check (public.is_writer());
