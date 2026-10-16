import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData, Profile, TaskView, ReportSettings, Kpi, KpiReview, Meeting, MeetingItem } from './types';
import type { Backend, TaskInput } from './backend';
import { toViews } from './logic';

interface Ctx {
  backend: Backend;
  data: AppData;
  views: TaskView[];
  me: Profile | null;
  /** 현재 활동 중인 팀원 (비활성 팀원은 목록·선택에서 빠지고, 지난 기록에는 이름이 남는다) */
  people: Profile[];
  isLead: boolean;
  holidays: Set<string>;
  profileName: (id: string | null) => string;
  reload: () => Promise<void>;
  /** quiet: 우선순위·메모처럼 바로 반영하고 알림 없이 저장 */
  saveTask: (t: TaskInput, opts?: { quiet?: boolean }) => Promise<void>;
  /** 메인 업무 이름으로 묶음을 찾거나 새로 만든다 */
  ensureGroup: (title: string) => Promise<string>;
  deleteTask: (id: string) => Promise<void>;
  saveReportSettings: (s: ReportSettings) => Promise<void>;
  saveKpi: (k: Kpi, owners: string[]) => Promise<void>;
  /** 승인된 KPI 만 (업무 연결·성과·평가에 사용) */
  approvedKpis: Kpi[];
  saveMyKpi: (k: Partial<Kpi> & { title: string }, ok?: string) => Promise<void>;
  decideKpi: (id: string, status: 'approved' | 'rejected', comment: string) => Promise<void>;
  saveReview: (r: KpiReview) => Promise<void>;
  setGroupKpi: (groupId: string, kpiId: string | null, fillEmpty: boolean) => Promise<void>;
  /** 회의록 저장. 담당자가 정해진 할 일은 업무로 등록(또는 이미 등록된 업무를 고침)한다. 저장된 회의록 id 반환 */
  saveMeeting: (m: Partial<Meeting> & { title: string }, items: MeetingItem[], opts?: { draft?: boolean; quiet?: boolean }) => Promise<string>;
  deleteMeeting: (id: string) => Promise<void>;
  linkTasks: (taskIds: string[], kpiId: string) => Promise<void>;
  toast: (msg: string) => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider 밖에서 사용됨');
  return c;
};

export function AppProvider({ backend, initial, me, children, onToast }: {
  backend: Backend; initial: AppData; me: Profile | null; children: ReactNode; onToast: (m: string) => void;
}) {
  const [data, setData] = useState(initial);
  useEffect(() => setData(initial), [initial]);

  const views = useMemo(() => toViews(data.tasks, data.groups, data.profiles), [data]);
  const holidays = useMemo(() => new Set(data.holidays), [data.holidays]);
  const profileName = useCallback((id: string | null) => data.profiles.find(p => p.id === id)?.name || '', [data.profiles]);

  const reload = useCallback(async () => setData(await backend.loadAll()), [backend]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await reload();
      if (ok) onToast(ok);
    } catch (e: any) {
      onToast('저장 실패: ' + (e?.message || e));
      throw e;
    }
  }, [reload, onToast]);

  const ensureGroup = useCallback(async (title: string) => {
    const g = await backend.createGroup(title);
    setData(d => (d.groups.some(x => x.id === g.id) ? d : { ...d, groups: [...d.groups, g] }));
    return g.id;
  }, [backend]);

  const value: Ctx = {
    backend, data, views, me, holidays, profileName, reload, ensureGroup,
    isLead: me?.role === 'lead',
    people: data.profiles.filter(p => p.active),
    saveTask: (t, opts) => {
      if (t.id) setData(d => ({ ...d, tasks: d.tasks.map(x => (x.id === t.id ? { ...x, ...t } : x)) }));
      return run(() => backend.saveTask(t), opts?.quiet ? undefined : '✓ 저장되었습니다');
    },
    deleteTask: id => run(() => backend.deleteTask(id), '✓ 삭제되었습니다'),
    saveReportSettings: s => run(() => backend.saveReportSettings(s), '✓ 저장되었습니다'),
    saveKpi: (k, o) => run(() => backend.saveKpi(k, o), '✓ 저장되었습니다'),
    approvedKpis: data.kpis.filter(k => k.status === 'approved'),
    saveMyKpi: (k, ok) => run(() => backend.saveMyKpi(k, me!.id, me?.role === 'lead'), ok || '✓ 저장되었습니다'),
    decideKpi: (id, s, c) => run(() => backend.decideKpi(id, s, c), s === 'approved' ? '✓ 승인했습니다' : '반려했습니다'),
    saveReview: r => run(() => backend.saveReview(r), '✓ 실적을 저장했습니다'),
    saveMeeting: async (m, items, opts) => {
      // 임시 저장: 회의록·할 일만 보관하고 업무 등록은 하지 않는다
      if (opts?.draft) {
        try {
          const id = await backend.upsertMeeting({ ...m, status: 'draft' });
          await backend.replaceMeetingItems(id, items.filter(i => i.content.trim()).map(i => ({ ...i, content: i.content.trim() })));
          await reload();
          if (!opts.quiet) onToast('✓ 임시 저장했습니다 (할 일은 최종 저장 때 업무로 등록됩니다)');
          return id;
        } catch (e: any) {
          if (!opts.quiet) onToast('임시 저장 실패: ' + (e?.message || e));
          throw e;
        }
      }
      try {
        const id = await backend.upsertMeeting({ ...m, status: 'final' });
        // 할 일의 메인 업무: 회의록의 메인 업무, 없으면 회의 제목으로 메인 업무를 만든다
        let groupId = m.group_id || null;
        const needTask = items.some(i => i.content.trim() && i.assignee_id);
        if (!groupId && needTask) groupId = (await backend.createGroup(m.title)).id;
        const groupKpi = data.groups.find(g => g.id === groupId)?.kpi_id || null;
        const day = (m.meeting_at || new Date().toISOString()).slice(0, 10);
        const saved: MeetingItem[] = [];
        for (const it of items) {
          const content = it.content.trim();
          if (!content) continue;
          let taskId = it.task_id;
          if (it.assignee_id && !taskId) {
            const t = await backend.saveTask({
              group_id: groupId!, sub_title: content, title: content, assignee_id: it.assignee_id, status: '예정',
              start_date: day, end_date: it.due_date, kpi_id: groupKpi, priority: 2, note: `회의: ${m.title}`,
            });
            taskId = t.id;
          } else if (taskId) {
            const t = data.tasks.find(x => x.id === taskId);
            if (t && (t.sub_title !== content || t.assignee_id !== it.assignee_id || t.end_date !== it.due_date)) {
              await backend.saveTask({ id: taskId, group_id: t.group_id, sub_title: content, title: content, assignee_id: it.assignee_id, end_date: it.due_date });
            }
          }
          saved.push({ ...it, content, task_id: taskId });
        }
        await backend.replaceMeetingItems(id, saved);
        await reload();
        const made = saved.filter(s => s.task_id && !items.find(i => i.id === s.id && i.task_id)).length;
        onToast(made ? `✓ 저장했습니다 · 할 일 ${made}건을 업무로 등록` : '✓ 저장했습니다');
        return id;
      } catch (e: any) {
        onToast('저장 실패: ' + (e?.message || e));
        throw e;
      }
    },
    deleteMeeting: id => run(() => backend.deleteMeeting(id), '회의록을 삭제했습니다 (등록된 업무는 그대로 남습니다)'),
    setGroupKpi: (g, k, fill) => run(() => backend.setGroupKpi(g, k, fill), k ? '✓ 메인 업무 KPI 를 정했습니다' : 'KPI 지정을 풀었습니다'),
    linkTasks: (ids, k) => run(() => backend.linkTasks(ids, k), `✓ ${ids.length}건을 ${k} 에 연결했습니다`),
    toast: onToast,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
