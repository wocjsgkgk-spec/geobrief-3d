/**
 * scripts/capture-stage2-vworld-pure.mjs
 *
 * Captures verification screenshots and diagnostic metrics for Stage 2:
 * 1. Purged fake buildings (orange roof forest grids, mountain boxes, dummy boxes).
 * 2. Purged giant floor slabs / fill-extrusions (visibility 'none').
 * 3. Verified genuine V-World LT_C_SPBD and wonju_core buildings.
 * 4. Active layer count <= 15.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';
const PORT = 3000;
const CDP_PORT = 9226;

async function main() {
  console.log('[Stage2-Capture] Killing any leftover chrome on', CDP_PORT);
  try {
    spawn('pkill', ['-9', '-f', String(CDP_PORT)]);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Stage2-Capture] Launching headless Chrome with WebGL on port', CDP_PORT);
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
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
    http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, (res) => {
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
  console.log('[Stage2-Capture] Connecting to CDP WebSocket:', pageWsUrl);

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
  console.log('[Stage2-Capture] Connected to CDP');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('DOM.enable');

  console.log(`[Stage2-Capture] Navigating to http://localhost:${PORT} ...`);
  await sendCmd('Page.navigate', { url: `http://localhost:${PORT}` });

  console.log('[Stage2-Capture] Waiting 15s for map and 3D layers initialization...');
  await new Promise((r) => setTimeout(r, 15000));

  // Query diagnostic status
  const diagRes = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map || window.map;
        if (!map) return { error: 'Map not found' };
        
        const style = map.getStyle();
        const allLayers = style ? style.layers : [];
        const activeLayers = allLayers.filter(l => l.layout?.visibility !== 'none');
        
        const fillExtrusions = allLayers
          .filter(l => l.type === 'fill-extrusion')
          .map(l => ({ id: l.id, visibility: l.layout?.visibility || 'visible' }));
        
        const realisticLayer = map.getLayer('realistic-korean-city-layer');

        return {
          totalLayers: allLayers.length,
          activeLayerCount: activeLayers.length,
          activeLayerIds: activeLayers.map(l => l.id),
          fillExtrusions,
          hasRealisticCityLayer: Boolean(realisticLayer),
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing()
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Stage2-Capture] Diagnostic evaluation:', JSON.stringify(diagRes?.result?.value, null, 2));

  // View 1: Wonju urban core with genuine V-World buildings
  console.log('[Stage2-Capture] Setting camera for View 1: Wonju Urban Core');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map || window.map;
        if (map) {
          map.jumpTo({
            center: [127.9358, 37.3592],
            zoom: 16.2,
            pitch: 58,
            bearing: 25
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 5000));

  console.log('[Stage2-Capture] Capturing screenshot 1: screenshot_stage2_vworld_aligned_wonju.png');
  const shot1 = await sendCmd('Page.captureScreenshot', {
    format: 'png',
  });
  const file1 = path.join(ARTIFACT_DIR, 'screenshot_stage2_vworld_aligned_wonju.png');
  fs.writeFileSync(file1, Buffer.from(shot1.data, 'base64'));
  console.log('[Stage2-Capture] Saved:', file1);

  // View 2: Forest & mountain area to verify no ghost/dummy buildings
  console.log('[Stage2-Capture] Setting camera for View 2: Forest & Mountain Boundary (No Fake Buildings)');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map || window.map;
        if (map) {
          map.jumpTo({
            center: [127.9420, 37.3530],
            zoom: 16.4,
            pitch: 62,
            bearing: -40
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 4000));

  console.log('[Stage2-Capture] Capturing screenshot 2: screenshot_stage2_no_fake_buildings.png');
  const shot2 = await sendCmd('Page.captureScreenshot', {
    format: 'png',
  });
  const file2 = path.join(ARTIFACT_DIR, 'screenshot_stage2_no_fake_buildings.png');
  fs.writeFileSync(file2, Buffer.from(shot2.data, 'base64'));
  console.log('[Stage2-Capture] Saved:', file2);

  ws.close();
  chrome.kill('SIGTERM');
  console.log('[Stage2-Capture] Completed successfully!');
}

main().catch((err) => {
  console.error('[Stage2-Capture] Error:', err);
  process.exit(1);
});
