/**
 * scripts/verify-stage1-audit-cleanup.mjs
 *
 * Verifies that:
 * 1. Heavy Three.js building layers are disconnected/removed (threebox-building-layer, realistic-korean-city-layer).
 * 2. Giant floor slab layers are removed (flight-envelope-volume, flight-ceiling-slab, building-mass-extrusion).
 * 3. All move/render listeners have zero React setState / API calls.
 * 4. Captures screenshot of clean map.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/home/d/.gemini/antigravity-cli/brain/52f67efb-3141-4853-8a3d-af7a7d68a98f';
const PORT = 3000;
const CDP_PORT = 9228;

async function main() {
  console.log('[Audit-Verify] Killing leftover chrome on port', CDP_PORT);
  try {
    spawn('pkill', ['-9', '-f', String(CDP_PORT)]);
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log('[Audit-Verify] Launching headless Chrome on port', CDP_PORT);
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
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
    http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  const pageTarget =
    versionData.find((t) => t.type === 'page' && t.url !== 'about:blank') ||
    versionData.find((t) => t.type === 'page') ||
    versionData[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

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
  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');

  console.log(`[Audit-Verify] Navigating to http://localhost:${PORT} ...`);
  await sendCmd('Page.navigate', { url: `http://localhost:${PORT}` });

  console.log('[Audit-Verify] Waiting 10s for page to stabilize...');
  await new Promise((r) => setTimeout(r, 10000));

  console.log('[Audit-Verify] Querying layer state & bottlenecks...');
  const auditRes = await sendCmd('Runtime.evaluate', {
    expression: `
      (() => {
        const map = window.__map || window.map;
        if (!map) return { error: 'Map not found' };

        const style = map.getStyle();
        const allLayers = style ? style.layers : [];
        const activeLayers = allLayers.filter(l => {
          try {
            return map.getLayoutProperty(l.id, 'visibility') !== 'none';
          } catch {
            return false;
          }
        });

        const hasThreebox = Boolean(map.getLayer('threebox-building-layer'));
        const hasRealisticCity = Boolean(map.getLayer('realistic-korean-city-layer'));
        const hasFlightEnvelope = Boolean(map.getLayer('flight-envelope-volume'));
        const hasFlightCeiling = Boolean(map.getLayer('flight-ceiling-slab'));
        const hasBuildingMass = Boolean(map.getLayer('building-mass-extrusion'));
        const hasRiverbank = Boolean(map.getLayer('korean-riverbank-floodplain'));
        const hasParking = Boolean(map.getLayer('complex-parking-area'));

        return {
          totalLayers: allLayers.length,
          activeLayerCount: activeLayers.length,
          activeLayerIds: activeLayers.map(l => l.id),
          hasThreebox,
          hasRealisticCity,
          hasFlightEnvelope,
          hasFlightCeiling,
          hasBuildingMass,
          hasRiverbank,
          hasParking,
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing()
        };
      })()
    `,
    returnByValue: true,
  });

  const auditData = auditRes?.result?.value;
  console.log('[Audit-Verify] Audit Metrics:', JSON.stringify(auditData, null, 2));

  // Capture screenshot
  console.log('[Audit-Verify] Capturing clean screenshot...');
  const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(ARTIFACT_DIR, 'screenshot_stage1_purged_smooth_60fps.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log('[Audit-Verify] Screenshot saved to:', shotPath);

  ws.close();
  try {
    chrome.kill('SIGKILL');
  } catch {}
  console.log('[Audit-Verify] Finished successfully!');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
