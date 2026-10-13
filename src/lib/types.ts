export type Status = '예정' | '진행 중' | '보류' | '완료';
export const STATUSES: Status[] = ['예정', '진행 중', '보류', '완료'];

export type Role = 'lead' | 'member';

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  color: string;
  sort_order: number;
  active: boolean;
  auth_user_id: string | null;
}

export interface TaskGroup {
  id: string;
  title: string;
  norm_key: string;
  merged_into: string | null;
  /** 메인 업무의 기본 KPI. 서브 업무는 이 값을 따라간다 */
  kpi_id: string | null;
}

export interface Kpi {
  id: string;
  year: number;
  category: string;
  title: string;
  owner_text: string;
  period: string;
  note: string;
  sort_order: number;
  active: boolean;
  status: KpiStatus;
  measure: string;
  target: string;
  weight: number | null;
  created_by: string | null;
  lead_comment: string;
  submitted_at: string | null;
  approved_at: string | null;
}

export type KpiStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export const KPI_STATUS_LABEL: Record<KpiStatus, string> = { draft: '작성 중', submitted: '승인 대기', approved: '승인됨', rejected: '반려' };

export interface KpiReview {
  id?: string;
  kpi_id: string;
  profile_id: string;
  year: number;
  period: EvalPeriod;
  achievement: string;
  self_grade: string | null;
  updated_at?: string;
}

export interface KpiOwner {
  kpi_id: string;
  profile_id: string;
}

export interface Task {
  id: string;
  legacy_id: string | null;
  group_id: string;
  sub_title: string;
  title: string;
  assignee_id: string | null;
  status: Status;
  start_date: string | null;
  end_date: string | null;
  note: string;
  block_note: string;
  priority: number | null;
  kpi_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CalendarEvent {
  id: string;
  type: 'leave' | 'meeting' | 'etc';
  title: string;
  event_date: string;
  event_time: string;
  profile_id: string | null;
}

export interface ReportItemSetting { checked?: boolean; highlighted?: boolean }
export type ReportPanelSettings = { order?: string[] } & Record<string, ReportItemSetting | string[] | undefined>;
export interface ReportSettings { last: ReportPanelSettings; this: ReportPanelSettings }

export type EvalPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Y';

export interface Evaluation {
  id: string;
  profile_id: string;
  year: number;
  period: EvalPeriod;
  overall_grade: string | null;
  overall_comment: string;
  evidence: unknown;
  ai_summary: string | null;
  status: 'draft' | 'released';
  released_at: string | null;
  updated_at: string;
}

export interface EvaluationItem {
  evaluation_id: string;
  kpi_id: string;
  grade: string | null;
  comment: string;
}

/** 화면에서 쓰는 업무: 묶음 이름·담당자 이름을 붙인 형태 */
export interface TaskView extends Task {
  mainTitle: string;
  member: string;
}

export interface AppData {
  profiles: Profile[];
  groups: TaskGroup[];
  kpis: Kpi[];
  kpiOwners: KpiOwner[];
  tasks: Task[];
  events: CalendarEvent[];
  holidays: string[];
  reportSettings: ReportSettings;
  reviews: KpiReview[];
}
