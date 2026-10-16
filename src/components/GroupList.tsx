import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { STATUSES, type Status, type TaskView } from '../lib/types';
import { calcMain, fmtYM, getTaskWeekNum, groupByMain, parseDate, rowKind } from '../lib/logic';
import { Popover, StatusBadge, Who } from './ui';

/** 상태 배지를 누르면 바로 바꿀 수 있는 메뉴 */
export function StatusPicker({ t }: { t: TaskView }) {
  const { saveTask, toast } = useApp();
  const [at, setAt] = useState<DOMRect | null>(null);
  const pick = async (s: Status) => {
    setAt(null);
    if (s === t.status) return;
    await saveTask({ id: t.id, group_id: t.group_id, status: s }, { quiet: true });
    toast(`「${t.sub_title || t.title}」 ${s}(으)로 변경`);
  };
  return (
    <>
      <button type="button" className="badge-btn" title="눌러서 상태 변경"
        onClick={e => { e.stopPropagation(); setAt((e.currentTarget as HTMLElement).getBoundingClientRect()); }}>
        <StatusBadge s={t.status} /><span className="caret">▾</span>
      </button>
      {at && (
        <Popover anchor={at} width={130} height={160} onClose={() => setAt(null)}>
          {STATUSES.map(s => (
            <button key={s} className={s === t.status ? 'on' : ''} onClick={() => pick(s)}><StatusBadge s={s} /></button>
          ))}
        </Popover>
      )}
    </>
  );
}

/** 메인 업무의 기본 KPI 지정. 고르면 KPI 가 비어 있는 서브 업무에도 채운다 (다른 KPI 가 있는 업무는 그대로) */
export function GroupKpiPicker({ groupId }: { groupId: string }) {
  const { data, approvedKpis, setGroupKpi } = useApp();
  const [at, setAt] = useState<DOMRect | null>(null);
  const g = data.groups.find(x => x.id === groupId);
  if (!g) return null;
  const k = data.kpis.find(x => x.id === g.kpi_id);
  const pick = async (id: string | null) => { setAt(null); if (id !== g.kpi_id) await setGroupKpi(groupId, id, true); };
  return (
    <>
      <span role="button" tabIndex={0} className={`gk-btn${k ? '' : ' empty'}`} title={k ? `기본 KPI: ${k.title} (눌러서 변경)` : '메인 업무 KPI 지정'}
        onClick={e => { e.stopPropagation(); setAt((e.currentTarget as HTMLElement).getBoundingClientRect()); }}>
        {k ? <span className="badge badge-kpi">{k.id}</span> : '+ KPI'}
      </span>
      {at && (
        <Popover anchor={at} width={310} height={340} className="menu kpi-menu" onClose={() => setAt(null)}>
          <div className="small muted" style={{ padding: '4px 8px 6px' }}>「{g.title}」 기본 KPI — KPI 없는 업무에도 적용됩니다</div>
          <button className={!g.kpi_id ? 'on' : ''} onClick={() => pick(null)}>일상 업무 (KPI 없음)</button>
          {approvedKpis.map(x => (
            <button key={x.id} className={g.kpi_id === x.id ? 'on' : ''} onClick={() => pick(x.id)}>
              <span className="badge badge-kpi">{x.id}</span> {x.title}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}

/** 메인 업무 안에 서브 업무를 바로 추가하는 한 줄 입력. Enter 로 연달아 넣을 수 있다 */
function QuickAdd({ groupId, mainTitle, defaultAssignee, onDetail, onClose }: {
  groupId: string; mainTitle: string; defaultAssignee: string | null;
  onDetail?: (d: { mainTitle: string; assigneeId?: string }) => void; onClose: () => void;
}) {
  const { data, views, people, saveTask } = useApp();
  const [sub, setSub] = useState('');
  const [who, setWho] = useState(defaultAssignee || people[0]?.id || '');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  // 자동완성: 담당자 본인이 이 메인 업무에서 썼던 서브 업무명만
  const own = [...new Set(views.filter(v => v.group_id === groupId && v.assignee_id === who).map(v => v.sub_title).filter(Boolean))];
  const add = async () => {
    const name = sub.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await saveTask({
        group_id: groupId, sub_title: name, title: name, assignee_id: who || null, status: '예정',
        start_date: new Date().toISOString().slice(0, 10), end_date: due || null,
        kpi_id: data.groups.find(g => g.id === groupId)?.kpi_id || null, priority: 2,
      });
      setSub('');
    } finally { setBusy(false); }
  };
  const listId = `qa-${groupId}`;
  return (
    <div className="gl-quick" onClick={e => e.stopPropagation()}>
      <input className="input" autoFocus value={sub} list={listId} placeholder={`「${mainTitle}」에 추가할 서브 업무 (Enter)`}
        onChange={e => setSub(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); if (e.key === 'Escape') onClose(); }} />
      <datalist id={listId}>{own.map(s => <option key={s} value={s} />)}</datalist>
      <select className="select" value={who} onChange={e => setWho(e.target.value)} aria-label="담당자">
        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="마감일" />
      <span className="gl-quick-btns">
        <button type="button" className="btn btn-sm btn-primary" onClick={add} disabled={busy || !sub.trim()}>추가</button>
        {onDetail && <button type="button" className="btn btn-sm" onClick={() => { onClose(); onDetail({ mainTitle, assigneeId: who }); }}>상세</button>}
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>×</button>
      </span>
    </div>
  );
}

/** 메인 업무별 접고 펼치는 목록. 끝난 묶음은 접힌 채로 시작 */
export function GroupList({ tasks, showMember = true, onEdit, empty = '해당하는 업무가 없습니다', expandAll, defaultAssignee = null, onAddDetail }: {
  tasks: TaskView[]; showMember?: boolean; onEdit: (t: TaskView) => void; empty?: string; expandAll?: boolean;
  /** 「+」로 서브 업무를 넣을 때 기본 담당자 */
  defaultAssignee?: string | null;
  /** 「+」 줄의 「상세」: 업무 추가 창을 메인 업무가 채워진 채로 연다 */
  onAddDetail?: (d: { mainTitle: string; assigneeId?: string }) => void;
}) {
  const { holidays, data } = useApp();
  const [adding, setAdding] = useState<string | null>(null);
  const color = (id: string | null) => data.profiles.find(p => p.id === id)?.color;
  const kpiTitle = (id: string | null) => data.kpis.find(k => k.id === id)?.title;
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const groups = useMemo(() => [...groupByMain(tasks)].map(([main, subs]) => {
    const info = calcMain(subs);
    const late = subs.filter(s => s.status !== '완료' && (parseDate(s.end_date)?.getTime() ?? Infinity) < today.getTime()).length;
    // 진행 중인 묶음 먼저, 그 안에서는 가장 늦은 마감이 가까운 순
    return { main, subs, info, late, active: !info.allDone };
  }).sort((a, b) => Number(b.active) - Number(a.active) || b.late - a.late || (b.info.end || '').localeCompare(a.info.end || '')), [tasks]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOpen(new Set(groups.filter(g => expandAll || g.active).map(g => g.main)));
  }, [groups.length, expandAll]);

  if (!groups.length) return <div className="empty">{empty}</div>;
  const toggle = (k: string) => setOpen(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="glist">
      {groups.map(({ main, subs, info, late }) => {
        const isOpen = open.has(main);
        const owners = [...new Set(subs.map(s => s.member).filter(Boolean))];
        return (
          <div key={main} className={`gl-group${info.allDone ? ' done' : ''}`}>
            <div role="button" tabIndex={0} className="gl-head" onClick={() => toggle(main)} aria-expanded={isOpen}
              onKeyDown={e => { if (e.key === 'Enter') toggle(main); }}>
              <span className={`chev${isOpen ? ' open' : ''}`}>›</span>
              <span className="gl-title">{main}</span>
              <button type="button" className="gl-add" title={`「${main}」에 서브 업무 추가`} aria-label="서브 업무 추가"
                onClick={e => { e.stopPropagation(); setAdding(main); setOpen(p => new Set(p).add(main)); }}>+</button>
              <GroupKpiPicker groupId={subs[0].group_id} />
              {late > 0 && <span className="badge badge-red">지연 {late}</span>}
              <span className="gl-meta hide-sm">{owners.join(', ')}</span>
              <span className="gl-meta hide-sm">{fmtYM(info.start)} ~ {fmtYM(info.end)}</span>
              <span className="gl-prog"><span className="bar"><i style={{ width: `${info.pct}%` }} /></span>{info.done}/{info.total}</span>
            </div>
            {isOpen && (
              <div className="gl-body">
                {subs.map(t => {
                  const k = rowKind(t, holidays, now);
                  const lateRow = t.status !== '완료' && (parseDate(t.end_date)?.getTime() ?? Infinity) < today.getTime();
                  return (
                    <div key={t.id} className={`gl-row k-${k}`} onClick={() => onEdit(t)}>
                      <span className="gl-sub">
                        {t.sub_title || t.title}
                        {k === 'long' && <span className="tag-long">{getTaskWeekNum(t.start_date, now)}주째</span>}
                        {t.note && <span className="gl-note">{t.note}</span>}
                      </span>
                      <span className="gl-who">{showMember && <Who name={t.member} color={color(t.assignee_id)} />}</span>
                      <span className={`gl-date${lateRow ? ' late' : ''}`}>{fmtYM(t.start_date)} ~ {fmtYM(t.end_date)}</span>
                      <span className="gl-kpi">{t.kpi_id ? <span className="badge badge-kpi" title={kpiTitle(t.kpi_id)}>{t.kpi_id}</span> : null}</span>
                      <span className="gl-status"><StatusPicker t={t} /></span>
                    </div>
                  );
                })}
                {adding === main && (
                  <QuickAdd groupId={subs[0].group_id} mainTitle={main} defaultAssignee={defaultAssignee} onDetail={onAddDetail} onClose={() => setAdding(null)} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
