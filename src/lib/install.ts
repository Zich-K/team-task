// 앱 설치(홈 화면 아이콘) 상태. 크롬·엣지가 주는 설치 요청을 잡아 두고 화면에 알린다.
import { useSyncExternalStore } from 'react';

type Prompt = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

let prompt: Prompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  prompt = e as Prompt;
  emit();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  prompt = null;
  emit();
});

// 이 기기에 업무관리 앱(예전 앱 또는 시범판)이 이미 설치돼 있는가 — 설치돼 있으면 크롬이 설치 창을 주지 않는다
let alreadyInstalled = false;
(navigator as any).getInstalledRelatedApps?.()
  .then((apps: unknown[]) => { if (apps?.length) { alreadyInstalled = true; emit(); } })
  .catch(() => {});

/** 이미 앱(홈 화면 아이콘)으로 열려 있는가 */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

/** 메신저·앱 안에서 열린 브라우저(설치 기능 없음)인가. 알 수 있으면 그 앱 이름 */
export function inAppBrowser(): string | null {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return '카카오톡';
  if (/NAVER\(inapp|NaverMatome|NAVER/.test(ua) && !/Whale/.test(ua)) return '네이버 앱';
  if (/Line\//.test(ua)) return '라인';
  if (/Instagram/.test(ua)) return '인스타그램';
  if (/FBAN|FBAV/.test(ua)) return '페이스북';
  if (/Teams\//.test(ua)) return 'Teams';
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return '앱 안 브라우저';
  return null;
}

/** 지금 주소를 휴대폰 기본 브라우저(크롬·사파리)로 다시 연다 */
export function openInRealBrowser() {
  const url = location.href;
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) { location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`; return; }
  if (/Android/.test(ua)) {
    // 크롬을 직접 지정해서 연다 (크롬이 없으면 휴대폰이 알아서 다른 브라우저를 고르게 함)
    const u = new URL(url);
    location.href = `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    return;
  }
  location.href = url;
}

export type Platform = 'ios' | 'samsung' | 'android' | 'pc';
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Android/.test(ua)) return 'android';
  return 'pc';
}

let snap = { canPrompt: false, installed: false, alreadyInstalled: false };
const getSnap = () => {
  const next = { canPrompt: !!prompt, installed: installed || isStandalone(), alreadyInstalled };
  if (next.canPrompt !== snap.canPrompt || next.installed !== snap.installed || next.alreadyInstalled !== snap.alreadyInstalled) snap = next;
  return snap;
};

export function useInstall() {
  const s = useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, getSnap);
  return {
    ...s,
    /** 설치 창을 띄운다. 띄울 수 없으면 false (안내를 보여줘야 함) */
    async install(): Promise<boolean> {
      if (!prompt) return false;
      const p = prompt;
      prompt = null;
      emit();
      await p.prompt();
      return true;
    },
  };
}
