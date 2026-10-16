# 병행 운영용 게시: 새 사이트를 main 브랜치의 v2/ 폴더에 올린다.
# 기존 사이트(main 루트의 index.html)는 건드리지 않는다.
# 사용: powershell -File scripts/publish-v2.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
# 배포용 임시 복사본은 바탕화면이 아닌 사용자 폴더 안(AppData)에 둔다
$wt = Join-Path $env:LOCALAPPDATA 'team-task-publish'
Set-Location $repo

$rev = (git rev-parse --short HEAD).Trim()
npm run build -- --base=/team-task/v2/ --outDir dist-v2
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

# 시범판은 기존 앱(/team-task/ 범위)과 별개 앱으로 설치되도록 식별자를 구분한다 (아이콘 이름은 정식과 같게: 사용자 요청)
$mf = Join-Path $repo 'dist-v2\manifest.json'
$m = Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json
$m | Add-Member -NotePropertyName id -NotePropertyValue '/team-task/v2/' -Force
# 이 기기에 시범판이나 예전 업무관리 앱이 이미 설치됐는지 화면에서 알 수 있게 둘 다 적는다
$m.related_applications = @(
  [pscustomobject]@{ platform = 'webapp'; url = 'https://zich-k.github.io/team-task/v2/manifest.json' },
  [pscustomobject]@{ platform = 'webapp'; url = 'https://zich-k.github.io/team-task/manifest.json' }
)
[IO.File]::WriteAllText($mf, ($m | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))

git fetch origin main
if (-not (Test-Path $wt)) { git worktree add $wt origin/main --detach } else { git -C $wt checkout --detach origin/main }

# 기존 사이트 파일이 그대로인지 확인 (v2 폴더 밖은 변경 금지)
$target = Join-Path $wt 'v2'
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
Copy-Item -Recurse (Join-Path $repo 'dist-v2') $target

git -C $wt add v2
$outside = git -C $wt status --porcelain | Where-Object { $_ -notmatch '^\S*\s+v2/' }
if ($outside) { throw "v2 밖의 파일이 바뀌었습니다: $outside" }
git -C $wt commit -m "publish v2 ($rev) — 새 사이트 병행 게시, 기존 사이트 그대로"
git -C $wt push origin HEAD:main
Remove-Item -Recurse -Force (Join-Path $repo 'dist-v2')
