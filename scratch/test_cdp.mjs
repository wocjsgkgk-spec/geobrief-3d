import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_test',
  'http://127.0.0.1:8080'
]);

await new Promise((r) => setTimeout(r, 2000));

try {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  console.log('Targets:', list);
  const target = list.find((t) => t.url.includes('8080'));
  if (!target) {
    console.error('No target found');
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
  console.log('Connected to WebSocket!');

  ws.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      console.log(`[BROWSER CONSOLE ${data.params.type.toUpperCase()}]`, args);
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', JSON.stringify(data.params.exceptionDetails));
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');

  console.log('Waiting 5s for page execution and console logs...');
  await new Promise((r) => setTimeout(r, 5000));

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  if (screenshot && screenshot.data) {
    writeFileSync('scratch/screenshot.png', Buffer.from(screenshot.data, 'base64'));
    console.log('Saved scratch/screenshot.png');
  }

  // Get debug errors text from DOM if present
  const evalRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const overlay = document.getElementById('map-debug-overlay');
        const canvas = document.querySelector('canvas');
        return {
          overlayText: overlay ? overlay.innerText : null,
          hasCanvas: !!canvas,
          canvasWidth: canvas ? canvas.width : 0,
          canvasHeight: canvas ? canvas.height : 0
        };
      })()
    `,
    returnByValue: true
  });
  console.log('DOM Evaluation:', evalRes.result?.value);

} catch (err) {
  console.error('CDP Error:', err);
} finally {
  chrome.kill();
  process.exit(0);
}
