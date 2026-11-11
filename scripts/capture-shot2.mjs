/**
 * scripts/capture-shot2.mjs
 * Captures screenshot_stage2_no_fake_buildings.png
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';
const PORT = 3000;
const CDP_PORT = 9227;

async function main() {
  console.log('[Shot2] Killing any leftover chrome on', CDP_PORT);
  try {
    spawn('pkill', ['-9', '-f', String(CDP_PORT)]);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Shot2] Launching headless Chrome on port', CDP_PORT);
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
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
    http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget =
    versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') ||
    versionData.find((t) => t.type === 'page') ||
    versionData[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

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
  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');

  console.log(`[Shot2] Navigating to http://localhost:${PORT} ...`);
  await sendCmd('Page.navigate', { url: `http://localhost:${PORT}` });

  console.log('[Shot2] Waiting 12s for initial load...');
  await new Promise((r) => setTimeout(r, 12000));

  console.log('[Shot2] Flying to Forest & Ridge boundary...');
  await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map || window.map;
        if (map) {
          map.flyTo({
            center: [127.9420, 37.3530],
            zoom: 16.4,
            pitch: 60,
            bearing: -40,
            duration: 0
          });
        }
      })()
    `,
  });

  console.log('[Shot2] Waiting 6s for render stabilization...');
  await new Promise((r) => setTimeout(r, 6000));

  console.log('[Shot2] Capturing screenshot 2...');
  const shot2 = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const file2 = path.join(ARTIFACT_DIR, 'screenshot_stage2_no_fake_buildings.png');
  fs.writeFileSync(file2, Buffer.from(shot2.data, 'base64'));
  console.log('[Shot2] Saved to:', file2);

  ws.close();
  try {
    chrome.kill('SIGKILL');
  } catch {}
  console.log('[Shot2] Done!');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
