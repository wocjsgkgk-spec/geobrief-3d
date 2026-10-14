const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9246',
    '--user-data-dir=/tmp/cdp_diag_' + Date.now(),
    '--window-size=1600,900',
    'http://127.0.0.1:8080'
  ]);

  await new Promise(r => setTimeout(r, 2500));
  let target;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9246/json/list');
      const list = await res.json();
      target = list.find(t => t.url && t.url.includes('8080'));
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!target) {
    console.log('Target not found');
    chrome.kill();
    process.exit(1);
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

  const consoleLogs = [];
  ws.addEventListener('message', (evt) => {
    const d = JSON.parse(evt.data);
    if (d.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push({ type: d.params.type, text: d.params.args.map(a => a.value || a.description).join(' ') });
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  
  await new Promise(r => setTimeout(r, 6000));

  const diag = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window.__map;
      if (!m) return { err: 'no map' };
      const scLayer = m.getLayer('smart-city-complex-3d-layer');
      const lod2Layer = m.getLayer('lod2-building-engine-layer');
      const b3dLayer = m.getLayer('3d-buildings');
      const bRoofLayer = m.getLayer('3d-buildings-roof');

      const scObj = scLayer?.implementation;
      const lod2Obj = lod2Layer?.implementation;

      return {
        hasScLayer: !!scLayer,
        scVisible: scObj?.isVisible,
        scScaleY: scObj?.scaleY,
        scHasRenderer: !!scObj?.renderer,
        scClampedAlt: scObj?.clampedAltitude,
        scCenter: scObj?.centerLngLat,
        scMeshChildren: scObj?.complexMesh?.children?.length,
        hasLod2Layer: !!lod2Layer,
        lod2Visible: lod2Obj?.isVisible,
        has3dBuildings: !!b3dLayer,
        b3dVisible: m.getLayoutProperty('3d-buildings', 'visibility'),
        has3dRoof: !!bRoofLayer,
        bRoofVisible: m.getLayoutProperty('3d-buildings-roof', 'visibility'),
      };
    })()`,
    returnByValue: true
  });

  console.log('DIAGNOSTIC RESULT:\n', JSON.stringify(diag.result.value, null, 2));
  console.log('\nRECENT CONSOLE LOGS:\n', consoleLogs.slice(-25));

  ws.close();
  chrome.kill();
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
