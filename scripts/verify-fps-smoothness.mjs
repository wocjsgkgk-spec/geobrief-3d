import { spawn } from 'child_process';
import http from 'http';

async function main() {
  console.log('[FPS-Verify] Launching headless Chrome on port 9223...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--window-size=1280,800',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') || versionData[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');

  await send('Page.navigate', { url: 'http://localhost:3110' });
  await new Promise((r) => setTimeout(r, 12000));

  // Perform continuous camera rotation & pan over 3 seconds and measure animation frame timing
  const perfResult = await send('Runtime.evaluate', {
    expression: `
      new Promise((resolve) => {
        const m = window.__map;
        if (!m) return resolve({ error: 'map not found' });

        let frameDeltas = [];
        let lastTime = performance.now();
        let running = true;

        function onFrame() {
          if (!running) return;
          const now = performance.now();
          frameDeltas.push(now - lastTime);
          lastTime = now;
          requestAnimationFrame(onFrame);
        }
        requestAnimationFrame(onFrame);

        // Pan map continuously
        let count = 0;
        const interval = setInterval(() => {
          m.panBy([10, 5], { duration: 80 });
          count++;
          if (count >= 20) {
            clearInterval(interval);
            running = false;
            const avgDelta = frameDeltas.reduce((a, b) => a + b, 0) / Math.max(1, frameDeltas.length);
            const maxDelta = Math.max(...frameDeltas);
            resolve({
              totalFrames: frameDeltas.length,
              avgFrameTimeMs: avgDelta.toFixed(1),
              maxFrameTimeMs: maxDelta.toFixed(1),
              isSmooth: maxDelta < 100 // no long freeze
            });
          }
        }, 100);
      });
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('[FPS-Verify] Pan Performance Test Result:');
  console.log(JSON.stringify(perfResult?.result?.value, null, 2));

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('[FPS-Verify] Fatal:', err);
  process.exit(1);
});
