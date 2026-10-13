// 첫 로그인용 비밀번호 만들기. 팀원 명단(profiles)에 등록됐고 아직 가입하지 않은 이메일만 허용.
// 메일 발송 없이 바로 확인된 계정을 만든다 (가입 트리거가 명단과 연결).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  try {
    const { email, password } = await req.json();
    const mail = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ ok: false, error: '이메일 형식이 아닙니다' }, 400);
    if (String(password || '').length < 8) return json({ ok: false, error: '비밀번호는 8자 이상이어야 합니다' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: profile } = await admin.from('profiles').select('id, auth_user_id, active').ilike('email', mail).maybeSingle();
    if (!profile || !profile.active) return json({ ok: false, error: '팀원 명단에 없는 이메일입니다. 팀장에게 등록을 요청하세요' }, 403);
    if (profile.auth_user_id) return json({ ok: false, error: '이미 가입된 이메일입니다. 로그인해 주세요' }, 409);

    const { error } = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true });
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
