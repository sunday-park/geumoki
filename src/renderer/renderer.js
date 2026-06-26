// 금옥이 화면 로직
// - 메모지(상태) 변화에 맞춰 표정/말풍선 바꾸기
// - 자연스러운 기본 동작: 숨쉬기(배가 규칙적으로 부풂) + 약 10초마다 눈 깜빡임
// - 아주 가끔 부드럽게(가속·감속) 어슬렁 이동, 상황에 맞는 박수/물방울/갸웃
// - 마우스로 잡아 옮기기 / 우클릭 메뉴 / 빈 공간 클릭 통과

(function () {
const { GRID, drawSeal, CLOSED_FRAME } = window.GEUMOKI_SEAL;
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

let falling = false;        // 손에서 놓여 바닥으로 떨어지는 중(착지 전까지 어슬렁 멈춤)
let landSquash = null;      // 착지 '퉁' 찌부러짐 효과 { start, dur, amp }
let eyesClosedUntil = 0;    // 착지 후 이 시각까지 눈 감김 유지(떨어지는 동안엔 falling으로 유지)
let restUntil = 0;          // 아프게 떨어진 뒤 이 시각까지 어슬렁 안 하고 가만히 있음

// 작업 중(working/workingLong) 꼬리 파닥 속도. 1 = 평소, 1.5 = 1.5배 빠르게.
// 작업이 끝나면(done/end/idle/waiting) 자동으로 1로 돌아온다.
const WORK_TAIL_SPEED = 1.5;

// 임시 동작(끝나면 평소 복귀)
let temp = null;

// 부드러운 어슬렁 이동
let walk = null;            // { phase, start, dur, dist, dir, moved }
let nextWalk = now() + 1800 + Math.random() * 2600;

// 쓰다듬기(더블클릭): 이 시각까지 눈 감고 머리 위로 하트가 뿅뿅 떠오른다
let pettingUntil = 0;
let pettingStart = 0;   // 쓰다듬기 시작 시각(시작할 때 딱 한 번 '출렁'용)
let nextHeart = 0;

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
  bubbleUntil = now() + 5500;   // 말풍선 지속시간(조금 늘림)
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
  walk = { phase: 'out', start: now(), dur: 2900, dist: 65 + Math.random() * 45, ux: away, uy: 0, moved: 0, oneway: true };
  setFacing(away);     // 이미지가 왼쪽을 봄 → 이동방향 반대로 flip
});

// 손에서 놓여 중력으로 떨어진 뒤 바닥에 '퉁' 닿았을 때(무거운 물개라 통통통 몇 번 튕김)
// bounce: 0 = 처음 큰 충격, 1+ = 잔여 통통 튕김
const HURT_IMPACT = 15;          // 이 속도 이상으로 떨어졌을 때만 아파함(낮게 떨구면 안 아픔)
window.geumoki.onLanded((impact, bounce) => {
  if (bounce === 0) falling = false;   // 첫 접촉부터 어슬렁 재개(튕기는 잔동작은 squash로만 표현)
  if (dragging) return;            // 떨어지는 도중 다시 잡았으면 무시
  // 쓰다듬는 중이면 착지 표현(아야/물방울/퉁 찌부러짐)이 하트와 겹치지 않게 무시
  if (pettingUntil && now() < pettingUntil) return;
  eyesClosedUntil = now() + 500;   // 닿을 때마다 0.5초씩 눈 감김 유지(튕기는 동안 계속 감음)
  if (impact >= 6) {               // 살짝이라도 떨어지면 '퉁' 찌부러짐/통통은 보여줌
    // 매 접촉마다 '퉁' 찌부러짐(충격에 비례). 튕길수록 약해져 자연스레 잦아든다.
    landSquash = { start: now(), dur: 360, amp: clamp(impact / 90, 0.10, 0.28) };
    // 아파함/물방울은 '높이 떨어졌을 때(첫 큰 충격)'만 — 낮게 떨구면 아야 안 함
    if (bounce === 0 && impact >= HURT_IMPACT) {
      bubbleEl.textContent = pick(MSG.hurt || ['아야!']);  // 대사는 messages.js의 hurt에서
      bubbleEl.classList.add('show');
      bubbleUntil = now() + 1600;
      splashDrops();               // 퉁! 하고 물방울이 튐
      restUntil = now() + 1000;    // 아프니까 1초간 어슬렁 안 하고 가만히
    }
  }
});

window.geumoki.onStatus((data) => {
  if (!data || typeof data.ts !== 'number') return;
  if (data.ts === lastTs) return;
  lastTs = data.ts;
  if (data.keyword) lastKeyword = data.keyword; // 새 키워드 올 때만 갱신(유지)
  react(data.state || 'idle');
});

// ---- 부드러운 어슬렁 이동 ----
// 이미지가 왼쪽을 봄 → 왼쪽 이동(hx<0)은 정방향(scaleX +1), 오른쪽 이동(hx>0)은 반전(scaleX -1).
// 가로 성분이 거의 없으면(세로로만 이동) 보던 방향 그대로 둔다.
function setFacing(hx) {
  if (Math.abs(hx) > 0.2) facing = hx < 0 ? 1 : -1;
}
function startWalk(t) {
  // 작업 중이든 아니든 좌우로 어슬렁, 가끔 위·대각선으로도 조금씩.
  let ux, uy, dist, oneway = false;
  const r = Math.random();
  if (r < 0.6) {
    // 좌우 어슬렁: 제자리로 안 돌아오고 그 방향으로 슬슬 흘러간다(벽에 닿으면 반대로).
    const dir = Math.random() < 0.5 ? -1 : 1;
    ux = dir; uy = 0;
    dist = 65 + Math.random() * 78;   // 65~143px 정도 이동
    oneway = true;
  } else if (r < 0.85) {
    // 대각선(위쪽으로 살짝). 바닥에 쉬고 있으니 '올라갔다 내려오는' 느낌.
    const dir = Math.random() < 0.5 ? -1 : 1;
    ux = dir; uy = -0.7;
    const m = Math.hypot(ux, uy); ux /= m; uy /= m;
    dist = 34 + Math.random() * 31;
  } else {
    // 위아래(곧장 위로 떴다가 제자리로)
    ux = 0; uy = -1;
    dist = 26 + Math.random() * 23;
  }
  walk = { phase: 'out', start: t, dur: 3000, dist, ux, uy, moved: 0, oneway };
  setFacing(ux);
}
function stepWalk(t) {
  if (!walk) return 0;
  const el = t - walk.start;
  if (walk.phase === 'pause') {
    if (el > 900) { walk.phase = 'back'; walk.start = t; walk.sx = 0; walk.sy = 0; setFacing(-walk.ux); }
    return 0;
  }
  const p = clamp(el / walk.dur, 0, 1);
  const target = walk.dist * smooth(p);
  const sign = walk.phase === 'out' ? 1 : -1;
  // 프레임 증분을 따로 반올림하면 0.5px 미만이 전부 0으로 사라진다(60fps에서 거의 멈춤).
  // 대신 "지금까지 가야 할 누적 정수 위치 − 이미 보낸 정수"를 보내 손실 없이 누적한다.
  const wantX = Math.round(sign * target * walk.ux);
  const wantY = Math.round(sign * target * walk.uy);
  const dx = wantX - (walk.sx || 0);
  const dy = wantY - (walk.sy || 0);
  if (dx || dy) {
    window.geumoki.dragMove(dx, dy);
    walk.sx = wantX; walk.sy = wantY;
  }
  if (p >= 1) {
    if (walk.phase === 'out') {
      if (walk.oneway) { walk = null; nextWalk = t + 1600 + Math.random() * 2400; }
      else { walk.phase = 'pause'; walk.start = t; }
    } else { walk = null; facing = 1; nextWalk = t + 2200 + Math.random() * 3000; }
  }
  // 걷는 동안만 살짝 뒤뚱(위아래)
  return Math.abs(Math.sin(el * 0.012)) * 1.5;
}

// ---- 복부(지느러미 사이 타원)만 숨쉬기 ----
// 얼굴/몸 전체를 키우지 않고, 배 타원 영역만 아주 살짝 확대해 다시 덮는다.
// 타원 가장자리는 부드럽게(feather) 처리해 주변 몸과 자연스럽게 이어진다.
const BELLY = { cx: 112, cy: 120 + 68, rx: 28, ry: 16 }; // 캔버스 내부좌표(프레임 dy=68 반영)
const BELLY_AMP = 0.10;   // 배 부푸는 세기(타원만, 0.10 = 최대 10%). 여기서 조절
const bo = document.createElement('canvas');
const boctx = bo.getContext('2d');

function breatheBelly(breathe) {
  const bump = Math.max(0, breathe);   // 들이쉴 때만 부풀고, 평소(내쉼)엔 원본 그대로
  if (bump <= 0.002) return;
  const s = 1 + bump * BELLY_AMP;
  const { cx, cy, rx, ry } = BELLY;
  const pad = 5;
  const RX = rx + pad, RY = ry + pad;
  const bw = Math.ceil(RX * 2), bh = Math.ceil(RY * 2);
  bo.width = bw; bo.height = bh;
  boctx.clearRect(0, 0, bw, bh);
  // 1) 캔버스의 배 영역을 중심 기준 s배 확대해서 오프스크린에 (src를 1/s로 잡으면 확대되어 보임)
  const sw = bw / s, sh = bh / s;
  boctx.drawImage(cv, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, bw, bh);
  // 2) 타원 가장자리 부드럽게 — 가운데만 남기고 바깥은 알파 0
  boctx.globalCompositeOperation = 'destination-in';
  boctx.save();
  boctx.translate(bw / 2, bh / 2);
  boctx.scale(RX, RY);
  const g = boctx.createRadialGradient(0, 0, 0.45, 0, 0, 1);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.7, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  boctx.fillStyle = g;
  boctx.beginPath();
  boctx.arc(0, 0, 1, 0, Math.PI * 2);
  boctx.fill();
  boctx.restore();
  boctx.globalCompositeOperation = 'source-over';
  // 3) 배 위치에 다시 덮기 → 배만 살짝 부풀어 보임
  ctx.drawImage(bo, cx - bw / 2, cy - bh / 2);
}

// ---- 물방울 튀기기(잡았다 놓을 때 등) ----
// 캔버스 위(머리 근처)에서 작은 물방울 이모티콘이 부채꼴로 튀어올랐다가
// 중력으로 살짝 떨어지며 사라진다. seal 위에 덧그린다.
const drops = [];
function splashDrops(n) {
  const cx = GRID / 2;     // 머리 중앙(캔버스 내부좌표)
  const cy = 96;           // 머리 위쪽 살짝
  const count = n || (6 + Math.floor(Math.random() * 4));
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.7; // 위쪽 부채꼴
    const sp = 1.8 + Math.random() * 2.0;
    drops.push({
      x: cx + (Math.random() - 0.5) * 36,
      y: cy + (Math.random() - 0.5) * 14,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      size: 12 + Math.random() * 9,
      born: now(),
      life: 600 + Math.random() * 350,
    });
  }
}
function drawDrops(t) {
  if (!drops.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    const age = t - d.born;
    if (age >= d.life) { drops.splice(i, 1); continue; }
    const p = age / d.life;
    d.x += d.vx;
    d.y += d.vy;
    d.vy += 0.16;                  // 중력
    ctx.globalAlpha = Math.max(0, 1 - p * 1.2);   // 떨어질수록 점점 투명
    ctx.filter = `blur(${(p * 1.6).toFixed(2)}px)`;  // 떨어질수록 점점 흐릿
    const s = d.size * (1.15 - 0.35 * p);  // 톡 튀고 점점 작게
    ctx.font = `${s.toFixed(1)}px serif`;
    ctx.fillText('💧', d.x, d.y);
  }
  ctx.filter = 'none';
  ctx.restore();
}

// ---- 쓰다듬기 하트(머리 위로 살랑살랑 떠오름) ----
const hearts = [];
function spawnHeart() {
  const cx = GRID / 2;     // 머리 중앙
  const cy = 92;           // 머리 위쪽
  hearts.push({
    x: cx + (Math.random() - 0.5) * 46,  // 머리 위 넓게 산발적으로
    y: cy + (Math.random() - 0.5) * 18,
    vx: (Math.random() - 0.5) * 0.6,
    vy: -(0.5 + Math.random() * 0.5),    // 위로 살랑살랑
    size: 10 + Math.random() * 6,        // 작게
    born: now(),
    life: 1000 + Math.random() * 600,
    sway: Math.random() * Math.PI * 2,   // 좌우 흔들림 위상
    swayAmp: 0.25 + Math.random() * 0.3, // 흔들림 폭도 제각각
  });
}
function drawHearts(t) {
  if (!hearts.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    const age = t - h.born;
    if (age >= h.life) { hearts.splice(i, 1); continue; }
    const p = age / h.life;
    h.x += h.vx + Math.sin(t * 0.005 + h.sway) * h.swayAmp;  // 살랑살랑
    h.y += h.vy;
    h.vy *= 0.99;
    // 톡 나타났다가(처음 20%) 서서히 사라짐
    ctx.globalAlpha = p < 0.2 ? p / 0.2 : Math.max(0, 1 - (p - 0.2) / 0.8);
    const s = h.size * (0.7 + 0.3 * Math.min(1, p * 4));  // 살짝 커지며
    ctx.font = `${s.toFixed(1)}px serif`;
    ctx.fillText('❤️', h.x, h.y);
  }
  ctx.restore();
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

  // 쓰다듬기: 눈 감고 가만히, 머리 위로 하트가 주기적으로 뿅뿅
  const petting = pettingUntil && t < pettingUntil;
  if (petting && t > nextHeart) {
    spawnHeart();
    if (Math.random() < 0.6) spawnHeart();   // 가끔 두 개씩 → 산발적으로 여러 개
    nextHeart = t + 150 + Math.random() * 200;
  }

  // 어슬렁(아주 가끔, 부드럽게) — 쓰다듬는 중이거나 커서가 올라와 있으면 가만히 있는다
  if (!walk && t > nextWalk && t > restUntil && !tilt && !falling && !petting && !interactive) startWalk(t);
  let bob = walk ? stepWalk(t) : 0;

  // 표정/동작 확정
  let expr = temp ? temp.expr : expression;
  let act = temp ? temp.action : action;
  if (blinkUntil && expr === 'normal') expr = 'blink';

  // 작업 중일 때만 꼬리를 조금 더 빠르게 파닥(끝나면 mode가 바뀌어 자동 원속도)
  const tailSpeed = (mode === 'working') ? WORK_TAIL_SPEED : 1;
  // 눈 감은 프레임(20번) 고정 조건:
  //  - 떨어지는 동안 + 착지 후 0.5초
  //  - idle 'zzz...' 말풍선이 떠 있는 동안(자는 표정)
  // 그 외엔 평소처럼 깜빡임
  const sleeping = bubbleEl.classList.contains('show') && /zzz/i.test(bubbleEl.textContent);
  const eyesClosed = falling || (eyesClosedUntil && t < eyesClosedUntil) || sleeping || petting;
  const drawOpts = { expression: expr, action: act, frame, breathe, speed: tailSpeed };
  if (eyesClosed) drawOpts.holdFrame = CLOSED_FRAME;
  drawSeal(ctx, drawOpts);
  // 숨쉬기: 얼굴/몸 전체가 아니라 '지느러미 사이 배 타원'만 아주 살짝 부풀린다
  breatheBelly(breathe);
  // 물방울(잡았다 놓을 때 등)을 seal 위에 덧그림
  drawDrops(t);
  // 쓰다듬을 때 머리 위로 떠오르는 하트
  drawHearts(t);

  // 착지 '퉁' 찌부러짐: 닿는 순간 납작(가로로 퍼짐)했다가 출렁이며 원래대로.
  // (#seal transform-origin 이 바닥쪽이라 바닥에 눌리는 느낌이 난다)
  let sx = 1, sy = 1;
  if (landSquash) {
    const e = (t - landSquash.start) / landSquash.dur;
    if (e >= 1) { landSquash = null; }
    else {
      const decay = 1 - e;                       // 점점 잦아듦
      const osc = Math.cos(e * Math.PI * 2.5);   // 압축→신장→… 출렁
      sy = 1 - landSquash.amp * decay * osc;     // 세로 눌림
      sx = 1 + landSquash.amp * 0.55 * decay * osc; // 가로 퍼짐
    }
  }

  // 쓰다듬을 때: 좌우로만 잔잔히 떨림(가로 진동)은 계속, 출렁거림은 시작할 때 딱 한 번.
  let petTrX = 0;
  if (petting) {
    const env = 0.55 + 0.45 * Math.sin(t * 0.005);   // ~1.3초 주기로 세기 완만히 출렁
    petTrX = Math.sin(t * 0.02) * 0.7 * env;         // 좌우 떨림(~3Hz)만 — 계속

    // 출렁: 쓰다듬기 시작 순간 한 번만 젤리처럼 출렁이고 잦아든다(감쇠 진동)
    const e = (t - pettingStart) / 600;              // 출렁 지속 ~0.6초
    if (e >= 0 && e < 1) {
      const wob = Math.sin(e * Math.PI * 2) * (1 - e) * 0.06;  // 한 번 늘었다 줄며 사라짐
      sy *= 1 + wob;
      sx *= 1 - wob * 0.5;                           // 부피 보존 느낌으로 가로는 살짝 반대로
    }
  }

  // 변형: 방향 + 착지 찌부러짐 + 뒤뚱 (숨쉬기는 위 배 타원에서 처리)
  let tf = `scaleX(${(facing * sx).toFixed(4)}) scaleY(${sy.toFixed(4)})`;
  if (bob) tf += ` translateY(${(-bob).toFixed(2)}px)`;
  if (petTrX) tf += ` translateX(${petTrX.toFixed(2)}px)`;
  cv.style.transform = tf;

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- 금옥이가 '실제로 보이는' 가로 범위를 재서 메인에 알려줌(벽 인식 보정) ----
// 창은 240px이지만 금옥이 그림은 작고 가운데 있어, 창 기준으로 벽을 잡으면 몸통이 벽에서
// 한참 떨어져 멈춘다. 캔버스의 불투명 픽셀을 직접 재서 몸통의 좌/우 여백을 계산한다.
function scanOpaqueExtent() {
  let data;
  try { data = ctx.getImageData(0, 0, cv.width, cv.height).data; }
  catch { return null; }
  const w = cv.width, h = cv.height;
  let lo = Infinity, hi = -1;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4 + 3] > 10) { if (x < lo) lo = x; if (x > hi) hi = x; break; }
    }
  }
  return hi >= 0 ? { lo, hi } : null;
}

let extLo = Infinity, extHi = -1, extSamples = 0;
function measureExtent() {
  const e = scanOpaqueExtent();
  if (e) { extLo = Math.min(extLo, e.lo); extHi = Math.max(extHi, e.hi); extSamples++; }
  if (extSamples < 12) { requestAnimationFrame(measureExtent); return; }
  // 캔버스 내부 px → 창(DIP) 좌표로 변환
  const rect = cv.getBoundingClientRect();      // 창 안에서 캔버스의 위치/크기(CSS px)
  const scale = rect.width / cv.width;          // 내부 220px → CSS 162px 비율
  const bodyLeft = rect.left + extLo * scale;             // 창 왼쪽(0) 기준 몸통 왼쪽
  const bodyRight = rect.left + (extHi + 1) * scale;      // 창 왼쪽 기준 몸통 오른쪽
  const leftPad = Math.max(0, Math.round(bodyLeft));               // 창 왼쪽 → 몸통 왼쪽
  const rightPad = Math.max(0, Math.round(window.innerWidth - bodyRight)); // 몸통 오른쪽 → 창 오른쪽
  window.geumoki.reportExtent(leftPad, rightPad);
}
// 그림이 그려진 뒤에 측정 시작(시트 로딩 대기)
(function waitDrawn() {
  if (scanOpaqueExtent()) requestAnimationFrame(measureExtent);
  else setTimeout(waitDrawn, 200);
})();

// ---- 마우스: 금옥이 픽셀 위에서만 반응(나머지는 통과) ----
let interactive = false;
let dragging = false;

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
    window.geumoki.dragFollow();   // 메인이 OS 커서 절대좌표로 따라옴(미끄러짐 없음)
    return;
  }
  const over = overSeal(e.clientX, e.clientY);
  if (over !== interactive) {
    interactive = over;
    window.geumoki.setInteractive(over);
    document.body.style.cursor = over ? 'grab' : 'default';
  }
  // 쓰다듬으려 커서를 갖다 대면 멈춰서 가만히 → 움직이는 중에도 더블클릭이 안정적으로 들어감
  if (over && walk) walk = null;
});

window.addEventListener('mousedown', (e) => {
  if (e.button === 0 && overSeal(e.clientX, e.clientY)) {
    dragging = true;
    walk = null;        // 잡으면 어슬렁 중단
    falling = false;    // 떨어지는 중 다시 잡힘
    eyesClosedUntil = 0;// 다시 잡으면 눈 뜸
    landSquash = null;
    document.body.style.cursor = 'grabbing';
    window.geumoki.dragStart();
  }
});
window.addEventListener('mouseup', () => {
  if (dragging) {
    falling = true;            // 놓는 순간부터 착지까지 어슬렁 멈춤
    window.geumoki.dragEnd();  // 메인이 중력으로 떨어뜨리고, 착지하면 onLanded로 알림
  }
  dragging = false;
  if (interactive) document.body.style.cursor = 'grab';
});
window.addEventListener('contextmenu', (e) => {
  if (overSeal(e.clientX, e.clientY)) {
    e.preventDefault();
    window.geumoki.contextMenu();
  }
});
// 더블클릭 = 쓰다듬기: 눈 감고 행복, 머리 위로 하트, 말풍선("히히", "따뜻해~" 등)
window.addEventListener('dblclick', (e) => {
  if (!overSeal(e.clientX, e.clientY)) return;
  // 더블클릭 과정에서 잡기/떨어뜨리기가 걸렸어도 취소하고 가만히 쓰다듬받기
  dragging = false;
  falling = false;
  walk = null;
  eyesClosedUntil = 0;
  landSquash = null;
  pettingUntil = now() + 2600;
  pettingStart = now();          // 시작할 때 한 번 출렁
  nextHeart = 0;                 // 즉시 첫 하트
  temp = { expr: 'happy', action: 'none', until: pettingUntil };
  say('pet');
});
})();
