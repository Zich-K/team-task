import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import type { ReportItemSetting, ReportPanelSettings, ReportSettings, TaskView } from '../lib/types';
import { addDays, calcMain, fmtDate, fmtYM, formatWeekLabel, groupByMain, isLongRunning, normTitle, sundayOf, taskInWeek } from '../lib/logic';
import { Icon, Metric } from '../components/ui';
import type { PageProps } from './Lists';

interface Row { key: string; subs: TaskView[]; checked: boolean; highlighted: boolean }
type Key = 'last' | 'this';

const line = (subs: TaskView[]) => subs.map(s => `${s.sub_title || s.title || ''}(${s.status})`).join(', ');

/** 저장된 설정을 띄어쓰기 차이와 무관하게 찾는다 */
function lookup(s: ReportPanelSettings, title: string): ReportItemSetting {
  const n = normTitle(title);
  for (const [k, v] of Object.entries(s)) if (k !== 'order' && normTitle(k) === n) return v as ReportItemSetting;
  return {};
}

function buildRows(tasks: TaskView[], s: ReportPanelSettings): Row[] {
  const order = (s.order || []).map(normTitle);
  return [...groupByMain(tasks)]
    .map(([key, subs]) => { const v = lookup(s, key); return { key, subs, checked: v.checked !== false, highlighted: !!v.highlighted }; })
    .sort((a, b) => {
      const ai = order.indexOf(normTitle(a.key)), bi = order.indexOf(normTitle(b.key));
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

function toSettings(rows: Row[]): ReportPanelSettings {
  const s: ReportPanelSettings = { order: rows.map(r => r.key) };
  rows.forEach(r => { s[r.key] = { checked: r.checked, highlighted: r.highlighted }; });
  return s;
}

/** 주간 리포트(Weekly Executive Summary) — 지난주/이번주 선택·순서·강조 후 A4 출력 */
export function Report({ monday }: PageProps) {
  const { views, data, saveReportSettings } = useApp();
  const prevMon = addDays(monday, -7);
  const lastTasks = useMemo(() => views.filter(t => taskInWeek(t, prevMon)), [views, prevMon.getTime()]);
  const thisTasks = useMemo(() => views.filter(t => taskInWeek(t, monday)), [views, monday.getTime()]);

  const [rows, setRows] = useState<Record<Key, Row[]>>({ last: [], this: [] });
  useEffect(() => {
    setRows({ last: buildRows(lastTasks, data.reportSettings.last), this: buildRows(thisTasks, data.reportSettings.this) });
  }, [lastTasks, thisTasks, data.reportSettings]);

  const update = (k: Key, fn: (r: Row[]) => Row[]) => setRows(p => ({ ...p, [k]: fn([...p[k]]) }));
  const save = () => {
    const s: ReportSettings = { last: toSettings(rows.last), this: toSettings(rows.this) };
    saveReportSettings(s);
  };

  // 인쇄용 통합표: 지난주 → 이번주 순서로 합치고, 어느 쪽이든 체크된 메인 업무만
  const combined = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; last: TaskView[]; this: TaskView[]; hl: boolean }[] = [];
    const find = (k: Key, key: string) => rows[k].find(r => r.key === key);
    [...rows.last, ...rows.this].forEach(r => {
      if (seen.has(r.key)) return;
      const l = find('last', r.key), t = find('this', r.key);
      if (!(l?.checked || t?.checked)) return;
      seen.add(r.key);
      out.push({ key: r.key, last: l?.checked ? l.subs : [], this: t?.checked ? t.subs : [], hl: !!(l?.highlighted || t?.highlighted) });
    });
    return out;
  }, [rows]);

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Weekly Executive Summary</div>
          <div className="card-sub">{formatWeekLabel(prevMon)} → {formatWeekLabel(monday)}</div>
        </div>
        <span className="spacer" />
        <button className="btn no-print" onClick={save}>표시 설정 저장</button>
        <button className="btn btn-primary no-print" onClick={() => window.print()}>{Icon.print} A4 출력</button>
      </div>
      <div className="card-pad">
        <div className="metrics">
          <Metric label="전체 업무" value={views.length} sub="서브 업무 기준" />
          <Metric label="진행 중" value={thisTasks.filter(t => t.status === '진행 중').length} sub="이번 주 기준" tone="blue" />
          <Metric label="완료" value={thisTasks.filter(t => t.status === '완료').length} sub="이번 주 완료" tone="green" />
          <Metric label="3주 이상 진행" value={views.filter(t => isLongRunning(t)).length} sub="점검 필요" tone="red" />
        </div>
        <div className="no-print">
          <p className="small muted" style={{ marginBottom: 12 }}>표시할 업무를 고르고 순서를 정하세요. ★는 출력 시 노란 강조입니다. 끌어서 순서를 바꿀 수 있습니다.</p>
          <Panel title="지난주 선택" range={`${fmtDate(prevMon)} ~ ${fmtDate(addDays(prevMon, 6))}`} rows={rows.last} onChange={fn => update('last', fn)} color="var(--text-3)" />
          <Panel title="이번주 선택" range={`${fmtDate(monday)} ~ ${fmtDate(sundayOf(monday))}`} rows={rows.this} onChange={fn => update('this', fn)} color="var(--accent)" />
          <div className="section-title" style={{ margin: '20px 0 10px' }}>출력 미리보기</div>
        </div>
        <table className="print-table">
          <colgroup><col style={{ width: 36 }} /><col style={{ width: 170 }} /><col /><col /></colgroup>
          <thead><tr><th>#</th><th>메인 업무</th><th>지난주 한 일</th><th>이번주 진행 업무</th></tr></thead>
          <tbody>
            {combined.map((c, i) => (
              <tr key={c.key} className={c.hl ? 'hl' : ''}>
                <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-3)' }}>{i + 1}</td>
                <td style={{ fontWeight: 700 }}>{c.key}</td>
                <td>{c.last.length ? line(c.last) : <span className="muted">-</span>}</td>
                <td>{c.this.length ? line(c.this) : <span className="muted">-</span>}</td>
              </tr>
            ))}
            {!combined.length && <tr><td colSpan={4} className="empty">등록된 업무가 없습니다</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Panel({ title, range, rows, onChange, color }: {
  title: string; range: string; rows: Row[]; onChange: (fn: (r: Row[]) => Row[]) => void; color: string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => onChange(r => {
    if (to < 0 || to >= r.length) return r;
    const [x] = r.splice(from, 1); r.splice(to, 0, x); return r;
  });
  const set = (i: number, patch: Partial<Row>) => onChange(r => { r[i] = { ...r[i], ...patch }; return r; });
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ width: 4, height: 14, background: color, borderRadius: 2 }} />
        <b>{title}</b><span className="small muted">{range}</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((r, i) => {
          const info = calcMain(r.subs);
          return (
            <div key={r.key} className={`rep-row${r.highlighted ? ' hl' : ''}${drag === i ? ' dragging' : ''}`}
              draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
              onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }}>
              <span className="handle">⠿</span>
              <input type="checkbox" checked={r.checked} onChange={e => set(i, { checked: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <div className="mt">{r.key}<div className="small muted" style={{ fontWeight: 400 }}>{fmtYM(info.start)} ~ {fmtYM(info.end)}</div></div>
              <div className="st">{line(r.subs)}</div>
              <button className={`star${r.highlighted ? ' on' : ''}`} title="강조 (출력 시 노란 음영)" onClick={() => set(i, { highlighted: !r.highlighted })}>★</button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button className="btn btn-sm" style={{ padding: '0 6px' }} onClick={() => move(i, i - 1)}>▲</button>
                <button className="btn btn-sm" style={{ padding: '0 6px' }} onClick={() => move(i, i + 1)}>▼</button>
              </div>
            </div>
          );
        })}
        {!rows.length && <div className="empty">이 주차에 등록된 업무가 없습니다</div>}
      </div>
    </div>
  );
}
