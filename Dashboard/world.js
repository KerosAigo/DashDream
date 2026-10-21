// =====================================================================
//  Utilitaires
// =====================================================================
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = THREE.MathUtils.lerp;
const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// =====================================================================
//  Rendu : trois mondes (salle / extérieur / cabane) reliés par des portails
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.autoClear = false;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const roomScene = new THREE.Scene();
const outScene  = new THREE.Scene();
const doorScene = new THREE.Scene();   // la porte appartient aux deux mondes : dessinée à part
const shedScene = new THREE.Scene();   // la cabane, à l'intérieur du tonneau
const holdScene = new THREE.Scene();   // le tonneau porté, dessiné par-dessus tout le reste
const roomRoot  = new THREE.Group(); roomScene.add(roomRoot);
const doorRoot  = new THREE.Group(); doorScene.add(doorRoot);

const roomMats = [], outMats = [], shedMats = [];   // listes de matériaux (test de stencil par monde)
const mk = (list, params, Ctor = THREE.MeshStandardMaterial) => { const m = new Ctor(params); list.push(m); return m; };

// ---------- État global ----------
let world = 'room';      // 'room' | 'out' | 'shed'
let yaw = 0, pitch = 0;
let onLadder = false, climbPhase = 0;
let tube = false;                  // le joueur est dans l'ouverture du tonneau (corps dans le puits, tête encore dehors)
let vy = 0, grounded = true;
let velX = 0, velZ = 0;
let ladderCooldown = 0, ladderLock = 0;
let jumpQueued = false;
const GRAVITY = 18, JUMP_V = 6.2;

// ---------- Caméra / joueur ----------
const EYE_HEIGHT = 1.7;
const PLAYER_MASS = 70;
const PLAYER_RADIUS = 0.3;
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.02, 500);
const player = new THREE.Object3D();
player.position.set(0, EYE_HEIGHT, 0);
player.add(camera);

// ---------- Dimensions ----------
const ROOM_W = 14, ROOM_D = 14, ROOM_H = 4;
const WALL_T = 0.2;
const WALL_Z = -ROOM_D / 2 - WALL_T / 2;
const OPEN_X1 = 2.45, OPEN_X2 = 3.55, OPEN_H = 2.2;
const DOOR_CX = (OPEN_X1 + OPEN_X2) / 2;
const JAMB = 0.05;
const CASING_W = 0.09, CASING_T = 0.025;

const P = 240;                       // l'extérieur est un tore de côté P
const FOG_COLOR = 0xbfdcf5;
const ROOM_CLEAR = 0x8d93a0;
const SHED_CLEAR = 0x0a0705;

// Tonneau
const BH = 0.9;                      // hauteur
const BR = 0.46;                     // rayon au ventre
const B_TOP = 0.40;                  // rayon en haut et en bas
const HR = 0.32;                     // rayon de l'ouverture
const LID_T = 0.03, LID_R = 0.43;    // couvercle
const EDGE = (HR + B_TOP) / 2;       // milieu de la bordure du tonneau
const HOLE_REF = 50;                 // valeur de stencil du portail du tonneau
const CARRY = { x: -0.32, y: -1.15, z: -0.95, lean: 0.20, roll: 0.18, slow: 0.55 };   // tonneau porté (repère de la tête)

// Cabane (coordonnées locales) + puits de l'échelle dans le coin fond-droite
const SHED  = { x1: -2.1, x2: 2.1, z1: -1.7, z2: 1.7, h: 2.6 };
const SHAFT = { x1: 1.2, x2: 2.1, z1: -1.7, z2: -0.8, top: 5.6 };
const HOLE_S = new THREE.Vector3(1.72, SHAFT.top, (SHAFT.z1 + SHAFT.z2) / 2);   // centre de l'ouverture, côté cabane
const LAD_X = SHAFT.x2 - 0.38;
const LAD_Z = HOLE_S.z;
const LAD_FACE = SHAFT.x2 - 0.06;
const DB = { cx: -0.9, hw: 0.65, h: 2.05 };   // porte de la cabane (mur avant) : centre, demi-largeur, hauteur
DB.x1 = DB.cx - DB.hw; DB.x2 = DB.cx + DB.hw;

// =====================================================================
//  Textures procédurales
// =====================================================================
function makePlankTexture(vertical, seed) {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(seed);
  if (!vertical) { g.translate(S / 2, S / 2); g.rotate(-Math.PI / 2); g.translate(-S / 2, -S / 2); }
  const n = 6, pw = S / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * pw;
    g.fillStyle = `hsl(${22 + rng() * 10},${24 + rng() * 14}%,${22 + rng() * 14}%)`;
    g.fillRect(x0, 0, pw, S);
    for (let k = 0; k < 26; k++) {
      const gx = x0 + 4 + rng() * (pw - 8), a = 0.08 + rng() * 0.18;
      g.strokeStyle = rng() > 0.5 ? `rgba(15,8,3,${a})` : `rgba(215,175,125,${a * 0.6})`;
      g.lineWidth = 0.6 + rng() * 1.4;
      g.beginPath(); g.moveTo(gx, 0);
      for (let y = 32; y <= S; y += 32) g.lineTo(gx + Math.sin(y * 0.03 + k) * 2.2, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(8,5,2,0.9)'; g.fillRect(x0 - 1.5, 0, 3, S);
    g.fillStyle = 'rgba(70,55,45,0.95)';
    for (const ny of [14, S - 14]) { g.beginPath(); g.arc(x0 + pw / 2, ny, 2.4, 0, 7); g.fill(); }
  }
  g.fillStyle = 'rgba(8,5,2,0.9)'; g.fillRect(S - 1.5, 0, 1.5, S);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`;
    g.beginPath(); g.ellipse(rng() * S, rng() * S, 30 + rng() * 60, 20 + rng() * 40, rng() * 3, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

function makeBarrelTexture(seed) {            // 16 douelles verticales (une par 1/16 de tour)
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d'), rng = mulberry32(seed), n = 16, w = 512 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(${24 + rng() * 8},${40 + rng() * 12}%,${30 + rng() * 12}%)`;
    g.fillRect(i * w, 0, w, 256);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(${rng() > 0.5 ? '25,12,4' : '220,180,130'},${0.08 + rng() * 0.15})`;
      g.lineWidth = 0.6 + rng() * 1.2;
      const x = i * w + 2 + rng() * (w - 4);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rng() - 0.5) * 4, 256); g.stroke();
    }
    g.fillStyle = 'rgba(10,5,2,0.85)'; g.fillRect(i * w - 1, 0, 2, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// =====================================================================
//  Monde 1 : la salle
// =====================================================================
function makeFloorTexture(repX, repY) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f4a'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#434957';
  g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = '#2b2f37'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

const wallMat    = mk(roomMats, { color: 0xc9ced8, roughness: 1, side: THREE.DoubleSide });
const wallBoxMat = mk(roomMats, { color: 0xc9ced8, roughness: 1 });
const ceilMat    = mk(roomMats, { color: 0xdfe3ea, roughness: 1 });
const floorMat   = mk(roomMats, { map: makeFloorTexture(ROOM_W / 2, ROOM_D / 2), roughness: 0.9 });

const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
floor.rotation.x = -Math.PI / 2;
roomRoot.add(floor);

const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), ceilMat);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = ROOM_H;
roomRoot.add(ceiling);

function addPlaneWall(mat, w, h, x, y, z, rotY) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  wall.position.set(x, y, z); wall.rotation.y = rotY;
  roomRoot.add(wall);
}
addPlaneWall(wallMat, ROOM_W, ROOM_H, 0, ROOM_H / 2,  ROOM_D / 2, Math.PI);
addPlaneWall(wallMat, ROOM_D, ROOM_H, -ROOM_W / 2, ROOM_H / 2, 0,  Math.PI / 2);
addPlaneWall(wallMat, ROOM_D, ROOM_H,  ROOM_W / 2, ROOM_H / 2, 0, -Math.PI / 2);

function addBox(root, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); root.add(m); return m;
}
const bx1 = -ROOM_W / 2 - WALL_T, bx2 = ROOM_W / 2 + WALL_T;
const wx1 = OPEN_X1 - JAMB, wx2 = OPEN_X2 + JAMB;
addBox(roomRoot, wallBoxMat, wx1 - bx1, ROOM_H, WALL_T, (bx1 + wx1) / 2, ROOM_H / 2, WALL_Z);
addBox(roomRoot, wallBoxMat, bx2 - wx2, ROOM_H, WALL_T, (wx2 + bx2) / 2, ROOM_H / 2, WALL_Z);
addBox(roomRoot, wallBoxMat, wx2 - wx1, ROOM_H - OPEN_H - JAMB, WALL_T, DOOR_CX, (OPEN_H + JAMB + ROOM_H) / 2, WALL_Z);

roomRoot.add(new THREE.AmbientLight(0xffffff, 0.45));
const lamp = new THREE.PointLight(0xffffff, 0.9, 30);
lamp.position.set(0, ROOM_H - 0.4, 0);
roomRoot.add(lamp);

// =====================================================================
//  Monde 2 : l'extérieur (tore d'herbe et de collines)
// =====================================================================
const DOOR_CZ = WALL_Z;
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
  const SEG = 120;
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

const SUN_DIR = new THREE.Vector3(0.45, 0.6, -0.5).normalize();
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
const TUFTS = 48000;
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
const camPos = new THREE.Vector3();
function updateTiles(p) {
  const R = P / 2 + 100;
  for (const t of terrainTiles) t.mesh.visible = Math.abs(p.x - t.cx) < R && Math.abs(p.z - t.cz) < R;
  for (const t of grassTiles)   t.mesh.visible = Math.abs(p.x - t.cx) < R && Math.abs(p.z - t.cz) < R;
}

// =====================================================================
//  La porte : un seul objet partagé par la salle et l'extérieur
// =====================================================================
const DOOR = {
  length: 1.08, height: 2.15, thickness: 0.042, bottom: 0.02,
  mass: 25, hingeX: OPEN_X1 + 0.01, hingeZ: WALL_Z,
  limit: 1.9, damping: 1.2, friction: 0.3, restitution: 0.1, stopBounce: 0.25, selfClose: 0, maxSpeed: 8,
};

const doorAmb = new THREE.AmbientLight(0xffffff, 0.5);
const doorDir = new THREE.DirectionalLight(0xffffff, 0.6);
doorScene.add(doorAmb, doorDir);
const LOOK_ROOM = { amb: new THREE.Color(0xffffff), ambI: 0.5, dir: new THREE.Color(0xffe6c8), dirI: 0.6,  pos: new THREE.Vector3(-0.3, 0.5, 0.8) };
const LOOK_OUT  = { amb: new THREE.Color(0xd4e8ff), ambI: 0.6, dir: new THREE.Color(0xfff1d6), dirI: 0.95, pos: SUN_DIR.clone() };
let doorLookMix = 0;
function applyDoorLook() {
  const m = doorLookMix;
  doorAmb.color.copy(LOOK_ROOM.amb).lerp(LOOK_OUT.amb, m);
  doorAmb.intensity = lerp(LOOK_ROOM.ambI, LOOK_OUT.ambI, m);
  doorDir.color.copy(LOOK_ROOM.dir).lerp(LOOK_OUT.dir, m);
  doorDir.intensity = lerp(LOOK_ROOM.dirI, LOOK_OUT.dirI, m);
  doorDir.position.copy(LOOK_ROOM.pos).lerp(LOOK_OUT.pos, m);
}
applyDoorLook();

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#9a6633'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * 256, w = 1 + Math.random() * 3, l = 38 + Math.random() * 24;
    g.fillStyle = `hsla(26, 45%, ${l}%, ${0.10 + Math.random() * 0.2})`;
    g.fillRect(x, 0, w, 512);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
const woodTex   = makeWoodTexture();
const leafMat   = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.65 });
const panelMat  = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xd8c3a2, roughness: 0.6 });
const jambMat   = new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.7 });
const casingMat = new THREE.MeshStandardMaterial({ color: 0x6b4730, roughness: 0.65 });
const sillMat   = new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 0.9 });
const metalMat  = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.35 });

const addDoorBox = (mat, w, h, d, x, y, z) => addBox(doorRoot, mat, w, h, d, x, y, z);
addDoorBox(jambMat, JAMB, OPEN_H, WALL_T, OPEN_X1 - JAMB / 2, OPEN_H / 2, WALL_Z);
addDoorBox(jambMat, JAMB, OPEN_H, WALL_T, OPEN_X2 + JAMB / 2, OPEN_H / 2, WALL_Z);
addDoorBox(jambMat, OPEN_X2 - OPEN_X1 + 2 * JAMB, JAMB, WALL_T, DOOR_CX, OPEN_H + JAMB / 2, WALL_Z);
for (const s of [1, -1]) {
  const cz = WALL_Z + s * (WALL_T / 2 + CASING_T / 2);
  addDoorBox(casingMat, CASING_W, OPEN_H, CASING_T, OPEN_X1 - CASING_W / 2, OPEN_H / 2, cz);
  addDoorBox(casingMat, CASING_W, OPEN_H, CASING_T, OPEN_X2 + CASING_W / 2, OPEN_H / 2, cz);
  addDoorBox(casingMat, OPEN_X2 - OPEN_X1 + 2 * CASING_W, CASING_W, CASING_T, DOOR_CX, OPEN_H + CASING_W / 2, cz);
}
addDoorBox(sillMat, OPEN_X2 - OPEN_X1, 0.012, WALL_T, DOOR_CX, 0.006, WALL_Z);

function makeLeaf() {
  const pivot = new THREE.Group();
  const L = DOOR.length, H = DOOR.height, T = DOOR.thickness, y0 = DOOR.bottom;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(L, H, T), leafMat);
  slab.position.set(L / 2, y0 + H / 2, 0);
  pivot.add(slab);
  const stile = 0.14, mid = 0.10, pw = (L - 2 * stile - mid) / 2;
  const rows = [{ y: 0.24, h: 0.77 }, { y: 1.15, h: 0.85 }];
  const panelGeos = rows.map(r => new THREE.BoxGeometry(pw, r.h, 0.012));
  for (const side of [1, -1]) for (let col = 0; col < 2; col++) rows.forEach((r, i) => {
    const p = new THREE.Mesh(panelGeos[i], panelMat);
    p.position.set(stile + pw / 2 + col * (pw + mid), y0 + r.y + r.h / 2, side * (T / 2 + 0.002));
    pivot.add(p);
  });
  const roseGeo  = new THREE.CylinderGeometry(0.026, 0.026, 0.01, 20);    roseGeo.rotateX(Math.PI / 2);
  const neckGeo  = new THREE.CylinderGeometry(0.008, 0.008, 0.045, 12);   neckGeo.rotateX(Math.PI / 2);
  const leverGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.115, 12); leverGeo.rotateZ(Math.PI / 2);
  const capGeo   = new THREE.SphereGeometry(0.0085, 12, 8);
  const hx = L - 0.075, hy = y0 + 1.08;
  for (const s of [1, -1]) {
    const add = (geo, x, z) => { const m = new THREE.Mesh(geo, metalMat); m.position.set(x, hy, z); pivot.add(m); };
    add(roseGeo, hx, s * (T / 2 + 0.005)); add(neckGeo, hx, s * (T / 2 + 0.0325));
    add(leverGeo, hx - 0.0575, s * (T / 2 + 0.055)); add(capGeo, hx - 0.115, s * (T / 2 + 0.055));
  }
  const plateGeo = new THREE.BoxGeometry(0.04, 0.1, 0.004);
  for (const y of [0.22, 1.08, 1.96]) for (const s of [1, -1]) {
    const pl = new THREE.Mesh(plateGeo, metalMat); pl.position.set(0.03, y, s * (T / 2 + 0.002)); pivot.add(pl);
  }
  return pivot;
}
const leafPivot = makeLeaf();
leafPivot.position.set(DOOR.hingeX, 0, DOOR.hingeZ);
doorRoot.add(leafPivot);
for (const y of [0.22, 1.08, 1.96]) {
  const k = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 12), metalMat);
  k.position.set(DOOR.hingeX, y, DOOR.hingeZ);
  doorRoot.add(k);
}

// =====================================================================
//  Monde 3 : la cabane vide (l'intérieur du tonneau, « plus grand dedans que dehors »)
// =====================================================================
shedScene.fog = new THREE.Fog(0x120d08, 4, 18);
shedScene.add(new THREE.AmbientLight(0x6b5744, 0.8));

const wallTex  = makePlankTexture(true, 11);
const floorTex = makePlankTexture(false, 23);
const shedWallMat  = mk(shedMats, { map: wallTex,  color: 0xd2bca0, roughness: 1, side: THREE.DoubleSide });
const shedFloorMat = mk(shedMats, { map: floorTex, color: 0xb8a58c, roughness: 0.95, side: THREE.DoubleSide });
const shedCeilMat  = mk(shedMats, { map: wallTex,  color: 0x8f7b66, roughness: 1, side: THREE.DoubleSide });
const shedDoorMat  = mk(shedMats, { map: wallTex,  color: 0xa68c70, roughness: 1, side: THREE.DoubleSide });
const shedLinMat   = mk(shedMats, { map: wallTex,  color: 0x4a3626, roughness: 1, side: THREE.DoubleSide });   // fond du tonneau, vu d'en dessous
const mBeam   = mk(shedMats, { color: 0x3a281a, roughness: 1 });
const mDark   = mk(shedMats, { color: 0x2b2118, roughness: 0.9 });
const mMetal  = mk(shedMats, { color: 0x6c7075, roughness: 0.45, metalness: 0.7 });
const mWood   = mk(shedMats, { map: wallTex, color: 0xb59a7e, roughness: 1 });
const mLadder = mk(shedMats, { color: 0x6b4a2b, roughness: 0.9 });
const mGlow   = mk(shedMats, { color: 0xffc874 }, THREE.MeshBasicMaterial);
const mLeak   = mk(shedMats, { color: 0xfff1cf }, THREE.MeshBasicMaterial);
const mWindow = mk(shedMats, { color: 0xc4dcf5, side: THREE.DoubleSide }, THREE.MeshBasicMaterial);

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}
function sWall(w, h, x, y, z, ry) {
  const m = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(w, h), w / 1.2, h / 1.2), shedWallMat);
  m.position.set(x, y, z); m.rotation.y = ry; shedScene.add(m); return m;
}
function sFlat(mat, w, d, x, y, z, down) {
  const m = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(w, d), w / 1.2, d / 1.2), mat);
  m.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
  m.position.set(x, y, z); shedScene.add(m); return m;
}
const sBox = (mat, w, h, d, x, y, z) => addBox(shedScene, mat, w, h, d, x, y, z);
function sCyl(mat, rt, rb, h, x, y, z, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); shedScene.add(m); return m;
}

const SX1 = SHED.x1, SX2 = SHED.x2, SZ1 = SHED.z1, SZ2 = SHED.z2, SH = SHED.h;
sFlat(shedFloorMat, SX2 - SX1, SZ2 - SZ1, 0, 0, 0, false);
sFlat(shedCeilMat, SHAFT.x1 - SX1, SZ2 - SZ1, (SX1 + SHAFT.x1) / 2, SH, 0, true);
sFlat(shedCeilMat, SX2 - SHAFT.x1, SZ2 - SHAFT.z2, (SHAFT.x1 + SX2) / 2, SH, (SHAFT.z2 + SZ2) / 2, true);   // la trappe du puits reste libre
sWall(SX2 - SX1, SH, 0, SH / 2, SZ1, 0);
sWall(DB.x1 - SX1, SH, (SX1 + DB.x1) / 2, SH / 2, SZ2, Math.PI);          // à gauche de la porte
sWall(SX2 - DB.x2, SH, (DB.x2 + SX2) / 2, SH / 2, SZ2, Math.PI);          // à droite de la porte
sWall(DB.x2 - DB.x1, SH - DB.h, DB.cx, (DB.h + SH) / 2, SZ2, Math.PI);    // au-dessus
sWall(SZ2 - SZ1, SH, SX1, SH / 2, 0, Math.PI / 2);
sWall(SZ2 - SZ1, SH, SX2, SH / 2, 0, -Math.PI / 2);

{   // puits de l'échelle, du plafond jusqu'au fond du tonneau
  const SW = SHAFT.x2 - SHAFT.x1, SHH = SHAFT.top - SH, SY = (SH + SHAFT.top) / 2;
  const cx = (SHAFT.x1 + SHAFT.x2) / 2, cz = (SHAFT.z1 + SHAFT.z2) / 2;
  sWall(SW, SHH, SHAFT.x2, SY, cz, -Math.PI / 2);
  sWall(SW, SHH, cx, SY, SHAFT.z1, 0);
  sWall(SW, SHH, SHAFT.x1, SY, cz, Math.PI / 2);
  sWall(SW, SHH, cx, SY, SHAFT.z2, Math.PI);
  const lin = new THREE.Shape();
  lin.moveTo(SHAFT.x1, SHAFT.z1); lin.lineTo(SHAFT.x2, SHAFT.z1); lin.lineTo(SHAFT.x2, SHAFT.z2); lin.lineTo(SHAFT.x1, SHAFT.z2); lin.closePath();
  const linHole = new THREE.Path();
  linHole.absarc(HOLE_S.x, HOLE_S.z, HR, 0, Math.PI * 2, true);
  lin.holes.push(linHole);
  const linGeo = new THREE.ShapeGeometry(lin, 48);
  linGeo.rotateX(Math.PI / 2);
  const linMesh = new THREE.Mesh(linGeo, shedLinMat);
  linMesh.position.y = SHAFT.top + 0.002;
  shedScene.add(linMesh);
}

// Charpente
for (const z of [-0.3, 0.6, 1.45]) sBox(mBeam, SX2 - SX1, 0.14, 0.12, 0, SH - 0.07, z);
sBox(mBeam, SHAFT.x1 - SX1, 0.14, 0.12, (SX1 + SHAFT.x1) / 2, SH - 0.07, -1.2);
for (const [x, z] of [[SX1 + 0.06, SZ1 + 0.06], [SX1 + 0.06, SZ2 - 0.06], [SX2 - 0.06, SZ2 - 0.06]]) sBox(mBeam, 0.12, SH, 0.12, x, SH / 2, z);

// Échelle, le long du mur droit, du sol jusqu'en haut du puits
{
  const railH = 5.5;
  for (const dz of [-0.2, 0.2]) sBox(mLadder, 0.05, railH, 0.05, LAD_FACE, 0.05 + railH / 2, LAD_Z + dz);
  const rungGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8); rungGeo.rotateX(Math.PI / 2);
  for (let y = 0.25; y < 5.55; y += 0.3) { const r = new THREE.Mesh(rungGeo, mLadder); r.position.set(LAD_FACE, y, LAD_Z); shedScene.add(r); }
  for (const y of [0.5, 1.9, 3.3, 4.7]) for (const dz of [-0.2, 0.2]) sBox(mMetal, 0.04, 0.04, 0.05, SHAFT.x2 - 0.017, y, LAD_Z + dz);
}

// Porte de la cabane : encadrement et battant ouvert contre le mur, côté gauche
{
  const D3 = 0.14;
  for (const s of [-1, 1]) sBox(mBeam, 0.09, DB.h + 0.09, D3, DB.cx + s * (DB.hw + 0.045), (DB.h + 0.09) / 2, SZ2 - D3 / 2);
  sBox(mBeam, 2 * DB.hw + 0.18, 0.09, D3, DB.cx, DB.h + 0.045, SZ2 - D3 / 2);
  const pivot = new THREE.Group();
  pivot.position.set(DB.x1 + 0.02, 0, SZ2 - 0.04);
  pivot.rotation.y = Math.PI / 2;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.1, DB.h - 0.03, 0.04), shedDoorMat);
  leaf.position.set(0.55, (DB.h - 0.03) / 2 + 0.01, 0);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.07), mMetal);
  knob.position.set(1.0, 1.0, 0);
  pivot.add(leaf, knob);
  shedScene.add(pivot);
}

// Fenêtre sale
{
  const wx = 1.45, wy = 1.55;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), mWindow);
  pane.position.set(wx, wy, SZ2 - 0.012); shedScene.add(pane);
  for (const s of [-1, 1]) { sBox(mBeam, 0.78, 0.05, 0.05, wx, wy + s * 0.3, SZ2 - 0.03); sBox(mBeam, 0.05, 0.65, 0.05, wx + s * 0.375, wy, SZ2 - 0.03); }
  sBox(mBeam, 0.7, 0.03, 0.03, wx, wy, SZ2 - 0.03);
  sBox(mBeam, 0.03, 0.55, 0.03, wx, wy, SZ2 - 0.03);
  sBox(mWood, 0.9, 0.04, 0.12, wx, wy - 0.33, SZ2 - 0.07);
}

// Lanterne suspendue + éclairage
const LANT = new THREE.Vector3(0, 2.0, 0.2);
sCyl(mDark, 0.005, 0.005, 0.5, LANT.x, SH - 0.25, LANT.z, 6);
sCyl(mDark, 0.07, 0.08, 0.03, LANT.x, 2.08, LANT.z);
sCyl(mGlow, 0.055, 0.06, 0.15, LANT.x, 2.17, LANT.z);
sCyl(mDark, 0.02, 0.08, 0.05, LANT.x, 2.28, LANT.z);
const lanternLight = new THREE.PointLight(0xffb15c, 1.1, 12, 1.3);
lanternLight.position.set(LANT.x, 2.15, LANT.z);
shedScene.add(lanternLight);
const shaftLight = new THREE.PointLight(0xffb870, 0.7, 6, 1.2);
shaftLight.position.set(HOLE_S.x - 0.3, 3.4, HOLE_S.z);
shedScene.add(shaftLight);
const windowLight = new THREE.PointLight(0xb7d4ff, 0.5, 5, 1.2);
windowLight.position.set(1.45, 1.5, SZ2 - 0.5);
shedScene.add(windowLight);
const doorLight = new THREE.PointLight(0xffe8a0, 0.7, 6, 1.2);   // la lumière des backrooms qui entre dans la cabane
doorLight.position.set(DB.cx, 1.5, SZ2 - 0.5);
shedScene.add(doorLight);

// =====================================================================
//  Monde 4 : les backrooms (derrière la porte de la cabane)
//  Génération infinie par morceaux (chunks), déterministe : mêmes lieux à chaque visite.
//  Éclairage « cuit » dans les couleurs des sommets : aucune lumière dynamique, aucun clignotement.
// =====================================================================
const BK = { S: 4.5, H: 3.0, T: 0.2, CH: 4, R: 3, PW: 0.9 };   // taille de cellule, hauteur, épaisseur des murs, cellules par chunk, rayon de chargement, pilier
const BK_FOG = 0xcdbd74;
const CHS = BK.CH * BK.S;
const ZERO = new THREE.Vector3();
const BOFF = new THREE.Vector3(BK.S / 2 - DB.cx, 0, -SHED.z2);   // cabane -> backrooms : p' = p + BOFF
const BK_ENTRY = new THREE.Vector3(BK.S / 2, 0, 0);              // centre de la porte, côté backrooms
const backScene = new THREE.Scene();
backScene.fog = new THREE.Fog(BK_FOG, 8, 44);
const backMats = [];

// --- Textures
function bkCanvas(n, draw) { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), mulberry32(n * 7 + 3)); return c; }
function bkTex(canvas, size) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.anisotropy = 4;
  return t;
}
const bkWallTex = bkTex(bkCanvas(256, (g, r) => {            // papier peint rayé jaune
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#d6c36b' : '#decc77'; g.fillRect(i * 16, 0, 16, 256); }
  g.fillStyle = 'rgba(140,118,48,0.22)';
  for (let i = 0; i < 16; i++) g.fillRect(i * 16, 0, 1, 256);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(110,90,35,${0.03 + r() * 0.05})` : `rgba(255,245,185,${0.03 + r() * 0.05})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 3);
  }
}), 1.28);
const bkFloorTex = bkTex(bkCanvas(128, (g, r) => {           // moquette
  g.fillStyle = '#a59f62'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(60,55,25,${0.08 + r() * 0.12})` : `rgba(220,210,140,${0.08 + r() * 0.12})`;
    g.fillRect(r() * 128, r() * 128, 1 + r() * 1.5, 1 + r() * 1.5);
  }
}), 1.0);
const bkCeilTex = bkTex(bkCanvas(128, (g, r) => {            // dalles de plafond de 60 cm
  g.fillStyle = '#d4ca94'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(90,80,40,${0.08 + r() * 0.15})`; g.fillRect(r() * 128, r() * 128, 1, 1); }
  g.fillStyle = 'rgba(95,85,45,0.6)'; g.fillRect(0, 0, 128, 3); g.fillRect(0, 0, 3, 128);
}), 0.6);

const bWall  = mk(backMats, { map: bkWallTex,  vertexColors: true }, THREE.MeshBasicMaterial);
const bTrim  = mk(backMats, { color: 0x8a6b38, vertexColors: true }, THREE.MeshBasicMaterial);
const bFloor = mk(backMats, { map: bkFloorTex, vertexColors: true }, THREE.MeshBasicMaterial);
const bCeil  = mk(backMats, { map: bkCeilTex,  vertexColors: true }, THREE.MeshBasicMaterial);
const bLight = mk(backMats, { color: 0xfffbe6 }, THREE.MeshBasicMaterial);

// --- Génération déterministe
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lightOn = (i, j) => hash2(i, j, 5) > 0.14;
const hasPillar = (i, j) => !(j === 0 && (i === 0 || i === 1)) && hash2(i, j, 77) < 0.14;

// Arêtes du réseau : dir 0 = mur le long de x (à z = j*S), dir 1 = mur le long de z (à x = i*S)
// 0 vide · 1 plein · 2 porte · 3 grande ouverture · 4 muret · 5 porte vers la cabane
function edgeType(dir, i, j) {
  if (dir === 0 && i === 0 && j === 0) return 5;
  if ((dir === 1 && j === 0 && (i === 0 || i === 1)) || (dir === 0 && i === 0 && j === 1)) return 0;   // la cellule d'arrivée reste ouverte
  const r = hash2(i, j, dir + 11);
  if (r < 0.56) return 0;
  if (r < 0.72) return 1;
  if (r < 0.84) return 2;
  if (r < 0.96) return 3;
  return 4;
}
// Éléments d'une arête : [début, fin (le long du mur), bas, haut, boiserie (0/1), épaisseur]
const PARTS = (() => {
  const { S, T, H } = BK, L0 = -T / 2, L1 = S + T / 2, m = S / 2;
  const g2 = 0.8, g3 = 1.4, g5 = 0.65, fw = 0.09, fh = 2.05;
  return [
    [],
    [[L0, L1, 0, H, 0, T]],
    [[L0, m - g2, 0, H, 0, T], [m + g2, L1, 0, H, 0, T], [m - g2, m + g2, 2.3, H, 0, T]],
    [[L0, m - g3, 0, H, 0, T], [m + g3, L1, 0, H, 0, T], [m - g3, m + g3, 2.45, H, 0, T]],
    [[L0, L1, 0, 1.1, 0, T], [L0 - 0.03, L1 + 0.03, 1.1, 1.14, 1, T + 0.06]],
    [[L0, m - g5 - fw, 0, H, 0, T], [m + g5 + fw, L1, 0, H, 0, T], [m - g5 - fw, m + g5 + fw, fh + fw, H, 0, T],
     [m - g5 - fw, m - g5, 0, fh + fw, 1, T + 0.04], [m + g5, m + g5 + fw, 0, fh + fw, 1, T + 0.04], [m - g5, m + g5, fh, fh + fw, 1, T + 0.04]],
  ];
})();

// --- Éclairage cuit : plus clair sous les néons
function lightAt(x, z) {
  const S = BK.S, ci = Math.floor(x / S), cj = Math.floor(z / S);
  let s = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const i = ci + a, j = cj + b;
    if (!lightOn(i, j)) continue;
    const dx = x - (i + 0.5) * S, dz = z - (j + 0.5) * S;
    const d = Math.sqrt(dx * dx + dz * dz) / 5.5;
    if (d < 1) s += (1 - d) * (1 - d);
  }
  return Math.min(1, s);
}
function shade(x, y, z, n) {
  let s = 0.68 + 0.5 * lightAt(x, z);
  s *= 0.88 + 0.12 * (y / BK.H);
  if (n[1] === 0) s *= 0.9 + 0.06 * n[0] - 0.03 * n[2];
  return Math.min(1, s);
}

// --- Construction de la géométrie
const NX = [-1, 0, 0], PX = [1, 0, 0], NY = [0, -1, 0], PY = [0, 1, 0], NZ = [0, 0, -1], PZ = [0, 0, 1];
function addFace(b, c, n) {
  const ux = c[1][0] - c[0][0], uy = c[1][1] - c[0][1], uz = c[1][2] - c[0][2];
  const vx = c[2][0] - c[0][0], vy = c[2][1] - c[0][1], vz = c[2][2] - c[0][2];
  const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  const order = d >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];   // sens de rotation corrigé automatiquement
  const ax = Math.abs(n[0]) > 0.5, ay = Math.abs(n[1]) > 0.5;
  for (const k of order) {
    const p = c[k];
    b.pos.push(p[0], p[1], p[2]);
    b.uv.push(ax ? p[2] : p[0], ax ? p[1] : (ay ? p[2] : p[1]));   // UV en mètres : les textures se raccordent d'un mur à l'autre
    if (b.col) { const s = shade(p[0], p[1], p[2], n); b.col.push(s, s, s); }
  }
}
function bkBox(b, x0, y0, z0, x1, y1, z1) {
  addFace(b, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], NX);
  addFace(b, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], PX);
  if (y0 > 0) addFace(b, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], NY);
  if (y1 < BK.H) addFace(b, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], PY);
  addFace(b, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], NZ);
  addFace(b, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], PZ);
}

function buildChunk(cx, cz) {
  const { S, H, CH } = BK;
  const nb = (col) => ({ pos: [], uv: [], col: col ? [] : null });
  const B = { wall: nb(true), trim: nb(true), floor: nb(true), ceil: nb(true), light: nb(false) };
  const i0 = cx * CH, j0 = cz * CH;
  for (let j = j0; j < j0 + CH; j++) for (let i = i0; i < i0 + CH; i++) {
    const x0 = i * S, z0 = j * S, N = 4, d = S / N;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {       // sol et plafond en grille (pour l'éclairage cuit)
      const xa = x0 + a * d, xb = xa + d, za = z0 + b * d, zb = za + d;
      addFace(B.floor, [[xa, 0, za], [xb, 0, za], [xb, 0, zb], [xa, 0, zb]], PY);
      addFace(B.ceil,  [[xa, H, za], [xb, H, za], [xb, H, zb], [xa, H, zb]], NY);
    }
    if (lightOn(i, j)) {                                             // néon carré / rectangulaire au plafond
      const alongX = hash2(i, j, 9) < 0.5, hx = alongX ? 0.6 : 0.3, hz = alongX ? 0.3 : 0.6;
      const lx = x0 + S / 2, lz = z0 + S / 2;
      bkBox(B.light, lx - hx, H - 0.03, lz - hz, lx + hx, H, lz + hz);
    }
    for (let dir = 0; dir < 2; dir++) {
      const t = edgeType(dir, i, j);
      if (!t) continue;
      for (const p of PARTS[t]) {
        const hw = p[5] / 2, tg = p[4] ? B.trim : B.wall;
        if (dir === 0) bkBox(tg, x0 + p[0], p[2], z0 - hw, x0 + p[1], p[3], z0 + hw);
        else bkBox(tg, x0 - hw, p[2], z0 + p[0], x0 + hw, p[3], z0 + p[1]);
      }
    }
    if (hasPillar(i, j)) { const h = BK.PW / 2; bkBox(B.wall, x0 - h, 0, z0 - h, x0 + h, H, z0 + h); }
  }
  const grp = new THREE.Group();
  const mats = { wall: bWall, trim: bTrim, floor: bFloor, ceil: bCeil, light: bLight };
  for (const k in B) {
    const b = B[k];
    if (!b.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    if (b.col) g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.computeBoundingSphere();
    grp.add(new THREE.Mesh(g, mats[k]));
  }
  backScene.add(grp);
  return grp;
}

// --- Chargement / déchargement des chunks autour d'un point
const bkChunks = new Map();
function ensureBack(px, pz, R, budget) {
  const ccx = Math.floor(px / CHS), ccz = Math.floor(pz / CHS), need = [];
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
    const cx = ccx + a, cz = ccz + b;
    if (!bkChunks.has(cx + ',' + cz)) need.push([a * a + b * b, cx, cz]);
  }
  need.sort((p, q) => p[0] - q[0]);
  for (let n = 0; n < need.length && n < budget; n++) {
    const [, cx, cz] = need[n];
    bkChunks.set(cx + ',' + cz, { cx, cz, grp: buildChunk(cx, cz) });
  }
  for (const [k, c] of bkChunks) {
    if (Math.abs(c.cx - ccx) > R + 1 || Math.abs(c.cz - ccz) > R + 1) {
      backScene.remove(c.grp);
      c.grp.children.forEach(m => m.geometry.dispose());
      bkChunks.delete(k);
    }
  }
}
ensureBack(BK_ENTRY.x, BK_ENTRY.z, 2, 999);

// --- Collisions : calculées à la volée depuis la même génération
const _bb = []; let _bn = 0;
function pushBox(x0, z0, x1, z1) {
  const b = _bb[_bn] || (_bb[_bn] = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
  b.minX = x0; b.minZ = z0; b.maxX = x1; b.maxZ = z1; _bn++;
}
function collectBack(px, pz) {
  const S = BK.S, ci = Math.floor(px / S), cj = Math.floor(pz / S);
  _bn = 0;
  for (let i = ci - 1; i <= ci + 2; i++) for (let j = cj - 1; j <= cj + 2; j++) {
    for (let dir = 0; dir < 2; dir++) {
      const t = edgeType(dir, i, j);
      if (!t) continue;
      for (const p of PARTS[t]) {
        if (p[2] > 0) continue;                                       // linteaux et chapeaux de muret : pas d'obstacle au sol
        const hw = p[5] / 2;
        if (dir === 0) pushBox(i * S + p[0], j * S - hw, i * S + p[1], j * S + hw);
        else pushBox(i * S - hw, j * S + p[0], i * S + hw, j * S + p[1]);
      }
    }
    if (hasPillar(i, j)) { const h = BK.PW / 2; pushBox(i * S - h, j * S - h, i * S + h, j * S + h); }
  }
  return _bn;
}

// =====================================================================
//  Le tonneau : posé dans la salle, on peut le porter, retirer son couvercle, entrer dedans
// =====================================================================
const barrelTex = makeBarrelTexture(7);
function makeBarrelMats(list) {
  return {
    wood:  mk(list, { map: barrelTex, color: 0xd8bfa0, roughness: 0.9, side: THREE.DoubleSide }),
    lidW:  mk(list, { map: barrelTex, color: 0xc4aa8a, roughness: 0.9 }),
    metal: mk(list, { color: 0x3b3d42, roughness: 0.5, metalness: 0.7 }),
  };
}
const rOut = (t) => B_TOP + (BR - B_TOP) * (1 - (2 * t - 1) * (2 * t - 1));   // profil bombé

const BG = (() => {
  const pts = [new THREE.Vector2(0, 0)];                                       // fond
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(rOut(t), t * BH)); }   // paroi extérieure
  pts.push(new THREE.Vector2(HR, BH));                                         // bordure
  for (let i = 1; i <= 12; i++) { const y = BH - (BH - 0.05) * i / 12; pts.push(new THREE.Vector2(rOut(y / BH) - 0.08, y)); }   // paroi intérieure
  pts.push(new THREE.Vector2(0, 0.05));
  const body = new THREE.LatheGeometry(pts, 40);
  const hoops = [0.12, 0.3, 0.6, 0.78].map(y => {
    const g = new THREE.TorusGeometry(rOut(y / BH) + 0.004, 0.013, 8, 48);
    g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g;
  });
  const lid = new THREE.CylinderGeometry(LID_R, LID_R, LID_T, 40); lid.translate(0, LID_T / 2, 0);
  const ring = new THREE.TorusGeometry(0.06, 0.01, 8, 20); ring.rotateX(Math.PI / 2); ring.translate(0, LID_T + 0.01, 0);
  const band = new THREE.BoxGeometry(2 * LID_R - 0.04, 0.008, 0.05); band.translate(0, LID_T + 0.004, 0);
  return { body, hoops, lid, ring, band };
})();

function buildBarrel(M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(BG.body, M.wood));
  for (const h of BG.hoops) g.add(new THREE.Mesh(h, M.metal));
  const lg = new THREE.Group();                                  // couvercle : son origine est sa face inférieure
  lg.add(new THREE.Mesh(BG.lid, M.lidW), new THREE.Mesh(BG.ring, M.metal), new THREE.Mesh(BG.band, M.metal));
  lg.position.y = BH;
  g.add(lg);
  return { group: g, lid: lg };
}

// État du tonneau et du couvercle
const bp  = { state: 'placed', world: 'room', x: -2.2, y: 0, z: -3.2, yaw: 0.5 };   // state : 'placed' | 'carried'
const lid = { mode: 'on', x: 0, y: BH, z: 0, dx: 0, dz: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, t: 0, tilt: 0, ax: 1, az: 0 };
// mode : 'on' (fermé) | 'drag' (suit la souris) | 'fall' (tombe au sol) | 'off' (posé au sol) | 'back' (revient)
const lidOn = () => lid.mode === 'on' || lid.mode === 'drag' || lid.mode === 'back';

// Instances : une dans la salle, neuf dans l'extérieur (une par tuile du tore), une dans les mains
const matsRoom = makeBarrelMats(roomMats), matsOut = makeBarrelMats(outMats), matsHold = makeBarrelMats([]);
const barrels = [];
{
  const b = buildBarrel(matsRoom); roomRoot.add(b.group);
  barrels.push({ group: b.group, lid: b.lid, ox: 0, oz: 0, w: 'room' });
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
    const o = buildBarrel(matsOut); outScene.add(o.group);
    barrels.push({ group: o.group, lid: o.lid, ox: ix * P, oz: iz * P, w: 'out' });
  }
}
const held = buildBarrel(matsHold);
const holder = new THREE.Group();
holder.rotation.order = 'YXZ';
holder.add(held.group);
held.group.position.set(CARRY.x, CARRY.y, CARRY.z);
held.group.rotation.set(-0.1, 0.25, 0.04);
holdScene.add(holder);
const holdLight = new THREE.HemisphereLight(0xffffff, 0x666a74, 1.0);
holdScene.add(holdLight);

const _lq = new THREE.Quaternion(), _ax = new THREE.Vector3();
function updateLid(dt) {
  if (lid.mode === 'drag') { lid.x = lid.dx; lid.z = lid.dz; lid.y = BH + 0.06; }
  else if (lid.mode === 'fall' || lid.mode === 'back') {
    const fall = lid.mode === 'fall';
    lid.t = Math.min(1, lid.t + dt / (fall ? 0.4 : 0.3));
    const k = fall ? lid.t * lid.t : ss(lid.t);
    lid.x = lerp(lid.fx, lid.tx, k); lid.y = lerp(lid.fy, lid.ty, k); lid.z = lerp(lid.fz, lid.tz, k);
    if (lid.t >= 1) lid.mode = fall ? 'off' : 'on';
  }
  const d = Math.hypot(lid.x, lid.z);
  if (lid.mode === 'drag' && d > 1e-4) { lid.ax = lid.z / d; lid.az = -lid.x / d; }
  const want = lid.mode === 'drag' ? Math.min(d, 0.8) * 0.3 : 0;
  lid.tilt += (want - lid.tilt) * Math.min(1, dt * 12);
}
function updateBarrelVisuals(dt) {
  updateLid(dt);
  _ax.set(lid.ax, 0, lid.az);
  _lq.setFromAxisAngle(_ax, lid.tilt);
  const placed = bp.state === 'placed';
  for (const b of barrels) {
    b.group.visible = placed && bp.world === b.w;
    b.group.position.set(bp.x + b.ox, bp.y, bp.z + b.oz);
    b.group.rotation.y = bp.yaw;
    b.lid.position.set(lid.x, lid.y, lid.z);
    b.lid.quaternion.copy(_lq);
  }
  held.group.visible = bp.state === 'carried';
}

const _O = new THREE.Vector3();
function holeCenter(ref) {          // centre de l'ouverture (copie de tuile la plus proche de ref, dans l'extérieur)
  let ox = 0, oz = 0;
  if (bp.world === 'out') { ox = P * Math.round((ref.x - bp.x) / P); oz = P * Math.round((ref.z - bp.z) / P); }
  return _O.set(bp.x + ox, bp.y + BH, bp.z + oz);
}
const link = { O: new THREE.Vector3() };   // ouverture utilisée pour entrer (coordonnées du monde d'origine)

// =====================================================================
//  Portail de la porte : quad dans l'ouverture (stencil) + remise à zéro de la profondeur
// =====================================================================
const quadGeo = new THREE.PlaneGeometry(OPEN_X2 - OPEN_X1 + 0.04, OPEN_H + 0.07);
quadGeo.translate(DOOR_CX, (OPEN_H - 0.03) / 2, WALL_Z);

const stencilQuadMat = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
  stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1,
  stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp
});
const depthQuadMat = new THREE.ShaderMaterial({
  vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
  fragmentShader: `void main(){ gl_FragColor = vec4(0.0); }`,
  colorWrite: false, depthWrite: true, depthFunc: THREE.AlwaysDepth, side: THREE.DoubleSide,
  stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: 1,
  stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp
});
const portalScene = new THREE.Scene();
const quadStencil = new THREE.Mesh(quadGeo, stencilQuadMat);
const quadDepth   = new THREE.Mesh(quadGeo, depthQuadMat);
quadStencil.frustumCulled = quadDepth.frustumCulled = false;
portalScene.add(quadStencil, quadDepth);

function setStencil(list, ref) {
  for (const m of list) {
    if (ref === 0) { m.stencilWrite = false; continue; }
    m.stencilWrite = true; m.stencilFunc = THREE.EqualStencilFunc; m.stencilRef = ref;
    m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp;
  }
}

const planeOut  = new THREE.Plane(new THREE.Vector3(0, 0, -1), WALL_Z);
const planeRoom = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), tmpBox = new THREE.Box3();

function portalVisible(ox, oz) {
  tmpBox.min.set(OPEN_X1 - 0.1 + ox, -0.1, WALL_Z - 0.1 + oz);
  tmpBox.max.set(OPEN_X2 + 0.1 + ox, OPEN_H + 0.1, WALL_Z + 0.1 + oz);
  return frustum.intersectsBox(tmpBox);
}
function doorVisible(ox, oz) {
  tmpBox.min.set(OPEN_X1 - 1.3 + ox, -0.1, WALL_Z - 1.3 + oz);
  tmpBox.max.set(OPEN_X2 + 1.3 + ox, 2.5, WALL_Z + 1.3 + oz);
  return frustum.intersectsBox(tmpBox);
}

function drawPortal(k, ox, oz, target) {
  quadStencil.position.set(ox, 0, oz); quadDepth.position.set(ox, 0, oz);
  stencilQuadMat.stencilRef = k; depthQuadMat.stencilRef = k;
  quadStencil.visible = true;  quadDepth.visible = false;
  renderer.render(portalScene, camera);
  quadStencil.visible = false; quadDepth.visible = true;
  renderer.render(portalScene, camera);
  if (target === 'out') {
    setStencil(outMats, k);
    renderer.clippingPlanes = [planeOut];
    renderer.render(outScene, camera);
    setStencil(outMats, 0);
  } else {
    roomRoot.position.set(ox, 0, oz);
    planeRoom.constant = -(WALL_Z + oz);
    setStencil(roomMats, k);
    renderer.clippingPlanes = [planeRoom];
    renderer.render(roomScene, camera);
    setStencil(roomMats, 0);
    roomRoot.position.set(0, 0, 0);
  }
  renderer.clippingPlanes = [];
}

function drawOutPortals(skipMain) {
  const list = [];
  for (const d of doorCopies) {
    if (skipMain && d.ox === 0 && d.oz === 0) continue;
    if (camPos.z >= WALL_Z + d.oz) continue;
    if (!portalVisible(d.ox, d.oz)) continue;
    const dist = Math.hypot(camPos.x - (DOOR_CX + d.ox), camPos.z - (WALL_Z + d.oz));
    if (dist > 110) continue;
    list.push({ ...d, dist });
  }
  list.sort((a, b) => a.dist - b.dist);
  list.forEach((d, i) => drawPortal(i + 1, d.ox, d.oz, 'room'));
}

const TUNNEL_HALF = 0.08;
function renderTunnel() {
  roomRoot.position.set(0, 0, 0);
  setStencil(roomMats, 0); setStencil(outMats, 0);
  planeRoom.constant = -WALL_Z;
  renderer.clippingPlanes = [planeRoom];
  renderer.render(roomScene, camera);
  renderer.clippingPlanes = [planeOut];
  renderer.render(outScene, camera);
  renderer.clippingPlanes = [];
}

function renderDoors() {
  renderer.clippingPlanes = [];
  for (const d of doorCopies) {
    if (!doorVisible(d.ox, d.oz)) continue;
    if (Math.hypot(camPos.x - (DOOR_CX + d.ox), camPos.z - (WALL_Z + d.oz)) > 115) continue;
    doorRoot.position.set(d.ox, 0, d.oz);
    renderer.render(doorScene, camera);
  }
  doorRoot.position.set(0, 0, 0);
}

// =====================================================================
//  Portail du tonneau : ouverture circulaire horizontale reliant le tonneau au haut du puits.
//  Caméra virtuelle : le monde de destination n'est jamais déplacé.
// =====================================================================
const vcam = new THREE.PerspectiveCamera(75, 1, 0.02, 500);
const holeGeo = new THREE.CircleGeometry(HR + 0.004, 48);
holeGeo.rotateX(-Math.PI / 2);
const holeScene = new THREE.Scene();
const holeStencil = new THREE.Mesh(holeGeo, stencilQuadMat);
const holeDepth   = new THREE.Mesh(holeGeo, depthQuadMat);
holeStencil.frustumCulled = holeDepth.frustumCulled = false;
holeScene.add(holeStencil, holeDepth);

const planeShedBelow = new THREE.Plane(new THREE.Vector3(0, -1, 0), HOLE_S.y);   // garde y <= haut du puits
const planeAbove = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);               // garde y >= plan de l'ouverture
const keepAbove = (y) => { planeAbove.constant = -y; return planeAbove; };

const mOS = new THREE.Matrix4(), mSO = new THREE.Matrix4(), _ma = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _vm = new THREE.Matrix4();
const _h = new THREE.Vector3();
function setPortalMatrix(out, from, to, rot) {       // p -> to + Ry(rot) (p - from)
  out.makeTranslation(to.x, to.y, to.z);
  out.multiply(_ma.makeRotationY(rot));
  out.multiply(_mb.makeTranslation(-from.x, -from.y, -from.z));
  return out;
}
function setVirtualCamera(portalMat) {
  _vm.multiplyMatrices(portalMat, camera.matrixWorld);
  _vm.decompose(vcam.position, vcam.quaternion, vcam.scale);
  vcam.projectionMatrix.copy(camera.projectionMatrix);
  vcam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  vcam.updateMatrixWorld(true);
}
function markHole(pos, k) {
  holeStencil.position.copy(pos); holeDepth.position.copy(pos);
  stencilQuadMat.stencilRef = k; depthQuadMat.stencilRef = k;
  holeStencil.visible = true;  holeDepth.visible = false;
  renderer.render(holeScene, camera);
  holeStencil.visible = false; holeDepth.visible = true;
  renderer.render(holeScene, camera);
}
function drawWorld(target, cam, plane, ref) {
  const p = cam === camera ? camPos : cam.position;
  renderer.clippingPlanes = plane ? [plane] : [];
  if (target === 'shed') {
    setStencil(shedMats, ref); renderer.render(shedScene, cam); setStencil(shedMats, 0);
  } else if (target === 'room') {
    roomRoot.position.set(0, 0, 0);
    setStencil(roomMats, ref); renderer.render(roomScene, cam); setStencil(roomMats, 0);
  } else if (target === 'back') {
    setStencil(backMats, ref); renderer.render(backScene, cam); setStencil(backMats, 0);
  } else {
    sky.position.copy(p); updateTiles(p);
    setStencil(outMats, ref); renderer.render(outScene, cam); setStencil(outMats, 0);
  }
  renderer.clippingPlanes = [];
}
function drawHoleFromOrigin(O) {      // on regarde dans le tonneau : on voit la cabane
  markHole(_h.set(O.x, O.y + 0.0015, O.z), HOLE_REF);
  setPortalMatrix(mOS, O, HOLE_S, -bp.yaw);
  setVirtualCamera(mOS);
  drawWorld('shed', vcam, planeShedBelow, HOLE_REF);
}
function drawHoleFromShed(O) {        // on regarde vers le haut du puits : on voit le monde d'origine
  markHole(HOLE_S, HOLE_REF);
  setPortalMatrix(mSO, HOLE_S, O, bp.yaw);
  setVirtualCamera(mSO);
  drawWorld(bp.world, vcam, keepAbove(O.y), HOLE_REF);
}
function renderHoleTunnel(O) {        // caméra à cheval sur le plan de l'ouverture : les deux demi-espaces, sans quad
  if (world === 'shed') {
    drawWorld('shed', camera, planeShedBelow, 0);
    setPortalMatrix(mSO, HOLE_S, O, bp.yaw); setVirtualCamera(mSO);
    drawWorld(bp.world, vcam, keepAbove(O.y), 0);
  } else {
    drawWorld(world, camera, keepAbove(O.y), 0);
    setPortalMatrix(mOS, O, HOLE_S, -bp.yaw); setVirtualCamera(mOS);
    drawWorld('shed', vcam, planeShedBelow, 0);
  }
}
function holeVisible(pos) {
  if (camPos.distanceTo(pos) > 45) return false;
  tmpBox.min.set(pos.x - 0.4, pos.y - 0.1, pos.z - 0.4);
  tmpBox.max.set(pos.x + 0.4, pos.y + 0.1, pos.z + 0.4);
  return frustum.intersectsBox(tmpBox);
}

// =====================================================================
//  Portail de la porte de la cabane : cabane <-> backrooms (simple translation BOFF, sans rotation)
// =====================================================================
const DOOR_REF = 51;
const mPT = new THREE.Matrix4();
const dpGeo = new THREE.PlaneGeometry(2 * DB.hw + 0.04, DB.h + 0.04);
dpGeo.translate(DB.cx, DB.h / 2, SHED.z2);
const dpScene = new THREE.Scene();
const dpStencil = new THREE.Mesh(dpGeo, stencilQuadMat);
const dpDepth   = new THREE.Mesh(dpGeo, depthQuadMat);
dpStencil.frustumCulled = dpDepth.frustumCulled = false;
dpScene.add(dpStencil, dpDepth);

const planeBackBeyond = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);            // backrooms : garde z' >= 0 (au-delà du mur de la porte)
const planeShedFront  = new THREE.Plane(new THREE.Vector3(0, 0, -1), SHED.z2);     // cabane : garde z <= plan de la porte

function markDoor(off, k) {
  dpStencil.position.copy(off); dpDepth.position.copy(off);
  stencilQuadMat.stencilRef = k; depthQuadMat.stencilRef = k;
  dpStencil.visible = true;  dpDepth.visible = false;
  renderer.render(dpScene, camera);
  dpStencil.visible = false; dpDepth.visible = true;
  renderer.render(dpScene, camera);
}
function drawBackFromShed() {       // on regarde par la porte depuis la cabane : on voit les backrooms
  markDoor(ZERO, DOOR_REF);
  setPortalMatrix(mPT, ZERO, BOFF, 0);
  setVirtualCamera(mPT);
  drawWorld('back', vcam, planeBackBeyond, DOOR_REF);
}
function drawShedFromBack() {       // on regarde derrière soi depuis les backrooms : on voit la cabane
  markDoor(BOFF, DOOR_REF);
  setPortalMatrix(mPT, BOFF, ZERO, 0);
  setVirtualCamera(mPT);
  drawWorld('shed', vcam, planeShedFront, DOOR_REF);
}
function renderDoorTunnel() {       // caméra à cheval sur le plan de la porte : les deux demi-espaces, sans quad
  if (world === 'shed') {
    drawWorld('shed', camera, planeShedFront, 0);
    setPortalMatrix(mPT, ZERO, BOFF, 0); setVirtualCamera(mPT);
    drawWorld('back', vcam, planeBackBeyond, 0);
  } else {
    drawWorld('back', camera, planeBackBeyond, 0);
    setPortalMatrix(mPT, BOFF, ZERO, 0); setVirtualCamera(mPT);
    drawWorld('shed', vcam, planeShedFront, 0);
  }
}
function nearDoorPlane() {
  const bo = world === 'back';
  const dx = camPos.x - (bo ? BOFF.x : 0), dz = camPos.z - (bo ? BOFF.z : 0) - SHED.z2;
  return dx > DB.x1 + 0.1 && dx < DB.x2 - 0.1 && Math.abs(dz) < 0.08 && camPos.y < DB.h;
}
function dpVisible(off) {
  tmpBox.min.set(DB.x1 - 0.1 + off.x, -0.1, SHED.z2 - 0.1 + off.z);
  tmpBox.max.set(DB.x2 + 0.1 + off.x, DB.h + 0.1, SHED.z2 + 0.1 + off.z);
  return frustum.intersectsBox(tmpBox);
}

// =====================================================================
//  Rendu d'une image
// =====================================================================
function renderScene() {
  player.updateMatrixWorld(true);
  camera.getWorldPosition(camPos);
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreen);

  renderer.clippingPlanes = [];
  renderer.setClearColor(world === 'shed' ? SHED_CLEAR : (world === 'back' ? BK_FOG : (world === 'room' ? FOG_COLOR : ROOM_CLEAR)), 1);
  renderer.clear(true, true, true);

  // --- Backrooms
  if (world === 'back') {
    if (nearDoorPlane()) { renderDoorTunnel(); return; }
    drawWorld('back', camera, null, 0);
    if (camPos.z > 0 && dpVisible(BOFF)) drawShedFromBack();
    return;
  }

  // --- Dans la cabane / le puits
  if (world === 'shed') {
    const inMouth = Math.hypot(camPos.x - HOLE_S.x, camPos.z - HOLE_S.z) < HR * 1.3;
    if (inMouth && Math.abs(camPos.y - HOLE_S.y) < 0.12) { renderHoleTunnel(link.O); return; }
    if (nearDoorPlane()) { renderDoorTunnel(); return; }
    drawWorld('shed', camera, null, 0);
    if (camPos.y < HOLE_S.y && holeVisible(HOLE_S)) drawHoleFromShed(link.O);
    if (camPos.z < SHED.z2 && dpVisible(ZERO)) drawBackFromShed();
    return;
  }

  sky.position.copy(camPos);
  updateTiles(camPos);

  // --- Tête à hauteur de l'ouverture du tonneau
  if (tube && world === bp.world && Math.abs(camPos.y - link.O.y) < 0.12) {
    renderHoleTunnel(link.O);
    renderDoors();
    return;
  }

  // --- Salle ou extérieur (+ portail de la porte)
  const dzc = camPos.z - WALL_Z;
  const inTunnel = camPos.x > OPEN_X1 + 0.1 && camPos.x < OPEN_X2 - 0.1 &&
                   Math.abs(dzc) < TUNNEL_HALF && camPos.y < OPEN_H;
  const useTunnel = inTunnel && !(world === 'out' && dzc > 0);

  if (useTunnel) {
    renderTunnel();
    if (world === 'out') drawOutPortals(true);
  } else if (world === 'room') {
    roomRoot.position.set(0, 0, 0);
    setStencil(roomMats, 0);
    renderer.render(roomScene, camera);
    if (camPos.z > WALL_Z && portalVisible(0, 0)) drawPortal(1, 0, 0, 'out');
  } else {
    setStencil(outMats, 0);
    renderer.render(outScene, camera);
    drawOutPortals(false);
  }

  // --- Portail du tonneau (couvercle retiré, dans le monde où l'on se trouve)
  if (!useTunnel && bp.state === 'placed' && !lidOn() && bp.world === world) {
    const O = holeCenter(camPos);
    if (camPos.y > O.y && holeVisible(O)) drawHoleFromOrigin(O);
  }
  renderDoors();
}

function drawHeld() {               // le tonneau porté : dessiné par-dessus, sans jamais traverser les murs
  const out = world === 'out';
  holdLight.color.set(out ? 0xdfeeff : 0xffffff);
  holdLight.groundColor.set(out ? 0x4a6a35 : 0x666a74);
  holdLight.intensity = out ? 1.1 : 1.0;
  renderer.clearDepth();
  renderer.clippingPlanes = [];
  renderer.render(holdScene, camera);
}

// =====================================================================
//  Porte : charnière physique
