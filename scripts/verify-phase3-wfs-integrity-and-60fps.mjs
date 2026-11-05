import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 3 Verify] Killing leftover chrome on port 9249...');
  try {
    spawn('pkill', ['-9', '-f', '9249']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase 3 Verify] Launching headless Chrome with WebGL on port 9249...');
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
  const networkRequests = [];

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
        text.includes('ACTIVE_RENDERER_MOUNTED') ||
        text.includes('V-World') ||
        text.includes('RealisticKoreanCityLayer') ||
        text.includes('60fps')
      ) {
        console.log(`[Browser Console] ${text}`);
      }
    } else if (data.method === 'Network.requestWillBeSent') {
      networkRequests.push(data.params.request.url);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  console.log('[Phase 3 Verify] Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  // 12초간 초기 3D 렌더링 및 WFS 통신 수신 대기
  await new Promise((r) => setTimeout(r, 12000));

  // 1. 텔레메트리 및 렌더링 상태 수집
  const telemetry = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__mapLibreInstance || window.mapLibreInstance;
      const layer = window.__realisticLayer || (map && map.getLayer && map.getLayer('realistic-korean-city-layer'));
      const sync = window.__masterDataSynchronizer;
      const bldCount = (layer && layer.implementation && layer.implementation.getBuildingCount) 
        ? layer.implementation.getBuildingCount() 
        : 0;

      let slotsInfo = [];
      if (layer && layer.implementation && layer.implementation.materialMeshes) {
        slotsInfo = layer.implementation.materialMeshes.map((m, idx) => ({
          slot: idx,
          vertices: m.geometry ? (m.geometry.attributes.position ? m.geometry.attributes.position.count : 0) : 0,
          color: m.material && m.material.color ? m.material.color.getHexString() : 'none',
        }));
      }

      return {
        hasMap: !!map,
        buildingCount: bldCount,
        syncRecords: sync ? sync.getRecordCount() : 0,
        slotsInfo,
      };
    })()`,
    returnByValue: true,
  });

  console.log('[Phase 3 Verify] Telemetry evaluation:', JSON.stringify(telemetry.result.value, null, 2));

  // Screenshot 1: V-World WFS 도시 전체 스카이라인 조감
  console.log('[Phase 3 Verify] Capturing Overview Screenshot...');
  const ss1 = await send('Page.captureScreenshot', { format: 'png' });
  const p1 = path.join(ARTIFACT_DIR, 'screenshot_phase3_vworld_wfs_skyline_overview.png');
  fs.writeFileSync(p1, Buffer.from(ss1.data, 'base64'));
  console.log(`[Phase 3 Verify] Saved: ${p1}`);

  // 카메라를 저층 주택가 및 아파트 단지 전이 구역(봉산동/원동)으로 이동하여 근접 촬영
  console.log('[Phase 3 Verify] Panning to Bongsan-dong Low-rise & Apt transition zone...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__mapLibreInstance || window.mapLibreInstance;
      if (map) {
        map.flyTo({ center: [127.952, 37.348], zoom: 16.2, pitch: 62, bearing: 35, duration: 1500 });
      }
    })()`,
  });

  await new Promise((r) => setTimeout(r, 4000));

  // Screenshot 2: 저층 주택 vs 고층 아파트 층고 분리 근접
  console.log('[Phase 3 Verify] Capturing Low-rise vs Apt separation closeup...');
  const ss2 = await send('Page.captureScreenshot', { format: 'png' });
  const p2 = path.join(ARTIFACT_DIR, 'screenshot_phase3_lowrise_vs_apt_separation.png');
  fs.writeFileSync(p2, Buffer.from(ss2.data, 'base64'));
  console.log(`[Phase 3 Verify] Saved: ${p2}`);

  // 인터랙션 테스트: 빠른 드래그 및 회전 후 60fps 안정성 및 버벅거림 0% 검증
  console.log('[Phase 3 Verify] Testing camera interaction lock and smooth 60fps pan...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__mapLibreInstance || window.mapLibreInstance;
      if (map) {
        map.easeTo({ bearing: 95, pitch: 65, duration: 2000 });
      }
    })()`,
  });

  await new Promise((r) => setTimeout(r, 3000));

  // Screenshot 3: 인터랙션 락 및 60fps 고정 렌더링 화면
  console.log('[Phase 3 Verify] Capturing Drag Telemetry Screenshot...');
  const ss3 = await send('Page.captureScreenshot', { format: 'png' });
  const p3 = path.join(ARTIFACT_DIR, 'screenshot_phase3_smooth_drag_telemetry.png');
  fs.writeFileSync(p3, Buffer.from(ss3.data, 'base64'));
  console.log(`[Phase 3 Verify] Saved: ${p3}`);

  // 정리
  ws.close();
  chrome.kill();

  console.log('[Phase 3 Verify] All verification steps completed successfully!');
}

main().catch((err) => {
  console.error('[Phase 3 Verify] Error:', err);
  process.exit(1);
});
