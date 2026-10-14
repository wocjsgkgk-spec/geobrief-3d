import { spawn } from 'child_process';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_check_tm',
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
    try {
      const map = window.__map;
      if (!map) return { err: 'no map' };
      const demTm = map.style.tileManagers['terrarium-dem'];
      const satTm = map.style.tileManagers['satellite-tiles'];
      
      const res = {};
      if (demTm) {
        res.dem = {
          loaded: demTm._sourceLoaded,
          errored: demTm._sourceErrored,
          inViewCount: demTm._inViewTiles ? Object.keys(demTm._inViewTiles).length : 0,
        };
        if (demTm._inViewTiles) {
          res.dem.tiles = Object.entries(demTm._inViewTiles).slice(0, 5).map(([k, t]) => ({
            key: k,
            state: t.state,
            hasDem: !!t.dem
          }));
        }
      }
      if (satTm) {
        res.sat = {
          loaded: satTm._sourceLoaded,
          errored: satTm._sourceErrored,
          inViewCount: satTm._inViewTiles ? Object.keys(satTm._inViewTiles).length : 0,
        };
        if (satTm._inViewTiles) {
          res.sat.tiles = Object.entries(satTm._inViewTiles).slice(0, 5).map(([k, t]) => ({
            key: k,
            state: t.state,
            hasTexture: !!t.texture
          }));
        }
      }
      return res;
    } catch (e) {
      return { err: e.message, stack: e.stack };
    }
  })()
`;

const resVal = await send('Runtime.evaluate', { expression: code, returnByValue: true });
console.log('Result:', JSON.stringify(resVal.result.value, null, 2));

ws.close();
chrome.kill();
