import { Fragment, useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import type { TaskView } from '../lib/types';
import { calcMain, fmtYM, getTaskWeekNum, groupByMain, rowKind } from '../lib/logic';
import { StatusBadge, Who } from './ui';

export type Col = 'sub' | 'member' | 'status' | 'start' | 'end' | 'note' | 'kpi' | 'actions';

/** 메인 업무별로 묶은 표 — 기존 renderGroupedTable 과 같은 표시 규칙 */
export function GroupedTable({ tasks, cols, showDone = true, onEdit, empty = '등록된 업무가 없습니다' }: {
  tasks: TaskView[]; cols: Col[]; showDone?: boolean; onEdit: (t: TaskView) => void; empty?: string;
}) {
  const { holidays, data } = useApp();
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const color = (id: string | null) => data.profiles.find(p => p.id === id)?.color;
  const kpiTitle = (id: string | null) => data.kpis.find(k => k.id === id)?.title;
  const now = new Date();

  const groups = [...groupByMain(tasks)]
    .map(([main, subs]) => ({ main, subs, info: calcMain(subs) }))
    .filter(g => showDone || !g.info.allDone);

  if (!groups.length) return <div className="empty">{empty}</div>;

  const head: Record<Col, string> = { sub: '서브 업무', member: '담당자', status: '상태', start: '시작일', end: '마감일', note: '비고', kpi: 'KPI', actions: '' };

  return (
    <>
      <div className="table-wrap desk-table">
        <table className="tbl">
          <thead><tr><th>메인 업무</th>{cols.map(c => <th key={c}>{head[c]}</th>)}</tr></thead>
          <tbody>
            {groups.map(({ main, subs, info }) => (
              <Fragment key={main}>
                {subs.map((t, i) => {
                  const k = rowKind(t, holidays, now);
                  const weeks = getTaskWeekNum(t.start_date, now);
                  return (
                    <tr key={t.id} className={`k-${k}${i === 0 ? ' group-start' : ''} clickable`}
                      onClick={e => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        if (k === 'long') setTip({ x: e.clientX, y: e.clientY, text: `${weeks}주째 진행 중` });
                      }}
                      onDoubleClick={() => onEdit(t)}>
                      {i === 0 && (
                        <td className="main-cell" rowSpan={subs.length}>
                          <div className="main-name">{main}</div>
                          <div className="main-range">{fmtYM(info.start)}~{fmtYM(info.end)}</div>
                          <div className="main-prog"><span className="bar"><i style={{ width: `${info.pct}%` }} /></span>{info.done}/{info.total}</div>
                        </td>
                      )}
                      {cols.map(c => {
                        switch (c) {
                          case 'sub': return <td key={c} className="sub-title">{t.sub_title}</td>;
                          case 'member': return <td key={c}><Who name={t.member} color={color(t.assignee_id)} /></td>;
                          case 'status': return <td key={c}><StatusBadge s={t.status} /></td>;
                          case 'start': return <td key={c} className="date-cell">{fmtYM(t.start_date)}</td>;
                          case 'end': return <td key={c} className="date-cell">{fmtYM(t.end_date)}</td>;
                          case 'note': return <td key={c} className="note-cell">{t.note}</td>;
                          case 'kpi': return <td key={c}>{t.kpi_id ? <span className="badge badge-kpi" title={kpiTitle(t.kpi_id)}>{t.kpi_id}</span> : <span className="muted small">-</span>}</td>;
                          case 'actions': return <td key={c} className="actions"><button className="btn btn-sm" onClick={() => onEdit(t)}>수정</button></td>;
                        }
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="m-cards">
        {groups.map(({ main, subs, info }) => (
          <div key={main} className="m-group">
            <div className="m-group-hd"><b style={{ fontSize: 13 }}>{main}</b><span className="small muted">{fmtYM(info.start)} ~ {fmtYM(info.end)}</span></div>
            {subs.map(t => (
              <div key={t.id} className={`m-card k-${rowKind(t, holidays, now)}`} onClick={() => onEdit(t)}>
                <div className="sub-title" style={{ marginBottom: 5 }}>{t.sub_title || t.title}</div>
                <div className="row small">
                  {cols.includes('member') && <Who name={t.member} color={color(t.assignee_id)} />}
                  <StatusBadge s={t.status} />
                  <span className="muted">{fmtYM(t.start_date)}{t.end_date ? ' ~ ' + fmtYM(t.end_date) : ''}</span>
                  {t.kpi_id && <span className="badge badge-kpi">{t.kpi_id}</span>}
                </div>
                {t.note && <div className="small muted" style={{ marginTop: 4 }}>{t.note}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
      {tip && <Tip {...tip} onDone={() => setTip(null)} />}
    </>
  );
}

function Tip({ x, y, text, onDone }: { x: number; y: number; text: string; onDone: () => void }) {
  useEffect(() => { const id = setTimeout(onDone, 2500); return () => clearTimeout(id); }, [x, y, onDone]);
  return <div className="tooltip" style={{ left: x + 12, top: y - 34, background: '#880e4f' }}>{text}</div>;
}
