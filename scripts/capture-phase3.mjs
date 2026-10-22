import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function run() {
  console.log('[Capture Phase 3] Launching Chrome...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1680,1050',
    'http://localhost:3110',
  ]);

  await new Promise((r) => setTimeout(r, 2500));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9226/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((p) => p.type === 'page') || versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);

  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const timer = setTimeout(() => {
        callbacks.delete(msgId);
        resolve(null);
      }, 7000);

      callbacks.set(msgId, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
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

  // Wait 10 seconds for MapLibre and Three.js
  console.log('[Capture Phase 3] Waiting for 3D map load...');
  await new Promise((r) => setTimeout(r, 10000));

  // 1. Open 18 Regions Dropdown
  console.log('[Capture Phase 3] Opening 18 Regions Dropdown...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const btn = document.querySelector('button[title*="18개 시·군"]');
        if (btn) btn.click();
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 1200));

  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot1 && shot1.data) {
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'screenshot_phase3_gangwon_18_subregions_dropdown.png'),
      Buffer.from(shot1.data, 'base64')
    );
    console.log('[Capture Phase 3] Saved screenshot_phase3_gangwon_18_subregions_dropdown.png');
  }

  // 2. Trigger Cadastral 4-part analysis card
  console.log('[Capture Phase 3] Triggering 4-part cadastral analysis for 1st Logistics Depot...');
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

  await new Promise((r) => setTimeout(r, 3500));

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot2 && shot2.data) {
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'screenshot_phase3_4part_cadastral_report_active.png'),
      Buffer.from(shot2.data, 'base64')
    );
    console.log('[Capture Phase 3] Saved screenshot_phase3_4part_cadastral_report_active.png');
  }

  // 3. Evaluate Card text
  const evalCard = await send('Runtime.evaluate', {
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

  console.log('[Capture Phase 3] Card evaluation:', evalCard?.result?.value);

  ws.close();
  chrome.kill();
  console.log('[Capture Phase 3] Done!');
  process.exit(0);
}

run().catch((err) => {
  console.error('[Capture Phase 3] Error:', err);
  process.exit(1);
});
