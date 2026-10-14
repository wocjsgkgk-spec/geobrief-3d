import http from 'http';
import { spawn } from 'child_process';

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.js"></script>
</head>
<body>
<div id="map" style="width: 800px; height: 600px;"></div>
<script>
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'sat': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256
        },
        'dem': {
          type: 'raster-dem',
          encoding: 'terrarium',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256
        },
        'empty-line-source': {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        }
      },
      layers: [
        { id: 'sat-layer', type: 'raster', source: 'sat' },
        {
          id: 'test-dash-line',
          type: 'line',
          source: 'empty-line-source',
          paint: {
            'line-color': '#ff0000',
            'line-width': 2,
            'line-dasharray': [2, 1]
          }
        }
      ]
    },
    center: [127.9358, 37.3592],
    zoom: 15,
    pitch: 50
  });

  map.on('load', () => {
    map.setTerrain({ source: 'dem', exaggeration: 1.2 });
    window.__loaded = true;
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
    '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/cdp_dash_' + Date.now(), 'http://127.0.0.1:8998'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch('http://127.0.0.1:9225/json/new?http://127.0.0.1:8998', { method: 'PUT' });
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
  await new Promise(r => setTimeout(r, 4000));

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = window.__map.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const p = new Uint8Array(4);
      gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return {
        pixel: Array.from(p),
        elevation: window.__map.queryTerrainElevation([127.9358, 37.3592])
      };
    })()`,
    returnByValue: true
  });

  console.log('DASH TEST RESULT:', JSON.stringify(check.result.value, null, 2));
  chrome.kill();
  srv.close();
  process.exit(0);
});
