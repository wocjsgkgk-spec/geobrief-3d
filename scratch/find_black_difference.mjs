import { spawn } from 'child_process';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_find_black',
  'http://127.0.0.1:8080'
]);

await new Promise((r) => setTimeout(r, 2000));
const res = await fetch('http://127.0.0.1:9222/json/list');
const list = await res.json();
const target = list.find((t) => t.url.includes('8080'));
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

// Read pixel color helper
const evalExpr = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result.value;
};

const checkPixels = `
  (() => {
    const canvas = window.__map.getCanvas();
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const pixels = new Uint8Array(4);
    // Sample at 300, 300 (where ground should be)
    gl.readPixels(300, 300, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return Array.from(pixels);
  })()
`;

console.log('Initial pixel at (300,300):', await evalExpr(checkPixels));

// Test 1: Check satellite layer opacity and visibility
const satProps = `
  (() => {
    const map = window.__map;
    return {
      satBaseVisible: map.getLayoutProperty('satellite-base-layer', 'visibility'),
      satBaseOpacity: map.getPaintProperty('satellite-base-layer', 'raster-opacity'),
      satVisible: map.getLayoutProperty('satellite-layer', 'visibility'),
      satOpacity: map.getPaintProperty('satellite-layer', 'raster-opacity'),
    };
  })()
`;
console.log('Satellite props:', await evalExpr(satProps));

// Test 2: What happens if we turn off terrain?
await evalExpr(`
  window.__map.setTerrain(null);
  window.__map.triggerRepaint();
`);
await new Promise((r) => setTimeout(r, 1000));
console.log('Pixel after setTerrain(null):', await evalExpr(checkPixels));

// Test 3: What happens if we re-enable terrain with terrarium-dem?
await evalExpr(`
  window.__map.setTerrain({ source: 'terrarium-dem', exaggeration: 1.2 });
  window.__map.triggerRepaint();
`);
await new Promise((r) => setTimeout(r, 1000));
console.log('Pixel after re-enabling terrain:', await evalExpr(checkPixels));

ws.close();
chrome.kill();
