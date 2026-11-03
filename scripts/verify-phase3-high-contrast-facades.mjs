import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 3 Verify] Killing leftover chrome on port 9240...');
  try {
    spawn('pkill', ['-9', '-f', '9240']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase 3 Verify] Launching headless Chrome with WebGL SwiftShader on port 9240...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9240',
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
    http.get('http://127.0.0.1:9240/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') || versionData.find((t) => t.type === 'page') || versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Phase 3 Verify] Connecting to CDP WebSocket:', wsUrl);

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
  console.log('[Phase 3 Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Phase 3 Verify] Navigating to http://localhost:3000 ...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  console.log('[Phase 3 Verify] Waiting for map load & high-contrast 3D buildings generation...');
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
              const roofPosAttr = imp.rooftopMesh && imp.rooftopMesh.geometry ? imp.rooftopMesh.geometry.getAttribute('position') : null;
              layerStats = {
                builtBuildingKeysCount: imp.builtBuildingKeys ? imp.builtBuildingKeys.size : 0,
                persistentBuildingCount: imp.persistentBuildingMap ? imp.persistentBuildingMap.size : 0,
                masterMeshTriangles: posAttr ? Math.round(posAttr.count / 3) : 0,
                rooftopTriangles: roofPosAttr ? Math.round(roofPosAttr.count / 3) : 0,
                materialCount: imp.buildingMaterials ? imp.buildingMaterials.length : 0,
                hasRooftopMesh: Boolean(imp.rooftopMesh),
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
    if (res?.layerStats?.builtBuildingKeysCount >= 2000) {
      console.log('=> Reached 2000+ buildings rendered!');
      break;
    }
  }

  // View 1: Overview of city with high-contrast facades
  console.log('[Phase 3 Verify] Capturing full city overview with high-contrast facades...');
  const shotOverview = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'screenshot_phase3_high_contrast_overview.png'),
    Buffer.from(shotOverview.data, 'base64')
  );

  // View 2: Close-up of Apartment Complex (Balcony cross frames, white sash, two-tone base)
  console.log('[Phase 3 Verify] Moving camera to Apartment Complex for close inspection...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (m) {
          m.easeTo({
            center: [127.9545, 37.3385],
            zoom: 16.6,
            pitch: 58,
            bearing: -20,
            duration: 1200
          });
        }
      })()
    `
  });
  await new Promise((r) => setTimeout(r, 2500));
  const shotApt = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'screenshot_phase3_high_contrast_apartment_facades.png'),
    Buffer.from(shotApt.data, 'base64')
  );

  // View 3: Close-up of Commercial District (Signboard bands, shopfront glass, parapet rooftops)
  console.log('[Phase 3 Verify] Moving camera to Commercial / Downtown area...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (m) {
          m.easeTo({
            center: [127.9480, 37.3450],
            zoom: 16.8,
            pitch: 52,
            bearing: 45,
            duration: 1200
          });
        }
      })()
    `
  });
  await new Promise((r) => setTimeout(r, 2500));
  const shotComm = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'screenshot_phase3_commercial_signboards_and_podium.png'),
    Buffer.from(shotComm.data, 'base64')
  );

  // View 4: Innovation City & Public Offices (Glass curtain wall & rooftop green)
  console.log('[Phase 3 Verify] Moving camera to Innovation City Public Buildings...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (m) {
          m.easeTo({
            center: [127.9780, 37.3270],
            zoom: 16.3,
            pitch: 56,
            bearing: -40,
            duration: 1200
          });
        }
      })()
    `
  });
  await new Promise((r) => setTimeout(r, 2500));
  const shotPublic = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'screenshot_phase3_bangok_innovation_curtain_wall.png'),
    Buffer.from(shotPublic.data, 'base64')
  );

  console.log('==============================================');
  console.log('[Phase 3 Verification Results]');
  console.log('Final Badge:', finalBadge);
  console.log('Materials Count:', finalStats?.layerStats?.materialCount);
  console.log('Master Mesh Triangles:', finalStats?.layerStats?.masterMeshTriangles);
  console.log('Rooftop Triangles:', finalStats?.layerStats?.rooftopTriangles);
  console.log('Bridge Deck Visibility:', finalStats?.bridgeDeckVis);
  console.log('Bridge Casing Visibility:', finalStats?.bridgeCasingVis);
  console.log('==============================================');

  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
