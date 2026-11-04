import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 2 Authentic Atlas Verify] Killing leftover chrome on port 9248...');
  try {
    spawn('pkill', ['-9', '-f', '9248']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase 2 Authentic Atlas Verify] Launching headless Chrome on port 9248...');
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
    '--window-size=1600,1050',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
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
      if (text.includes('Multi-Material') || text.includes('RealisticKoreanCityLayer') || text.includes('동')) {
        console.log('   [CDP Browser Log]:', text);
      }
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  await send('Runtime.enable');
  await send('Page.enable');

  console.log('[Phase 2 Authentic Atlas Verify] Navigating to http://localhost:3000 ...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  // 30초 대기
  console.log('[Phase 2 Authentic Atlas Verify] Waiting 30s for 16 authentic materials and thousands of buildings...');
  for (let s = 1; s <= 30; s++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (s % 5 === 0) console.log(`   ... waited ${s}s`);
  }

  // 1. 전체 조감 샷 (16종 다채로운 외벽 및 초록 우레탄/콘크리트 옥상 조감)
  const ss1 = await send('Page.captureScreenshot', { format: 'png' });
  const p1 = path.join(ARTIFACT_DIR, 'screenshot_phase2_authentic_16styles_overview.png');
  fs.writeFileSync(p1, Buffer.from(ss1.data, 'base64'));
  console.log('[Phase 2 Authentic Atlas Verify] Saved overview screenshot to:', p1);

  // 2. 아파트 단지 발코니 창틀 & 기단부 & 측벽 클로즈업
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (map) {
        map.flyTo({
          center: [127.9545, 37.3375],
          zoom: 17.0,
          pitch: 65,
          bearing: -28,
          duration: 0
        });
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 5000));
  const ss2 = await send('Page.captureScreenshot', { format: 'png' });
  const p2 = path.join(ARTIFACT_DIR, 'screenshot_phase2_apartment_brands_detail.png');
  fs.writeFileSync(p2, Buffer.from(ss2.data, 'base64'));
  console.log('[Phase 2 Authentic Atlas Verify] Saved apartment brands screenshot to:', p2);

  // 3. 상가 1층 쇼윈도, 빨강/파랑/노랑 컬러 간판, 적벽돌 상가주택
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (map) {
        map.flyTo({
          center: [127.9460, 37.3420],
          zoom: 17.2,
          pitch: 62,
          bearing: 35,
          duration: 0
        });
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 5000));
  const ss3 = await send('Page.captureScreenshot', { format: 'png' });
  const p3 = path.join(ARTIFACT_DIR, 'screenshot_phase2_commercial_signboards_detail.png');
  fs.writeFileSync(p3, Buffer.from(ss3.data, 'base64'));
  console.log('[Phase 2 Authentic Atlas Verify] Saved commercial signboards screenshot to:', p3);

  // 4. 반곡동 혁신도시 유리 커튼월 청사 및 학교 교사동
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (map) {
        map.flyTo({
          center: [127.9785, 37.3245],
          zoom: 16.5,
          pitch: 60,
          bearing: 55,
          duration: 0
        });
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 5000));
  const ss4 = await send('Page.captureScreenshot', { format: 'png' });
  const p4 = path.join(ARTIFACT_DIR, 'screenshot_phase2_innovation_and_school_detail.png');
  fs.writeFileSync(p4, Buffer.from(ss4.data, 'base64'));
  console.log('[Phase 2 Authentic Atlas Verify] Saved innovation & school screenshot to:', p4);

  // 5. 옥상 0.9m 난간 + 우레탄 녹색/콘크리트 바닥 + 3m 옥탑방 버드아이 뷰
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (map) {
        map.flyTo({
          center: [127.9520, 37.3400],
          zoom: 17.5,
          pitch: 45,
          bearing: 10,
          duration: 0
        });
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 5000));
  const ss5 = await send('Page.captureScreenshot', { format: 'png' });
  const p5 = path.join(ARTIFACT_DIR, 'screenshot_phase2_rooftop_parapets_urethane_detail.png');
  fs.writeFileSync(p5, Buffer.from(ss5.data, 'base64'));
  console.log('[Phase 2 Authentic Atlas Verify] Saved rooftop parapets screenshot to:', p5);

  // 텔레메트리 평가
  const evalResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const layer = window.__realisticKoreanCityLayer;
      if (!layer || !layer.masterMesh) return { error: 'layer_or_mesh_not_ready' };
      const geo = layer.masterMesh.geometry;
      const groups = geo.groups || [];
      const materials = layer.buildingMaterials || [];

      const dist = {};
      for (let i = 0; i < 16; i++) dist[i] = 0;
      for (const g of groups) {
        dist[g.materialIndex] = (dist[g.materialIndex] || 0) + 1;
      }

      const materialNames = materials.map((m, idx) => ({
        index: idx,
        name: m.name,
        roughness: m.roughness,
        metalness: m.metalness,
        hasMap: Boolean(m.map),
      }));

      return {
        groupsLength: groups.length,
        materialsCount: materials.length,
        materialDistribution: dist,
        totalTriangles: geo.getAttribute('position').count / 3,
        rooftopTriangles: layer.rooftopMesh?.geometry ? layer.rooftopMesh.geometry.getAttribute('position').count / 3 : 0,
        materialNames,
        builtKeysCount: layer.builtBuildingKeys ? layer.builtBuildingKeys.size : 0,
      };
    })()`,
    returnByValue: true,
  });

  console.log('[PHASE 2 AUTHENTIC ATLAS TELEMETRY]:', JSON.stringify(evalResult.result.value, null, 2));

  ws.close();
  try {
    chrome.kill('SIGKILL');
  } catch {}

  console.log('[Phase 2 Authentic Atlas Verify] Verification completed!');
}

main().catch((err) => {
  console.error('[Phase 2 Authentic Atlas Verify] Fatal Error:', err);
  process.exit(1);
});
