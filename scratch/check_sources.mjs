import { spawn } from 'child_process';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_chk',
  'http://127.0.0.1:8080'
]);

await new Promise((r) => setTimeout(r, 2000));

try {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  const target = list.find((t) => t.url.includes('8080'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
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

  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await new Promise((r) => setTimeout(r, 5000));

  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map;
        if (!map) return 'no map';
        const style = map.getStyle();
        const sources = Object.keys(style.sources).map(k => {
          const src = map.getSource(k);
          return {
            id: k,
            type: style.sources[k].type,
            loaded: src && typeof src.loaded === 'function' ? src.loaded() : 'N/A'
          };
        });
        return sources;
      })()
    `,
    returnByValue: true
  });
  console.log('SOURCES STATUS:', JSON.stringify(result.result?.value, null, 2));
} finally {
  chrome.kill();
  process.exit(0);
}
