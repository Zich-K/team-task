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
  const { installed, canPrompt, alreadyInstalled, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  const p = platform();
  const guide = STEPS[p];
  const installNow = async () => { setHelp(false); await install(); };
  const showInstalled = alreadyInstalled && !canPrompt;
  return (
    <>
      <button type="button" className={`btn install-btn${canPrompt ? ' ready' : ''}`} onClick={async () => { if (!(await install())) setHelp(true); }}
        title={showInstalled ? '이 기기에 업무관리 앱이 이미 설치되어 있습니다' : '홈 화면·바탕화면에 아이콘 만들기'}>
        {Icon.download}<span>{showInstalled ? '앱 설치됨' : '앱 설치'}</span>
      </button>
      {help && showInstalled && (
        <Modal title="이미 설치되어 있습니다" onClose={() => setHelp(false)} actions={<button type="button" className="btn btn-primary" onClick={() => setHelp(false)}>확인</button>}>
          <p style={{ marginBottom: 12 }}>
            이 {p === 'pc' ? 'PC' : '휴대폰'}에 <b>업무관리 앱</b>이 이미 설치되어 있어서, 브라우저가 다시 설치하지 않습니다.
          </p>
          <div className="callout warn" style={{ marginBottom: 14, fontSize: 13 }}>
            <b>아이콘을 지웠는데도 이 안내가 나오면?</b> 아이콘만 지우면 브라우저 안에는 앱이 남아 있습니다.{' '}
            {p === 'pc'
              ? <>주소창에 <b>chrome://apps</b> (엣지는 <b>edge://apps</b>) 입력 → 「업무관리」 오른쪽 클릭 → <b>「Chrome에서 삭제」</b> 후 이 화면을 새로고침하고 다시 「앱 설치」를 누르세요.</>
              : p === 'ios' ? <>홈 화면에서 다시 추가하면 됩니다 (아래 3번).</>
              : <>휴대폰 <b>설정 → 애플리케이션 → 「업무관리」 → 삭제</b> 후 이 화면을 새로고침하고 다시 「앱 설치」를 누르세요.</>}
          </div>
          <ol className="install-steps">
            <li><span className="num">1</span><span>{p === 'pc' ? '바탕화면이나 시작 메뉴' : '홈 화면'}의 <b>「업무관리」 아이콘</b>으로 여세요.</span></li>
            <li><span className="num">2</span><span>지금 그 아이콘은 <b>예전 사이트</b>로 열릴 수 있습니다. 정식 전환 후에는 같은 아이콘이 <b>새 화면으로</b> 열리니 다시 설치할 필요가 없습니다.</span></li>
            <li><span className="num">3</span><span>시범판을 따로 아이콘으로 두고 싶으면 {p === 'pc'
              ? <>크롬 <b>⋮ → 「전송, 저장, 공유」 → 「페이지를 앱으로 설치」</b> (엣지는 <b>… → 「앱」 → 「이 사이트를 앱으로 설치」</b>)</>
              : p === 'ios' ? <>사파리 <b>공유(□↑) → 「홈 화면에 추가」</b></>
              : <>크롬 <b>⋮ → 「홈 화면에 추가」 → 「바로가기 만들기」</b></>}를 이용하세요.</span></li>
          </ol>
        </Modal>
      )}
      {help && !showInstalled && (
        <Modal title="앱 아이콘 만들기" onClose={() => setHelp(false)}
          actions={canPrompt
            ? <><button type="button" className="btn" onClick={() => setHelp(false)}>닫기</button><button type="button" className="btn btn-primary" onClick={installNow}>지금 설치</button></>
            : <button type="button" className="btn btn-primary" onClick={() => setHelp(false)}>확인</button>}>
          {canPrompt
            ? <div className="callout info" style={{ marginBottom: 14 }}>이제 바로 설치할 수 있습니다. 아래 「지금 설치」를 누르세요.</div>
            : p !== 'ios' && <div className="callout" style={{ marginBottom: 14, fontSize: 12.5 }}>
                브라우저가 아직 바로 설치를 허용하지 않았습니다. 이 창을 열어 둔 채 잠시(30초 정도) 기다리면 「지금 설치」 버튼이 나타날 수 있고, 아래 방법으로 직접 설치해도 됩니다.
              </div>}
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
