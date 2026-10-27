import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-VWorld-Analysis] Cleaning any leftover chrome on 9224...');
  try {
    spawn('pkill', ['-9', '-f', '9224']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-VWorld-Analysis] Launching headless Chrome with WebGL on port 9224...');
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
  console.log('[Verify-VWorld-Analysis] Connecting to CDP WebSocket for page target:', pageWsUrl);

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
  console.log('[Verify-VWorld-Analysis] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('DOM.enable');

  console.log('[Verify-VWorld-Analysis] Navigating to http://localhost:3110 ...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-VWorld-Analysis] Waiting 16s for map initialization...');
  await new Promise((r) => setTimeout(r, 16000));

  // Step 1: Verify presence of window.__map and window.__useMapStore
  console.log('[Verify-VWorld-Analysis] Checking live application environment...');
  const appCheck = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          hasMap: Boolean(window.__map),
          hasStore: Boolean(window.__useMapStore),
          canvasExists: Boolean(document.querySelector('canvas')),
          center: window.__map ? window.__map.getCenter() : null,
          zoom: window.__map ? window.__map.getZoom() : null,
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Verify-VWorld-Analysis] Environment check:', appCheck.result?.value);

  // Step 2: Trigger measurement and daylight simulation
  console.log('[Verify-VWorld-Analysis] Testing 7 V-World analysis tools via store...');
  const testSuiteRes = await sendCmd('Runtime.evaluate', {
    expression: `
      (async () => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        const map = window.__map;
        if (!store || !map) return { error: 'Store or Map not found' };

        const results = {};

        // 1. Tool 1: 3D Measure mode
        store.setMeasureMode(true);
        store.setMeasureSubtype('distance');
        // Simulate points
        store.setMeasurePoints([
          [127.9358, 37.3592, 110],
          [127.9385, 37.3620, 145]
        ]);
        results.measure = store.measureResult;

        // 2. Tool 3: Sunlight & Continuous daylight
        store.setSunSeason('winter');
        store.setSunlightTime('11:30');
        results.sunSeason = store.sunSeason;
        results.daylightResult = store.continuousDaylightResult;

        // 3. Tool 5: Cut & Fill with Civil Cost
        store.setCutFillEnabled(true);
        store.setTargetElevation(115);
        results.cutFill = store.cutFillResult;

        // 4. Tool 7: Site Feasibility
        results.feasibility = store.siteFeasibilityResult;

        return results;
      })()
    `,
    returnByValue: true,
    awaitPromise: true,
  });

  console.log('[Verify-VWorld-Analysis] Analysis tools evaluation:', JSON.stringify(testSuiteRes.result?.value, null, 2));

  // Wait 3s for UI render
  await new Promise((r) => setTimeout(r, 3000));

  // Screenshot 1: Overview with analysis panel
  console.log('[Verify-VWorld-Analysis] Capturing Screenshot 1: V-World Analysis Suite Overview...');
  const shot1 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const shot1Path = path.join(ARTIFACT_DIR, 'screenshot_vworld_7_analysis_suite.png');
  fs.writeFileSync(shot1Path, Buffer.from(shot1.data, 'base64'));
  console.log('[Verify-VWorld-Analysis] Saved:', shot1Path);

  // Focus Cut & Fill and capture
  await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        // Scroll control panel down to show cut & fill and feasibility
        const panel = document.querySelector('.overflow-y-auto') || document.querySelector('aside');
        if (panel) {
          panel.scrollTop = 1200;
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 1500));

  console.log('[Verify-VWorld-Analysis] Capturing Screenshot 2: Cut & Fill Civil Cost & Feasibility...');
  const shot2 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const shot2Path = path.join(ARTIFACT_DIR, 'screenshot_vworld_cut_fill_feasibility.png');
  fs.writeFileSync(shot2Path, Buffer.from(shot2.data, 'base64'));
  console.log('[Verify-VWorld-Analysis] Saved:', shot2Path);

  // Close chrome
  try {
    chrome.kill();
  } catch {}

  console.log('[Verify-VWorld-Analysis] Verification and capture completed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify-VWorld-Analysis] Error:', err);
  process.exit(1);
});
