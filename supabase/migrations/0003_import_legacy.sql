-- 구글시트 데이터 적재 (legacy-sync Edge Function 전용). 몇 번 실행해도 같은 결과.
create or replace function public.import_legacy(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  changed int;
begin
  insert into public.profiles (legacy_id, name, color, role, sort_order)
  select legacy_id, name, color, role, sort_order
    from jsonb_to_recordset(payload->'profileRows') as x(legacy_id text, name text, color text, role text, sort_order int)
  on conflict (legacy_id) do update set name = excluded.name, color = excluded.color;

  insert into public.task_groups (title)
  select title from jsonb_to_recordset(payload->'groupRows') as x(key text, title text)
  on conflict (norm_key) where merged_into is null do nothing;

  insert into public.kpis (id, category, title, owner_text, period, note, sort_order, legacy)
  select id, category, title, owner_text, period, note, sort_order, legacy
    from jsonb_to_recordset(payload->'kpiRows')
      as x(id text, category text, title text, owner_text text, period text, note text, sort_order int, legacy jsonb)
  on conflict (id) do update set category = excluded.category, title = excluded.title, owner_text = excluded.owner_text,
    period = excluded.period, note = excluded.note, legacy = excluded.legacy;

  insert into public.kpi_owners (kpi_id, profile_id)
  select x.kpi_id, p.id from jsonb_to_recordset(payload->'kpiOwnerRows') as x(kpi_id text, legacy_user_id text)
    join public.profiles p on p.legacy_id = x.legacy_user_id
  on conflict do nothing;

  insert into public.tasks (legacy_id, group_id, sub_title, title, assignee_id, status, start_date, end_date,
                            note, block_note, priority, kpi_id, created_at, updated_at, legacy)
  select x.legacy_id, coalesce(g.merged_into, g.id), x.sub_title, x.title, p.id, x.status, x.start_date, x.end_date,
         x.note, x.block_note, x.priority, x.kpi_id, x.created_at, x.created_at, x.legacy
    from jsonb_to_recordset(payload->'taskRows') as x(legacy_id text, group_key text, sub_title text, title text,
         legacy_user_id text, status text, start_date date, end_date date, note text, block_note text,
         priority smallint, kpi_id text, created_at timestamptz, legacy jsonb)
    join public.task_groups g on g.norm_key = x.group_key and g.merged_into is null
    left join public.profiles p on p.legacy_id = x.legacy_user_id
  on conflict (legacy_id) do update set
    sub_title = excluded.sub_title, title = excluded.title, assignee_id = excluded.assignee_id, status = excluded.status,
    start_date = excluded.start_date, end_date = excluded.end_date, note = excluded.note, block_note = excluded.block_note,
    priority = excluded.priority, kpi_id = excluded.kpi_id, legacy = excluded.legacy
    where tasks.legacy is distinct from excluded.legacy;
  get diagnostics changed = row_count;

  insert into public.calendar_events (type, title, event_date, event_time, profile_id, created_at, legacy)
  select x.type, x.title, x.event_date, x.event_time, p.id, coalesce(x.created_at, now()), x.legacy
    from jsonb_to_recordset(payload->'calRows') as x(type text, title text, event_date date, event_time text,
         legacy_user_id text, created_at timestamptz, legacy jsonb)
    left join public.profiles p on p.legacy_id = x.legacy_user_id
   where not exists (select 1 from public.calendar_events c where c.legacy = x.legacy);

  insert into public.app_settings (key, value) values ('report_settings', payload->'reportSettings')
  on conflict (key) do update set value = excluded.value;

  insert into public.holidays (day, name)
  select day, name from jsonb_to_recordset(payload->'holidayRows') as x(day date, name text)
  on conflict (day) do nothing;

  return jsonb_build_object(
    'tasks_changed', changed,
    'tasks_total', (select count(*) from public.tasks where legacy_id is not null),
    'groups', (select count(*) from public.task_groups where merged_into is null),
    'kpis', (select count(*) from public.kpis),
    'events', (select count(*) from public.calendar_events),
    'synced_at', now());
end $$;

revoke execute on function public.import_legacy(jsonb) from public, anon, authenticated;
grant execute on function public.import_legacy(jsonb) to service_role;

insert into public.app_settings (key, value) values ('legacy_sync_enabled', 'true'::jsonb)
on conflict (key) do nothing;
