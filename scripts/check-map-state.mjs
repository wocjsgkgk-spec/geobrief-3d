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

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map || window.map;
      const store = window.__useMapStore?.getState();
      return {
        hasMap: !!map,
        currentCenter: map ? map.getCenter() : null,
        selectedRegionId: store?.selectedRegionId,
        flyToSignal: store?.flyToSignal,
      };
    })()`,
    returnByValue: true,
  });

  console.log('Diagnostic result:', check.result.value);
  ws.close();
}

main().catch(console.error);
