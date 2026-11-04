import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase 1 Multi-Material Verify] Killing leftover chrome on port 9246...');
  try {
    spawn('pkill', ['-9', '-f', '9246']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase 1 Multi-Material Verify] Launching headless Chrome with WebGL SwiftShader on port 9246...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9246',
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
    http.get('http://127.0.0.1:9246/json/list', (res) => {
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

  console.log('[Phase 1 Multi-Material Verify] Navigating to http://localhost:3000 ...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  // 25초 동안 타일 및 피처 로드 & 타임슬라이싱 완료 대기
  console.log('[Phase 1 Multi-Material Verify] Waiting 25s for multi-material building mesh to complete...');
  for (let s = 1; s <= 25; s++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (s % 5 === 0) console.log(`   ... waited ${s}s`);
  }

  // 텔레메트리 평가
  const evalResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const layer = window.__realisticKoreanCityLayer;
      if (!layer) return { error: 'layer_not_found' };
      const mesh = layer.masterMesh;
      if (!mesh) return { error: 'mesh_not_found', builtKeys: layer.builtBuildingKeys ? layer.builtBuildingKeys.size : 0 };
      const geo = mesh.geometry;
      const groups = geo.groups || [];
      const materials = layer.buildingMaterials || [];

      // materialIndex 별 그룹 분포 계산
      const materialDistribution = {};
      for (let i = 0; i < 16; i++) {
        materialDistribution[i] = 0;
      }
      for (const g of groups) {
        materialDistribution[g.materialIndex] = (materialDistribution[g.materialIndex] || 0) + 1;
      }

      const posAttr = geo.getAttribute('position');
      const vertexCount = posAttr ? posAttr.count : 0;
      const triangleCount = vertexCount / 3;

      return {
        groupsLength: groups.length,
        materialsLength: materials.length,
        materialDistribution,
        vertexCount,
        triangleCount,
        builtKeys: layer.builtBuildingKeys ? layer.builtBuildingKeys.size : 0,
        hasRooftopMesh: Boolean(layer.rooftopMesh),
        rooftopTriangles: layer.rooftopMesh && layer.rooftopMesh.geometry ? (layer.rooftopMesh.geometry.getAttribute('position').count / 3) : 0,
        first5Groups: groups.slice(0, 5),
        sampleGroupEnd: groups.slice(-5),
        uniqueMaterialCount: Object.keys(materialDistribution).filter(k => materialDistribution[k] > 0).length,
      };
    })()`,
    returnByValue: true,
  });

  console.log('[Phase 1 Multi-Material Full Telemetry]:', JSON.stringify(evalResult.result.value, null, 2));

  // 1. 전체 조감 샷 캡처
  const ss1 = await send('Page.captureScreenshot', { format: 'png' });
  const p1 = path.join(ARTIFACT_DIR, 'screenshot_phase1_multimaterial_16styles_overview.png');
  fs.writeFileSync(p1, Buffer.from(ss1.data, 'base64'));
  console.log('[Phase 1 Multi-Material Verify] Saved overview screenshot to:', p1);

  // 2. 근접 각도로 회전 및 확대 (아파트 단지 발코니 창문 및 16종 독립 외벽 텍스처 클로즈업)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (map) {
        map.flyTo({
          center: [127.9545, 37.3375],
          zoom: 16.8,
          pitch: 62,
          bearing: -25,
          duration: 0
        });
      }
    })()`,
  });

  await new Promise((r) => setTimeout(r, 5000));

  const ss2 = await send('Page.captureScreenshot', { format: 'png' });
  const p2 = path.join(ARTIFACT_DIR, 'screenshot_phase1_multimaterial_facades_detail.png');
  fs.writeFileSync(p2, Buffer.from(ss2.data, 'base64'));
  console.log('[Phase 1 Multi-Material Verify] Saved facade detail screenshot to:', p2);

  // 3. 상가 및 반곡동 혁신도시 업무지구 각도
  await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (map) {
        map.flyTo({
          center: [127.9785, 37.3245],
          zoom: 16.4,
          pitch: 65,
          bearing: 45,
          duration: 0
        });
      }
    })()`,
  });

  await new Promise((r) => setTimeout(r, 5000));

  const ss3 = await send('Page.captureScreenshot', { format: 'png' });
  const p3 = path.join(ARTIFACT_DIR, 'screenshot_phase1_multimaterial_commercial_detail.png');
  fs.writeFileSync(p3, Buffer.from(ss3.data, 'base64'));
  console.log('[Phase 1 Multi-Material Verify] Saved commercial detail screenshot to:', p3);

  ws.close();
  try {
    chrome.kill('SIGKILL');
  } catch {}

  console.log('[Phase 1 Multi-Material Verify] Done!');
}

main().catch((err) => {
  console.error('[Phase 1 Multi-Material Verify] Fatal Error:', err);
  process.exit(1);
});
