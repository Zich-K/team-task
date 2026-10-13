# team-task

팀 업무 관리 (v2). 화면은 React, 데이터는 Supabase(로그인·DB), 게시는 GitHub Pages.

- `src/` 화면. `src/lib/logic.ts` 는 기존 사이트의 판단 규칙(주차, 3주 이상 진행, 브리핑 배치 등)을 그대로 옮긴 것
- `supabase/migrations/` DB 구조와 권한
- `supabase/functions/legacy-sync` 구글시트 → DB 동기화 (전환 전까지 사용, 시트는 읽기만 함)
- `supabase/functions/register` 첫 로그인 비밀번호 만들기 (팀원 명단 이메일만)
- `supabase/functions/ai-evidence` 평가 근거 AI 분석 (팀장 전용, ANTHROPIC_API_KEY 필요)
- `scripts/verify.sql` 이관 검증 (원본 값과 칸별 대조)
- `legacy/` 기존 사이트 원본 (전환 검증이 끝날 때까지 보관)

미리보기: `npm run dev` 후 `http://localhost:5180/team-task/?demo` (가상 데이터)
