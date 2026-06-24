#!/usr/bin/env node
// Claude Code의 hook이 부르는 작은 스크립트.
// 인자로 받은 상태(start/working/busy/done/waiting/end)와,
// stdin으로 들어온 이벤트 정보에서 뽑은 "키워드"를 메모지 파일에 적는다.
// Claude Code 동작을 절대 막지 않도록: 빠르게 쓰고, 무슨 일이 있어도 조용히 0으로 끝낸다.

const fs = require('fs');
const path = require('path');
const os = require('os');

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

function extractKeyword(ev) {
  if (!ev || typeof ev !== 'object') return '';
  const tool = ev.tool_name;
  if (tool) {
    const ti = ev.tool_input || {};
    if (tool === 'Bash') {
      const cmd = String(ti.command || '').trim();
      if (!cmd) return '명령 실행';
      // 명령 앞 두 토큰만 한국어로 (예: "npm install" → "npm 설치")
      return cmd.split(/\s+/).slice(0, 2).map(koreanizeWord).join(' ');
    }
    const fp = ti.file_path || ti.path || ti.notebook_path || ti.pattern || '';
    const base = fp ? String(fp).split(/[\\/]/).pop() : '';
    const act = TOOL[tool] || koreanizeWord(tool);
    return base ? `${base} ${act}` : act;
  }
  if (ev.prompt) return shorten(ev.prompt); // 사용자가 보낸 요청 요약
  return '';
}

const state = (process.argv[2] || 'idle').trim();
let raw = '';
let finished = false;

function finish() {
  if (finished) return;
  finished = true;

  let keyword = '';
  try {
    const clean = raw.replace(/^﻿/, '').trim(); // 혹시 모를 BOM 제거
    if (clean) keyword = extractKeyword(JSON.parse(clean));
  } catch {
    // 파싱 실패 — 키워드 없이 진행
  }

  try {
    const dir = path.join(os.homedir(), '.claude', 'geumoki');
    const file = path.join(dir, 'status.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ state, ts: Date.now(), keyword }), 'utf8');
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
