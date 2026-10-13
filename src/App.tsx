import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, IS_DEMO } from './lib/supabase';
import { supabaseBackend, type Backend } from './lib/backend';
import { demoBackend, DEMO_PROFILE_ID } from './lib/demo';
import { AppProvider, useApp } from './lib/store';
import type { AppData, Profile, TaskView } from './lib/types';
import { addDays, formatWeekLabel, getMonday } from './lib/logic';
import { Avatar, Icon } from './components/ui';
import { TaskModal, type TaskDraft } from './components/TaskModal';
import { Dashboard, Members, Team, type PageProps } from './pages/Lists';
import { Briefing } from './pages/Briefing';
import { Perf } from './pages/Perf';
import { Report } from './pages/Report';
import { Evaluation } from './pages/Evaluation';
import { Admin } from './pages/Admin';
import { Login } from './pages/Login';

type PageId = 'dashboard' | 'members' | 'team' | 'briefing' | 'perf' | 'report' | 'eval' | 'admin';
const PAGES: { id: PageId; label: string; icon: ReactNode; week?: boolean; lead?: boolean; group: string; C: (p: PageProps) => ReactNode }[] = [
  { id: 'dashboard', label: '대시보드', icon: Icon.dash, group: '업무', C: Dashboard },
  { id: 'members', label: '팀원별 업무', icon: Icon.user, group: '업무', C: Members },
  { id: 'team', label: '팀 합본', icon: Icon.team, week: true, group: '업무', C: Team },
  { id: 'briefing', label: '위클리 브리핑', icon: Icon.brief, week: true, group: '업무', C: Briefing },
  { id: 'report', label: '주간 리포트', icon: Icon.report, week: true, group: '보고', C: Report },
  { id: 'perf', label: '성과 리포트', icon: Icon.chart, group: '보고', C: Perf },
  { id: 'eval', label: 'KPI 평가', icon: Icon.star, group: '평가', C: Evaluation },
  { id: 'admin', label: '관리', icon: Icon.gear, group: '설정', C: Admin },
];

export default function App() {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2500); return () => clearTimeout(id); }, [toast]);
  const onToast = useCallback((m: string) => setToast(m), []);
  return (
    <>
      {IS_DEMO ? <Loader backend={demoBackend} meId={DEMO_PROFILE_ID} onToast={onToast} /> : <AuthGate onToast={onToast} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function AuthGate({ onToast }: { onToast: (m: string) => void }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  return <Loader backend={supabaseBackend} authUserId={session.user.id} onToast={onToast} />;
}

function Loader({ backend, meId, authUserId, onToast }: { backend: Backend; meId?: string; authUserId?: string; onToast: (m: string) => void }) {
  const [data, setData] = useState<AppData | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { backend.loadAll().then(setData).catch(e => setErr(e.message || String(e))); }, [backend]);
  if (err) return <Splash msg={`불러오기 실패: ${err}`} />;
  if (!data) return <Splash />;
  const me = data.profiles.find(p => (meId ? p.id === meId : p.auth_user_id === authUserId)) || null;
  if (!me) return <NoAccess />;
  return <AppProvider backend={backend} initial={data} me={me} onToast={onToast}><Shell me={me} /></AppProvider>;
}

function Splash({ msg }: { msg?: string }) {
  return <div className="auth-wrap"><div className="muted">{msg || '불러오는 중…'}</div></div>;
}

function NoAccess() {
  return (
    <div className="auth-wrap"><div className="card auth-card">
      <h1>접근 권한이 없습니다</h1>
      <p className="lead">팀원 명단에 등록된 이메일이 아닙니다. 팀장에게 이메일 등록을 요청해 주세요.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>로그아웃</button>
    </div></div>
  );
}

function Shell({ me }: { me: Profile }) {
  const { isLead, views } = useApp();
  const [page, setPage] = useState<PageId>(() => (PAGES.find(p => p.id === location.hash.slice(1))?.id) || 'dashboard');
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { history.replaceState(null, '', '#' + page); }, [page]);
  const current = PAGES.find(p => p.id === page)!;
  const thisMonday = getMonday(new Date());
  const isThisWeek = monday.getTime() === thisMonday.getTime();
  const open = views.filter(t => t.status !== '완료');

  const props: PageProps = {
    monday, search,
    onEdit: (t: TaskView) => setDraft({ task: t }),
    onAdd: d => setDraft({ assigneeId: d?.assigneeId }),
  };

  let lastGroup = '';
  return (
    <div className="shell">
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">{Icon.dash}</div>
          <div><div className="brand-name">팀 업무 관리</div><div className="brand-sub">진행 중 {open.length}건{IS_DEMO ? ' · 예시 데이터' : ''}</div></div>
        </div>
        {PAGES.map(p => {
          const head = p.group !== lastGroup ? <div className="nav-label">{p.group}</div> : null;
          lastGroup = p.group;
          return (
            <div key={p.id}>
              {head}
              <button className={`nav-item${p.id === page ? ' active' : ''}`} onClick={() => { setPage(p.id); setNavOpen(false); }}>
                {p.icon}{p.id === 'eval' && !isLead ? '내 평가' : p.label}
              </button>
            </div>
          );
        })}
        <div className="sidebar-foot">
          <Avatar name={me.name} color={me.color} size={26} />
          <div className="grow"><b>{me.name}</b><div className="small muted">{me.role === 'lead' ? '팀장' : '팀원'}</div></div>
          {!IS_DEMO && <button className="btn btn-sm btn-ghost" onClick={() => supabase.auth.signOut()}>로그아웃</button>}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setNavOpen(true)} aria-label="메뉴">{Icon.menu}</button>
          <div className="page-title">{current.id === 'eval' && !isLead ? '내 평가' : current.label}</div>
          {current.week && (
            <div className="week-nav">
              <button onClick={() => setMonday(addDays(monday, -7))} aria-label="이전 주">{Icon.left}</button>
              <span className="label">{formatWeekLabel(monday)}</span>
              <button onClick={() => setMonday(addDays(monday, 7))} aria-label="다음 주">{Icon.right}</button>
              {!isThisWeek && <button className="today" onClick={() => setMonday(thisMonday)}>이번 주</button>}
            </div>
          )}
          {!['eval', 'admin', 'report'].includes(page) && (
            <div className="search">{Icon.search}<input className="input" placeholder="업무·담당자·KPI 검색" value={search} onChange={e => setSearch(e.target.value)} /></div>
          )}
          <button className="btn btn-primary" onClick={() => setDraft({})}>{Icon.plus}<span className="hide-sm">업무 추가</span></button>
        </header>
        <main className="content"><current.C {...props} /></main>
      </div>
      {draft && <TaskModal draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}
