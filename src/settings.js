// 금옥이 설정·마지막 위치 저장 — 다음에 켰을 때 같은 자리에서 깨어나도록.
// userData 폴더의 geumoki-settings.json 에 JSON 한 덩어리로 보관한다.
// (지금은 창 위치 x,y만 쓰지만, 나중에 크기·음소거 같은 설정도 여기에 얹으면 된다.)
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// 파일 경로는 app 이 준비된 뒤에만 확정되므로 '쓸 때' 계산한다.
function file() {
  return path.join(app.getPath('userData'), 'geumoki-settings.json');
}

// 한 번 읽으면 메모리에 들고 있다가, 바뀔 때만 디스크에 다시 쓴다.
let cache = null;
function load() {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cache = (data && typeof data === 'object') ? data : {};
  } catch {
    cache = {};   // 파일 없음/깨짐 → 빈 설정
  }
  return cache;
}

// patch 의 키만 덮어써서 저장(나머지 설정은 보존).
function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.writeFileSync(file(), JSON.stringify(cache));
  } catch {
    // 저장 실패해도 앱 동작엔 지장 없음(다음에 기본 위치로 뜰 뿐)
  }
  return cache;
}

module.exports = { load, save };
