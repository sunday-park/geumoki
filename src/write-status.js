#!/usr/bin/env node
// Claude Code의 hook이 부르는 작은 스크립트.
// 인자로 받은 상태(start/working/busy/done/waiting/end)와,
// stdin으로 들어온 이벤트 정보에서 뽑은 "키워드"를 메모지 파일에 적는다.
// Claude Code 동작을 절대 막지 않도록: 빠르게 쓰고, 무슨 일이 있어도 조용히 0으로 끝낸다.

const fs = require('fs');
const path = require('path');
// 메모지 경로는 status-path.js 한 곳에서만 정의한다(DRY). 여기서 재정의하지 않는다.
// require()는 cwd가 아니라 이 스크립트 위치 기준으로 해석되므로, 훅이 절대경로로
// standalone 실행해도 항상 같은 모듈을 가리킨다.
const { DIR, STATUS_FILE } = require('./status-path');

// 영어 용어/동사 → 한국어 (예: rendering→렌더링, install→설치).
// npm·git·node 같은 도구 고유명은 그대로 둔다.
const KO = {
  install: '설치', uninstall: '제거', run: '실행', build: '빌드', test: '테스트',
  start: '시작', stop: '정지', restart: '재시작', render: '렌더링', rendering: '렌더링',
  commit: '커밋', push: '푸시', pull: '풀', clone: '클론', merge: '머지', fetch: '페치',
  rebase: '리베이스', checkout: '체크아웃', status: '상태', diff: '비교', log: '로그',
  deploy: '배포', debug: '디버깅', compile: '컴파일', lint: '린트', format: '포맷',
  update: '업데이트', upgrade: '업그레이드', init: '초기화', config: '설정',
  search: '검색', read: '읽기', write: '작성', edit: '수정', fix: '수정',
  create: '생성', delete: '삭제', remove: '삭제', add: '추가', check: '확인',
  serve: '서버 실행', dev: '개발', watch: '감시', clean: '정리',
  export: '내보내기', import: '가져오기', ls: '목록', cat: '보기',
  mkdir: '폴더 생성', touch: '파일 생성',
  cp: '복사', mv: '이동', rm: '삭제', find: '찾기', kill: '종료',
  head: '앞부분', tail: '끝부분', publish: '배포', release: '릴리스',
  migrate: '마이그레이션', generate: '생성', validate: '검증', verify: '검증',
  sync: '동기화', revert: '되돌리기', reset: '리셋', tag: '태그',
  branch: '브랜치', switch: '전환', stash: '스태시', prune: '정리',
  typecheck: '타입검사', tsc: '타입검사', refactor: '리팩토링', optimize: '최적화',
};

// Claude Code 도구 이름 → 한국어 동작
const TOOL = {
  Edit: '수정', MultiEdit: '수정', Write: '작성', Read: '읽기', NotebookEdit: '노트북 수정',
  Grep: '검색', Glob: '파일 찾기', WebFetch: '웹 가져오기', WebSearch: '웹 검색',
  Task: '작업', TodoWrite: '할 일 정리', Bash: '실행',
};

function koreanizeWord(w) {
  const key = String(w).toLowerCase().replace(/[^a-z]/g, '');
  return KO[key] || w;
}

function shorten(s) {
  const one = String(s).replace(/\s+/g, ' ').trim();
  return one.length > 16 ? one.slice(0, 16) + '…' : one;
}

// 사용자 요청 원문을 그대로 보여주지 않도록, 조사·불용어를 걷어내고
// 핵심 단어 2~3개만 뽑아 키워드처럼 만든다. (LLM 없이 규칙 기반이라 근사치)
const STOP = new Set([
  // 프로젝트 고유어(매번 나와서 노이즈) — 키워드에서 제외
  '금옥이', '금옥',
  // 접속/부사/지시어
  '그리고', '그래서', '근데', '그런데', '하지만', '또', '또한', '그냥', '우선', '우선적으로',
  '추가로', '좀', '조금', '너무', '정말', '진짜', '약간', '살짝', '막', '지금', '이제', '계속',
  '다시', '잘', '더', '덜', '이거', '그거', '저거', '이게', '그게', '이걸', '그걸', '여기', '거기',
  '이런', '그런', '저런', '이렇게', '그렇게',
  // 일반 동사/어미/의존명사
  '해', '해줘', '해줘요', '줘', '줘요', '하고', '해서', '하는', '한', '할', '했어', '했는데',
  '했고', '되', '돼', '될', '된', '수', '있어', '있는', '있게', '없어', '없이', '주고싶긴한데',
  '안', '못', '내', '너', '나', '우리', '니', '네', '제', '저', '그', '이', '등', '등의',
  '같은', '같아', '같이', '처럼', '때', '대로', '중', '관련', '바쁘다', '꼼꼼하게', '꼼꼼히',
  '뭐', '왜', '어디', '어떤', '어떻게', '어디까지', '무슨', '좋겠어', '좋아', '싶어', '봐',
  '보고', '확인', '부탁', '거', '것', '수도', '인식', '인식하는걸까',
  // 홀로 떨어진 조사/연결어(기호 제거 과정에서 분리되어 남는 것들)
  '에서', '으로', '까지', '부터', '한테', '에게', '이랑', '라고', '라는', '위해', '통해', '대해',
  // 구어체 지시어(노이즈)
  '얘', '얘가', '걔', '걔가', '쟤', '쟤가', '얘를', '얘네', '걔네',
  // 명령 어미/말투(노이즈) — 일반 명사(코드·파일·기능 등)는 일부러 남겨둔다
  '만들어', '만들어줘', '바꿔', '바꿔줘', '고쳐', '고쳐줘', '넣어', '넣어줘', '빼줘',
  '지워', '지워줘', '보여줘', '알려줘', '적용', '반영', '진행', '처리', '부탁해',
  '가능', '가능해', '될까', '어때', '괜찮아', '일단', '먼저', '다음', '이번',
  '전체', '전부', '모두', '대한', '위한', '통한',
]);

// 단어 끝에 붙은 흔한 조사를 떼어낸다(너무 짧아지지 않게 어간 2글자는 보호).
// 주의: '들'은 단어 일부일 때가 많아(바들바들 등) 떼지 않는다 — 어색한 잘림 방지.
function stripParticle(w) {
  return w.replace(/(으로|에서|에게|한테|까지|부터|이랑|와|과|은|는|이|가|을|를|에|의|도|만|로|랑|께)$/u,
    (m) => ((w.length - m.length) >= 2 ? '' : m));
}

// Claude Code가 자동으로 끼워넣는 '합성 프롬프트'(사용자가 친 게 아님)는 키워드로 쓰지 않는다.
// 예: 백그라운드 작업 완료 알림(<task-notification>), 슬래시 커맨드, 시스템 리마인더 등.
// 이런 걸 키워드로 뽑으면 "task notification" 같은 게 박혀 작업 맥락을 덮어버린다.
const SYNTHETIC_RE = /task[-_ ]?notification|system-reminder|local-command|command-(name|message|args)|<\/?command/i;
function isSyntheticPrompt(p) {
  return SYNTHETIC_RE.test(String(p));
}

function keywordsFromPrompt(prompt) {
  const tokens = String(prompt)
    .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')   // 기호/문장부호 제거
    .split(/\s+/)
    .filter(Boolean)
    .map(stripParticle)
    .filter((w) => w && w.length >= 2 && !STOP.has(w));
  const picked = [];
  for (const w of tokens) {
    if (!picked.includes(w)) picked.push(w);
    if (picked.length >= 2) break;     // '짧은' 요청 키워드 — 최대 2개
  }
  return picked.join(' ');
}

// Bash 명령 → 키워드. 플래그(-x)와 앞쪽 환경변수(VAR=val)는 건너뛰고
// '프로그램 + 첫 의미있는 인자'만 뽑는다. (예: npm install→npm 설치, node --check x.js→node x.js)
function bashKeyword(cmd) {
  const first = String(cmd).split(/[|&;]+/)[0].trim();          // 파이프/체인은 첫 명령만
  let toks = first.split(/\s+/).filter(Boolean);
  while (toks.length && /^[A-Za-z_]\w*=/.test(toks[0])) toks.shift(); // 앞 환경변수(VAR=x) 제외
  if (!toks.length) return '명령 실행';
  const prog = toks[0];
  const rest = toks.slice(1).filter((a) => !a.startsWith('-'));  // 플래그(-x, --xxx) 제외
  // npm/yarn/pnpm run <script> → 버려지기 쉬운 'run' 대신 스크립트 이름을 보여준다
  if (/^(npm|yarn|pnpm)$/i.test(prog) && rest[0] === 'run' && rest[1]) {
    return `${prog} ${rest[1]}`;
  }
  let sub = rest[0];
  if (sub && /[\\/]/.test(sub)) sub = sub.split(/[\\/]/).pop();  // 경로면 파일명만
  return sub ? `${koreanizeWord(prog)} ${koreanizeWord(sub)}` : koreanizeWord(prog);
}

// PostToolUse(Bash) 이벤트에서 '실패(0이 아닌 종료코드)'를 판정한다.
// Claude Code가 tool_response에 어떤 형태로 종료코드를 주는지 버전마다 달라
// 흔한 필드명을 두루 방어적으로 살핀다. (GEUMOKI_DEBUG=1이면 실제 형태를 로그로 남겨 튜닝 가능)
function bashFailed(ev) {
  const r = ev && ev.tool_response;
  if (r == null) return false;
  // CC 2.1.x에서 '성공'은 객체({stdout,stderr,exitCode:0,interrupted})로,
  // '실패'는 문자열("Error: Exit code 1\n...")로 온다. 둘 다 본다.
  if (typeof r === 'string') {
    return /^Error\b/i.test(r) || /exit code\s+[1-9]/i.test(r);
  }
  if (typeof r === 'object') {
    if (r.interrupted === true) return true;        // 중단도 실패로 취급
    for (const k of ['exitCode', 'exit_code', 'return_code', 'returncode', 'code', 'status']) {
      if (typeof r[k] === 'number') return r[k] !== 0;  // 버전 따라 객체에 코드가 실릴 수도
    }
    if (r.is_error === true || r.isError === true || r.success === false) return true;
  }
  return false;
}

// 도구 사용 이벤트 → '지금 실제로 하는 작업' 키워드 (예: renderer.js 수정, npm 설치)
function toolKeyword(ev) {
  if (!ev || typeof ev !== 'object') return '';
  const tool = ev.tool_name;
  if (!tool) return '';
  const ti = ev.tool_input || {};
  if (tool === 'Bash') {
    const cmd = String(ti.command || '').trim();
    if (!cmd) return '명령 실행';
    return bashKeyword(cmd);
  }
  const fp = ti.file_path || ti.path || ti.notebook_path || ti.pattern || '';
  const base = fp ? String(fp).split(/[\\/]/).pop() : '';
  const act = TOOL[tool] || koreanizeWord(tool);
  return base ? `${base} ${act}` : act;
}

// 훅이 직접 호출할 때만 실제로 메모지 파일을 쓴다(아래 require.main 가드).
// 순수 함수들은 모듈로 export 되어 테스트에서 부작용 없이 검증할 수 있다.
function runCli() {
const state = (process.argv[2] || 'idle').trim();
let raw = '';
let finished = false;

function finish() {
  if (finished) return;
  finished = true;

  const dir = DIR;
  const file = STATUS_FILE;

  // 직전 '요청 키워드(req)'를 이어받는다. 도구 이벤트가 연달아 와도
  // 요청 맥락은 유지하면서 '지금 하는 작업(tool)'만 갱신하기 위함.
  let req = '', tool = '', toolName = '', err = false;
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (prev && typeof prev.req === 'string') req = prev.req;
    if (prev && typeof prev.err === 'boolean') err = prev.err; // 직전 작업의 실패 여부 이어받기
  } catch {
    // 기존 파일 없음/깨짐 — req 없이 진행
  }

  try {
    const clean = raw.replace(/^﻿/, '').trim(); // 혹시 모를 BOM 제거
    if (clean) {
      const ev = JSON.parse(clean);
      if (ev && ev.prompt) {           // 사용자 프롬프트
        if (!isSyntheticPrompt(ev.prompt)) {  // 시스템 합성 프롬프트(task-notification 등)는 무시
          req = keywordsFromPrompt(ev.prompt); // 실제 요청만 키워드 갱신, 작업 초기화
          tool = '';
          toolName = '';                // 새 요청 → 머리 위 도구 아이콘도 비움
          err = false;                  // 새 요청 시작 → 실패 플래그 리셋
        }
        // 합성 프롬프트면 직전 실제 요청 맥락(req)을 그대로 유지
      } else if (ev) {                  // 도구 사용 → 작업만 갱신, 요청 키워드는 유지
        tool = toolKeyword(ev);
        toolName = ev.tool_name || '';  // 원래 도구 이름(머리 위 아이콘 매핑용)
        // PostToolUse(Bash)에는 tool_response가 실려온다 → 가장 최근 Bash의 성공/실패로 갱신.
        // (PreToolUse엔 tool_response가 없어 err는 그대로 유지)
        if (ev.tool_name === 'Bash' && ev.tool_response !== undefined) {
          err = bashFailed(ev);
          if (process.env.GEUMOKI_DEBUG) {
            try {
              fs.mkdirSync(dir, { recursive: true });
              fs.appendFileSync(path.join(dir, 'bash-debug.log'),
                JSON.stringify({ at: Date.now(), failed: err, resp: ev.tool_response }).slice(0, 2000) + '\n');
            } catch { /* 디버그 실패는 무시 */ }
          }
        }
      }
    }
  } catch {
    // 파싱 실패 — 키워드 없이 진행
  }

  // 세션이 새로 시작되면 직전 세션의 요청 맥락은 비운다.
  if (state === 'start') { req = ''; tool = ''; toolName = ''; err = false; }

  // 짧은 요청 키워드 + 실제 작업 중인 것을 섞어서 표시
  const keyword = (req && tool) ? `${req} · ${tool}` : (req || tool || '');

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ state, ts: Date.now(), keyword, req, tool, toolName, err }), 'utf8');
  } catch {
    // 무시 — 금옥이 때문에 Claude Code가 멈추는 일은 없어야 한다
  }

  process.exit(0);
}

// hook이 stdin으로 주는 이벤트 JSON을 비동기로 읽는다(Windows 호환).
try {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
  setTimeout(finish, 300); // 안전장치: stdin이 없거나 안 닫혀도 멈추지 않게
} catch {
  finish();
}
}

// 훅으로 직접 실행될 때만 메모지를 쓴다. require()로 불러오면(테스트) 부작용 없음.
if (require.main === module) runCli();

// 키워드 추출 규칙을 테스트에서 검증할 수 있게 순수 함수만 내보낸다.
module.exports = { keywordsFromPrompt, bashKeyword, toolKeyword, koreanizeWord, isSyntheticPrompt, bashFailed };
