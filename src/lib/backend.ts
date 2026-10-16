import { supabase } from './supabase';
import type {
  AppData, Task, TaskGroup, Kpi, ReportSettings, Profile, Evaluation, EvaluationItem, EvalPeriod, KpiOwner, KpiReview,
  Meeting, MeetingItem,
} from './types';

const MEETING_FIELDS = ['title', 'series', 'meeting_at', 'attendee_ids', 'external_attendees', 'group_id', 'agenda', 'decisions', 'notes'] as const;
const pickMeeting = (m: Partial<Meeting>) => Object.fromEntries(MEETING_FIELDS.filter(f => f in m).map(f => [f, (m as any)[f]]));

const KPI_FIELDS = ['year', 'category', 'title', 'owner_text', 'period', 'note', 'sort_order', 'active', 'status', 'measure', 'target', 'weight'] as const;
const pickKpi = (k: Partial<Kpi>) => Object.fromEntries(KPI_FIELDS.filter(f => f in k).map(f => [f, (k as any)[f]]));

export type TaskInput = Partial<Task> & { group_id: string };

export interface Backend {
  loadAll(): Promise<AppData>;
  saveTask(input: TaskInput): Promise<Task>;
  insertTasks(inputs: TaskInput[]): Promise<Task[]>;
  deleteTask(id: string): Promise<void>;
  createGroup(title: string): Promise<TaskGroup>;
  renameGroup(id: string, title: string): Promise<void>;
  mergeGroups(source: string, target: string): Promise<void>;
  /** 메인 업무 기본 KPI 지정. fillEmpty 면 KPI 가 비어 있는 서브 업무에도 채운다 (이미 다른 KPI 인 업무는 그대로) */
  setGroupKpi(groupId: string, kpiId: string | null, fillEmpty: boolean): Promise<void>;
  /** 여러 업무에 KPI 연결 (제안 적용) */
  linkTasks(taskIds: string[], kpiId: string): Promise<void>;
  saveReportSettings(s: ReportSettings): Promise<void>;
  saveKpi(k: Kpi, ownerIds: string[]): Promise<void>;
  /** 내 KPI 작성·제출 (id 가 없으면 새로 만든다). 담당자는 만든 사람 */
  saveMyKpi(k: Partial<Kpi> & { title: string }, meId: string, asLead: boolean): Promise<void>;
  /** 팀장: 승인/반려 */
  decideKpi(id: string, status: 'approved' | 'rejected', comment: string): Promise<void>;
  saveReview(r: KpiReview): Promise<void>;
  /** 회의록 저장 (id 없으면 새로). 저장된 id 를 돌려준다 */
  upsertMeeting(m: Partial<Meeting> & { title: string }): Promise<string>;
  /** 회의록의 할 일 목록을 통째로 바꾼다 (빠진 항목은 지움, 연결된 업무는 그대로 남음) */
  replaceMeetingItems(meetingId: string, items: MeetingItem[]): Promise<void>;
  deleteMeeting(id: string): Promise<void>;
  saveProfile(p: Pick<Profile, 'id'> & Partial<Profile>): Promise<void>;
  addProfile(p: Pick<Profile, 'name' | 'email' | 'role' | 'color' | 'title'>): Promise<void>;
  /** 팀장: 로그인 초기화 (비밀번호 분실 시). 기록은 유지 */
  resetLogin(profileId: string): Promise<void>;
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
    const [profiles, groups, kpis, kpiOwners, tasks, events, holidays, settings, reviews, meetings, meetingItems] = await Promise.all([
      all<Profile>('profiles', q => q.order('sort_order')),
      all<TaskGroup>('task_groups', q => q.is('merged_into', null)),
      all<Kpi>('kpis', q => q.order('sort_order')),
      all<KpiOwner>('kpi_owners'),
      all<Task>('tasks', q => q.is('deleted_at', null).order('created_at')),
      all<any>('calendar_events', q => q.is('deleted_at', null)),
      all<{ day: string }>('holidays'),
      all<{ key: string; value: any }>('app_settings', q => q.eq('key', 'report_settings')),
      all<KpiReview>('kpi_reviews'),
      all<Meeting>('meetings', q => q.is('deleted_at', null).order('meeting_at', { ascending: false })),
      all<MeetingItem>('meeting_items', q => q.order('sort_order')),
    ]);
    const rs = settings[0]?.value || {};
    return {
      profiles, groups, kpis, kpiOwners, tasks, events, reviews, meetings, meetingItems,
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
  async setGroupKpi(groupId, kpiId, fillEmpty) {
    must(await supabase.from('task_groups').update({ kpi_id: kpiId }).eq('id', groupId));
    if (fillEmpty && kpiId) {
      must(await supabase.from('tasks').update({ kpi_id: kpiId }).eq('group_id', groupId).is('kpi_id', null).is('deleted_at', null));
    }
  },
  async linkTasks(taskIds, kpiId) {
    if (taskIds.length) must(await supabase.from('tasks').update({ kpi_id: kpiId }).in('id', taskIds).is('kpi_id', null));
  },
  async saveReportSettings(s) {
    must(await supabase.from('app_settings').upsert({ key: 'report_settings', value: s, updated_at: new Date().toISOString() }));
  },
  async saveKpi(k, ownerIds) {
    must(await supabase.from('kpis').upsert({ id: k.id, ...pickKpi(k) }));
    must(await supabase.from('kpi_owners').delete().eq('kpi_id', k.id));
    if (ownerIds.length) must(await supabase.from('kpi_owners').insert(ownerIds.map(profile_id => ({ kpi_id: k.id, profile_id }))));
  },
  async saveMyKpi(k, meId, asLead) {
    const row = pickKpi(k);
    if (k.id) {
      must(await supabase.from('kpis').update(row).eq('id', k.id));
      return;
    }
    const me = await supabase.from('profiles').select('name').eq('id', meId).single();
    const created = must(await supabase.from('kpis').insert({ ...row, created_by: meId, owner_text: me.data?.name || '' }).select('id').single()) as { id: string };
    // 팀원은 DB 가 자동으로 담당자를 넣고, 팀장은 직접 넣는다
    if (asLead) must(await supabase.from('kpi_owners').insert({ kpi_id: created.id, profile_id: meId }));
  },
  async decideKpi(id, status, comment) {
    must(await supabase.from('kpis').update({ status, lead_comment: comment }).eq('id', id));
  },
  async upsertMeeting(m) {
    const row = pickMeeting(m);
    if (m.id) {
      must(await supabase.from('meetings').update(row).eq('id', m.id));
      return m.id;
    }
    const created = must(await supabase.from('meetings').insert(row).select('id').single()) as { id: string };
    return created.id;
  },
  async replaceMeetingItems(meetingId, items) {
    const { data: existing } = await supabase.from('meeting_items').select('id').eq('meeting_id', meetingId);
    const keep = new Set(items.filter(i => i.id).map(i => i.id));
    const gone = (existing || []).map(r => r.id as string).filter(id => !keep.has(id));
    if (gone.length) must(await supabase.from('meeting_items').delete().in('id', gone));
    const rows = items.map((i, n) => ({
      id: i.id, meeting_id: meetingId, content: i.content, assignee_id: i.assignee_id,
      due_date: i.due_date, task_id: i.task_id, sort_order: n,
    }));
    const olds = rows.filter(r => r.id), news = rows.filter(r => !r.id).map(({ id: _id, ...r }) => r);
    if (olds.length) must(await supabase.from('meeting_items').upsert(olds));
    if (news.length) must(await supabase.from('meeting_items').insert(news));
  },
  async deleteMeeting(id) {
    must(await supabase.from('meetings').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  },
  async saveReview(r) {
    const { id: _id, updated_at: _u, ...row } = r;
    must(await supabase.from('kpi_reviews').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'kpi_id,profile_id,year,period' }));
  },
  async addProfile(p) {
    const { data: last } = await supabase.from('profiles').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    must(await supabase.from('profiles').insert({ ...p, email: p.email?.trim().toLowerCase() || null, sort_order: (last?.sort_order ?? 0) + 1 }));
  },
  async resetLogin(profileId) {
    const { data, error } = await supabase.functions.invoke('reset-login', { body: { profileId } });
    if (error || !data?.ok) throw new Error(data?.error || error?.message || '초기화 실패');
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
