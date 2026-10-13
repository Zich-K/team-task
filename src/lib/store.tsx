import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData, Profile, TaskView, ReportSettings, Kpi } from './types';
import type { Backend, TaskInput } from './backend';
import { toViews } from './logic';

interface Ctx {
  backend: Backend;
  data: AppData;
  views: TaskView[];
  me: Profile | null;
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
    saveTask: (t, opts) => {
      if (t.id) setData(d => ({ ...d, tasks: d.tasks.map(x => (x.id === t.id ? { ...x, ...t } : x)) }));
      return run(() => backend.saveTask(t), opts?.quiet ? undefined : '✓ 저장되었습니다');
    },
    deleteTask: id => run(() => backend.deleteTask(id), '✓ 삭제되었습니다'),
    saveReportSettings: s => run(() => backend.saveReportSettings(s), '✓ 저장되었습니다'),
    saveKpi: (k, o) => run(() => backend.saveKpi(k, o), '✓ 저장되었습니다'),
    toast: onToast,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
