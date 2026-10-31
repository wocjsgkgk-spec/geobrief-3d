import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Capture-Inspector] Connecting to Chrome on port 9229...');
  try { spawn('pkill', ['-9', '-f', '9229']); } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--user-data-dir=/tmp/chrome-inspect-' + Date.now(),
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,1050',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9229/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const parsed = JSON.parse(event.data);
    if (parsed.id && pending.has(parsed.id)) {
      const { resolve, reject } = pending.get(parsed.id);
      pending.delete(parsed.id);
      if (parsed.error) reject(parsed.error);
      else resolve(parsed.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[Capture-Inspector] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Capture-Inspector] Waiting 12s for load...');
  await new Promise((r) => setTimeout(r, 12000));

  console.log('[Capture-Inspector] Triggering building inspection card popup...');
  const fireClickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      if (window.__inspectBuilding) {
        window.__inspectBuilding({
          name: '1군지사 본부 병영막사(3동)',
          category: '군사시설 / 통합병영막사',
          levels: 3,
          height: 9.5,
          center: [127.9358, 37.3592],
          screenPos: { x: 500, y: 400 },
          rawProperties: {
            '건물명': '1군지사 본부 병영막사(3동)',
            '주용도': '군사시설',
            '주구조': '철근콘크리트조',
            '지붕형식': '적갈색 기와 박공지붕',
            '실측높이': '9.5m',
            '지상층수': '3층',
            realLevels: 3,
            realHeight: 9.5,
            realStruct: '철근콘크리트조',
            realRoof: '적갈색 기와 박공지붕',
            realUse: '군 주둔지 영내 막사'
          }
        });
        return { fired: true, method: '__inspectBuilding' };
      }
      return { fired: false };
    })()`,
    returnByValue: true,
  });
  console.log('[Capture-Inspector] Fire click res:', JSON.stringify(fireClickRes.value, null, 2));

  await new Promise((r) => setTimeout(r, 4000));

  console.log('[Capture-Inspector] Capturing inspector drawer screenshot...');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(ARTIFACT_DIR, 'screenshot_phase3_cadastral_inspector_drawer.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log('[Capture-Inspector] Saved to:', shotPath);

  ws.close();
  chrome.kill();
  console.log('[Capture-Inspector] Done!');
}

main().catch(console.error);
