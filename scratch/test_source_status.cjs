const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9231',
    '--user-data-dir=/tmp/cdp_src_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9231/json/list');
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

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 5000));

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      const style = m.getStyle();
      const sourceIds = Object.keys(style.sources);
      const sourceLoadedStatus = {};
      for (const id of sourceIds) {
        try {
          sourceLoadedStatus[id] = m.isSourceLoaded(id);
        } catch(e) {
          sourceLoadedStatus[id] = e.message;
        }
      }

      return {
        isStyleLoaded: m.isStyleLoaded(),
        loaded: m.loaded(),
        sourceLoadedStatus
      };
    })()`,
    returnByValue: true
  });

  console.log('SOURCE STATUS:\n', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}
test();
