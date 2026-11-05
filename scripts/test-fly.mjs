import http from 'http';

async function main() {
  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9249/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page' && t.url.includes('3000')) || versionData[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id).resolve(data.result);
      callbacks.delete(data.id);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  await send('Runtime.enable');

  const before = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.map;
      const store = window.__useMapStore?.getState();
      return {
        center: map ? [map.getCenter().lng, map.getCenter().lat] : null,
        selectedRegionId: store?.selectedRegionId,
        flyToSignal: store?.flyToSignal,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Before selectRegion:', before.result.value);

  // Call selectRegion('chuncheon')
  const afterCall = await send('Runtime.evaluate', {
    expression: `(() => {
      const store = window.__useMapStore?.getState();
      store.selectRegion('chuncheon');
      return {
        newRegion: store.selectedRegionId,
        newFlyToSignal: store.flyToSignal,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Immediately after selectRegion:', afterCall.result.value);

  // Wait 3 seconds
  await new Promise((r) => setTimeout(r, 3000));

  const afterWait = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.map;
      return {
        center: map ? [map.getCenter().lng, map.getCenter().lat] : null,
        zoom: map ? map.getZoom() : null,
      };
    })()`,
    returnByValue: true,
  });
  console.log('After 3s wait:', afterWait.result.value);

  ws.close();
}

main().catch(console.error);
