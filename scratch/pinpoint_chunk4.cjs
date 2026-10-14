const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--disable-web-security',
    '--user-data-dir=/tmp/cdp_pinpoint_test_' + Date.now(),
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
      
      const chunk4 = [
        "tie-line-glow","tie-line-dash","tie-line-point-glow","tie-line-point-core",
        "drawing-temp-line","drawing-temp-points",
        "3d-buildings","3d-buildings-roof","3d-buildings-edge",
        "vworld-buildings-3d","vworld-buildings-roof","vworld-buildings-edge",
        "fusion-buildings-3d","fusion-buildings-roof","fusion-buildings-edge",
        "sample-buildings-3d","sample-buildings-roof","sample-buildings-edge"
      ];

      // Remove chunks 1, 2, 3 so only satellite + chunk 4 are left
      const initialLayers = m.getStyle().layers.map(l => l.id).filter(id => id !== 'satellite-base-layer');
      const toRemove = initialLayers.filter(id => !chunk4.includes(id));
      for (const id of toRemove) {
        try { m.removeLayer(id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 400));

      function check() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      const log = [];
      log.push('With chunk4 only: ' + check());

      // Now remove layers in chunk4 ONE BY ONE from the end
      for (let i = chunk4.length - 1; i >= 0; i--) {
        const id = chunk4[i];
        try { m.removeLayer(id); } catch(e) {}
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 300));
        const p = check();
        log.push('Removed ' + id + ': ' + p);
        if (p[0] > 0 || p[1] > 0 || p[2] > 0) {
          log.push('CULPRIT IDENTIFIED: Removing "' + id + '" fixed the screen!');
          break;
        }
      }

      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('CHUNK 4 PINPOINT:\n', JSON.stringify(res.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
