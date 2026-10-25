import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Skyline-Verify] Cleaning any leftover chrome on 9223...');
  try {
    spawn('pkill', ['-9', '-f', '9223']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Skyline-Verify] Launching headless Chrome on port 9223...');
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
    '--window-size=1280,800',
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
  console.log('[Skyline-Verify] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Skyline-Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Skyline-Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Skyline-Verify] Waiting 14 seconds for initial load...');
  await new Promise((r) => setTimeout(r, 14000));

  // 1. Move camera to Dan-gu / Dan-gwan dense apartment cluster
  console.log('[Skyline-Verify] Jumping camera to Dan-gu apartment area [127.9540, 37.3275] pitch 60...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9540, 37.3275],
          zoom: 16.5,
          pitch: 60,
          bearing: 38
        });
      }
    `
  });

  console.log('[Skyline-Verify] Waiting 8 seconds for 3D skyline generation...');
  await new Promise((r) => setTimeout(r, 8000));

  // 2. Inspect building heights and apartment classifications
  const inspectData = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const layer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const imp = layer ? (layer.implementation || layer) : null;
        if (!imp || !imp.masterMesh) return { error: 'MasterMesh not found' };

        const geo = imp.masterMesh.geometry;
        const posAttr = geo ? geo.getAttribute('position') : null;
        const heightAttr = geo ? geo.getAttribute('aHeight') : null;

        let totalVertices = posAttr ? posAttr.count : 0;
        let maxHeight = 0;
        let minHeightAboveGround = 999;
        let groundVertices = 0;
        let apartmentHighRiseVertices = 0; // >= 45m
        let midRiseVertices = 0;           // 14m ~ 44m
        let lowRiseVertices = 0;           // 8m ~ 13m
        let flatPlateVertices = 0;         // 0.5m ~ 4m (the bug!)

        if (heightAttr) {
          const count = heightAttr.count;
          const stride = Math.max(1, Math.floor(count / 20000));
          for (let i = 0; i < count; i += stride) {
            const h = heightAttr.getX(i);
            if (h > maxHeight) maxHeight = h;
            if (h < 0.1) {
              groundVertices++;
            } else {
              if (h < minHeightAboveGround) minHeightAboveGround = h;
              if (h <= 4.0) {
                flatPlateVertices++;
              } else if (h <= 13.5) {
                lowRiseVertices++;
              } else if (h < 45.0) {
                midRiseVertices++;
              } else {
                apartmentHighRiseVertices++;
              }
            }
          }
        }

        // Check if any GPU fill-extrusion layers are erroneously visible
        const gpuLayers = [
          'bldg-tier2-mainwall',
          'bldg-tier1-podium',
          'bldg-tier4-roofslab',
          '3d-buildings',
          'flight-envelope-volume',
          'flight-ceiling-slab'
        ];
        const gpuVisibility = {};
        for (const g of gpuLayers) {
          const gl = m.getLayer(g);
          gpuVisibility[g] = gl ? m.getLayoutProperty(g, 'visibility') : 'not_found';
        }

        return {
          masterMeshVisible: imp.masterMesh.visible,
          rooftopMeshVisible: Boolean(imp.rooftopMesh && imp.rooftopMesh.visible),
          total3DVertices: totalVertices,
          maxBuildingHeightMeters: maxHeight.toFixed(1),
          minBuildingHeightMeters: minHeightAboveGround < 900 ? minHeightAboveGround.toFixed(1) : 0,
          sampledCounts: {
            groundVertices,
            flatPlateVertices_under_4m: flatPlateVertices,
            lowRise_8_to_13m: lowRiseVertices,
            midRise_14_to_44m: midRiseVertices,
            apartmentHighRise_48_to_75m: apartmentHighRiseVertices
          },
          gpuFillExtrusionVisibility: gpuVisibility
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Skyline-Verify] Inspection Result:');
  console.log(JSON.stringify(inspectData?.result?.value || inspectData, null, 2));

  // 3. Trigger repaint & capture high-resolution screenshot
  await send('Runtime.evaluate', {
    expression: 'if (window.__map) { window.__map.triggerRepaint(); }'
  });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('[Skyline-Verify] Capturing screenshot via Page.captureScreenshot...');
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  if (snap && snap.data) {
    const snapPath = path.join(ARTIFACT_DIR, 'screenshot_full_skyline_restored.png');
    fs.writeFileSync(snapPath, Buffer.from(snap.data, 'base64'));
    console.log('[Skyline-Verify] Saved screenshot to:', snapPath);
  }

  // Close chrome
  ws.close();
  chrome.kill();
  console.log('[Skyline-Verify] Finished successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Skyline-Verify] Fatal error:', err);
  process.exit(1);
});
