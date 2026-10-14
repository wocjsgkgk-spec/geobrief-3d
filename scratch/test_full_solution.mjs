import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

// Standalone test mimicking the complete proposed solution
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Full Solution Test</title>
  <script src="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <link href="https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.css" rel="stylesheet" />
  <style>body { margin: 0; padding: 0; } #map { width: 100vw; height: 100vh; }</style>
</head>
<body>
<div id="map"></div>
<script>
  // 1. Pure Satellite Base Style
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

  // 2. Generate 512x512 Facade Textures
  function generateApartmentFacade(size = 512) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, size, size);
    // Floors & Windows
    const floors = 4; const bays = 4;
    const fh = size / floors; const bw = size / bays;
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, y, size, 8);
      for (let b = 0; b < bays; b++) {
        const x = b * bw;
        // Window
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(x + 12, y + 14, bw - 24, fh * 0.5);
        // Balcony railing
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(x + 8, y + fh * 0.58, bw - 16, fh * 0.38);
      }
    }
    return ctx.getImageData(0, 0, size, size);
  }

  function generateCommercialFacade(size = 512) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);
    // Curtain wall grid
    const cols = 6; const rows = 8;
    const cw = size / cols; const rh = size / rows;
    for (let r = 0; r < rows; r++) {
      for (let cl = 0; cl < cols; cl++) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(cl * cw + 2, r * rh + 2, cw - 4, rh - 4);
      }
    }
    return ctx.getImageData(0, 0, size, size);
  }

  map.on('load', () => {
    // A. Terrain Draping
    map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.2 });

    // B. Register textures
    map.addImage('facade-apartment', generateApartmentFacade(512));
    map.addImage('facade-commercial', generateCommercialFacade(512));

    // C. Add OpenMapTiles vector source for roads & buildings
    map.addSource('openmaptiles-vector', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      tiles: ['https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf'],
      maxzoom: 14
    });

    // D. Roads
    map.addLayer({
      id: 'roads-asphalt',
      type: 'line',
      source: 'openmaptiles-vector',
      'source-layer': 'transportation',
      minzoom: 13,
      paint: {
        'line-color': '#1E293B',
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 14, 18, 26],
        'line-opacity': 0.95
      }
    });

    // E. 3D Buildings with Facade Patterns
    map.addLayer({
      id: '3d-buildings',
      type: 'fill-extrusion',
      source: 'openmaptiles-vector',
      'source-layer': 'building',
      minzoom: 12,
      paint: {
        'fill-extrusion-pattern': 'facade-apartment',
        'fill-extrusion-height': 24,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.95,
        'fill-extrusion-vertical-gradient': true
      }
    });

    // F. Dark Charcoal Roof Cap (#334155) with 1.2m Parapet
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

    // G. Three.js Smart City Complex (LOD2 Multi-Hub)
    const smartCityLayer = {
      id: 'smart-city-lod2',
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

        // Directional Light (Angled sunlight: intensity 0.9, position [1.3, 115, 40])
        const sun = new THREE.DirectionalLight(0xfffbeb, 0.9);
        sun.position.set(1.3, 115, 40).normalize();
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));

        // R&D Tower (55m height, blue curtain wall)
        const towerGeo = new THREE.BoxGeometry(32, 55, 24);
        const towerMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.15,
          metalness: 0.85,
          transparent: true,
          opacity: 0.88
        });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.set(0, 27.5, 0);
        this.scene.add(tower);

        // Helipad atop R&D Tower
        const heliGeo = new THREE.CylinderGeometry(10, 10, 0.5, 32);
        const heliMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
        const heli = new THREE.Mesh(heliGeo, heliMat);
        heli.position.set(0, 55.5, 0);
        this.scene.add(heli);

        // Knowledge Industry Center (24m height with solar panels)
        const kicGeo = new THREE.BoxGeometry(45, 24, 25);
        const kicMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
        const kic = new THREE.Mesh(kicGeo, kicMat);
        kic.position.set(50, 12, 10);
        this.scene.add(kic);

        // Solar panels
        const solarGeo = new THREE.BoxGeometry(40, 0.6, 20);
        const solarMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.2, metalness: 0.9 });
        const solar = new THREE.Mesh(solarGeo, solarMat);
        solar.position.set(50, 24.5, 10);
        this.scene.add(solar);

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
    map.addLayer(smartCityLayer);

    window.__testReady = true;
  });
</script>
</body>
</html>
`;

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

srv.listen(8997, async () => {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1600,900',
    '--remote-debugging-port=9224',
    '--user-data-dir=/tmp/cdp_sol_test_' + Date.now(),
    'http://127.0.0.1:8997'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8997'));
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
  console.log('Waiting 6s for full solution test...');
  await new Promise(r => setTimeout(r, 6000));

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
        testReady: window.__testReady,
        layers: m.getStyle().layers.map(l => l.id)
      };
    })()`,
    returnByValue: true
  });
  console.log('CHECK FULL SOLUTION RESULT:', JSON.stringify(check.result.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_full_solution.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/screenshot_full_solution.png, size:', fs.statSync('scratch/screenshot_full_solution.png').size);

  chrome.kill();
  srv.close();
  process.exit(0);
});
