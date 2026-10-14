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

      const originalLayers = m.getStyle().layers.slice();
      const types = ['fill-extrusion', 'fill', 'raster', 'line', 'custom', 'circle', 'symbol'];
      const results = {};

      for (const t of types) {
        // Remove only this type
        const matching = originalLayers.filter(l => l.type === t && l.id !== 'satellite-base-layer');
        for (const l of matching) {
          try { m.removeLayer(l.id); } catch(e) {}
        }
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 400));
        results['without_' + t] = check();

        // Restore
        for (const l of matching) {
          try { m.addLayer(l); } catch(e) {}
        }
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 200));
      }

      // Also test cumulative combinations:
      // fill + fill-extrusion
      const fills = originalLayers.filter(l => (l.type === 'fill' || l.type === 'fill-extrusion') && l.id !== 'satellite-base-layer');
      for (const l of fills) {
        try { m.removeLayer(l.id); } catch(e) {}
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 400));
      results['without_all_fills_and_extrusions'] = check();

      return results;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('RESULTS:', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
