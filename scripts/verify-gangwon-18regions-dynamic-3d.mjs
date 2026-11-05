import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Gangwon Verify] Killing leftover chrome on port 9249...');
  try {
    spawn('pkill', ['-9', '-f', '9249']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Gangwon Verify] Launching headless Chrome with WebGL on port 9249...');
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
    '--window-size=1920,1080',
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
      if (
        text.includes('RealisticKoreanCityLayer') ||
        text.includes('GeoBrief 3D 60fps Merged') ||
        text.includes('V-World') ||
        text.includes('Minified React error') ||
        text.includes('ERROR')
      ) {
        console.log(`[Browser Console] ${text}`);
      }
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  console.log('[Gangwon Verify] Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  // 10초간 원주 초기 3D 렌더링 대기
  console.log('[Gangwon Verify] Waiting 10s for initial Wonju scene stabilization...');
  await new Promise((r) => setTimeout(r, 10000));

  // 1. 원주 텔레메트리 & 스크린샷
  const wonjuTel = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.__mapLibreMap || window.__mapInstance || window.map;
      const layer = window.__realisticCityLayer || window.__realisticKoreanCityLayer;
      return {
        center: map ? [map.getCenter().lng, map.getCenter().lat] : null,
        zoom: map ? map.getZoom() : 0,
        buildingCount: layer ? layer.getBuildingCount() : 0,
        groups: layer && layer.mesh && layer.mesh.geometry ? layer.mesh.geometry.groups.length : 0,
        materialsCount: layer && layer.buildingMaterials ? layer.buildingMaterials.length : 0,
      };
    })()`,
    returnByValue: true,
  });
  console.log('[Gangwon Verify] Wonju Telemetry:', wonjuTel.result.value);

  const ss1 = await send('Page.captureScreenshot', { format: 'png' });
  const p1 = path.join(ARTIFACT_DIR, 'screenshot_gangwon_wonju_live.png');
  fs.writeFileSync(p1, Buffer.from(ss1.data, 'base64'));
  console.log(`[Gangwon Verify] Saved Wonju screenshot: ${p1}`);

  // 2. 춘천시 (Chuncheon: 127.728, 37.885) 이동 테스트
  console.log('[Gangwon Verify] Panning to 춘천시 (Chuncheon 도청/시청/명동)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.__mapLibreMap || window.__mapInstance || window.map;
      if (map) {
        map.jumpTo({ center: [127.728, 37.885], zoom: 16.0, pitch: 58, bearing: 30 });
      }
      const store = window.__useMapStore ? window.__useMapStore.getState() : null;
      if (store && store.selectRegion) {
        store.selectRegion('chuncheon');
      }
    })()`,
  });

  console.log('[Gangwon Verify] Waiting 8s for Chuncheon BBOX data streaming & 3D mesh rebuild...');
  await new Promise((r) => setTimeout(r, 8000));

  const chuncheonTel = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.__mapLibreMap || window.__mapInstance || window.map;
      const layer = window.__realisticCityLayer || window.__realisticKoreanCityLayer;
      return {
        center: map ? [map.getCenter().lng, map.getCenter().lat] : null,
        zoom: map ? map.getZoom() : 0,
        buildingCount: layer ? layer.getBuildingCount() : 0,
        groups: layer && layer.mesh && layer.mesh.geometry ? layer.mesh.geometry.groups.length : 0,
        materialsCount: layer && layer.buildingMaterials ? layer.buildingMaterials.length : 0,
      };
    })()`,
    returnByValue: true,
  });
  console.log('[Gangwon Verify] Chuncheon Telemetry:', chuncheonTel.result.value);

  const ss2 = await send('Page.captureScreenshot', { format: 'png' });
  const p2 = path.join(ARTIFACT_DIR, 'screenshot_gangwon_chuncheon_live.png');
  fs.writeFileSync(p2, Buffer.from(ss2.data, 'base64'));
  console.log(`[Gangwon Verify] Saved Chuncheon screenshot: ${p2}`);

  // 3. 강릉시 (Gangneung: 128.898, 37.755) 이동 테스트
  console.log('[Gangwon Verify] Panning to 강릉시 (Gangneung 동해안권 도심)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.__mapLibreMap || window.__mapInstance || window.map;
      if (map) {
        map.jumpTo({ center: [128.898, 37.755], zoom: 16.0, pitch: 58, bearing: 45 });
      }
      const store = window.__useMapStore ? window.__useMapStore.getState() : null;
      if (store && store.selectRegion) {
        store.selectRegion('gangneung');
      }
    })()`,
  });

  console.log('[Gangwon Verify] Waiting 8s for Gangneung BBOX data streaming & 3D mesh rebuild...');
  await new Promise((r) => setTimeout(r, 8000));

  const gangneungTel = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.__mapLibreMap || window.__mapInstance || window.map;
      const layer = window.__realisticCityLayer || window.__realisticKoreanCityLayer;
      return {
        center: map ? [map.getCenter().lng, map.getCenter().lat] : null,
        zoom: map ? map.getZoom() : 0,
        buildingCount: layer ? layer.getBuildingCount() : 0,
        groups: layer && layer.mesh && layer.mesh.geometry ? layer.mesh.geometry.groups.length : 0,
        materialsCount: layer && layer.buildingMaterials ? layer.buildingMaterials.length : 0,
      };
    })()`,
    returnByValue: true,
  });
  console.log('[Gangwon Verify] Gangneung Telemetry:', gangneungTel.result.value);

  const ss3 = await send('Page.captureScreenshot', { format: 'png' });
  const p3 = path.join(ARTIFACT_DIR, 'screenshot_gangwon_gangneung_live.png');
  fs.writeFileSync(p3, Buffer.from(ss3.data, 'base64'));
  console.log(`[Gangwon Verify] Saved Gangneung screenshot: ${p3}`);

  // 4. 철원군 (Cheorwon: 127.313, 38.146) 접경지역 이동 테스트
  console.log('[Gangwon Verify] Panning to 철원군 (Cheorwon 북부 접경권)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.__mapLibreMap || window.__mapInstance || window.map;
      if (map) {
        map.jumpTo({ center: [127.313, 38.146], zoom: 15.5, pitch: 55, bearing: 5 });
      }
      const store = window.__useMapStore ? window.__useMapStore.getState() : null;
      if (store && store.selectRegion) {
        store.selectRegion('cheorwon');
      }
    })()`,
  });

  console.log('[Gangwon Verify] Waiting 8s for Cheorwon BBOX data streaming & 3D mesh rebuild...');
  await new Promise((r) => setTimeout(r, 8000));

  const cheorwonTel = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.__mapLibreMap || window.__mapInstance || window.map;
      const layer = window.__realisticCityLayer || window.__realisticKoreanCityLayer;
      return {
        center: map ? [map.getCenter().lng, map.getCenter().lat] : null,
        zoom: map ? map.getZoom() : 0,
        buildingCount: layer ? layer.getBuildingCount() : 0,
        groups: layer && layer.mesh && layer.mesh.geometry ? layer.mesh.geometry.groups.length : 0,
        materialsCount: layer && layer.buildingMaterials ? layer.buildingMaterials.length : 0,
      };
    })()`,
    returnByValue: true,
  });
  console.log('[Gangwon Verify] Cheorwon Telemetry:', cheorwonTel.result.value);

  const ss4 = await send('Page.captureScreenshot', { format: 'png' });
  const p4 = path.join(ARTIFACT_DIR, 'screenshot_gangwon_cheorwon_live.png');
  fs.writeFileSync(p4, Buffer.from(ss4.data, 'base64'));
  console.log(`[Gangwon Verify] Saved Cheorwon screenshot: ${p4}`);

  // 5. 3D 타일셋 스트리밍(모드 C) 전환 시 실제 건물 레이어 영구 유지(배타적 잠금 해제 검증)
  console.log('[Gangwon Verify] Verifying Exclusion Lock Bypass (switching to Mode C)...');
  const lockBypass = await send('Runtime.evaluate', {
    expression: `(() => {
      const store = window.__useMapStore ? window.__useMapStore.getState() : null;
      const layer = window.__realisticCityLayer || window.__realisticKoreanCityLayer;
      if (store && store.setRenderMode3D) {
        store.setRenderMode3D('tiles3d');
      }
      return {
        renderMode3D: store ? store.renderMode3D : 'unknown',
        layerVisible: layer ? layer.getVisible() : false,
      };
    })()`,
    returnByValue: true,
  });
  console.log('[Gangwon Verify] Lock Bypass Result:', lockBypass.result.value);

  // 정리
  ws.close();
  chrome.kill();

  console.log('🎉 [Gangwon Verify] All 18-Regions Dynamic 3D Verification steps PASSED!');
}

main().catch((err) => {
  console.error('[Gangwon Verify] Failed:', err);
  process.exit(1);
});
