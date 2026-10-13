import { useEffect, type ReactNode } from 'react';
import type { Status } from '../lib/types';

export const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  purple: { bg: '#f0ecfc', text: '#4a2d8a' },
  blue: { bg: '#e8eef7', text: '#1a3f6b' },
  green: { bg: '#eaf3e8', text: '#2d5a27' },
  amber: { bg: '#fdf3e3', text: '#7a4a10' },
  pink: { bg: '#fce4ec', text: '#880e4f' },
  teal: { bg: '#e1f5ee', text: '#0f6e56' },
};
export const COLORS = Object.keys(COLOR_MAP);

export function Avatar({ name, color, size = 22 }: { name: string; color?: string; size?: number }) {
  const c = COLOR_MAP[color || 'purple'] || COLOR_MAP.purple;
  return (
    <span className="av" style={{ width: size, height: size, background: c.bg, color: c.text, fontSize: Math.floor(size * 0.46) }}>
      {(name || '?')[0]}
    </span>
  );
}

export function Who({ name, color }: { name: string; color?: string }) {
  if (!name) return <span className="muted">-</span>;
  return <span className="who"><Avatar name={name} color={color} />{name}</span>;
}

export function StatusBadge({ s }: { s: Status }) {
  const cls = s === '진행 중' ? 'badge-진행' : `badge-${s}`;
  return <span className={`badge ${cls}`}>{s}</span>;
}

export function Modal({ title, onClose, children, wide, actions }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; actions?: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-title">{title}</div>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" className={`toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="track" />{children}
    </button>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={v} type="button" className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Metric({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'blue' | 'red' | 'green' }) {
  return (
    <div className={`card metric${tone ? ' ' + tone : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub !== undefined && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <span><i className="l-long" /> 3주 이상 진행</span>
      <span><i className="l-new" /> 신규 업무</span>
      <span><i className="l-mod" /> 최근 수정</span>
    </div>
  );
}

export const Icon = {
  plus: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 1v12M1 7h12" /></svg>,
  left: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9,2 4,7 9,12" /></svg>,
  right: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5,2 10,7 5,12" /></svg>,
  search: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>,
  menu: <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4h14M2 9h14M2 14h14" /></svg>,
  print: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="1" width="10" height="4" rx="1" /><path d="M3 12H2a1 1 0 01-1-1V6a1 1 0 011-1h12a1 1 0 011 1v5a1 1 0 01-1 1h-1" /><rect x="4" y="9" width="8" height="6" rx="1" /></svg>,
  dash: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="2" width="6" height="8" rx="1.5" /><rect x="10" y="2" width="6" height="5" rx="1.5" /><rect x="10" y="9" width="6" height="7" rx="1.5" /><rect x="2" y="12" width="6" height="4" rx="1.5" /></svg>,
  user: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="9" cy="6" r="3.2" /><path d="M2.5 16c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /></svg>,
  team: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="6.5" cy="6" r="2.6" /><circle cx="12.5" cy="7" r="2.1" /><path d="M1.5 15.5c.6-2.6 2.6-4.2 5-4.2s4.4 1.6 5 4.2M12 11.3c2.1 0 3.8 1.3 4.4 3.6" /></svg>,
  brief: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="3" width="14" height="13" rx="2" /><path d="M2 7h14M6 1.5v3M12 1.5v3" /></svg>,
  chart: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M2 16h14M4.5 13V8M9 13V4M13.5 13v-6" /></svg>,
  report: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 1.5h7l3.5 3.5v11.5H4z" /><path d="M7 9h5M7 12h5" /></svg>,
  star: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M9 1.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L1.8 7.1l5-.7z" /></svg>,
  target: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="9" r="7" /><circle cx="9" cy="9" r="4" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /></svg>,
  gear: <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="9" cy="9" r="2.5" /><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" /></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 9V1M4 4l3-3 3 3M1.5 10v2.5h11V10" /></svg>,
  download: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 1v8M4 6l3 3 3-3M1.5 10v2.5h11V10" /></svg>,
};
