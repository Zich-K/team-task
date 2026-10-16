import { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { KPI_STATUS_LABEL, type EvalPeriod, type Kpi, type KpiStatus } from '../lib/types';
import { evalRange, GRADES, PERIODS } from '../lib/evidence';
import { parseDate } from '../lib/logic';
import { Avatar, Modal, Seg } from '../components/ui';
import type { PageProps } from './Lists';

const STATUS_CLS: Record<KpiStatus, string> = { draft: 'badge-soft', submitted: 'badge-보류', approved: 'badge-완료', rejected: 'badge-red' };
const PERIOD_OPTIONS = ['연간', '상반기', '하반기', '1분기', '2분기', '3분기', '4분기'];

type Draft = Partial<Kpi> & { title: string; owner_ids?: string[] };

/** 내 KPI: 팀원이 직접 KPI 를 작성·제출하고, 팀장이 승인. 분기마다 KPI 별 실적·자기평가 작성 */
export function MyKpi(_: PageProps) {
  const { data, me, isLead, views, approvedKpis, saveMyKpi, decideKpi, deleteKpi, people } = useApp();
  const now = new Date();
  const [who, setWho] = useState(me?.id || '');
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState<EvalPeriod>(`Q${Math.floor(now.getMonth() / 3) + 1}` as EvalPeriod);
  const [edit, setEdit] = useState<Draft | null>(null);
  const self = who === me?.id;
  const person = data.profiles.find(p => p.id === who);

  const ownerOf = new Set(data.kpiOwners.filter(o => o.profile_id === who).map(o => o.kpi_id));
  const yearKpis = data.kpis.filter(k => k.year === year && k.active);
  // 팀장이 본인 화면을 볼 때는 팀 KPI 전체(K1~)를, 그 외에는 그 사람에게 배정된 팀 KPI 를 보여준다
  const teamAll = isLead && self;
  const teamKpis = yearKpis.filter(k => k.status === 'approved' && !k.created_by && (teamAll || ownerOf.has(k.id)))
    .sort((a, b) => a.sort_order - b.sort_order);
  const ownKpis = yearKpis.filter(k => k.created_by === who);
  const pending = data.kpis.filter(k => k.status === 'submitted' && k.active);
  // 수정·삭제: 팀장은 모든 KPI, 팀원은 본인이 작성한 KPI
  const canManage = (k: Kpi) => isLead || (!!k.created_by && k.created_by === me?.id);
  const remove = async (k: Kpi) => {
    const linked = views.filter(t => t.kpi_id === k.id).length;
    if (!confirm(`「${k.id} ${k.title}」 KPI 를 삭제할까요?${linked ? `\n연결된 업무 ${linked}건은 일상 업무로 표시됩니다 (업무 자체는 그대로).` : ''}`)) return;
    await deleteKpi(k.id);
  };
  const weightSum = ownKpis.filter(k => k.status !== 'rejected').reduce((s, k) => s + (k.weight || 0), 0);
  const linkedCount = (id: string) => views.filter(t => t.kpi_id === id && (teamAll || t.assignee_id === who) && t.end_date?.startsWith(String(year))).length;
  const ownerNames = (id: string) => data.kpiOwners.filter(o => o.kpi_id === id).map(o => data.profiles.find(p => p.id === o.profile_id)?.name).filter(Boolean).join(', ');

  const kpiCard = (k: Kpi, editable: boolean) => (
    <div key={k.id} className="kpi-card">
      <div className="top">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6, marginBottom: 4 }}>
            <span className="badge badge-kpi">{k.id}</span>
            <span className={`badge ${STATUS_CLS[k.status]}`}>{KPI_STATUS_LABEL[k.status]}</span>
            <span className="small muted">{k.category} · {k.period}{k.weight != null ? ` · 비중 ${k.weight}%` : ''}</span>
          </div>
          <div className="ttl">{k.title}</div>
          {teamAll && !k.created_by && <div className="small muted" style={{ marginTop: 2 }}>담당: {ownerNames(k.id) || '-'}</div>}
          {(k.measure || k.target) && <div className="small" style={{ marginTop: 4, color: 'var(--text-2)' }}>
            {k.measure && <>측정: {k.measure}</>}{k.measure && k.target && ' · '}{k.target && <>목표: {k.target}</>}</div>}
          {k.status === 'rejected' && k.lead_comment && <div className="callout warn small" style={{ marginTop: 8 }}>팀장 의견: {k.lead_comment}</div>}
          {k.status === 'approved' && k.lead_comment && <div className="small muted" style={{ marginTop: 6 }}>팀장 의견: {k.lead_comment}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="small muted">올해 연결 업무 {linkedCount(k.id)}건{teamAll && !k.created_by ? ' (팀 전체)' : ''}</div>
          {canManage(k) && (
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => setEdit({ ...k, owner_ids: data.kpiOwners.filter(o => o.kpi_id === k.id).map(o => o.profile_id) })}>수정</button>
              <button className="btn btn-sm btn-danger" onClick={() => remove(k)}>삭제</button>
              {editable && k.status !== 'approved' && k.status !== 'submitted' && <button className="btn btn-sm btn-primary" onClick={() => saveMyKpi({ id: k.id, title: k.title, status: isLead ? 'approved' : 'submitted' }, isLead ? '✓ 등록했습니다' : '✓ 제출했습니다')}>{isLead ? '등록' : '제출'}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="section-head">
        {isLead && people.map(p => (
          <button key={p.id} className={`btn btn-sm${who === p.id ? ' btn-primary' : ''}`} onClick={() => setWho(p.id)}>
            <Avatar name={p.name} color={p.color} size={18} />{p.name}
            {pending.some(k => k.created_by === p.id) && <span className="badge badge-보류" style={{ padding: '0 6px' }}>대기</span>}
          </button>
        ))}
        <span className="spacer" />
        <select className="select select-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>

      {isLead && pending.length > 0 && (
        <div className="card" style={{ marginBottom: 18, borderColor: 'var(--warn-line)' }}>
          <div className="card-head"><span className="card-title">승인 대기 ({pending.length})</span><span className="card-sub">팀원이 제출한 KPI</span></div>
          <div className="card-pad">{pending.map(k => <Decide key={k.id} k={k} name={data.profiles.find(p => p.id === k.created_by)?.name || ''} onDecide={decideKpi} />)}</div>
        </div>
      )}

      <div className="two-col" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">{self ? '내가 작성한 KPI' : `${person?.name} 님이 작성한 KPI`}</span>
            <span className={`card-sub${weightSum > 100 ? ' late-t' : ''}`}>비중 합계 {weightSum}%</span><span className="spacer" />
            {self && <button className="btn btn-sm btn-primary" onClick={() => setEdit({ title: '', category: '인재육성', period: '연간', year, measure: '', target: '', weight: null, note: '' })}>+ KPI 작성</button>}</div>
          <div className="card-pad">
            {ownKpis.map(k => kpiCard(k, self))}
            {!ownKpis.length && <div className="empty">{self ? '아직 작성한 KPI 가 없습니다. 「+ KPI 작성」으로 시작하세요.' : '작성한 KPI 가 없습니다'}</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">{teamAll ? `팀 KPI 전체 (${teamKpis.length})` : '배정된 팀 KPI'}</span>
            <span className="card-sub">{teamAll ? '팀원 전체 기준 · 담당자 표시' : '팀장이 정한 공통·담당 KPI'}</span></div>
          <div className="card-pad">
            {teamKpis.map(k => kpiCard(k, false))}
            {!teamKpis.length && <div className="empty">배정된 팀 KPI 가 없습니다</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <span className="card-title">실적 · 자기평가</span>
          <span className="card-sub">{self ? 'KPI 별로 이 기간에 한 일과 결과를 적어주세요. 팀장 평가 화면에 근거로 함께 보입니다.' : '본인이 작성한 내용 (읽기 전용)'}</span>
          <span className="spacer" /><Seg value={period} onChange={setPeriod} options={PERIODS} />
        </div>
        <div className="card-pad">
          {approvedKpis.filter(k => k.year === year && ownerOf.has(k.id)).map(k =>
            <ReviewRow key={k.id + period} k={k} who={who} year={year} period={period} editable={self} />)}
          {!approvedKpis.some(k => k.year === year && ownerOf.has(k.id)) && <div className="empty">승인된 KPI 가 있어야 실적을 쓸 수 있습니다</div>}
        </div>
      </div>

      {edit && <KpiForm draft={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Decide({ k, name, onDecide }: { k: Kpi; name: string; onDecide: (id: string, s: 'approved' | 'rejected', c: string) => Promise<void> }) {
  const [c, setC] = useState('');
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <b>{name}</b><span className="badge badge-kpi">{k.id}</span><span className="small muted">{k.category} · {k.period}{k.weight != null ? ` · 비중 ${k.weight}%` : ''}</span>
      </div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{k.title}</div>
      <div className="small" style={{ color: 'var(--text-2)', marginBottom: 8 }}>측정: {k.measure || '-'} · 목표: {k.target || '-'}{k.note ? ` · ${k.note}` : ''}</div>
      <div className="row">
        <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="의견 (반려 시 이유)" value={c} onChange={e => setC(e.target.value)} />
        <button className="btn btn-sm" onClick={() => { if (!c.trim()) { alert('반려 이유를 적어주세요'); return; } onDecide(k.id, 'rejected', c.trim()); }}>반려</button>
        <button className="btn btn-sm btn-primary" onClick={() => onDecide(k.id, 'approved', c.trim())}>승인</button>
      </div>
    </div>
  );
}

function KpiForm({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { data, isLead, people, saveMyKpi, saveKpi } = useApp();
  const [k, setK] = useState<Draft>(draft);
  const [owners, setOwners] = useState<string[]>(draft.owner_ids || []);
  const set = (patch: Partial<Kpi>) => setK(p => ({ ...p, ...patch }));
  const cats = [...new Set(data.kpis.map(x => x.category).concat(['인재육성', '프로세스개선', '장기프로젝트']))];
  // 팀장이 이미 있는 KPI 를 고칠 때: 담당자까지 함께 바꾼다
  const leadEdit = isLead && !!draft.id;
  const reapprove = !isLead && draft.status === 'approved';
  const save = async (status: KpiStatus) => {
    if (!k.title.trim()) { alert('KPI 내용을 입력해주세요'); return; }
    if (leadEdit) {
      const base = data.kpis.find(x => x.id === draft.id)!;
      const names = owners.map(id => data.profiles.find(p => p.id === id)?.name).filter(Boolean).join(',');
      const { owner_ids: _o, ...rest } = k;
      await saveKpi({ ...base, ...rest, title: k.title.trim(), status: 'approved',
        owner_text: owners.length && owners.length === people.length ? '공통' : names }, owners);
    } else {
      const { owner_ids: _o, ...rest } = k;
      await saveMyKpi({ ...rest, title: k.title.trim(), status }, status === 'draft' ? '✓ 임시 저장했습니다' : isLead ? '✓ 등록했습니다' : '✓ 제출했습니다');
    }
    onClose();
  };
  return (
    <Modal title={draft.id ? 'KPI 수정' : 'KPI 작성'} onClose={onClose}
      actions={<><button className="btn" onClick={onClose}>취소</button>
        {!leadEdit && <button className="btn" onClick={() => save('draft')}>임시 저장</button>}
        <button className="btn btn-primary" onClick={() => save(isLead ? 'approved' : 'submitted')}>{leadEdit ? '저장' : isLead ? '등록' : '팀장에게 제출'}</button></>}>
      {reapprove && <div className="callout warn small" style={{ marginBottom: 12 }}>이미 승인된 KPI 입니다. 고쳐서 제출하면 다시 팀장 승인을 받아야 합니다.</div>}
      <div className="grid-2">
        <div className="field"><label>분류</label>
          <input className="input" list="kpi-cat-list" value={k.category || ''} onChange={e => set({ category: e.target.value })} />
          <datalist id="kpi-cat-list">{cats.map(c => <option key={c} value={c} />)}</datalist></div>
        <div className="field"><label>기간</label>
          <select className="select" value={k.period || '연간'} onChange={e => set({ period: e.target.value })}>{PERIOD_OPTIONS.map(p => <option key={p}>{p}</option>)}</select></div>
      </div>
      <div className="field"><label>KPI 내용</label>
        <input className="input" value={k.title} onChange={e => set({ title: e.target.value })} placeholder="예: 월마감 리드타임 단축" autoFocus /></div>
      <div className="field"><label>측정 방법</label>
        <input className="input" value={k.measure || ''} onChange={e => set({ measure: e.target.value })} placeholder="무엇으로 달성 여부를 확인하나요? 예: 마감 시작~확정 영업일 수" /></div>
      <div className="grid-2">
        <div className="field"><label>목표</label>
          <input className="input" value={k.target || ''} onChange={e => set({ target: e.target.value })} placeholder="예: 평균 5일 → 3일" /></div>
        <div className="field"><label>비중 (%)</label>
          <input className="input" type="number" min={0} max={100} value={k.weight ?? ''} onChange={e => set({ weight: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })} placeholder="예: 30" /></div>
      </div>
      <div className="field"><label>비고</label>
        <textarea className="textarea" value={k.note || ''} onChange={e => set({ note: e.target.value })} placeholder="실행 계획, 참고 사항 등" /></div>
      {leadEdit && (
        <div className="field"><label>담당자 <span className="muted" style={{ fontWeight: 400 }}>(업무에서 이 KPI 는 담당자에게만 보입니다)</span></label>
          <div className="row">{people.map(p => (
            <label key={p.id} className="row small" style={{ gap: 5 }}>
              <input type="checkbox" checked={owners.includes(p.id)} onChange={e => setOwners(o => e.target.checked ? [...o, p.id] : o.filter(x => x !== p.id))} />{p.name}
            </label>))}</div></div>
      )}
      {!isLead && <div className="small muted">제출하면 팀장이 확인 후 승인합니다.</div>}
    </Modal>
  );
}

function ReviewRow({ k, who, year, period, editable }: { k: Kpi; who: string; year: number; period: EvalPeriod; editable: boolean }) {
  const { data, views, saveReview } = useApp();
  const saved = data.reviews.find(r => r.kpi_id === k.id && r.profile_id === who && r.year === year && r.period === period);
  const [text, setText] = useState(saved?.achievement || '');
  const [grade, setGrade] = useState<string | null>(saved?.self_grade || null);
  useEffect(() => { setText(saved?.achievement || ''); setGrade(saved?.self_grade || null); }, [saved?.achievement, saved?.self_grade]);
  const { start, end } = evalRange(year, period);
  const linked = views.filter(t => t.kpi_id === k.id && t.assignee_id === who && (() => { const d = parseDate(t.end_date); return !!d && d >= start && d <= end; })());
  const dirty = text !== (saved?.achievement || '') || grade !== (saved?.self_grade || null);
  return (
    <div className="review-row">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="badge badge-kpi">{k.id}</span><b style={{ fontSize: 13 }}>{k.title}</b>
        <span className="spacer" /><span className="small muted">이 기간 연결 업무 {linked.length}건 (완료 {linked.filter(t => t.status === '완료').length})</span>
      </div>
      {linked.length > 0 && <div className="small muted" style={{ marginBottom: 6 }}>{linked.slice(0, 6).map(t => t.title || t.sub_title).join(' · ')}{linked.length > 6 ? ` 외 ${linked.length - 6}건` : ''}</div>}
      {editable ? (
        <>
          <textarea className="textarea" value={text} onChange={e => setText(e.target.value)} placeholder="이 기간에 한 일, 결과(숫자가 있으면 좋아요), 어려웠던 점" />
          <div className="row" style={{ marginTop: 6 }}>
            <span className="small muted">자기평가</span>
            <div className="grade-pick">{GRADES.map(g => <button key={g} className={grade === g ? 'on' : ''} onClick={() => setGrade(grade === g ? null : g)}>{g}</button>)}</div>
            <span className="spacer" />
            {saved?.updated_at && <span className="small muted">저장 {new Date(saved.updated_at).toLocaleDateString('ko-KR')}</span>}
            <button className="btn btn-sm btn-primary" disabled={!dirty} onClick={() => saveReview({ kpi_id: k.id, profile_id: who, year, period, achievement: text.trim(), self_grade: grade })}>저장</button>
          </div>
        </>
      ) : (
        <div className="self-review">{saved ? <><b>{saved.self_grade ? `자기평가 ${saved.self_grade}` : ''}</b>{saved.achievement}</> : '아직 작성하지 않았습니다'}</div>
      )}
    </div>
  );
}
