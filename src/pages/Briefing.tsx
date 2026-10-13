import { useState } from 'react';
import { useApp } from '../lib/store';
import type { TaskView } from '../lib/types';
import { addDays, fmtDate, parseDate } from '../lib/logic';
import type { PageProps } from './Lists';
import { useSearch } from './Lists';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const DAY = 24 * 60 * 60 * 1000;
const PRIO_LABEL: Record<string, string> = { '1': '①', '2': '②', '3': '③', '0': '-' };

/** 위클리 브리핑 — 기존 renderBriefing 규칙: [지연, 월~금, 예정] 7칸에 마감일 기준 배치 */
export function Briefing({ monday, search, onEdit }: PageProps) {
  const { views, data, me, saveTask } = useApp();
  const [member, setMember] = useState(me && me.role !== 'lead' ? me.id : '');
  const [memo, setMemo] = useState<{ t: TaskView; x: number; y: number; text: string } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number; text: string } | null>(null);
  const searched = useSearch(views, search);

  const weekdays = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const tasks = searched.filter(t => {
    if (member && t.assignee_id !== member) return false;
    const end = parseDate(t.end_date);
    if (!end) return false;
    if (t.status === '완료') {
      const idx = Math.round((end.getTime() - monday.getTime()) / DAY);
      return idx >= 0 && idx <= 6;
    }
    return true;
  }).sort((a, b) => {
    const da = a.status === '완료' ? 1 : 0, db = b.status === '완료' ? 1 : 0;
    if (da !== db) return da - db;
    if (!da) {
      const pa = a.priority || 2, pb = b.priority || 2;
      if (pa !== pb) return pa - pb;
    }
    return (parseDate(a.end_date)!.getTime()) - (parseDate(b.end_date)!.getTime());
  });

  const colOf = (end: Date) => {
    const diff = Math.round((end.getTime() - monday.getTime()) / DAY);
    if (diff < 0) return 0;
    if (diff <= 4) return diff + 1;
    return 6;
  };

  const cycle = (t: TaskView) => {
    const next = ({ 1: 2, 2: 3, 3: 1 } as Record<number, number>)[t.priority || 2] || 1;
    saveTask({ id: t.id, group_id: t.group_id, priority: next }, { quiet: true });
  };

  const openMemo = (t: TaskView, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    setMemo({ t, x: Math.min(e.clientX + 12, innerWidth - 270), y: Math.min(e.clientY + 12, innerHeight - 190), text: t.block_note });
  };
  const saveMemo = async (text: string) => {
    if (!memo) return;
    const t = memo.t;
    setMemo(null);
    await saveTask({ id: t.id, group_id: t.group_id, block_note: text.trim() }, { quiet: true });
  };

  const rows = tasks.map(t => {
    const done = t.status === '완료';
    const end = parseDate(t.end_date)!;
    const overdue = !done && end < today;
    const p = done ? '0' : String(t.priority || 2);
    const col = colOf(end);
    const kind = done ? 'done' : overdue ? 'overdue' : 'active';
    const dayLabel = col === 0 ? '지연' : col === 6 ? '예정' : `${DOW[weekdays[col - 1].getDay()]} ${fmtDate(weekdays[col - 1])}`;
    return { t, done, p, col, kind, dayLabel, memo: t.block_note.trim() };
  });

  const prioBtn = (r: typeof rows[number]) => (
    <button className={`prio p${r.p}`} disabled={r.done} title={r.done ? '' : '눌러서 우선순위 변경'}
      onClick={e => { e.stopPropagation(); if (!r.done) cycle(r.t); }}>{PRIO_LABEL[r.p]}</button>
  );

  return (
    <>
      <div className="section-head">
        <span className="section-title">이번 주 브리핑</span>
        <span className="small muted">마감일 기준 · 블록을 누르면 메모</span>
        <span className="spacer" />
        <select className="select select-sm" value={member} onChange={e => setMember(e.target.value)}>
          <option value="">전체</option>
          {data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="card brief">
        <div className="brief-grid">
          <div className="brief-head" />
          <div className="brief-head overdue">지연</div>
          {weekdays.map(d => (
            <div key={d.getTime()} className={`brief-head${d.getTime() === today.getTime() ? ' today' : ''}`}>
              <div>{fmtDate(d)}</div><div className="dow">{DOW[d.getDay()]}</div>
            </div>
          ))}
          <div className="brief-head upcoming">예정</div>
          {rows.map(r => [
            <div key={r.t.id + 'n'} className="brief-task">
              {prioBtn(r)}
              <span className={`t${r.done ? ' done' : ''}`} onClick={() => onEdit(r.t)} title={`${r.t.mainTitle} · ${r.t.member}`}>{r.t.title || r.t.mainTitle}</span>
              {!member && <span className="m">{r.t.member}</span>}
            </div>,
            ...Array.from({ length: 7 }, (_, i) => (
              <div key={r.t.id + i} className="brief-cell">
                {i === r.col && (
                  <button className={`brief-block ${r.kind}`} onClick={e => openMemo(r.t, e)}
                    onMouseEnter={e => r.memo && setPreview({ x: e.clientX, y: e.clientY, text: r.memo })}
                    onMouseMove={e => r.memo && setPreview({ x: e.clientX, y: e.clientY, text: r.memo })}
                    onMouseLeave={() => setPreview(null)}>
                    {r.memo && <span className="memo">✎</span>}
                  </button>
                )}
              </div>
            )),
          ])}
        </div>
        <div className="brief-cards">
          {rows.map(r => (
            <div key={r.t.id} className="brief-card">
              <div className="row" style={{ minWidth: 0, flexWrap: 'nowrap' }}>
                {prioBtn(r)}
                <span className={`small${r.done ? ' muted' : ''}`} onClick={() => onEdit(r.t)}>{r.t.title || r.t.mainTitle}</span>
              </div>
              <button className={`brief-tag ${r.kind}`} onClick={e => openMemo(r.t, e)}>{r.dayLabel}{r.memo ? ' ✎' : ''}</button>
            </div>
          ))}
        </div>
        {!rows.length && <div className="empty">해당 조건의 업무가 없습니다</div>}
      </div>
      {preview && <div className="tooltip" style={{ left: Math.min(preview.x + 14, innerWidth - 250), top: preview.y + 14 }}>{preview.text}</div>}
      {memo && <MemoPopover {...memo} onClose={() => setMemo(null)} onSave={saveMemo} />}
    </>
  );
}

function MemoPopover({ t, x, y, text, onClose, onSave }: {
  t: TaskView; x: number; y: number; text: string; onClose: () => void; onSave: (s: string) => void;
}) {
  const [v, setV] = useState(text);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }} onClick={onClose} />
      <div className="popover" style={{ left: x, top: y }}>
        <div className="row" style={{ marginBottom: 8 }}><b className="small" style={{ flex: 1 }}>{t.title || t.mainTitle}</b>
          <button className="icon-btn" onClick={onClose}>×</button></div>
        <textarea className="textarea" value={v} onChange={e => setV(e.target.value)} placeholder="메모를 입력하세요" autoFocus />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => onSave('')}>삭제</button>
          <button className="btn btn-sm btn-primary" onClick={() => onSave(v)}>저장</button>
        </div>
      </div>
    </>
  );
}
