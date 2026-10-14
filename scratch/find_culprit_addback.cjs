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

  const result = await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;
      
      function checkPixel() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      // Instead of removing, let's keep ONLY satellite-base-layer, and ADD back layers one by one!
      const initialLayers = m.getStyle().layers.slice();
      for (const l of initialLayers) {
        if (l.id !== 'satellite-base-layer') {
          try { m.removeLayer(l.id); } catch(e) {}
        }
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 300));
      
      const baseline = checkPixel();
      const culprits = [];

      for (const l of initialLayers) {
        if (l.id === 'satellite-base-layer') continue;
        try {
          m.addLayer(l);
          m.triggerRepaint();
          const pix = checkPixel();
          if (pix[0] === 0 && pix[1] === 0 && pix[2] === 0) {
            culprits.push({ id: l.id, type: l.type, source: l.source });
            m.removeLayer(l.id); // remove it so we can test the rest
          }
        } catch(e) {
          culprits.push({ id: l.id, error: e.message });
        }
      }

      return {
        baseline,
        culprits
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('ADDING BACK ONE BY ONE RESULT:', JSON.stringify(result.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
