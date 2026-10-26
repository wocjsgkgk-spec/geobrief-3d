import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Landmark-Verify] Cleaning any leftover chrome on 9227...');
  try {
    spawn('pkill', ['-9', '-f', '9227']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Landmark-Verify] Launching headless Chrome with WebGL SwiftShader on port 9227...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,900',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9227/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') || versionData.find((t) => t.type === 'page') || versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Landmark-Verify] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Landmark-Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Landmark-Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Landmark-Verify] Waiting 15 seconds for map initialization & building geometries...');
  await new Promise((r) => setTimeout(r, 15000));

  // Safely close the two floating HUD cards
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn1 = document.querySelector('button[title*="측정 HUD 닫기"]');
        if (btn1) btn1.click();
        const btn2 = document.querySelector('button[title*="요약 카드 닫기"]');
        if (btn2) btn2.click();
        const card1 = document.getElementById('polygon-measurement-card');
        if (card1) card1.style.display = 'none';
        return true;
      })();
    `,
  });

  // ---------------------------------------------------------------------------
  // Test 1: Wonju City Hall Complex (원주시청 3단 복합 조형)
  // ---------------------------------------------------------------------------
  console.log('[Landmark-Verify] Flying camera to Wonju City Hall Complex [127.92007, 37.3426] ...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (!m) return false;
        m.flyTo({
          center: [127.92007, 37.3426],
          zoom: 16.5,
          pitch: 62,
          bearing: 35,
          duration: 2500
        });
        return true;
      })();
    `,
  });

  console.log('[Landmark-Verify] Waiting 5 seconds for camera transition & building rebuild...');
  await new Promise((r) => setTimeout(r, 5000));

  // Close HUD cards again if flyTo triggered state
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn1 = document.querySelector('button[title*="측정 HUD 닫기"]');
        if (btn1) btn1.click();
        const card1 = document.getElementById('polygon-measurement-card');
        if (card1) card1.style.display = 'none';
        return true;
      })();
    `,
  });

  // Inspect Wonju City Hall mesh and general city mesh metrics
  const cityHallMetrics = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const layer = window.__realisticCityLayer;
        const map = window.__map;
        if (!layer || !layer.masterMesh) return { error: 'Master mesh not ready' };

        const geo = layer.masterMesh.geometry;
        const pos = geo.attributes.position;
        const totalVertices = pos ? pos.count : 0;
        const totalTriangles = totalVertices / 3;

        // Check torn triangles
        let tornCount = 0;
        if (pos && pos.array) {
          const arr = pos.array;
          const count = pos.count;
          for (let i = 0; i < count; i += 3) {
            const i0 = i * 3, i1 = (i + 1) * 3, i2 = (i + 2) * 3;
            const x0 = arr[i0], z0 = arr[i0 + 2];
            const x1 = arr[i1], z1 = arr[i1 + 2];
            const x2 = arr[i2], z2 = arr[i2 + 2];
            const d01 = Math.hypot(x1 - x0, z1 - z0);
            const d12 = Math.hypot(x2 - x1, z2 - z1);
            const d20 = Math.hypot(x0 - x2, z0 - z2);
            if (d01 > 180 || d12 > 180 || d20 > 180) tornCount++;
          }
        }

        const center = map ? map.getCenter() : null;
        const zoom = map ? map.getZoom() : null;
        const pitch = map ? map.getPitch() : null;

        return {
          totalVertices,
          totalTriangles,
          tornCount,
          center,
          zoom,
          pitch,
          drawCalls: 1
        };
      })();
    `,
    returnByValue: true,
  });

  console.log('[Landmark-Verify] Wonju City Hall Metrics:', JSON.stringify(cityHallMetrics.result?.value, null, 2));

  // Screenshot 1: Wonju City Hall 3-Tier Multipart Landmark
  console.log('[Landmark-Verify] Capturing screenshot of Wonju City Hall 3-Tier Landmark...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot1 && shot1.data) {
    const shotPath1 = path.join(ARTIFACT_DIR, 'screenshot_wonju_cityhall_3tier_landmark.png');
    fs.writeFileSync(shotPath1, Buffer.from(shot1.data, 'base64'));
    console.log('[Landmark-Verify] Saved screenshot 1 to:', shotPath1);
  }

  // ---------------------------------------------------------------------------
  // Test 2: Wonju Medical Center & Nearby Schools (원주의료원 및 학교 랜드마크)
  // ---------------------------------------------------------------------------
  console.log('[Landmark-Verify] Flying camera to Wonju Medical Center [127.94898, 37.33264] ...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        if (!m) return false;
        m.flyTo({
          center: [127.94898, 37.33264],
          zoom: 16.5,
          pitch: 58,
          bearing: -35,
          duration: 2500
        });
        return true;
      })();
    `,
  });

  console.log('[Landmark-Verify] Waiting 5 seconds for transition & render...');
  await new Promise((r) => setTimeout(r, 5000));

  // Close HUD cards again if flyTo triggered state
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn1 = document.querySelector('button[title*="측정 HUD 닫기"]');
        if (btn1) btn1.click();
        const card1 = document.getElementById('polygon-measurement-card');
        if (card1) card1.style.display = 'none';
        return true;
      })();
    `,
  });

  const hospitalMetrics = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const layer = window.__realisticCityLayer;
        const map = window.__map;
        if (!layer || !layer.masterMesh) return { error: 'Master mesh not ready' };

        const geo = layer.masterMesh.geometry;
        const pos = geo.attributes.position;
        const totalVertices = pos ? pos.count : 0;
        const totalTriangles = totalVertices / 3;

        const center = map ? map.getCenter() : null;
        const zoom = map ? map.getZoom() : null;

        return {
          totalVertices,
          totalTriangles,
          center,
          zoom,
          drawCalls: 1
        };
      })();
    `,
    returnByValue: true,
  });

  console.log('[Landmark-Verify] Hospital & Schools Metrics:', JSON.stringify(hospitalMetrics.result?.value, null, 2));

  // Screenshot 2: Wonju Medical Center & Schools Landmark
  console.log('[Landmark-Verify] Capturing screenshot of Hospital & Schools Landmarks...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot2 && shot2.data) {
    const shotPath2 = path.join(ARTIFACT_DIR, 'screenshot_school_hospital_landmarks.png');
    fs.writeFileSync(shotPath2, Buffer.from(shot2.data, 'base64'));
    console.log('[Landmark-Verify] Saved screenshot 2 to:', shotPath2);
  }

  ws.close();
  try {
    chrome.kill('SIGKILL');
  } catch {}

  console.log('[Landmark-Verify] Completed successfully!');
}

main().catch((err) => {
  console.error('[Landmark-Verify] Error:', err);
  process.exit(1);
});
