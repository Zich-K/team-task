import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import type { Meeting, MeetingItem, TaskView } from '../lib/types';
import { fmtYM, normTitle, parseDate } from '../lib/logic';
import { Avatar } from '../components/ui';
import { StatusPicker } from '../components/GroupList';
import type { PageProps } from './Lists';

type Draft = Partial<Meeting> & { title: string };

const lines = (s: string) => s.split('\n').map(l => l.replace(/^[\s•\-·*]+/, '').trim()).filter(Boolean);
const fmtAt = (iso: string) => {
  const d = new Date(iso);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** datetime-local 입력용 (한국 시간 그대로) */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** 회의록: 결정 사항과 할 일 중심. 할 일은 저장하면 담당자 업무로 등록된다 */
export function Meetings({ search, onEdit }: PageProps) {
  const { data } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ m: Draft; items: MeetingItem[] } | null>(null);
  const [series, setSeries] = useState('');

  const allSeries = [...new Set(data.meetings.map(m => m.series).filter(Boolean) as string[])];
  const itemsOf = (id: string) => data.meetingItems.filter(i => i.meeting_id === id);
  const q = normTitle(search);
  const list = data.meetings
    .filter(m => !series || m.series === series)
    .filter(m => !q || normTitle(`${m.title} ${m.agenda} ${m.decisions} ${m.notes} ${itemsOf(m.id).map(i => i.content).join(' ')}`).includes(q));

  const open = data.meetings.find(m => m.id === openId);

  const startNew = (base?: Meeting) => {
    setOpenId(null);
    setDraft({
      m: base
        ? { title: base.title, series: base.series, attendee_ids: base.attendee_ids, external_attendees: base.external_attendees, group_id: base.group_id, meeting_at: new Date().toISOString(), agenda: '', decisions: '', notes: '' }
        : { title: '', series: null, attendee_ids: data.profiles.filter(p => p.active).map(p => p.id), external_attendees: '', group_id: null, meeting_at: new Date().toISOString(), agenda: '', decisions: '', notes: '' },
      items: [],
    });
  };

  if (draft) {
    return <MeetingForm draft={draft.m} initialItems={draft.items} onClose={id => { setDraft(null); setOpenId(id ?? null); }} onEditTask={onEdit} />;
  }
  if (open) {
    return <MeetingView m={open} onBack={() => setOpenId(null)} onEditTask={onEdit}
      onEditMeeting={() => setDraft({ m: { ...open }, items: itemsOf(open.id) })}
      onNext={() => startNew(open)} />;
  }

  return (
    <>
      <div className="section-head">
        <button className={`chip${!series ? ' chip-on' : ''}`} onClick={() => setSeries('')}>전체 {data.meetings.length}</button>
        {allSeries.map(s => <button key={s} className={`chip${series === s ? ' chip-on' : ''}`} onClick={() => setSeries(series === s ? '' : s)}>{s}</button>)}
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => startNew()}>+ 새 회의록</button>
      </div>
      <div className="card">
        {list.map(m => <MeetingRow key={m.id} m={m} onClick={() => setOpenId(m.id)} />)}
        {!list.length && (
          <div className="empty">
            {search ? '검색 결과가 없습니다' : <>아직 회의록이 없습니다.<br />「+ 새 회의록」에서 결정 사항과 할 일만 적어도 됩니다.</>}
          </div>
        )}
      </div>
    </>
  );
}

function useItemStatus() {
  const { views } = useApp();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (it: MeetingItem) => {
    const t = views.find(v => v.id === it.task_id);
    const late = !!t && t.status !== '완료' && !!t.end_date && parseDate(t.end_date)! < today;
    return { t, late, done: t?.status === '완료' };
  };
}

function MeetingRow({ m, onClick }: { m: Meeting; onClick: () => void }) {
  const { data } = useApp();
  const status = useItemStatus();
  const items = data.meetingItems.filter(i => i.meeting_id === m.id).map(i => ({ i, ...status(i) }));
  const done = items.filter(x => x.done).length, late = items.filter(x => x.late).length;
  const first = lines(m.decisions)[0];
  return (
    <button className="mt-row" onClick={onClick}>
      <div className="mt-main">
        <div className="row" style={{ gap: 6 }}>
          <b>{m.title}</b>{m.series && <span className="badge badge-soft">정기</span>}
          {m.status === 'draft' && <span className="badge badge-보류">작성 중</span>}
        </div>
        <div className="small muted">{fmtAt(m.meeting_at)} · 참석 {m.attendee_ids.length + (m.external_attendees.trim() ? lines(m.external_attendees.replace(/,/g, '\n')).length : 0)}명</div>
        {first && <div className="small mt-dec">결정: {first}{lines(m.decisions).length > 1 ? ` 외 ${lines(m.decisions).length - 1}건` : ''}</div>}
      </div>
      <div className="mt-side">
        {items.length > 0
          ? <><span className="small">할 일 {done}/{items.length}</span>{late > 0 && <span className="badge badge-red">지연 {late}</span>}</>
          : <span className="small muted">할 일 없음</span>}
        <span className="mt-avs">{m.attendee_ids.slice(0, 5).map(id => { const p = data.profiles.find(x => x.id === id); return p ? <Avatar key={id} name={p.name} color={p.color} size={20} /> : null; })}</span>
      </div>
    </button>
  );
}

/** 같은 정기 회의의 바로 전 회차 할 일 */
function PrevItems({ m }: { m: Partial<Meeting> }) {
  const { data } = useApp();
  const status = useItemStatus();
  if (!m.series) return null;
  const at = m.meeting_at ? new Date(m.meeting_at).getTime() : Date.now();
  const prev = data.meetings.filter(x => x.series === m.series && x.id !== m.id && x.status !== 'draft' && new Date(x.meeting_at).getTime() < at)
    .sort((a, b) => b.meeting_at.localeCompare(a.meeting_at))[0];
  if (!prev) return null;
  const items = data.meetingItems.filter(i => i.meeting_id === prev.id).map(i => ({ i, ...status(i) }));
  const name = (id: string | null) => data.profiles.find(p => p.id === id)?.name || '-';
  return (
    <section className="mt-sec">
      <div className="mt-sec-h">① 지난 회의 할 일 <span className="badge badge-soft">자동</span>
        <span className="small muted">{fmtAt(prev.meeting_at).slice(0, 14)} · {items.filter(x => x.done).length}/{items.length} 완료</span></div>
      {items.map(({ i, t, late, done }) => (
        <div key={i.id} className={`mt-prev${late ? ' late' : ''}`}>
          <span>{done ? '✓' : late ? '!' : '·'}</span>
          <span style={{ flex: 1 }}>{i.content} <span className="muted">· {name(i.assignee_id)}{i.due_date ? ` · ${fmtYM(i.due_date)}` : ''}{late ? ' · 마감 지남' : ''}</span></span>
          {t && <StatusPicker t={t} />}
        </div>
      ))}
      {!items.length && <div className="small muted">지난 회의에 할 일이 없었습니다</div>}
    </section>
  );
}

function MeetingView({ m, onBack, onEditMeeting, onNext, onEditTask }: {
  m: Meeting; onBack: () => void; onEditMeeting: () => void; onNext: () => void; onEditTask: (t: TaskView) => void;
}) {
  const { data, deleteMeeting } = useApp();
  const status = useItemStatus();
  const items = data.meetingItems.filter(i => i.meeting_id === m.id).map(i => ({ i, ...status(i) }));
  const group = data.groups.find(g => g.id === m.group_id);
  const name = (id: string | null) => data.profiles.find(p => p.id === id)?.name || '';
  return (
    <div className="card mt-doc">
      <div className="mt-doc-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}>← 목록</button>
        <span className="spacer" />
        {m.series && m.status !== 'draft' && <button className="btn btn-sm" onClick={onNext}>다음 회차 만들기</button>}
        <button className="btn btn-sm btn-primary" onClick={onEditMeeting}>{m.status === 'draft' ? '이어서 작성' : '수정'}</button>
      </div>
      <h2 className="mt-title">{m.title}{m.series && <span className="badge badge-soft" style={{ marginLeft: 8, verticalAlign: 3 }}>정기</span>}
        {m.status === 'draft' && <span className="badge badge-보류" style={{ marginLeft: 6, verticalAlign: 3 }}>작성 중 · 할 일 업무 미등록</span>}</h2>
      <div className="mt-meta">
        <span className="muted">일시</span><span>{fmtAt(m.meeting_at)}</span>
        <span className="muted">참석자</span><span>{[...m.attendee_ids.map(name).filter(Boolean), ...lines(m.external_attendees.replace(/,/g, '\n'))].join(', ') || '-'}</span>
        <span className="muted">메인 업무</span><span>{group?.title || '-'}</span>
      </div>
      <PrevItems m={m} />
      {m.agenda.trim() && <section className="mt-sec"><div className="mt-sec-h">② 안건</div><div className="mt-text">{m.agenda}</div></section>}
      <section className="mt-sec">
        <div className="mt-sec-h">③ 결정 사항</div>
        {lines(m.decisions).length ? <ul className="mt-list">{lines(m.decisions).map((d, i) => <li key={i}>{d}</li>)}</ul> : <div className="small muted">없음</div>}
      </section>
      <section className="mt-sec">
        <div className="mt-sec-h">④ 할 일 <span className="small muted">{items.filter(x => x.done).length}/{items.length} 완료</span></div>
        {items.map(({ i, t, late }) => (
          <div key={i.id} className={`mt-item${late ? ' late' : ''}`}>
            <span className="mt-item-c" onClick={() => t && onEditTask(t)} style={{ cursor: t ? 'pointer' : 'default' }}>{i.content}</span>
            <span className="small">{name(i.assignee_id) || <span className="muted">담당 미정</span>}</span>
            <span className={`small${late ? ' late-t' : ' muted'}`}>{i.due_date ? fmtYM(i.due_date) : '마감 없음'}</span>
            <span>{t ? <StatusPicker t={t} /> : <span className="small muted">업무 미등록</span>}</span>
          </div>
        ))}
        {!items.length && <div className="small muted">없음</div>}
      </section>
      {m.notes.trim() && <section className="mt-sec"><div className="mt-sec-h">⑤ 메모 · 논의 내용</div><div className="mt-text">{m.notes}</div></section>}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <span className="small muted">최근 수정 {new Date(m.updated_at).toLocaleString('ko-KR')}</span>
        <button className="btn btn-sm btn-danger" onClick={async () => { if (confirm('회의록을 삭제할까요? 할 일로 등록된 업무는 그대로 남습니다.')) { await deleteMeeting(m.id); onBack(); } }}>삭제</button>
      </div>
    </div>
  );
}

function MeetingForm({ draft, initialItems, onClose, onEditTask }: {
  draft: Draft; initialItems: MeetingItem[]; onClose: (savedId?: string) => void; onEditTask: (t: TaskView) => void;
}) {
  const { data, people, me, saveMeeting, deleteMeeting } = useApp();
  const status = useItemStatus();
  const [m, setM] = useState<Draft>(draft);
  const [items, setItems] = useState<MeetingItem[]>(initialItems.length ? initialItems : [blankItem(me?.id)]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (p: Partial<Draft>) => { setM(x => ({ ...x, ...p })); setErr(''); };
  const setItem = (n: number, p: Partial<MeetingItem>) => setItems(x => x.map((it, i) => (i === n ? { ...it, ...p } : it)));
  const groupTitle = data.groups.find(g => g.id === m.group_id)?.title || '';
  const [groupText, setGroupText] = useState(groupTitle);
  const groupOptions = useMemo(() => [...data.groups].sort((a, b) => a.title.localeCompare(b.title)), [data.groups]);
  const isFinal = m.status === 'final';
  const groupIdOf = () => (groupText.trim() ? data.groups.find(x => normTitle(x.title) === normTitle(groupText))?.id ?? null : null);

  // ── 자동 임시 저장 ──
  // 1) 이 기기: 입력할 때마다 바로 보관 (창을 닫거나 새로고침해도 복구 가능)
  // 2) 서버: 작성 중인 회의록(새 회의록·임시 저장본)은 입력이 멈추고 5초 뒤 임시 저장 (다른 기기에서도 이어 쓰기)
  const localKey = (id?: string) => `mt-draft:${id || 'new'}`;
  const snapshot = JSON.stringify({ m, items, groupText });
  const [savedSnap, setSavedSnap] = useState(snapshot);
  const [autoAt, setAutoAt] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ m: Draft; items: MeetingItem[]; groupText: string; at: string } | null>(() => {
    try {
      const raw = localStorage.getItem(localKey(draft.id));
      if (!raw) return null;
      const r = JSON.parse(raw);
      return JSON.stringify({ m: r.m, items: r.items, groupText: r.groupText }) !== snapshot ? r : null;
    } catch { return null; }
  });
  const dirty = snapshot !== savedSnap;

  useEffect(() => {
    if (!dirty || restore) return;
    try { localStorage.setItem(localKey(m.id), JSON.stringify({ m, items, groupText, at: new Date().toISOString() })); } catch { /* 저장 공간 없음: 무시 */ }
  }, [snapshot]);

  useEffect(() => {
    if (!dirty || isFinal || restore || !m.title.trim() || busy) return;
    const timer = setTimeout(async () => {
      try {
        const id = await saveMeeting({ ...m, title: m.title.trim(), group_id: groupIdOf() }, items, { draft: true, quiet: true });
        if (!m.id) { try { localStorage.removeItem(localKey()); } catch { /* */ } }
        setM(x => ({ ...x, id, status: 'draft' }));
        setSavedSnap(JSON.stringify({ m: { ...m, id, status: 'draft' }, items, groupText }));
        try { localStorage.removeItem(localKey(id)); } catch { /* */ }
        setAutoAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      } catch { /* 다음 입력 때 다시 시도 */ }
    }, 5000);
    return () => clearTimeout(timer);
  }, [snapshot, restore, busy]);

  const clearLocal = (id?: string) => { try { localStorage.removeItem(localKey(id)); localStorage.removeItem(localKey()); } catch { /* */ } };

  async function save() {
    if (!m.title.trim()) { setErr('회의 제목을 입력해주세요'); return; }
    const filled = items.filter(i => i.content.trim());
    if (!lines(m.decisions || '').length && !filled.length) { setErr('결정 사항이나 할 일 중 하나는 적어주세요'); return; }
    setBusy(true);
    try {
      const id = await saveMeeting({ ...m, title: m.title.trim(), group_id: groupIdOf() }, filled);
      clearLocal(id);
      onClose(id);
    } catch { setBusy(false); }
  }

  async function saveDraft() {
    if (!m.title.trim()) { setErr('임시 저장하려면 회의 제목을 입력해주세요'); return; }
    setBusy(true);
    try {
      const id = await saveMeeting({ ...m, title: m.title.trim(), group_id: groupIdOf() }, items, { draft: true });
      clearLocal(id);
      setM(x => ({ ...x, id, status: 'draft' }));
      setSavedSnap(JSON.stringify({ m: { ...m, id, status: 'draft' }, items, groupText }));
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!m.id) { clearLocal(); onClose(); return; }
    if (!confirm(`「${m.title}」 회의록을 삭제할까요?${isFinal ? '\n이미 업무로 등록된 할 일은 지워지지 않고 남습니다.' : ''}`)) return;
    await deleteMeeting(m.id);
    clearLocal(m.id);
    onClose();
  }

  const unknownGroup = groupText.trim() && !data.groups.some(x => normTitle(x.title) === normTitle(groupText));
  const saveState = busy ? '저장 중…' : dirty ? (isFinal ? '수정 중 · 이 기기에 보관됨' : '입력 중…') : autoAt ? `자동 임시 저장됨 ${autoAt}` : m.status === 'draft' ? '임시 저장본' : '';

  return (
    <div className="card mt-doc">
      <div className="mt-doc-head">
        <b>{!m.id ? '새 회의록' : isFinal ? '회의록 수정' : '회의록 작성 중'}</b>
        {saveState && <span className="small muted">{saveState}</span>}
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => onClose(m.id)}>닫기</button>
        {!isFinal && <button className="btn btn-sm" onClick={saveDraft} disabled={busy}>임시 저장</button>}
        <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </div>
      {restore && (
        <div className="callout warn" style={{ marginBottom: 14 }}>
          저장하지 않은 작성 내용이 있습니다 ({new Date(restore.at).toLocaleString('ko-KR')}).
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={() => { setM(restore.m); setItems(restore.items); setGroupText(restore.groupText); setRestore(null); }}>불러오기</button>
            <button className="btn btn-sm" onClick={() => { clearLocal(draft.id); setRestore(null); }}>버리기</button>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="field"><label>회의 제목</label>
          <input className="input" value={m.title} onChange={e => set({ title: e.target.value, ...(m.series ? { series: e.target.value } : {}) })} placeholder="예: 주간 팀 회의" autoFocus={!m.id} /></div>
        <div className="field"><label>일시</label>
          <input className="input" type="datetime-local" value={toLocalInput(m.meeting_at || new Date().toISOString())}
            onChange={e => e.target.value && set({ meeting_at: new Date(e.target.value).toISOString() })} /></div>
      </div>
      <label className="row small" style={{ gap: 6, margin: '-6px 0 12px', color: 'var(--text-2)' }}>
        <input type="checkbox" checked={!!m.series} onChange={e => set({ series: e.target.checked ? (m.title.trim() || null) : null })} />
        정기 회의 (같은 제목의 지난 회차 할 일을 이어서 봅니다)
      </label>
      <div className="field"><label>참석자</label>
        <div className="row">
          {people.map(p => {
            const on = (m.attendee_ids || []).includes(p.id);
            return (
              <button key={p.id} type="button" className={`chip${on ? ' chip-on' : ''}`}
                onClick={() => set({ attendee_ids: on ? (m.attendee_ids || []).filter(x => x !== p.id) : [...(m.attendee_ids || []), p.id] })}>
                <Avatar name={p.name} color={p.color} size={16} /> {p.name}
              </button>
            );
          })}
        </div>
        <input className="input" style={{ marginTop: 8 }} value={m.external_attendees || ''} onChange={e => set({ external_attendees: e.target.value })} placeholder="외부 참석자 (쉼표로 구분, 선택)" />
      </div>
      <div className="field"><label>관련 메인 업무 <span className="muted" style={{ fontWeight: 400 }}>(선택 · 할 일이 이 메인 업무로 등록되고 KPI 도 따라갑니다)</span></label>
        <input className="input" list="mt-groups" value={groupText} onChange={e => setGroupText(e.target.value)} placeholder="비워두면 회의 제목으로 메인 업무를 만듭니다" />
        <datalist id="mt-groups">{groupOptions.map(g => <option key={g.id} value={g.title} />)}</datalist>
        {unknownGroup && <div className="warn">목록에 없는 이름입니다. 목록에서 고르거나 비워두세요</div>}
      </div>

      <PrevItems m={m} />

      <section className="mt-sec">
        <div className="mt-sec-h">② 안건 <span className="small muted">선택</span></div>
        <textarea className="textarea" value={m.agenda || ''} onChange={e => set({ agenda: e.target.value })} placeholder="미리 적어두면 회의 전에 팀원이 볼 수 있습니다" style={{ minHeight: 56 }} />
      </section>
      <section className="mt-sec">
        <div className="mt-sec-h">③ 결정 사항 <span className="small muted">한 줄에 하나씩</span></div>
        <textarea className="textarea" value={m.decisions || ''} onChange={e => set({ decisions: e.target.value })} placeholder={'4분기 목표 유지, 11월에 재점검\n대시보드 10/31 오픈'} />
      </section>
      <section className="mt-sec">
        <div className="mt-sec-h">④ 할 일 <span className="small muted">담당자를 정하면 저장할 때 그 사람 업무로 등록됩니다</span></div>
        {items.map((it, n) => {
          const st = status(it);
          return (
            <div key={it.id || `new-${n}`} className="mt-edit-item">
              <input className="input" value={it.content} onChange={e => setItem(n, { content: e.target.value })} placeholder="할 일" />
              <select className="select" value={it.assignee_id || ''} onChange={e => setItem(n, { assignee_id: e.target.value || null })}>
                <option value="">담당 미정</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input className="input" type="date" value={it.due_date || ''} onChange={e => setItem(n, { due_date: e.target.value || null })} />
              <span className="mt-edit-st">
                {st.t ? <span className="small" style={{ cursor: 'pointer' }} onClick={() => onEditTask(st.t!)}>✓ 업무 등록됨</span> : <span className="small muted">{it.assignee_id ? '저장 시 등록' : ''}</span>}
                <button className="icon-btn" aria-label="할 일 빼기" onClick={() => setItems(x => x.filter((_, i) => i !== n))}>×</button>
              </span>
            </div>
          );
        })}
        <button className="btn btn-sm" onClick={() => setItems(x => [...x, blankItem()])}>+ 할 일 추가</button>
        {items.some(i => i.task_id) && <div className="small muted" style={{ marginTop: 6 }}>이미 등록된 할 일을 고치면 업무 내용·담당·마감도 같이 바뀝니다. 빼면 회의록에서만 빠지고 업무는 남습니다.</div>}
      </section>
      <section className="mt-sec">
        <div className="mt-sec-h">⑤ 메모 · 논의 내용 <span className="small muted">선택 · 자유롭게</span></div>
        <textarea className="textarea" value={m.notes || ''} onChange={e => set({ notes: e.target.value })} style={{ minHeight: 90 }} />
      </section>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="row">
        <button className="btn btn-danger" onClick={remove}>{m.id ? '삭제' : '작성 취소'}</button>
        <span className="spacer" />
        <button className="btn" onClick={() => onClose(m.id)}>닫기</button>
        {!isFinal && <button className="btn" onClick={saveDraft} disabled={busy}>임시 저장</button>}
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </div>
      {!isFinal && <div className="small muted" style={{ marginTop: 8, textAlign: 'right' }}>입력하는 동안 자동으로 임시 저장됩니다. 할 일은 「저장」을 눌러야 업무로 등록됩니다.</div>}
    </div>
  );
}

const blankItem = (assignee?: string | null): MeetingItem => ({ content: '', assignee_id: assignee ?? null, due_date: null, task_id: null, sort_order: 0 });
