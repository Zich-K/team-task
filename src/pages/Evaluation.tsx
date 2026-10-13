import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import type { EvalPeriod, Evaluation as EvalRow, EvaluationItem } from '../lib/types';
import { buildEvidence, evidenceToText, GRADES, PERIODS, type Evidence, type EvidenceTask } from '../lib/evidence';
import { Metric, Seg, StatusBadge } from '../components/ui';
import { supabase, IS_DEMO } from '../lib/supabase';
import type { PageProps } from './Lists';

const periodLabel = (p: EvalPeriod) => PERIODS.find(x => x[0] === p)?.[1] || p;

export function Evaluation(props: PageProps) {
  const { isLead } = useApp();
  return isLead ? <LeadEvaluation {...props} /> : <MyEvaluations />;
}

function LeadEvaluation({ onEdit }: PageProps) {
  const { views, data, backend, toast, approvedKpis } = useApp();
  const now = new Date();
  const [member, setMember] = useState(data.profiles.find(p => p.role !== 'lead')?.id || data.profiles[0]?.id || '');
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState<EvalPeriod>(`Q${Math.floor(now.getMonth() / 3) + 1}` as EvalPeriod);
  const [saved, setSaved] = useState<{ evaluations: EvalRow[]; items: EvaluationItem[] }>({ evaluations: [], items: [] });
  const [grades, setGrades] = useState<Record<string, { grade: string | null; comment: string }>>({});
  const [overall, setOverall] = useState<{ grade: string | null; comment: string }>({ grade: null, comment: '' });
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const refresh = useCallback(async () => setSaved(await backend.listEvaluations()), [backend]);
  useEffect(() => { refresh(); }, [refresh]);

  const evidence = useMemo(() => buildEvidence(views, approvedKpis, data.kpiOwners, data.profiles, member, year, period),
    [views, data, member, year, period]);
  const reviews = data.reviews.filter(r => r.profile_id === member && r.year === year && r.period === period);
  const reviewText = reviews.length
    ? '\n\n[본인 실적·자기평가]\n' + reviews.map(r => `- ${r.kpi_id}${r.self_grade ? ` (자기평가 ${r.self_grade})` : ''}: ${r.achievement}`).join('\n')
    : '';
  const current = saved.evaluations.find(e => e.profile_id === member && e.year === year && e.period === period);

  useEffect(() => {
    const items = saved.items.filter(i => i.evaluation_id === current?.id);
    setGrades(Object.fromEntries(items.map(i => [i.kpi_id, { grade: i.grade, comment: i.comment }])));
    setOverall({ grade: current?.overall_grade || null, comment: current?.overall_comment || '' });
    setAi(current?.ai_summary || null);
  }, [current?.id, saved]);

  async function save(release?: boolean) {
    const status = release === undefined ? (current?.status || 'draft') : release ? 'released' : 'draft';
    await backend.saveEvaluation({
      profile_id: member, year, period, overall_grade: overall.grade, overall_comment: overall.comment,
      evidence, ai_summary: ai, status, released_at: status === 'released' ? new Date().toISOString() : null,
    }, Object.entries(grades).map(([kpi_id, v]) => ({ kpi_id, grade: v.grade, comment: v.comment })));
    await refresh();
    toast(release === true ? '✓ 본인에게 공개했습니다' : release === false ? '✓ 비공개로 바꿨습니다' : '✓ 저장되었습니다');
  }

  async function runAi() {
    setAiBusy(true);
    try {
      if (IS_DEMO) {
        await new Promise(r => setTimeout(r, 600));
        setAi(demoAi(evidence));
      } else {
        const { data: res, error } = await supabase.functions.invoke('ai-evidence', {
          body: { text: evidenceToText(evidence) + reviewText, kpis: approvedKpis.map(k => ({ id: k.id, category: k.category, title: k.title })) },
        });
        if (error || !res?.ok) throw new Error(res?.error || error?.message || '분석 실패');
        setAi(res.text);
      }
    } catch (e: any) {
      toast(String(e.message || e));
    } finally { setAiBusy(false); }
  }

  const ownedKpis = evidence.kpis.filter(k => k.owned);
  const s = evidence.stats;
  const taskRow = (t: EvidenceTask) => (
    <li key={t.id} className="ev-item">
      <span className="ev-no">{t.no}</span>
      <span>
        <a href="#" onClick={e => { e.preventDefault(); const v = views.find(x => x.id === t.id); if (v) onEdit(v); }} style={{ color: 'inherit', textDecoration: 'none' }}>{t.title}</a>
        <div className="ev-meta">{t.mainTitle} · {t.start?.slice(5) || ''}~{t.end?.slice(5) || ''}{t.note ? ` · ${t.note}` : ''}</div>
      </span>
      <span className="row" style={{ gap: 4 }}>
        {t.late && <span className="badge badge-red">지연</span>}
        {t.longRun && <span className="badge badge-soft">3주+</span>}
        <StatusBadge s={t.status as any} />
      </span>
    </li>
  );

  return (
    <>
      <div className="section-head">
        <select className="select select-sm" value={member} onChange={e => setMember(e.target.value)}>
          {data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select select-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <Seg value={period} onChange={setPeriod} options={PERIODS} />
        <span className="spacer" />
        {current && <span className={`badge ${current.status === 'released' ? 'badge-완료' : 'badge-soft'}`}>{current.status === 'released' ? '본인 공개됨' : '작성 중 (비공개)'}</span>}
      </div>

      <div className="metrics">
        <Metric label="기간 업무" value={s.total} sub={`팀 평균 ${s.teamAvgTotal}건`} />
        <Metric label="완료율" value={`${s.doneRate}%`} sub={`팀 평균 ${s.teamAvgDoneRate}%`} tone="green" />
        <Metric label="KPI 연계" value={`${s.kpiRate}%`} sub={`${s.kpiLinked}건 / ${s.total}건`} tone="blue" />
        <Metric label="지연 · 장기" value={`${s.overdue} · ${s.longRunning}`} sub="지연 / 3주 이상" tone="red" />
      </div>

      <div className="two-col">
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><span className="card-title">근거 ① KPI 연계 업무</span><span className="card-sub">1~{s.kpiLinked}번</span></div>
            <div className="card-pad">
              {evidence.missingKpis.length > 0 && <div className="callout warn" style={{ marginBottom: 12 }}>
                이 기간 연결된 업무가 없는 담당 KPI: {evidence.missingKpis.map(k => `${k.id} ${k.title}`).join(', ')}</div>}
              {evidence.kpis.map(k => (
                <div key={k.kpi.id} style={{ marginBottom: 14 }}>
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span className="badge badge-kpi">{k.kpi.id}</span><b style={{ fontSize: 13 }}>{k.kpi.title}</b>
                    <span className="spacer" /><span className="small muted">{k.done}/{k.tasks.length}건 완료</span>
                  </div>
                  {k.tasks.length ? <ul className="ev-list">{k.tasks.map(taskRow)}</ul> : <div className="small muted" style={{ padding: '4px 0 0 44px' }}>연결 업무 없음</div>}
                </div>
              ))}
              {!evidence.kpis.length && <div className="empty">담당 KPI 가 없습니다</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">근거 ② 일상 업무</span>
              <span className="card-sub">{s.total > s.kpiLinked ? `${s.kpiLinked + 1}~${s.total}번` : '없음'}</span></div>
            <div className="card-pad">
              {evidence.routine.map(g => (
                <div key={g.mainTitle} style={{ marginBottom: 12 }}>
                  <div className="small" style={{ fontWeight: 700, marginBottom: 2 }}>{g.mainTitle}</div>
                  <ul className="ev-list">{g.tasks.map(taskRow)}</ul>
                </div>
              ))}
              {!evidence.routine.length && <div className="empty">일상 업무가 없습니다</div>}
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><span className="card-title">AI 분석 의견</span><span className="spacer" />
              <button className="btn btn-sm" onClick={runAi} disabled={aiBusy || !s.total}>{aiBusy ? '분석 중…' : ai ? '다시 분석' : '근거 분석 요청'}</button></div>
            <div className="card-pad">
              {ai ? <div className="ai-box">{ai}</div>
                : <div className="small muted">업무 목록 전체를 읽고 KPI 기여도, 잘한 점, 보완점, KPI 에 연결하면 좋을 일상 업무 등을 정리해 드립니다. 점수는 팀장님이 매깁니다.</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">평가 입력</span><span className="card-sub">팀장 작성 · 공개 전에는 본인에게 보이지 않음</span></div>
            <div className="card-pad">
              {ownedKpis.map(k => {
                const g = grades[k.kpi.id] || { grade: null, comment: '' };
                const set = (patch: Partial<typeof g>) => setGrades(p => ({ ...p, [k.kpi.id]: { ...g, ...patch } }));
                const rv = reviews.find(r => r.kpi_id === k.kpi.id);
                return (
                  <div key={k.kpi.id} className="field">
                    <label>{k.kpi.id} {k.kpi.title}</label>
                    {rv && <div className="self-review"><b>본인 실적{rv.self_grade ? ` · 자기평가 ${rv.self_grade}` : ''}</b> {rv.achievement}</div>}
                    <div className="row">
                      <div className="grade-pick">{GRADES.map(x => <button key={x} className={g.grade === x ? 'on' : ''} onClick={() => set({ grade: g.grade === x ? null : x })}>{x}</button>)}</div>
                      <input className="input" style={{ flex: 1, minWidth: 160 }} value={g.comment} placeholder="근거 번호와 의견 (예: 3, 5번 리딩)" onChange={e => set({ comment: e.target.value })} />
                    </div>
                  </div>
                );
              })}
              <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <label>종합 등급</label>
                <div className="grade-pick" style={{ marginBottom: 8 }}>{GRADES.map(x => <button key={x} className={overall.grade === x ? 'on' : ''} onClick={() => setOverall(o => ({ ...o, grade: o.grade === x ? null : x }))}>{x}</button>)}</div>
                <textarea className="textarea" value={overall.comment} onChange={e => setOverall(o => ({ ...o, comment: e.target.value }))} placeholder="종합 의견" />
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => save()}>저장</button>
                {current?.status === 'released'
                  ? <button className="btn" onClick={() => save(false)}>비공개로 전환</button>
                  : <button className="btn btn-primary" onClick={() => save(true)}>저장 후 본인 공개</button>}
              </div>
              {current && <div className="small muted" style={{ marginTop: 8, textAlign: 'right' }}>저장 시점의 근거 목록이 함께 보관됩니다 · 마지막 저장 {new Date(current.updated_at).toLocaleString('ko-KR')}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MyEvaluations() {
  const { backend, me, data } = useApp();
  const [list, setList] = useState<{ evaluations: EvalRow[]; items: EvaluationItem[] }>({ evaluations: [], items: [] });
  useEffect(() => { backend.listEvaluations().then(setList); }, [backend]);
  const mine = list.evaluations.filter(e => e.profile_id === me?.id && e.status === 'released')
    .sort((a, b) => b.year - a.year || b.period.localeCompare(a.period));
  if (!mine.length) return <div className="card"><div className="empty">아직 공개된 평가가 없습니다</div></div>;
  return (
    <>
      {mine.map(e => {
        const ev = e.evidence as Evidence | null;
        return (
          <div key={e.id} className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><span className="card-title">{e.year}년 {periodLabel(e.period)}</span><span className="spacer" />
              {e.overall_grade && <span className="badge badge-완료" style={{ fontSize: 14 }}>종합 {e.overall_grade}</span>}</div>
            <div className="card-pad">
              {e.overall_comment && <div className="callout" style={{ marginBottom: 12 }}>{e.overall_comment}</div>}
              {list.items.filter(i => i.evaluation_id === e.id).map(i => (
                <div key={i.kpi_id} className="row" style={{ marginBottom: 6 }}>
                  <span className="badge badge-kpi">{i.kpi_id}</span>
                  <span className="small" style={{ flex: 1 }}>{data.kpis.find(k => k.id === i.kpi_id)?.title}</span>
                  {i.grade && <b>{i.grade}</b>}<span className="small muted">{i.comment}</span>
                </div>
              ))}
              {ev && <div className="small muted" style={{ marginTop: 10 }}>근거: 업무 {ev.stats.total}건 · 완료율 {ev.stats.doneRate}% · KPI 연계 {ev.stats.kpiRate}%</div>}
            </div>
          </div>
        );
      })}
    </>
  );
}

function demoAi(e: Evidence): string {
  const s = e.stats;
  const top = [...e.kpis].sort((a, b) => b.tasks.length - a.tasks.length)[0];
  return `(예시 화면 — 실제로는 AI 가 업무 목록 전체를 읽고 작성합니다)

■ 요약
${e.member}님은 이 기간 ${s.total}건을 맡아 ${s.done}건(${s.doneRate}%)을 마쳤습니다. 팀 평균 완료율은 ${s.teamAvgDoneRate}% 입니다.

■ KPI 기여
· ${top ? `${top.kpi.id} ${top.kpi.title}: ${top.tasks.length}건으로 가장 많이 기여 (${top.tasks.slice(0, 3).map(t => t.no + '번').join(', ')})` : '연결된 KPI 업무가 없습니다'}
${e.missingKpis.length ? `· 연결 업무가 없는 KPI: ${e.missingKpis.map(k => k.id).join(', ')} — 실제 수행 여부 확인 필요` : '· 담당 KPI 모두 연결 업무가 있습니다'}

■ KPI 에 연결해볼 만한 일상 업무
· ${e.routine.slice(0, 2).map(g => `「${g.mainTitle}」(${g.tasks.map(t => t.no + '번').join(', ')})`).join(', ') || '없음'}

■ 확인할 점
· 지연 ${s.overdue}건, 3주 이상 장기 ${s.longRunning}건`;
}
