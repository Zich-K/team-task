-- 팀원 관리: 활동 중인 팀장이 최소 1명은 남도록 막는다 (실수로 팀장 권한을 모두 잃는 것 방지)
create or replace function public.keep_one_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.role = 'lead' and old.active) and (new.role <> 'lead' or not new.active) then
    if not exists (select 1 from public.profiles where id <> old.id and role = 'lead' and active) then
      raise exception '팀장이 최소 1명은 있어야 합니다. 다른 사람을 먼저 팀장으로 지정하세요';
    end if;
  end if;
  return new;
end $$;
create trigger keep_one_lead before update on public.profiles
  for each row execute function public.keep_one_lead();
revoke execute on function public.keep_one_lead() from public, anon, authenticated;
