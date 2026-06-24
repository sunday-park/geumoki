// 금옥이 = 사용자 원본 그림 기반 '부드러운' 아이들 애니메이션(스프라이트시트) 재생.
// 시트/메타는 seal-img.js: window.GEUMOKI_SHEET(dataURI), window.GEUMOKI_SHEET_META.
// 24프레임을 ~125ms마다 → 배 양옆 부풀기 + 꼬리 흔들기 + 3초마다 깜빡임이 구워져 있음.
// drawSeal(ctx, opts) 인터페이스 유지(opts 미사용 — 추후 확장).

(function () {
const M = window.GEUMOKI_SHEET_META || { frames: 24, fw: 220, fh: 134, ms: 125 };
const GRID = M.fw;   // 캔버스 = 프레임 폭

const sheet = new Image();
let ready = false;
sheet.onload = () => { ready = true; };
sheet.src = window.GEUMOKI_SHEET;

function drawSeal(ctx, opts) {
  ctx.clearRect(0, 0, GRID, GRID);
  if (!ready) return;
  ctx.imageSmoothingEnabled = true;   // 부드럽게

  const f = Math.floor(performance.now() / M.ms) % M.frames;
  const dx = Math.round((GRID - M.fw) / 2);
  const dy = GRID - M.fh;             // 바닥 정렬
  ctx.drawImage(sheet, f * M.fw, 0, M.fw, M.fh, dx, dy, M.fw, M.fh);
}

window.GEUMOKI_SEAL = { GRID, drawSeal };
})();
