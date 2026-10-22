import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 3 Verify] Launching headless Chrome with SwiftShader...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1680,1050',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Phase 3 Verify] Connecting to CDP WebSocket:', wsUrl);

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

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      cb(msg.result);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Phase 3 Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  // Wait 10 seconds for initial render
  console.log('[Phase 3 Verify] Waiting for map render...');
  await new Promise((r) => setTimeout(r, 10000));

  // Screenshot 1: Header with Search Bar and 3D buildings
  console.log('[Phase 3 Verify] Taking Screenshot 1...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const file1 = path.join(ARTIFACT_DIR, 'screenshot_phase3_header_search_and_3d.png');
  fs.writeFileSync(file1, Buffer.from(shot1.data, 'base64'));
  console.log('[Phase 3 Verify] Saved Screenshot 1 to:', file1);

  // 2. Open [📍 분석 대상지] dropdown
  console.log('[Phase 3 Verify] Opening [📍 분석 대상지] 18 Regions dropdown...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const btn = document.querySelector('button[title*="18개 시·군"]');
        if (btn) btn.click();
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 1200));

  console.log('[Phase 3 Verify] Taking Screenshot 2 (18 Regions Dropdown)...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const file2 = path.join(ARTIFACT_DIR, 'screenshot_phase3_gangwon_18_subregions_dropdown.png');
  fs.writeFileSync(file2, Buffer.from(shot2.data, 'base64'));
  console.log('[Phase 3 Verify] Saved Screenshot 2 to:', file2);

  // 3. Trigger 4-part cadastral analysis
  console.log('[Phase 3 Verify] Triggering continuous cadastral & zoning & building 4-part analysis...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const hdr = document.querySelector('header');
        if (hdr) hdr.click();

        window.dispatchEvent(new CustomEvent('gangwon-search-select', {
          detail: {
            id: 'site-wj-1st-logistics',
            title: '제1군수지원사령부(1군지사) 이전 유휴부지',
            coords: [127.9389, 37.3653],
            regionId: 'wonju',
            regionName: '원주시'
          }
        }));
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 4000));

  console.log('[Phase 3 Verify] Taking Screenshot 3 (4-part Report Card & Neon Parcel)...');
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const file3 = path.join(ARTIFACT_DIR, 'screenshot_phase3_4part_cadastral_report_active.png');
  fs.writeFileSync(file3, Buffer.from(shot3.data, 'base64'));
  console.log('[Phase 3 Verify] Saved Screenshot 3 to:', file3);

  // 4. Verify report card DOM contents
  const reportEval = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const card = document.getElementById('cadastral-analysis-card');
        return {
          hasCard: !!card,
          text: card ? card.innerText : null
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Phase 3 Verify] Report Card Evaluation:', reportEval?.result?.value?.hasCard);
  if (reportEval?.result?.value?.text) {
    console.log('[Phase 3 Verify] Report Card Text:\n', reportEval.result.value.text.substring(0, 300));
  }

  ws.close();
  chrome.kill();
  console.log('[Phase 3 Verify] Finished successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Phase 3 Verify] Error:', err);
  process.exit(1);
});
