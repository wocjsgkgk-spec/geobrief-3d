const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_net_' + Date.now(),
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

  const requests = [];
  const responses = [];
  const failed = [];

  ws.addEventListener('message', (evt) => {
    const d = JSON.parse(evt.data);
    if (d.method === 'Network.requestWillBeSent') {
      const u = d.params.request.url;
      if (!u.includes('.js') && !u.includes('.css') && !u.includes('favicon')) {
        requests.push(u);
      }
    } else if (d.method === 'Network.responseReceived') {
      const u = d.params.response.url;
      if (!u.includes('.js') && !u.includes('.css') && !u.includes('favicon')) {
        responses.push({ url: u, status: d.params.response.status });
      }
    } else if (d.method === 'Network.loadingFailed') {
      failed.push({ errorText: d.params.errorText, canceled: d.params.canceled });
    }
  });

  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8080' });

  console.log('Waiting 5s for network requests...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('REQUESTS COUNT:', requests.length);
  console.log('SAMPLE REQUESTS:\n', JSON.stringify(requests.slice(0, 20), null, 2));
  console.log('SAMPLE RESPONSES:\n', JSON.stringify(responses.slice(0, 20), null, 2));
  console.log('FAILED COUNT:', failed.length, 'FAILED SAMPLE:\n', JSON.stringify(failed.slice(0, 10), null, 2));

  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
