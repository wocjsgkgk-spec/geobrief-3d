const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9235',
    '--user-data-dir=/tmp/cdp_shots_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9235/json/list');
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
  await new Promise(r => setTimeout(r, 3500));

  // 1. Baseline:
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;
      const essential = [
        'satellite-base-layer',
        'roads-asphalt-casing',
        'roads-asphalt-inner',
        '3d-buildings',
        '3d-buildings-roof',
        'vworld-cadastral-layer',
        'clean-layer',
        'dmz-buffer-fill',
        'ccl-line-layer',
        'mdl-line-layer',
        'slope-analysis-fill'
      ];
      const all = m.getStyle().layers.map(l => l.id);
      for (const id of all) {
        if (!essential.includes(id)) {
          try { m.removeLayer(id); } catch(e) {}
        }
      }
      m.triggerRepaint();
    })()`,
    awaitPromise: true
  });
  await new Promise(r => setTimeout(r, 800));

  let shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/shot_1_baseline.png', Buffer.from(shot1.data, 'base64'));
  console.log('Saved scratch/shot_1_baseline.png');

  // 2. Add line:
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const m = window.__map;
      m.addLayer({
        id: 'test-simple-line',
        type: 'line',
        source: 'openmaptiles-vector',
        'source-layer': 'transportation',
        paint: { 'line-color': '#ffffff', 'line-width': 2 }
      }, '3d-buildings');
      m.triggerRepaint();
    })()`,
    awaitPromise: true
  });
  await new Promise(r => setTimeout(r, 800));

  let shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/shot_2_after_line.png', Buffer.from(shot2.data, 'base64'));
  console.log('Saved scratch/shot_2_after_line.png');

  chrome.kill();
  process.exit(0);
}
test();
