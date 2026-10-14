const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9239',
    '--user-data-dir=/tmp/cdp_chkreg_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9239/json/list');
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

  const allLogs = [];
  ws.addEventListener('message', (evt) => {
    const d = JSON.parse(evt.data);
    if (d.method === 'Runtime.consoleAPICalled') {
      const text = d.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      allLogs.push({ type: d.params.type, text });
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 4500));

  console.log('ALL BROWSER CONSOLE LOGS:');
  for (const l of allLogs) {
    console.log(`[${l.type}] ${l.text}`);
  }

  chrome.kill();
  process.exit(0);
}
test();
