// 가상 데이터 (?demo). 실제 팀원·업무와 무관한 예시. 저장은 브라우저 메모리에서만.
import type { Backend, TaskInput } from './backend';
import type { AppData, Task, TaskGroup, Kpi, Profile, Evaluation, EvaluationItem } from './types';
import { addDays, getMonday, normTitle, toISODate } from './logic';

let seq = 1;
const uid = () => `demo-${seq++}`;

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

const KPI_BASE: Kpi = {
  id: '', year: 2026, category: '', title: '', owner_text: '', period: '연간', note: '', sort_order: 0, active: true,
  status: 'approved', measure: '', target: '', weight: null, created_by: null, lead_comment: '', submitted_at: null, approved_at: null,
};

function makeData(): AppData & { evaluations: Evaluation[]; items: EvaluationItem[] } {
  const profiles: Profile[] = [
    { id: 'p1', name: '박지훈', email: 'lead@example.com', role: 'lead', color: 'purple', sort_order: 0, active: true, auth_user_id: 'demo' },
    { id: 'p2', name: '이수진', email: null, role: 'member', color: 'blue', sort_order: 1, active: true, auth_user_id: null },
    { id: 'p3', name: '최도윤', email: null, role: 'member', color: 'pink', sort_order: 2, active: true, auth_user_id: null },
  ];
  const kpis: Kpi[] = [
    ['K1', '인재육성', '관리회계 실무 역량 강화', '주니어(이수진,최도윤)'],
    ['K2', '인재육성', '장기 프로젝트 기획~운영 리딩', '공통'],
    ['K3', '인재육성', '부문별 분석 전문가 - A부문', '박지훈'],
    ['K4', '인재육성', '부문별 분석 전문가 - B부문', '최도윤'],
    ['K5', '인재육성', '부문별 분석 전문가 - C부문', '이수진'],
    ['K6', '프로세스개선', '유관부서 연계 프로세스 개선', '박지훈'],
    ['K7', '프로세스개선', '담당 조직 고충 취합 및 시스템 개선', '주니어(이수진,최도윤)'],
    ['K8', '장기프로젝트', '매입-매출-재고 모니터링 체계 구축', '공통'],
    ['K9', '장기프로젝트', '고객 활동 데이터화 프로젝트', '공통'],
    ['K10', '장기프로젝트', '주요 지표 분석 자동화 도구 개발', '공통'],
  ].map(([id, category, title, owner_text], i) => ({ ...KPI_BASE, id, category, title, owner_text, sort_order: i }));
  // 팀원이 작성해 제출한 개인 KPI 예시
  kpis.push(
    { ...KPI_BASE, id: 'P1', category: '프로세스개선', title: '월마감 리드타임 단축', owner_text: '이수진', sort_order: 10, status: 'submitted', created_by: 'p2',
      measure: '마감 시작~확정까지 영업일 수', target: '평균 5일 → 3일', weight: 30, submitted_at: new Date().toISOString() },
    { ...KPI_BASE, id: 'P2', category: '인재육성', title: '데이터 분석 자격 취득', owner_text: '최도윤', sort_order: 11, status: 'draft', created_by: 'p3',
      measure: '자격 취득 여부', target: '하반기 내 1개', weight: 10 },
  );
  const kpiOwners = kpis.flatMap(k => profiles
    .filter(p => k.owner_text.includes('공통') || k.owner_text.includes(p.name))
    .map(p => ({ kpi_id: k.id, profile_id: p.id })));

  const groupTitles = [
    '월간 손익마감', '월간 성과분석회의', '데이터 분석 [부문별 트렌드]', '분석 자동화 도구 [매출속보]',
    '프로세스 개선 [거래처 대시보드]', 'KPI 운영', '포상 운영', '신규입사자 교육', '재고리스크위원회',
    '경영포럼', '경영 포럼', '26년 9월 손익마감', '26년 9월 손익 마감',
  ];
  const groups: TaskGroup[] = groupTitles.map(title => ({ id: uid(), title, norm_key: normTitle(title), merged_into: null, kpi_id: null }));
  // 실제와 같이 띄어쓰기만 다른 묶음은 하나로 합쳐 둔 상태로 시작
  const seen = new Map<string, TaskGroup>();
  const live = groups.filter(g => (seen.has(g.norm_key) ? false : (seen.set(g.norm_key, g), true)));

  const subs: Record<string, [string, string | null][]> = {
    '월간 손익마감': [['A법인 월간 손익마감 진행', 'K1'], ['B법인 월간 손익마감 진행', 'K1'], ['손익 대사 작업', null]],
    '월간 성과분석회의': [['성과분석회의 자료 준비', null], ['회의록 정리 및 공유', null]],
    '데이터 분석 [부문별 트렌드]': [['부문별 트렌드 분석 자료 제작', 'K5'], ['A부문 매출 추이 분석', 'K3'], ['B부문 재고 회전 분석', 'K4']],
    '분석 자동화 도구 [매출속보]': [['화면 구상', 'K10'], ['반품 로직 추가', 'K10'], ['엑셀 내보내기 기능', 'K10']],
    '프로세스 개선 [거래처 대시보드]': [['대시보드 기획', 'K9'], ['화면 검수 및 추가 요청', 'K9']],
    'KPI 운영': [['분기 KPI 실적 반영', 'K2'], ['목표 조정 협의', null], ['KPI 리뷰 자료', 'K2']],
    '포상 운영': [['월간 포상 장표 제작', null], ['분기 포상 수상자 선정', null]],
    '신규입사자 교육': [['교육 자료 업데이트', 'K1'], ['교육 진행', null]],
    '재고리스크위원회': [['위원회 안건 정리', 'K8'], ['장기재고 현황 보고', 'K8']],
    '경영포럼': [['포럼 발표 자료', null]],
    '26년 9월 손익마감': [['A법인 9월 손익마감', 'K1'], ['B법인 9월 손익마감', 'K1']],
  };

  const r = rng(7);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tasks: Task[] = [];
  const base = new Date(today.getFullYear(), 0, 5);
  for (let m = 0; m <= today.getMonth(); m++) {
    for (const g of live) {
      const list = subs[g.title] || [];
      for (const [sub, kpi] of list) {
        if (r() < 0.45) continue;
        const start = addDays(base, m * 30 + Math.floor(r() * 20));
        if (start > addDays(today, 10)) continue;
        const end = addDays(start, 1 + Math.floor(r() * 9));
        const owner = profiles[Math.floor(r() * 3)];
        const past = end < today;
        const status = past ? (r() < 0.93 ? '완료' : '진행 중') : (start <= today ? '진행 중' : '예정');
        const created = addDays(start, -1).toISOString();
        tasks.push({
          id: uid(), legacy_id: null, group_id: g.id, sub_title: sub, title: sub,
          assignee_id: owner.id, status, start_date: toISODate(start), end_date: toISODate(end),
          note: r() < 0.2 ? '1차 검토 완료' : '', block_note: r() < 0.1 ? '자료 회신 대기' : '',
          priority: status === '완료' ? 2 : 1 + Math.floor(r() * 3), kpi_id: kpi && r() < 0.8 ? kpi : null,
          completed_at: null, created_at: created, updated_at: created, deleted_at: null,
        });
      }
    }
  }
  // 3주 이상 진행 중인 예시
  const mon = getMonday(today);
  tasks.push({
    id: uid(), legacy_id: null, group_id: live[8].id, sub_title: '장기재고 처리 방안 수립', title: '장기재고 처리 방안 수립',
    assignee_id: 'p2', status: '진행 중', start_date: toISODate(addDays(mon, -28)), end_date: toISODate(addDays(mon, 3)),
    note: '부서 회신 대기', block_note: '', priority: 1, kpi_id: 'K8', completed_at: null,
    created_at: addDays(mon, -29).toISOString(), updated_at: addDays(mon, -29).toISOString(), deleted_at: null,
  });

  // 실제 DB 와 같은 규칙: 연결된 업무가 모두 같은 KPI 인 묶음은 그 KPI 를 기본값으로
  live.forEach(g => {
    const ks = new Set(tasks.filter(t => t.group_id === g.id && t.kpi_id).map(t => t.kpi_id));
    if (ks.size === 1) g.kpi_id = [...ks][0];
  });

  return {
    profiles, groups: live, kpis, kpiOwners, tasks, events: [],
    holidays: ['2026-10-03', '2026-10-09', '2026-12-25'],
    reportSettings: { last: {}, this: {} },
    reviews: [{ kpi_id: 'K5', profile_id: 'p2', year: 2026, period: 'Q3', self_grade: '우수',
      achievement: 'C부문 월별 트렌드 분석 자료를 매달 제때 공유했고, 9월에는 재고 회전 분석을 추가로 진행함.' }],
    evaluations: [], items: [],
  };
}

const db = makeData();
const now = () => new Date().toISOString();

export const demoBackend: Backend = {
  async loadAll() {
    const { evaluations: _e, items: _i, ...rest } = db;
    return structuredClone(rest);
  },
  async saveTask(input: TaskInput) {
    if (input.id) {
      const t = db.tasks.find(x => x.id === input.id)!;
      Object.assign(t, input, { updated_at: now() });
      if (input.status === '완료' && !t.completed_at) t.completed_at = now();
      return structuredClone(t);
    }
    const t: Task = {
      id: uid(), legacy_id: null, sub_title: '', title: '', assignee_id: null, status: '예정', start_date: null,
      end_date: null, note: '', block_note: '', priority: 2, kpi_id: null, completed_at: null,
      created_at: now(), updated_at: now(), deleted_at: null, ...input,
    };
    db.tasks.push(t);
    return structuredClone(t);
  },
  async insertTasks(inputs) {
    const out: Task[] = [];
    for (const i of inputs) out.push(await demoBackend.saveTask(i));
    return out;
  },
  async deleteTask(id) {
    const t = db.tasks.find(x => x.id === id);
    if (t) t.deleted_at = now();
  },
  async createGroup(title) {
    const key = normTitle(title);
    const ex = db.groups.find(g => g.norm_key === key && !g.merged_into);
    if (ex) return ex;
    const g: TaskGroup = { id: uid(), title: title.trim(), norm_key: key, merged_into: null, kpi_id: null };
    db.groups.push(g);
    return g;
  },
  async renameGroup(id, title) {
    const g = db.groups.find(x => x.id === id)!;
    g.title = title.trim(); g.norm_key = normTitle(title);
  },
  async mergeGroups(source, target) {
    db.tasks.forEach(t => { if (t.group_id === source) t.group_id = target; });
    db.groups = db.groups.filter(g => g.id !== source);
  },
  async setGroupKpi(groupId, kpiId, fillEmpty) {
    db.groups.find(g => g.id === groupId)!.kpi_id = kpiId;
    if (fillEmpty && kpiId) db.tasks.forEach(t => { if (t.group_id === groupId && !t.kpi_id && !t.deleted_at) t.kpi_id = kpiId; });
  },
  async linkTasks(taskIds, kpiId) {
    db.tasks.forEach(t => { if (taskIds.includes(t.id) && !t.kpi_id) t.kpi_id = kpiId; });
  },
  async saveReportSettings(s) { db.reportSettings = structuredClone(s); },
  async saveKpi(k, ownerIds) {
    const i = db.kpis.findIndex(x => x.id === k.id);
    if (i >= 0) db.kpis[i] = k; else db.kpis.push(k);
    db.kpiOwners = db.kpiOwners.filter(o => o.kpi_id !== k.id).concat(ownerIds.map(profile_id => ({ kpi_id: k.id, profile_id })));
  },
  async saveMyKpi(k, meId, _asLead) {
    if (k.id) { Object.assign(db.kpis.find(x => x.id === k.id)!, k); return; }
    const id = `P${db.kpis.filter(x => x.id.startsWith('P')).length + 1}`;
    const me = db.profiles.find(p => p.id === meId)!;
    db.kpis.push({ ...KPI_BASE, sort_order: db.kpis.length, ...k, id, created_by: meId, owner_text: me.name });
    db.kpiOwners.push({ kpi_id: id, profile_id: meId });
  },
  async decideKpi(id, status, comment) { Object.assign(db.kpis.find(x => x.id === id)!, { status, lead_comment: comment }); },
  async saveReview(r) {
    db.reviews = db.reviews.filter(x => !(x.kpi_id === r.kpi_id && x.profile_id === r.profile_id && x.year === r.year && x.period === r.period));
    db.reviews.push({ ...r, updated_at: now() });
  },
  async saveProfile(p) {
    const cur = db.profiles.find(x => x.id === p.id)!;
    const next = { ...cur, ...p };
    if (cur.role === 'lead' && cur.active && (next.role !== 'lead' || !next.active)
      && !db.profiles.some(x => x.id !== cur.id && x.role === 'lead' && x.active)) {
      throw new Error('팀장이 최소 1명은 있어야 합니다. 다른 사람을 먼저 팀장으로 지정하세요');
    }
    Object.assign(cur, p);
  },
  async addProfile(p) {
    db.profiles.push({ id: uid(), auth_user_id: null, active: true, sort_order: db.profiles.length, ...p });
  },
  async resetLogin(profileId) { db.profiles.find(x => x.id === profileId)!.auth_user_id = null; },
  async listEvaluations() { return structuredClone({ evaluations: db.evaluations, items: db.items }); },
  async saveEvaluation(e, items) {
    let ev = db.evaluations.find(x => x.profile_id === e.profile_id && x.year === e.year && x.period === e.period);
    if (!ev) {
      ev = { id: uid(), overall_grade: null, overall_comment: '', evidence: null, ai_summary: null, status: 'draft', released_at: null, updated_at: now(), ...e };
      db.evaluations.push(ev);
    } else Object.assign(ev, e, { updated_at: now() });
    db.items = db.items.filter(i => i.evaluation_id !== ev!.id).concat(items.map(i => ({ ...i, evaluation_id: ev!.id })));
    return structuredClone(ev);
  },
  async taskHistory() { return []; },
};

export const DEMO_PROFILE_ID = 'p1';
