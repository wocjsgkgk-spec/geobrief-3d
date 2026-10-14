const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9238',
    '--user-data-dir=/tmp/cdp_sc_live_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9238/json/list');
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
  await new Promise(r => setTimeout(r, 3500));

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;

      // 1. Set non-essential layers visibility to none
      const essential = [
        'satellite-base-layer',
        'roads-asphalt-casing',
        'roads-asphalt-inner',
        '3d-buildings',
        '3d-buildings-roof',
        'vworld-cadastral-layer',
        'clean-layer',
        'dmz-buffer-fill',
        'ccl-line-layer',
        'mdl-line-layer',
        'slope-analysis-fill',
        'smart-city-complex-3d-layer',
        'lod2-building-engine-layer',
        'threebox-building-layer'
      ];
      const all = m.getStyle().layers;
      for (const l of all) {
        if (!essential.includes(l.id)) {
          try {
            m.setLayoutProperty(l.id, 'visibility', 'none');
          } catch(e) {}
        }
      }

      // 2. Fly camera to Wonju 1st Logistics Depot: [127.9358, 37.3592]
      m.jumpTo({
        center: [127.9358, 37.3592],
        zoom: 16.2,
        pitch: 60,
        bearing: 30
      });

      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 1200));

      const c = m.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const p = new Uint8Array(4);
      gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);

      return {
        center: m.getCenter(),
        pixel: Array.from(p),
        layers: m.getStyle().layers.map(l => l.id)
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('WONJU SMART CITY RESULT:\n', JSON.stringify(res.result.value, null, 2));

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/shot_wonju_smartcity.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/shot_wonju_smartcity.png');

  chrome.kill();
  process.exit(0);
}
test();
