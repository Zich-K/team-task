import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import type { TaskView } from '../lib/types';
import { addDays, fmtDate, formatWeekLabel, getMonday, isLongRunning, normTitle, parseDate, sundayOf, taskInWeek, toISODate } from '../lib/logic';
import { GroupedTable } from '../components/GroupedTable';
import { GroupList, StatusPicker } from '../components/GroupList';
import { Avatar, Legend, Metric, Seg, Toggle } from '../components/ui';

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

type Focus = 'open' | 'all' | 'doing' | 'late' | 'long' | 'done';
const FOCUS_LABEL: Record<Focus, string> = { open: '진행·예정 업무', all: '전체 업무', doing: '진행 중', late: '마감 지남', long: '3주 이상 진행', done: '완료된 업무' };

export function Dashboard({ search, onEdit }: PageProps) {
  const { views, data, approvedKpis } = useApp();
  const [focus, setFocus] = useState<Focus>('open');
  const [member, setMember] = useState('');
  const [kpi, setKpi] = useState('');
  const [attn, setAttn] = useState<'late' | 'week' | 'long'>('late');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isLate = (t: TaskView) => t.status !== '완료' && !!t.end_date && parseDate(t.end_date)! < today;
  const sun = sundayOf(getMonday(today));
  const dueThisWeek = (t: TaskView) => t.status !== '완료' && !!t.end_date && parseDate(t.end_date)! >= today && parseDate(t.end_date)! <= sun;

  const counts = {
    all: views.length,
    doing: views.filter(t => t.status === '진행 중').length,
    late: views.filter(isLate).length,
    long: views.filter(t => isLongRunning(t)).length,
    done: views.filter(t => t.status === '완료').length,
  };
  const match: Record<Focus, (t: TaskView) => boolean> = {
    open: t => t.status !== '완료', all: () => true, doing: t => t.status === '진행 중',
    late: isLate, long: t => isLongRunning(t), done: t => t.status === '완료',
  };

  const searched = useSearch(views, search);
  const filtered = searched.filter(t => match[focus](t) && (!member || t.assignee_id === member)
    && (!kpi || (kpi === '-' ? !t.kpi_id : t.kpi_id === kpi)));

  const attnLists = {
    late: views.filter(isLate),
    week: views.filter(dueThisWeek),
    long: views.filter(t => isLongRunning(t)),
  };
  const attnList = [...attnLists[attn]].filter(t => !member || t.assignee_id === member)
    .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''));

  const card = (f: Focus, label: string, value: number, sub: string, tone?: string) => (
    <button className={`card metric metric-btn${tone ? ' ' + tone : ''}${focus === f ? ' on' : ''}`} onClick={() => setFocus(focus === f ? 'open' : f)}>
      <div className="label">{label}</div><div className="value">{value}</div><div className="sub">{sub}</div>
    </button>
  );

  return (
    <>
      <div className="metrics metrics-5">
        {card('all', '전체 업무', counts.all, '서브 업무 기준')}
        {card('doing', '진행 중', counts.doing, '현재 기준', 'blue')}
        {card('late', '마감 지남', counts.late, '완료 안 됨', 'red')}
        {card('long', '3주 이상 진행', counts.long, '점검 필요', 'red')}
        {card('done', '완료', counts.done, '전체 기준', 'green')}
      </div>

      <div className="two-col" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head">
            <span className="card-title">챙겨야 할 업무</span><span className="spacer" />
            <Seg value={attn} onChange={setAttn} options={[
              ['late', `마감 지남 ${attnLists.late.length}`], ['week', `이번 주 마감 ${attnLists.week.length}`], ['long', `3주 이상 ${attnLists.long.length}`]]} />
          </div>
          <div className="attn-list">
            {attnList.map(t => {
              const d = t.end_date ? Math.round((parseDate(t.end_date)!.getTime() - today.getTime()) / 86400000) : null;
              return (
                <div key={t.id} className="attn-row" onClick={() => onEdit(t)}>
                  <Avatar name={t.member} color={data.profiles.find(p => p.id === t.assignee_id)?.color} />
                  <div className="attn-main"><div className="attn-t">{t.sub_title || t.title}</div><div className="small muted">{t.mainTitle}</div></div>
                  <span className={`dday${d !== null && d < 0 ? ' late' : d === 0 ? ' today' : ''}`}>
                    {d === null ? '-' : d < 0 ? `${-d}일 지남` : d === 0 ? '오늘' : `D-${d}`}
                  </span>
                  <StatusPicker t={t} />
                </div>
              );
            })}
            {!attnList.length && <div className="empty">{attn === 'late' ? '마감이 지난 업무가 없습니다 👍' : '해당 업무가 없습니다'}</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">팀원별 현황</span><span className="card-sub">누르면 그 사람 업무만 봅니다</span></div>
          <div className="card-pad people">
            {data.profiles.map(p => {
              const mine = views.filter(t => t.assignee_id === p.id);
              const open = mine.filter(t => t.status !== '완료');
              const late = mine.filter(isLate).length;
              const week = mine.filter(dueThisWeek).length;
              const doneMonth = mine.filter(t => t.status === '완료' && t.end_date?.slice(0, 7) === toISODate(today).slice(0, 7)).length;
              return (
                <button key={p.id} className={`person${member === p.id ? ' on' : ''}`} onClick={() => setMember(member === p.id ? '' : p.id)}>
                  <Avatar name={p.name} color={p.color} size={34} />
                  <div className="person-main">
                    <div className="person-name">{p.name}<span className="small muted"> · {p.role === 'lead' ? '팀장' : '팀원'}</span></div>
                    <div className="person-stats">
                      <span><b>{open.length}</b> 진행·예정</span>
                      <span className={week ? 'warn-t' : ''}><b>{week}</b> 이번 주 마감</span>
                      <span className={late ? 'late-t' : ''}><b>{late}</b> 지남</span>
                      <span className="muted"><b>{doneMonth}</b> 이번 달 완료</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="section-head">
        <span className="section-title">{FOCUS_LABEL[focus]}</span>
        <span className="badge badge-soft">{filtered.length}건</span>
        {member && <button className="chip" onClick={() => setMember('')}>{data.profiles.find(p => p.id === member)?.name} ×</button>}
        {focus !== 'open' && <button className="chip" onClick={() => setFocus('open')}>{FOCUS_LABEL[focus]} ×</button>}
        <span className="spacer" />
        <select className="select select-sm" value={member} onChange={e => setMember(e.target.value)}>
          <option value="">담당자 전체</option>
          {data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select select-sm" value={kpi} onChange={e => setKpi(e.target.value)}>
          <option value="">KPI 전체</option>
          <option value="-">일상 업무(KPI 없음)</option>
          {approvedKpis.map(k => <option key={k.id} value={k.id}>{k.id} {k.title}</option>)}
        </select>
        <Toggle on={focus === 'all'} onChange={v => setFocus(v ? 'all' : 'open')}>완료 포함</Toggle>
      </div>
      <div style={{ marginBottom: 10 }}><Legend /></div>
      <div className="card">
        <GroupList tasks={filtered} onEdit={onEdit} empty={search ? '검색 결과가 없습니다' : undefined} expandAll={focus !== 'all' && focus !== 'done'} />
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>업무를 누르면 수정, 상태 배지를 누르면 바로 상태를 바꿀 수 있습니다.</div>
    </>
  );
}

export function Members({ search, onEdit, onAdd }: PageProps) {
  const { views, data, me } = useApp();
  const [sel, setSel] = useState(me?.id || data.profiles[0]?.id || '');
  const [showDone, setShowDone] = useState(false);
  const searched = useSearch(views, search);
  const all = views.filter(t => t.assignee_id === sel);
  // 완료 숨김: 기존과 같이 '전부 끝난 메인 업무'만 숨기고, 진행 중 묶음 안의 완료 항목은 남긴다
  const activeGroups = new Set(all.filter(t => t.status !== '완료').map(t => t.group_id));
  const mine = searched.filter(t => t.assignee_id === sel && (showDone || activeGroups.has(t.group_id)));

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
        <Toggle on={showDone} onChange={setShowDone}>끝난 업무 포함</Toggle>
        <button className="btn btn-primary" onClick={() => onAdd({ assigneeId: sel })}>업무 추가</button>
      </div>
      <div className="card">
        <GroupList tasks={mine} showMember={false} onEdit={onEdit} />
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
