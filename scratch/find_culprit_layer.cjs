const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9224',
    '--user-data-dir=/tmp/cdp_culprit_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2500));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8080'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!target) { console.log('Target not found'); process.exit(1); }

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
      function getPixel() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      const allLayers = m.getStyle().layers.map(l => l.id);
      const results = [];

      // Test removing layers one by one or groups
      // Let's see: if we remove layers from the bottom up or top down
      for (const layerId of allLayers) {
        if (layerId === 'satellite-base-layer') continue;
        try {
          m.removeLayer(layerId);
          m.triggerRepaint();
          await new Promise(r => setTimeout(r, 50));
          const p = getPixel();
          if (p[0] > 10 || p[1] > 10 || p[2] > 10) {
            return {
              recoveringLayer: layerId,
              pixelAfterRemoval: p,
              remainingLayers: m.getStyle().layers.map(l => l.id)
            };
          }
        } catch (e) {
          console.error(e);
        }
      }
      return { recoveringLayer: null, finalPixel: getPixel() };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('CULPRIT RESULT:', JSON.stringify(result.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}
test();
