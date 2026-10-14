const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_cache_' + Date.now(),
    '--window-size=1600,900',
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
  await new Promise(r => setTimeout(r, 4000));

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      if (!m || !m.style) return { error: 'no style' };

      const tm = m.style.tileManagers || {};
      const status = {};
      for (const [id, t] of Object.entries(tm)) {
        status[id] = {
          loaded: typeof t.loaded === 'function' ? t.loaded() : t.loaded,
          tilesCount: t.tiles ? Object.keys(t.tiles).length : 0
        };
      }
      return {
        _loaded: m.style._loaded,
        tileManagers: status
      };
    })()`,
    returnByValue: true
  });

  console.log('TILE MANAGERS STATUS:\n', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
