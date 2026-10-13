import type { AppData, Status, TaskView } from './types';
import { STATUSES } from './types';
import type { useApp } from './store';

type App = ReturnType<typeof useApp>;

const HEADERS: [string, string[]][] = [
  ['mainTitle', ['mainTitle', '메인 업무', '메인업무', '메인 업무명']],
  ['subTitle', ['subTitle', '서브 업무', '서브업무', '서브 업무명']],
  ['title', ['title', '업무명']],
  ['member', ['member', '담당자']],
  ['status', ['status', '상태']],
  ['start', ['start', '시작일']],
  ['end', ['end', '마감일']],
  ['note', ['note', '비고']],
  ['kpiId', ['kpiId', 'KPI']],
];

export async function exportExcel(views: TaskView[], data: AppData) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('업무');
  ws.columns = [
    { header: 'id', key: 'id', width: 16 }, { header: 'mainTitle', key: 'mainTitle', width: 30 },
    { header: 'subTitle', key: 'subTitle', width: 40 }, { header: 'title', key: 'title', width: 40 },
    { header: 'member', key: 'member', width: 10 }, { header: 'status', key: 'status', width: 9 },
    { header: 'start', key: 'start', width: 12 }, { header: 'end', key: 'end', width: 12 },
    { header: 'note', key: 'note', width: 30 }, { header: 'createdAt', key: 'createdAt', width: 12 },
    { header: 'priority', key: 'priority', width: 8 }, { header: 'blockNote', key: 'blockNote', width: 20 },
    { header: 'kpiId', key: 'kpiId', width: 8 }, { header: 'kpi', key: 'kpi', width: 36 },
  ];
  const kpi = new Map(data.kpis.map(k => [k.id, k.title]));
  views.forEach(t => ws.addRow({
    id: t.legacy_id || t.id, mainTitle: t.mainTitle, subTitle: t.sub_title, title: t.title, member: t.member,
    status: t.status, start: t.start_date || '', end: t.end_date || '', note: t.note, createdAt: t.created_at.slice(0, 10),
    priority: t.priority ?? '', blockNote: t.block_note, kpiId: t.kpi_id || '', kpi: kpi.get(t.kpi_id || '') || '',
  }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `팀업무_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text);
  if (typeof v === 'object' && 'result' in (v as any)) return cellText((v as any).result);
  return String(v).trim();
}

async function readRows(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) {
    return (await file.text()).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim())
      .map(l => l.split(',').map(v => v.trim().replace(/^"|"$/g, '')));
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, r => {
      const vals = (r.values as unknown[]).slice(1).map(cellText);
      rows.push(vals);
    });
    if (rows.some(r => r.some(c => HEADERS.some(([, names]) => names.includes(c))))) return rows;
  }
  return [];
}

export async function importExcel(file: File, app: App): Promise<number> {
  const rows = await readRows(file);
  const hi = rows.findIndex(r => r.some(c => ['mainTitle', 'title', '메인 업무', '메인업무', '메인 업무명'].includes(c)));
  if (hi < 0) throw new Error('제목 줄(mainTitle 또는 메인 업무)을 찾지 못했습니다');
  const head = rows[hi];
  const col = (key: string) => head.findIndex(h => HEADERS.find(([k]) => k === key)![1].includes(h));
  const get = (r: string[], key: string) => { const i = col(key); return i >= 0 ? (r[i] || '').trim() : ''; };

  const items = rows.slice(hi + 1).filter(r => r.some(Boolean)).map(r => {
    const main = get(r, 'mainTitle') || get(r, 'title');
    const sub = get(r, 'subTitle');
    return { main, sub, title: get(r, 'title') || sub || main, member: get(r, 'member'), status: get(r, 'status'), start: get(r, 'start'), end: get(r, 'end'), note: get(r, 'note'), kpi: get(r, 'kpiId') };
  }).filter(x => x.main || x.sub);
  if (!items.length) throw new Error('올릴 데이터가 없습니다');

  const groupIds = new Map<string, string>();
  for (const it of items) {
    const main = it.main || it.sub;
    if (!groupIds.has(main)) groupIds.set(main, await app.ensureGroup(main));
  }
  const date = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
  await app.backend.insertTasks(items.map(it => ({
    group_id: groupIds.get(it.main || it.sub)!,
    sub_title: it.sub, title: it.title,
    assignee_id: app.data.profiles.find(p => it.member && it.member.includes(p.name))?.id || null,
    status: (STATUSES.includes(it.status as Status) ? it.status : '예정') as Status,
    start_date: date(it.start), end_date: date(it.end), note: it.note,
    kpi_id: app.data.kpis.some(k => k.id === it.kpi) ? it.kpi : null, priority: 2,
  })));
  await app.reload();
  return items.length;
}
