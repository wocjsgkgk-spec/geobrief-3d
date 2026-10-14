import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_1080p',
  'http://127.0.0.1:8080'
]);

await new Promise((r) => setTimeout(r, 2000));

try {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  const target = list.find((t) => t.url.includes('8080'));
  if (!target) {
    chrome.kill();
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
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

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');

  await new Promise((r) => setTimeout(r, 6000));

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  if (screenshot && screenshot.data) {
    writeFileSync('scratch/screenshot_1080p.png', Buffer.from(screenshot.data, 'base64'));
    console.log('Saved scratch/screenshot_1080p.png');
  }
} finally {
  chrome.kill();
  process.exit(0);
}
