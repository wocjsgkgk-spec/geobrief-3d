import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

// Serve a minimal MapLibre HTML page
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Minimal MapLibre Test</title>
  <script src="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.css" rel="stylesheet" />
  <style>body { margin: 0; padding: 0; } #map { width: 100vw; height: 100vh; }</style>
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
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
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
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-tiles'
        }
      ]
    },
    center: [127.925, 37.342],
    zoom: 14.5,
    pitch: 55,
    bearing: 20
  });

  map.on('load', () => {
    try {
      map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.2 });
      console.log('SET_TERRAIN_CALLED');
    } catch (e) {
      console.error('SET_TERRAIN_ERR:', e);
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

srv.listen(8999, async () => {
  console.log('Server listening on 8999');

  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1280,720',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_min_test',
    'http://127.0.0.1:8999'
  ]);

  await new Promise((r) => setTimeout(r, 2000));
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  const target = list.find((t) => t.url.includes('8999'));
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

  ws.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      console.log('BROWSER LOG:', data.params.args.map((a) => a.value).join(' '));
    }
  });

  await new Promise((r) => setTimeout(r, 5000));

  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_minimal_test.png', Buffer.from(ss.data, 'base64'));
  const size = fs.statSync('scratch/screenshot_minimal_test.png').size;
  console.log('Saved scratch/screenshot_minimal_test.png, size:', size);

  ws.close();
  chrome.kill();
  srv.close();
  process.exit(0);
});
