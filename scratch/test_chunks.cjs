const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9222', '--disable-web-security', '--window-size=1600,900'
  ]);
  await new Promise(r => setTimeout(r, 1500));
  const target = await new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: '/json/new?http://127.0.0.1:8080', method: 'PUT' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    });
    req.end();
  });
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
      const initialLayers = m.getStyle().layers.map(l => l.id).filter(id => id !== 'satellite-base-layer');

      // Let's test removing chunks:
      // Chunk 1: first 20 layers
      // Chunk 2: next 20 layers
      // Chunk 3: next 20 layers
      // Chunk 4: rest
      const chunks = [
        initialLayers.slice(0, 20),
        initialLayers.slice(20, 40),
        initialLayers.slice(40, 60),
        initialLayers.slice(60)
      ];

      function check() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      const log = [];
      log.push('Initial: ' + check());

      for (let i = 0; i < chunks.length; i++) {
        for (const id of chunks[i]) {
          try { m.removeLayer(id); } catch(e) {}
        }
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 600));
        const p = check();
        log.push('After removing chunk ' + (i+1) + ' (total ' + (chunks.slice(0, i+1).reduce((a,c) => a + c.length, 0)) + ' removed): ' + p);
        if (p[0] > 0 || p[1] > 0 || p[2] > 0) {
          log.push('TURNING POINT AT CHUNK ' + (i+1) + '! Layers in this chunk: ' + JSON.stringify(chunks[i]));
          break;
        }
      }

      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('CHUNKS TEST:\n', JSON.stringify(res.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
