// 구글시트 → 새 DB 동기화. 기존 시트에는 읽기만 한다.
// 실사용 전환 전까지 몇 번이고 다시 돌려 최신 시트 내용을 반영하는 용도.
// app_settings.legacy_sync_enabled 가 true 일 때만 동작 (전환 후에는 꺼서 새 데이터를 덮어쓰지 않게 함).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { fetchLegacy, buildPayload } from './transform.js';

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const { data: flag } = await db.from('app_settings').select('value').eq('key', 'legacy_sync_enabled').maybeSingle();
  if (!flag || flag.value !== true) return json({ ok: false, error: '동기화가 꺼져 있습니다' }, 403);

  try {
    const payload = buildPayload(await fetchLegacy());
    const { problems, ...rows } = payload;
    const { data, error } = await db.rpc('import_legacy', { payload: rows });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, problems, result: data });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
