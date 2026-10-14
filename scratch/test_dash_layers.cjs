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
        return Array.from(p);
      }

      const log = [];
      log.push('Initial: ' + check());

      // 1. Remove ONLY drawing-temp-line
      try { m.removeLayer('drawing-temp-line'); } catch(e) {}
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 600));
      log.push('After removing ONLY drawing-temp-line: ' + check());

      // 2. Remove all layers with line-dasharray
      const dashLayers = m.getStyle().layers.filter(l => l.paint && l.paint['line-dasharray']);
      log.push('Remaining dash layers count: ' + dashLayers.length + ' (' + dashLayers.map(l=>l.id).join(', ') + ')');
      for (const l of dashLayers) {
        try { m.removeLayer(l.id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 600));
      log.push('After removing ALL dash layers: ' + check());

      return log;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('TEST DASH LAYERS:\n', JSON.stringify(res.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
