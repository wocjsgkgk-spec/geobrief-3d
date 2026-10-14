const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_diag_' + Date.now(),
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

      const allLayers = m.getStyle().layers.map(l => l.id);
      const log = [];
      log.push('Initial pixel: ' + check());
      log.push('Total layers: ' + allLayers.length);

      // What if we remove all layers EXCEPT satellite-base-layer, roads, and 3d-buildings?
      const keep = ['satellite-base-layer', 'roads-asphalt-casing', 'roads-asphalt-inner', '3d-buildings', '3d-buildings-roof'];
      const toRemove = allLayers.filter(id => !keep.includes(id));

      for (const id of toRemove) {
        try { m.removeLayer(id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 600));

      const pKeep = check();
      log.push('After removing all except keep layers: ' + pKeep);

      // Also check terrain
      log.push('Terrain: ' + JSON.stringify(m.getTerrain()));

      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('DIAGNOSE RESULT:\n', JSON.stringify(res.result.value, null, 2));

  // Take screenshot after removing extra layers
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_after_keep.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/screenshot_after_keep.png');

  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
