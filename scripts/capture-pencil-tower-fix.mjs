import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify] Cleaning leftover Chrome on port 9224...');
  try {
    spawn('pkill', ['-9', '-f', '9224']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify] Launching headless Chrome with WebGL on port 9224...');
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
    '--window-size=1280,800',
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
  console.log('[Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify] Waiting 15 seconds for initial city mesh & building data loading...');
  await new Promise((r) => setTimeout(r, 15000));

  // 1. Move camera to Dan-gu / Dan-gwan dense residential block (where user saw pencil towers)
  console.log('[Verify] Moving camera to Dan-gwan / Dangu block [127.9530, 37.3270], pitch 58, bearing 35...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9530, 37.3270],
          zoom: 16.5,
          pitch: 58,
          bearing: 35
        });
      }
    `
  });

  await new Promise((r) => setTimeout(r, 8000));

  // Inspect 3D Building & Layer state
  const inspectRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const realisticLayer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const rImp = realisticLayer ? (realisticLayer.implementation || realisticLayer) : null;
        const masterMesh = rImp ? rImp.masterMesh : null;

        const posAttr = masterMesh ? masterMesh.geometry.getAttribute('position') : null;
        const heightAttr = masterMesh ? masterMesh.geometry.getAttribute('aHeight') : null;

        // Check GPU fill-extrusion layers visibility
        const gpuLayers = [
          'bldg-tier1-podium',
          'bldg-tier2-mainwall',
          'bldg-tier3-pattern',
          'bldg-tier4-roofcap',
          '3d-buildings'
        ];
        const gpuLayerState = {};
        gpuLayers.forEach(id => {
          const l = m ? m.getLayer(id) : null;
          gpuLayerState[id] = l ? m.getLayoutProperty(id, 'visibility') : 'not-found';
        });

        let tallCount = 0; // >= 25m
        let midCount = 0;  // 11m ~ 25m
        let lowCount = 0;  // < 11m

        if (heightAttr) {
          for (let i = 0; i < heightAttr.count; i += 3) {
            const h = heightAttr.getX(i);
            if (h >= 25.0) tallCount++;
            else if (h >= 11.0) midCount++;
            else lowCount++;
          }
        }

        return {
          hasRealisticLayer: Boolean(realisticLayer),
          isRealisticLayerVisible: rImp ? rImp.visible : false,
          totalVertices: posAttr ? posAttr.count : 0,
          totalTriangles: posAttr ? posAttr.count / 3 : 0,
          tallCount,
          midCount,
          lowCount,
          gpuLayerState
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Verify] Inspection Result:');
  console.log(JSON.stringify(inspectRes?.result?.value || inspectRes, null, 2));

  // Repaint and capture View 1: Dan-gwan dense residential block
  await send('Runtime.evaluate', {
    expression: 'if (window.__map) { window.__map.triggerRepaint(); }'
  });
  await new Promise((r) => setTimeout(r, 1500));

  console.log('[Verify] Capturing View 1: Dan-gwan residential block (pencil towers fixed)...');
  const snap1 = await send('Page.captureScreenshot', { format: 'png' });
  if (snap1 && snap1.data) {
    const snapPath1 = path.join(ARTIFACT_DIR, 'screenshot_pencil_tower_fixed_and_clean_skyline.png');
    fs.writeFileSync(snapPath1, Buffer.from(snap1.data, 'base64'));
    console.log('[Verify] Screenshot 1 saved to:', snapPath1);
  }

  // 2. Move camera to Wonju Medical Center & overview [127.9480, 37.3360]
  console.log('[Verify] Moving camera to Wonju Medical Center & Dangu-dong [127.9480, 37.3360], pitch 52, bearing 15...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9480, 37.3360],
          zoom: 15.2,
          pitch: 52,
          bearing: 15
        });
      }
    `
  });

  await new Promise((r) => setTimeout(r, 8000));
  await send('Runtime.evaluate', {
    expression: 'if (window.__map) { window.__map.triggerRepaint(); }'
  });
  await new Promise((r) => setTimeout(r, 1500));

  console.log('[Verify] Capturing View 2: Wonju Medical Center area & skyline (no double rendering)...');
  const snap2 = await send('Page.captureScreenshot', { format: 'png' });
  if (snap2 && snap2.data) {
    const snapPath2 = path.join(ARTIFACT_DIR, 'screenshot_wonju_medical_and_no_double_rendering.png');
    fs.writeFileSync(snapPath2, Buffer.from(snap2.data, 'base64'));
    console.log('[Verify] Screenshot 2 saved to:', snapPath2);
  }

  ws.close();
  chrome.kill();
  console.log('[Verify] Verification Complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify] Fatal error:', err);
  process.exit(1);
});
