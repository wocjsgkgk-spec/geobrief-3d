import { spawn } from 'child_process';
import fs from 'fs';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_live_check',
  'http://127.0.0.1:8080'
]);

await new Promise((r) => setTimeout(r, 2000));
const res = await fetch('http://127.0.0.1:9222/json/list');
const list = await res.json();
const target = list.find((t) => t.url.includes('8080'));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 1;
const send = (method, params = {}) => {
  return new Promise((resolve) => {
    const msgId = id++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === msgId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
};

await send('Page.enable');
await send('Runtime.enable');

const warnings = [];
const errors = [];
ws.addEventListener('message', (evt) => {
  const data = JSON.parse(evt.data);
  if (data.method === 'Runtime.consoleAPICalled') {
    const text = data.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
    if (data.params.type === 'error') errors.push(text);
    if (data.params.type === 'warning') warnings.push(text);
  }
});

await new Promise((r) => setTimeout(r, 4000));

const evalRes = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const map = window.__map;
      if (!map) return { err: 'no map' };
      const canvas = map.getCanvas();
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

      const terrain = map.getTerrain ? map.getTerrain() : null;
      const overlay = document.getElementById('map-debug-overlay');
      const titleBlock = document.getElementById('cad-title-block');

      return {
        terrain,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        satTilesLoaded: map.style.tileManagers['satellite-tiles'] ? map.style.tileManagers['satellite-tiles']._inViewTiles._tiles ? Object.keys(map.style.tileManagers['satellite-tiles']._inViewTiles._tiles).length : 0 : 0,
        overlayText: overlay ? overlay.innerText : 'none',
        titleBlockState: titleBlock ? (titleBlock.style.display !== 'none' ? 'visible' : 'hidden') : 'collapsed',
      };
    })()
  `,
  returnByValue: true
});

console.log('=== LIVE TEST RESULTS ===');
console.log(JSON.stringify(evalRes.result.value, null, 2));

console.log('=== CONSOLE WARNINGS ===');
console.log(warnings.length > 0 ? warnings.join('\n') : '(none)');

console.log('=== CONSOLE ERRORS ===');
console.log(errors.length > 0 ? errors.join('\n') : '(none)');

// Screenshot
const ss = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('scratch/live_screenshot_1080p.png', Buffer.from(ss.data, 'base64'));
const stat = fs.statSync('scratch/live_screenshot_1080p.png');
console.log('Saved scratch/live_screenshot_1080p.png, size:', stat.size);

ws.close();
chrome.kill();
