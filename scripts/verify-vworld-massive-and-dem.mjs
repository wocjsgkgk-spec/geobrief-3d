import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.agy_acc1/.gemini/antigravity-cli/brain/c5451d72-fd64-45ac-b41b-731e0bbda3c3';

async function main() {
  console.log('[Verify] 1. Testing /api/terrain-dem endpoint directly...');
  const testTile = await new Promise((resolve) => {
    http.get('http://127.0.0.1:3000/api/terrain-dem/12/3503/1589.png', (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          length: Buffer.concat(chunks).length,
        });
      });
    }).on('error', (err) => resolve({ status: 'ERROR', error: err.message }));
  });
  console.log('[Verify] Tile test result:', testTile);

  console.log('[Verify] 2. Killing leftover chrome on port 9249...');
  try {
    spawn('pkill', ['-9', '-f', '9249']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify] 3. Launching Chrome headless with WebGL SwiftShader on port 9249...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9249',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,1050',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9249/json/list', (res) => {
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

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();
  const consoleMessages = [];

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const { resolve, reject } = callbacks.get(data.id);
      callbacks.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map((a) => a.value || a.description || '').join(' ');
      consoleMessages.push(text);
      if (text.includes('RealisticKoreanCityLayer') || text.includes('V-World') || text.includes('DEM') || text.includes('setTerrain')) {
        console.log('   [Browser]:', text);
      }
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  async function evaluate(expr) {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[Verify] 4. Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  // Wait for map load and 3D buildings
  console.log('[Verify] Waiting 16s for map, DEM tiles, and 3D buildings to load...');
  await new Promise((r) => setTimeout(r, 16000));

  // Ensure terrain is enabled
  await evaluate(`
    (() => {
      const store = window.__mapStore?.getState();
      if (store && !store.terrainEnabled) {
        store.setTerrainEnabled(true);
      }
      const map = window.__map;
      if (map && !map.getTerrain() && map.getSource('terrarium-dem')) {
        map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.0 });
      }
    })()
  `);
  await new Promise((r) => setTimeout(r, 3000));

  // Check DEM source and query elevation
  const demDiag = await evaluate(`
    (() => {
      try {
        const map = window.__map || window.mapInstance || window._map;
        if (!map) return { error: 'Map not found' };

      const terrain = map.getTerrain();
      const hasDem = Boolean(map.getSource('terrarium-dem'));
      const center = map.getCenter();
      
      let elevCenter = null;
      let elevChiak = null;
      if (typeof map.queryTerrainElevation === 'function') {
        elevCenter = map.queryTerrainElevation([center.lng, center.lat]);
        elevChiak = map.queryTerrainElevation([128.057, 37.362]); // Chiak Birobong
      }

      const layer = window.__realisticKoreanCityLayer;
      const mesh = layer ? layer.masterMesh : null;
      const posAttr = mesh && mesh.geometry ? mesh.geometry.attributes.position : null;
      const vertCount = posAttr ? posAttr.count : 0;
      const builtCount = layer && layer.builtBuildingKeys ? layer.builtBuildingKeys.size : 0;

      const badge = document.getElementById('realtime-metrics-badge');
      const badgeText = badge ? badge.textContent : '';

      // Analyze vertices and projection without window.THREE
      const sampleNdc = [];
      if (layer && mesh && posAttr && vertCount > 0 && layer.camera) {
        const m = layer.camera.projectionMatrix.elements;
        for (let i = 0; i < Math.min(5, vertCount); i++) {
          const x = posAttr.array[i * 3];
          const y = posAttr.array[i * 3 + 1];
          const z = posAttr.array[i * 3 + 2];
          const w = 1.0;
          const cx = m[0]*x + m[4]*y + m[8]*z + m[12]*w;
          const cy = m[1]*x + m[5]*y + m[9]*z + m[13]*w;
          const cz = m[2]*x + m[6]*y + m[10]*z + m[14]*w;
          const cw = m[3]*x + m[7]*y + m[11]*z + m[15]*w;
          sampleNdc.push({
            pos: [x, y, z],
            clip: [cx, cy, cz, cw],
            ndc: [cx / cw, cy / cw, cz / cw],
            inView: Math.abs(cx / cw) <= 1 && Math.abs(cy / cw) <= 1 && Math.abs(cz / cw) <= 1 && cw > 0
          });
        }
      }

      // Check materials
      const matInfo = [];
      if (layer && layer.buildingMaterials) {
        for (let m = 0; m < Math.min(5, layer.buildingMaterials.length); m++) {
          const mat = layer.buildingMaterials[m];
          matInfo.push({
            idx: m,
            type: mat.type,
            color: mat.color ? mat.color.getHexString() : null,
            visible: mat.visible,
            opacity: mat.opacity,
            transparent: mat.transparent,
            depthTest: mat.depthTest,
            depthWrite: mat.depthWrite,
            wireframe: mat.wireframe,
            hasMap: Boolean(mat.map),
          });
        }
      }

      const allLayers = map.getStyle().layers.map(l => ({ id: l.id, type: l.type }));
      const customLayerIndex = allLayers.findIndex(l => l.id === 'realistic-korean-city-layer');

      return {
        hasTerrain: Boolean(terrain),
        terrainSource: terrain ? terrain.source : null,
        terrainExaggeration: terrain ? terrain.exaggeration : null,
        hasDemSource: hasDem,
        center: [center.lng, center.lat],
        elevCenter,
        elevChiak,
        hasMasterMesh: Boolean(mesh),
        vertCount,
        builtCount,
        isLayerVisible: layer?.isVisible,
        isMeshVisible: mesh?.visible,
        sampleNdc,
        matInfo,
        totalLayers: allLayers.length,
        customLayerIndex,
        surroundingLayers: allLayers.slice(Math.max(0, customLayerIndex - 3), customLayerIndex + 4),
        badgeText,
      };
    } catch (e) {
      return { error: String(e && e.stack || e) };
    }
  })()
  `);
  console.log('[Verify] DEM and 3D City Diagnostics:', JSON.stringify(demDiag, null, 2));

  // Test Camera rotation and measure FPS
  console.log('[Verify] 5. Measuring FPS during camera rotation...');
  const fpsTest = await evaluate(`
    new Promise((resolve) => {
      const map = window.__map || window.mapInstance || window._map;
      if (!map) return resolve({ error: 'No map' });

      let frameCount = 0;
      let startTime = performance.now();
      const startBearing = map.getBearing();

      function onFrame() {
        frameCount++;
        const elapsed = performance.now() - startTime;
        map.setBearing(startBearing + (elapsed / 1000) * 30); // 30 deg/sec
        if (elapsed < 2000) {
          requestAnimationFrame(onFrame);
        } else {
          const avgFps = Math.round((frameCount / elapsed) * 1000);
          resolve({ avgFps, frameCount, elapsedMs: Math.round(elapsed) });
        }
      }
      requestAnimationFrame(onFrame);
    })
  `);
  console.log('[Verify] Rotation FPS Test Result:', fpsTest);

  // Capture screenshot: Overview of massive 3D cityscape
  console.log('[Verify] 6. Capturing screenshot: massive_cityscape_overview.png...');
  await new Promise((r) => setTimeout(r, 2000));
  const snap1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'massive_cityscape_overview.png'), Buffer.from(snap1.data, 'base64'));
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'current_view.png'), Buffer.from(snap1.data, 'base64'));

  // Tilt to see mountains and skyline
  console.log('[Verify] 7. Tilting camera to view mountains (Chiaksan relief)...');
  await evaluate(`
    (() => {
      const map = window.__map || window.mapInstance || window._map;
      if (map) {
        map.setPitch(65);
        map.setBearing(85); // looking east towards Chiaksan
      }
    })()
  `);
  await new Promise((r) => setTimeout(r, 4000));

  const snap2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'terrain_dem_mountains.png'), Buffer.from(snap2.data, 'base64'));

  // Zoom in to street level to view 16 PBR facade textures, balcony windows, storefronts
  console.log('[Verify] 8. Zooming to street level for 16 PBR detail verification...');
  await evaluate(`
    (() => {
      const map = window.__map || window.mapInstance || window._map;
      if (map) {
        map.setPitch(55);
        map.setZoom(16.5);
      }
    })()
  `);
  await new Promise((r) => setTimeout(r, 4000));

  const snap3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'street_level_rea.png'), Buffer.from(snap3.data, 'base64'));

  console.log('[Verify] Verification complete! All screenshots saved to artifact directory.');

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify] FATAL ERROR:', err);
  process.exit(1);
});
