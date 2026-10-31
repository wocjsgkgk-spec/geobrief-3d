/**
 * scripts/verify-vworld-real-facade.mjs
 *
 * [GeoBrief 3D 2단계: V-World 실사 포토 파사드 & 다중 건축 양식 실증 검증]
 * 1. 고층 아파트 단지: 크림 화이트/소프트 아이보리/샌드 베이지 + 발코니 십자 창호 + 측벽 브랜드 라인 + 지붕 3종
 * 2. 중·저층 시가지: 1층 쇼윈도 + 6대 소재(적벽돌, 파벽돌, 화강석, 징크, 콘크리트, 스타코) + 우레탄 45%/시멘트 35%/적갈색 20% 옥상
 * 3. 저층 주택: 3D 박공(Gabled) & 우진각(Hipped) 입체 지붕 메쉬
 * 4. 혁신도시 공공기관: 화강석 포디움 + 커튼월 본관 타워 + 옥상 헬리패드
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-P2] Cleaning up any leftover chrome on 9227...');
  try {
    spawn('pkill', ['-9', '-f', '9227']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-P2] Launching headless Chrome with WebGL on port 9227...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--user-data-dir=/tmp/chrome-vworld-p2-' + Date.now(),
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
    http.get('http://127.0.0.1:9227/json/list', (res) => {
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
  console.log('[Verify-P2] Connecting to CDP WebSocket:', pageWsUrl);

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
  console.log('[Verify-P2] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');

  console.log('[Verify-P2] Navigating to http://localhost:3110...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  // 맵 및 WebGL 리소스 초기화 대기 (10초)
  await new Promise((r) => setTimeout(r, 10000));

  // ---------------------------------------------------------------------------
  // Shot 1: 반곡동 혁신도시 고층 아파트 단지 (현진에버빌/반곡아이파크)
  // 크림 화이트/소프트 아이보리 외벽, 발코니 PVC 십자 창호, 측벽 브랜드 라인, 지붕 3종
  // ---------------------------------------------------------------------------
  console.log('[Verify-P2] Shot 1: Flying to Apartment Complex (Ban-gok Innovation City)...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__map || window.__mapLibreMap || window.map;
        if (map && map.flyTo) {
          map.flyTo({
            center: [127.9785, 37.3245],
            zoom: 16.5,
            pitch: 62,
            bearing: -22,
            duration: 1000
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 7000));

  console.log('[Verify-P2] Capturing Shot 1: Authentic V-World Apartment Complex...');
  const shot1 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath1 = path.join(ARTIFACT_DIR, 'screenshot_vworld_p2_apartment_facade.png');
  fs.writeFileSync(outPath1, Buffer.from(shot1.data, 'base64'));
  console.log('[Verify-P2] Saved Shot 1 to:', outPath1);

  // ---------------------------------------------------------------------------
  // Shot 2: 원주 시내 단구동/명륜동 중·저층 시가지 및 주거지
  // 1층 화강석 쇼윈도, 6대 외벽(적벽돌, 파벽돌, 화강석, 징크, 콘크리트, 스타코),
  // 우레탄 45% + 시멘트 35% + 적갈색 20% 옥상 & 0.9m 파라펫, 저층 3D 박공/우진각 지붕
  // ---------------------------------------------------------------------------
  console.log('[Verify-P2] Shot 2: Flying to Commercial & Residential Blocks (Dangu-dong)...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__map || window.__mapLibreMap || window.map;
        if (map && map.flyTo) {
          map.flyTo({
            center: [127.9480, 37.3380],
            zoom: 16.3,
            pitch: 58,
            bearing: 18,
            duration: 1000
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 7000));

  console.log('[Verify-P2] Capturing Shot 2: Diverse Commercial & Residential Blocks...');
  const shot2 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath2 = path.join(ARTIFACT_DIR, 'screenshot_vworld_p2_diverse_commercial.png');
  fs.writeFileSync(outPath2, Buffer.from(shot2.data, 'base64'));
  console.log('[Verify-P2] Saved Shot 2 to:', outPath2);

  // ---------------------------------------------------------------------------
  // Shot 3: 반곡동 혁신도시 공공기관 랜드마크 스카이라인
  // 심사평가원 110m 타워, 국민건강보험공단 86m 타워, 관광공사, 화강석 포디움 + 커튼월
  // ---------------------------------------------------------------------------
  console.log('[Verify-P2] Shot 3: Flying to Innovation City Public Landmarks (HIRA & NHIS)...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__map || window.__mapLibreMap || window.map;
        if (map && map.flyTo) {
          map.flyTo({
            center: [127.9745, 37.3290],
            zoom: 15.6,
            pitch: 52,
            bearing: -12,
            duration: 1000
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 7000));

  console.log('[Verify-P2] Capturing Shot 3: Innovation City Public Landmarks...');
  const shot3 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath3 = path.join(ARTIFACT_DIR, 'screenshot_vworld_p2_public_landmarks.png');
  fs.writeFileSync(outPath3, Buffer.from(shot3.data, 'base64'));
  console.log('[Verify-P2] Saved Shot 3 to:', outPath3);

  console.log('[Verify-P2] All 3 verification shots captured successfully! Terminating chrome...');
  try {
    chrome.kill('SIGTERM');
  } catch {}
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify-P2] Error:', err);
  process.exit(1);
});
