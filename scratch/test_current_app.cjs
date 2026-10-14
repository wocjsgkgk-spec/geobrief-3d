const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function checkApp() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1600,900',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_app_test',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8080'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!target) {
    const res = await fetch('http://127.0.0.1:9222/json/new?http://127.0.0.1:8080', { method: 'PUT' });
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

  const consoleLogs = [];
  ws.addEventListener('message', (evt) => {
    const d = JSON.parse(evt.data);
    if (d.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(d.params.args.map(a => a.value || a.description).join(' '));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Waiting 6s for map rendering...');
  await new Promise(r => setTimeout(r, 6000));

  const mapStatus = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      if (!m) return { hasMap: false };
      const c = m.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const p = new Uint8Array(4);
      gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      
      const layers = m.getStyle().layers ? m.getStyle().layers.map(l => l.id) : [];
      return {
        hasMap: true,
        isLoaded: m.loaded(),
        isStyleLoaded: m.isStyleLoaded(),
        centerPixel: Array.from(p),
        elevation: m.queryTerrainElevation ? m.queryTerrainElevation(m.getCenter()) : null,
        center: m.getCenter(),
        zoom: m.getZoom(),
        pitch: m.getPitch(),
        layerCount: layers.length,
        hasTerrain: !!m.getTerrain(),
        layers: layers
      };
    })()`,
    returnByValue: true
  });
  console.log('MAP STATUS:', JSON.stringify(mapStatus.result.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_live_app.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/screenshot_live_app.png, size:', fs.statSync('scratch/screenshot_live_app.png').size);

  console.log('Console logs sample:');
  consoleLogs.slice(-15).forEach(l => console.log('  [LOG]', l));

  chrome.kill();
  process.exit(0);
}

checkApp().catch(console.error);
