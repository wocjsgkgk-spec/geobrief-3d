const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/cdp_canvas_' + Date.now(),
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
      if (!m) return { error: 'no map' };
      const c = m.getCanvas();
      const container = m.getContainer();
      return {
        canvasWidth: c ? c.width : null,
        canvasHeight: c ? c.height : null,
        canvasClientWidth: c ? c.clientWidth : null,
        canvasClientHeight: c ? c.clientHeight : null,
        containerOffsetWidth: container ? container.offsetWidth : null,
        containerOffsetHeight: container ? container.offsetHeight : null,
        containerBounds: container ? container.getBoundingClientRect() : null,
        mapLoaded: m.loaded(),
        mapIsMoving: m.isMoving(),
        mapTransform: {
          width: m.transform.width,
          height: m.transform.height,
          zoom: m.transform.zoom,
          center: m.transform.center
        }
      };
    })()`,
    returnByValue: true
  });

  console.log('CANVAS & CONTAINER STATUS:\n', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
