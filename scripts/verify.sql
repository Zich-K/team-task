-- 이관 검증: 새 DB 각 칸이 원본 시트 값(legacy)과 같은지 대조. 모든 *_mismatch 가 0 이어야 정상.
with t as (
  select t.*, g.title as gtitle, p.name as pname from public.tasks t
  join public.task_groups g on g.id = t.group_id left join public.profiles p on p.id = t.assignee_id
  where t.legacy_id is not null)
select
  count(*) as total,
  count(*) filter (where norm_title(legacy->>'mainTitle') <> norm_title(gtitle)) as group_mismatch,
  count(*) filter (where coalesce(legacy->>'subTitle','') <> sub_title) as sub_mismatch,
  count(*) filter (where coalesce(nullif(legacy->>'title',''), sub_title) <> title) as title_mismatch,
  count(*) filter (where pname is null or position(pname in legacy->>'member') = 0) as member_mismatch,
  count(*) filter (where legacy->>'status' <> status) as status_mismatch,
  count(*) filter (where nullif(legacy->>'start','')::date is distinct from start_date) as start_mismatch,
  count(*) filter (where nullif(legacy->>'end','')::date is distinct from end_date) as end_mismatch,
  count(*) filter (where coalesce(legacy->>'note','') <> note) as note_mismatch,
  count(*) filter (where coalesce(legacy->>'blockNote','') <> block_note) as memo_mismatch,
  count(*) filter (where nullif(legacy->>'priority','')::smallint is distinct from priority) as prio_mismatch,
  count(*) filter (where nullif(legacy->>'kpiId','') is distinct from kpi_id) as kpi_mismatch,
  count(*) filter (where legacy->>'mainTitle' <> gtitle) as renamed_by_space_merge,
  count(distinct legacy->>'id') as distinct_legacy_ids
from t;
