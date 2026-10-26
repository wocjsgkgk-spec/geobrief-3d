import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Diverse-Facade-Verify] Cleaning any leftover chrome on 9223...');
  try {
    spawn('pkill', ['-9', '-f', '9223']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Diverse-Facade-Verify] Launching headless Chrome with WebGL SwiftShader on port 9223...');
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
  console.log('[Diverse-Facade-Verify] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Diverse-Facade-Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Diverse-Facade-Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Diverse-Facade-Verify] Waiting 16 seconds for map initialization & 3D buildings generation...');
  await new Promise((r) => setTimeout(r, 16000));

  // 1. Inspect Layer and Mesh Statistics
  const meshInspect = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const layer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const imp = layer ? (layer.implementation || layer) : null;
        if (!imp || !imp.masterMesh) return { error: 'MasterMesh not found' };

        const masterMesh = imp.masterMesh;
        const geo = masterMesh.geometry;
        const posAttr = geo ? geo.getAttribute('position') : null;
        const heightAttr = geo ? geo.getAttribute('aHeight') : null;

        let maxH = 0;
        let groundVerts = 0;
        let lowRiseVerts = 0;
        let highRiseVerts = 0;

        if (heightAttr) {
          for (let i = 0; i < heightAttr.count; i++) {
            const h = heightAttr.getX(i);
            if (h > maxH) maxH = h;
            if (h < 0.1) groundVerts++;
            else if (h < 16.0) lowRiseVerts++;
            else highRiseVerts++;
          }
        }

        // Tearing check (any triangle with edge > 180m)
        let tornCount = 0;
        let maxEdge = 0;
        if (posAttr && posAttr.array) {
          const arr = posAttr.array;
          const count = posAttr.count;
          for (let i = 0; i < count; i += 3) {
            const idx0 = i * 3;
            const idx1 = (i + 1) * 3;
            const idx2 = (i + 2) * 3;
            if (idx2 + 2 >= arr.length) break;
            const x0 = arr[idx0], z0 = arr[idx0 + 2];
            const x1 = arr[idx1], z1 = arr[idx1 + 2];
            const x2 = arr[idx2], z2 = arr[idx2 + 2];
            const d01 = Math.hypot(x1 - x0, z1 - z0);
            const d12 = Math.hypot(x2 - x1, z2 - z1);
            const d20 = Math.hypot(x0 - x2, z0 - z2);
            const m = Math.max(d01, d12, d20);
            if (m > maxEdge) maxEdge = m;
            if (d01 > 180 || d12 > 180 || d20 > 180) {
              tornCount++;
            }
          }
        }

        return {
          masterMeshVisible: masterMesh.visible,
          masterVertices: posAttr ? posAttr.count : 0,
          masterTriangles: posAttr ? (posAttr.count / 3) : 0,
          maxBuildingHeightMeters: maxH.toFixed(2),
          lowRiseVertices: lowRiseVerts,
          highRiseVertices: highRiseVerts,
          maxTriangleEdgeMeters: maxEdge.toFixed(2),
          tornTrianglesCount: tornCount,
          material: masterMesh.material.type
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Diverse-Facade-Verify] 3D Mesh & Tearing Statistics:');
  console.log(JSON.stringify(meshInspect?.result?.value, null, 2));

  // 2. Set camera view for Downtown Skyline view (matches user's screenshot view)
  console.log('[Diverse-Facade-Verify] Moving camera to Downtown Skyline [127.940, 37.345] with 58-degree pitch...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (m) {
          m.jumpTo({
            center: [127.940, 37.345],
            zoom: 15.6,
            pitch: 58,
            bearing: -32
          });
          m.triggerRepaint();
        }
      })()
    `
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Diverse-Facade-Verify] Capturing screenshot 1 (Downtown Diverse Facades & Clean Skyline)...');
  const snap1 = await send('Page.captureScreenshot', { format: 'png' });
  if (snap1 && snap1.data) {
    const snapPath1 = path.join(ARTIFACT_DIR, 'screenshot_diverse_facades_no_tearing_city_center.png');
    fs.writeFileSync(snapPath1, Buffer.from(snap1.data, 'base64'));
    console.log('[Diverse-Facade-Verify] Captured screenshot 1 to:', snapPath1);
  }

  // 3. Move camera to Musil-dong low-rise area
  console.log('[Diverse-Facade-Verify] Moving camera to Musil-dong [127.928, 37.332] with 55-degree pitch...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (m) {
          m.jumpTo({
            center: [127.928, 37.332],
            zoom: 16.0,
            pitch: 55,
            bearing: 22
          });
          m.triggerRepaint();
        }
      })()
    `
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Diverse-Facade-Verify] Capturing screenshot 2 (Musil-dong Low-Rise Restored)...');
  const snap2 = await send('Page.captureScreenshot', { format: 'png' });
  if (snap2 && snap2.data) {
    const snapPath2 = path.join(ARTIFACT_DIR, 'screenshot_musildong_lowrise_restored.png');
    fs.writeFileSync(snapPath2, Buffer.from(snap2.data, 'base64'));
    console.log('[Diverse-Facade-Verify] Captured screenshot 2 to:', snapPath2);
  }

  // Close chrome
  ws.close();
  chrome.kill();
  console.log('[Diverse-Facade-Verify] Verification finished successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Diverse-Facade-Verify] Fatal error:', err);
  process.exit(1);
});
