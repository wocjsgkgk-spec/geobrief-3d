import { spawn } from 'child_process';

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/cdp_net',
  'http://127.0.0.1:8080'
]);

await new Promise((r) => setTimeout(r, 2000));

try {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  const target = list.find((t) => t.url.includes('8080'));
  if (!target) {
    chrome.kill();
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const msgId = id++;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  await new Promise((r) => (ws.onopen = r));

  const networkLogs = [];
  ws.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.method === 'Network.responseReceived') {
      const { url, status, statusText } = data.params.response;
      if (url.includes('tile') || url.includes('dem') || url.includes('arcgis') || url.includes('google') || url.includes('vworld')) {
        networkLogs.push(`[RESP ${status}] ${url.slice(0, 100)}`);
      }
    } else if (data.method === 'Network.loadingFailed') {
      const { errorText } = data.params;
      networkLogs.push(`[FAILED: ${errorText}]`);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      if (data.params.type === 'error' || data.params.type === 'warning') {
        console.log(`[CONSOLE ${data.params.type}]`, args);
      }
    }
  });

  await send('Network.enable');
  await send('Runtime.enable');
  await send('Page.enable');

  await new Promise((r) => setTimeout(r, 6000));

  console.log('--- Network Logs (Tile/Source Requests) ---');
  console.log(networkLogs.slice(0, 30).join('\n'));

  // Evaluate map layers & visibility
  const mapState = await send('Runtime.evaluate', {
    expression: `
      (() => {
        // Find maplibregl map instance
        const canvases = document.querySelectorAll('canvas');
        return {
          canvasCount: canvases.length,
          canvasRect: canvases[0] ? canvases[0].getBoundingClientRect() : null,
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Map State in DOM:', mapState.result?.value);

} catch (err) {
  console.error(err);
} finally {
  chrome.kill();
  process.exit(0);
}
