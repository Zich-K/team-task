import { Fragment, useState } from 'react';
import { useApp } from '../lib/store';
import type { TaskView } from '../lib/types';
import { addDays, fmtDate, parseDate } from '../lib/logic';
import { Avatar } from '../components/ui';
import { StatusPicker } from '../components/GroupList';
import type { PageProps } from './Lists';
import { useSearch } from './Lists';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const DAY = 24 * 60 * 60 * 1000;
const PRIO_LABEL: Record<string, string> = { '1': '①', '2': '②', '3': '③', '0': '-' };
type Focus = '' | 'late' | 'today' | 'week' | 'later' | 'done';

/** 위클리 브리핑 — 기존 규칙 유지: [지연, 월~금, 예정] 7칸에 마감일 기준 배치, 완료는 그 주 마감분만 */
export function Briefing({ monday, search, onEdit }: PageProps) {
  const { views, data, saveTask, people } = useApp();
  const [member, setMember] = useState('');
  const [focus, setFocus] = useState<Focus>('');
  const [memo, setMemo] = useState<{ t: TaskView; x: number; y: number; text: string } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number; text: string } | null>(null);
  const searched = useSearch(views, search);

  const weekdays = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const colOf = (end: Date) => {
    const diff = Math.round((end.getTime() - monday.getTime()) / DAY);
    if (diff < 0) return 0;
    if (diff <= 4) return diff + 1;
    return 6;
  };

  const base = searched.filter(t => {
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
    return parseDate(a.end_date)!.getTime() - parseDate(b.end_date)!.getTime();
  });

  const rows = base.map(t => {
    const done = t.status === '완료';
    const end = parseDate(t.end_date)!;
    const overdue = !done && end < today;
    const col = colOf(end);
    const kind: Focus = done ? 'done' : overdue ? 'late' : end.getTime() === today.getTime() ? 'today' : col === 6 ? 'later' : 'week';
    return {
      t, done, col, kind, memo: t.block_note.trim(),
      p: done ? '0' : String(t.priority || 2),
      block: done ? 'done' : overdue ? 'overdue' : 'active',
      dayLabel: col === 0 ? '지연' : col === 6 ? '예정' : `${DOW[weekdays[col - 1].getDay()]} ${fmtDate(weekdays[col - 1])}`,
    };
  });
  type Row = typeof rows[number];

  const byMember = rows.filter(r => !member || r.t.assignee_id === member);
  const shown = byMember.filter(r => !focus || r.kind === focus);
  const count = (f: Focus) => byMember.filter(r => r.kind === f).length;

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

  const prioBtn = (r: Row) => (
    <button className={`prio p${r.p}`} disabled={r.done} title={r.done ? '' : '눌러서 우선순위 변경'}
      onClick={e => { e.stopPropagation(); if (!r.done) cycle(r.t); }}>{PRIO_LABEL[r.p]}</button>
  );
  const colCount = (i: number) => shown.filter(r => r.col === i && !r.done).length;

  // 전체 보기에서는 사람별로 묶는다
  const sections = member
    ? [{ id: member, rows: shown }]
    : data.profiles.map(p => ({ id: p.id, rows: shown.filter(r => r.t.assignee_id === p.id) }))
      .concat([{ id: '', rows: shown.filter(r => !r.t.assignee_id) }]).filter(s => s.rows.length);

  const card = (f: Focus, label: string, tone: string) => (
    <button className={`card metric metric-btn ${tone}${focus === f ? ' on' : ''}`} onClick={() => setFocus(focus === f ? '' : f)}>
      <div className="label">{label}</div><div className="value">{count(f)}</div>
    </button>
  );

  return (
    <>
      <div className="metrics metrics-5">
        {card('late', '마감 지남', 'red')}
        {card('today', '오늘 마감', 'red')}
        {card('week', '이번 주 남은 마감', 'blue')}
        {card('later', '다음 주 이후', '')}
        {card('done', '이번 주 완료', 'green')}
      </div>

      <div className="section-head">
        <button className={`chip${!member ? ' chip-on' : ''}`} onClick={() => setMember('')}>전체 {rows.filter(r => !r.done).length}</button>
        {people.map(p => (
          <button key={p.id} className={`chip${member === p.id ? ' chip-on' : ''}`} onClick={() => setMember(member === p.id ? '' : p.id)}>
            <Avatar name={p.name} color={p.color} size={16} /> {p.name} {rows.filter(r => !r.done && r.t.assignee_id === p.id).length}
          </button>
        ))}
        {focus && <button className="chip" onClick={() => setFocus('')}>필터 해제 ×</button>}
        <span className="spacer" />
        <span className="small muted">마감일 기준 · 블록을 누르면 메모 · ①②③ 누르면 우선순위</span>
      </div>

      <div className="card brief">
        <div className="brief-grid">
          <div className="brief-head" />
          <div className="brief-head overdue">지연<div className="dow">{colCount(0) || ''}</div></div>
          {weekdays.map((d, i) => (
            <div key={d.getTime()} className={`brief-head${d.getTime() === today.getTime() ? ' today' : ''}`}>
              <div>{fmtDate(d)} {DOW[d.getDay()]}</div><div className="dow">{colCount(i + 1) ? `${colCount(i + 1)}건` : ''}</div>
            </div>
          ))}
          <div className="brief-head upcoming">예정<div className="dow">{colCount(6) || ''}</div></div>
          {sections.map(s => {
            const p = data.profiles.find(x => x.id === s.id);
            return (
              <Fragment key={s.id || 'none'}>
                {!member && (
                  <div className="brief-person">
                    {p ? <><Avatar name={p.name} color={p.color} size={22} /><b>{p.name}</b></> : <b>담당자 없음</b>}
                    <span className="small muted">진행 {s.rows.filter(r => !r.done).length} · 지남 {s.rows.filter(r => r.kind === 'late').length} · 완료 {s.rows.filter(r => r.done).length}</span>
                  </div>
                )}
                {s.rows.map(r => [
                  <div key={r.t.id + 'n'} className={`brief-task${r.kind === 'late' ? ' is-late' : ''}`}>
                    {prioBtn(r)}
                    <div className="bt-main" onClick={() => onEdit(r.t)}>
                      <span className={`t${r.done ? ' done' : ''}`}>{r.t.title || r.t.mainTitle}</span>
                      <span className="m">{r.t.mainTitle}</span>
                    </div>
                    <StatusPicker t={r.t} />
                  </div>,
                  ...Array.from({ length: 7 }, (_, i) => (
                    <div key={r.t.id + i} className={`brief-cell${i === 0 ? ' c-late' : ''}`}>
                      {i === r.col && (
                        <button className={`brief-block ${r.block}`} onClick={e => openMemo(r.t, e)}
                          onMouseEnter={e => r.memo && setPreview({ x: e.clientX, y: e.clientY, text: r.memo })}
                          onMouseMove={e => r.memo && setPreview({ x: e.clientX, y: e.clientY, text: r.memo })}
                          onMouseLeave={() => setPreview(null)}>
                          {r.memo && <span className="memo">✎</span>}
                        </button>
                      )}
                    </div>
                  )),
                ])}
              </Fragment>
            );
          })}
        </div>

        <div className="brief-cards">
          {sections.map(s => {
            const p = data.profiles.find(x => x.id === s.id);
            return (
              <Fragment key={s.id || 'none'}>
                {!member && <div className="brief-person m">{p && <Avatar name={p.name} color={p.color} size={20} />}<b>{p?.name || '담당자 없음'}</b></div>}
                {s.rows.map(r => (
                  <div key={r.t.id} className="brief-card">
                    <div className="row" style={{ minWidth: 0, flexWrap: 'nowrap', flex: 1 }}>
                      {prioBtn(r)}
                      <div style={{ minWidth: 0 }} onClick={() => onEdit(r.t)}>
                        <div className={`small${r.done ? ' muted' : ''}`} style={{ fontWeight: 600 }}>{r.t.title || r.t.mainTitle}</div>
                        <div className="small muted">{r.t.mainTitle}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <button className={`brief-tag ${r.block}`} onClick={e => openMemo(r.t, e)}>{r.dayLabel}{r.memo ? ' ✎' : ''}</button>
                      <StatusPicker t={r.t} />
                    </div>
                  </div>
                ))}
              </Fragment>
            );
          })}
        </div>
        {!shown.length && <div className="empty">해당 조건의 업무가 없습니다</div>}
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
