const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9226',
    '--user-data-dir=/tmp/cdp_tool_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9226/json/list');
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

      const toolLayers = [
        'drawing-polygon-fill',
        'drawing-polygon-line',
        'drawing-polygon-points',
        'slope-analysis-line',
        'viewshed-visible-fill',
        'viewshed-visible-line',
        'viewshed-hidden-fill',
        'viewshed-hidden-line',
        'viewshed-origin-circle',
        'measure-line-glow',
        'measure-line-main',
        'measure-points-circle',
        'tactical-arrows-fill',
        'tactical-arrows-line',
        'cut-fill-grid-fill',
        'cut-fill-grid-line',
        'flight-envelope-volume',
        'flight-ceiling-slab',
        'flight-ceiling-border',
        'building-mass-extrusion',
        'building-mass-edges',
        'building-highlight-fill',
        'building-highlight-edge',
        'handler-stem-line',
        'handler-center-point',
        'handler-rotate-point',
        'tie-line-glow',
        'tie-line-dash',
        'tie-line-point-glow',
        'tie-line-point-core',
        'drawing-temp-line',
        'drawing-temp-points'
      ];

      for (const id of toolLayers) {
        try { m.removeLayer(id); } catch(e) {}
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 50));
        const p = getPixel();
        if (p[0] > 10 || p[1] > 10 || p[2] > 10) {
          return { culpritLayer: id, pixel: p };
        }
      }
      return { culpritLayer: null, pixel: getPixel() };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('EXACT TOOL LAYER CULPRIT:\n', JSON.stringify(evalRes.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}
test();
