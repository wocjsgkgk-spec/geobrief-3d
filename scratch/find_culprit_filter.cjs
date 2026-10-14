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
      function check() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return p[0] > 0 || p[1] > 0 || p[2] > 0;
      }

      const allLayers = m.getStyle().layers.slice();
      // Remove all except satellite-base-layer
      for (const l of allLayers) {
        if (l.id !== 'satellite-base-layer') {
          try { m.removeLayer(l.id); } catch(e) {}
        }
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 400));
      const initialOK = check();

      const brokenLayers = [];
      const okLayers = [];

      for (const l of allLayers) {
        if (l.id === 'satellite-base-layer') continue;
        try {
          m.addLayer(l);
          m.triggerRepaint();
          if (!check()) {
            // Turned black!
            brokenLayers.push({ id: l.id, type: l.type, source: l.source });
            m.removeLayer(l.id);
            m.triggerRepaint();
          } else {
            okLayers.push(l.id);
          }
        } catch(e) {
          brokenLayers.push({ id: l.id, error: e.message });
        }
      }

      return {
        initialOK,
        okCount: okLayers.length,
        brokenCount: brokenLayers.length,
        brokenLayers
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('RESULT:\n', JSON.stringify(res.result.value, null, 2));

  // Take screenshot with all OK layers
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_with_ok_layers.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot_with_ok_layers.png');

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
