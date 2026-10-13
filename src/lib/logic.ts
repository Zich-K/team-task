// 기존 index.html 의 판단 규칙을 그대로 옮긴 것. 결과가 기존 화면과 같아야 한다.
import type { TaskView, Task, Profile, TaskGroup } from './types';

const DAY = 24 * 60 * 60 * 1000;

// ── 이름 정규화 (DB public.norm_title 과 같은 규칙) ──
export const normTitle = (s: string | null | undefined) =>
  String(s ?? '').toLowerCase().replace(/[\s_\-[\]()/·.,]/g, '');

// ── 날짜 ──
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const p = s.split('-');
  if (p.length === 2) return new Date(parseInt(p[0]), parseInt(p[1]) - 1, 1);
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function getWeekNum(monday: Date): number {
  const firstMonday = getMonday(new Date(monday.getFullYear(), monday.getMonth(), 1));
  return Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * DAY)) + 1;
}
export const formatWeekLabel = (monday: Date) =>
  `${monday.getFullYear()}년 ${monday.getMonth() + 1}월 ${getWeekNum(monday)}주차`;
export const fmtDate = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
export function fmtYM(str: string | null | undefined): string {
  if (!str) return '';
  const parts = str.slice(0, 10).split('-');
  if (parts.length < 2) return str;
  const m = parseInt(parts[1]);
  const d = parts[2] ? parseInt(parts[2]) : null;
  return d ? `${m}월 ${d}일` : `${m}월`;
}
export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const sundayOf = (monday: Date) => {
  const s = addDays(monday, 6);
  s.setHours(23, 59, 59, 999);
  return s;
};

/** 해당 주(월~일)에 걸친 업무인가 — 기존 taskInWeek 와 동일 */
export function taskInWeek(task: Task, monday: Date): boolean {
  const sun = sundayOf(monday);
  const start = parseDate(task.start_date);
  const end = parseDate(task.end_date);
  if (!start) return false;
  if (start > sun) return false;
  if (end && end < monday) return false;
  if (task.status === '완료' && end && end > sun) return false;
  return true;
}

// ── 영업일 ──
export function workingDaysBetween(from: Date, to: Date, holidays: Set<string>): number {
  let count = 0;
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  while (cur < end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(toISODate(cur))) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ── 업무 분류 ──
export function getTaskWeekNum(start: string | null, now = new Date()): number {
  const s = parseDate(start);
  if (!s) return 0;
  return Math.floor((now.getTime() - s.getTime()) / (7 * DAY)) + 1;
}
export const isLongRunning = (t: Task, now = new Date()) => t.status !== '완료' && getTaskWeekNum(t.start_date, now) >= 3;
export const isNewTask = (t: Task, now = new Date()) => now.getTime() - new Date(t.created_at).getTime() < 7 * DAY;
/** 최근 3영업일 안에 수정됨. 등록 직후 값(수정 없음)은 제외 */
export function isRecentlyModified(t: Task, holidays: Set<string>, now = new Date()): boolean {
  const mod = new Date(t.updated_at);
  if (mod.getTime() - new Date(t.created_at).getTime() < 60 * 1000) return false;
  return workingDaysBetween(mod, now, holidays) <= 3;
}
export type RowKind = 'done' | 'modified' | 'long' | 'new' | '';
export function rowKind(t: Task, holidays: Set<string>, now = new Date()): RowKind {
  if (t.status === '완료') return 'done';
  if (isRecentlyModified(t, holidays, now)) return 'modified';
  if (isLongRunning(t, now)) return 'long';
  if (isNewTask(t, now)) return 'new';
  return '';
}

// ── 메인 업무 묶기 ──
export function groupByMain<T extends TaskView>(tasks: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    const key = t.mainTitle || t.title || '미분류';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return map;
}
export function calcMain(subs: Task[]) {
  const starts = subs.map(s => s.start_date).filter(Boolean).sort() as string[];
  const ends = subs.map(s => s.end_date).filter(Boolean).sort() as string[];
  const total = subs.length;
  const done = subs.filter(s => s.status === '완료').length;
  return {
    start: starts[0] || '',
    end: ends[ends.length - 1] || '',
    total, done,
    allDone: done === total,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

export function toViews(tasks: Task[], groups: TaskGroup[], profiles: Profile[]): TaskView[] {
  const g = new Map(groups.map(x => [x.id, x.title]));
  const p = new Map(profiles.map(x => [x.id, x.name]));
  return tasks
    .filter(t => !t.deleted_at)
    .map(t => ({ ...t, mainTitle: g.get(t.group_id) || '미분류', member: (t.assignee_id && p.get(t.assignee_id)) || '' }));
}

// ── 비슷한 이름 찾기 (업무명 정리용) ──
function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    m.set(b, (m.get(b) || 0) + 1);
  }
  return m;
}
/** 0~1. '2026년'과 '26년'은 같게 보고, 숫자(연도·월 등)가 서로 다르면 다른 업무로 본다 */
export function similarity(a: string, b: string): number {
  const unify = (s: string) => normTitle(s).replace(/20(\d{2})년/g, '$1년');
  const ua = unify(a), ub = unify(b);
  const na = (ua.match(/\d+/g) || []).join(','), nb = (ub.match(/\d+/g) || []).join(',');
  if (na && nb && na !== nb) return 0;
  const x = ua.replace(/\d+(년|월|분기)?/g, ''), y = ub.replace(/\d+(년|월|분기)?/g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x), by = bigrams(y);
  let inter = 0;
  bx.forEach((n, k) => { inter += Math.min(n, by.get(k) || 0); });
  const total = Math.max(1, x.length - 1 + y.length - 1);
  return (2 * inter) / total;
}
