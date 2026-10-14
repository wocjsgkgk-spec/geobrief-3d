const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9222', '--disable-web-security'
  ]);
  await new Promise(r => setTimeout(r, 1500));
  const target = await new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: '/json/new', method: 'PUT' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    });
    req.end();
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const pending = new Map();
  const responses = [];

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Network.responseReceived') {
      responses.push({
        url: msg.params.response.url,
        status: msg.params.response.status,
        mime: msg.params.response.mimeType
      });
    }
  };

  function send(method, params = {}) {
    return new Promise(res => {
      const id = msgId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Network.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8080' });

  console.log('Listening to network for 8 seconds after navigate...');
  await new Promise(r => setTimeout(r, 8000));

  const demReqs = responses.filter(r => r.url.includes('terrarium'));
  const satReqs = responses.filter(r => r.url.includes('arcgis') || r.url.includes('google'));
  const vectorReqs = responses.filter(r => r.url.includes('openmaptiles') || r.url.includes('maptiler'));

  console.log('Total responses:', responses.length);
  console.log('DEM responses:', demReqs.length);
  console.log('Satellite responses:', satReqs.length);
  console.log('Vector responses:', vectorReqs.length);

  demReqs.slice(0, 5).forEach(r => console.log('DEM:', r.status, r.url));
  satReqs.slice(0, 5).forEach(r => console.log('SAT:', r.status, r.url));
  vectorReqs.slice(0, 5).forEach(r => console.log('VECTOR:', r.status, r.url));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);
