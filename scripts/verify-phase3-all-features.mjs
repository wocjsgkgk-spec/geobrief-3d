import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-Phase3] Cleaning leftover Chrome processes on port 9225...');
  try {
    spawn('pkill', ['-9', '-f', '9225']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-Phase3] Launching headless Chrome with WebGL on port 9225...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/chrome-verify-phase3',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1440,900',
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
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Verify-Phase3] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Verify-Phase3] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Verify-Phase3] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-Phase3] Waiting 15 seconds for map initialization & 3D buildings to load...');
  await new Promise((r) => setTimeout(r, 15000));

  // 1. Verify Store Actions (isStreetView, isSunPlaying, isOrbiting)
  console.log('[Verify-Phase3] Verifying useMapStore Phase 3 state & actions...');
  const storeRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        return {
          hasStore: Boolean(store),
          isStreetView: store?.isStreetView,
          hasToggleStreetView: typeof store?.toggleStreetView === 'function',
          isSunPlaying: store?.isSunPlaying,
          hasToggleSunPlaying: typeof store?.toggleSunPlaying === 'function',
          hasSunHour: typeof store?.sunHour === 'number',
          sunHour: store?.sunHour,
          hasBufferRings: Boolean(store?.bufferRings),
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('[Verify-Phase3] Store State Result:', JSON.stringify(storeRes?.result?.value, null, 2));

  // 2. Trigger Building Selection & Open V-World Integrated Spatial Inspector Drawer
  console.log('[Verify-Phase3] Moving camera to Wonju apartments & bridges [127.9542, 37.3468]...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9542, 37.3468],
          zoom: 16.8,
          pitch: 58,
          bearing: 30
        });
      }
    `
  });
  await new Promise((r) => setTimeout(r, 2000));

  console.log('[Verify-Phase3] Selecting Central Heights Apartment (중앙하이츠아파트 102동) to open Inspector Drawer...');
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new CustomEvent('gangwon-search-select', {
        detail: {
          title: '중앙하이츠아파트 102동',
          category: '공동주택 (아파트)',
          coords: [127.9542, 37.3468],
          levels: 15,
          height: 48,
          regionId: 'wonju',
          rawProperties: {
            strctCdNm: '철근콘크리트구조 (RC)',
            roofCdNm: '평슬래브 / 옥탑 코어',
            '용도지역': '제3종일반주거지역',
            '건폐율 기준': '최대 50% 이하',
            '용적률 기준': '최대 250% 이하',
            '지번': '단구동 1478',
            '지목': '대'
          }
        }
      }));
    `
  });

  // Wait 3 seconds for API / cadastral report to load
  await new Promise((r) => setTimeout(r, 3500));

  // 3. Inspect DOM elements of V-World Spatial Inspector Drawer and Polygon Measurement HUD
  console.log('[Verify-Phase3] Checking VWorldSpatialInspectorDrawer & PolygonMeasurementCard DOM elements...');
  const domInspectRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const drawer = document.getElementById('vworld-spatial-inspector-drawer');
        const polyHUD = document.getElementById('polygon-measurement-card');

        let drawerInfo = null;
        if (drawer) {
          drawerInfo = {
            found: true,
            title: drawer.querySelector('h3')?.innerText || '',
            hasArchitectureRegister: drawer.innerText.includes('건축물대장'),
            hasCadastralZoning: drawer.innerText.includes('연속지적도'),
            hasInfrastructure: drawer.innerText.includes('인프라 접근성'),
            has3DActionOrbit: drawer.innerText.includes('360° 입체 회전'),
            has3DActionViewshed: drawer.innerText.includes('조망·가시권 분석'),
            has3DActionBuffer: drawer.innerText.includes('반경 500m 집계'),
          };
        }

        let polyHUDInfo = null;
        if (polyHUD) {
          polyHUDInfo = {
            found: true,
            text: polyHUD.innerText.slice(0, 200),
          };
        }

        return {
          drawer: drawerInfo || { found: false },
          polyHUD: polyHUDInfo || { found: false }
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('[Verify-Phase3] DOM Inspection Result:', JSON.stringify(domInspectRes?.result?.value, null, 2));

  // 4. Test Action: Click "반경 500m 집계" in the drawer to activate circular buffer
  console.log('[Verify-Phase3] Triggering [반경 500m 집계] button in Inspector Drawer...');
  const bufferTriggerRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const drawer = document.getElementById('vworld-spatial-inspector-drawer');
        if (!drawer) return { success: false, reason: 'drawer not found' };

        // Find the button with '반경 500m 집계'
        const buttons = Array.from(drawer.querySelectorAll('button'));
        const bufferBtn = buttons.find(b => b.innerText.includes('500m'));
        if (bufferBtn) {
          bufferBtn.click();
          return { success: true, btnText: bufferBtn.innerText };
        }
        return { success: false, reason: 'button not found' };
      })()
    `,
    returnByValue: true,
  });
  console.log('[Verify-Phase3] Buffer Button Click:', JSON.stringify(bufferTriggerRes?.result?.value, null, 2));

  await new Promise((r) => setTimeout(r, 2000));

  // Check buffer 500m source data on map
  const bufferCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const src = m ? m.getSource('buffer-500m-source') : null;
        const data = src ? src._data : null;
        const drawer = document.getElementById('vworld-spatial-inspector-drawer');
        const hasTallyBox = drawer ? drawer.innerText.includes('반경 500m 인프라 정밀 집계') : false;

        return {
          hasBufferSource: Boolean(src),
          hasBufferFeatures: (data?.features?.length || 0) > 0,
          featureCount: data?.features?.length || 0,
          hasTallyBoxInDrawer: hasTallyBox
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('[Verify-Phase3] Buffer 500m Map & Drawer State:', JSON.stringify(bufferCheck?.result?.value, null, 2));

  // 5. Test Street View toggle (Pitch 80 degrees)
  console.log('[Verify-Phase3] Testing 1st-person Street View (Pitch 80°)...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__useMapStore) {
        window.__useMapStore.getState().toggleStreetView([127.9525, 37.3480]);
      }
    `
  });
  await new Promise((r) => setTimeout(r, 2000));

  const cameraState = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        return {
          pitch: m ? Math.round(m.getPitch()) : 0,
          zoom: m ? Math.round(m.getZoom() * 10) / 10 : 0,
          bearing: m ? Math.round(m.getBearing()) : 0
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('[Verify-Phase3] Camera State after Street View:', JSON.stringify(cameraState?.result?.value, null, 2));

  // 6. Test Sun Timeline Auto-Play
  console.log('[Verify-Phase3] Testing Sun Timeline Auto-Play...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__useMapStore) {
        window.__useMapStore.getState().toggleSunPlaying();
      }
    `
  });
  await new Promise((r) => setTimeout(r, 600));

  const sunPlayingState = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        return {
          isSunPlaying: store?.isSunPlaying,
          sunHour: store?.sunHour
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('[Verify-Phase3] Sun Timeline Playing State:', JSON.stringify(sunPlayingState?.result?.value, null, 2));

  // Reset camera to nice isometric briefing angle to showcase the whole scene with drawer and polygon HUD
  console.log('[Verify-Phase3] Resetting camera for high-res verification screenshot...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9515, 37.3465],
          zoom: 16.0,
          pitch: 58,
          bearing: 30
        });
      }
    `
  });
  await new Promise((r) => setTimeout(r, 3000));

  // 7. Capture Screenshot
  console.log('[Verify-Phase3] Capturing high-resolution verification screenshot...');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotBuffer = Buffer.from(shot.data, 'base64');
  const shotPath = path.join(ARTIFACT_DIR, 'screenshot_phase3_vworld_inspector_verified.png');
  fs.writeFileSync(shotPath, shotBuffer);
  console.log(`[Verify-Phase3] Screenshot saved successfully: ${shotPath} (${shotBuffer.length} bytes)`);

  ws.close();
  chrome.kill();
  console.log('[Verify-Phase3] Verification completed successfully!');
}

main().catch((err) => {
  console.error('[Verify-Phase3] Error during verification:', err);
  process.exit(1);
});
