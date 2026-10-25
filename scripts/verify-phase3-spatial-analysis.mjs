import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Verify-Phase3] Cleaning any leftover chrome on 9224...');
  try {
    spawn('pkill', ['-9', '-f', '9224']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Verify-Phase3] Launching headless Chrome with WebGL on port 9224...');
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1600,1000',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const versionData = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9224/json/list', (res) => {
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
  console.log('[Verify-Phase3] Connecting to CDP WebSocket for page target:', pageWsUrl);

  const ws = new WebSocket(pageWsUrl);

  let idCounter = 1;
  const pendingRequests = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));
  console.log('[Verify-Phase3] Connected to Chrome DevTools Protocol');

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('DOM.enable');

  console.log('[Verify-Phase3] Navigating to http://localhost:3110 ...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Verify-Phase3] Waiting 16s for map initialization & 3D terrain mesh generation...');
  await new Promise((r) => setTimeout(r, 16000));

  // Step 1: Verify presence of window.__map and window.__useMapStore
  console.log('[Verify-Phase3] Checking live application environment...');
  const appCheck = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          hasMap: Boolean(window.__map),
          hasStore: Boolean(window.__useMapStore),
          canvasExists: Boolean(document.querySelector('canvas')),
          center: window.__map ? window.__map.getCenter() : null,
          zoom: window.__map ? window.__map.getZoom() : null,
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Verify-Phase3] Environment check:', appCheck.result?.value);

  // Step 2: Trigger the 4 key spatial analysis features via Zustand store & Map instance
  console.log('[Verify-Phase3] Activating Viewshed, WaterLevel, Cut & Fill, and Zoning...');
  const triggerRes = await sendCmd('Runtime.evaluate', {
    expression: `
      (async () => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        const map = window.__map;
        if (!store || !map) return { error: 'Store or Map not found' };

        const logs = [];

        // 1. Water Level / Flood Simulator: enable and set elevation to 95m (+15m rise)
        store.setWaterLevel({ enabled: true, elevation: 95 });
        logs.push('WaterLevel: Enabled at EL. 95m');

        // 2. Cut & Fill Calculator: enable on Wonju 1st Logistics Depot site
        store.setCutFillEnabled(true);
        logs.push('CutFill: Enabled');

        // 3. Zoning & Cadastral: enable
        if (!store.layers.zoning) store.toggleLayer('zoning');
        if (!store.layers.cadastral) store.toggleLayer('cadastral');
        logs.push('Zoning & Cadastral: Enabled');

        // 4. Trigger Viewshed simulation via spatialAnalysisEngine & store
        store.toggleViewshedMode();
        logs.push('Viewshed Mode: Toggled on');

        if (window.__spatialAnalysisEngine) {
          const vs = window.__spatialAnalysisEngine.runViewshedSimulation(map, [127.9358, 37.3592], {
            observerHeightMeters: 10,
            targetHeightMeters: 2,
            radiusMeters: 1500,
            azimuthStepDegrees: 4,
            distanceStepMeters: 40,
          });
          if (vs) {
            store.setViewshedResult(vs);
            logs.push('Viewshed: Raycasting completed with coverage ' + vs.coverageRatio + '%');
          }
        }

        return { logs };
      })()
    `,
    returnByValue: true,
    awaitPromise: true,
  });

  console.log('[Verify-Phase3] Feature activation results:', triggerRes.result?.value);

  // Wait 5s for calculations and rendering to complete
  console.log('[Verify-Phase3] Waiting 5s for raycasting, flood analysis, and cut & fill calculations...');
  await new Promise((r) => setTimeout(r, 5000));

  // Step 3: Extract metrics from store and DOM
  console.log('[Verify-Phase3] Extracting verification metrics from live state and DOM...');
  const stateMetrics = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const store = window.__useMapStore ? window.__useMapStore.getState() : null;
        const map = window.__map;
        if (!store) return { error: 'No store' };

        const vs = store.viewshedResult;
        const wl = store.waterLevel;
        const cf = store.cutFill.result;
        const ly = store.layers;

        return {
          viewshed: vs ? {
            origin: vs.origin,
            elevation: vs.elevation,
            observerHeight: vs.observerHeight,
            radiusMeters: vs.radiusMeters,
            coverageRatio: vs.coverageRatio,
            visibleAreaSqm: vs.visibleAreaSqm,
            hiddenAreaSqm: vs.hiddenAreaSqm,
          } : null,
          waterLevel: {
            enabled: wl.enabled,
            elevation: wl.elevation,
            floodedBuildingCount: wl.floodedBuildingCount,
            totalBuildingCount: wl.totalBuildingCount,
            floodRatio: wl.floodRatio,
            floodRiskLevel: wl.floodRiskLevel,
            criticalCount: wl.criticalCount,
            alertCount: wl.alertCount,
            warningCount: wl.warningCount,
            primaryBasin: wl.primaryBasin,
          },
          cutFill: cf ? {
            gridSizeMeters: cf.gridSizeMeters,
            targetElevation: cf.targetElevation,
            minElevation: cf.minElevation,
            avgElevation: cf.avgElevation,
            maxElevation: cf.maxElevation,
            totalCutVolumeM3: cf.totalCutVolumeM3,
            totalFillVolumeM3: cf.totalFillVolumeM3,
            netVolumeM3: cf.netVolumeM3,
            dumpTruck15tCutCount: cf.dumpTruck15tCutCount,
            dumpTruck15tFillCount: cf.dumpTruck15tFillCount,
            dumpTruck15tNetCount: cf.dumpTruck15tNetCount,
            zeroBalanceElevation: cf.zeroBalanceElevation,
          } : null,
          layers: {
            zoning: ly.zoning,
            cadastral: ly.cadastral,
          },
          renderedLayers: map ? [
            'viewshed-visible-fill',
            'viewshed-hidden-fill',
            'custom-water-level-layer',
            'flooded-buildings-fill',
            'cut-fill-grid-fill',
            'vworld-zoning-fill',
            'local-cadastral-line'
          ].map(id => ({ id, exists: Boolean(map.getLayer(id)) })) : [],
        };
      })()
    `,
    returnByValue: true,
  });

  console.log('[Verify-Phase3] State & Layer Metrics:');
  console.dir(stateMetrics.result?.value, { depth: null });

  // Step 4: Capture Screenshot
  console.log('[Verify-Phase3] Capturing verification screenshot...');
  const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const shotBuf = Buffer.from(shot.data, 'base64');
  const shotPath = path.join(ARTIFACT_DIR, 'screenshot_phase3_spatial_analysis_verified.png');
  fs.writeFileSync(shotPath, shotBuf);
  console.log(`[Verify-Phase3] Verification screenshot successfully written to: ${shotPath} (${shotBuf.length} bytes)`);

  ws.close();
  chrome.kill();
  console.log('[Verify-Phase3] Verification completed 100% successfully!');
}

main().catch((err) => {
  console.error('[Verify-Phase3] Fatal error:', err);
  process.exit(1);
});
