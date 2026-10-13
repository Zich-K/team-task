// 평가 근거 AI 분석 (팀장 전용). 점수는 매기지 않고 근거 정리만 한다.
// 필요한 비밀값: ANTHROPIC_API_KEY (Supabase 대시보드 > Edge Functions > Secrets 에서 등록)
// 호출자가 팀장인지는 호출자 토큰으로 is_lead() 를 물어 확인한다 (토큰 검증은 DB API 가 수행).
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const SYSTEM = `당신은 팀장의 분기·연간 인사평가를 돕는 분석 보조자입니다.
팀원 한 명의 기간 내 업무 목록(번호가 붙어 있음)과 팀 KPI 목록을 받습니다.
등급이나 점수는 절대 매기지 마세요. 최종 평가는 팀장이 합니다. 당신의 일은 팀장이 판단할 근거를 정리하는 것입니다.

다음 순서로, 한국어로, 짧은 문장의 글머리표로 작성하세요. 주장마다 근거가 되는 업무 번호를 (3, 7번)처럼 붙이세요.
■ 요약 — 2~3문장. 업무량·완료율을 팀 평균과 비교.
■ KPI별 기여 — 본인 KPI 마다 기여 정도와 대표 업무 번호. 연결 업무가 없거나 적은 KPI 는 분명히 표시.
■ 잘한 점 — 최대 3개.
■ 보완할 점 — 최대 3개 (지연, 장기 진행, 반복 업무 쏠림 등 목록에서 확인되는 것만).
■ KPI 에 연결해볼 만한 일상 업무 — "번호 → KPI번호: 이유" 형식, 확실한 것만 최대 5개.
■ 팀장 확인 필요 — 목록만으로 판단하기 어려운 점.
목록에 없는 사실을 지어내지 마세요. 업무 제목만으로 성과의 질을 단정하지 마세요.`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') || '';
    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: auth } },
    });
    const { data: lead } = await db.rpc('is_lead');
    if (lead !== true) return json({ ok: false, error: '팀장만 사용할 수 있습니다' }, 403);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ ok: false, error: 'AI 연결 설정(ANTHROPIC_API_KEY)이 아직 등록되지 않았습니다' }, 503);

    const { text, kpis } = await req.json();
    if (!text || typeof text !== 'string') return json({ ok: false, error: '분석할 내용이 없습니다' }, 400);

    const client = new Anthropic({ apiKey });
    const kpiText = (kpis || []).map(k => `${k.id} [${k.category}] ${k.title}`).join('\n');
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `[팀 KPI 목록]\n${kpiText}\n\n[평가 대상 업무]\n${text}` }],
    });

    if (res.stop_reason === 'refusal') return json({ ok: false, error: 'AI 가 이 요청을 처리하지 못했습니다' }, 502);
    const out = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return json({ ok: true, text: out, model: res.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ ok: false, error: '요청이 많습니다. 잠시 후 다시 시도해 주세요' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ ok: false, error: 'AI 연결 키가 올바르지 않습니다' }, 502);
    if (e instanceof Anthropic.APIError) return json({ ok: false, error: `AI 오류 (${e.status})` }, 502);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
