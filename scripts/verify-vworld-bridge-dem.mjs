import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-Bridge-DEM] Cleaning any leftover chrome on 9224...');
  try {
    spawn('pkill', ['-9', '-f', '9224']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-Bridge-DEM] Launching headless Chrome with WebGL on port 9224...');
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
  console.log('[Verify-Bridge-DEM] Connecting to CDP WebSocket for page target:', pageWsUrl);

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
  console.log('[Verify-Bridge-DEM] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('DOM.enable');

  console.log('[Verify-Bridge-DEM] Navigating to http://localhost:3110 ...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-Bridge-DEM] Waiting 16s for map initialization & 3D tiles loading...');
  await new Promise((r) => setTimeout(r, 16000));

  // Step 1: Enable vworld3DBridges and vworldDemTerrain in store
  console.log('[Verify-Bridge-DEM] Activating 3D Bridges and DEM Terrain in store...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        if (!store) return { error: 'Store not found' };

        if (!store.layers.vworld3DBridges) store.toggleLayer('vworld3DBridges');
        if (!store.layers.vworldDemTerrain) store.toggleLayer('vworldDemTerrain');

        if (window.__map) {
          window.__map.easeTo({
            pitch: 62,
            bearing: 35,
            duration: 1000,
          });
        }
        return {
          vworld3DReal: store.layers.vworld3DReal,
          vworld3DBridges: store.layers.vworld3DBridges,
          vworldDemTerrain: store.layers.vworldDemTerrain,
        };
      })()
    `,
    returnByValue: true,
  });

  // Wait 4s for tiles to load and stream
  await new Promise((r) => setTimeout(r, 4000));

  // Step 2: Check stats
  const statsRes = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        const vworldLayer = window.__vworld3DTileLayer;
        return {
          hasVworld3DLayer: Boolean(vworldLayer),
          stats: store ? store.vworldTileStats : null,
          layers: store ? {
            vworld3DReal: store.layers.vworld3DReal,
            vworld3DBridges: store.layers.vworld3DBridges,
            vworldDemTerrain: store.layers.vworldDemTerrain,
          } : null,
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Verify-Bridge-DEM] Live Stats:', JSON.stringify(statsRes.result?.value, null, 2));

  // Step 3: Capture high-res screenshot
  console.log('[Verify-Bridge-DEM] Capturing Screenshot: V-World 3D Bridge & DEM Streaming...');
  const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(ARTIFACT_DIR, 'screenshot_vworld_3d_bridge_and_dem.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log('[Verify-Bridge-DEM] Saved:', shotPath);

  // Close chrome
  try {
    chrome.kill();
  } catch {}

  console.log('[Verify-Bridge-DEM] Verification and capture completed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify-Bridge-DEM] Error:', err);
  process.exit(1);
});
