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

/** 이미 앱(홈 화면 아이콘)으로 열려 있는가 */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export type Platform = 'ios' | 'samsung' | 'android' | 'pc';
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Android/.test(ua)) return 'android';
  return 'pc';
}

let snap = { canPrompt: false, installed: false };
const getSnap = () => {
  const next = { canPrompt: !!prompt, installed: installed || isStandalone() };
  if (next.canPrompt !== snap.canPrompt || next.installed !== snap.installed) snap = next;
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
