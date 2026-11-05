import { spawn } from 'child_process';
import http from 'http';

async function main() {
  console.log('[Verify Active Renderer] Killing port 9248...');
  try { spawn('pkill', ['-9', '-f', '9248']); } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9248',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,800',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9248/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();
  const logs = [];

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
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map((a) => a.value || a.description || '').join(' ');
      logs.push(text);
      if (text.includes('ACTIVE_RENDERER_MOUNTED')) {
        console.log('>>> [BROWSER CONSOLE CAPTURE]:', text);
      }
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  // 10초 대기
  for (let s = 1; s <= 10; s++) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  const activeLogs = logs.filter((l) => l.includes('ACTIVE_RENDERER_MOUNTED'));
  console.log('[VERIFICATION RESULT]: Found active renderer mount logs:');
  console.log(activeLogs);

  ws.close();
  chrome.kill('SIGKILL');
}

main().catch(console.error);
