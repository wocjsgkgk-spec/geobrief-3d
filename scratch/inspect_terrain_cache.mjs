import { spawn } from 'child_process';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_cache_check',
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

const code = `
  (() => {
    const map = window.__map;
    if (!map) return 'no map';
    const sc = map.style._sourceCaches;
    const dem = sc['terrarium-dem'];
    if (!dem) return 'no dem cache, available: ' + Object.keys(sc).join(', ');
    const tiles = dem._tiles;
    const keys = Object.keys(tiles);
    return {
      used: dem.used,
      tileCount: keys.length,
      keys: keys.slice(0, 5),
      tiles: keys.slice(0, 5).map(k => ({
        key: k,
        state: tiles[k].state,
        hasDem: !!tiles[k].dem,
        hasDemTexture: !!tiles[k].demTexture
      }))
    };
  })()
`;

const resVal = await send('Runtime.evaluate', { expression: code, returnByValue: true });
console.log('Result:', JSON.stringify(resVal, null, 2));

ws.close();
chrome.kill();
