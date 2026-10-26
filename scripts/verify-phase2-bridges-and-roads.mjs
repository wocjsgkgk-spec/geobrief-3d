import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-Bridge-Road] Cleaning leftover Chrome processes on port 9224...');
  try {
    spawn('pkill', ['-9', '-f', '9224']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-Bridge-Road] Launching headless Chrome with WebGL on port 9224...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--user-data-dir=/tmp/chrome-verify-roads',
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
  console.log('[Verify-Bridge-Road] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Verify-Bridge-Road] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Verify-Bridge-Road] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-Bridge-Road] Waiting 16 seconds for map initialization & authentic city mesh generation...');
  await new Promise((r) => setTimeout(r, 16000));

  // 1. Move camera to Wonju Stream bridges (원주교, 치악교, 개운교)
  console.log('[Verify-Bridge-Road] Moving camera to Wonju Stream bridges [127.9525, 37.3480] with 60-degree pitch...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__useMapStore) {
        window.__useMapStore.setState(s => ({
          layers: { ...s.layers, roads: true, buildings3D: true }
        }));
      }
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9525, 37.3480],
          zoom: 16.2,
          pitch: 60,
          bearing: 35
        });
      }
    `
  });

  console.log('[Verify-Bridge-Road] Waiting 8 seconds for 3D bridge geometries & road layers to stabilize...');
  await new Promise((r) => setTimeout(r, 8000));

  // 2. Inspect bridges and road infrastructure state
  const inspectRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const realisticLayer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const rImp = realisticLayer ? (realisticLayer.implementation || realisticLayer) : null;
        const bridgeGroup = rImp ? rImp.bridgeGroup : null;

        let totalBridgeChildren = 0;
        let bridgeMeshes = [];
        if (bridgeGroup) {
          totalBridgeChildren = bridgeGroup.children.length;
          bridgeGroup.traverse((obj) => {
            if (obj.isMesh) {
              bridgeMeshes.push({
                name: obj.name || obj.parent?.name || 'bridge-mesh',
                vertexCount: obj.geometry?.attributes?.position?.count || 0
              });
            }
          });
        }

        // Check Bridge Labels Source & Layer
        const hasBridgeLabelsSource = m ? Boolean(m.getSource('bridge-labels-source')) : false;
        const hasBridgeLabelsLayer = m ? Boolean(m.getLayer('bridge-labels-symbol')) : false;
        const bridgeLabelsVis = hasBridgeLabelsLayer ? m.getLayoutProperty('bridge-labels-symbol', 'visibility') : 'none';

        // Check Road & Curb & Marking Layers
        const roadLayers = [
          'road-curb-casing',
          'road-asphalt',
          'road-centerline',
          'road-lanes',
          'road-bridge-casing',
          'road-bridge-deck',
          'complex-parking-area',
          'complex-parking-curb',
          'complex-service-casing',
          'complex-service-asphalt',
          'complex-pedestrian-path',
          'korean-crosswalk-stripes',
          'korean-crosswalk-stoplines'
        ];
        const roadLayerStates = {};
        roadLayers.forEach(id => {
          const l = m ? m.getLayer(id) : null;
          let color = null;
          try {
            if (l) {
              color = l.type === 'fill' ? m.getPaintProperty(id, 'fill-color') : m.getPaintProperty(id, 'line-color');
            }
          } catch {}
          roadLayerStates[id] = {
            exists: Boolean(l),
            type: l ? l.type : 'none',
            visibility: l ? (m.getLayoutProperty(id, 'visibility') || 'visible') : 'missing',
            color
          };
        });

        // Check Water & Floodplain Layers
        const waterLayers = [
          'korean-water-fill',
          'korean-water-edge',
          'korean-waterway-line',
          'korean-riverbank-floodplain'
        ];
        const waterLayerStates = {};
        waterLayers.forEach(id => {
          const l = m ? m.getLayer(id) : null;
          let color = null;
          try {
            if (l) {
              color = l.type === 'fill' ? m.getPaintProperty(id, 'fill-color') : m.getPaintProperty(id, 'line-color');
            }
          } catch {}
          waterLayerStates[id] = {
            exists: Boolean(l),
            type: l ? l.type : 'none',
            visibility: l ? (m.getLayoutProperty(id, 'visibility') || 'visible') : 'missing',
            color
          };
        });

        return {
          hasRealisticLayer: Boolean(realisticLayer),
          bridgeGroupVisible: bridgeGroup ? bridgeGroup.visible : false,
          totalBridgeChildren,
          bridgeMeshCount: bridgeMeshes.length,
          bridgeMeshesSample: bridgeMeshes.slice(0, 10),
          hasBridgeLabelsSource,
          hasBridgeLabelsLayer,
          bridgeLabelsVis,
          roadLayerStates,
          waterLayerStates
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Verify-Bridge-Road] Inspection Result:');
  console.log(JSON.stringify(inspectRes?.result?.value || inspectRes, null, 2));

  // 3. Trigger repaint & capture screenshot
  await send('Runtime.evaluate', {
    expression: 'if (window.__map) { window.__map.triggerRepaint(); }'
  });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('[Verify-Bridge-Road] Capturing verification screenshot...');
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  if (snap && snap.data) {
    const snapPath = path.join(ARTIFACT_DIR, 'screenshot_phase2_bridges_and_roads_verified.png');
    fs.writeFileSync(snapPath, Buffer.from(snap.data, 'base64'));
    console.log('[Verify-Bridge-Road] Screenshot saved to:', snapPath);
  }

  ws.close();
  chrome.kill();
  console.log('[Verify-Bridge-Road] Verification Complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify-Bridge-Road] Fatal error:', err);
  process.exit(1);
});
