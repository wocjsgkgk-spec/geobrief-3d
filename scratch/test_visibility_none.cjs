const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9237',
    '--user-data-dir=/tmp/cdp_visnone_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9237/json/list');
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
      function getPixel() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      // Keep essential layers visible, set ALL OTHER layers to visibility: 'none'
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
        'slope-analysis-fill'
      ];

      const all = m.getStyle().layers;
      for (const l of all) {
        if (!essential.includes(l.id)) {
          try {
            m.setLayoutProperty(l.id, 'visibility', 'none');
          } catch(e) {}
        }
      }

      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 800));

      return {
        pixelWithVisibilityNone: getPixel(),
        totalLayers: m.getStyle().layers.length
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('VISIBILITY NONE RESULT:\n', JSON.stringify(res.result.value, null, 2));

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/shot_vis_none.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/shot_vis_none.png');

  chrome.kill();
  process.exit(0);
}
test();
