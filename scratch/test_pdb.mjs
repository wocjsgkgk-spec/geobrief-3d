import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.css" rel="stylesheet" />
  <style>body { margin: 0; } #map { width: 100vw; height: 100vh; }</style>
</head>
<body>
<div id="map"></div>
<script>
  const map = new maplibregl.Map({
    container: 'map',
    style: {
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
          source: 'satellite-tiles'
        },
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-tiles'
        },
        {
          id: 'terrain-hillshade',
          type: 'hillshade',
          source: 'terrarium-dem',
          layout: { visibility: 'none' }
        }
      ]
    },
    center: [127.925, 37.342],
    zoom: 14.5,
    pitch: 55,
    bearing: 20, canvasContextAttributes: { preserveDrawingBuffer: true }
  });

  map.on('load', () => {
    map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.2 });
    if (typeof map.setFog === 'function') {
      map.setFog({
        range: [1.5, 12],
        color: '#bae6fd',
        'horizon-blend': 0.15
      });
    }
  });

  window.__map = map;
</script>
</body>
</html>
`;

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

srv.listen(8998, async () => {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1280,720',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_break_test',
    'http://127.0.0.1:8998'
  ]);

  await new Promise((r) => setTimeout(r, 2000));
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  const target = list.find((t) => t.url.includes('8998'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 1;
  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const msgId = id++;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise((r) => setTimeout(r, 5000));

  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_break_test.png', Buffer.from(ss.data, 'base64'));
  const size = fs.statSync('scratch/screenshot_break_test.png').size;
  console.log('Saved scratch/screenshot_break_test.png, size:', size);

  ws.close();
  chrome.kill();
  srv.close();
  process.exit(0);
});
