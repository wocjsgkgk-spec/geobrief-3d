const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9230',
    '--user-data-dir=/tmp/cdp_err_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9230/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8080'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!target) { console.log('Target not found'); process.exit(1); }

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
      const text = d.params.args.map(a => a.value || a.description || '').join(' ');
      consoleLogs.push({ type: d.params.type, text });
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 4000));

  const diagRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      const c = m.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const glError = gl.getError();
      
      return {
        glError: glError,
        isContextLost: gl.isContextLost(),
        terrain: m.getTerrain(),
        isStyleLoaded: m.isStyleLoaded(),
        areTilesLoaded: m.areTilesLoaded(),
      };
    })()`,
    returnByValue: true
  });

  console.log('DIAGNOSTICS:\n', JSON.stringify(diagRes.result.value, null, 2));
  console.log('BROWSER CONSOLE LOGS:\n', consoleLogs.filter(l => l.text.includes('error') || l.text.includes('warn') || l.text.includes('MapLibre') || l.text.includes('Error') || l.text.includes('Terrain')).slice(-30));

  chrome.kill();
  process.exit(0);
}
test();
