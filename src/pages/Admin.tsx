import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { KPI_STATUS_LABEL, type Kpi, type TaskGroup } from '../lib/types';
import { normTitle, similarity } from '../lib/logic';
import { Avatar, COLORS, Icon, Modal, Seg } from '../components/ui';
import { exportExcel, importExcel } from '../lib/excel';
import type { PageProps } from './Lists';

type Tab = 'groups' | 'kpis' | 'people' | 'data';

export function Admin(_: PageProps) {
  const [tab, setTab] = useState<Tab>('groups');
  return (
    <>
      <div className="section-head">
        <Seg value={tab} onChange={setTab} options={[['groups', '업무명 정리'], ['kpis', 'KPI 관리'], ['people', '팀원'], ['data', '엑셀']]} />
      </div>
      {tab === 'groups' && <Groups />}
      {tab === 'kpis' && <Kpis />}
      {tab === 'people' && <People />}
      {tab === 'data' && <DataTools />}
    </>
  );
}

function Groups() {
  const { data, views, backend, reload, toast, isLead } = useApp();
  const [q, setQ] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    views.forEach(v => m.set(v.group_id, (m.get(v.group_id) || 0) + 1));
    return m;
  }, [views]);
  const live = data.groups.filter(g => counts.get(g.id));

  const pairs = useMemo(() => {
    const out: { a: TaskGroup; b: TaskGroup; s: number }[] = [];
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const s = similarity(live[i].title, live[j].title);
      if (s >= threshold) out.push({ a: live[i], b: live[j], s });
    }
    return out.filter(p => !skip.has(p.a.id + p.b.id)).sort((x, y) => y.s - x.s);
  }, [live, threshold, skip]);

  async function merge(source: TaskGroup, target: TaskGroup) {
    if (!confirm(`「${source.title}」(${counts.get(source.id)}건)을 「${target.title}」로 합칠까요?\n원래 이름은 기록으로 남습니다.`)) return;
    try { await backend.mergeGroups(source.id, target.id); await reload(); toast('✓ 합쳤습니다'); }
    catch (e: any) { toast('실패: ' + e.message); }
  }
  async function rename(g: TaskGroup) {
    const t = prompt('새 이름', g.title);
    if (!t || t.trim() === g.title) return;
    const clash = data.groups.find(x => x.id !== g.id && x.norm_key === normTitle(t));
    if (clash) { toast(`「${clash.title}」와 같은 이름입니다. 합치기를 이용하세요`); return; }
    try { await backend.renameGroup(g.id, t); await reload(); toast('✓ 이름을 바꿨습니다'); }
    catch (e: any) { toast('실패: ' + e.message); }
  }

  const listed = live.filter(g => !q || normTitle(g.title).includes(normTitle(q))).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="two-col">
      <div className="card">
        <div className="card-head"><span className="card-title">같은 업무로 보이는 이름</span><span className="spacer" />
          <select className="select select-sm" value={threshold} onChange={e => setThreshold(Number(e.target.value))}>
            <option value={0.85}>아주 비슷한 것만</option><option value={0.7}>비슷한 것</option><option value={0.55}>조금 비슷한 것까지</option>
          </select></div>
        <div className="card-pad">
          <div className="callout info" style={{ marginBottom: 12 }}>띄어쓰기만 다른 이름은 이미 자동으로 합쳐졌습니다. 아래는 표기가 조금 다른 후보입니다. 같은 업무가 맞으면 남길 이름 쪽으로 합쳐주세요.</div>
          {pairs.map(({ a, b, s }) => (
            <div key={a.id + b.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>유사도 {Math.round(s * 100)}%</div>
              {[[a, b], [b, a]].map(([x, y]) => (
                <div key={x.id} className="row" style={{ marginBottom: 4 }}>
                  <span style={{ flex: 1 }}><b>{x.title}</b> <span className="small muted">{counts.get(x.id)}건</span></span>
                  {isLead && <button className="btn btn-sm" onClick={() => merge(y, x)}>이 이름으로 합치기</button>}
                </div>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => setSkip(p => new Set(p).add(a.id + b.id))}>다른 업무예요</button>
            </div>
          ))}
          {!pairs.length && <div className="empty">후보가 없습니다</div>}
          {!isLead && <div className="small muted">합치기는 팀장만 할 수 있습니다</div>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">메인 업무 전체 ({live.length})</span><span className="spacer" />
          <input className="input" style={{ width: 160 }} placeholder="찾기" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div style={{ maxHeight: 640, overflowY: 'auto' }}>
          {listed.map(g => (
            <div key={g.id} className="row" style={{ padding: '7px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1 }}>{g.title}</span><span className="small muted">{counts.get(g.id)}건</span>
              <button className="btn btn-sm btn-ghost" onClick={() => rename(g)}>이름 변경</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpis() {
  const { data, views, isLead, saveKpi } = useApp();
  const [edit, setEdit] = useState<{ k: Kpi; owners: string[] } | null>(null);
  const year = new Date().getFullYear();
  const blank = (): Kpi => ({
    id: `K${Math.max(0, ...data.kpis.filter(k => k.id.startsWith('K')).map(k => Number(k.id.slice(1)) || 0)) + 1}`, year, category: '인재육성', title: '',
    owner_text: '', period: '연간', note: '', sort_order: data.kpis.length, active: true, status: 'approved', measure: '', target: '', weight: null,
    created_by: null, lead_comment: '', submitted_at: null, approved_at: null,
  });
  const ownersOf = (id: string) => data.kpiOwners.filter(o => o.kpi_id === id).map(o => o.profile_id);
  return (
    <div className="card">
      <div className="card-head"><span className="card-title">KPI ({data.kpis.length})</span><span className="spacer" />
        {isLead && <button className="btn btn-primary btn-sm" onClick={() => setEdit({ k: blank(), owners: [] })}>KPI 추가</button>}</div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>번호</th><th>분류</th><th>KPI</th><th>담당</th><th>기간</th><th>연결 업무</th><th /></tr></thead>
          <tbody>
            {data.kpis.map(k => (
              <tr key={k.id}>
                <td><span className="badge badge-kpi">{k.id}</span>{k.status !== 'approved' && <div className="small muted">{KPI_STATUS_LABEL[k.status]}</div>}</td>
                <td className="small">{k.category}</td>
                <td>{k.title}{k.note && <div className="small muted">{k.note}</div>}</td>
                <td className="small">{ownersOf(k.id).map(id => data.profiles.find(p => p.id === id)?.name).join(', ')}</td>
                <td className="small">{k.period}</td>
                <td className="small">{views.filter(t => t.kpi_id === k.id).length}건</td>
                <td>{isLead && <button className="btn btn-sm" onClick={() => setEdit({ k, owners: ownersOf(k.id) })}>수정</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={data.kpis.some(k => k.id === edit.k.id) ? 'KPI 수정' : 'KPI 추가'} onClose={() => setEdit(null)}
          actions={<><button className="btn" onClick={() => setEdit(null)}>취소</button>
            <button className="btn btn-primary" disabled={!edit.k.title.trim()} onClick={async () => {
              const names = edit.owners.map(id => data.profiles.find(p => p.id === id)?.name).join(',');
              await saveKpi({ ...edit.k, owner_text: edit.owners.length === data.profiles.length ? '공통' : names }, edit.owners);
              setEdit(null);
            }}>저장</button></>}>
          <div className="grid-2">
            <div className="field"><label>분류</label>
              <input className="input" list="kpi-cats" value={edit.k.category} onChange={e => setEdit({ ...edit, k: { ...edit.k, category: e.target.value } })} />
              <datalist id="kpi-cats">{[...new Set(data.kpis.map(k => k.category))].map(c => <option key={c} value={c} />)}</datalist></div>
            <div className="field"><label>기간</label>
              <select className="select" value={edit.k.period} onChange={e => setEdit({ ...edit, k: { ...edit.k, period: e.target.value } })}>
                {['연간', '상반기', '하반기', '1분기', '2분기', '3분기', '4분기'].map(p => <option key={p}>{p}</option>)}</select></div>
          </div>
          <div className="field"><label>KPI 내용</label><input className="input" value={edit.k.title} onChange={e => setEdit({ ...edit, k: { ...edit.k, title: e.target.value } })} /></div>
          <div className="field"><label>담당자</label>
            <div className="row">{data.profiles.map(p => (
              <label key={p.id} className="row small" style={{ gap: 5 }}>
                <input type="checkbox" checked={edit.owners.includes(p.id)} onChange={e => setEdit({ ...edit, owners: e.target.checked ? [...edit.owners, p.id] : edit.owners.filter(x => x !== p.id) })} />{p.name}
              </label>))}</div></div>
          <div className="field"><label>비고</label><input className="input" value={edit.k.note} onChange={e => setEdit({ ...edit, k: { ...edit.k, note: e.target.value } })} /></div>
        </Modal>
      )}
    </div>
  );
}

function People() {
  const { data, backend, reload, toast, isLead } = useApp();
  async function save(id: string, patch: Record<string, unknown>) {
    try { await backend.saveProfile({ id, ...patch }); await reload(); toast('✓ 저장되었습니다'); }
    catch (e: any) { toast('실패: ' + e.message); }
  }
  return (
    <div className="card">
      <div className="card-head"><span className="card-title">팀원</span><span className="card-sub">로그인은 여기 등록된 이메일로만 가능합니다</span></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>이름</th><th>역할</th><th>로그인 이메일</th><th>색</th><th>가입</th></tr></thead>
          <tbody>
            {data.profiles.map(p => (
              <tr key={p.id}>
                <td><span className="who"><Avatar name={p.name} color={p.color} />{p.name}</span></td>
                <td className="small">{p.role === 'lead' ? '팀장' : '팀원'}</td>
                <td>{isLead
                  ? <input className="input" defaultValue={p.email || ''} placeholder="회사 이메일" onBlur={e => { const v = e.target.value.trim(); if (v !== (p.email || '')) save(p.id, { email: v || null }); }} />
                  : <span className="small">{p.email}</span>}</td>
                <td>{isLead
                  ? <select className="select select-sm" value={p.color} onChange={e => save(p.id, { color: e.target.value })}>{COLORS.map(c => <option key={c}>{c}</option>)}</select>
                  : p.color}</td>
                <td className="small">{p.auth_user_id ? '✓ 가입함' : <span className="muted">아직</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataTools() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className="two-col">
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 6 }}>엑셀로 내려받기</div>
        <p className="small muted" style={{ marginBottom: 12 }}>전체 업무를 엑셀 파일로 저장합니다 (기존 구글시트와 같은 칸 구성).</p>
        <button className="btn" onClick={() => exportExcel(app.views, app.data)}>{Icon.download} 내려받기</button>
      </div>
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 6 }}>엑셀로 한꺼번에 올리기</div>
        <p className="small muted" style={{ marginBottom: 12 }}>첫 줄에 mainTitle, subTitle, member, status, start, end, note (또는 메인 업무, 서브 업무, 담당자, 상태, 시작일, 마감일, 비고) 칸이 있는 파일.</p>
        <label className="btn btn-primary" style={{ opacity: busy ? .5 : 1 }}>
          {Icon.upload} {busy ? '올리는 중…' : '파일 선택'}
          <input type="file" accept=".xlsx,.csv" hidden disabled={busy} onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            setBusy(true);
            try { const n = await importExcel(f, app); app.toast(`✓ ${n}건 올렸습니다`); }
            catch (err: any) { app.toast('실패: ' + err.message); }
            finally { setBusy(false); }
          }} />
        </label>
      </div>
    </div>
  );
}
