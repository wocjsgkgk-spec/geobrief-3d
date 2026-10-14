const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_edge_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8080'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const msgId = id++;
    const handler = (evt) => {
      const d = JSON.parse(evt.data);
      if (d.id === msgId) {
        ws.removeEventListener('message', handler);
        res(d.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 4000));

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;
      function check() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      const log = [];
      log.push('Initial pixel: ' + check());

      // Remove only edge layers:
      const edgeLayers = [
        '3d-buildings-edge',
        'fusion-buildings-edge',
        'vworld-buildings-edge',
        'sample-buildings-edge',
        'fusion-buildings-ao'
      ];

      for (const id of edgeLayers) {
        try { m.removeLayer(id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 600));

      log.push('After removing ONLY edge layers: ' + check());
      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('EDGE TEST RESULT:\n', JSON.stringify(res.result.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_edge_test.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/screenshot_edge_test.png');

  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
