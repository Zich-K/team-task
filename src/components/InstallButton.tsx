import { useState } from 'react';
import { platform, useInstall, type Platform } from '../lib/install';
import { Icon, Modal } from './ui';

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  android: {
    title: '갤럭시·안드로이드 (크롬)',
    steps: [
      '오른쪽 위 ⋮ (점 세 개) 버튼을 누르세요',
      '「홈 화면에 추가」 또는 「앱 설치」를 누르세요',
      '「설치」(또는 「추가」)를 누르면 홈 화면에 회사 로고 아이콘이 생깁니다',
    ],
  },
  samsung: {
    title: '갤럭시 (삼성 인터넷)',
    steps: [
      '아래쪽 ≡ (줄 세 개) 버튼을 누르세요',
      '「현재 페이지 추가」 → 「홈 화면」을 누르세요',
      '「추가」를 누르면 홈 화면에 아이콘이 생깁니다',
    ],
  },
  ios: {
    title: '아이폰 (사파리)',
    steps: [
      '사파리로 열어주세요 (다른 앱 안에서 열었다면 사파리로 다시 열기)',
      '아래쪽 공유 버튼 (□↑)을 누르세요',
      '「홈 화면에 추가」 → 오른쪽 위 「추가」를 누르면 완료',
    ],
  },
  pc: {
    title: 'PC (크롬·엣지)',
    steps: [
      '주소창 오른쪽 끝의 설치 아이콘 (⊕ 또는 모니터 모양)을 누르세요',
      '아이콘이 없으면 크롬 ⋮ → 「전송, 저장, 공유」 → 「페이지를 앱으로 설치」, 엣지 … → 「앱」 → 「이 사이트를 앱으로 설치」',
      '「설치」를 누르면 바탕화면·시작 메뉴에 아이콘이 생깁니다',
    ],
  },
};

/** 화면 위쪽 「앱 설치」 버튼. 바로 설치할 수 있으면 설치 창을, 아니면 기기에 맞는 방법을 보여준다 */
export function InstallButton() {
  const { installed, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  const p = platform();
  const guide = STEPS[p];
  return (
    <>
      <button type="button" className="btn install-btn" onClick={async () => { if (!(await install())) setHelp(true); }} title="홈 화면·바탕화면에 아이콘 만들기">
        {Icon.download}<span>앱 설치</span>
      </button>
      {help && (
        <Modal title="앱 아이콘 만들기" onClose={() => setHelp(false)} actions={<button type="button" className="btn btn-primary" onClick={() => setHelp(false)}>확인</button>}>
          <div className="small muted" style={{ marginBottom: 12 }}>{guide.title}</div>
          <ol className="install-steps">
            {guide.steps.map((s, i) => <li key={i}><span className="num">{i + 1}</span><span>{s}</span></li>)}
          </ol>
          {(p === 'android' || p === 'samsung') && (
            <div className="callout" style={{ marginTop: 14, fontSize: 12.5 }}>
              메뉴에 「앱 설치」 대신 「앱에서 열기」만 보이면, 이전 업무관리 아이콘이 이미 설치되어 있는 것입니다. 그 아이콘을 그대로 쓰셔도 되고, 정식 전환 후에는 그 아이콘이 새 화면으로 열립니다.
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
