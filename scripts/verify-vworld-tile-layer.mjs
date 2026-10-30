import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-VWorld-Layer] Cleaning any leftover chrome on 9224...');
  try {
    spawn('pkill', ['-9', '-f', '9224']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-VWorld-Layer] Launching headless Chrome with WebGL on port 9224...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,1050',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9224/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget =
    versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') ||
    versionData.find((t) => t.type === 'page') ||
    versionData[0];
  const pageWsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Verify-VWorld-Layer] Connecting to CDP WebSocket for page target:', pageWsUrl);

  const ws = new WebSocket(pageWsUrl);

  let idCounter = 1;
  const pendingRequests = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  console.log('[Verify-VWorld-Layer] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('DOM.enable');

  console.log('[Verify-VWorld-Layer] Navigating to http://localhost:3110 ...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-VWorld-Layer] Waiting 16s for map initialization & 3D tiles loading...');
  await new Promise((r) => setTimeout(r, 16000));

  // Step 1: Verify presence of window.__map, window.__vworld3DTileLayer, and layer registration
  console.log('[Verify-VWorld-Layer] Checking live application and layer status...');
  const appCheck = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map;
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        const vworldLayer = window.__vworld3DTileLayer;

        return {
          hasMap: Boolean(map),
          hasStore: Boolean(store),
          hasVworld3DLayer: Boolean(vworldLayer),
          isLayerRegisteredInMap: map ? Boolean(map.getLayer('vworld-3d-tile-layer')) : false,
          vworld3DRealEnabled: store ? store.layers.vworld3DReal : null,
          vworldTileStats: store ? store.vworldTileStats : null,
          zoom: map ? map.getZoom() : null,
          center: map ? map.getCenter() : null,
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Verify-VWorld-Layer] Environment & Layer check:', JSON.stringify(appCheck.result?.value, null, 2));

  // Step 2: Trigger camera pitch & tilt for 3D perspective
  console.log('[Verify-VWorld-Layer] Setting 3D perspective camera (pitch 60, bearing 25)...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        if (window.__map) {
          window.__map.easeTo({
            pitch: 60,
            bearing: 25,
            duration: 1000,
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 3000));

  // Step 3: Capture screenshot
  console.log('[Verify-VWorld-Layer] Capturing Screenshot: V-World 3D Tile Streaming...');
  const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(ARTIFACT_DIR, 'screenshot_vworld_3d_tile_streaming.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log('[Verify-VWorld-Layer] Saved:', shotPath);

  // Close chrome
  try {
    chrome.kill();
  } catch {}

  console.log('[Verify-VWorld-Layer] Verification and capture completed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify-VWorld-Layer] Error:', err);
  process.exit(1);
});
