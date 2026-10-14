import { spawn } from 'child_process';
import fs from 'fs';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_diag',
  'http://127.0.0.1:8080'
]);

await new Promise((r) => setTimeout(r, 2000));

try {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  const target = list.find((t) => t.url.includes('8080'));
  if (!target) {
    chrome.kill();
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
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

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');

  const errors = [];
  ws.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      if (data.params.type === 'error' || data.params.type === 'warning') {
        errors.push(`[${data.params.type}] ${text}`);
      }
    }
  });

  await new Promise((r) => setTimeout(r, 6000));

  const diag = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map;
        if (!map) return { error: 'no map' };

        // Test terrain
        const terrain = map.getTerrain ? map.getTerrain() : null;
        const satSource = map.getSource('satellite-tiles');
        const demSource = map.getSource('terrarium-dem');

        // Check WebGL errors or clear color
        const canvas = map.getCanvas();
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        
        return {
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
          center: map.getCenter(),
          terrain,
          satSourceLoaded: satSource ? satSource.loaded() : null,
          demSourceLoaded: demSource ? demSource.loaded() : null,
          isMapLoaded: map.loaded(),
          isStyleLoaded: map.isStyleLoaded(),
          canvasSize: { width: canvas.width, height: canvas.height },
          // Check pixel color at center
          centerColor: (() => {
            if (!gl) return 'no gl';
            const pixels = new Uint8Array(4);
            gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return Array.from(pixels);
          })(),
          // Check pixel color at bottom-left
          cornerColor: (() => {
            if (!gl) return 'no gl';
            const pixels = new Uint8Array(4);
            gl.readPixels(50, 50, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return Array.from(pixels);
          })()
        };
      })()
    `,
    returnByValue: true
  });

  console.log('=== DIAG RESULTS ===');
  console.log(JSON.stringify(diag.result.value, null, 2));

  console.log('=== ERRORS & WARNINGS ===');
  console.log(errors.slice(0, 15).join('\n'));

  // Test what happens if we setTerrain(null)
  const testNoTerrain = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map;
        map.setTerrain(null);
        map.triggerRepaint();
        return 'terrain set to null';
      })()
    `,
    returnByValue: true
  });
  console.log('Set terrain null result:', testNoTerrain.result.value);

  await new Promise((r) => setTimeout(r, 2000));

  // Take screenshot after setTerrain(null)
  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screenshot_no_terrain.png', Buffer.from(ss.data, 'base64'));
  console.log('Saved scratch/screenshot_no_terrain.png');

  ws.close();
  chrome.kill();
} catch (err) {
  console.error(err);
  chrome.kill();
}
