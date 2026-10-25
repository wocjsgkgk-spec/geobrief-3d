import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-Phase2] Cleaning any leftover chrome on 9223...');
  try {
    spawn('pkill', ['-9', '-f', '9223']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-Phase2] Launching headless Chrome with WebGL on port 9223...');
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
  console.log('[Verify-Phase2] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Verify-Phase2] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Verify-Phase2] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-Phase2] Waiting 16 seconds for map initialization & city mesh generation...');
  await new Promise((r) => setTimeout(r, 16000));

  // 1. Move camera to Dan-gu / Dan-gwan dense apartment cluster & Chiak Bridge area
  console.log('[Verify-Phase2] Moving camera to Dan-gwan apartment complex [127.9540, 37.3275] with 60-degree pitch...');
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

  console.log('[Verify-Phase2] Waiting 8 seconds for real 3D apartment geometry & PBR texture updates...');
  await new Promise((r) => setTimeout(r, 8000));

  // 2. Inspect building layer and floating bridge elimination state
  const inspectRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const realisticLayer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const rImp = realisticLayer ? (realisticLayer.implementation || realisticLayer) : null;
        const masterMesh = rImp ? rImp.masterMesh : null;
        const rooftopMesh = rImp ? rImp.rooftopMesh : null;

        const lod2Layer = m ? m.getLayer('lod2-building-engine-layer') : null;
        const lImp = lod2Layer ? (lod2Layer.implementation || lod2Layer) : null;
        const hasFloatingBridgeMesh = Boolean(
          (lImp && (lImp.bridgeBarrierMesh || lImp.bridgePierColMesh || lImp.bridgePierCapMesh)) ||
          (rImp && rImp.bridgeGroup && rImp.bridgeGroup.children.length > 0)
        );

        const posAttr = masterMesh ? masterMesh.geometry.getAttribute('position') : null;
        const uvAttr = masterMesh ? masterMesh.geometry.getAttribute('uv') : null;
        const heightAttr = masterMesh ? masterMesh.geometry.getAttribute('aHeight') : null;

        let sampleHeights = [];
        let highRiseCount = 0;
        let midRiseCount = 0;
        let lowRiseCount = 0;

        if (heightAttr) {
          for (let i = 0; i < heightAttr.count; i += 3) {
            const h = heightAttr.getX(i);
            if (h >= 28.0) highRiseCount++;
            else if (h >= 11.0) midRiseCount++;
            else lowRiseCount++;
          }
          for (let i = 0; i < Math.min(10, heightAttr.count); i++) {
            sampleHeights.push(heightAttr.getX(i));
          }
        }

        return {
          realisticLayerExists: Boolean(realisticLayer),
          hasMasterMesh: Boolean(masterMesh && masterMesh.visible),
          hasRooftopMesh: Boolean(rooftopMesh),
          totalTriangles: posAttr ? posAttr.count / 3 : 0,
          totalVertices: posAttr ? posAttr.count : 0,
          hasFloatingBridgeMesh,
          highRiseVerticesRatio: (highRiseCount / Math.max(1, (highRiseCount + midRiseCount + lowRiseCount))).toFixed(2),
          sampleHeights,
          bridgeGroupChildrenCount: rImp && rImp.bridgeGroup ? rImp.bridgeGroup.children.length : 0
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Verify-Phase2] Building & Bridge Inspection Result:');
  console.log(JSON.stringify(inspectRes?.result?.value || inspectRes, null, 2));

  // 3. Capture high-resolution screenshot
  await send('Runtime.evaluate', {
    expression: 'if (window.__map) { window.__map.triggerRepaint(); }'
  });
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-Phase2] Capturing verification screenshot...');
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  if (snap && snap.data) {
    const snapPath = path.join(ARTIFACT_DIR, 'screenshot_phase2_korean_facade_and_bridge_clean.png');
    fs.writeFileSync(snapPath, Buffer.from(snap.data, 'base64'));
    console.log('[Verify-Phase2] Screenshot saved to:', snapPath);
  }

  ws.close();
  chrome.kill();
  console.log('[Verify-Phase2] Complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify-Phase2] Fatal error:', err);
  process.exit(1);
});
