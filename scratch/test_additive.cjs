const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9229',
    '--user-data-dir=/tmp/cdp_add_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9229/json/list');
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

  const evalRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;
      function getPixel() {
        const c = m.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const p = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p);
      }

      const initialLayers = m.getStyle().layers;

      // 1. First, strip down to the known working essential layers:
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

      const savedDefs = {};
      for (const l of initialLayers) {
        savedDefs[l.id] = l;
        if (!essential.includes(l.id)) {
          try { m.removeLayer(l.id); } catch(e) {}
        }
      }
      m.triggerRepaint();
      await new Promise(r => setTimeout(r, 400));
      const baselinePixel = getPixel();

      // 2. Now test adding back each removed layer ONE BY ONE before '3d-buildings':
      const nonEssential = initialLayers.filter(l => !essential.includes(l.id));
      const breakingLayers = [];

      for (const l of nonEssential) {
        try {
          // Add before '3d-buildings' if it's 2D, or after if it's 3D
          if (l.type === 'fill-extrusion' || l.type === 'custom') {
            m.addLayer(savedDefs[l.id]);
          } else {
            m.addLayer(savedDefs[l.id], '3d-buildings');
          }
          m.triggerRepaint();
          await new Promise(r => setTimeout(r, 60));
          const p = getPixel();
          if (p[0] === 0 && p[1] === 0 && p[2] === 0) {
            breakingLayers.push({ id: l.id, type: l.type });
            // remove it immediately to test next
            m.removeLayer(l.id);
            m.triggerRepaint();
            await new Promise(r => setTimeout(r, 60));
          }
        } catch(err) {
          breakingLayers.push({ id: l.id, type: l.type, error: err.message });
        }
      }

      return {
        baselinePixel,
        breakingLayers,
        totalTested: nonEssential.length
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('ADDITIVE TEST RESULT:\n', JSON.stringify(evalRes.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}
test();
