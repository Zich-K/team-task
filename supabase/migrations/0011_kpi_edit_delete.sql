-- KPI 수정·삭제
-- 팀장: 모든 KPI 수정·삭제. 팀원: 본인이 작성한 KPI 를 수정·삭제할 수 있되, 스스로 승인 상태로 만들 수는 없다
-- (승인된 KPI 를 팀원이 고치면 다시 승인 대기). 삭제는 active = false (기록 보존)
drop policy kpis_update on public.kpis;
create policy kpis_update on public.kpis for update to authenticated
  using (public.is_lead() or created_by = public.current_profile_id())
  with check (public.is_lead() or (created_by = public.current_profile_id() and status in ('draft', 'submitted', 'rejected')));
