import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { STATUSES, type Status, type TaskView } from '../lib/types';
import { normTitle, similarity } from '../lib/logic';
import { Modal } from './ui';

export interface TaskDraft {
  task?: TaskView;
  /** 새 업무 기본값 */
  mainTitle?: string;
  assigneeId?: string;
}

export function TaskModal({ draft, onClose }: { draft: TaskDraft; onClose: () => void }) {
  const { data, views, me, saveTask, ensureGroup, deleteTask } = useApp();
  const t = draft.task;
  const [mainTitle, setMainTitle] = useState(t?.mainTitle ?? draft.mainTitle ?? '');
  const [sub, setSub] = useState(t?.sub_title ?? '');
  const [assignee, setAssignee] = useState(t?.assignee_id ?? draft.assigneeId ?? me?.id ?? data.profiles[0]?.id ?? '');
  const [status, setStatus] = useState<Status>(t?.status ?? '예정');
  const [start, setStart] = useState(t?.start_date ?? '');
  const [end, setEnd] = useState(t?.end_date ?? '');
  const [note, setNote] = useState(t?.note ?? '');
  const [kpi, setKpi] = useState(t?.kpi_id ?? '');
  const [priority, setPriority] = useState(String(t?.priority ?? 2));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    views.forEach(v => m.set(v.group_id, (m.get(v.group_id) || 0) + 1));
    return m;
  }, [views]);

  const key = normTitle(mainTitle);
  const exact = data.groups.find(g => g.norm_key === key);
  const suggestions = useMemo(() => {
    const q = mainTitle.trim();
    const list = data.groups.map(g => ({ g, s: q ? Math.max(similarity(q, g.title), g.norm_key.includes(normTitle(q)) ? 0.9 : 0) : 0.5 }));
    return list.filter(x => !q || x.s >= 0.35).sort((a, b) => b.s - a.s || (counts.get(b.g.id) || 0) - (counts.get(a.g.id) || 0)).slice(0, 8);
  }, [mainTitle, data.groups, counts]);
  const similar = !exact && mainTitle.trim()
    ? data.groups.filter(g => similarity(mainTitle, g.title) >= 0.75).slice(0, 3) : [];

  // 담당자의 KPI 를 위로
  const myKpis = new Set(data.kpiOwners.filter(o => o.profile_id === assignee).map(o => o.kpi_id));
  const kpiOptions = [...data.kpis].sort((a, b) => Number(myKpis.has(b.id)) - Number(myKpis.has(a.id)) || a.sort_order - b.sort_order);

  async function save() {
    if (!mainTitle.trim()) { setErr('메인 업무명을 입력해주세요'); return; }
    if (start && end && end < start) { setErr('마감일이 시작일보다 빠릅니다'); return; }
    setBusy(true);
    try {
      const group_id = exact ? exact.id : await ensureGroup(mainTitle);
      await saveTask({
        id: t?.id, group_id, sub_title: sub.trim(), title: sub.trim() || mainTitle.trim(),
        assignee_id: assignee || null, status, start_date: start || null, end_date: end || null,
        note: note.trim(), kpi_id: kpi || null, priority: Number(priority) || null,
      });
      onClose();
    } catch { setBusy(false); }
  }

  async function remove() {
    if (!t || !confirm(`"${t.sub_title || t.title}" 업무를 삭제하시겠습니까?`)) return;
    await deleteTask(t.id);
    onClose();
  }

  return (
    <Modal title={t ? '업무 수정' : '업무 추가'} onClose={onClose}
      actions={<>
        {t && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>삭제</button>}
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <div className="field combo">
        <label>메인 업무명</label>
        <input className="input" value={mainTitle} placeholder="예: 월간 손익마감 (기존 이름에서 고르면 같은 묶음으로 들어갑니다)"
          onChange={e => { setMainTitle(e.target.value); setOpen(true); setErr(''); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} autoFocus={!t} />
        {open && suggestions.length > 0 && (
          <div className="combo-list">
            {suggestions.map(({ g }) => (
              <div key={g.id} className={`combo-item${exact?.id === g.id ? ' on' : ''}`} onMouseDown={() => { setMainTitle(g.title); setOpen(false); }}>
                <span>{g.title}</span><span className="cnt">{counts.get(g.id) || 0}건</span>
              </div>
            ))}
          </div>
        )}
        {exact && exact.title !== mainTitle.trim() && <div className="hint">기존 묶음 「{exact.title}」에 들어갑니다 (띄어쓰기 차이는 같은 업무로 봅니다)</div>}
        {!exact && mainTitle.trim() && <div className="hint">새 메인 업무로 만들어집니다</div>}
        {similar.length > 0 && <div className="warn">비슷한 이름이 이미 있어요: {similar.map(g => `「${g.title}」`).join(', ')} — 같은 업무라면 목록에서 골라주세요</div>}
      </div>
      <div className="field">
        <label>서브 업무명</label>
        <input className="input" value={sub} onChange={e => setSub(e.target.value)} placeholder="예: A법인 손익마감 진행" />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>담당자</label>
          <select className="select" value={assignee} onChange={e => setAssignee(e.target.value)}>
            {data.profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>상태</label>
          <select className="select" value={status} onChange={e => setStatus(e.target.value as Status)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>시작일</label>
          <input className="input" type="date" value={start ?? ''} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>마감일</label>
          <input className="input" type="date" value={end ?? ''} onChange={e => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>연결 KPI</label>
          <select className="select" value={kpi} onChange={e => setKpi(e.target.value)}>
            <option value="">일상 업무 (KPI 없음)</option>
            {kpiOptions.map(k => <option key={k.id} value={k.id}>{myKpis.has(k.id) ? '★ ' : ''}[{k.category}] {k.title}</option>)}
          </select>
          <div className="hint">★ = 담당자의 KPI</div>
        </div>
        <div className="field">
          <label>우선순위</label>
          <select className="select" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="1">① 높음</option><option value="2">② 보통</option><option value="3">③ 낮음</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>비고</label>
        <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="메모를 입력하세요" />
      </div>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
