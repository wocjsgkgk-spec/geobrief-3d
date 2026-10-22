import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify] Killing any existing 9223 processes...');
  try {
    spawn('pkill', ['-9', '-f', '9223']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify] Launching headless Chrome with WebGL SwiftShader...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1680,1050',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page') || versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Verify] Connecting to CDP WebSocket for page target:', wsUrl);

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  console.log('[Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify] Waiting 12 seconds for map, layers, and 3D buildings to load...');
  await new Promise((r) => setTimeout(r, 12000));

  // 1. Move camera to Chiak Bridge (치악교 [127.9512, 37.3524])
  console.log('[Verify] Jumping camera to Chiak Bridge (치악교)...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9512, 37.3524],
          zoom: 16.5,
          pitch: 55,
          bearing: 40
        });
      }
    `,
  });

  await new Promise((r) => setTimeout(r, 4000));

  // Take screenshot 1: Chiak Bridge
  const snap1 = await send('Page.captureScreenshot', { format: 'png' });
  const snap1Path = path.join(ARTIFACT_DIR, 'screenshot_chiak_bridge_aligned_no_floating_box.png');
  fs.writeFileSync(snap1Path, Buffer.from(snap1.data, 'base64'));
  console.log('[Verify] Saved Chiak Bridge screenshot to:', snap1Path);

  // 2. Move camera to Wonju urban core
  console.log('[Verify] Jumping camera to Wonju urban core...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.940, 37.350],
          zoom: 16.2,
          pitch: 52,
          bearing: 25
        });
      }
    `,
  });

  await new Promise((r) => setTimeout(r, 4000));

  // Take screenshot 2: Building Footprints without giant monolithic blocks
  const snap2 = await send('Page.captureScreenshot', { format: 'png' });
  const snap2Path = path.join(ARTIFACT_DIR, 'screenshot_no_giant_grey_blocks_building_footprints_only.png');
  fs.writeFileSync(snap2Path, Buffer.from(snap2.data, 'base64'));
  console.log('[Verify] Saved Building Footprints screenshot to:', snap2Path);

  // Close chrome
  ws.close();
  chrome.kill();
  console.log('[Verify] Complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify] Error:', err);
  process.exit(1);
});
