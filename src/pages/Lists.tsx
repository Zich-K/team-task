import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import type { TaskView } from '../lib/types';
import { addDays, fmtDate, formatWeekLabel, isLongRunning, normTitle, sundayOf, taskInWeek } from '../lib/logic';
import { GroupedTable } from '../components/GroupedTable';
import { Avatar, Legend, Metric, Toggle } from '../components/ui';

export interface PageProps {
  monday: Date;
  search: string;
  onEdit: (t: TaskView) => void;
  onAdd: (defaults?: { assigneeId?: string }) => void;
}

/** 검색어: 메인·서브 업무명, 비고, 담당자, KPI 에서 찾는다 (띄어쓰기 무시) */
export function useSearch(tasks: TaskView[], search: string) {
  const { data } = useApp();
  return useMemo(() => {
    const q = normTitle(search);
    if (!q) return tasks;
    const kpi = new Map(data.kpis.map(k => [k.id, k.title]));
    return tasks.filter(t => normTitle(`${t.mainTitle} ${t.sub_title} ${t.title} ${t.note} ${t.member} ${t.kpi_id || ''} ${kpi.get(t.kpi_id || '') || ''}`).includes(q));
  }, [tasks, search, data.kpis]);
}

export function Dashboard({ search, onEdit }: PageProps) {
  const { views, data } = useApp();
  const [showDone, setShowDone] = useState(true);
  const [member, setMember] = useState('');
  const [kpi, setKpi] = useState('');
  const searched = useSearch(views, search);
  const filtered = searched.filter(t => (!member || t.assignee_id === member) && (!kpi || (kpi === '-' ? !t.kpi_id : t.kpi_id === kpi)));

  return (
    <>
      <div className="metrics">
        <Metric label="전체 업무" value={views.length} sub="서브 업무 기준" />
        <Metric label="진행 중" value={views.filter(t => t.status === '진행 중').length} sub="현재 기준" tone="blue" />
        <Metric label="3주 이상 진행" value={views.filter(t => isLongRunning(t)).length} sub="점검 필요" tone="red" />
        <Metric label="완료" value={views.filter(t => t.status === '완료').length} sub="전체 기준" tone="green" />
      </div>
      <div className="section-head">
        <span className="section-title">전체 업무 현황</span>
        {search && <span className="badge badge-soft">검색 결과 {filtered.length}건</span>}
        <span className="spacer" />
        <select className="select select-sm" value={member} onChange={e => setMember(e.target.value)}>
          <option value="">담당자 전체</option>
          {data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select select-sm" value={kpi} onChange={e => setKpi(e.target.value)}>
          <option value="">KPI 전체</option>
          <option value="-">일상 업무(KPI 없음)</option>
          {data.kpis.map(k => <option key={k.id} value={k.id}>{k.id} {k.title}</option>)}
        </select>
        <Toggle on={showDone} onChange={setShowDone}>{showDone ? '완료 표시' : '완료 숨김'}</Toggle>
      </div>
      <div style={{ marginBottom: 10 }}><Legend /></div>
      <div className="card">
        <GroupedTable tasks={filtered} showDone={showDone} onEdit={onEdit}
          cols={['sub', 'member', 'status', 'start', 'end', 'note', 'kpi', 'actions']}
          empty={search ? '검색 결과가 없습니다' : undefined} />
      </div>
    </>
  );
}

export function Members({ search, onEdit, onAdd }: PageProps) {
  const { views, data, me } = useApp();
  const [sel, setSel] = useState(me?.id || data.profiles[0]?.id || '');
  const [showDone, setShowDone] = useState(true);
  const searched = useSearch(views, search);
  const mine = searched.filter(t => t.assignee_id === sel);
  const all = views.filter(t => t.assignee_id === sel);

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        {data.profiles.map(p => (
          <button key={p.id} className={`btn${sel === p.id ? ' btn-primary' : ''}`} onClick={() => setSel(p.id)}>
            <Avatar name={p.name} color={p.color} size={20} />{p.name}
            <span className="small" style={{ opacity: .7 }}>{views.filter(t => t.assignee_id === p.id && t.status !== '완료').length}</span>
          </button>
        ))}
      </div>
      <div className="metrics">
        <Metric label="진행 중" value={all.filter(t => t.status === '진행 중').length} tone="blue" />
        <Metric label="예정" value={all.filter(t => t.status === '예정').length} />
        <Metric label="3주 이상 진행" value={all.filter(t => isLongRunning(t)).length} tone="red" />
        <Metric label="완료" value={all.filter(t => t.status === '완료').length} tone="green" />
      </div>
      <div className="section-head">
        <Legend /><span className="spacer" />
        <Toggle on={showDone} onChange={setShowDone}>{showDone ? '완료 표시' : '완료 숨김'}</Toggle>
        <button className="btn btn-primary" onClick={() => onAdd({ assigneeId: sel })}>업무 추가</button>
      </div>
      <div className="card">
        <GroupedTable tasks={mine} showDone={showDone} onEdit={onEdit} cols={['sub', 'status', 'start', 'end', 'note', 'kpi', 'actions']} />
      </div>
    </>
  );
}

export function Team({ monday, search, onEdit }: PageProps) {
  const { views } = useApp();
  const searched = useSearch(views, search);
  const nextMon = addDays(monday, 7);
  const thisWeek = searched.filter(t => taskInWeek(t, monday));
  const nextWeek = searched.filter(t => t.status !== '완료' && taskInWeek(t, nextMon));
  return (
    <>
      <div style={{ marginBottom: 12 }}><Legend /></div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><span className="card-title">이번 주 한 일</span>
          <span className="card-sub">{formatWeekLabel(monday)} ({fmtDate(monday)}~{fmtDate(sundayOf(monday))})</span></div>
        <GroupedTable tasks={thisWeek} onEdit={onEdit} cols={['sub', 'member', 'status', 'note']} />
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">다음 주 할 일</span>
          <span className="card-sub">{formatWeekLabel(nextMon)} ({fmtDate(nextMon)}~{fmtDate(sundayOf(nextMon))})</span></div>
        <GroupedTable tasks={nextWeek} onEdit={onEdit} cols={['sub', 'member', 'status', 'end']} />
      </div>
    </>
  );
}
