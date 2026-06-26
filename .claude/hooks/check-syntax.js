#!/usr/bin/env node
// PostToolUse 훅 — 방금 Edit/Write 한 .js 파일을 즉시 `node --check` 로 검사한다.
// 문법 오류가 있으면 stderr 로 내용을 알리고 exit 2 → Claude 가 바로 고치게 한다.
// 정상이거나 .js 가 아니면 조용히 통과(exit 0). 다른 도구/파일은 건드리지 않는다.

const { execFileSync } = require('child_process');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const ti = data.tool_input || {};
  const fp = ti.file_path || ti.path;
  if (!fp || !/\.(js|mjs|cjs)$/i.test(fp)) process.exit(0);

  try {
    execFileSync(process.execPath, ['--check', fp], { stdio: 'pipe' });
    process.exit(0); // 문법 OK
  } catch (e) {
    const detail = (e.stderr && e.stderr.toString().trim()) || e.message;
    console.error(`[금옥이] 문법 오류 — ${fp}\n${detail}`);
    process.exit(2); // Claude 에게 피드백
  }
});
