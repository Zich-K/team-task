import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { STATUSES, type Status, type TaskView } from '../lib/types';
import { calcMain, fmtYM, getTaskWeekNum, groupByMain, parseDate, rowKind } from '../lib/logic';
import { StatusBadge, Who } from './ui';

/** 상태 배지를 누르면 바로 바꿀 수 있는 메뉴 */
export function StatusPicker({ t }: { t: TaskView }) {
  const { saveTask, toast } = useApp();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const pick = async (s: Status) => {
    setAt(null);
    if (s === t.status) return;
    await saveTask({ id: t.id, group_id: t.group_id, status: s }, { quiet: true });
    toast(`「${t.sub_title || t.title}」 ${s}(으)로 변경`);
  };
  return (
    <>
      <button type="button" className="badge-btn" title="눌러서 상태 변경"
        onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setAt({ x: Math.min(r.left, innerWidth - 150), y: r.bottom + 4 }); }}>
        <StatusBadge s={t.status} /><span className="caret">▾</span>
      </button>
      {at && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }} onClick={e => { e.stopPropagation(); setAt(null); }} />
          <div className="menu" style={{ left: at.x, top: at.y }} onClick={e => e.stopPropagation()}>
            {STATUSES.map(s => (
              <button key={s} className={s === t.status ? 'on' : ''} onClick={() => pick(s)}><StatusBadge s={s} /></button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** 메인 업무별 접고 펼치는 목록. 끝난 묶음은 접힌 채로 시작 */
export function GroupList({ tasks, showMember = true, onEdit, empty = '해당하는 업무가 없습니다', expandAll }: {
  tasks: TaskView[]; showMember?: boolean; onEdit: (t: TaskView) => void; empty?: string; expandAll?: boolean;
}) {
  const { holidays, data } = useApp();
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
            <button className="gl-head" onClick={() => toggle(main)} aria-expanded={isOpen}>
              <span className={`chev${isOpen ? ' open' : ''}`}>›</span>
              <span className="gl-title">{main}</span>
              {late > 0 && <span className="badge badge-red">지연 {late}</span>}
              <span className="gl-meta hide-sm">{owners.join(', ')}</span>
              <span className="gl-meta hide-sm">{fmtYM(info.start)} ~ {fmtYM(info.end)}</span>
              <span className="gl-prog"><span className="bar"><i style={{ width: `${info.pct}%` }} /></span>{info.done}/{info.total}</span>
            </button>
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
