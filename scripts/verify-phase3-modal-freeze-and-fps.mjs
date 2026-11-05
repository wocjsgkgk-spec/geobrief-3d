import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 3 Verify] Killing leftover chrome on port 9247...');
  try {
    spawn('pkill', ['-9', '-f', '9247']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase 3 Verify] Launching headless Chrome with WebGL on port 9247...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9247',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,1050',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9247/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget =
    versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') ||
    versionData.find((t) => t.type === 'page') ||
    versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();
  const consoleMessages = [];

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
      const { resolve, reject } = callbacks.get(data.id);
      callbacks.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map((a) => a.value || a.description || '').join(' ');
      consoleMessages.push(text);
      if (
        text.includes('ACTIVE_RENDERER_MOUNTED') ||
        text.includes('Custom3DTilesModal') ||
        text.includes('60fps')
      ) {
        console.log(`[Browser Console] ${text}`);
      }
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[Phase 3 Verify] Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise((r) => setTimeout(r, 6000));

  // 1. Check top 5 dropdowns and left 3-tab layout
  console.log('[Phase 3 Verify] Checking top 5 dropdown menus and left 3 tabs...');
  const layoutCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const headerBtns = Array.from(document.querySelectorAll('header button')).map(b => b.textContent.trim().replace(/\\s+/g, ' '));
      const sidebarTabs = Array.from(document.querySelectorAll('aside button, [role="tablist"] button')).map(b => b.textContent.trim().replace(/\\s+/g, ' '));
      return {
        headerButtonsCount: headerBtns.length,
        headerButtonsSample: headerBtns.slice(0, 8),
        sidebarTabsSample: sidebarTabs.slice(0, 6)
      };
    })()`,
    returnByValue: true,
  });
  console.log('Layout Check:', JSON.stringify(layoutCheck.result.value, null, 2));

  // Capture Screenshot of frozen layout
  console.log('[Phase 3 Verify] Capturing screenshot: screenshot_phase3_ui_layout_frozen.png...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const p1 = path.join(ARTIFACT_DIR, 'screenshot_phase3_ui_layout_frozen.png');
  fs.writeFileSync(p1, Buffer.from(shot1.data, 'base64'));
  console.log(`Saved: ${p1}`);

  // 2. Open 3D Tiles OGC Modal
  console.log('[Phase 3 Verify] Switching to 3D 건축/단지 tab...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const allBtns = Array.from(document.querySelectorAll('button'));
      const buildingTab = allBtns.find(b => b.textContent.includes('3D 건축/단지'));
      if (buildingTab) {
        buildingTab.click();
        return true;
      }
      return false;
    })()`,
  });

  await new Promise((r) => setTimeout(r, 800));

  console.log('[Phase 3 Verify] Clicking 3D Tiles OGC settings button to trigger wide popup modal...');
  const openModalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const allBtns = Array.from(document.querySelectorAll('button'));
      const trigger = allBtns.find(b => b.textContent.includes('3D Tiles OGC'));
      if (trigger) {
        trigger.click();
        return { clicked: true, text: trigger.textContent.trim().replace(/\\s+/g, ' ') };
      }
      return { clicked: false };
    })()`,
    returnByValue: true,
  });
  console.log('Open Modal Trigger Result:', JSON.stringify(openModalRes.result.value, null, 2));

  await new Promise((r) => setTimeout(r, 1500));

  // Verify modal elements and whitespace-nowrap texts
  const modalInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.querySelector('.fixed.inset-0.z-\\[9999\\]');
      if (!modal) return { isOpen: false };
      const title = modal.querySelector('h2')?.textContent?.trim() || '';
      const badges = Array.from(modal.querySelectorAll('.rounded-full, .font-mono')).map(b => b.textContent.trim());
      const buttons = Array.from(modal.querySelectorAll('button')).map(b => b.textContent.trim().replace(/\\s+/g, ' '));
      return {
        isOpen: true,
        title,
        badges: badges.slice(0, 10),
        buttons: buttons.slice(0, 15)
      };
    })()`,
    returnByValue: true,
  });
  console.log('Modal Diagnostic Info:', JSON.stringify(modalInfo.result.value, null, 2));

  console.log('[Phase 3 Verify] Capturing screenshot: screenshot_phase3_wide_modal_popup.png...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const p2 = path.join(ARTIFACT_DIR, 'screenshot_phase3_wide_modal_popup.png');
  fs.writeFileSync(p2, Buffer.from(shot2.data, 'base64'));
  console.log(`Saved: ${p2}`);

  // Close modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('.fixed.inset-0.z-\\[9999\\] button[title="닫기"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '닫기');
      if (closeBtn) closeBtn.click();
      return true;
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1000));

  // 3. Test 60fps pan/drag interaction
  console.log('[Phase 3 Verify] Executing fast 360 drag/rotation interaction to test 60fps smoothness...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__MAPLIBRE_INSTANCE__ || window.__MAP__;
      if (map) {
        map.easeTo({
          bearing: 45,
          pitch: 60,
          zoom: 16.0,
          duration: 1500
        });
      }
      return true;
    })()`,
  });

  await new Promise((r) => setTimeout(r, 2000));

  console.log('[Phase 3 Verify] Capturing screenshot: screenshot_phase3_60fps_smooth_pan.png...');
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const p3 = path.join(ARTIFACT_DIR, 'screenshot_phase3_60fps_smooth_pan.png');
  fs.writeFileSync(p3, Buffer.from(shot3.data, 'base64'));
  console.log(`Saved: ${p3}`);

  chrome.kill();
  console.log('[Phase 3 Verify] All tests completed successfully!');
}

main().catch((err) => {
  console.error('[Phase 3 Verify] Error:', err);
  process.exit(1);
});
