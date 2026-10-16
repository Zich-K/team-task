-- KPI 수정 권한: 팀원 전원이 승인된 KPI(팀 KPI 포함)와 담당자를 고칠 수 있다.
-- 승인은 여전히 팀장만: 팀원이 승인 안 된 KPI 를 '승인'으로 바꾸는 것은 막는다.
drop policy kpis_update on public.kpis;
create policy kpis_update on public.kpis for update to authenticated
  using (public.is_lead() or created_by = public.current_profile_id() or (public.is_member() and status = 'approved'))
  with check (public.is_lead()
    or (created_by = public.current_profile_id() and status in ('draft', 'submitted', 'rejected'))
    or (public.is_member() and status = 'approved'));

create or replace function public.kpi_approve_guard() returns trigger language plpgsql as $$
begin
  -- 로그인 사용자(팀원)만 검사. 서버 동기화 등 시스템 작업은 통과
  if auth.uid() is not null and new.status = 'approved' and old.status is distinct from 'approved' and not public.is_lead() then
    raise exception '승인은 팀장만 할 수 있습니다';
  end if;
  return new;
end $$;
drop trigger if exists kpi_approve_guard on public.kpis;
create trigger kpi_approve_guard before update on public.kpis
  for each row execute function public.kpi_approve_guard();

drop policy kpi_owners_write on public.kpi_owners;
create policy kpi_owners_write on public.kpi_owners for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant insert, delete on public.kpi_owners to authenticated;
