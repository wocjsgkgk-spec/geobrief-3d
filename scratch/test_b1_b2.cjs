const http = require('http');
const { spawn } = require('child_process');

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
      function check() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return p[0] > 0 || p[1] > 0 || p[2] > 0;
      }

      const b1 = [
        "viewshed-visible-line", "viewshed-hidden-fill", "viewshed-hidden-line", "viewshed-origin-circle",
        "measure-line-glow", "measure-line-main", "measure-points-circle", "tactical-arrows-fill",
        "tactical-arrows-line", "cut-fill-grid-fill", "cut-fill-grid-line", "flight-envelope-volume",
        "flight-ceiling-slab", "flight-ceiling-border", "building-mass-extrusion", "building-mass-edges",
        "building-highlight-fill", "building-highlight-edge", "handler-stem-line", "handler-center-point", "handler-rotate-point"
      ];

      const b2 = [
        "tie-line-glow", "tie-line-dash", "tie-line-point-glow", "tie-line-point-core", "drawing-temp-line",
        "drawing-temp-points", "3d-buildings", "3d-buildings-roof", "3d-buildings-edge", "vworld-buildings-3d",
        "vworld-buildings-roof", "vworld-buildings-edge", "fusion-buildings-3d", "fusion-buildings-roof",
        "fusion-buildings-edge", "sample-buildings-3d", "sample-buildings-roof", "sample-buildings-edge"
      ];

      const log = [];

      // Test 1: Remove ONLY B2
      for (const id of b2) {
        try { m.removeLayer(id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 500));
      log.push('After removing ONLY B2: ' + check());

      // Test 2: Also remove B1
      for (const id of b1) {
        try { m.removeLayer(id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 500));
      log.push('After removing BOTH B1 and B2: ' + check());

      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('B1 / B2 RESULT:\n', JSON.stringify(res.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
