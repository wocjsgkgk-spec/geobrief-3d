import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify] Killing any existing 9223 processes...');
  try {
    spawn('pkill', ['-9', '-f', '9223']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify] Launching headless Chrome with WebGL SwiftShader on port 9223...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1680,1050',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') || versionData.find((t) => t.type === 'page') || versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Verify] Connecting to CDP WebSocket for page target:', wsUrl);

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

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const msg = (data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (!msg.includes('BufferGeometry') && !msg.includes('download the React DevTools')) {
        console.log(' [PAGE CONSOLE]', msg.slice(0, 150));
      }
    }
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  console.log('[Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify] Waiting 15 seconds for map, layers, and real buildings to synchronize...');
  await new Promise((r) => setTimeout(r, 15000));

  // Inspect data bindings
  const evalRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const injected = window.__lastInjectedBuildings || [];
        const storeCount = window.__realDataSpatialStore ? window.__realDataSpatialStore.getRecordCount() : 0;
        
        const realMeasured = injected.filter(f => f.properties && f.properties.is_real_measured);
        const sampleBuildings = (realMeasured.length > 0 ? realMeasured : injected).slice(0, 10).map(f => ({
          name: f.properties.name || f.properties.bldNm,
          dongNm: f.properties.dongNm,
          grndFlrCnt: f.properties.grndFlrCnt,
          height: f.properties.height,
          expectedHeight3_3m: f.properties.grndFlrCnt ? (f.properties.grndFlrCnt * 3.3).toFixed(1) : null,
          atlasWallSlot: f.properties.atlasWallSlot,
          atlasRoofSlot: f.properties.atlasRoofSlot,
          mainPurpsCdNm: f.properties.mainPurpsCdNm,
          strctCdNm: f.properties.strctCdNm,
          is_real_measured: f.properties.is_real_measured,
          source: f.properties.source
        }));

        const poiSource = m ? m.getSource('vworld-pois') : null;
        const poiFeatures = poiSource && poiSource._data ? (poiSource._data.features || []) : [];
        const samplePois = poiFeatures.slice(0, 10).map(f => ({
          name: f.properties.name,
          category: f.properties.category,
          height: f.properties.height,
          elevationOffset: f.properties.elevationOffset
        }));

        const realSource = m ? m.getSource('real-buildings-source') : null;
        const fusionSource = m ? m.getSource('fusion-buildings-source') : null;

        return {
          mapLoaded: m ? m.loaded() : false,
          totalInjected: injected.length,
          realMeasuredCount: realMeasured.length,
          storeRecordCount: storeCount,
          hasRealSource: Boolean(realSource),
          hasFusionSource: Boolean(fusionSource),
          sampleBuildings,
          poiCount: poiFeatures.length,
          samplePois
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Verify] Real Data Binding Evaluation:');
  console.log(JSON.stringify(evalRes.result?.value, null, 2));

  // Move camera to Dan-gwan / Dangu-dong apartment area (Dan-gwan Cheongsol Apt, Hyundae Apt, etc.)
  console.log('[Verify] Jumping camera to Dan-gwan / Dangu-dong dense apartment complex [127.9535, 37.3270]...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9535, 37.3270],
          zoom: 16.8,
          pitch: 58,
          bearing: 35
        });
      }
    `
  });

  console.log('[Verify] Waiting 6 seconds for high-density 3D geometry and labels to render...');
  await new Promise((r) => setTimeout(r, 6000));

  const postJumpRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const injected = window.__lastInjectedBuildings || [];
        const realMeasured = injected.filter(f => f.properties && f.properties.is_real_measured);
        return {
          totalInjected: injected.length,
          realMeasuredCount: realMeasured.length,
          danGwanApts: injected
            .filter(f => f.properties && ((f.properties.bldNm || '').includes('청솔') || (f.properties.name || '').includes('청솔') || (f.properties.name || '').includes('아파트') || (f.properties.name || '').includes('빌라') || (f.properties.name || '').includes('주택')))
            .slice(0, 8)
            .map(f => ({
              name: f.properties.name || f.properties.bldNm,
              grndFlrCnt: f.properties.grndFlrCnt,
              height: f.properties.height,
              atlasWallSlot: f.properties.atlasWallSlot,
              atlasRoofSlot: f.properties.atlasRoofSlot,
              is_real_measured: f.properties.is_real_measured
            }))
        };
      })()
    `,
    returnByValue: true
  });
  console.log('[Verify] Post-Jump Evaluation (Dan-gwan / Dangu area):', JSON.stringify(postJumpRes.result?.value, null, 2));

  // Capture screenshot of real data injected 3D map
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  const snapPath = path.join(ARTIFACT_DIR, 'screenshot_real_data_injection_verified.png');
  fs.writeFileSync(snapPath, Buffer.from(snap.data, 'base64'));
  console.log('[Verify] Saved real data injection screenshot to:', snapPath);

  // Close chrome
  ws.close();
  chrome.kill();
  console.log('[Verify] Complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify] Error:', err);
  process.exit(1);
});
