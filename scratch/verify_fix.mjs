import { spawn } from 'child_process';
import fs from 'fs';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_verify_fix',
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

const consoleErrors = [];
const consoleWarnings = [];
ws.addEventListener('message', (evt) => {
  const data = JSON.parse(evt.data);
  if (data.method === 'Runtime.consoleAPICalled') {
    const text = data.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
    if (data.params.type === 'error') {
      consoleErrors.push(text);
    } else if (data.params.type === 'warning') {
      consoleWarnings.push(text);
    }
  }
});

// Wait 5 seconds for initial rendering
await new Promise((r) => setTimeout(r, 5000));

const checkResult = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const map = window.__map;
      if (!map) return { error: 'no map' };

      const canvas = map.getCanvas();
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      
      // Sample pixels
      const centerPixel = new Uint8Array(4);
      gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, centerPixel);

      const groundPixel = new Uint8Array(4);
      gl.readPixels(300, 300, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, groundPixel);

      const overlay = document.getElementById('map-debug-overlay');
      const titleBlock = document.getElementById('cad-title-block');

      return {
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        centerPixel: Array.from(centerPixel),
        groundPixel: Array.from(groundPixel),
        isCenterBlack: centerPixel[0] === 0 && centerPixel[1] === 0 && centerPixel[2] === 0,
        isGroundBlack: groundPixel[0] === 0 && groundPixel[1] === 0 && groundPixel[2] === 0,
        overlayText: overlay ? overlay.innerText : 'no overlay',
        titleBlockVisible: titleBlock ? titleBlock.style.display !== 'none' : 'not rendered (collapsed)',
      };
    })()
  `,
  returnByValue: true
});

console.log('=== VERIFICATION RESULT ===');
console.log(JSON.stringify(checkResult.result.value, null, 2));

console.log('=== CONSOLE WARNINGS ===');
console.log(consoleWarnings.length > 0 ? consoleWarnings.join('\n') : '(none)');

console.log('=== CONSOLE ERRORS ===');
console.log(consoleErrors.length > 0 ? consoleErrors.join('\n') : '(none)');

// Take verified 1080p screenshot
const ss = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('scratch/verified_screenshot_1080p.png', Buffer.from(ss.data, 'base64'));
const stat = fs.statSync('scratch/verified_screenshot_1080p.png');
console.log('Verified screenshot saved to scratch/verified_screenshot_1080p.png, size:', stat.size);

ws.close();
chrome.kill();
