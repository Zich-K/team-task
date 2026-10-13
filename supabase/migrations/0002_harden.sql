-- 보안 점검 반영: 함수 실행 권한 최소화, 확장 기능 위치 이동
alter function public.norm_title(text) set search_path = public;

create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

revoke execute on function public.link_profile_on_signup() from public, anon, authenticated;
revoke execute on function public.tasks_touch() from public, anon, authenticated;
revoke execute on function public.tasks_log() from public, anon, authenticated;

revoke execute on function public.current_profile_id() from public, anon;
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.is_lead() from public, anon;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_lead() to authenticated;
