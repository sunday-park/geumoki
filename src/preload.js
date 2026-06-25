// 메인 ↔ 화면(renderer) 사이의 안전한 다리.
// renderer는 window.geumoki.* 만 쓸 수 있고, Node 기능에 직접 접근하지 않는다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('geumoki', {
  // 상태(메모지) 변경 수신
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data)),
  // 커서가 금옥이 위에 있는지 알려서 클릭 통과를 켜고 끔
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  // 어슬렁(walk) 이동: 화면 기준 픽셀 델타로 창을 옮김
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  // 마우스로 잡기 시작/이동/놓기 (메인이 OS 커서 절대좌표로 따라옴 → 미끄러짐 없음)
  dragStart: () => ipcRenderer.send('drag-start'),
  dragFollow: () => ipcRenderer.send('drag-follow'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  // 금옥이 '실제로 보이는' 몸통의 좌/우 여백(창 기준, DIP px)을 메인에 알림 → 벽 인식 보정
  reportExtent: (left, right) => ipcRenderer.send('seal-extent', left, right),
  // 화면 끝(벽)에 닿았을 때 수신 (side: -1 왼쪽, +1 오른쪽)
  onHitEdge: (cb) => ipcRenderer.on('hit-edge', (_e, side) => cb(side)),
  // 손에서 놓은 뒤 중력으로 떨어져 바닥에 착지했을 때 수신 (impact: 착지 속도)
  onLanded: (cb) => ipcRenderer.on('landed', (_e, impact) => cb(impact)),
  // 우클릭 메뉴 띄우기
  contextMenu: () => ipcRenderer.send('show-context-menu'),
});
