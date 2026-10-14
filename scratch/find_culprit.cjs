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
  console.log('Waiting 4s for app load...');
  await new Promise(r => setTimeout(r, 4000));

  // Let's inspect all layers currently in the map
  const inspect = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      const layers = m.getStyle().layers;
      return layers.map(l => ({ id: l.id, type: l.type, source: l.source }));
    })()`,
    returnByValue: true
  });
  console.log('Layers count:', inspect.result.value.length);

  // Now let's try removing all layers EXCEPT satellite-base-layer, and see if terrain shows!
  const testNoLayers = await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;
      const layers = m.getStyle().layers;
      const removed = [];
      for (const l of layers) {
        if (l.id !== 'satellite-base-layer' && l.id !== 'satellite-layer') {
          try {
            m.removeLayer(l.id);
            removed.push(l.id);
          } catch(e) {}
        }
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 2000));
      
      const c = m.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const p = new Uint8Array(4);
      gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return {
        removedCount: removed.length,
        centerRGBA: Array.from(p)
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('After removing all non-satellite layers:', testNoLayers.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_culprit_test.png', Buffer.from(shot.data, 'base64'));
  console.log('Screenshot saved, size:', fs.statSync('scratch/screenshot_culprit_test.png').size);

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
