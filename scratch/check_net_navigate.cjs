const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9245',
    '--user-data-dir=/tmp/cdp_nav_' + Date.now(),
    '--window-size=1600,900',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1500));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9245/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('about:blank'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 400));
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

  const responses = [];
  const failures = [];
  ws.addEventListener('message', (evt) => {
    const d = JSON.parse(evt.data);
    if (d.method === 'Network.responseReceived') {
      const url = d.params.response.url;
      const status = d.params.response.status;
      responses.push({ status, url: url.slice(0, 100) });
    }
    if (d.method === 'Network.loadingFailed') {
      failures.push({ errorText: d.params.errorText, url: d.params.requestId });
    }
  });

  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');

  await send('Page.navigate', { url: 'http://127.0.0.1:8080' });
  await new Promise(r => setTimeout(r, 5000));

  console.log('TOTAL RESPONSES:', responses.length);
  const tileResponses = responses.filter(r => r.url.includes('terrarium') || r.url.includes('tile') || r.url.includes('ArcGIS') || r.url.includes('google'));
  console.log('TILE RESPONSES (Count:', tileResponses.length, '):');
  console.log(tileResponses.slice(0, 15));
  console.log('FAILURES (Count:', failures.length, '):', failures.slice(0, 5));

  chrome.kill();
  process.exit(0);
}
test();
