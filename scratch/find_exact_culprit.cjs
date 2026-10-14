const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/cdp_exact_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9225/json/list');
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

  // Let's test binary search of layers to find the exact offender(s)
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

      const initialP = getPixel();
      console.log('Initial pixel:', initialP);

      // What if we remove all non-essential layers at once?
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
      const initialLayers = m.getStyle().layers.map(l => l.id);
      const candidates = initialLayers.filter(id => !essential.includes(id));

      // Test subsets
      // Let's see: candidate groups
      // Group 1: road detail layers (roads-edge-white, roads-lanes, roads-centerline, roads-local, roads-secondary, roads-highways, crosswalks)
      // Group 2: buffer layers (buffer-2km, buffer-1km, buffer-500m)
      // Group 3: contour layers (vworld-contour-raster, contour-intermediate-line, contour-index-line, contour-labels)
      // Group 4: fusion / sample buildings (fusion-buildings-*, sample-buildings-*, vworld-buildings-*)
      // Group 5: tool layers (drawing-*, viewshed-*, measure-*, tactical-*, cut-fill-*, flight-*, building-mass-*, building-highlight-*, handler-*, tie-line-*, 3d-buildings-edge)

      const groups = {
        roadDetails: [
          'cadastral-parcels-line',
          'roads-edge-white-left',
          'roads-edge-white-right',
          'roads-lanes-white-dashed-left',
          'roads-lanes-white-dashed-right',
          'roads-centerline-yellow-left',
          'roads-centerline-yellow-right',
          'roads-local',
          'roads-secondary',
          'roads-highways',
          'crosswalks-fill',
          'crosswalks-stopline'
        ],
        terrainHillshade: ['terrain-hillshade'],
        buffers: [
          'buffer-2km-fill',
          'buffer-2km-line',
          'buffer-1km-fill',
          'buffer-1km-line',
          'buffer-500m-fill',
          'buffer-500m-line',
          'mdl-line-glow'
        ],
        contours: [
          'vworld-contour-raster',
          'contour-intermediate-line',
          'contour-index-line',
          'contour-labels'
        ],
        fusionBuildings: [
          'fusion-buildings-ao',
          'fusion-buildings-foundation',
          'fusion-buildings-3d',
          'fusion-buildings-roof',
          'fusion-buildings-edge',
          'sample-buildings-3d',
          'sample-buildings-roof',
          'sample-buildings-edge',
          'vworld-buildings-3d',
          'vworld-buildings-roof',
          'vworld-buildings-edge',
          '3d-buildings-edge'
        ],
        toolLayers: [
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
        ]
      };

      const groupResults = {};
      for (const [groupName, layerIds] of Object.entries(groups)) {
        for (const id of layerIds) {
          try { m.removeLayer(id); } catch(e) {}
        }
        m.triggerRepaint();
        await new Promise(r => setTimeout(r, 200));
        groupResults[groupName] = getPixel();
      }

      return { initialP, groupResults, finalPixel: getPixel() };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('BINARY TEST RESULT:\n', JSON.stringify(evalRes.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}
test();
