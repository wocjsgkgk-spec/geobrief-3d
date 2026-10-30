/**
 * scripts/capture-phase3-clean-architecture.mjs
 *
 * [GeoBrief 3D 3단계] 아키텍처 클린업, 좌표 정밀 보정, UI/UX 슬림화 & 60fps 마감 실증 캡처
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Capture-Phase3] Cleaning any leftover chrome on 9225...');
  try {
    spawn('pkill', ['-9', '-f', '9225']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Capture-Phase3] Launching headless Chrome with WebGL on port 9225...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9225',
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
  console.log('[Capture-Phase3] Connecting to CDP WebSocket:', pageWsUrl);

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
  console.log('[Capture-Phase3] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');

  console.log('[Capture-Phase3] Navigating to http://localhost:3110...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  // 페이지 로드 대기
  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Capture-Phase3] Initial page loaded, configuring view state...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const store = window.__useMapStore || window.useMapStore;
        if (store && store.getState) {
          const s = store.getState();
          s.selectRegion('wonju');
          s.selectIdleSite('first-logistics-wonju');
          if (s.setRenderMode3D) s.setRenderMode3D('facade');
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 4000));

  console.log('[Capture-Phase3] Capturing 1: Clean Architecture with Slim Glassmorphism UI...');
  const shot1 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath1 = path.join(ARTIFACT_DIR, 'screenshot_phase3_clean_architecture_60fps.png');
  fs.writeFileSync(outPath1, Buffer.from(shot1.data, 'base64'));
  console.log('[Capture-Phase3] Saved shot1 to:', outPath1);

  // 패널 숨김 토글 후 풀스크린 3D 뷰 캡처
  console.log('[Capture-Phase3] Toggling sidebar collapse to fullscreen 3D view...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (function() {
        const store = window.__useMapStore || window.useMapStore;
        if (store && store.getState) {
          store.getState().toggleSidebarCollapse();
          window.dispatchEvent(new Event('resize'));
        }
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 2000));

  console.log('[Capture-Phase3] Capturing 2: Fullscreen 3D View with Hidden Sidebar...');
  const shot2 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const outPath2 = path.join(ARTIFACT_DIR, 'screenshot_phase3_fullscreen_3d_view.png');
  fs.writeFileSync(outPath2, Buffer.from(shot2.data, 'base64'));
  console.log('[Capture-Phase3] Saved shot2 to:', outPath2);

  console.log('[Capture-Phase3] Closing WebSocket & Chrome...');
  ws.close();
  chrome.kill('SIGTERM');

  console.log('[Capture-Phase3] All done successfully!');
}

main().catch((err) => {
  console.error('[Capture-Phase3] Error:', err);
  process.exit(1);
});
