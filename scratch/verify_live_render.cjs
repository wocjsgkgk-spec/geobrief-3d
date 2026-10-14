const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9244',
    '--user-data-dir=/tmp/cdp_live_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2500));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9244/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8080'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!target) {
    console.log('Target not found');
    chrome.kill();
    process.exit(1);
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
  
  // Wait 7 seconds for MapLibre tiles, 3D DEM, and SmartCityComplex to fully load and render
  console.log('Waiting 7s for WebGL 3D rendering...');
  await new Promise(r => setTimeout(r, 7000));

  const mapInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      if (!m) return { loaded: false };
      const c = m.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      
      // Sample multiple pixels across center and quarter points
      const samples = [];
      const pts = [
        { name: 'center', x: c.width / 2, y: c.height / 2 },
        { name: 'bottom_mid', x: c.width / 2, y: c.height * 0.75 },
        { name: 'top_mid', x: c.width / 2, y: c.height * 0.25 },
        { name: 'left_mid', x: c.width * 0.25, y: c.height / 2 },
        { name: 'right_mid', x: c.width * 0.75, y: c.height / 2 }
      ];
      for (const pt of pts) {
        const p = new Uint8Array(4);
        gl.readPixels(pt.x, pt.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        samples.push({ name: pt.name, rgba: Array.from(p) });
      }

      const center = m.getCenter();
      const zoom = m.getZoom();
      const pitch = m.getPitch();
      const bearing = m.getBearing();
      const terrain = m.getTerrain();
      const layers = m.getStyle().layers.map(l => ({ id: l.id, type: l.type, visible: l.layout?.visibility ?? 'default' }));
      const elevationAtCenter = m.queryTerrainElevation ? m.queryTerrainElevation(center) : null;

      return {
        loaded: true,
        center: [center.lng, center.lat],
        zoom,
        pitch,
        bearing,
        terrain,
        elevationAtCenter,
        samples,
        totalLayers: layers.length,
        smartCityLayer: layers.find(l => l.id === 'smart-city-complex-3d-layer')
      };
    })()`,
    returnByValue: true
  });

  console.log('MAP RENDER INFO:\n', JSON.stringify(mapInfo.result.value, null, 2));

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/shot_live_render.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/shot_live_render.png');

  ws.close();
  chrome.kill();
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
