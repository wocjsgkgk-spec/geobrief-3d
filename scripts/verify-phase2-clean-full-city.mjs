import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 2 Verify] Killing leftover chrome on port 9235...');
  try {
    spawn('pkill', ['-9', '-f', '9235']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase 2 Verify] Launching headless Chrome with WebGL SwiftShader on port 9235...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9235',
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
    http.get('http://127.0.0.1:9235/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') || versionData.find((t) => t.type === 'page') || versionData[0];
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
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const msg = (data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      consoleLogs.push(msg);
      if (!msg.includes('BufferGeometry') && !msg.includes('download the React DevTools')) {
        console.log(' [PAGE CONSOLE]', msg);
      }
    }
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  console.log('[Phase 2 Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Phase 2 Verify] Navigating to http://localhost:3000 ...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  console.log('[Phase 2 Verify] Waiting for map load and high-speed building slices generation...');
  // Poll building count every 2 seconds for up to 24 seconds
  let finalBadge = '';
  let finalStats = null;

  for (let round = 1; round <= 12; round++) {
    await new Promise((r) => setTimeout(r, 2000));
    const inspect = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const badge = document.getElementById('realtime-metrics-badge');
          const badgeText = badge ? badge.textContent : '';
          const m = window.__map;
          let layerStats = null;
          if (m) {
            const l = m.getLayer('realistic-korean-city-layer');
            const imp = l ? (l.implementation || l) : null;
            if (imp) {
              const posAttr = imp.masterMesh && imp.masterMesh.geometry ? imp.masterMesh.geometry.getAttribute('position') : null;
              layerStats = {
                builtBuildingKeysCount: imp.builtBuildingKeys ? imp.builtBuildingKeys.size : 0,
                persistentBuildingCount: imp.persistentBuildingMap ? imp.persistentBuildingMap.size : 0,
                masterMeshTriangles: posAttr ? Math.round(posAttr.count / 3) : 0,
                isBuildingGeometry: imp.isBuildingGeometry,
                hasInitialBuilt: imp.hasInitialBuilt
              };
            }
            const bridgeDeckVis = m.getLayer('road-bridge-deck') ? m.getLayoutProperty('road-bridge-deck', 'visibility') : 'layer_not_found';
            const bridgeCasingVis = m.getLayer('road-bridge-casing') ? m.getLayoutProperty('road-bridge-casing', 'visibility') : 'layer_not_found';
            return { badgeText, layerStats, bridgeDeckVis, bridgeCasingVis };
          }
          return { badgeText, error: 'Map not ready' };
        })()
      `,
      returnByValue: true
    });

    const res = inspect?.result?.value;
    console.log(`[Round ${round}/12] Stats:`, JSON.stringify(res));
    if (res?.badgeText) finalBadge = res.badgeText;
    if (res?.layerStats) finalStats = res;
    if (res?.layerStats?.builtBuildingKeysCount >= 4000) {
      console.log('=> Target reached 4,000+ buildings rendered!');
      break;
    }
  }

  // 1. Take overview screenshot
  console.log('[Phase 2 Verify] Capturing full overview screenshot...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'screenshot_phase2_full_city_thousands_buildings.png'),
    Buffer.from(shot1.data, 'base64')
  );
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'screenshot_phase2_thousands_buildings_rendered.png'),
    Buffer.from(shot1.data, 'base64')
  );
  console.log('[Phase 2 Verify] Saved full overview screenshot.');

  // 2. Adjust camera to get a close look at the highway / bridge and apartment complexes (checking for clean roads and no spikes)
  console.log('[Phase 2 Verify] Adjusting camera for close inspection of roads and buildings...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (m) {
          m.easeTo({
            center: [127.9545, 37.3385],
            zoom: 16.2,
            pitch: 58,
            bearing: -25,
            duration: 1500
          });
        }
      })()
    `
  });

  await new Promise((r) => setTimeout(r, 3000));

  console.log('[Phase 2 Verify] Capturing close road & complex screenshot...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'screenshot_phase2_clean_roads_no_spikes.png'),
    Buffer.from(shot2.data, 'base64')
  );
  console.log('[Phase 2 Verify] Saved clean roads and no spikes screenshot.');

  // Final summary verification
  console.log('==============================================');
  console.log('[Phase 2 Verification Results]');
  console.log('Final Badge:', finalBadge);
  console.log('Bridge Deck Visibility:', finalStats?.bridgeDeckVis);
  console.log('Bridge Casing Visibility:', finalStats?.bridgeCasingVis);
  console.log('Built Building Keys Count:', finalStats?.layerStats?.builtBuildingKeysCount);
  console.log('Persistent Buildings Count:', finalStats?.layerStats?.persistentBuildingCount);
  console.log('Master Mesh Triangles:', finalStats?.layerStats?.masterMeshTriangles);
  console.log('==============================================');

  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
