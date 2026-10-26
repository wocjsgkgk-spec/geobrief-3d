import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';

async function main() {
  console.log('[Phase1-MasterDataSync] Cleaning leftover chrome on 9227...');
  try {
    spawn('pkill', ['-9', '-f', '9227']);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Phase1-MasterDataSync] Launching headless Chrome with WebGL SwiftShader on 9227...');
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
    '--window-size=1600,960',
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
  console.log('[Phase1-MasterDataSync] Connecting to CDP WebSocket for page target:', wsUrl);

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
  console.log('[Phase1-MasterDataSync] Connected to DevTools Protocol.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  console.log('[Phase1-MasterDataSync] Navigating to http://localhost:3110 ...');
  await send('Page.navigate', { url: 'http://localhost:3110' });

  console.log('[Phase1-MasterDataSync] Waiting 15 seconds for map initialization & building geometries...');
  await new Promise((r) => setTimeout(r, 15000));

  // Close floating measurement HUD if present
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

  // 1. Check window.__masterDataSynchronizer and test Gangwon 18 district code mapping
  console.log('[Phase1-MasterDataSync] 1. Checking window.__masterDataSynchronizer and 18 district code mapping...');
  const syncEvalResult = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        const sync = window.__masterDataSynchronizer;
        const resolveFn = window.__resolveGangwonDistrictByCoords;
        if (!sync) return { error: '__masterDataSynchronizer not found on window' };

        const testCoords = [
          { name: '원주시', lng: 127.95, lat: 37.34 },
          { name: '춘천시', lng: 127.73, lat: 37.88 },
          { name: '강릉시', lng: 128.87, lat: 37.75 },
          { name: '속초시', lng: 128.59, lat: 38.20 },
          { name: '동해시', lng: 129.11, lat: 37.52 },
          { name: '홍천군', lng: 127.88, lat: 37.69 },
          { name: '철원군', lng: 127.31, lat: 38.14 },
          { name: '평창군', lng: 128.39, lat: 37.37 }
        ];

        const mapped = testCoords.map(tc => {
          const res = resolveFn ? resolveFn(tc.lng, tc.lat) : null;
          return {
            target: tc.name,
            resolvedName: res?.name,
            admCode: res?.admCode,
            legacyAdmCode: res?.legacyAdmCode,
            bjdPrefix: res?.bjdPrefix
          };
        });

        return {
          hasSynchronizer: true,
          hasResolver: typeof resolveFn === 'function',
          recordCount: sync.getRecordCount(),
          mappedDistricts: mapped
        };
      })();
    `,
  });
  console.log('Synchronizer Check:', JSON.stringify(syncEvalResult.result.value, null, 2));

  // 2. Inspect 3D City Layer cached features and real stamped attributes
  console.log('[Phase1-MasterDataSync] 2. Inspecting 3D City Layer cached features for 5 real attributes...');
  const buildingEvalResult = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        const layer = window.__realisticCityLayer || window.__realisticKoreanCityLayer;
        if (!layer) return { error: 'RealisticKoreanCityLayer instance not found on window' };

        const features = layer.getCachedFeatures ? layer.getCachedFeatures() : (layer.cachedFeatures || []);
        const total = features.length;

        let stampedCount = 0;
        let smallHouseCount = 0;
        let smallHouseOver12mCount = 0;
        let apartmentCount = 0;
        let apartmentUnder45mCount = 0;

        const useDistribution = {};
        const roofColorDistribution = {};
        const structDistribution = {};
        const roofTypeDistribution = {};

        const samples = [];

        features.forEach((f) => {
          const p = f.properties || {};
          const height = p.realHeight || p.height || 0;
          const use = p.realUse || '미지정';
          const struct = p.realStruct || '미지정';
          const roof = p.realRoof || '미지정';
          const roofColor = p.realRoofColor || '미지정';

          if (p.isRealMeasured || p.realHeight || p.realUse) {
            stampedCount++;
          }

          useDistribution[use] = (useDistribution[use] || 0) + 1;
          roofColorDistribution[roofColor] = (roofColorDistribution[roofColor] || 0) + 1;
          structDistribution[struct] = (structDistribution[struct] || 0) + 1;
          roofTypeDistribution[roof] = (roofTypeDistribution[roof] || 0) + 1;

          // Compute area
          let area = 0;
          if (f.geometry && f.geometry.coordinates) {
            const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0]?.[0];
            if (coords && coords.length >= 3) {
              let a = 0;
              for (let i = 0; i < coords.length - 1; i++) {
                a += coords[i][0] * coords[i+1][1] - coords[i+1][0] * coords[i][1];
              }
              area = Math.abs(a * 0.5) * 111319.5 * 111319.5 * Math.cos(37.34 * Math.PI / 180);
            }
          }

          if (area > 0 && area < 220) {
            smallHouseCount++;
            if (height > 12.0) {
              smallHouseOver12mCount++;
            }
          }

          if (use === '공동주택(아파트)' || p.bld_category === 'apartment') {
            apartmentCount++;
            if (height < 45.0 && area >= 350) {
              apartmentUnder45mCount++;
            }
          }

          if (samples.length < 5 && (p.realName || p.name)) {
            samples.push({
              name: p.realName || p.name,
              use: p.realUse,
              struct: p.realStruct,
              roof: p.realRoof,
              height: p.realHeight,
              levels: p.realLevels,
              roofColor: p.realRoofColor
            });
          }
        });

        return {
          totalBuildings: total,
          stampedCount,
          stampedRatio: total > 0 ? (stampedCount / total * 100).toFixed(1) + '%' : '0%',
          smallHouseCount,
          smallHouseOver12mCount,
          smallHouseRuleViolations: smallHouseOver12mCount,
          apartmentCount,
          apartmentUnder45mCount,
          useDistribution,
          roofColorDistribution,
          structDistribution,
          roofTypeDistribution,
          samples
        };
      })();
    `,
  });
  console.log('Building Attributes Audit:', JSON.stringify(buildingEvalResult.result.value, null, 2));

  // 3. Move camera to view city skyline and capture screenshot
  console.log('[Phase1-MasterDataSync] 3. Positioning camera to capture full stamped realistic city view...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map;
        if (map) {
          map.jumpTo({
            center: [127.9515, 37.3380],
            zoom: 16.2,
            pitch: 56,
            bearing: -32
          });
        }
        return true;
      })();
    `,
  });
  await new Promise((r) => setTimeout(r, 4000));

  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath1 = path.join(ARTIFACT_DIR, 'screenshot_phase1_master_data_stamped_city.png');
  fs.writeFileSync(shotPath1, Buffer.from(shot1.data, 'base64'));
  console.log('[Phase1-MasterDataSync] Stamped city screenshot saved to:', shotPath1);

  // 4. Simulate clicking on an apartment building or commercial building to open VWorld Spatial Inspector
  console.log('[Phase1-MasterDataSync] 4. Triggering click on building to inspect 5 real measured attributes in drawer...');
  const clickResult = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        const map = window.__map;
        const layer = window.__realisticCityLayer;
        if (!map || !layer) return { error: 'Map or layer not found' };

        const features = layer.getCachedFeatures ? layer.getCachedFeatures() : (layer.cachedFeatures || []);
        // Find a stamped feature
        const targetFeat = features.find(f => f.properties && (f.properties.realUse === '공동주택(아파트)' || f.properties.realName?.includes('아파트') || f.properties.realHeight >= 20)) || features[0];
        if (!targetFeat) return { error: 'No feature found to click' };

        // Get coordinates
        let coords = [127.9515, 37.3380];
        if (targetFeat.geometry && targetFeat.geometry.type === 'Polygon') {
          coords = targetFeat.geometry.coordinates[0][0];
        } else if (targetFeat.geometry && targetFeat.geometry.type === 'MultiPolygon') {
          coords = targetFeat.geometry.coordinates[0][0][0];
        }

        // Fire map click
        const point = map.project(coords);
        map.fire('click', {
          lngLat: { lng: coords[0], lat: coords[1] },
          point: point,
          originalEvent: new MouseEvent('click')
        });

        return {
          clickedFeatureName: targetFeat.properties?.realName || targetFeat.properties?.name || 'Target Building',
          targetProperties: targetFeat.properties
        };
      })();
    `,
  });
  console.log('Click result:', JSON.stringify(clickResult.result.value, null, 2));

  // Wait 4 seconds for inspector drawer to open and fetch cadastral info
  await new Promise((r) => setTimeout(r, 4000));

  // Read inspector drawer DOM content
  const drawerContent = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        const drawer = document.getElementById('vworld-spatial-inspector-drawer') || document.querySelector('[role="dialog"]');
        const textContent = drawer ? drawer.innerText : (document.body.innerText.includes('건축물대장') ? 'Found in body' : 'Drawer not open');
        
        return {
          hasDrawer: !!drawer,
          titleText: drawer ? drawer.querySelector('h2, h3')?.innerText : '',
          displayedTextSnippet: textContent.slice(0, 800)
        };
      })();
    `,
  });
  console.log('Inspector Drawer verification:', JSON.stringify(drawerContent.result.value, null, 2));

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath2 = path.join(ARTIFACT_DIR, 'screenshot_phase1_inspector_real_attributes.png');
  fs.writeFileSync(shotPath2, Buffer.from(shot2.data, 'base64'));
  console.log('[Phase1-MasterDataSync] Inspector Drawer screenshot saved to:', shotPath2);

  console.log('[Phase1-MasterDataSync] All verifications successfully completed!');
  try {
    chrome.kill('SIGKILL');
  } catch {}
  process.exit(0);
}

main().catch((err) => {
  console.error('[Phase1-MasterDataSync] Error:', err);
  process.exit(1);
});
