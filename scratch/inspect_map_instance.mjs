import { spawn } from 'child_process';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_inspect',
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

  await new Promise((r) => setTimeout(r, 6000));

  const mapInfo = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map;
        if (!map) return { error: 'window.__map is null' };

        const style = map.getStyle ? map.getStyle() : null;
        const satBaseLyr = map.getLayer('satellite-base-layer');
        const satLyr = map.getLayer('satellite-layer');
        const cleanLyr = map.getLayer('clean-layer');
        const terrain = map.getTerrain ? map.getTerrain() : null;

        return {
          isLoaded: map.loaded(),
          isStyleLoaded: map.isStyleLoaded(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
          terrain: terrain,
          layers: style ? style.layers.map(l => ({ id: l.id, type: l.type, source: l.source, visibility: map.getLayoutProperty(l.id, 'visibility') })) : [],
          satBaseVisibility: map.getLayoutProperty('satellite-base-layer', 'visibility'),
          satLyrVisibility: map.getLayoutProperty('satellite-layer', 'visibility'),
          cleanLyrVisibility: map.getLayoutProperty('clean-layer', 'visibility'),
        };
      })()
    `,
    returnByValue: true
  });

  console.log('--- MAP INSTANCE INSPECTION ---');
  console.log(JSON.stringify(mapInfo.result?.value, null, 2));
} finally {
  chrome.kill();
  process.exit(0);
}
