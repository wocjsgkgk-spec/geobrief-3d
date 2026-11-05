import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 2 Hybrid Engine Verify] Killing any leftover chrome on port 9247...');
  try {
    spawn('pkill', ['-9', '-f', '9247']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase 2 Hybrid Engine Verify] Launching headless Chrome with WebGL on port 9247...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9247',
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
    http.get('http://127.0.0.1:9247/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget =
    versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') ||
    versionData.find((t) => t.type === 'page') ||
    versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();
  const consoleMessages = [];

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const { resolve, reject } = callbacks.get(data.id);
      callbacks.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map((a) => a.value || a.description || '').join(' ');
      consoleMessages.push(text);
      if (
        text.includes('ACTIVE_RENDERER_MOUNTED') ||
        text.includes('SmartCityComplex3DLayer') ||
        text.includes('MilitarySiteVisualizer') ||
        text.includes('RealisticKoreanCityLayer') ||
        text.includes('vworldLocalLoader') ||
        text.includes('VWORLD')
      ) {
        console.log(`[Browser Console] ${text}`);
      }
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[Phase 2 Hybrid Engine Verify] Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise((r) => setTimeout(r, 6000));

  // 1. Check if MapViewer is mounted and query state
  console.log('[Phase 2 Hybrid Engine Verify] Checking map state and V-World data...');
  const mapState = await send('Runtime.evaluate', {
    expression: `(() => {
      const store = window.__GEOBRIEF_MAP_STORE__ || (window.useMapStore && window.useMapStore.getState ? window.useMapStore.getState() : null);
      const badges = document.querySelectorAll('.military-hologram-badge-container');
      const badgeTexts = Array.from(badges).map(b => b.textContent.trim().replace(/\\s+/g, ' '));
      return {
        hasStore: !!store,
        layers: store ? store.layers : null,
        selectedIdleSiteId: store ? store.selectedIdleSiteId : null,
        badgeCount: badges.length,
        badgeTexts: badgeTexts.slice(0, 5),
      };
    })()`,
    returnByValue: true,
  });
  console.log('Map Store and Badge Info:', JSON.stringify(mapState.result.value, null, 2));

  // 2. Set camera to 원주 1군지사 (wj-1st-logistics) in current_military mode
  console.log('[Phase 2 Hybrid Engine Verify] Positioning camera to 1st Logistics Command (wj-1st-logistics) in current_military mode...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__MAPLIBRE_INSTANCE__ || window.__MAP__;
      const store = window.__GEOBRIEF_MAP_STORE__ || (window.useMapStore && window.useMapStore.getState ? window.useMapStore.getState() : null);
      if (store) {
        store.selectIdleSite('first-logistics-wonju');
        if (store.layers && store.layers.firstLogisticsSmartCity) {
          store.toggleLayer('firstLogisticsSmartCity');
        }
      }
      if (map) {
        map.jumpTo({
          center: [127.9358, 37.3592],
          zoom: 16.5,
          pitch: 58,
          bearing: -25
        });
      }
      return true;
    })()`,
  });

  await new Promise((r) => setTimeout(r, 4000));

  // Verify military barracks 3D layer and capture screenshot
  const militaryInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const badges = document.querySelectorAll('.military-hologram-badge-container');
      const activeBadge = document.querySelector('.military-hologram-badge-container.active-badge');
      const text = activeBadge ? activeBadge.textContent.replace(/\\s+/g, ' ') : '';
      return {
        badgeCount: badges.length,
        activeBadgeText: text,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Military Mode Badge Info:', JSON.stringify(militaryInfo.result.value, null, 2));

  console.log('[Phase 2 Hybrid Engine Verify] Capturing screenshot: screenshot_phase2_military_current.png...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const p1 = path.join(ARTIFACT_DIR, 'screenshot_phase2_military_current.png');
  fs.writeFileSync(p1, Buffer.from(shot1.data, 'base64'));
  console.log(`Saved: ${p1}`);

  // 3. Switch to future_masterplan mode by toggling firstLogisticsSmartCity
  console.log('[Phase 2 Hybrid Engine Verify] Toggling to future_masterplan mode...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const store = window.__GEOBRIEF_MAP_STORE__ || (window.useMapStore && window.useMapStore.getState ? window.useMapStore.getState() : null);
      if (store) {
        if (!store.layers.firstLogisticsSmartCity) {
          store.toggleLayer('firstLogisticsSmartCity');
        }
      }
      const toggleBtn = document.querySelector('#btn-toggle-first-logistics-wonju') || document.querySelector('#btn-toggle-wj-1st-logistics');
      if (toggleBtn) {
        toggleBtn.click();
      }
      return true;
    })()`,
  });

  await new Promise((r) => setTimeout(r, 4000));

  const futureInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeBadge = document.querySelector('.military-hologram-badge-container.active-badge');
      const text = activeBadge ? activeBadge.textContent.replace(/\\s+/g, ' ') : '';
      return {
        activeBadgeText: text,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Future Masterplan Badge Info:', JSON.stringify(futureInfo.result.value, null, 2));

  console.log('[Phase 2 Hybrid Engine Verify] Capturing screenshot: screenshot_phase2_future_masterplan.png...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const p2 = path.join(ARTIFACT_DIR, 'screenshot_phase2_future_masterplan.png');
  fs.writeFileSync(p2, Buffer.from(shot2.data, 'base64'));
  console.log(`Saved: ${p2}`);

  // 4. Move camera to Wonju City Center / Innovation City (Ban-gok dong) to observe hybrid V-World city mesh
  console.log('[Phase 2 Hybrid Engine Verify] Moving camera to Wonju City / Innovation Center...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__MAPLIBRE_INSTANCE__ || window.__MAP__;
      if (map) {
        map.jumpTo({
          center: [127.9782, 37.3325],
          zoom: 16.2,
          pitch: 56,
          bearing: -35
        });
      }
      return true;
    })()`,
  });

  await new Promise((r) => setTimeout(r, 5000));

  // Query rendered buildings and draw calls
  const cityStats = await send('Runtime.evaluate', {
    expression: `(() => {
      const statusEl = document.querySelector('.font-mono.text-emerald-400') || document.querySelector('header');
      return {
        headerText: statusEl ? statusEl.textContent.trim().replace(/\\s+/g, ' ') : '',
      };
    })()`,
    returnByValue: true,
  });
  console.log('City Center Stats:', JSON.stringify(cityStats.result.value, null, 2));

  console.log('[Phase 2 Hybrid Engine Verify] Capturing screenshot: screenshot_phase2_hybrid_overview.png...');
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const p3 = path.join(ARTIFACT_DIR, 'screenshot_phase2_hybrid_overview.png');
  fs.writeFileSync(p3, Buffer.from(shot3.data, 'base64'));
  console.log(`Saved: ${p3}`);

  // Close chrome
  chrome.kill();
  console.log('[Phase 2 Hybrid Engine Verify] Verification completed successfully!');
}

main().catch((err) => {
  console.error('[Phase 2 Hybrid Engine Verify] Error:', err);
  process.exit(1);
});
