// =====================================================================
//  Monde 2 : l'extérieur (tore d'herbe et de collines)
// =====================================================================
const wrapP = (a) => a - P * Math.round(a / P);
const TERRAIN_DROP = 0.01;

function hLocal(x, z) {
  const u = x * 2 * Math.PI / P, v = z * 2 * Math.PI / P;
  const h = 2.8 * Math.sin(u + 0.6) * Math.cos(v - 0.3)
          + 1.4 * Math.sin(2 * u + v + 2.1) * Math.cos(2 * v + 0.5)
          + 0.4 * Math.sin(3 * u + 2 * v);
  const t = Math.min(1, Math.max(0, (Math.hypot(x, z) - 5) / 11));
  return h * t * t * (3 - 2 * t);
}
const hWorld = (x, z) => hLocal(wrapP(x - DOOR_CX), wrapP(z - DOOR_CZ));

function buildTerrainGeometry() {
  const SEG = qualityPreset.terrainSegments;
  const g = new THREE.PlaneGeometry(P, P, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, n = pos.count;
  const normals = new Float32Array(n * 3), colors = new Float32Array(n * 3);
  const e = 0.3;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, hLocal(x, z) - TERRAIN_DROP);
    const dhx = (hLocal(x + e, z) - hLocal(x - e, z)) / (2 * e);
    const dhz = (hLocal(x, z + e) - hLocal(x, z - e)) / (2 * e);
    const l = Math.hypot(dhx, 1, dhz);
    normals[i * 3] = -dhx / l; normals[i * 3 + 1] = 1 / l; normals[i * 3 + 2] = -dhz / l;
    const u = x * 2 * Math.PI / P, v = z * 2 * Math.PI / P;
    const t = 0.5 + 0.25 * Math.sin(5 * u + 1) * Math.sin(4 * v + 2) + 0.25 * Math.sin(9 * u + 7 * v);
    colors[i * 3] = 0.17 + 0.15 * t; colors[i * 3 + 1] = 0.34 + 0.18 * t; colors[i * 3 + 2] = 0.10 + 0.08 * t;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    const v = 170 + Math.random() * 85;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(P / 4, P / 4);
  return t;
}

outScene.fog = new THREE.Fog(FOG_COLOR, 25, 95);
doorScene.fog = outScene.fog;

const groundMat = mk(outMats, { vertexColors: true, map: makeGrassTexture(), roughness: 1 });
const tuftMat   = mk(outMats, { vertexColors: true, roughness: 1, side: THREE.DoubleSide });

// ---------- Ciel (shader) ----------
const skyMat = mk(outMats, {
  uniforms: { sunDir: { value: SUN_DIR } },
  side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vDir;
    void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
    void main(){
      float h = clamp(vDir.y, 0.0, 1.0);
      vec3 c = mix(vec3(0.75, 0.86, 0.96), vec3(0.22, 0.48, 0.90), pow(h, 0.5));
      float s = max(dot(normalize(vDir), sunDir), 0.0);
      c += vec3(1.0, 0.92, 0.75) * (pow(s, 800.0) * 2.0 + pow(s, 10.0) * 0.2);
      gl_FragColor = vec4(c, 1.0);
    }`
}, THREE.ShaderMaterial);
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -10;
outScene.add(sky);

outScene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a6a35, 0.75));
const sun = new THREE.DirectionalLight(0xfff1d6, 0.9);
sun.position.copy(SUN_DIR).multiplyScalar(100);
outScene.add(sun);

// ---------- Herbe ----------
function makeTuftGeometry() {
  const pos = [], col = [], nor = [];
  const H = 0.55, W = 0.07;
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, cx = Math.cos(a), sz = Math.sin(a), lean = 0.1;
    pos.push(-W * cx, 0, -W * sz,  W * cx, 0, W * sz,  lean * sz, H, -lean * cx);
    col.push(0.10, 0.22, 0.06,  0.10, 0.22, 0.06,  0.50, 0.70, 0.28);
    nor.push(0, 1, 0,  0, 1, 0,  0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
const TUFTS = qualityPreset.tufts;
const tuftMatrices = new Float32Array(TUFTS * 16);
{
  const rng = mulberry32(1234), d = new THREE.Object3D();
  let n = 0;
  while (n < TUFTS) {
    const x = (rng() - 0.5) * P, z = (rng() - 0.5) * P;
    if (Math.hypot(x, z) < 2.5) continue;
    d.position.set(x, hLocal(x, z) - TERRAIN_DROP - 0.02, z);
    d.rotation.y = rng() * Math.PI * 2;
    const s = 0.7 + rng() * 0.9;
    d.scale.set(s, s * (0.8 + rng() * 0.6), s);
    d.updateMatrix();
    d.matrix.toArray(tuftMatrices, n * 16);
    n++;
  }
}
const terrainGeo = buildTerrainGeometry();
const tuftGeo = makeTuftGeometry();

// ---------- Tuiles du tore (5×5 terrain, 3×3 herbe) ----------
const terrainTiles = [], grassTiles = [], doorCopies = [];
for (let ix = -2; ix <= 2; ix++) {
  for (let iz = -2; iz <= 2; iz++) {
    const ox = ix * P, oz = iz * P;
    const terrain = new THREE.Mesh(terrainGeo, groundMat);
    terrain.position.set(DOOR_CX + ox, 0, DOOR_CZ + oz);
    outScene.add(terrain);
    terrainTiles.push({ mesh: terrain, cx: DOOR_CX + ox, cz: DOOR_CZ + oz });
    if (Math.abs(ix) <= 1 && Math.abs(iz) <= 1) {
      const grass = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
      grass.instanceMatrix.array.set(tuftMatrices);
      grass.instanceMatrix.needsUpdate = true;
      grass.frustumCulled = false;
      grass.position.set(DOOR_CX + ox, 0, DOOR_CZ + oz);
      outScene.add(grass);
      grassTiles.push({ mesh: grass, cx: DOOR_CX + ox, cz: DOOR_CZ + oz });
      doorCopies.push({ ox, oz });
    }
  }
}
function updateTiles(p) {
  const R = P / 2 + 100;
  for (const t of terrainTiles) t.mesh.visible = Math.abs(p.x - t.cx) < R && Math.abs(p.z - t.cz) < R;
  for (const t of grassTiles)   t.mesh.visible = Math.abs(p.x - t.cx) < R && Math.abs(p.z - t.cz) < R;
}

// ---------- Espace non euclidien : on se « replie » sur la tuile centrale ----------
// Retourne le décalage en z appliqué (l'appelant corrige lastCamZ).
function wrapPlayerOnTorus() {
  if (world !== 'out') return 0;
  const dwx = P * Math.round((player.position.x - DOOR_CX) / P);
  const dwz = P * Math.round((player.position.z - DOOR_CZ) / P);
  if (dwx || dwz) { player.position.x -= dwx; player.position.z -= dwz; }
  return dwz;
}