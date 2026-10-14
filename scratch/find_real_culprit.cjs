const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9222', '--disable-web-security', '--window-size=1920,1080'
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });

  await new Promise(r => setTimeout(r, 4000));

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;
      
      const renderFrame = () => new Promise(resolve => {
        m.triggerRepaint();
        m.once('render', () => setTimeout(resolve, 50));
      });

      function checkCenter() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(Math.floor(c.width * 0.7), Math.floor(c.height * 0.5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      const allLayers = m.getStyle().layers.slice();
      
      // Step 1: Baseline with only satellite-base-layer
      for (const l of allLayers) {
        if (l.id !== 'satellite-base-layer') {
          try { m.removeLayer(l.id); } catch(e) {}
        }
      }
      await renderFrame();
      await new Promise(r => setTimeout(r, 300));
      const baseline = checkCenter();

      // Step 2: Test groups
      const brokenLayers = [];
      for (const l of allLayers) {
        if (l.id === 'satellite-base-layer') continue;
        try {
          m.addLayer(l);
          await renderFrame();
          const pix = checkCenter();
          if (pix[0] === 0 && pix[1] === 0 && pix[2] === 0) {
            brokenLayers.push({ id: l.id, type: l.type, source: l.source });
            m.removeLayer(l.id);
            await renderFrame();
          }
        } catch(e) {
          brokenLayers.push({ id: l.id, error: e.message });
        }
      }

      return {
        baseline,
        brokenCount: brokenLayers.length,
        brokenLayers
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('REAL CULPRIT RESULT:\n', JSON.stringify(res.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
