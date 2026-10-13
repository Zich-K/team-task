// 팀장 전용: 팀원의 로그인 초기화 (비밀번호를 잊었을 때).
// 로그인 계정만 지우고 팀원 정보·업무·평가 기록은 그대로 둔다. 팀원은 '처음 사용하시나요?'로 비밀번호를 다시 만든다.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const caller = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const { data: lead } = await caller.rpc('is_lead');
    if (lead !== true) return json({ ok: false, error: '팀장만 사용할 수 있습니다' }, 403);
    const { data: myId } = await caller.rpc('current_profile_id');

    const { profileId } = await req.json();
    if (!profileId) return json({ ok: false, error: '대상이 없습니다' }, 400);
    if (profileId === myId) return json({ ok: false, error: '본인 로그인은 초기화할 수 없습니다' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: p } = await admin.from('profiles').select('auth_user_id').eq('id', profileId).maybeSingle();
    if (!p) return json({ ok: false, error: '팀원을 찾을 수 없습니다' }, 404);
    if (!p.auth_user_id) return json({ ok: true, note: '아직 가입하지 않은 팀원입니다' });

    // 계정을 지우면 profiles.auth_user_id 는 자동으로 비워진다 (on delete set null)
    const { error } = await admin.auth.admin.deleteUser(p.auth_user_id);
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
