import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// 안드로이드 크롬 등에서 '앱 설치'를 바로 띄울 수 있게 설치 요청을 잡아 둔다 (아이폰은 지원 안 함 → 안내 페이지)
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  (window as any).__installPrompt = e;
});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
