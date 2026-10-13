import { useState } from 'react';
import { useApp } from '../lib/store';
import { parseDate } from '../lib/logic';
import { Metric, Seg, StatusBadge, Icon } from '../components/ui';
import type { PageProps } from './Lists';

export const CATEGORY_ORDER = ['인재육성', '프로세스개선', '장기프로젝트'];

export function periodRange(mode: 'month' | 'quarter', year: number, idx: number) {
  if (mode === 'month') {
    return { start: new Date(year, idx, 1), end: new Date(year, idx + 1, 0, 23, 59, 59, 999), label: `${year}년 ${idx + 1}월` };
  }
  const sm = (idx - 1) * 3;
  return { start: new Date(year, sm, 1), end: new Date(year, sm + 3, 0, 23, 59, 59, 999), label: `${year}년 ${idx}분기` };
}

/** 성과 리포트 — 기존 renderPerf 와 같은 집계(마감일이 기간 안에 있는 업무) */
export function Perf({ onEdit }: PageProps) {
  const { views, data, approvedKpis } = useApp();
  const now = new Date();
  const [mode, setMode] = useState<'month' | 'quarter'>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [member, setMember] = useState('');

  const move = (dir: number) => {
    if (mode === 'month') {
      let m = month + dir, y = year;
      if (m > 11) { m = 0; y++; } if (m < 0) { m = 11; y--; }
      setMonth(m); setYear(y);
    } else {
      let q = quarter + dir, y = year;
      if (q > 4) { q = 1; y++; } if (q < 1) { q = 4; y--; }
      setQuarter(q); setYear(y);
    }
  };

  const { start, end, label } = periodRange(mode, year, mode === 'month' ? month : quarter);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tasks = views.filter(t => { const d = parseDate(t.end_date); return d && d >= start && d <= end; });
  const total = tasks.length;
  const done = tasks.filter(t => t.status === '완료').length;
  const doing = tasks.filter(t => t.status === '진행 중').length;
  const overdue = tasks.filter(t => t.status !== '완료' && parseDate(t.end_date)! < today).length;

  const counts = data.profiles.map(p => ({ p, n: tasks.filter(t => t.assignee_id === p.id).length }));
  const max = Math.max(1, ...counts.map(c => c.n));

  const kpiStats = approvedKpis.map(k => {
    const linked = tasks.filter(t => t.kpi_id === k.id);
    return { k, linked, done: linked.filter(t => t.status === '완료').length };
  });
  const byCat = new Map<string, typeof kpiStats>();
  kpiStats.forEach(s => { const c = s.k.category || '기타'; byCat.set(c, [...(byCat.get(c) || []), s]); });
  const cats = [...CATEGORY_ORDER.filter(c => byCat.has(c)), ...[...byCat.keys()].filter(c => !CATEGORY_ORDER.includes(c))];

  const detail = tasks.filter(t => !member || t.assignee_id === member).sort((a, b) =>
    a.member !== b.member ? a.member.localeCompare(b.member) : (a.end_date || '').localeCompare(b.end_date || ''));

  return (
    <>
      <div className="section-head">
        <Seg value={mode} onChange={setMode} options={[['month', '월별'], ['quarter', '분기별']]} />
        <span className="spacer" />
        <button className="icon-btn" onClick={() => move(-1)}>{Icon.left}</button>
        <b style={{ minWidth: 110, textAlign: 'center' }}>{label}</b>
        <button className="icon-btn" onClick={() => move(1)}>{Icon.right}</button>
      </div>
      <div className="metrics">
        <Metric label="전체 업무" value={total} sub="마감일 기준" />
        <Metric label="완료" value={done} sub={`${total ? Math.round(done / total * 100) : 0}%`} tone="green" />
        <Metric label="진행 중" value={doing} sub=" " tone="blue" />
        <Metric label="지연" value={overdue} sub="완료 안 됨" tone="red" />
      </div>
      <div className="two-col" style={{ marginBottom: 18 }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>담당자별 처리 현황</div>
          {counts.map(({ p, n }) => (
            <div key={p.id} className="hbar-row">
              <span>{p.name}</span>
              <span className="hbar"><i style={{ width: `${n ? Math.max(8, Math.round(n / max * 100)) : 0}%` }} /></span>
              <span className="small muted">{n}건</span>
            </div>
          ))}
        </div>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>KPI 연결 비율</div>
          {data.profiles.map(p => {
            const mine = tasks.filter(t => t.assignee_id === p.id);
            const linked = mine.filter(t => t.kpi_id).length;
            const pct = mine.length ? Math.round(linked / mine.length * 100) : 0;
            return (
              <div key={p.id} className="hbar-row">
                <span>{p.name}</span>
                <span className="hbar"><i style={{ width: `${pct}%`, background: 'var(--gray-500)' }} /></span>
                <span className="small muted">{pct}%</span>
              </div>
            );
          })}
          <div className="small muted">해당 기간 업무 중 KPI 에 연결된 비율</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <span className="card-title">업무 상세 내역 ({detail.length}건)</span><span className="spacer" />
          <select className="select select-sm" value={member} onChange={e => setMember(e.target.value)}>
            <option value="">전체</option>
            {data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>담당자</th><th>업무명</th><th className="hide-sm">메인 업무</th><th>KPI</th><th>상태</th><th>마감일</th></tr></thead>
            <tbody>
              {detail.map(t => {
                const late = t.status !== '완료' && parseDate(t.end_date)! < today;
                return (
                  <tr key={t.id} className="clickable" onClick={() => onEdit(t)}>
                    <td className="small">{t.member}</td>
                    <td>{t.title || t.mainTitle}</td>
                    <td className="small muted hide-sm">{t.mainTitle}</td>
                    <td className="small muted">{t.kpi_id ? data.kpis.find(k => k.id === t.kpi_id)?.title || t.kpi_id : '-'}</td>
                    <td>{late ? <span className="badge badge-red">지연</span> : <StatusBadge s={t.status} />}</td>
                    <td className="date-cell">{t.end_date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!detail.length && <div className="empty">해당 기간 업무가 없습니다</div>}
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 10 }}>KPI별 연결 현황</div>
      {cats.map(c => {
        const items = byCat.get(c)!;
        return (
          <div key={c} className="kpi-cat">
            <div className="kpi-cat-head"><span>{c}</span>
              <span className="small muted">{items.reduce((s, x) => s + x.done, 0)}/{items.reduce((s, x) => s + x.linked.length, 0)}건 완료</span></div>
            {items.map(({ k, linked, done }) => (
              <div key={k.id} className="kpi-card">
                <div className="top">
                  <div><div className="ttl">{k.title}</div><div className="own">{k.owner_text}</div></div>
                  <div className="small muted">{done}/{linked.length}건 완료</div>
                </div>
                <div className="bar"><i style={{ width: `${linked.length ? Math.round(done / linked.length * 100) : 0}%`, background: 'var(--info)' }} /></div>
                {linked.length
                  ? <ul className="kpi-list">{linked.map(t => <li key={t.id}><span className={t.status === '완료' ? 'ok' : ''}>{t.status === '완료' ? '✓' : '·'}</span> {t.title || t.mainTitle} <span className="muted">({t.member})</span></li>)}</ul>
                  : <div className="small muted" style={{ marginTop: 8 }}>이 기간 연결된 업무 없음</div>}
              </div>
            ))}
          </div>
        );
      })}
      {!cats.length && <div className="empty">KPI 데이터가 없습니다</div>}
    </>
  );
}
