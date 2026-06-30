# 금옥이 릴리스 자동화
# package.json 버전을 올리고, 커밋·태그·push 해서 GitHub Actions의 윈도우/맥 빌드를 트리거한다.
# (빌드가 끝나면 Releases 페이지에 exe / dmg / zip 이 자동으로 올라간다.)
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 patch   # 1.0.3 -> 1.0.4
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 minor   # 1.0.3 -> 1.1.0
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 major   # 1.0.3 -> 2.0.0
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 1.2.3   # 버전 직접 지정
#   (또는)  npm run release -- patch
#
# 릴리스 노트는 직접: 먼저 README의 "릴리스 / 버전 기록"에 새 버전 줄을 추가해 두면,
# 이 스크립트가 package.json 과 함께 그 README 변경도 같은 커밋에 담는다.
# (src/renderer/messages.js 같은 다른 작업 파일은 건드리지 않는다.)

param([string]$bump = "patch")

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# 1) 현재 버전 읽기
$pkgPath = Join-Path $root "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$cur = $pkg.version
$parts = $cur.Split('.') | ForEach-Object { [int]$_ }

# 2) 새 버전 계산
switch ($bump) {
  "patch" { $parts[2]++ }
  "minor" { $parts[1]++; $parts[2] = 0 }
  "major" { $parts[0]++; $parts[1] = 0; $parts[2] = 0 }
  default {
    if ($bump -match '^\d+\.\d+\.\d+$') {
      $parts = $bump.Split('.') | ForEach-Object { [int]$_ }
    } else {
      Write-Error "bump 은 patch | minor | major 또는 x.y.z 형식이어야 합니다: '$bump'"
      exit 1
    }
  }
}
$new = "$($parts[0]).$($parts[1]).$($parts[2])"

if ($new -eq $cur) { Write-Error "새 버전이 현재와 같습니다($cur)."; exit 1 }

# 같은 태그가 이미 있으면 중단
$existing = git tag --list "v$new"
if ($existing) { Write-Error "태그 v$new 가 이미 존재합니다."; exit 1 }

Write-Host "버전 $cur  ->  $new" -ForegroundColor Cyan

# 3) package.json 의 version 만 교체 (BOM 없이 저장)
$raw = Get-Content $pkgPath -Raw
$raw = $raw -replace '("version"\s*:\s*")[^"]+(")', "`${1}$new`${2}"
[System.IO.File]::WriteAllText($pkgPath, $raw, (New-Object System.Text.UTF8Encoding($false)))

# 4) package.json (+ 수정됐으면 README) 만 골라 커밋 — 다른 작업 파일은 그대로 둔다
git add -- $pkgPath
$readmeDirty = git status --porcelain -- README.md
if ($readmeDirty) { git add -- README.md; Write-Host "README 변경도 릴리스 커밋에 포함합니다." }
git commit -m "chore: 버전 $new 으로 올림"

# 5) 태그 + push (main 과 새 태그만)
git tag -a "v$new" -m "금옥이 v$new"
git push origin main "v$new"

Write-Host ""
Write-Host "푸시 완료 — GitHub Actions가 윈도우/맥 빌드를 시작합니다." -ForegroundColor Green
Write-Host "  진행 상황 : https://github.com/sunday-park/geumoki/actions"
Write-Host "  릴리스    : https://github.com/sunday-park/geumoki/releases/tag/v$new"
Write-Host ""
Write-Host "빌드 완료(약 3~6분) 후 위 릴리스 페이지에 exe / dmg / zip 이 올라옵니다."
