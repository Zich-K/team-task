import { describe, expect, it } from 'vitest';
import { getMonday, getWeekNum, normTitle, similarity, taskInWeek, isLongRunning } from './logic';
import type { Task } from './types';

const task = (p: Partial<Task>): Task => ({
  id: 'x', legacy_id: null, group_id: 'g', sub_title: '', title: '', assignee_id: null, status: '진행 중',
  start_date: null, end_date: null, note: '', block_note: '', priority: 2, kpi_id: null, completed_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null, ...p,
});

describe('기존 규칙 유지', () => {
  it('띄어쓰기·기호만 다른 이름은 같은 키', () => {
    expect(normTitle('26년 4월 손익 마감')).toBe(normTitle('26년 4월 손익마감'));
    expect(normTitle('AI_대원')).toBe(normTitle('AI 대원'));
  });
  it('주차 계산 (월요일 기준, 기존 getWeekNum)', () => {
    const mon = getMonday(new Date(2026, 9, 13));
    expect(mon.getDate()).toBe(12);
    expect(getWeekNum(mon)).toBe(3);
  });
  it('taskInWeek: 완료 업무는 마감이 그 주를 넘으면 제외', () => {
    const mon = new Date(2026, 9, 12);
    expect(taskInWeek(task({ start_date: '2026-10-01', end_date: '2026-10-20' }), mon)).toBe(true);
    expect(taskInWeek(task({ status: '완료', start_date: '2026-10-01', end_date: '2026-10-20' }), mon)).toBe(false);
    expect(taskInWeek(task({ start_date: '2026-10-19', end_date: '2026-10-20' }), mon)).toBe(false);
    expect(taskInWeek(task({ start_date: '2026-10-01', end_date: '2026-10-09' }), mon)).toBe(false);
    expect(taskInWeek(task({ start_date: null, end_date: '2026-10-14' }), mon)).toBe(false);
  });
  it('3주 이상 진행: 시작 후 14일 지나면 3주차', () => {
    const now = new Date(2026, 9, 15);
    expect(isLongRunning(task({ start_date: '2026-10-01' }), now)).toBe(true);
    expect(isLongRunning(task({ start_date: '2026-10-02' }), now)).toBe(false);
    expect(isLongRunning(task({ start_date: '2026-10-01', status: '완료' }), now)).toBe(false);
  });
});

describe('비슷한 업무명', () => {
  it('연도 표기 차이는 같게, 월이 다르면 다르게', () => {
    expect(similarity('26년 1월 성과분석회의', '2026년 1월 성과분석회의')).toBe(1);
    expect(similarity('26년 1월 손익마감', '26년 2월 손익마감')).toBe(0);
    expect(similarity('2026년 인센티브', '2025년 인센티브')).toBe(0);
    expect(similarity('메가딜관리프로세스', '메가딜프로세스')).toBeGreaterThan(0.7);
  });
});
