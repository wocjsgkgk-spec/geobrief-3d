import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Dynamic Layers Test</title>
  <script src="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.css" rel="stylesheet" />
  <style>body { margin: 0; padding: 0; } #map { width: 100vw; height: 100vh; }</style>
</head>
<body>
<div id="map"></div>
<script>
  const baseStyle = {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
        ],
        tileSize: 256,
        maxzoom: 19
      },
      'terrarium-dem': {
        type: 'raster-dem',
        encoding: 'terrarium',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        maxzoom: 15
      }
    },
    layers: [
      {
        id: 'satellite-base-layer',
        type: 'raster',
        source: 'satellite-tiles',
        paint: { 'raster-opacity': 1.0 }
      }
    ]
  };

  const map = new maplibregl.Map({
    container: 'map',
    style: baseStyle,
    center: [127.9358, 37.3592],
    zoom: 15.6,
    pitch: 55,
    bearing: 20
  });

  window.__map = map;

  map.on('load', () => {
    map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.2 });

    // Dynamically add openmaptiles-vector
    map.addSource('openmaptiles-vector', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      tiles: ['https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf'],
      maxzoom: 14
    });

    // Add 3D buildings
    map.addLayer({
      id: '3d-buildings',
      type: 'fill-extrusion',
      source: 'openmaptiles-vector',
      'source-layer': 'building',
      minzoom: 12,
      paint: {
        'fill-extrusion-color': '#BAE6FD',
        'fill-extrusion-height': 24,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.95
      }
    });

    // Add roof
    map.addLayer({
      id: '3d-buildings-roof',
      type: 'fill-extrusion',
      source: 'openmaptiles-vector',
      'source-layer': 'building',
      minzoom: 12,
      paint: {
        'fill-extrusion-color': '#334155',
        'fill-extrusion-height': 24.2,
        'fill-extrusion-base': 23.6,
        'fill-extrusion-opacity': 0.95
      }
    });

    // Add GeoJSON sources
    const emptyCollection = { type: 'FeatureCollection', features: [] };
    const geojsonSources = [
      'drawing-temp-source', 'drawing-polygon-source', 'buffer-500m-source',
      'buffer-1km-source', 'buffer-2km-source', 'transform-handlers-source',
      'flight-ceiling-source', 'tie-line-source', 'building-mass-source',
      'fusion-buildings', 'contour-lines-source', 'vworld-buildings-source',
      'slope-analysis-source', 'building-highlight-source', 'viewshed-visible-source',
      'viewshed-hidden-source', 'viewshed-origin-source', 'measure-line-source',
      'measure-points-source', 'tactical-arrows-source'
    ];

    geojsonSources.forEach(s => {
      if (!map.getSource(s)) {
        map.addSource(s, { type: 'geojson', data: emptyCollection });
      }
    });

    // Add buffer layers
    map.addLayer({
      id: 'buffer-1km-fill',
      type: 'fill',
      source: 'buffer-1km-source',
      paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.15 }
    });

    window.__loadedDynamic = true;
  });
</script>
</body>
</html>
`;

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

srv.listen(8996, async () => {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1600,900',
    '--remote-debugging-port=9223',
    '--user-data-dir=/tmp/cdp_dyn_test_' + Date.now(),
    'http://127.0.0.1:8996'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9223/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8996'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

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
  console.log('Waiting 5s for dynamic test...');
  await new Promise(r => setTimeout(r, 5000));

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      const c = m.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const p = new Uint8Array(4);
      gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return {
        centerPixel: Array.from(p),
        elevation: m.queryTerrainElevation([127.9358, 37.3592]),
        loadedDynamic: window.__loadedDynamic,
        layerCount: m.getStyle().layers.length
      };
    })()`,
    returnByValue: true
  });
  console.log('CHECK DYNAMIC RESULT:', JSON.stringify(check.result.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_dynamic_test.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/screenshot_dynamic_test.png, size:', fs.statSync('scratch/screenshot_dynamic_test.png').size);

  chrome.kill();
  srv.close();
  process.exit(0);
});
