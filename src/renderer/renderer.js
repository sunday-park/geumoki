// 금옥이 화면 로직
// - 메모지(상태) 변화에 맞춰 표정/말풍선 바꾸기
// - 자연스러운 기본 동작: 숨쉬기(배가 규칙적으로 부풂) + 약 10초마다 눈 깜빡임
// - 아주 가끔 부드럽게(가속·감속) 어슬렁 이동, 상황에 맞는 박수/물방울/갸웃
// - 마우스로 잡아 옮기기 / 우클릭 메뉴 / 빈 공간 클릭 통과

(function () {
const { GRID, drawSeal } = window.GEUMOKI_SEAL;
const MSG = window.GEUMOKI_MESSAGES;

const cv = document.getElementById('seal');
const ctx = cv.getContext('2d', { willReadFrequently: true });
const bubbleEl = document.getElementById('bubble');

const now = () => performance.now();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (p) => p * p * (3 - 2 * p); // 부드러운 가속·감속

// ---- 현재 표시 상태 ----
let expression = 'normal';
let action = 'none';        // 'none' | 'clap' | 'splash'
let frame = 0;

let lastTs = 0;
let lastActivity = now();
let mode = 'idle';
let lastKeyword = '';       // 현재 작업 키워드(메모지에서 받음)

let workingSince = 0;
let nextWorkingChat = 0;
let nextIdleChat = 0;

let bubbleUntil = 0;
let blinkUntil = 0;
let nextBlink = now() + 9000 + Math.random() * 2500; // 약 10초마다

let tilt = false;           // 갸웃(대기 중)
let facing = 1;

// 임시 동작(끝나면 평소 복귀)
let temp = null;

// 부드러운 어슬렁 이동
let walk = null;            // { phase, start, dur, dist, dir, moved }
let nextWalk = now() + 12000 + Math.random() * 14000;

function say(category) {
  const list = MSG[category];
  if (!list || !list.length) return;
  let text;
  if (lastKeyword) {
    // 키워드가 있으면 {kw} 들어간 대사 우선
    const kw = list.filter((s) => s.includes('{kw}'));
    text = pick(kw.length ? kw : list);
  } else {
    // 키워드 없으면 {kw} 없는 평범한 대사만
    const plain = list.filter((s) => !s.includes('{kw}'));
    text = pick(plain.length ? plain : list);
  }
  bubbleEl.textContent = text.replace(/\{kw\}/g, lastKeyword).trim();
  bubbleEl.classList.add('show');
  bubbleUntil = now() + 4200;
}

function react(state) {
  mode = state;
  lastActivity = now();
  switch (state) {
    case 'start':
      temp = { expr: 'happy', action: 'none', until: now() + 2500 };
      tilt = false;
      say('start');
      break;
    case 'working':
      expression = 'normal';
      action = 'none';
      tilt = false;
      workingSince = now();
      nextWorkingChat = now() + 8000;
      say('working');
      break;
    case 'done':
      temp = { expr: 'happy', action: 'clap', until: now() + 3000 };
      tilt = false;
      say('done');
      break;
    case 'waiting':
      expression = 'normal';
      action = 'none';
      tilt = false;   // 갸웃(기울임) 제거 — 대기 중엔 말풍선만
      say('waiting');
      break;
    case 'end':
      temp = { expr: 'happy', action: 'none', until: now() + 3000 };
      tilt = false;
      say('end');
      break;
    case 'busy':
      // 도구 사용 중: 키워드만 갱신하고, 말풍선은 workingLong 타이머가 가끔 띄움(말풍선 도배 방지)
      mode = 'working';
      tilt = false;
      if (!workingSince) workingSince = now();
      if (nextWorkingChat === 0) nextWorkingChat = now() + 4000;
      break;
    default:
      break;
  }
}

// 화면 끝(벽)에 닿으면 반대 방향으로 돌려보냄 (어슬렁 중일 때만)
window.geumoki.onHitEdge((side) => {
  if (!walk) return;
  const away = -side;  // 벽 반대 방향
  walk = { phase: 'out', start: now(), dur: 1300, dist: 40 + Math.random() * 25, dir: away, moved: 0, oneway: true };
  facing = -away;      // 이미지가 왼쪽을 봄 → 이동방향 반대로 flip
});

window.geumoki.onStatus((data) => {
  if (!data || typeof data.ts !== 'number') return;
  if (data.ts === lastTs) return;
  lastTs = data.ts;
  if (data.keyword) lastKeyword = data.keyword; // 새 키워드 올 때만 갱신(유지)
  react(data.state || 'idle');
});

// ---- 부드러운 어슬렁 이동 ----
function startWalk(t) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  walk = { phase: 'out', start: t, dur: 1400, dist: 20 + Math.random() * 22, dir, moved: 0 };
  // 이미지가 왼쪽을 봄 → 왼쪽 이동(dir=-1)은 정방향(scaleX +1), 오른쪽 이동(dir=+1)은 반전(scaleX -1)
  facing = -dir;
}
function stepWalk(t) {
  if (!walk) return 0;
  const el = t - walk.start;
  if (walk.phase === 'pause') {
    if (el > 900) { walk.phase = 'back'; walk.start = t; walk.moved = 0; facing = walk.dir; }
    return 0;
  }
  const p = clamp(el / walk.dur, 0, 1);
  const target = walk.dist * smooth(p);
  const delta = target - walk.moved;
  walk.moved = target;
  const sign = walk.phase === 'out' ? walk.dir : -walk.dir;
  if (delta > 0) window.geumoki.dragMove(sign * Math.round(delta), 0);
  if (p >= 1) {
    if (walk.phase === 'out') {
      if (walk.oneway) { walk = null; facing = 1; nextWalk = t + 10000 + Math.random() * 12000; }
      else { walk.phase = 'pause'; walk.start = t; }
    } else { walk = null; facing = 1; nextWalk = t + 12000 + Math.random() * 14000; }
  }
  // 걷는 동안만 살짝 뒤뚱(위아래)
  return Math.abs(Math.sin(el * 0.012)) * 1.5;
}

// ---- 매 프레임 ----
function tick() {
  frame++;
  const t = now();

  // 숨쉬기(약 3.6초 주기)
  const breathe = Math.sin((t / 3600) * Math.PI * 2);

  if (bubbleEl.classList.contains('show') && t > bubbleUntil) {
    bubbleEl.classList.remove('show');
  }
  if (temp && t > temp.until) temp = null;

  // 눈 깜빡임(약 10초마다)
  if (!blinkUntil && t > nextBlink) {
    blinkUntil = t + 130;
    nextBlink = t + 9000 + Math.random() * 2500;
  }
  if (blinkUntil && t > blinkUntil) blinkUntil = 0;

  // working 길어지면 가끔 한마디
  if (mode === 'working' && t > nextWorkingChat) {
    say('workingLong');
    nextWorkingChat = t + 7000 + Math.random() * 5000;
  }

  // 한참 조용하면 심심
  const idleNow = (mode === 'idle' || mode === 'done' || mode === 'end')
    && (t - lastActivity > 40000);
  if (idleNow && t > nextIdleChat) {
    say('idle');
    nextIdleChat = t + 15000 + Math.random() * 15000;
    if (Math.random() < 0.45) temp = { expr: 'normal', action: 'splash', until: t + 2000 };
  }

  // 어슬렁(아주 가끔, 부드럽게)
  if (!walk && t > nextWalk && !tilt) startWalk(t);
  let bob = walk ? stepWalk(t) : 0;

  // 표정/동작 확정
  let expr = temp ? temp.expr : expression;
  let act = temp ? temp.action : action;
  if (blinkUntil && expr === 'normal') expr = 'blink';

  drawSeal(ctx, { expression: expr, action: act, frame, breathe });

  // 변형: 방향 + 뒤뚱 (숨쉬기는 스프라이트에 내장, 기울임(갸웃)은 제거)
  const bw = 1;
  const bh = 1;
  let tf = '';
  tf += `scaleX(${(facing * bw).toFixed(4)}) scaleY(${bh.toFixed(4)})`;
  if (bob) tf += ` translateY(${(-bob).toFixed(2)}px)`;
  cv.style.transform = tf;

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- 마우스: 금옥이 픽셀 위에서만 반응(나머지는 통과) ----
let interactive = false;
let dragging = false;
let lastMouse = { x: 0, y: 0 };

function overSeal(clientX, clientY) {
  const rect = cv.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return false;
  }
  const gx = Math.floor(((clientX - rect.left) / rect.width) * GRID);
  const gy = Math.floor(((clientY - rect.top) / rect.height) * GRID);
  try {
    return ctx.getImageData(gx, gy, 1, 1).data[3] > 10;
  } catch {
    return false;
  }
}

window.addEventListener('mousemove', (e) => {
  if (dragging) {
    window.geumoki.dragMove(e.screenX - lastMouse.x, e.screenY - lastMouse.y);
    lastMouse = { x: e.screenX, y: e.screenY };
    return;
  }
  const over = overSeal(e.clientX, e.clientY);
  if (over !== interactive) {
    interactive = over;
    window.geumoki.setInteractive(over);
    document.body.style.cursor = over ? 'grab' : 'default';
  }
});

window.addEventListener('mousedown', (e) => {
  if (e.button === 0 && overSeal(e.clientX, e.clientY)) {
    dragging = true;
    walk = null; // 잡으면 어슬렁 중단
    lastMouse = { x: e.screenX, y: e.screenY };
    document.body.style.cursor = 'grabbing';
  }
});
window.addEventListener('mouseup', () => {
  dragging = false;
  if (interactive) document.body.style.cursor = 'grab';
});
window.addEventListener('contextmenu', (e) => {
  if (overSeal(e.clientX, e.clientY)) {
    e.preventDefault();
    window.geumoki.contextMenu();
  }
});
})();
