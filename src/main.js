// 금옥이 Electron 메인 프로세스
// - 투명/프레임없음/항상위 창을 만들고
// - "메모지" 파일(status.json)을 감시하다가 바뀌면 화면(renderer)에 알려주고
// - 트레이/우클릭 메뉴, 빈 공간 클릭 통과(click-through)를 담당한다.

const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { DIR, STATUS_FILE } = require('./status-path');

// 일부 Windows 환경에서 GPU 가속이 투명 창을 안 그리는 문제를 막는다.
app.disableHardwareAcceleration();

// GEUMOKI_DEBUG=1 로 켜면: 불투명 흰 배경 + 화면 중앙 + 개발자도구.
// (창이 화면에 뜨긴 하는지 눈으로 확인하는 용도)
const DEBUG = process.env.GEUMOKI_DEBUG === '1';

let win = null;
let tray = null;
let hidden = false;

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
  const W = 240;
  const H = 240;
  const STAGE_BOTTOM = 8;               // index.html #stage 의 bottom:8px (금옥이 바닥 여백)
  // 금옥이 바닥면이 작업영역 하단선(= 작업표시줄 상단 라인)에 정확히 닿도록 창 y 계산
  const sealBottomY = wa.y + wa.height;
  const DROP = 2;                      // 작업표시줄 상단 라인에 살짝만 닿게(묻히지 않게)
  const restX = wa.x + wa.width - W - 24;
  const restY = sealBottomY - H + STAGE_BOTTOM + DROP;

  win = new BrowserWindow({
    width: W,
    height: H,
    // 평소엔 작업표시줄 위 오른쪽, 디버그면 화면 중앙
    x: DEBUG ? Math.floor(wa.x + (wa.width - W) / 2) : restX,
    y: DEBUG ? Math.floor(wa.y + (wa.height - H) / 2) : restY,
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
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

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

// renderer → main: 금옥이 드래그로 창 이동
ipcMain.on('drag-move', (_e, dx, dy) => {
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    const b = win.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;   // 금옥이가 있는 모니터의 작업영역
    const minX = wa.x;
    const maxX = wa.x + wa.width - b.width;
    let nx = x + dx;
    let hit = 0;
    if (nx < minX) { nx = minX; hit = -1; }       // 왼쪽 벽
    else if (nx > maxX) { nx = maxX; hit = 1; }    // 오른쪽 벽
    win.setPosition(nx, y + dy);
    if (hit) win.webContents.send('hit-edge', hit);
  }
});

// renderer → main: 금옥이 우클릭 메뉴
ipcMain.on('show-context-menu', () => {
  const menu = Menu.buildFromTemplate([
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

app.whenReady().then(() => {
  createWindow();
  createTray();
  watchStatus();
});

app.on('window-all-closed', () => app.quit());
