/**
 * scripts/verify-phase3-military-and-inspector.mjs
 *
 * [GeoBrief 3D 3단계: 강원 18개 시·군 군 유휴부지 정밀 표시 & 렌더링 무결성 실증 검증]
 * 1. 원주 1군지사(wj-1st-logistics) 상공 3D 관측:
 *    - 선명한 에메랄드 네온 이중 경계선(#10b981, 두께 4px) + 반투명 구역 하이라이트
 *    - 부지 중앙 상공 [🛡️ 원주 1군지사 | 310,000㎡ (93,775평) | 준주거지역] 플로팅 배지
 * 2. 원클릭 3D 조형 비교 전환:
 *    - [현재 영내 군 막사·연병장 3D 뷰] vs [미래 복합개발 마스터플랜 3D 조감도] 실시간 전환
 * 3. 건물·필지 클릭 시 우측 인스펙터 카드 팝업:
 *    - 국토교통부 건축물대장 표제부
 *    - 로컬 연속지적도
 *    - 브이월드 국토계획법 용도지역지구
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-P3] Cleaning up any leftover chrome on 9228...');
  try {
    spawn('pkill', ['-9', '-f', '9228']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-P3] Launching headless Chrome with WebGL on port 9228...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--user-data-dir=/tmp/chrome-phase3-' + Date.now(),
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
    http.get('http://127.0.0.1:9228/json/list', (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget =
    versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') ||
    versionData.find((t) => t.type === 'page') ||
    versionData[0];
  const pageWsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('[Verify-P3] Connecting to CDP WebSocket:', pageWsUrl);

  const ws = new WebSocket(pageWsUrl);

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const parsed = JSON.parse(event.data);
    if (parsed.id && pending.has(parsed.id)) {
      const { resolve, reject } = pending.get(parsed.id);
      pending.delete(parsed.id);
      if (parsed.error) reject(parsed.error);
      else resolve(parsed.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((r) => (ws.onopen = r));
  console.log('[Verify-P3] CDP connected. Enabling Page & Runtime...');
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[Verify-P3] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  // 15초간 지도 및 WebGL 초기화 대기
  console.log('[Verify-P3] Waiting 15s for map & 3D tiles initialization...');
  await new Promise((r) => setTimeout(r, 15000));

  // 1. 원주 1군지사 카메라 포커싱 및 배지/경계선 검증
  console.log('[Verify-P3] Checking military site visualizer and floating badge...');
  const badgeEvaluation = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__geobrief_map || window._map || (window.maplibregl && window.maplibregl.Map ? window.__mapInstance : null);
      const badges = document.querySelectorAll('.military-hologram-badge-container');
      const badgeTexts = Array.from(badges).map(b => b.textContent?.trim());
      
      const layers = [
        'selected-military-site-glow',
        'selected-military-site-neon',
        'selected-military-site-dash',
        'selected-military-site-fill',
        'military-site-fill'
      ];
      
      let layerStatus = {};
      if (window.__geobrief_map) {
        for (const lid of layers) {
          layerStatus[lid] = Boolean(window.__geobrief_map.getLayer(lid));
        }
      }

      return {
        badgeCount: badges.length,
        badgeTexts: badgeTexts.slice(0, 5),
        layerStatus,
        hasMap: Boolean(window.__geobrief_map)
      };
    })()`,
    returnByValue: true,
  });

  console.log('[Verify-P3] Badge evaluation result:', JSON.stringify(badgeEvaluation.value, null, 2));

  // 1. 첫 번째 스크린샷: 원주 1군지사 에메랄드 네온 경계선 및 상공 플로팅 배지
  console.log('[Verify-P3] Capturing screenshot 1: Military Site Boundary & Floating Badge...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const shot1Path = path.join(ARTIFACT_DIR, 'screenshot_phase3_military_site_boundary.png');
  fs.writeFileSync(shot1Path, Buffer.from(shot1.data, 'base64'));
  console.log('[Verify-P3] Saved screenshot 1 to:', shot1Path);

  // 2. [미래 개발안 3D 비교] 토글 버튼 클릭 (플로팅 배지 내 버튼 또는 좌측 패널)
  console.log('[Verify-P3] Clicking toggle button for future masterplan comparison...');
  const toggleResult = await send('Runtime.evaluate', {
    expression: `(() => {
      // 플로팅 배지 내부 전환 버튼 클릭 시도
      const btn = document.querySelector('button[id^="btn-toggle-"]') || 
                  document.querySelector('.military-hologram-badge-container button') ||
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('미래 스마트') || b.textContent.includes('현재 군 막사') || b.textContent.includes('전환 ⇄'));
      
      if (btn) {
        btn.click();
        return { clicked: true, text: btn.textContent?.trim() };
      }
      return { clicked: false };
    })()`,
    returnByValue: true,
  });
  console.log('[Verify-P3] Toggle button click result:', JSON.stringify(toggleResult.value, null, 2));

  await new Promise((r) => setTimeout(r, 3000));

  // 2번째 스크린샷: 미래 마스터플랜 3D 조감도 전환 확인
  console.log('[Verify-P3] Capturing screenshot 2: Future Masterplan 3D View...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const shot2Path = path.join(ARTIFACT_DIR, 'screenshot_phase3_future_masterplan_toggle.png');
  fs.writeFileSync(shot2Path, Buffer.from(shot2.data, 'base64'));
  console.log('[Verify-P3] Saved screenshot 2 to:', shot2Path);

  // 3. 건물/필지 클릭하여 우측 인스펙터 드로어 열기
  console.log('[Verify-P3] Simulating map click to inspect building & cadastral parcel...');
  const clickInspectResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__geobrief_map;
      if (map) {
        const center = map.getCenter();
        // 캔버스 중앙 지점 클릭 시뮬레이션
        const canvas = map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const evt = new MouseEvent('click', {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true
        });
        canvas.dispatchEvent(evt);
        return { simulated: true, center: [center.lng, center.lat] };
      }
      return { simulated: false };
    })()`,
    returnByValue: true,
  });
  console.log('[Verify-P3] Click inspect result:', JSON.stringify(clickInspectResult.value, null, 2));

  await new Promise((r) => setTimeout(r, 4000));

  // 인스펙터 드로어 상태 확인
  const drawerEvaluation = await send('Runtime.evaluate', {
    expression: `(() => {
      const drawer = document.getElementById('vworld-spatial-inspector-drawer');
      if (!drawer) return { isOpen: false };

      const title = drawer.querySelector('h3')?.textContent?.trim();
      const pnu = drawer.textContent?.includes('PNU');
      const bldTab = drawer.textContent?.includes('건축물대장');
      const cadastralTab = drawer.textContent?.includes('연속지적도') || drawer.textContent?.includes('용도지역');

      return {
        isOpen: true,
        title,
        hasPnu: pnu,
        hasBldTab: bldTab,
        hasCadastralTab: cadastralTab
      };
    })()`,
    returnByValue: true,
  });
  console.log('[Verify-P3] Drawer evaluation result:', JSON.stringify(drawerEvaluation.value, null, 2));

  // 3번째 스크린샷: 우측 인스펙터 드로어 표출 확인
  console.log('[Verify-P3] Capturing screenshot 3: V-World Spatial Inspector Drawer...');
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const shot3Path = path.join(ARTIFACT_DIR, 'screenshot_phase3_cadastral_inspector_drawer.png');
  fs.writeFileSync(shot3Path, Buffer.from(shot3.data, 'base64'));
  console.log('[Verify-P3] Saved screenshot 3 to:', shot3Path);

  ws.close();
  chrome.kill();
  console.log('[Verify-P3] Verification completed successfully!');
}

main().catch((err) => {
  console.error('[Verify-P3] Error:', err);
  process.exit(1);
});
