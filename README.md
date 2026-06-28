# 금옥이 🦭

화면 위에 떠 있는 회색 물개 **금옥이**. Claude Code가 시작/작업중/끝/대기/종료될 때마다
순딩한 말풍선으로 알려주는 데스크톱 마스코트예요.

---

## 처음 한 번만 — 준비하기

PowerShell(또는 터미널)을 열고 이 폴더로 간 다음, 아래를 한 번씩 실행하세요.

```powershell
cd C:\Users\User\Desktop\PROJECTS\geumoki

# 1) 금옥이가 쓸 부품 설치 (한 번만, 조금 걸려요)
npm install

# 2) 금옥이를 Claude Code에 연결 (한 번만)
npm run install-hooks
```

> 2번은 전역 설정(`~/.claude/settings.json`)에 **금옥이 신호 보내기**만 추가해요.
> 기존 설정은 건드리지 않고, 실행 전에 백업(`settings.json.geumoki-backup`)도 만듭니다.

연결 후에는 **Claude Code를 새로 켜야** 금옥이가 상태를 알아챕니다.

---

## 켜기 / 끄기

```powershell
# 금옥이 켜기
npm start
```

- **옮기기:** 금옥이를 마우스로 잡아서 원하는 자리로 끌어요.
- **메뉴:** 금옥이를 **우클릭** → 잠깐 숨기기 / 종료.
- 금옥이 없는 빈 공간 클릭은 뒤 창으로 그냥 통과돼서 작업에 방해되지 않아요.

연결을 끊고 싶으면:

```powershell
npm run uninstall-hooks
```

---

## 금옥이가 언제 말하나

| 순간 | 금옥이 |
|------|--------|
| 세션 시작 | "왔구나! 오늘도 시작해볼까~" |
| 작업 시작 | "응! 할게~" |
| 작업 중(길어지면) | "조물조물 하는 중🐟" |
| 작업 끝 | "다 했어~ 헤헤" 👏 |
| 멈춰서 기다릴 때 | "이거 확인 좀 해줘!" |
| 세션 종료 | "수고했어, 잘 자~" |
| 한참 조용할 때 | "물개는 자유다🌊" |

---

## 말풍선 속 작업 도구 아이콘

작업 중일 땐 말풍선 앞에 **지금 쓰는 도구 아이콘**이 붙어요. (예: "✏️ renderer.js 수정 중")

| 도구 | 아이콘 | | 도구 | 아이콘 |
|------|:---:|---|------|:---:|
| 읽기(Read) | 📖 | | 실행(Bash) | ⌨️ |
| 수정(Edit) | ✏️ | | 검색(Grep) | 🔍 |
| 작성(Write) | 📝 | | 파일 찾기(Glob) | 📁 |
| 웹(Web) | 🌐 | | 할 일(Todo) | ✅ |

> **이미 금옥이를 연결해 쓰던 분은** 새 도구(📖🔍📁 등)까지 아이콘이 뜨게 하려면
> `npm run install-hooks` 를 **한 번 더** 실행하고 Claude Code를 새로 켜주세요.

---

## 대사 바꾸기

대사는 `src/renderer/messages.js` 에 모여 있어요.
코드 몰라도 따옴표 `"..."` 안의 글자만 바꾸거나 줄을 추가/삭제하면 됩니다.
(줄 끝의 쉼표 `,` 는 그대로 두세요.)

---

## 구조 (참고)

```
Claude Code ──(hook)──▶ 📝 ~/.claude/geumoki/status.json ──▶ 금옥이 앱
```

- `src/write-status.js` — Claude Code hook이 불러 상태를 메모지에 적음
- `src/main.js` — 투명 창 + 메모지 감시 + 트레이/메뉴
- `src/renderer/` — 금옥이 그림(`seal.js`), 화면 로직(`renderer.js`), 대사(`messages.js`)
- `src/install-hooks.js` — Claude Code 연결/해제 도우미
```
