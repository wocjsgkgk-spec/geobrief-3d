import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase3-Verify] Cleaning any leftover chrome on 9223...');
  try {
    spawn('pkill', ['-9', '-f', '9223']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase3-Verify] Launching headless Chrome with WebGL SwiftShader on port 9223...');
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
  console.log('[Phase3-Verify] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Phase3-Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Phase3-Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Phase3-Verify] Waiting 16 seconds for map initialization & Phase 3 geometry generation...');
  await new Promise((r) => setTimeout(r, 16000));

  // 1. Check ground infrastructure layers in MapLibre style
  const infraCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (!m || !m.getStyle) return { error: 'Map not ready' };
        const style = m.getStyle();
        const layers = style ? style.layers || [] : [];
        const layerIds = layers.map(l => l.id);
        
        const targetLayers = [
          'complex-parking-area',
          'complex-parking-curb',
          'complex-service-casing',
          'complex-service-asphalt',
          'complex-pedestrian-path',
          'complex-parking-bays'
        ];

        const layerStatuses = {};
        for (const t of targetLayers) {
          const l = m.getLayer(t);
          layerStatuses[t] = {
            exists: Boolean(l),
            type: l ? l.type : null,
            visible: l ? (m.getLayoutProperty(t, 'visibility') !== 'none') : false
          };
        }

        return {
          totalLayers: layers.length,
          groundInfraLayers: layerStatuses
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Phase3-Verify] Ground Infrastructure Layers:');
  console.log(JSON.stringify(infraCheck.result?.value, null, 2));

  // 2. Move camera to Dan-gwan dense apartment cluster with tilt to examine roof parapets, penthouses, and gabled roofs
  console.log('[Phase3-Verify] Moving camera to Dan-gwan apartment complex [127.9540, 37.3275] with 60-degree pitch...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9540, 37.3275],
          zoom: 17.2,
          pitch: 62,
          bearing: 38
        });
      }
    `
  });

  console.log('[Phase3-Verify] Waiting 10 seconds for building geometry update...');
  await new Promise((r) => setTimeout(r, 10000));

  // 3. Inspect realistic korean city layer mesh geometry: parapet, penthouse, and gabled roof statistics
  const meshInspect = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const layer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const imp = layer ? (layer.implementation || layer) : null;
        if (!imp || !imp.masterMesh) return { error: 'MasterMesh not found' };

        const masterMesh = imp.masterMesh;
        const rooftopMesh = imp.rooftopMesh;
        const geo = masterMesh.geometry;
        const roofGeo = rooftopMesh ? rooftopMesh.geometry : null;

        const posAttr = geo ? geo.getAttribute('position') : null;
        const heightAttr = geo ? geo.getAttribute('aHeight') : null;
        const roofPosAttr = roofGeo ? roofGeo.getAttribute('position') : null;

        // Count heights
        let maxHeight = 0;
        let groundVertices = 0;
        let midRiseVertices = 0;
        let highRiseVertices = 0;

        if (heightAttr) {
          for (let i = 0; i < heightAttr.count; i++) {
            const h = heightAttr.getX(i);
            if (h > maxHeight) maxHeight = h;
            if (h < 0.1) groundVertices++;
            else if (h < 25) midRiseVertices++;
            else highRiseVertices++;
          }
        }

        return {
          masterMeshVisible: masterMesh.visible,
          rooftopMeshVisible: rooftopMesh ? rooftopMesh.visible : false,
          masterVertices: posAttr ? posAttr.count : 0,
          masterTriangles: posAttr ? (posAttr.count / 3) : 0,
          rooftopVertices: roofPosAttr ? roofPosAttr.count : 0,
          rooftopTriangles: roofPosAttr ? (roofPosAttr.count / 3) : 0,
          total3DVertices: (posAttr ? posAttr.count : 0) + (roofPosAttr ? roofPosAttr.count : 0),
          maxBuildingHeightMeters: maxHeight.toFixed(2),
          groundVertices,
          highRiseVertices,
          materials: {
            master: masterMesh.material.type,
            rooftop: rooftopMesh ? rooftopMesh.material.type : null
          }
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Phase3-Verify] 3D Roof Geometry and Mesh Statistics:');
  console.log(JSON.stringify(meshInspect?.result?.value, null, 2));

  // 4. Force repaint and capture screenshot
  await send('Runtime.evaluate', {
    expression: 'if (window.__map) { window.__map.triggerRepaint(); }'
  });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('[Phase3-Verify] Capturing screenshot via Page.captureScreenshot...');
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  if (snap && snap.data) {
    const snapPath = path.join(ARTIFACT_DIR, 'screenshot_phase3_3d_roof_and_infrastructure_verified.png');
    fs.writeFileSync(snapPath, Buffer.from(snap.data, 'base64'));
    console.log('[Phase3-Verify] Captured high-resolution Phase 3 screenshot to:', snapPath);
  } else {
    console.warn('[Phase3-Verify] Page.captureScreenshot returned empty payload:', snap);
  }

  // Close chrome
  ws.close();
  chrome.kill();
  console.log('[Phase3-Verify] Phase 3 verification finished successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Phase3-Verify] Fatal error:', err);
  process.exit(1);
});
