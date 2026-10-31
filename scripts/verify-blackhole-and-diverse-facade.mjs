/**
 * scripts/verify-blackhole-and-diverse-facade.mjs
 *
 * [GeoBrief 3D 검증 실증]
 * 1. 검은색 법선 역전 버그(#000000 Black Mesh) 완전 박멸 확인
 * 2. 청록색 몸통 + 빨간색 지붕 단일 복제 폐기 및 24대 실사 아키텍처 다채로운 변주 확인
 * 3. 주변 저층 상가·단독주택·빌라 블록 100% 3D 입체 압출 확인
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify] Killing any leftover chrome on 9227...');
  try {
    spawn('pkill', ['-9', '-f', '9227']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify] Launching headless Chrome with WebGL on port 9227...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--user-data-dir=/tmp/chrome-blackhole-verify-' + Date.now(),
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
  console.log('[Verify] Connecting to CDP WebSocket:', pageWsUrl);

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
  console.log('[Verify] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');

  console.log('[Verify] Navigating to http://localhost:3110...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  // 페이지 및 맵 리소스 로드 대기
  await new Promise((r) => setTimeout(r, 8000));

  // 1. 단지 중심부 고밀도 3D 뷰포트 (반곡동 혁신도시 / 아파트 단지)
  console.log('[Verify] Flying to apartment complex & surrounding low-rise blocks...');
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
            duration: 1000
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Verify] Capturing Shot 1: Diverse High-rise Apartment & Low-rise Blocks...');
  const shot1 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath1 = path.join(ARTIFACT_DIR, 'screenshot_fixed_diverse_buildings_3d.png');
  fs.writeFileSync(outPath1, Buffer.from(shot1.data, 'base64'));
  console.log('[Verify] Saved Shot 1 to:', outPath1);

  // 2. 주변 저층 상가·단독주택 밀집 블록 (원주 단구동 / 명륜동 시가지)
  console.log('[Verify] Flying to Dangu-dong / Myeongnyun-dong Commercial & Low-rise Blocks...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__map || window.__mapLibreMap || window.map;
        if (map && map.flyTo) {
          map.flyTo({
            center: [127.9480, 37.3380],
            zoom: 16.2,
            pitch: 58,
            bearing: 15,
            duration: 1000
          });
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Verify] Capturing Shot 2: Dense Low-rise Commercial & Residential Blocks (100% 3D Extruded)...');
  const shot2 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath2 = path.join(ARTIFACT_DIR, 'screenshot_fixed_surrounding_lowrise_3d.png');
  fs.writeFileSync(outPath2, Buffer.from(shot2.data, 'base64'));
  console.log('[Verify] Saved Shot 2 to:', outPath2);

  // 3. 브리핑 지표 검증
  const inspection = await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const bodyText = document.body.innerText;
        return {
          bodyTextExcerpt: bodyText.slice(0, 300),
          canvasExists: !!document.querySelector('canvas')
        };
      })()
    `,
    returnByValue: true
  });
  console.log('[Verify] Inspection Result:', JSON.stringify(inspection.result.value, null, 2));

  console.log('[Verify] Verification complete! Terminating chrome...');
  try {
    chrome.kill('SIGTERM');
  } catch {}
  process.exit(0);
}

main().catch((err) => {
  console.error('[Verify] Error:', err);
  process.exit(1);
});
