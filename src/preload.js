// 메인 ↔ 화면(renderer) 사이의 안전한 다리.
// renderer는 window.geumoki.* 만 쓸 수 있고, Node 기능에 직접 접근하지 않는다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('geumoki', {
  // 상태(메모지) 변경 수신
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data)),
  // 커서가 금옥이 위에 있는지 알려서 클릭 통과를 켜고 끔
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  // 금옥이를 잡아 끌 때 창 이동
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  // 화면 끝(벽)에 닿았을 때 수신 (side: -1 왼쪽, +1 오른쪽)
  onHitEdge: (cb) => ipcRenderer.on('hit-edge', (_e, side) => cb(side)),
  // 우클릭 메뉴 띄우기
  contextMenu: () => ipcRenderer.send('show-context-menu'),
});
