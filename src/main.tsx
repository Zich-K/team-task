import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// 크롬·엣지의 설치 요청은 화면이 뜨기 전에 올 수 있어 먼저 잡아 둔다 (lib/install)
import './lib/install';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
