import { supabase } from './supabase';
import type {
  AppData, Task, TaskGroup, Kpi, ReportSettings, Profile, Evaluation, EvaluationItem, EvalPeriod, KpiOwner,
} from './types';

export type TaskInput = Partial<Task> & { group_id: string };

export interface Backend {
  loadAll(): Promise<AppData>;
  saveTask(input: TaskInput): Promise<Task>;
  insertTasks(inputs: TaskInput[]): Promise<Task[]>;
  deleteTask(id: string): Promise<void>;
  createGroup(title: string): Promise<TaskGroup>;
  renameGroup(id: string, title: string): Promise<void>;
  mergeGroups(source: string, target: string): Promise<void>;
  saveReportSettings(s: ReportSettings): Promise<void>;
  saveKpi(k: Kpi, ownerIds: string[]): Promise<void>;
  saveProfile(p: Pick<Profile, 'id'> & Partial<Profile>): Promise<void>;
  listEvaluations(): Promise<{ evaluations: Evaluation[]; items: EvaluationItem[] }>;
  saveEvaluation(e: { profile_id: string; year: number; period: EvalPeriod } & Partial<Evaluation>, items: Omit<EvaluationItem, 'evaluation_id'>[]): Promise<Evaluation>;
  taskHistory(taskId: string): Promise<{ changed_at: string; changed_by: string | null; before: unknown; after: unknown }[]>;
}

async function all<T>(table: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = supabase.from(table).select('*').range(from, from + size - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < size) return out;
  }
}

const must = <T>(r: { data: T | null; error: any }): T => {
  if (r.error) throw r.error;
  return r.data as T;
};

const TASK_FIELDS = ['group_id', 'sub_title', 'title', 'assignee_id', 'status', 'start_date', 'end_date',
  'note', 'block_note', 'priority', 'kpi_id'] as const;
const pickTask = (t: TaskInput) => Object.fromEntries(TASK_FIELDS.filter(k => k in t).map(k => [k, (t as any)[k]]));

export const supabaseBackend: Backend = {
  async loadAll() {
    const [profiles, groups, kpis, kpiOwners, tasks, events, holidays, settings] = await Promise.all([
      all<Profile>('profiles', q => q.order('sort_order')),
      all<TaskGroup>('task_groups', q => q.is('merged_into', null)),
      all<Kpi>('kpis', q => q.order('sort_order')),
      all<KpiOwner>('kpi_owners'),
      all<Task>('tasks', q => q.is('deleted_at', null).order('created_at')),
      all<any>('calendar_events', q => q.is('deleted_at', null)),
      all<{ day: string }>('holidays'),
      all<{ key: string; value: any }>('app_settings', q => q.eq('key', 'report_settings')),
    ]);
    const rs = settings[0]?.value || {};
    return {
      profiles, groups, kpis, kpiOwners, tasks, events,
      holidays: holidays.map(h => h.day),
      reportSettings: { last: rs.last || {}, this: rs.this || {} },
    };
  },
  async saveTask(input) {
    const row = pickTask(input);
    if (input.id) return must(await supabase.from('tasks').update(row).eq('id', input.id).select().single());
    return must(await supabase.from('tasks').insert(row).select().single());
  },
  async insertTasks(inputs) {
    return must(await supabase.from('tasks').insert(inputs.map(pickTask)).select());
  },
  async deleteTask(id) {
    must(await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  },
  async createGroup(title) {
    const clean = title.trim();
    const existing = await supabase.from('task_groups').select('*').is('merged_into', null)
      .eq('norm_key', clean.toLowerCase().replace(/[\s_\-[\]()/·.,]/g, '')).maybeSingle();
    if (existing.data) return existing.data as TaskGroup;
    return must(await supabase.from('task_groups').insert({ title: clean }).select().single());
  },
  async renameGroup(id, title) {
    must(await supabase.from('task_groups').update({ title: title.trim() }).eq('id', id));
  },
  async mergeGroups(source, target) {
    must(await supabase.rpc('merge_task_groups', { source, target }));
  },
  async saveReportSettings(s) {
    must(await supabase.from('app_settings').upsert({ key: 'report_settings', value: s, updated_at: new Date().toISOString() }));
  },
  async saveKpi(k, ownerIds) {
    must(await supabase.from('kpis').upsert(k));
    must(await supabase.from('kpi_owners').delete().eq('kpi_id', k.id));
    if (ownerIds.length) must(await supabase.from('kpi_owners').insert(ownerIds.map(profile_id => ({ kpi_id: k.id, profile_id }))));
  },
  async saveProfile(p) {
    const { id, ...rest } = p;
    must(await supabase.from('profiles').update(rest).eq('id', id));
  },
  async listEvaluations() {
    const [evaluations, items] = await Promise.all([all<Evaluation>('evaluations'), all<EvaluationItem>('evaluation_items')]);
    return { evaluations, items };
  },
  async saveEvaluation(e, items) {
    const row = { ...e, updated_at: new Date().toISOString() };
    delete (row as any).id;
    const saved = must(await supabase.from('evaluations')
      .upsert(row, { onConflict: 'profile_id,year,period' }).select().single()) as Evaluation;
    must(await supabase.from('evaluation_items').delete().eq('evaluation_id', saved.id));
    const rows = items.filter(i => i.grade || i.comment).map(i => ({ ...i, evaluation_id: saved.id }));
    if (rows.length) must(await supabase.from('evaluation_items').insert(rows));
    return saved;
  },
  async taskHistory(taskId) {
    return must(await supabase.from('task_history').select('changed_at, changed_by, before, after')
      .eq('task_id', taskId).order('changed_at', { ascending: false }));
  },
};
