import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

// Serve a page that does baseStyle first, setTerrain, then adds 3D custom layers
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Base Style + 3D Layers Test</title>
  <script src="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
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

  map.on('load', () => {
    map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.2 });
    console.log('TERRAIN_SET_SUCCESS');

    // Add 3D building custom layer
    const custom3DLayer = {
      id: 'test-3d-buildings',
      type: 'custom',
      renderingMode: '3d',
      onAdd: function(map, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true
        });
        this.renderer.autoClear = false;

        // Add Directional light at 0.9 intensity
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(1.3, 115, 40).normalize();
        this.scene.add(dirLight);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Add R&D Tower mesh (55m height, blue curtain wall + rooftop helipad)
        const towerGeo = new THREE.BoxGeometry(30, 55, 22);
        const towerMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.15,
          metalness: 0.85,
          transparent: true,
          opacity: 0.85
        });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.set(0, 27.5, 0);
        this.scene.add(tower);

        // Dark charcoal gray (#334155) roof slab
        const roofGeo = new THREE.BoxGeometry(30.6, 1.2, 22.6);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 55.6, 0);
        this.scene.add(roof);

        // Helipad mark
        const heliGeo = new THREE.CylinderGeometry(9, 9, 0.4, 24);
        const heliMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
        const heli = new THREE.Mesh(heliGeo, heliMat);
        heli.position.set(0, 56.4, 0);
        this.scene.add(heli);

        this.map = map;
      },
      render: function(gl, matrix) {
        const mercator = maplibregl.MercatorCoordinate.fromLngLat(
          [127.9358, 37.3592],
          this.map.queryTerrainElevation([127.9358, 37.3592]) || 0
        );
        const scale = mercator.meterInMercatorCoordinateUnits();
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(mercator.x, mercator.y, mercator.z)
          .scale(new THREE.Vector3(scale, -scale, scale))
          .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2));

        this.camera.projectionMatrix = m.multiply(l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        this.renderer.resetState();
      }
    };

    map.addLayer(custom3DLayer);
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

srv.listen(8995, async () => {
  console.log('Server running on 8995...');
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1600,900',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_base_test',
    'http://127.0.0.1:8995'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8995'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!target) {
    const res = await fetch('http://127.0.0.1:9222/json/new?http://127.0.0.1:8995', { method: 'PUT' });
    target = await res.json();
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
  console.log('Waiting 5s for terrain + 3D building to render...');
  await new Promise(r => setTimeout(r, 5000));

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = window.__map.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const p = new Uint8Array(4);
      gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return {
        centerPixel: Array.from(p),
        elevation: window.__map.queryTerrainElevation([127.9358, 37.3592])
      };
    })()`,
    returnByValue: true
  });
  console.log('CHECK RESULT:', JSON.stringify(check.result.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_base_plus_3d.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/screenshot_base_plus_3d.png, size:', fs.statSync('scratch/screenshot_base_plus_3d.png').size);

  chrome.kill();
  srv.close();
  process.exit(0);
});
