const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_single_' + Date.now(),
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
      log.push('Initial: ' + check());

      // Test 1: Remove drawing-temp-line only
      try { m.removeLayer('drawing-temp-line'); } catch(e) {}
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 500));
      log.push('After removing ONLY drawing-temp-line: ' + check());

      // Test 2: If still black, what if we remove all fill-extrusions?
      const extrusions = m.getStyle().layers.filter(l => l.type === 'fill-extrusion').map(l => l.id);
      log.push('Extrusion layers: ' + JSON.stringify(extrusions));

      for (const id of extrusions) {
        try { m.removeLayer(id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 500));
      log.push('After removing ALL fill-extrusions: ' + check());

      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('RESULT:\n', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
