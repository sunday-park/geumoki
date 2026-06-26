// 금옥이 Electron 메인 프로세스
// - 투명/프레임없음/항상위 창을 만들고
// - "메모지" 파일(status.json)을 감시하다가 바뀌면 화면(renderer)에 알려주고
// - 트레이/우클릭 메뉴, 빈 공간 클릭 통과(click-through)를 담당한다.

const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { DIR, STATUS_FILE } = require('./status-path');
const settings = require('./settings');

// 일부 Windows 환경에서 GPU 가속이 투명 창을 안 그리는 문제를 막는다.
app.disableHardwareAcceleration();

// GEUMOKI_DEBUG=1 로 켜면: 불투명 흰 배경 + 화면 중앙 + 개발자도구.
// (창이 화면에 뜨긴 하는지 눈으로 확인하는 용도)
const DEBUG = process.env.GEUMOKI_DEBUG === '1';

// GEUMOKI_DEV=1 (또는 DEBUG) 면 핫리로드: src/renderer 가 바뀌면 창을 자동 새로고침.
// 수치 튜닝할 때 electron 을 껐다 켤 필요 없이 저장만 하면 바로 반영된다.
// 평소(일반 사용) 엔 꺼져 있어 파일을 감시하지 않는다.
const DEV = process.env.GEUMOKI_DEV === '1' || DEBUG;

let win = null;
let tray = null;
let hidden = false;

// 금옥이 '실제로 보이는 몸통'의 좌/우 여백(창 기준, DIP px).
// 창은 240px이지만 그림은 그보다 작고 가운데 있어, 창 기준으로 벽을 잡으면
// 금옥이가 벽에서 한참 떨어져 멈춘다. renderer가 불투명 픽셀을 재서 보내주면
// 그 값으로 보정해 '몸통'이 벽에 정확히 닿게 한다. (측정 전 기본값 = (240-162)/2)
let sealPad = { left: 39, right: 39 };

// 창 크기(DIP 고정). 클램프 계산에 getBounds() 대신 이 상수를 쓴다.
// 배율(DPI)이 다른 모니터를 넘어갈 때 창 크기가 잠깐 흔들려도 좌표가 튀지 않게 하기 위함.
const W = 240;
const H = 240;

// 금옥이 바닥면이 작업영역 하단선(작업표시줄 상단)에 닿는 '평소 쉬는' 위치 계산용.
// (index.html #stage 의 bottom:8px + 작업표시줄에 살짝만 닿게 하는 여백 2px)
const STAGE_BOTTOM = 8;
const DROP = 2;
// 작업영역(wa) 안에서 창 y가 가질 수 있는 최저값(= 평소 쉬는 바닥 위치)
function restY(wa) {
  return wa.y + wa.height - H + STAGE_BOTTOM + DROP;
}

// 마우스로 잡았을 때 커서와 창의 간격(드래그 중 절대좌표 추적용). null이면 안 잡힌 상태.
let grabOffset = null;

// 어슬렁(walk) 이동용 '부동소수' 누적 위치. (null=아직 동기화 전)
// getPosition()은 정수로 반올림돼 돌아오는데, 배율(150% 등) 모니터에선 1px 이동이
// 반올림에 먹혀 제자리에 머문다. 그래서 실제 창 위치 대신 소수점 위치를 직접 누적한다.
let wanderX = null;
let wanderY = null;

// 손에서 놓은 뒤 '중력 낙하' 애니메이션 타이머(없으면 낙하 중 아님)
let dropTimer = null;
function cancelDrop() {
  if (dropTimer) { clearInterval(dropTimer); dropTimer = null; }
}
// 현재 위치에서 바닥(평소 쉬는 위치)까지 중력으로 떨어뜨린다. 착지하면 renderer에 알림.
function dropToFloor() {
  cancelDrop();
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const wa = screen.getDisplayMatching({ x, y, width: W, height: H }).workArea;
  const floorY = restY(wa);
  if (y >= floorY - 1) {                 // 이미 바닥에 있으면 낙하 없이 착지(충격 0)만 통보
    win.webContents.send('landed', 0);
    return;
  }
  let vy = 0;
  const G = 1.4;                         // 매 틱 가속도(px) — 클수록 빨리 떨어짐
  // 물개라 무겁다 → 바닥에 닿으면 속도를 많이 잃고 작게 '통통통' 몇 번만 튕긴다.
  const RESTITUTION = 0.4;               // 튕김 후 남는 속도 비율(낮을수록 무겁고 덜 튕김)
  const MIN_BOUNCE = 2.2;                // 튕김 속도가 이보다 작으면 그만 튕기고 멈춤
  let bounce = 0;                        // 몇 번째 바닥 접촉인지(0=처음 큰 충격, 1+=잔여 통통)
  dropTimer = setInterval(() => {
    if (!win || win.isDestroyed()) { cancelDrop(); return; }
    const [cx, cy] = win.getPosition();
    vy += G;
    const ny = cy + vy;
    if (ny >= floorY) {                  // 바닥 도달 → 착지(또는 튕김)
      win.setBounds({ x: cx, y: floorY, width: W, height: H });
      win.webContents.send('landed', Math.round(vy), bounce);  // 착지 속도(충격)+몇 번째 튕김
      const rebound = vy * RESTITUTION;
      if (rebound >= MIN_BOUNCE) {       // 아직 튕길 힘이 남았으면 위로 통!
        vy = -rebound;
        bounce++;
      } else {
        cancelDrop();                    // 거의 멈췄으면 바닥에 안착
      }
    } else {
      win.setBounds({ x: cx, y: Math.round(ny), width: W, height: H });
    }
  }, 16);
}

// 보이는 '몸통'이 좌/우 벽(작업영역)에 닿도록 창 X를 제한한다. (창 크기는 항상 상수 W 사용)
function clampX(nx, wa) {
  const minX = wa.x - sealPad.left;
  const maxX = wa.x + wa.width - W + sealPad.right;
  if (maxX < minX) return { x: wa.x, hit: 0 };   // 안전장치: 범위가 뒤집히면 모니터 안쪽으로
  if (nx < minX) return { x: minX, hit: -1 };     // 왼쪽 벽
  if (nx > maxX) return { x: maxX, hit: 1 };       // 오른쪽 벽
  return { x: nx, hit: 0 };
}

// 메모지 파일을 읽어 상태 객체로 반환 (없거나 깨졌으면 idle)
function readStatus() {
  try {
    const raw = fs.readFileSync(STATUS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') return data;
  } catch {
    // 파일 없음/깨짐 → 조용히 기본값
  }
  return { state: 'idle', event: 'none', ts: 0 };
}

function sendStatus() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('status', readStatus());
  }
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;          // 작업표시줄 제외 영역 {x,y,width,height}
  // 금옥이 바닥면이 작업영역 하단선(= 작업표시줄 상단 라인)에 정확히 닿도록 창 y 계산
  let restX = wa.x + wa.width - W - 24;
  let startY = restY(wa);

  // 지난번 종료 위치가 저장돼 있으면 거기서 깨어난다.
  // 단, 그새 모니터 구성이 바뀌었을 수 있으니 그 위치가 속한 모니터 작업영역 안으로 가둔다.
  if (!DEBUG) {
    const saved = settings.load();
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const swa = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: W, height: H }).workArea;
      restX = clampX(saved.x, swa).x;
      startY = Math.max(swa.y, Math.min(saved.y, restY(swa)));
    }
  }

  win = new BrowserWindow({
    width: W,
    height: H,
    // 평소엔 저장된(또는 기본) 위치, 디버그면 화면 중앙
    x: DEBUG ? Math.floor(wa.x + (wa.width - W) / 2) : restX,
    y: DEBUG ? Math.floor(wa.y + (wa.height - H) / 2) : startY,
    frame: false,
    transparent: !DEBUG,
    backgroundColor: DEBUG ? '#ffffff' : '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 데스크톱 펫은 포커스를 안 가져서 Chromium이 백그라운드 창으로 보고
      // requestAnimationFrame을 ~1fps로 throttle한다. 그러면 어슬렁 애니메이션이
      // 거의 멈춰 보이므로, throttling을 꺼서 항상 풀 프레임으로 돌게 한다.
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  // 위치가 바뀔 때마다(드래그·낙하·어슬렁) 0.7초 잠잠해지면 마지막 자리를 저장한다.
  // 매 프레임 저장하면 디스크를 너무 자주 두드리므로 디바운스로 한 번만 쓴다.
  let saveTimer = null;
  function persistPosition() {
    if (DEBUG || !win || win.isDestroyed()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      settings.save({ x, y });
    }, 700);
  }
  win.on('move', persistPosition);
  // 종료 직전엔 디바운스를 기다리지 않고 곧바로 마지막 위치를 저장한다.
  app.on('before-quit', () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (DEBUG || !win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    settings.save({ x, y });
  });

  // 작업표시줄 등에 가려지지 않도록 주기적으로 최상단 재적용(포커스는 안 뺏음)
  setInterval(() => {
    if (win && !win.isDestroyed() && !hidden && win.isVisible()) {
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 2000);

  // renderer(화면)에서 나는 콘솔/에러를 메인 로그로 끌어와 진단에 쓴다.
  win.webContents.on('console-message', (_e, _lvl, message, line, source) => {
    console.log(`[renderer] ${message}  (${source}:${line})`);
  });
  win.webContents.on('preload-error', (_e, p, err) => {
    console.log('[preload-error]', p, err && err.message);
  });
  win.webContents.on('render-process-gone', (_e, d) => {
    console.log('[render-process-gone]', JSON.stringify(d));
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (DEBUG) {
    // 1.5초 뒤 화면을 PNG로 캡처해 그림이 실제로 그려졌는지 확인
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await win.capturePage();
          fs.writeFileSync(path.join(__dirname, '..', 'debug-capture.png'), img.toPNG());
          console.log('[debug] 캡처 저장됨: debug-capture.png');
        } catch (err) {
          console.log('[debug] 캡처 실패:', err && err.message);
        }
      }, 1500);
    });
  }

  // 준비되면 보이기 (포커스는 안 뺏게)
  win.once('ready-to-show', () => win.showInactive());

  if (DEBUG) {
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 기본은 클릭 통과(뒤 창 방해 안 함). 마우스가 금옥이 픽셀 위에 오면 renderer가 풀어준다.
    win.setIgnoreMouseEvents(true, { forward: true });
  }

  win.webContents.on('did-finish-load', sendStatus);
}

// renderer → main: 커서가 금옥이 위에 있는지에 따라 클릭 통과 토글
ipcMain.on('set-interactive', (_e, interactive) => {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(!interactive, { forward: true });
  }
});

// renderer → main: 금옥이가 보이는 몸통 여백 보고(좌/우 DIP px)
ipcMain.on('seal-extent', (_e, left, right) => {
  if (typeof left === 'number' && typeof right === 'number' &&
      Number.isFinite(left) && Number.isFinite(right)) {
    // 0~80px로 가둬서 비정상 측정값이 벽 범위를 뒤집지 못하게 한다.
    sealPad = {
      left: Math.max(0, Math.min(80, left)),
      right: Math.max(0, Math.min(80, right)),
    };
    if (DEBUG) console.log('[wall] 금옥이 몸통 여백 측정됨:', sealPad);
  }
});

// renderer → main: 어슬렁(walk) 이동 — 화면 기준 픽셀 델타로 창을 옮긴다(상대 이동).
ipcMain.on('drag-move', (_e, dx, dy) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  // 창 크기는 상수(W/H)로 고정해 모니터 매칭/클램프가 DPI 변동에 흔들리지 않게 한다.
  const wa = screen.getDisplayMatching({ x, y, width: W, height: H }).workArea;
  // 누적값이 실제 창과 크게 어긋났으면(드래그·낙하 등 외부 이동) 실제 위치로 다시 맞춘다.
  // 어긋남이 작으면(반올림 오차 수준) 누적값을 유지해 소수점 이동이 쌓이게 둔다.
  if (wanderX === null || Math.abs(wanderX - x) > 2 || Math.abs(wanderY - y) > 2) {
    wanderX = x; wanderY = y;
  }
  const c = clampX(wanderX + dx, wa);
  wanderX = c.x;
  // 세로: 화면 위쪽(wa.y)부터 평소 쉬는 바닥(restY)까지만 움직이게 가둔다.
  // (위로는 화면 밖으로 안 나가고, 아래로는 작업표시줄 밑으로 안 내려간다)
  wanderY = Math.max(wa.y, Math.min(wanderY + dy, restY(wa)));
  win.setBounds({ x: Math.round(wanderX), y: Math.round(wanderY), width: W, height: H });
  if (c.hit) win.webContents.send('hit-edge', c.hit);
});

// renderer → main: 마우스로 잡기 시작 — 커서와 창의 간격만 기억한다.
ipcMain.on('drag-start', () => {
  if (!win || win.isDestroyed()) return;
  cancelDrop();                                     // 떨어지는 중이었다면 멈추고 다시 잡힘
  const c = screen.getCursorScreenPoint();          // OS 커서 절대좌표(DIP)
  const [wx, wy] = win.getPosition();
  grabOffset = { x: c.x - wx, y: c.y - wy };
});

// renderer → main: 잡고 움직이는 중 — 델타 누적이 아니라 '커서 절대좌표'를 따라가
// 미끄러지지 않고, 배율(DPI)이 다른 멀티모니터를 넘어가도 정확히 추적한다.
ipcMain.on('drag-follow', () => {
  if (!win || win.isDestroyed() || !grabOffset) return;
  const c = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(c).workArea;  // 커서가 있는 모니터 기준
  const nx = clampX(c.x - grabOffset.x, wa).x;
  // 세로도 그 모니터 안에 머물게 해서 화면 밖으로 사라지지 않게 한다.
  const ny = Math.max(wa.y, Math.min(c.y - grabOffset.y, wa.y + wa.height - H));
  // setBounds로 크기까지 240×240으로 고정 → DPI 리사이즈가 좌표를 오염시키지 못함.
  win.setBounds({ x: nx, y: ny, width: W, height: H });
});

// renderer → main: 손 놓음 → 중력으로 바닥에 떨어뜨림
ipcMain.on('drag-end', () => { grabOffset = null; dropToFloor(); });

// renderer → main: 금옥이 우클릭 메뉴
ipcMain.on('show-context-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: '따라오기', type: 'checkbox', checked: followMode, click: () => setFollow(!followMode) },
    { type: 'separator' },
    {
      label: hidden ? '금옥이 보이기' : '잠깐 숨기기',
      click: () => toggleHidden(),
    },
    { type: 'separator' },
    { label: '금옥이 종료', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

function toggleHidden() {
  if (!win) return;
  hidden = !hidden;
  if (hidden) win.hide();
  else win.show();
}

// ---- 따라오기(마우스 따라 느릿느릿 기어오기) ----
// 켜면: 어슬렁을 멈추고, 전역 커서 위치를 향해 한 틱에 조금씩 창을 옮긴다.
// 끄면: 타이머를 멈춰 평소처럼 어슬렁거린다.
let followMode = false;
let followTimer = null;
let followDir = 0, followMoving = false;   // renderer 에 보낸 마지막 상태(바뀔 때만 전송)
let followX = null, followY = null;        // 부동소수 누적 위치(1px 미만 속도 손실 방지)
const FOLLOW_SPEED = 0.7;     // 한 틱(16ms)에 기어오는 px — 느릿느릿(0.7≈초속 44px)
const FOLLOW_DEADZONE = 10;   // (도달 가능한)목표와 이보다 가까우면 멈춤·평소 상태로

function setFollow(v) {
  followMode = v;
  if (win && !win.isDestroyed()) win.webContents.send('follow-mode', v);
  if (followTimer) { clearInterval(followTimer); followTimer = null; }
  followDir = 0; followMoving = false;
  followX = null; followY = null;          // 다음 스텝에서 현재 창 위치로 다시 맞춤
  if (v) followTimer = setInterval(followStep, 16);
}

function followStep() {
  if (!win || win.isDestroyed() || !followMode || hidden) return;
  if (grabOffset || dropTimer) return;     // 잡고 있거나 떨어지는 중엔 쉼
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  const wa = screen.getDisplayNearestPoint(c).workArea;
  // 누적 위치가 실제 창과 크게 어긋났으면(드래그·낙하 등 외부 이동) 실제 위치로 재동기화.
  // getPosition()은 정수라, 매 틱 여기서 다시 읽으면 0.7px 같은 소수 이동이 반올림에
  // 먹혀 사라진다 → followX/Y 에 소수째 누적하고 창엔 반올림해서만 반영한다.
  if (followX === null || Math.abs(followX - wx) > 2 || Math.abs(followY - wy) > 2) {
    followX = wx; followY = wy;
  }
  // 목표 창 좌상단(커서가 몸통 가운데에 오도록). 단, '도달 가능한' 위치로 먼저 가둔다.
  //  - 가로: 몸통이 좌우 벽을 넘지 않게(clampX)
  //  - 세로: 화면 위쪽 ~ 평소 쉬는 바닥 사이(작업표시줄 밑으론 안 내려감)
  // 도달 불가능한 원래 커서까지의 거리로 판단하면, 커서가 화면 아래쪽일 때
  // 세로 거리가 영영 안 줄어 "계속 걷고 + 가로 이동이 느려지는" 문제가 생긴다.
  const tx = clampX(c.x - W / 2, wa).x;
  const ty = Math.max(wa.y, Math.min(c.y - H / 2, restY(wa)));
  const dx = tx - followX;
  const dy = ty - followY;
  const dist = Math.hypot(dx, dy);
  const moving = dist > FOLLOW_DEADZONE;
  let dir = 0;
  if (moving) {
    const step = Math.min(FOLLOW_SPEED, dist);
    followX += (dx / dist) * step;
    followY += (dy / dist) * step;
    win.setBounds({ x: Math.round(followX), y: Math.round(followY), width: W, height: H });
    if (Math.abs(dx) > 0.5) dir = dx < 0 ? -1 : 1;
  }
  // 방향/이동상태가 바뀔 때만 renderer 로 알림(매 프레임 IPC 도배 방지)
  if (dir !== followDir || moving !== followMoving) {
    followDir = dir; followMoving = moving;
    win.webContents.send('follow-step', { dir, moving });
  }
}

// 트레이 아이콘(작업표시줄 우측 알림영역)에서도 보이기/종료 가능
function createTray() {
  // 16x16 작은 회색 점 아이콘을 코드로 생성
  const img = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCgDk7AABjQ6m3wAAAABJRU5ErkJggg=='
  );
  try {
    tray = new Tray(img);
    tray.setToolTip('금옥이');
    const menu = Menu.buildFromTemplate([
      { label: '보이기/숨기기', click: () => toggleHidden() },
      { label: '종료', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  } catch {
    // 트레이 실패해도 앱은 계속 동작
  }
}

// 메모지 파일 감시 (파일이 아직 없을 수 있으니 폴더를 감시 + 보조 폴링)
function watchStatus() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch {}
  try {
    fs.watch(DIR, (_event, filename) => {
      if (!filename || filename === 'status.json') sendStatus();
    });
  } catch {}
  // fs.watch가 일부 환경에서 누락될 수 있어 1초 폴링을 보조로 둔다
  setInterval(sendStatus, 1000);
}

// 핫리로드(개발용): src/renderer 의 .js/.html/.css 가 바뀌면 창을 새로고침한다.
// 짧게 모아서(디바운스) 한 번만 reload → 연속 저장에도 한 번만 깜빡인다.
function watchRenderer() {
  const dir = path.join(__dirname, 'renderer');
  let timer = null;
  try {
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (filename && !/\.(js|html|css)$/i.test(filename)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          console.log('[dev] renderer 변경 감지 → 새로고침', filename || '');
          win.webContents.reloadIgnoringCache();
        }
      }, 120);
    });
    console.log('[dev] 핫리로드 켜짐 — src/renderer 감시 중');
  } catch (err) {
    console.log('[dev] 핫리로드 감시 실패:', err && err.message);
  }
}

// 단일 인스턴스: 이미 금옥이가 켜져 있으면 새로 안 켜고 종료, 기존 금옥이를 보이게 함
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      hidden = false;
      win.show();
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    watchStatus();
    if (DEV) watchRenderer();
  });

  app.on('window-all-closed', () => app.quit());
}
