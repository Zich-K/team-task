-- 병행 운영 기간: 30분마다 구글시트 → 새 DB 동기화 (시트는 읽기만).
-- 실사용 전환 시: select cron.unschedule('legacy-sync-30min'); 그리고 app_settings.legacy_sync_enabled = false
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'legacy-sync-30min',
  '*/30 * * * *',
  $$ select net.http_post(
       url := 'https://dmoeobuhhtvwggwqjmqo.supabase.co/functions/v1/legacy-sync',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         -- 공개(anon) 키. 함수 자체가 legacy_sync_enabled 설정으로 동작 여부를 막는다
         'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2VvYnVoaHR2d2dnd3FqbXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NTYzOTAsImV4cCI6MjEwNzQzMjM5MH0.QqTqaajqpPsrY9Uey8Y-QugJd4cIpytPePxpLuJpk9E'),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000) $$
);
