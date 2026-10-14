const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_bin_' + Date.now(),
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
      const keep = ['satellite-base-layer', 'roads-asphalt-casing', 'roads-asphalt-inner', '3d-buildings', '3d-buildings-roof'];
      let candidates = allLayers.filter(id => !keep.includes(id));

      const log = [];
      log.push('Initial pixel: ' + check());

      // We test removing halves
      // If removing group A turns pixel into color, then the culprit is in group A!
      // Otherwise, the culprit is in group B.
      while (candidates.length > 1) {
        const mid = Math.floor(candidates.length / 2);
        const halfA = candidates.slice(0, mid);
        const halfB = candidates.slice(mid);

        // Try removing halfA
        for (const id of halfA) {
          try { m.removeLayer(id); } catch(e) {}
        }
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 300));
        const p = check();
        log.push('Removed ' + halfA.length + ' layers (half A): pixel=' + p);

        if (p[0] > 0 || p[1] > 0 || p[2] > 0) {
          // Culprit was in halfA!
          log.push('Culprit is in half A (' + halfA.length + ' layers): ' + JSON.stringify(halfA));
          candidates = halfA;
          break; // Let us check one by one in halfA
        } else {
          // Culprit is in halfB
          log.push('Pixel still black, culprit is in half B (' + halfB.length + ' layers)');
          candidates = halfB;
        }
      }

      // Now test the remaining candidates one by one
      for (const id of candidates) {
        try { m.removeLayer(id); } catch(e) {}
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 300));
        const p = check();
        log.push('Removed ' + id + ': pixel=' + p);
        if (p[0] > 0 || p[1] > 0 || p[2] > 0) {
          log.push('*** THE CULPRIT IS DEFINITIVELY: ' + id + ' ***');
          break;
        }
      }

      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('BINARY SEARCH RESULT:\n', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
