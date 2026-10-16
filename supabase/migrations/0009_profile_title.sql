-- 화면에 보이는 직책 (권한과 별개). 실장·팀장은 관리 권한(role = 'lead'), 팀원은 일반 권한
alter table public.profiles add column title text check (title in ('팀원', '팀장', '실장'));
update public.profiles set title = case when role = 'lead' then '팀장' else '팀원' end where title is null;
