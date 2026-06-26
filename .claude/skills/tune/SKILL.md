---
name: tune
description: Use when the user asks to adjust any 금옥이(geumoki) numeric feel/physics/animation constant — e.g. "BELLY_AMP 0.14로", "cx 52", "HURT_IMPACT 20으로", "더 무겁게 튕기게", "숨쉬기 약하게". Maps the request to the exact constant + file location, edits it, validates with node --check, and gives the physics↔pixel conversion when drop height is involved.
---

# 금옥이 수치 튜닝

금옥이의 "느낌"을 결정하는 상수들은 두 파일에 흩어져 있다. 사용자가
**"무엇을 어떤 값으로"** 또는 **"더 ~하게"** 식으로 말하면, 이 표에서 정확한
위치를 찾아 **그 한 줄만** 고치고 `node --check` 로 검증한다.

## 작업 순서 (항상 이대로)

1. 아래 **상수 지도**에서 대상 상수와 파일·앵커를 찾는다.
2. 떨어지는 높이/충격이 관련되면 **물리 변환표**로 픽셀↔속도를 환산해 알려준다.
3. `Edit` 로 **해당 상수 한 줄만** 바꾼다. 주석(설명/단위)은 살린다.
4. 바꾼 파일에 `node --check <파일>` 실행 → 통과 확인.
5. 커밋 요청을 받으면 `git-commit` 스킬 컨벤션으로 커밋한다
   (`anim:` 애니메이션·모션, `feat:`/`fix:` 동작, `ui:` 말풍선·표시).
   **한 커밋 = 한 주제.** 여러 상수를 서로 다른 주제로 바꿨으면 나눠 커밋한다.

상대 표현은 이렇게 해석한다: "더 무겁게/덜 튕기게" → `RESTITUTION`↓,
"더 통통" → `RESTITUTION`↑, "숨쉬기 세게/약하게" → `BELLY_AMP`,
"더 아파야" → `HURT_IMPACT`↓, "낮게 떨궈도 안 아프게" → `HURT_IMPACT`↑.
값이 애매하면 현재값을 먼저 알려주고 한 스텝(예: ±0.02, ±2)만 제안한다.

## 상수 지도

### 떨어짐·튕김 물리 — `src/main.js` (`dropToFloor`)
| 상수 | 현재 | 뜻 | 올리면 |
|------|------|----|--------|
| `G` | 1.4 | 중력 가속도(px/16ms tick) | 더 빨리 떨어짐 |
| `RESTITUTION` | 0.4 | 튕김 후 남는 속도 비율 | 더 가볍게 더 많이 통통 |
| `MIN_BOUNCE` | 2.2 | 이 속도 미만이면 멈춤 | 더 빨리 멈춤(튕김 횟수↓) |
| `STAGE_BOTTOM` | 8 | 바닥 기준 위 여백 | 더 위에 섬 |
| `DROP` | 2 | 작업표시줄 라인 침범량 | 더 아래(표시줄에 묻힘) |
| `W` / `H` | 240 | 창=캔버스 크기 | 금옥이 더 큼 |

앵커(grep): `const G = `, `RESTITUTION = `, `MIN_BOUNCE = `, `const DROP = `

### 배 숨쉬기 — `src/renderer/renderer.js`
| 상수 | 현재 | 뜻 |
|------|------|----|
| `BELLY.cx` | 52 | 숨쉬는 타원 X(작을수록 **왼쪽**) |
| `BELLY.cy` | 205 | Y(클수록 **아래**) |
| `BELLY.rx` / `ry` | 28 / 16 | 타원 가로/세로 반지름 |
| `BELLY_AMP` | 0.14 | 부푸는 세기(0.14 = 최대 14%) |
| `pad` (`breatheBelly` 안) | 8 | 가장자리 feather가 번지는 바깥 여백 |

앵커: `const BELLY = {`, `const BELLY_AMP`, `const pad =`

### 행동·애니메이션 — `src/renderer/renderer.js`
| 상수/리터럴 | 현재 | 뜻 |
|------|------|----|
| `HURT_IMPACT` | 24 | 이 **속도 이상**일 때만 "아야"(아래 변환표) |
| `WORK_TAIL_SPEED` | 1.5 | 작업 중 꼬리 흔드는 속도 배율 |
| `landSquash … amp` | `clamp(impact/90, 0.10, 0.28)` | 착지 찌부 세기 |
| `landSquash … dur` | 360 | 찌부 지속(ms) |
| `restUntil = now() + 1000` | 1000 | 아프게 떨어진 뒤 가만히 있는 시간(ms) |
| `eyesClosedUntil = now() + 500` | 500 | 착지 후 눈 감김 유지(ms) |
| `pettingUntil = now() + 2600` | 2600 | 쓰다듬기 반응 지속(ms) |
| walk `dur` / `dist` | 2900~3000 / 65+rand45 | 어슬렁 한 번의 시간·거리 |
| `bubbleUntil = now() + 5500` | 5500 | 일반 말풍선 지속(ms) |

앵커: `const HURT_IMPACT`, `WORK_TAIL_SPEED`, `landSquash =`, `restUntil =`, `pettingUntil =`

> 표정/프레임은 스프라이트시트에 구워져 있다. `CLOSED_FRAME`(20, 눈 감김) 외에
> 프레임 자체는 코드로 못 바꾼다. `seal.js`는 읽기 전용 취급.

## 물리 변환표 (떨어진 높이 ↔ 착지 속도)

`G=1.4`, tick=16ms 기준. 충격 속도 `v` 와 떨어진 높이 `h`(px):

```
h ≈ v² / 2.8        v ≈ √(2.8 · h)
```

`HURT_IMPACT` 빠른 참조:

| HURT_IMPACT(v) | ≈ 높이 |
|----|----|
| 15 | ~80px |
| 18 | ~116px |
| 20 | ~143px |
| 24 | ~206px (현재) |
| 25 | ~223px |

"높이 N px 이상에서만 아프게" 요청이면 `v = √(2.8·N)` 를 계산해 `HURT_IMPACT` 에 넣는다.

## 미리보기

값은 electron을 재시작(`npm start`)해야 보인다. 핫리로드가 켜져 있으면 저장만 해도
반영된다. 사용자가 "확인했어/별로야" 라고 할 때까지 커밋하지 않는다.
