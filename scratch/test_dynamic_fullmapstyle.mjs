import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

// Standalone test: baseStyle first, then add ALL sources and layers from MapViewer
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
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
    bearing: 20,
    canvasContextAttributes: { preserveDrawingBuffer: true }
  });

  window.__map = map;

  map.on('load', async () => {
    map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.2 });

    // Fetch the live app's layers or simulate adding 20+ GeoJSON sources and layers
    const emptyGeo = { type: 'FeatureCollection', features: [] };
    const sourceIds = [
      'drawing-temp-source', 'drawing-polygon-source', 'buffer-500m-source',
      'buffer-1km-source', 'buffer-2km-source', 'border-security-source',
      'transform-handlers-source', 'flight-ceiling-source', 'tie-line-source',
      'building-mass-source', 'fusion-buildings', 'vworld-buildings-source',
      'slope-analysis-source', 'building-highlight-source', 'viewshed-visible-source',
      'viewshed-hidden-source', 'viewshed-origin-source', 'measure-line-source',
      'measure-points-source', 'tactical-arrows-source', 'cut-fill-grid-source',
      'contour-lines-source'
    ];

    for (const sid of sourceIds) {
      if (!map.getSource(sid)) {
        map.addSource(sid, { type: 'geojson', data: emptyGeo });
      }
    }

    // Add buffer layers
    map.addLayer({
      id: 'buffer-1km-fill',
      type: 'fill',
      source: 'buffer-1km-source',
      paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.15 }
    });
    map.addLayer({
      id: 'buffer-1km-line',
      type: 'line',
      source: 'buffer-1km-source',
      paint: { 'line-color': '#FBBF24', 'line-width': 2.5, 'line-dasharray': [3, 2] }
    });

    // Add drawing layers
    map.addLayer({
      id: 'drawing-temp-line',
      type: 'line',
      source: 'drawing-temp-source',
      paint: { 'line-color': '#60A5FA', 'line-width': 2.5, 'line-dasharray': [2, 1] }
    });
    map.addLayer({
      id: 'drawing-temp-points',
      type: 'circle',
      source: 'drawing-temp-source',
      paint: { 'circle-radius': 6, 'circle-color': '#3B82F6' }
    });

    // Add measurement layers
    map.addLayer({
      id: 'measure-line-main',
      type: 'line',
      source: 'measure-line-source',
      paint: { 'line-color': '#FBBF24', 'line-width': 3.5, 'line-dasharray': [3, 2] }
    });

    // Add vector tiles
    map.addSource('openmaptiles-vector', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      tiles: ['https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf'],
      maxzoom: 14
    });

    map.addLayer({
      id: 'roads-asphalt',
      type: 'line',
      source: 'openmaptiles-vector',
      'source-layer': 'transportation',
      minzoom: 13,
      paint: { 'line-color': '#1E293B', 'line-width': 4 }
    });

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

    map.addLayer({
      id: '3d-buildings-roof',
      type: 'fill-extrusion',
      source: 'openmaptiles-vector',
      'source-layer': 'building',
      minzoom: 12,
      paint: {
        'fill-extrusion-color': '#334155',
        'fill-extrusion-height': 24.3,
        'fill-extrusion-base': 23.5,
        'fill-extrusion-opacity': 0.98
      }
    });

    window.__loadedAllDynamic = true;
  });
</script>
</body>
</html>
`;

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

srv.listen(8999, async () => {
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=9226', '--user-data-dir=/tmp/cdp_dyn_full_' + Date.now(),
    'http://127.0.0.1:8999'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch('http://127.0.0.1:9226/json/new?http://127.0.0.1:8999', { method: 'PUT' });
  const target = await res.json();
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
  await new Promise(r => setTimeout(r, 5000));

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      const c = m.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const p = new Uint8Array(4);
      gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return {
        pixel: Array.from(p),
        elevation: m.queryTerrainElevation([127.9358, 37.3592]),
        loadedAll: window.__loadedAllDynamic,
        layerCount: m.getStyle().layers.length
      };
    })()`,
    returnByValue: true
  });

  console.log('DYNAMIC FULL TEST RESULT:', JSON.stringify(check.result.value, null, 2));
  chrome.kill();
  srv.close();
  process.exit(0);
});
