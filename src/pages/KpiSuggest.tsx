import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import type { TaskView } from '../lib/types';
import { fmtYM } from '../lib/logic';
import { Avatar } from '../components/ui';

interface Suggestion { groupId: string; title: string; kpiId: string; linked: number; total: number; tasks: TaskView[] }

/**
 * 빠진 KPI 연결 제안 (규칙 기반).
 * 메인 업무에 기본 KPI 가 있는데 KPI 가 비어 있는 서브 업무 → 그 KPI 로 연결 제안.
 * 이미 다른 KPI 가 지정된 업무는 건드리지 않는다. 팀원은 본인 업무만 보인다.
 */
export function KpiSuggest() {
  const { data, views, isLead, me, linkTasks, kpisOf } = useApp();
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [off, setOff] = useState<Set<string>>(new Set());
  const kpi = (id: string) => data.kpis.find(k => k.id === id);

  const { suggestions, mixed } = useMemo(() => {
    const mineOnly = (t: TaskView) => isLead || t.assignee_id === me?.id;
    const suggestions: Suggestion[] = [];
    const mixed: { title: string; dist: [string, number][]; empty: number }[] = [];
    for (const g of data.groups) {
      const subs = views.filter(t => t.group_id === g.id);
      if (!subs.length) continue;
      // 그 KPI 의 담당자 업무만 제안
      const empty = subs.filter(t => !t.kpi_id && mineOnly(t) && !!g.kpi_id && kpisOf(t.assignee_id).has(g.kpi_id));
      if (g.kpi_id && empty.length) {
        suggestions.push({ groupId: g.id, title: g.title, kpiId: g.kpi_id, linked: subs.filter(t => t.kpi_id).length, total: subs.length, tasks: empty });
      }
      const dist = new Map<string, number>();
      subs.forEach(t => t.kpi_id && dist.set(t.kpi_id, (dist.get(t.kpi_id) || 0) + 1));
      if (!g.kpi_id && dist.size > 1) mixed.push({ title: g.title, dist: [...dist], empty: subs.filter(t => !t.kpi_id).length });
    }
    suggestions.sort((a, b) => b.tasks.length - a.tasks.length);
    return { suggestions, mixed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.groups, data.kpiOwners, views, isLead, me?.id]);

  const live = suggestions.filter(s => !skip.has(s.groupId));
  const chosen = (s: Suggestion) => s.tasks.filter(t => !off.has(t.id));
  const total = live.reduce((n, s) => n + chosen(s).length, 0);

  async function applyAll() {
    if (!confirm(`제안 ${total}건을 모두 연결할까요? (이미 다른 KPI 가 있는 업무는 바뀌지 않습니다)`)) return;
    const byKpi = new Map<string, string[]>();
    live.forEach(s => byKpi.set(s.kpiId, [...(byKpi.get(s.kpiId) || []), ...chosen(s).map(t => t.id)]));
    for (const [k, ids] of byKpi) await linkTasks(ids, k);
  }

  return (
    <>
      <div className="callout info" style={{ marginBottom: 14 }}>
        메인 업무에 기본 KPI 가 정해져 있는데, 그 안의 일부 업무만 KPI 가 비어 있는 경우를 찾았습니다. 같은 KPI 로 연결할지 확인해 주세요.
        체크를 풀면 그 업무는 빼고 연결합니다. {isLead ? '' : '(본인 업무만 보입니다)'}
      </div>
      <div className="section-head">
        <span className="section-title">연결 제안</span><span className="badge badge-soft">{total}건</span>
        <span className="spacer" />
        {total > 0 && <button className="btn btn-primary btn-sm" onClick={applyAll}>제안 전부 적용</button>}
      </div>
      {live.map(s => {
        const k = kpi(s.kpiId);
        return (
          <div key={s.groupId} className="card" style={{ marginBottom: 12 }}>
            <div className="card-head" style={{ flexWrap: 'wrap' }}>
              <span className="card-title">{s.title}</span>
              <span className="small muted">{s.total}건 중 {s.linked}건 연결됨</span>
              <span className="spacer" />
              <span className="row small" style={{ gap: 4 }}>→ <span className="badge badge-kpi">{s.kpiId}</span>{k?.title}</span>
            </div>
            <div className="card-pad" style={{ paddingTop: 8, paddingBottom: 8 }}>
              {s.tasks.map(t => (
                <label key={t.id} className="row suggest-row">
                  <input type="checkbox" checked={!off.has(t.id)} onChange={e => setOff(p => { const n = new Set(p); e.target.checked ? n.delete(t.id) : n.add(t.id); return n; })} />
                  <span style={{ flex: 1 }}>{t.sub_title || t.title}</span>
                  <Avatar name={t.member} color={data.profiles.find(p => p.id === t.assignee_id)?.color} size={18} />
                  <span className="small muted">{fmtYM(t.start_date)}~{fmtYM(t.end_date)}</span>
                </label>
              ))}
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setSkip(p => new Set(p).add(s.groupId))}>이 묶음은 건너뛰기</button>
                <button className="btn btn-sm btn-primary" disabled={!chosen(s).length} onClick={() => linkTasks(chosen(s).map(t => t.id), s.kpiId)}>
                  {chosen(s).length}건 연결
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {!live.length && <div className="card"><div className="empty">연결할 제안이 없습니다 👍</div></div>}

      {isLead && mixed.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head"><span className="card-title">확인 필요 — 여러 KPI 가 섞인 메인 업무</span></div>
          <div className="card-pad">
            <p className="small muted" style={{ marginBottom: 10 }}>자동으로 정하지 않았습니다. 대시보드에서 메인 업무 옆 「+ KPI」로 기본 KPI 를 정하거나, 업무별로 지정하세요.</p>
            {mixed.map(m => (
              <div key={m.title} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                <b style={{ flex: 1 }}>{m.title}</b>
                {m.dist.map(([k, n]) => <span key={k} className="small"><span className="badge badge-kpi">{k}</span> {n}건</span>)}
                {m.empty > 0 && <span className="small muted">미연결 {m.empty}건</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 14 }}>
        KPI 가 하나도 연결되지 않은 메인 업무(일상 업무로 보이는 것)는 여기 나오지 않습니다. AI 연결 키를 등록하면 그런 업무도 내용을 읽고 어울리는 KPI 를 추천하도록 추가할 수 있습니다.
      </p>
    </>
  );
}
