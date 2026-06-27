#!/usr/bin/env node
// 금옥이를 Claude Code에 연결/해제하는 도우미.
//   연결:  node src/install-hooks.js
//   해제:  node src/install-hooks.js --remove
//
// 전역 ~/.claude/settings.json 의 hooks 에 "금옥이 hook"만 추가/제거한다.
// 기존 hook(다른 자동화)은 절대 건드리지 않으며, 실행 전 백업을 만든다.

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const WRITER = path.join(__dirname, 'write-status.js');
const remove = process.argv.includes('--remove');

// Claude Code hook 이벤트 → 금옥이 상태
const MAP = {
  SessionStart: 'start',
  UserPromptSubmit: 'working',
  PreToolUse: 'busy',       // 도구 사용 시점 — 무슨 작업인지 키워드 갱신
  PostToolUse: 'busy',      // 도구 끝난 시점 — Bash면 종료코드로 성공/실패(err) 갱신
  Stop: 'done',
  Notification: 'waiting',
  SessionEnd: 'end',
};

// 이 command 안에 write-status.js 경로가 들어있으면 "금옥이 것"으로 식별
function isGeumoki(entry) {
  const hooks = (entry && entry.hooks) || [];
  return hooks.some(
    (h) => typeof h.command === 'string' && h.command.includes('write-status.js')
  );
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch {
    return {};
  }
}

function main() {
  const settings = load();

  // 백업 (기존 파일이 있을 때만)
  if (fs.existsSync(SETTINGS)) {
    fs.copyFileSync(SETTINGS, SETTINGS + '.geumoki-backup');
  }

  settings.hooks = settings.hooks || {};

  for (const [event, state] of Object.entries(MAP)) {
    const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    // 기존 금옥이 항목은 항상 제거(중복/경로변경 대비)
    const cleaned = list.filter((e) => !isGeumoki(e));

    if (!remove) {
      const entry = {
        hooks: [
          {
            type: 'command',
            command: `node "${WRITER}" ${state}`,
          },
        ],
      };
      // 도구 이벤트는 matcher로 자주 쓰는 도구에만 (Read/Grep 등 너무 잦은 호출 제외)
      if (event === 'PreToolUse') {
        entry.matcher = 'Edit|MultiEdit|Write|Bash|Task|NotebookEdit';
      }
      // 끝난 시점은 Bash만 — 종료코드로 실패 감지(다른 도구는 굳이 매번 안 봄)
      if (event === 'PostToolUse') {
        entry.matcher = 'Bash';
      }
      cleaned.push(entry);
    }

    if (cleaned.length) settings.hooks[event] = cleaned;
    else delete settings.hooks[event];
  }

  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), 'utf8');

  if (remove) {
    console.log('금옥이 hook을 제거했어요. (Claude Code를 새로 켜면 적용됩니다)');
  } else {
    console.log('금옥이 hook을 연결했어요!');
    console.log('이제 Claude Code를 새로 켜면 금옥이가 상태를 알아챕니다.');
    console.log('기존 설정은 백업해뒀어요: ' + SETTINGS + '.geumoki-backup');
  }
}

main();
