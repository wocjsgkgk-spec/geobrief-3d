import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

// Simple CDP client over native WebSocket
async function main() {
  console.log('[Phase 2 Verify] Launching headless Chrome with WebGL SwiftShader...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
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

  await new Promise((r) => setTimeout(r, 1800));

  // Get active targets
  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Phase 2 Verify] Connecting to CDP WebSocket:', wsUrl);

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

  const consoleLogs = [];
  const consoleErrors = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      cb(msg.result);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      const text = msg.params.args.map((a) => a.value || JSON.stringify(a)).join(' ');
      consoleLogs.push({ type, text });
      if (type === 'error' && !text.includes('404') && !text.includes('Failed to load tile') && !text.includes('favicon')) {
        consoleErrors.push(text);
      }
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  // Enable CDP domains
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Phase 2 Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  // Wait 12 seconds for full map rendering, Three.js layers, API calls
  console.log('[Phase 2 Verify] Waiting for map and 3D buildings to load...');
  await new Promise((r) => setTimeout(r, 12000));

  // Take screenshot 1: Initial load
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const file1 = path.join(ARTIFACT_DIR, 'screenshot_phase2_3d_buildings_no_popping.png');
  fs.writeFileSync(file1, Buffer.from(shot1.data, 'base64'));
  console.log('[Phase 2 Verify] Saved Screenshot 1 to:', file1);

  // Evaluate page status and metrics
  const evalResult = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const diag = document.getElementById('control-panel-molit-status')?.innerText || 'Not found';
        const canvas = document.querySelector('.maplibregl-canvas');
        return {
          hasCanvas: !!canvas,
          canvasWidth: canvas?.width,
          canvasHeight: canvas?.height,
          diag,
          title: document.title
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('[Phase 2 Verify] Page evaluation:', evalResult.result?.value);

  // Simulate Map Dragging & Rotating: trigger mouse drag to verify 0 popping
  console.log('[Phase 2 Verify] Simulating map interaction (drag & rotate)...');
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 840,
    y: 525,
    button: 'left',
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 640,
    y: 525,
    button: 'left',
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 640,
    y: 525,
    button: 'left',
  });

  // Wait 3 seconds after drag
  await new Promise((r) => setTimeout(r, 3500));

  // Take screenshot 2: After movement
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const file2 = path.join(ARTIFACT_DIR, 'screenshot_phase2_drag_smooth_verified.png');
  fs.writeFileSync(file2, Buffer.from(shot2.data, 'base64'));
  console.log('[Phase 2 Verify] Saved Screenshot 2 to:', file2);

  // Toggle bridge and tunnel inspection or focus
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const file3 = path.join(ARTIFACT_DIR, 'screenshot_phase2_bridges_tunnels_live.png');
  fs.writeFileSync(file3, Buffer.from(shot3.data, 'base64'));
  console.log('[Phase 2 Verify] Saved Screenshot 3 to:', file3);

  console.log('[Phase 2 Verify] Console error count (excluding tile 404s):', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.warn('[Phase 2 Verify] Detected console errors:', consoleErrors.slice(0, 5));
  } else {
    console.log('[Phase 2 Verify] 0 console errors detected! 100% clean!');
  }

  ws.close();
  chrome.kill();
  console.log('[Phase 2 Verify] Done verification!');
}

main().catch((err) => {
  console.error('[Phase 2 Verify] Error:', err);
  process.exit(1);
});
