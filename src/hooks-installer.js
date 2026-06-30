// 금옥이 ↔ Claude Code 연동(작업 추적) 켜기/끄기.
// 패키징된 앱에서도 동작하도록, write-status.js를 안정적인 위치(userData/hooks)에 복사하고
// 전역 ~/.claude/settings.json 의 hooks 에 "금옥이 hook"만 추가/제거한다.
// 기존 hook(다른 자동화)은 절대 건드리지 않으며, 실행 전 백업을 만든다.
const fs = require('fs');
const path = require('path');
const os = require('os');

// Claude Code hook 이벤트 → 금옥이 상태 (install-hooks.js 와 동일하게 유지)
const MAP = {
  SessionStart: 'start',
  UserPromptSubmit: 'working',
  PreToolUse: 'busy',
  PostToolUse: 'busy',
  Stop: 'done',
  Notification: 'waiting',
  SessionEnd: 'end',
};

// 훅 명령에 들어가는 writer 가 의존하는 파일들(같은 폴더에 함께 둬야 require 가 됨)
const WRITER_FILES = ['write-status.js', 'status-path.js'];

// 테스트에서 실제 ~/.claude 를 건드리지 않도록 경로에 env seam 을 둔다(평소엔 무시됨).
function settingsPath() {
  return process.env.GEUMOKI_SETTINGS_OVERRIDE || path.join(os.homedir(), '.claude', 'settings.json');
}
function hooksDir() {
  if (process.env.GEUMOKI_HOOKS_DIR_OVERRIDE) return process.env.GEUMOKI_HOOKS_DIR_OVERRIDE;
  // 안정적인 사용자 폴더(%APPDATA%\금옥이\hooks). 임시폴더와 달리 정리돼도 사라지지 않는다.
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'hooks');
}
function writerPath() {
  return path.join(hooksDir(), 'write-status.js');
}

// command 안에 write-status.js 경로가 있으면 "금옥이 것"으로 식별
function isGeumoki(entry) {
  const hooks = (entry && entry.hooks) || [];
  return hooks.some((h) => typeof h.command === 'string' && h.command.includes('write-status.js'));
}

// 연동이 켜져 있는지(설정에 금옥이 hook 이 있는지)
function isInstalled() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    const hooks = (s && s.hooks) || {};
    return Object.values(hooks).some((list) => Array.isArray(list) && list.some(isGeumoki));
  } catch {
    return false;
  }
}

// writer 파일들을 앱(srcDir, asar 가능)에서 읽어 안정적인 hooks 폴더로 복사한다.
function copyWriterFiles(srcDir) {
  const dir = hooksDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const f of WRITER_FILES) {
    // asar 안의 파일도 Electron fs 로 읽힌다. read→write 로 실제 파일로 떨어뜨린다.
    const content = fs.readFileSync(path.join(srcDir, f));
    fs.writeFileSync(path.join(dir, f), content);
  }
}

// settings.json 의 금옥이 hook 만 추가(install=true)/제거(false). 다른 hook 은 보존.
function setHooks(install) {
  const SETTINGS = settingsPath();
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) || {};
  } catch {
    settings = {};
  }
  if (fs.existsSync(SETTINGS)) {
    fs.copyFileSync(SETTINGS, SETTINGS + '.geumoki-backup');
  }
  settings.hooks = settings.hooks || {};
  const WRITER = writerPath();

  for (const [event, state] of Object.entries(MAP)) {
    const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    const cleaned = list.filter((e) => !isGeumoki(e));   // 기존 금옥이 항목은 항상 제거(경로변경/중복 대비)

    if (install) {
      const entry = { hooks: [{ type: 'command', command: `node "${WRITER}" ${state}` }] };
      if (event === 'PreToolUse') {
        entry.matcher = 'Read|Edit|MultiEdit|Write|Bash|Task|NotebookEdit|Grep|Glob|WebFetch|WebSearch|TodoWrite';
      }
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
}

// 연동 켜기: writer 복사 + settings 등록
function install(srcDir) {
  copyWriterFiles(srcDir);
  setHooks(true);
}
// 연동 끄기: settings 에서 금옥이 hook 제거(복사해둔 writer 파일은 남겨도 무해)
function uninstall() {
  setHooks(false);
}

module.exports = { isInstalled, install, uninstall, settingsPath, hooksDir };
