import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/ui';

/** 이메일 + 비밀번호 로그인. 처음 사용하는 팀원은 '처음 사용' 에서 비밀번호를 만든다 (팀원 명단에 등록된 이메일만 가능). */
export function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (mode === 'register') {
      if (pw.length < 8) { setErr('비밀번호는 8자 이상으로 정해주세요'); return; }
      if (pw !== pw2) { setErr('비밀번호 확인이 다릅니다'); return; }
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.functions.invoke('register', { body: { email, password: pw } });
        if (error || !data?.ok) throw new Error(data?.error || '등록에 실패했습니다');
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 맞지 않습니다' : error.message);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand-mark" style={{ width: 40, height: 40 }}>{Icon.dash}</div>
        <h1>팀 업무 관리</h1>
        <p className="lead">{mode === 'login' ? '회사 이메일로 로그인하세요' : '처음 사용하시나요? 팀장이 등록한 이메일로 비밀번호를 만드세요'}</p>
        <div className="field"><label>이메일</label><input className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="field"><label>비밀번호</label><input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={pw} onChange={e => setPw(e.target.value)} /></div>
        {mode === 'register' && <div className="field"><label>비밀번호 확인</label><input className="input" type="password" autoComplete="new-password" required value={pw2} onChange={e => setPw2(e.target.value)} /></div>}
        <button className="btn btn-primary" style={{ width: '100%', padding: 10 }} disabled={busy}>{busy ? '확인 중…' : mode === 'login' ? '로그인' : '비밀번호 만들고 시작하기'}</button>
        {err && <div className="err">{err}</div>}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
            {mode === 'login' ? '처음 사용하시나요?' : '이미 비밀번호가 있어요'}
          </button>
        </div>
      </form>
    </div>
  );
}
