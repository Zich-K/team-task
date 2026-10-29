-- 회의록 메일 알림: 회의록이 등록(최종 저장)되면 팀원 전원에게 메일을 보낸다.
--
-- 회사 메일(noreply@)을 보내는 앱 정보는 MDD 프로젝트에만 있어서, 메일은 MDD 의 mail-relay 함수를
-- 거쳐 나간다. 그 열쇠는 private_settings.mail_relay_token 에 둔다 (저장소에는 남기지 않는다).
--
-- 흐름: 회의록이 최종 저장되는 순간 meeting_mails 에 한 줄 쌓고 meeting-mail 함수를 바로 부른다.
-- 함수는 10초 기다렸다가(할 일이 이어서 저장되므로) 회의록·할 일을 읽어 보낸다.
-- 즉시 호출이 실패해도 5분마다 도는 예약 작업이 이어서 보낸다.
--  - 임시 저장(draft)은 보내지 않는다. 임시 저장했던 회의록을 최종 저장하면 그때 보낸다.
--  - 이미 등록된 회의록을 고쳐 저장할 때는 보내지 않는다.
--  - 받는 사람: 사용 중(active)인 팀원 전원, 등록한 본인은 제외.

create table public.private_settings (
  key text primary key,
  value text not null
);
alter table public.private_settings enable row level security;
revoke all on public.private_settings from anon, authenticated;

create table public.meeting_mails (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  recipients text[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index meeting_mails_open on public.meeting_mails (created_at) where status in ('pending', 'sending');
alter table public.meeting_mails enable row level security;
revoke all on public.meeting_mails from anon, authenticated;

create or replace function public.meetings_enqueue_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'final' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'final') then
    insert into public.meeting_mails (meeting_id, actor_id) values (new.id, new.updated_by);
    begin
      perform net.http_post(
        url := 'https://dmoeobuhhtvwggwqjmqo.supabase.co/functions/v1/meeting-mail?kick=1',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          -- 공개(anon) 키
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2VvYnVoaHR2d2dnd3FqbXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NTYzOTAsImV4cCI6MjEwNzQzMjM5MH0.QqTqaajqpPsrY9Uey8Y-QugJd4cIpytPePxpLuJpk9E'),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000);
    exception when others then
      -- 바로 부르지 못해도 5분 예약 작업이 보낸다. 회의록 저장은 그대로 둔다.
      raise warning 'meeting-mail 호출 실패: %', sqlerrm;
    end;
  end if;
  return null;
end $$;
revoke execute on function public.meetings_enqueue_mail() from public, anon, authenticated;

create trigger meetings_enqueue_mail after insert or update of status on public.meetings
  for each row execute function public.meetings_enqueue_mail();

-- 보낼 메일을 'sending' 으로 잡는다 — 즉시 호출과 예약 작업이 겹쳐도 두 번 보내지 않는다.
-- 중간에 멈춰 10분 넘게 'sending' 인 것은 다시 잡는다.
create or replace function public.claim_meeting_mails() returns setof public.meeting_mails
language plpgsql security definer set search_path = public as $$
begin
  update public.meeting_mails set status = 'pending', claimed_at = null
  where status = 'sending' and claimed_at < now() - interval '10 minutes';

  return query
  update public.meeting_mails m set status = 'sending', claimed_at = now()
  where m.id in (
    select p.id from public.meeting_mails p
    where p.status = 'pending'
    order by p.created_at
    limit 20
    for update skip locked
  )
  returning m.*;
end $$;
revoke execute on function public.claim_meeting_mails() from public, anon, authenticated;
grant execute on function public.claim_meeting_mails() to service_role;

select cron.schedule(
  'meeting-mail-5min',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://dmoeobuhhtvwggwqjmqo.supabase.co/functions/v1/meeting-mail',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2VvYnVoaHR2d2dnd3FqbXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NTYzOTAsImV4cCI6MjEwNzQzMjM5MH0.QqTqaajqpPsrY9Uey8Y-QugJd4cIpytPePxpLuJpk9E'),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000) $$
);
