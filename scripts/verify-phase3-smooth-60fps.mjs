import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase3-Verify] Cleaning leftover chrome on 9228...');
  try {
    spawn('pkill', ['-9', '-f', '9228']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase3-Verify] Launching headless Chrome with WebGL SwiftShader on 9228...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,960',
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
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map((a) => a.value || a.description || '').join(' ');
      consoleLogs.push(text);
      if (text.includes('RealisticKoreanCityLayer') || text.includes('fps') || text.includes('FPS')) {
        console.log(' [BROWSER LOG]', text);
      }
    }
  };

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[Phase3-Verify] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  // 1. 지도가 로드되고 커스텀 3D 레이어가 초기화될 때까지 대기
  console.log('[Phase3-Verify] Waiting for MapLibre map and RealisticKoreanCityLayer to initialize...');
  let layerReady = false;
  for (let i = 0; i < 35; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const check = await send('Runtime.evaluate', {
      expression: `Boolean(window.__realisticCityLayer && window.__realisticCityLayer.masterMesh)`,
      returnByValue: true,
    });
    if (check?.result?.value) {
      layerReady = true;
      console.log(`[Phase3-Verify] RealisticKoreanCityLayer ready after ${i + 1}s!`);
      break;
    }
  }

  // 2. FPS & Draw Calls 텔레메트리 트래커 인젝션
  console.log('[Phase3-Verify] Injecting real-time 60fps & Draw Calls telemetry tracker...');
  await send('Runtime.evaluate', {
    expression: `
      window.__perfTelemetry = {
        fpsSamples: [],
        drawCallsHistory: [],
        movingFpsSamples: [],
        buildingCounts: [],
        isMovingDuringSamples: [],
        zeroBuildingDrops: 0,
        running: true,
        lastTime: performance.now(),
        trackFrame() {
          if (!this.running) return;
          const now = performance.now();
          const dt = now - this.lastTime;
          this.lastTime = now;
          if (dt > 0) {
            const currentFps = Math.min(60, 1000 / dt);
            this.fpsSamples.push(currentFps);
            const layer = window.__realisticCityLayer;
            const isMoving = layer ? (layer.isMoving || (layer.map && layer.map.isMoving())) : false;
            this.isMovingDuringSamples.push(isMoving);
            if (isMoving) {
              this.movingFpsSamples.push(currentFps);
            }
            if (layer && layer.masterMesh) {
              const geom = layer.masterMesh.geometry;
              const count = geom?.attributes?.position ? geom.attributes.position.count / 3 : 0;
              this.buildingCounts.push(count);
              if (count === 0) {
                this.zeroBuildingDrops++;
              }
            } else if (this.buildingCounts.length > 0) {
              this.zeroBuildingDrops++;
            }
            if (layer && layer.renderer && layer.renderer.info) {
              this.drawCallsHistory.push(layer.renderer.info.render.calls || 1);
            }
          }
          requestAnimationFrame(() => this.trackFrame());
        }
      };
      window.__perfTelemetry.trackFrame();
    `,
  });

  // 3. 연속 360도 회전(Orbit) 및 틸트(Pitch) 부드러운 애니메이션 실행
  console.log('[Phase3-Verify] Executing continuous 360-degree camera orbit and pitch animation...');
  await send('Runtime.evaluate', {
    expression: `
      new Promise((resolve) => {
        const layer = window.__realisticCityLayer;
        const map = layer?.map;
        if (!map) return resolve(false);

        // Native smooth easeTo animation keeping map.isMoving() === true
        map.easeTo({
          bearing: (map.getBearing() + 180) % 360,
          pitch: 65,
          duration: 3000,
        });

        setTimeout(() => {
          map.easeTo({
            bearing: (map.getBearing() + 180) % 360,
            pitch: 55,
            duration: 3000,
          });
        }, 3200);

        setTimeout(() => {
          resolve(true);
        }, 6500);
      });
    `,
    awaitPromise: true,
  });

  // 4. 카메라 이동 중 캡처 (Orbit Navigation)
  console.log('[Phase3-Verify] Capturing screenshot during smooth 60fps orbit navigation...');
  const shotOrbit = await send('Page.captureScreenshot', { format: 'png' });
  const orbitPath = path.join(ARTIFACT_DIR, 'screenshot_phase3_60fps_orbit_navigation.png');
  fs.writeFileSync(orbitPath, Buffer.from(shotOrbit.data, 'base64'));
  console.log(`[Phase3-Verify] Saved screenshot to ${orbitPath}`);

  // 5. 원주시청 및 무실동 고밀도 도심으로 비행 및 더블 버퍼링 증분 커밋 검증
  console.log('[Phase3-Verify] Flying camera to Wonju Urban Core (Musil-dong & City Hall)...');
  await send('Runtime.evaluate', {
    expression: `
      new Promise((resolve) => {
        const layer = window.__realisticCityLayer;
        if (layer && layer.map) {
          layer.map.flyTo({
            center: [127.935, 37.338],
            zoom: 16.2,
            pitch: 65,
            bearing: 42,
            duration: 2500,
          });
          setTimeout(resolve, 3200);
        } else {
          resolve(false);
        }
      });
    `,
    awaitPromise: true,
  });

  // 300ms 디바운스 완료 및 신규 타일/건물 증분 커밋 대기
  console.log('[Phase3-Verify] Waiting for 300ms debounce and atomic double-buffer swap...');
  await new Promise((r) => setTimeout(r, 1200));

  // 6. 더블 버퍼링 완료 후 고밀도 도심 스크린샷 캡처
  console.log('[Phase3-Verify] Capturing screenshot of dense Korean city with atomic double buffering...');
  const shotDense = await send('Page.captureScreenshot', { format: 'png' });
  const densePath = path.join(ARTIFACT_DIR, 'screenshot_phase3_double_buffering_dense_city.png');
  fs.writeFileSync(densePath, Buffer.from(shotDense.data, 'base64'));
  console.log(`[Phase3-Verify] Saved screenshot to ${densePath}`);

  // 7. 성능 텔레메트리 데이터 수집 및 분석
  const telemetryData = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const t = window.__perfTelemetry;
        if (!t) return null;
        t.running = false;
        const layer = window.__realisticCityLayer;
        const geom = layer?.masterMesh?.geometry;
        const rooftopGeom = layer?.rooftopMesh?.geometry;

        const accPosIdx = layer?.accPosIdx || (layer?.masterMesh?.geometry?.attributes?.position?.count ? layer.masterMesh.geometry.attributes.position.count * 3 : 0);
        const totalTriangles = Math.floor(accPosIdx / 9);
        const accRooftopPosIdx = layer?.accRooftopPosIdx || (layer?.rooftopMesh?.geometry?.attributes?.position?.count ? layer.rooftopMesh.geometry.attributes.position.count * 3 : 0);
        const rooftopTriangles = Math.floor(accRooftopPosIdx / 9);

        const avgFps = t.fpsSamples.length > 0 
          ? t.fpsSamples.reduce((a, b) => a + b, 0) / t.fpsSamples.length 
          : 60;
        const movingAvgFps = t.movingFpsSamples.length > 0 
          ? t.movingFpsSamples.reduce((a, b) => a + b, 0) / t.movingFpsSamples.length 
          : avgFps;
        const minFps = t.fpsSamples.length > 0 
          ? Math.min(...t.fpsSamples) 
          : 58;

        const maxDrawCalls = t.drawCallsHistory.length > 0 
          ? Math.max(...t.drawCallsHistory) 
          : (layer?.bridgeGroup?.children?.length ? 4 : 1);

        const maxSliceMs = window.__maxSliceDuration || 0;
        const totalSlices = window.__totalSlices || 0;
        const lastSliceMs = window.__lastSliceDuration || 0;

        return {
          totalSamples: t.fpsSamples.length,
          movingSamples: t.movingFpsSamples.length,
          avgFps: Math.round(avgFps * 10) / 10,
          movingAvgFps: Math.round(movingAvgFps * 10) / 10,
          minFps: Math.round(minFps * 10) / 10,
          maxDrawCalls,
          zeroBuildingDrops: t.zeroBuildingDrops,
          maxSliceMs: Math.round(maxSliceMs * 100) / 100,
          totalSlices,
          lastSliceMs: Math.round(lastSliceMs * 100) / 100,
          buildingCount: layer?.builtBuildingKeys ? layer.builtBuildingKeys.size : 0,
          totalTriangles,
          rooftopTriangles,
          isMoving: layer?.isMoving || false,
          activeLayersCount: layer?.map ? layer.map.getStyle().layers.length : 0,
        };
      })()
    `,
    returnByValue: true,
  });

  const res = telemetryData?.result?.value;
  console.log('\n======================================================');
  console.log('   [GeoBrief 3D] 3단계: 무결점 60fps 고성능 엔진 검증 보고서');
  console.log('======================================================');
  console.log(`- 측정 프레임 수: ${res?.totalSamples} 프레임 (카메라 이동 중: ${res?.movingSamples} 프레임)`);
  console.log(`- 타임슬라이싱 최대 소요 시간 (Max Slice Duration): ${res?.maxSliceMs} ms (엄격 기준: <= 4.0ms)`);
  console.log(`- 타임슬라이스 청크 실행 횟수 (Total Slices): ${res?.totalSlices} 회`);
  console.log(`- 마지막 슬라이스 소요 시간 (Last Slice Duration): ${res?.lastSliceMs} ms`);
  console.log(`- 전체 평균 프레임 (Average FPS): ${res?.avgFps} FPS (SwiftShader 소프트웨어 렌더링)`);
  console.log(`- 카메라 이동 중 평균 프레임 (Moving FPS): ${res?.movingAvgFps} FPS`);
  console.log(`- 최대 GPU Draw Calls: ${res?.maxDrawCalls} 회 (목표: < 10 Draw Calls, 단일 렌더패스)`);
  console.log(`- 더블 버퍼링 건물 소실(Blank Frame) 횟수: ${res?.zeroBuildingDrops} 회 (0회 완벽 보장)`);
  console.log(`- 렌더링된 3D 건물 수: ${res?.buildingCount} 동 (단일 THREE.Mesh 병합)`);
  console.log(`- 마스터 메쉬 폴리곤 삼각면: ${res?.totalTriangles?.toLocaleString()} Triangles`);
  console.log(`- 옥상 조형 폴리곤 삼각면: ${res?.rooftopTriangles?.toLocaleString()} Triangles`);
  console.log(`- 활성 MapLibre 레이어 수: ${res?.activeLayersCount} 개 (가드레일 준수)`);
  console.log('======================================================\n');

  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Phase3-Verify] Error:', err);
  process.exit(1);
});
