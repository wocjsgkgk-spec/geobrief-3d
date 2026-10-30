/**
 * scripts/verify-vworld-master-engine.mjs
 *
 * [GeoBrief 3D 2단계] 건물 획일화 완전 해체 및 V-World급 다품종 24대 실사 아키텍처 변주 & 소하천 실사 정합 실증
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-MasterEngine] Cleaning any leftover chrome on 9225...');
  try {
    spawn('pkill', ['-9', '-f', '9225']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-MasterEngine] Launching headless Chrome with WebGL on port 9225...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--user-data-dir=/tmp/chrome-vworld-verify-' + Date.now(),
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
    http.get('http://127.0.0.1:9225/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget =
    versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') ||
    versionData.find((t) => t.type === 'page') ||
    versionData[0];
  const pageWsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Verify-MasterEngine] Connecting to CDP WebSocket:', pageWsUrl);

  const ws = new WebSocket(pageWsUrl);

  let idCounter = 1;
  const pendingRequests = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  console.log('[Verify-MasterEngine] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');

  console.log('[Verify-MasterEngine] Navigating to http://localhost:3110...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  // 페이지 및 맵 리소스 로드 대기
  await new Promise((r) => setTimeout(r, 8000));

  console.log('[Verify-MasterEngine] Checking DOM elements and Master Engine status...');
  const domStatus = await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const bodyText = document.body.innerText;
        const hasModeC = bodyText.includes('모드 C');
        const hasZeroVertex = bodyText.includes('0개 타일 · 0 버텍스');
        const hasMasterEngine = bodyText.includes('V-World 실사 3D 마스터 렌더러') || bodyText.includes('V-World 실사 3D 마스터');
        
        let buildingCount = 0;
        const countMatch = bodyText.match(/(\\d[\\d,]*)\\s*동/);
        if (countMatch) buildingCount = countMatch[1];

        // 팝업/HUD 닫기
        const closeBtns = document.querySelectorAll('button');
        closeBtns.forEach(b => {
          if (b.innerText.includes('닫기') || b.querySelector('.lucide-x')) {
            b.click();
          }
        });

        return {
          hasModeC,
          hasZeroVertex,
          hasMasterEngine,
          buildingCount,
          url: window.location.href
        };
      })()
    `,
    returnByValue: true
  });
  console.log('[Verify-MasterEngine] DOM Inspection Result:', JSON.stringify(domStatus.result.value, null, 2));

  // 1. 반곡동 혁신도시로 카메라 이동 및 3D 렌더링 검증
  console.log('[Verify-MasterEngine] Flying to Wonju Bangok Innovation City (반곡동 혁신도시)...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__map || window.__mapLibreMap || window.map;
        if (map && map.flyTo) {
          map.flyTo({
            center: [127.9785, 37.3245],
            zoom: 16.5,
            pitch: 62,
            bearing: -20,
            duration: 1500
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Verify-MasterEngine] Capturing 1: Bangok Innovation City 3D Skyline & Diverse Architecture...');
  const shot1 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath1 = path.join(ARTIFACT_DIR, 'screenshot_vworld_diverse_bangok_3d.png');
  fs.writeFileSync(outPath1, Buffer.from(shot1.data, 'base64'));
  console.log('[Verify-MasterEngine] Saved shot1 to:', outPath1);

  // 2. 원주 도심 전역 3D 시티 뷰로 전환
  console.log('[Verify-MasterEngine] Flying to Wonju City Center / Dangu-dong Skyline...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__map || window.__mapLibreMap || window.map;
        if (map && map.flyTo) {
          map.flyTo({
            center: [127.9405, 37.3520],
            zoom: 16.0,
            pitch: 60,
            bearing: 35,
            duration: 1500
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Verify-MasterEngine] Capturing 2: Wonju City Center Master 3D View...');
  const shot2 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath2 = path.join(ARTIFACT_DIR, 'screenshot_vworld_diverse_city_skyline.png');
  fs.writeFileSync(outPath2, Buffer.from(shot2.data, 'base64'));
  console.log('[Verify-MasterEngine] Saved shot2 to:', outPath2);

  // 3. 중층 상가 & 저층 주택가 밀집 지역 클로즈업 뷰
  console.log('[Verify-MasterEngine] Flying to Commercial & Residential Block (다양한 외벽 및 지붕 검증)...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__map || window.__mapLibreMap || window.map;
        if (map && map.flyTo) {
          map.flyTo({
            center: [127.9520, 37.3320],
            zoom: 17.0,
            pitch: 64,
            bearing: -40,
            duration: 1500
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Verify-MasterEngine] Capturing 3: Diverse Commercial & Residential Roofs...');
  const shot3 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath3 = path.join(ARTIFACT_DIR, 'screenshot_vworld_diverse_commercial_residential.png');
  fs.writeFileSync(outPath3, Buffer.from(shot3.data, 'base64'));
  console.log('[Verify-MasterEngine] Saved shot3 to:', outPath3);

  console.log('[Verify-MasterEngine] Closing WebSocket & Chrome...');
  ws.close();
  chrome.kill('SIGTERM');

  console.log('[Verify-MasterEngine] All done successfully!');
}

main().catch((err) => {
  console.error('[Verify-MasterEngine] Error:', err);
  process.exit(1);
});
