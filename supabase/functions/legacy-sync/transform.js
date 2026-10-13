// 구글시트(앱스크립트) 원본 → 새 DB 적재용 데이터 변환. Node 검증 스크립트와 Edge Function 이 함께 사용.
// 원본 값은 각 행의 legacy 에 그대로 보존한다.

export const LEGACY_API = 'https://script.google.com/macros/s/AKfycbz2XgY6Zyrdilu2vHGTSNMKcPLMUwX-D8DjHWuHKD-_Jg7pjAzwPHN3SXxCQwiUpUeoUA/exec';
export const LEGACY_ACTIONS = ['getAll', 'getUsers', 'getKpis', 'getReportSettings', 'getCalEvents'];
const LEAD_NAME = '김승현';

// DB 의 public.norm_title 과 같은 규칙
export const normTitle = s => String(s ?? '').toLowerCase().replace(/[\s_\-\[\]\(\)/·.,]/g, '');

// 기존 시스템에는 읽기(get*) 요청만 보낸다
export async function fetchLegacy(fetchImpl = fetch) {
  const raw = {};
  for (const action of LEGACY_ACTIONS) {
    const res = await fetchImpl(`${LEGACY_API}?action=${action}`, { redirect: 'follow' });
    raw[action] = JSON.parse((await res.text()).replace(/^﻿/, ''));
  }
  return raw;
}

// 'Thu Apr 30 2026 00:00:00 GMT+0900 (...)' 또는 '2026-04-30' → '2026-04-30' (한국 시간)
function toKstDate(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s.replace(/\s*\(.*\)$/, ''));
  if (isNaN(d)) return null;
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

// 등록일: 시트 createdAt 이 있으면 그 날 한국 0시, 없으면 업무 ID(T+밀리초)에서 복원
function createdAtOf(t) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(t.createdAt || '')) return `${t.createdAt}T00:00:00+09:00`;
  const m = /^T(\d{13})$/.exec(t.id || '');
  return m ? new Date(Number(m[1])).toISOString() : null;
}

const HOLIDAYS_LEGACY = [
  '2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01',
  '2025-05-05','2025-05-06','2025-05-15','2025-06-06','2025-08-15',
  '2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-12-25',
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01',
  '2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-08-16',
  '2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25',
];
const HOLIDAYS_2027 = [
  ['2027-01-01','신정'],['2027-02-06','설날 연휴'],['2027-02-07','설날'],['2027-02-08','설날 연휴'],['2027-02-09','대체공휴일(설날)'],
  ['2027-03-01','삼일절'],['2027-05-05','어린이날'],['2027-05-13','부처님오신날'],['2027-06-06','현충일'],
  ['2027-08-15','광복절'],['2027-08-16','대체공휴일(광복절)'],['2027-09-14','추석 연휴'],['2027-09-15','추석'],['2027-09-16','추석 연휴'],
  ['2027-10-03','개천절'],['2027-10-04','대체공휴일(개천절)'],['2027-10-09','한글날'],['2027-10-11','대체공휴일(한글날)'],
  ['2027-12-25','성탄절'],['2027-12-27','대체공휴일(성탄절)'],
];

export function buildPayload(raw) {
  const tasks = raw.getAll.tasks || [];
  const users = raw.getUsers.users || [];
  const kpis = raw.getKpis.kpis || [];
  const events = raw.getCalEvents.events || [];
  const userByName = name => users.find(u => name && String(name).includes(u.name)) || null;
  const problems = [];

  // 메인 업무 묶음: 띄어쓰기 등만 다른 이름은 하나로. 대표 이름은 가장 많이 쓰인 표기.
  const groups = new Map();
  for (const t of tasks) {
    const title = String(t.mainTitle || t.title || '미분류').trim();
    const key = normTitle(title);
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(title, (groups.get(key).get(title) || 0) + 1);
  }
  const groupRows = [...groups].map(([key, variants]) => ({
    key,
    title: [...variants].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    variants: Object.fromEntries(variants),
  }));

  const profileRows = users.map((u, i) => ({
    legacy_id: u.id, name: u.name, color: u.color || 'blue',
    role: u.name === LEAD_NAME ? 'lead' : 'member', sort_order: i,
  }));

  const kpiRows = kpis.map((k, i) => ({
    id: k.id, category: k.category || '기타', title: k.title, owner_text: k.owner || '',
    period: k.period || '연간', note: k.note || '', sort_order: i, legacy: k,
  }));
  const kpiOwnerRows = kpis.flatMap(k => {
    const owner = k.owner || '';
    const owners = owner.includes('공통') ? users : users.filter(u => owner.includes(u.name));
    return owners.map(u => ({ kpi_id: k.id, legacy_user_id: u.id }));
  });

  const taskRows = tasks.map(t => {
    const u = userByName(t.member);
    if (!u) problems.push(`담당자 매칭 실패: ${t.id} "${t.member}"`);
    if (t.kpiId && !kpis.some(k => k.id === t.kpiId)) problems.push(`없는 KPI: ${t.id} ${t.kpiId}`);
    const created = createdAtOf(t);
    if (!created) problems.push(`등록일 복원 실패: ${t.id}`);
    return {
      legacy_id: t.id,
      group_key: normTitle(String(t.mainTitle || t.title || '미분류').trim()),
      sub_title: t.subTitle || '',
      title: t.title || t.subTitle || t.mainTitle || '',
      legacy_user_id: u ? u.id : null,
      status: t.status || '예정',
      start_date: t.start || null,
      end_date: t.end || null,
      note: t.note || '',
      block_note: t.blockNote || '',
      priority: /^[123]$/.test(String(t.priority)) ? Number(t.priority) : null,
      kpi_id: t.kpiId || null,
      created_at: created,
      legacy: t,
    };
  });

  const calRows = events.map(e => ({
    type: ['leave', 'meeting'].includes(e.type) ? e.type : 'etc',
    title: e.title, event_date: toKstDate(e.date), event_time: e.time || '',
    legacy_user_id: (userByName(e.who) || {}).id || null,
    created_at: toKstDate(e.createdAt) ? `${toKstDate(e.createdAt)}T00:00:00+09:00` : null,
    legacy: e,
  }));

  let reportSettings = {};
  try { reportSettings = JSON.parse(raw.getReportSettings.data || '{}'); } catch { problems.push('주간리포트 설정 해석 실패'); }

  const holidayRows = [
    ...HOLIDAYS_LEGACY.map(day => ({ day, name: '' })),
    ...HOLIDAYS_2027.map(([day, name]) => ({ day, name })),
  ];

  return { groupRows, profileRows, kpiRows, kpiOwnerRows, taskRows, calRows, reportSettings, holidayRows, problems };
}
