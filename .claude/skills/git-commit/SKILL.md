---
name: git-commit
description: Use when creating any git commit in the 금옥이(geumoki) project — defines the commit message convention so every commit stays consistent (type prefix + Korean summary + optional body + co-author footer).
---

# 금옥이 커밋 컨벤션

금옥이 프로젝트에 커밋할 때는 **항상** 아래 형식을 따른다. 사용자가 매번 형식을 말하지 않아도 알아서 적용한다.

## 형식

```
<type>: <한국어 한 줄 요약 (50자 이내, 끝에 마침표 없음)>

<본문(선택): 무엇을 / 왜 바꿨는지 "- " 불릿 목록, 한국어>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

## type 종류

| type | 용도 |
|------|------|
| `feat` | 새 기능·동작 추가 |
| `fix` | 버그 수정 |
| `anim` | 금옥이 그림·애니메이션 변경 (스프라이트/프레임/모션) |
| `ui` | 말풍선·크기·위치 등 화면 표시 조정 |
| `refactor` | 동작 변화 없는 코드 정리 |
| `docs` | 문서·README |
| `chore` | 설정·빌드·자잘한 잡일 |

## 규칙

- 요약은 **한국어**, 동작 중심으로 ("추가", "수정", "제거", "이동")
- **한 커밋 = 한 주제**. 주제가 여러 개면 나눠서 커밋
- 본문은 필요할 때만. 사소한 변경은 요약 한 줄로 충분
- 마지막 줄에 **항상** `Co-Authored-By` 푸터
- 훅 우회(`--no-verify`)·서명 생략 금지

## 예시

```
anim: 배 호흡 제거하고 꼬리 흔들기만 유지
```
```
ui: 말풍선 위치 왼쪽 아래로 이동, 최대폭 260px
```
```
fix: 작업표시줄에 묻히지 않게 위치 올리고 최상단 재적용

- DROP 14→2 로 작업표시줄 상단 라인에 살짝만 닿게
- 2초마다 setAlwaysOnTop 재적용해 작업표시줄 앞 유지
```
