-- 메인 업무(업무 묶음) 단위 기본 KPI. 서브 업무는 기본값을 따르고, 다를 때만 개별 지정.
alter table public.task_groups add column kpi_id text references public.kpis(id);

-- 기존 데이터: 연결된 서브 업무가 모두 같은 KPI 인 묶음만 그 KPI 를 기본값으로 (서브 업무 자체는 건드리지 않음)
update public.task_groups g set kpi_id = s.kpi_id
from (
  select group_id, min(kpi_id) as kpi_id
  from public.tasks
  where deleted_at is null and kpi_id is not null
  group by group_id
  having count(distinct kpi_id) = 1
) s
where g.id = s.group_id and g.kpi_id is null;
