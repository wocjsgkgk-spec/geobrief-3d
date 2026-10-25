import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-PBR] Cleaning any leftover chrome on 9223...');
  try {
    spawn('pkill', ['-9', '-f', '9223']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-PBR] Launching headless Chrome with WebGL SwiftShader on port 9223...');
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
  console.log('[Verify-PBR] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Verify-PBR] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Verify-PBR] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-PBR] Waiting 16 seconds for map initialization, vector building loading & PBR mesh compilation...');
  await new Promise((r) => setTimeout(r, 16000));

  // 1. Inspect PBR shader and Three.js custom layer state
  const pbrLayerEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const layer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const imp = layer ? (layer.implementation || layer) : null;
        
        const hasMasterMesh = Boolean(imp && imp.masterMesh);
        const geo = hasMasterMesh ? imp.masterMesh.geometry : null;
        const mat = hasMasterMesh ? imp.masterMesh.material : null;
        
        const posAttr = geo ? geo.getAttribute('position') : null;
        const normAttr = geo ? geo.getAttribute('normal') : null;
        const uvAttr = geo ? geo.getAttribute('uv') : null;
        const heightAttr = geo ? geo.getAttribute('aHeight') : null;

        const pbrUniforms = mat ? mat.pbrUniforms : null;
        const rooftopMesh = imp ? imp.rooftopMesh : null;

        let heightSamples = [];
        if (heightAttr) {
          for (let i = 0; i < Math.min(10, heightAttr.count); i++) {
            heightSamples.push(heightAttr.getX(i));
          }
        }

        return {
          layerExists: Boolean(layer),
          hasMasterMesh,
          hasRooftopMesh: Boolean(rooftopMesh),
          vertexCount: posAttr ? posAttr.count : 0,
          hasNormalAttr: Boolean(normAttr),
          hasUvAttr: Boolean(uvAttr),
          hasHeightAttr: Boolean(heightAttr),
          heightSamples,
          hasPbrUniforms: Boolean(pbrUniforms),
          sunDirection: pbrUniforms ? [
            pbrUniforms.uSunDirection.value.x.toFixed(2),
            pbrUniforms.uSunDirection.value.y.toFixed(2),
            pbrUniforms.uSunDirection.value.z.toFixed(2)
          ] : null,
          hasRmaMap: pbrUniforms ? pbrUniforms.uHasRmaMap.value : false,
          aoIntensity: pbrUniforms ? pbrUniforms.uAoIntensity.value : null,
          specularGlintIntensity: pbrUniforms ? pbrUniforms.uSpecularGlintIntensity.value : null,
          cameraPosEst: pbrUniforms ? [
            pbrUniforms.uCameraPosition.value.x.toFixed(1),
            pbrUniforms.uCameraPosition.value.y.toFixed(1),
            pbrUniforms.uCameraPosition.value.z.toFixed(1)
          ] : null
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Verify-PBR] Realistic Korean City Layer PBR State:');
  console.log(JSON.stringify(pbrLayerEval.result?.value, null, 2));

  // 2. Jump camera to Dan-gwan dense apartment cluster and tilt to highlight window specular reflection & contact AO
  console.log('[Verify-PBR] Moving camera to Dan-gwan apartment complex [127.9540, 37.3275] with 62-degree pitch...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.__map) {
        window.__map.jumpTo({
          center: [127.9540, 37.3275],
          zoom: 16.9,
          pitch: 62,
          bearing: 42
        });
      }
    `
  });

  console.log('[Verify-PBR] Waiting 8 seconds for real 3D apartment geometry & PBR lighting updates...');
  await new Promise((r) => setTimeout(r, 8000));

  // 3. Inspect post-jump geometry & building count
  const postJumpInspect = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = window.__map;
        const layer = m ? m.getLayer('realistic-korean-city-layer') : null;
        const imp = layer ? (layer.implementation || layer) : null;
        const geo = imp && imp.masterMesh ? imp.masterMesh.geometry : null;
        const posAttr = geo ? geo.getAttribute('position') : null;
        const heightAttr = geo ? geo.getAttribute('aHeight') : null;
        const mat = imp && imp.masterMesh ? imp.masterMesh.material : null;
        const pbr = mat ? mat.pbrUniforms : null;

        let maxHeightFound = 0;
        let groundVertices = 0;
        if (heightAttr) {
          for (let i = 0; i < heightAttr.count; i++) {
            const h = heightAttr.getX(i);
            if (h > maxHeightFound) maxHeightFound = h;
            if (h < 0.1) groundVertices++;
          }
        }

        return {
          buildingMeshRendered: Boolean(imp && imp.masterMesh && imp.masterMesh.visible),
          totalTriangles: posAttr ? posAttr.count / 3 : 0,
          totalVertices: posAttr ? posAttr.count : 0,
          groundVerticesWithContactAO: groundVertices,
          maxBuildingHeightInMeters: maxHeightFound.toFixed(1),
          cameraLocalPos: pbr ? [
            pbr.uCameraPosition.value.x.toFixed(1),
            pbr.uCameraPosition.value.y.toFixed(1),
            pbr.uCameraPosition.value.z.toFixed(1)
          ] : null,
          sunDirection: pbr ? [
            pbr.uSunDirection.value.x.toFixed(2),
            pbr.uSunDirection.value.y.toFixed(2),
            pbr.uSunDirection.value.z.toFixed(2)
          ] : null
        };
      })()
    `,
    returnByValue: true
  });

  console.log('[Verify-PBR] Post-Jump Inspection (Dan-gwan complex):');
  console.log(JSON.stringify(postJumpInspect?.result?.value || postJumpInspect, null, 2));

  // 4. Capture screenshot
  await send('Runtime.evaluate', {
    expression: 'if (window.__map) { window.__map.triggerRepaint(); }'
  });
  await new Promise((r) => setTimeout(r, 1000));
  console.log('[Verify-PBR] Capturing screenshot via Page.captureScreenshot...');
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  if (snap && snap.data) {
    const snapPath = path.join(ARTIFACT_DIR, 'screenshot_pbr_facade_and_roof_shader_verified.png');
    fs.writeFileSync(snapPath, Buffer.from(snap.data, 'base64'));
    console.log('[Verify-PBR] Captured high-resolution PBR screenshot to:', snapPath);
  } else {
    console.warn('[Verify-PBR] Page.captureScreenshot returned empty payload:', snap);
  }

  // Close chrome
  ws.close();
  chrome.kill();
  console.log('[Verify-PBR] Complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify-PBR] Fatal error:', err);
  process.exit(1);
});
