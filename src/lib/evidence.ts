// 평가 근거 자료 만들기: 기간 내(마감일 기준) 업무를 KPI 연계 / 일상 업무로 나눠 번호를 붙인다.
import type { EvalPeriod, Kpi, KpiOwner, Profile, TaskView } from './types';
import { isLongRunning, parseDate } from './logic';

export const PERIODS: [EvalPeriod, string][] = [['Q1', '1분기'], ['Q2', '2분기'], ['Q3', '3분기'], ['Q4', '4분기'], ['Y', '연간']];
/** 평가 등급 5단계 (높은 순) — 팀장 평가·자기평가 공통 */
export const GRADES = ['탁월+', '탁월', '우수', '미흡', '매우미흡'];

export function evalRange(year: number, period: EvalPeriod) {
  if (period === 'Y') return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
  const q = Number(period[1]);
  return { start: new Date(year, (q - 1) * 3, 1), end: new Date(year, q * 3, 0, 23, 59, 59, 999) };
}

export interface EvidenceTask {
  no: number; id: string; title: string; mainTitle: string; status: string;
  start: string | null; end: string | null; note: string; kpiId: string | null; late: boolean; longRun: boolean;
}
export interface Evidence {
  member: string; year: number; period: EvalPeriod; generatedAt: string;
  stats: {
    total: number; done: number; doneRate: number; inProgress: number; overdue: number; longRunning: number;
    kpiLinked: number; kpiRate: number; teamAvgTotal: number; teamAvgDoneRate: number;
  };
  kpis: { kpi: Pick<Kpi, 'id' | 'category' | 'title'>; owned: boolean; tasks: EvidenceTask[]; done: number }[];
  routine: { mainTitle: string; tasks: EvidenceTask[] }[];
  missingKpis: Pick<Kpi, 'id' | 'title'>[];
}

export function buildEvidence(views: TaskView[], kpis: Kpi[], owners: KpiOwner[], profiles: Profile[],
  memberId: string, year: number, period: EvalPeriod): Evidence {
  const { start, end } = evalRange(year, period);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inRange = (t: TaskView) => { const d = parseDate(t.end_date); return !!d && d >= start && d <= end; };
  const all = views.filter(inRange);
  const mine = all.filter(t => t.assignee_id === memberId).sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''));

  let no = 0;
  const ev = (t: TaskView): EvidenceTask => ({
    no: ++no, id: t.id, title: t.title || t.sub_title || t.mainTitle, mainTitle: t.mainTitle, status: t.status,
    start: t.start_date, end: t.end_date, note: t.note, kpiId: t.kpi_id,
    late: t.status !== '완료' && parseDate(t.end_date)! < today, longRun: isLongRunning(t),
  });

  const owned = new Set(owners.filter(o => o.profile_id === memberId).map(o => o.kpi_id));
  const usedKpis = kpis.filter(k => owned.has(k.id) || mine.some(t => t.kpi_id === k.id));
  const kpiSections = usedKpis.map(k => {
    const tasks = mine.filter(t => t.kpi_id === k.id).map(ev);
    return { kpi: { id: k.id, category: k.category, title: k.title }, owned: owned.has(k.id), tasks, done: tasks.filter(t => t.status === '완료').length };
  });
  const routineMap = new Map<string, EvidenceTask[]>();
  mine.filter(t => !t.kpi_id || !kpis.some(k => k.id === t.kpi_id)).forEach(t => {
    routineMap.set(t.mainTitle, [...(routineMap.get(t.mainTitle) || []), ev(t)]);
  });

  const done = mine.filter(t => t.status === '완료').length;
  const linked = mine.filter(t => t.kpi_id).length;
  const active = profiles.filter(p => p.active);
  const per = active.map(p => {
    const ts = all.filter(t => t.assignee_id === p.id);
    return { n: ts.length, rate: ts.length ? ts.filter(t => t.status === '완료').length / ts.length : 0 };
  });

  return {
    member: profiles.find(p => p.id === memberId)?.name || '', year, period, generatedAt: new Date().toISOString(),
    stats: {
      total: mine.length, done, doneRate: mine.length ? Math.round(done / mine.length * 100) : 0,
      inProgress: mine.filter(t => t.status === '진행 중').length,
      overdue: mine.filter(t => t.status !== '완료' && parseDate(t.end_date)! < today).length,
      longRunning: mine.filter(t => isLongRunning(t)).length,
      kpiLinked: linked, kpiRate: mine.length ? Math.round(linked / mine.length * 100) : 0,
      teamAvgTotal: per.length ? Math.round(per.reduce((s, x) => s + x.n, 0) / per.length * 10) / 10 : 0,
      teamAvgDoneRate: per.length ? Math.round(per.reduce((s, x) => s + x.rate, 0) / per.length * 100) : 0,
    },
    kpis: kpiSections,
    routine: [...routineMap].map(([mainTitle, tasks]) => ({ mainTitle, tasks })),
    missingKpis: kpiSections.filter(s => s.owned && !s.tasks.length).map(s => ({ id: s.kpi.id, title: s.kpi.title })),
  };
}

/** AI 에 보낼 때 쓰는 간단한 글 형태 */
export function evidenceToText(e: Evidence): string {
  const L: string[] = [];
  L.push(`대상: ${e.member} / ${e.year}년 ${PERIODS.find(p => p[0] === e.period)?.[1]} (마감일 기준)`);
  const s = e.stats;
  L.push(`업무 ${s.total}건, 완료 ${s.done}건(${s.doneRate}%), 진행 중 ${s.inProgress}, 지연 ${s.overdue}, 3주 이상 장기 ${s.longRunning}, KPI 연계 ${s.kpiLinked}건(${s.kpiRate}%). 팀 평균: 업무 ${s.teamAvgTotal}건, 완료율 ${s.teamAvgDoneRate}%`);
  L.push('\n[KPI 연계 업무]');
  e.kpis.forEach(k => {
    L.push(`- ${k.kpi.id} ${k.kpi.title} (${k.kpi.category}${k.owned ? ', 본인 KPI' : ''}) — ${k.done}/${k.tasks.length}건 완료`);
    k.tasks.forEach(t => L.push(`  ${t.no}. ${t.title} [${t.mainTitle}] ${t.start || ''}~${t.end || ''} ${t.status}${t.late ? ' (지연)' : ''}${t.note ? ' / ' + t.note : ''}`));
  });
  L.push('\n[일상 업무 (KPI 미연결)]');
  e.routine.forEach(g => {
    L.push(`- ${g.mainTitle}`);
    g.tasks.forEach(t => L.push(`  ${t.no}. ${t.title} ${t.start || ''}~${t.end || ''} ${t.status}${t.late ? ' (지연)' : ''}${t.note ? ' / ' + t.note : ''}`));
  });
  return L.join('\n');
}
