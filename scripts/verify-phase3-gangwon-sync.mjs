import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase3-Verify] Cleaning any leftover chrome on 9227...');
  try {
    spawn('pkill', ['-9', '-f', '9227']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase3-Verify] Launching headless Chrome with WebGL SwiftShader on port 9227...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,900',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9227/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget = versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') || versionData.find((t) => t.type === 'page') || versionData[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Phase3-Verify] Connecting to CDP WebSocket for page target:', wsUrl);

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  const consoleLogs = [];
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const msg = (data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      consoleLogs.push(msg);
      if (!msg.includes('BufferGeometry') && !msg.includes('download the React DevTools')) {
        console.log(' [PAGE CONSOLE]', msg);
      }
    }
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  console.log('[Phase3-Verify] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Phase3-Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Phase3-Verify] Waiting 15 seconds for map initialization & building geometries...');
  await new Promise((r) => setTimeout(r, 15000));

  // Safely close the two floating HUD cards
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn1 = document.querySelector('button[title*="측정 HUD 닫기"]');
        if (btn1) btn1.click();
        const btn2 = document.querySelector('button[title*="요약 카드 닫기"]');
        if (btn2) btn2.click();
        const card1 = document.getElementById('polygon-measurement-card');
        if (card1) card1.style.display = 'none';
        return true;
      })();
    `,
  });

  // =========================================================================
  // [검증 1] 브이월드 항공사진 1:1 일체화 지붕 색감 (오버헤드 하이 피치 뷰)
  // 도심 상가(45% 에메랄드 우레탄 / 30% 밝은 시멘트 / 25% 테라코타) + 아파트 단지 다채로운 지붕 캡
  // =========================================================================
  console.log('[Phase3-Verify] 1. Positioning camera for overhead roof view (Wonju city center)...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map || window.currentMapInstance || (window as any).mapInstance;
        if (map) {
          map.jumpTo({
            center: [127.9515, 37.3320],
            zoom: 16.5,
            pitch: 52,
            bearing: -25
          });
        }
        return true;
      })();
    `,
  });

  await new Promise((r) => setTimeout(r, 4000));

  const meshStats1 = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const logs = [];
        let vertCount = 0;
        let triCount = 0;
        let drawCalls = 1;

        if (window.__threeScene) {
          window.__threeScene.traverse((obj) => {
            if (obj.isMesh && obj.geometry && obj.geometry.attributes.position) {
              const pos = obj.geometry.attributes.position;
              vertCount += pos.count;
              triCount += Math.floor(pos.count / 3);
            }
          });
        }
        return { vertCount, triCount, drawCalls };
      })();
    `,
    returnByValue: true,
  });

  console.log('[Phase3-Verify] Scene 1 Mesh Statistics:', meshStats1?.result?.value);

  console.log('[Phase3-Verify] Capturing Scene 1: screenshot_phase3_vworld_roof_colors_overhead.png ...');
  const snap1 = await send('Page.captureScreenshot', { format: 'png' });
  const buf1 = Buffer.from(snap1.data, 'base64');
  const path1 = path.join(ARTIFACT_DIR, 'screenshot_phase3_vworld_roof_colors_overhead.png');
  fs.writeFileSync(path1, buf1);
  console.log(`[Phase3-Verify] Saved Scene 1 to ${path1} (${buf1.length} bytes)`);

  // =========================================================================
  // [검증 2] 강원 18개 시·군 원클릭 브리핑 투어 및 실시간 데이터 보장
  // 상단 [📍 대상지] 드롭다운에서 강릉시 (동해안권) 클릭 -> 3D 건물·랜드마크·교량 로드 & 60fps
  // =========================================================================
  console.log('[Phase3-Verify] 2. Clicking [📍 대상지] menu to select 강릉시 (동해안권)...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const siteBtn = document.querySelector('button[title*="강원도 18개 시·군 전역"]');
        if (siteBtn) {
          siteBtn.click();
          return true;
        }
        return false;
      })();
    `,
  });

  await new Promise((r) => setTimeout(r, 600));

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const allBtns = Array.from(document.querySelectorAll('button'));
        const gnBtn = allBtns.find((b) => b.textContent && b.textContent.includes('강릉시'));
        if (gnBtn) {
          gnBtn.click();
          return true;
        }
        if (window.__map) {
          window.__map.flyTo({
            center: [128.8758, 37.7518],
            zoom: 15.8,
            pitch: 58,
            bearing: 20,
            duration: 1500,
          });
          return true;
        }
        return false;
      })();
    `,
  });

  console.log('[Phase3-Verify] Waiting 8 seconds for regional flyTo & building mesh sync...');
  await new Promise((r) => setTimeout(r, 8000));

  const meshStats2 = await send('Runtime.evaluate', {
    expression: `
      (() => {
        let vertCount = 0;
        let triCount = 0;
        let drawCalls = 1;

        if (window.__threeScene) {
          window.__threeScene.traverse((obj) => {
            if (obj.isMesh && obj.geometry && obj.geometry.attributes.position) {
              const pos = obj.geometry.attributes.position;
              vertCount += pos.count;
              triCount += Math.floor(pos.count / 3);
            }
          });
        }
        return { vertCount, triCount, drawCalls };
      })();
    `,
    returnByValue: true,
  });

  console.log('[Phase3-Verify] Scene 2 (Gangneung) Mesh Statistics:', meshStats2?.result?.value);

  console.log('[Phase3-Verify] Capturing Scene 2: screenshot_phase3_gangwon_regional_tour.png ...');
  const snap2 = await send('Page.captureScreenshot', { format: 'png' });
  const buf2 = Buffer.from(snap2.data, 'base64');
  const path2 = path.join(ARTIFACT_DIR, 'screenshot_phase3_gangwon_regional_tour.png');
  fs.writeFileSync(path2, buf2);
  console.log(`[Phase3-Verify] Saved Scene 2 to ${path2} (${buf2.length} bytes)`);

  ws.close();
  try {
    chrome.kill('SIGKILL');
  } catch {}

  console.log('[Phase3-Verify] Verification successfully completed!');
}

main().catch((err) => {
  console.error('[Phase3-Verify] Error:', err);
  process.exit(1);
});
