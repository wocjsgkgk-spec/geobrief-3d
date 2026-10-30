import assert from 'assert';
import {
  VWorldQuadtreeIndexer,
  VWorldXDOParser,
  VWorldDEMParser,
  VWorldWebGLShaderSpec,
} from '../src/lib/vendor/vworldReverseSpec.ts';
import * as THREE from 'three';

async function runTests() {
  console.log('=== [1] V-World Quadtree Tile Addressing Tests ===');

  // Test 1: Unit degrees at levels
  const unitL8 = VWorldQuadtreeIndexer.getUnitDegrees(8);
  const unitL15 = VWorldQuadtreeIndexer.getUnitDegrees(15);
  console.log(`Level 8 tile unit: ${unitL8} deg`);
  console.log(`Level 15 tile unit: ${unitL15} deg`);
  assert.strictEqual(unitL8, 36.0 / 256, 'Level 8 unit must equal 36 / 256');
  assert.strictEqual(unitL15, 36.0 / 32768, 'Level 15 unit must equal 36 / 32768');

  // Test 2: Wonju Coordinates (127.9358, 37.3592)
  const wonjuLon = 127.9358;
  const wonjuLat = 37.3592;
  const wonjuTile15 = VWorldQuadtreeIndexer.getTileIndex(wonjuLon, wonjuLat, 15);
  console.log('Wonju Tile at Level 15:', wonjuTile15);
  assert(wonjuTile15.idx > 0 && wonjuTile15.idy > 0, 'IDX and IDY must be positive numbers');

  // Test 3: Reverse Bounds Roundtrip
  const bounds = VWorldQuadtreeIndexer.getTileBounds(wonjuTile15.idx, wonjuTile15.idy, 15);
  console.log('Wonju Tile Bounds:', bounds);
  assert(
    wonjuLon >= bounds.minLon && wonjuLon <= bounds.maxLon,
    'Longitude must lie within tile bounds'
  );
  assert(
    wonjuLat >= bounds.minLat && wonjuLat <= bounds.maxLat,
    'Latitude must lie within tile bounds'
  );

  // Test 4: Upstream and Proxy URL Generation
  const upstreamUrl = VWorldQuadtreeIndexer.getUpstreamTileUrl({
    layer: 'facility_build',
    level: 15,
    idx: wonjuTile15.idx,
    idy: wonjuTile15.idy,
    dataFile: '12345.xdo',
    apiKey: 'SAMPLE_KEY',
  });
  console.log('Upstream URL:', upstreamUrl);
  assert(upstreamUrl.includes('Layer=facility_build'), 'Upstream URL must contain Layer parameter');
  assert(upstreamUrl.includes('Level=15'), 'Upstream URL must contain Level parameter');

  const proxyUrl = VWorldQuadtreeIndexer.getProxyTileUrl({
    layer: 'facility_build',
    level: 15,
    idx: wonjuTile15.idx,
    idy: wonjuTile15.idy,
    dataFile: '12345.xdo',
  });
  console.log('Proxy URL:', proxyUrl);
  assert(proxyUrl.startsWith('/api/vworld-xdo-proxy'), 'Proxy URL must route through /api/vworld-xdo-proxy');

  // Test 5: BBox Tile Queries
  const bboxTiles = VWorldQuadtreeIndexer.getTilesForBbox(
    [127.93, 37.35, 127.94, 37.36],
    15
  );
  console.log(`Tiles in Wonju Central BBOX at Level 15: ${bboxTiles.length} tiles`);
  assert(bboxTiles.length >= 1, 'BBox query should return at least 1 tile');

  console.log('\n=== [2] V-World XDO Binary Parser Tests ===');

  // Test 6: Create Synthetic XDO Buffer & Parse
  const syntheticBuffer = VWorldXDOParser.createSyntheticXDO({
    objectID: 88201,
    width: 25,
    depth: 35,
    height: 50,
    altitude: 120,
    imageName: 'test_apt_facade.png',
  });
  console.log(`Synthetic XDO Buffer size: ${syntheticBuffer.byteLength} bytes`);

  const parsedXDO = VWorldXDOParser.parse(syntheticBuffer, {
    scale: 1.0,
  });

  console.log(`Parsed XDO Records: ${parsedXDO.records.length}`);
  console.log(`Total Vertices: ${parsedXDO.totalVertices}, Total Triangles: ${parsedXDO.totalTriangles}`);
  assert.strictEqual(parsedXDO.records.length, 1, 'Should parse exactly 1 record');
  assert.strictEqual(parsedXDO.records[0].objectID, 88201, 'Record ObjectID must match');
  assert.strictEqual(parsedXDO.records[0].imageName, 'test_apt_facade.png', 'Record ImageName must match');
  assert.strictEqual(parsedXDO.totalVertices, 24, 'Cube mesh must have 24 vertices');
  assert.strictEqual(parsedXDO.totalTriangles, 12, 'Cube mesh must have 12 triangles (36 indices)');
  assert(parsedXDO.geometries.length === 1, 'Should create 1 BufferGeometry');
  assert(parsedXDO.group.children.length === 1, 'Should create 1 Mesh child in Group');

  const geom = parsedXDO.geometries[0];
  assert(geom.getAttribute('position'), 'Geometry must have position attribute');
  assert(geom.getAttribute('normal'), 'Geometry must have normal attribute');
  assert(geom.getAttribute('uv'), 'Geometry must have uv attribute');
  assert(geom.getIndex(), 'Geometry must have index buffer attribute');

  console.log('\n=== [3] V-World DEM Parser Tests ===');

  // Test 7: DEM Binary Parser
  const gridSize = 65;
  const demBuffer = new ArrayBuffer(gridSize * gridSize * 4);
  const demView = new DataView(demBuffer);
  for (let i = 0; i < gridSize * gridSize; i++) {
    demView.setFloat32(i * 4, 100.0 + (i % 65) * 0.5, true);
  }

  const parsedDEM = VWorldDEMParser.parse(demBuffer, gridSize);
  console.log(`Parsed DEM: ${parsedDEM.gridSize}x${parsedDEM.gridSize} grid`);
  console.log(`Min Elevation: ${parsedDEM.minElevation}m, Max Elevation: ${parsedDEM.maxElevation}m, Mean: ${parsedDEM.meanElevation.toFixed(2)}m`);
  assert.strictEqual(parsedDEM.gridSize, 65, 'DEM grid size must be 65');
  assert(parsedDEM.geometry instanceof THREE.PlaneGeometry, 'DEM geometry must be PlaneGeometry');

  console.log('\n=== [4] V-World WebGL Shader Lighting & Fog Spec Tests ===');

  // Test 8: Scene Application
  const testScene = new THREE.Scene();
  const lights = VWorldWebGLShaderSpec.applyToScene(testScene);
  console.log('Applied Lights:', Object.keys(lights));
  assert(testScene.fog instanceof THREE.FogExp2, 'Scene fog must be FogExp2');
  assert.strictEqual(testScene.fog.color.getHex(), VWorldWebGLShaderSpec.FOG.color, 'Fog color must match spec');
  assert.strictEqual(lights.dirLight.intensity, 1.25, 'Sunlight intensity must be 1.25');
  assert.strictEqual(lights.hemiLight.intensity, 0.85, 'Hemisphere intensity must be 0.85');

  console.log('\n>>> ALL V-WORLD REVERSE SPEC & PARSER TESTS PASSED SUCCESSFULLY! <<<');
}

runTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
