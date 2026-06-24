// 금옥이와 Claude Code가 공유하는 "메모지" 파일 경로.
// 전역(홈 디렉토리)에 두기 때문에 어느 폴더에서 Claude Code를 켜든 같은 파일을 본다.
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.claude', 'geumoki');
const STATUS_FILE = path.join(DIR, 'status.json');

module.exports = { DIR, STATUS_FILE };
