// 금옥이 스프라이트 시트(seal-img.js)의 첫 프레임을 잘라 512×512 PNG 아이콘으로 저장한다.
// electron-builder가 이 PNG를 Windows .ico / macOS .icns 로 자동 변환해 준다(맥은 512 이상 필요).
// 실행: node_modules/.bin/electron build/make-icon.js
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const FRAMES = 24;
const OUT = path.join(__dirname, 'icon.png');
const TRAY_OUT = path.join(__dirname, '..', 'src', 'tray.png');  // 트레이/창 아이콘(앱에 번들됨)

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  try {
    const sheetJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'seal-img.js'), 'utf8');
    const m = sheetJs.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/);
    if (!m) throw new Error('seal-img.js 에서 data URL을 못 찾음');

    const sheet = nativeImage.createFromDataURL(m[0]);
    const { width, height } = sheet.getSize();
    const frameW = Math.round(width / FRAMES);

    // 첫 프레임에서 가운데 정사각형(높이 기준)만 잘라낸다 — 비율 왜곡 없이 정사각 아이콘.
    const side = Math.min(frameW, height);
    const cropX = Math.round((frameW - side) / 2);
    const cropY = Math.round((height - side) / 2);
    let icon = sheet.crop({ x: cropX, y: cropY, width: side, height: side });
    icon = icon.resize({ width: 512, height: 512, quality: 'best' });

    fs.writeFileSync(OUT, icon.toPNG());
    console.log('[icon] 저장됨:', OUT, `(시트 ${width}x${height}, 프레임폭 ${frameW}, 정사각 ${side})`);

    // 트레이/창용 작은 아이콘(32x32) — 알림영역에 또렷하게 보이도록.
    const tray = icon.resize({ width: 32, height: 32, quality: 'best' });
    fs.writeFileSync(TRAY_OUT, tray.toPNG());
    console.log('[icon] 트레이 저장됨:', TRAY_OUT, '(32x32)');
  } catch (err) {
    console.error('[icon] 실패:', err && err.message);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
