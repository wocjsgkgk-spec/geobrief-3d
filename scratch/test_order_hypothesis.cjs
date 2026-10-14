const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_order_' + Date.now(),
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

      // Save definitions of all layers
      const savedLayers = JSON.parse(JSON.stringify(m.getStyle().layers));
      const keep = ['satellite-base-layer', 'roads-asphalt-casing', 'roads-asphalt-inner', '3d-buildings', '3d-buildings-roof'];
      const toTest = savedLayers.filter(l => !keep.includes(l.id));

      // Remove all except keep
      for (const l of toTest) {
        try { m.removeLayer(l.id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 500));

      const log = [];
      log.push('Baseline: ' + check());

      // Add back one by one, BUT placing 2D drape layers BEFORE '3d-buildings'!
      for (const layerDef of toTest) {
        try {
          const beforeId = (layerDef.type === 'line' || layerDef.type === 'fill' || layerDef.type === 'raster')
            ? '3d-buildings'
            : undefined;

          m.addLayer(layerDef, beforeId);
          m.triggerRepaint();
          await new Promise(r => setTimeout(r, 60));
          const p = check();
          if (p[0] === 0 && p[1] === 0 && p[2] === 0) {
            log.push('*** BLACK SCREEN TRIGGERED BY: ' + layerDef.id + ' (beforeId: ' + beforeId + ') ***');
            m.removeLayer(layerDef.id);
            m.triggerRepaint();
          } else {
            log.push('Layer OK: ' + layerDef.id + ' (beforeId: ' + beforeId + ')');
          }
        } catch(e) {
          log.push('Error adding ' + layerDef.id + ': ' + e.message);
        }
      }

      log.push('Final pixel check: ' + check());
      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('ORDER HYPOTHESIS RESULT:\n', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
