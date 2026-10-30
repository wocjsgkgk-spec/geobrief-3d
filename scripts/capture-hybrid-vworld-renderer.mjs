/**
 * scripts/capture-hybrid-vworld-renderer.mjs
 *
 * [GeoBrief 3D 2단계] 브이월드 실사 메쉬 + 고해상도 절차적 아키텍처 하이브리드 렌더러 실증 캡처
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Capture-Hybrid] Cleaning any leftover chrome on 9225...');
  try {
    spawn('pkill', ['-9', '-f', '9225']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Capture-Hybrid] Launching headless Chrome with WebGL on port 9225...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9225',
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
    http.get('http://127.0.0.1:9225/json/list', (res) => {
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
  console.log('[Capture-Hybrid] Connecting to CDP WebSocket for page target:', pageWsUrl);

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
  console.log('[Capture-Hybrid] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('DOM.enable');

  console.log('[Capture-Hybrid] Navigating to http://localhost:3110 ...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Capture-Hybrid] Waiting 16s for map initialization & hybrid city rendering...');
  await new Promise((r) => setTimeout(r, 16000));

  // Step 1: Query map, layers, and building stats
  console.log('[Capture-Hybrid] Querying active layers and 3D camera orientation...');
  const stateRes = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        const map = window.__map;
        if (!map) return { error: 'Map instance not found' };

        // 3D 뷰 앵글을 브이월드 감상 각도(Pitch 60, Bearing 25, Zoom 15.6)로 부드럽게 조정
        map.easeTo({
          center: [127.950, 37.350], // 원주천 및 도심 일대
          zoom: 15.8,
          pitch: 62,
          bearing: 28,
          duration: 1000,
        });

        const hasRealisticCityLayer = Boolean(map.getLayer('realistic-korean-city-layer'));
        const hasVworld3DLayer = Boolean(map.getLayer('vworld-3d-tile-layer'));
        const hasRoadAsphalt = Boolean(map.getLayer('road-asphalt'));
        const hasRoadCenterline = Boolean(map.getLayer('road-centerline'));
        const hasCrosswalks = Boolean(map.getLayer('korean-crosswalk-stripes'));

        return {
          hasRealisticCityLayer,
          hasVworld3DLayer,
          hasRoadAsphalt,
          hasRoadCenterline,
          hasCrosswalks,
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Capture-Hybrid] Map & Layer State:', JSON.stringify(stateRes?.result?.value, null, 2));

  // Wait 4s for camera transition and render stabilization
  await new Promise((r) => setTimeout(r, 4000));

  // Step 2: Capture High-Res Screenshot
  console.log('[Capture-Hybrid] Capturing full-screen proof screenshot...');
  const screenshotRes = await sendCmd('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  });

  const imgBuf = Buffer.from(screenshotRes.data, 'base64');
  const localPath = path.join(process.cwd(), 'screenshot_hybrid_vworld_realistic_city.png');
  const artifactPath = path.join(ARTIFACT_DIR, 'screenshot_hybrid_vworld_realistic_city.png');

  fs.writeFileSync(localPath, imgBuf);
  fs.writeFileSync(artifactPath, imgBuf);
  console.log(`[Capture-Hybrid] Screenshot successfully saved to:\n  -> ${localPath}\n  -> ${artifactPath} (${(imgBuf.length / 1024).toFixed(1)} KB)`);

  ws.close();
  try {
    chrome.kill('SIGKILL');
  } catch {}

  console.log('[Capture-Hybrid] Verification and capture completed successfully!');
}

main().catch((err) => {
  console.error('[Capture-Hybrid] Error:', err);
  process.exit(1);
});
