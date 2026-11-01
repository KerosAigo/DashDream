// =====================================================================
//  État et objets du joueur
// =====================================================================
let yaw = Math.PI, pitch = 0;      // yaw = π : on regarde vers +z, donc vers la porte
let vy = 0, grounded = true;
let velX = 0, velZ = 0;
let jumpQueued = false;
const GRAVITY = 18, JUMP_V = 6.2;

const EYE_HEIGHT = 1.7;
const PLAYER_MASS = 70;
const PLAYER_RADIUS = 0.3;
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.02, 500);
const player = new THREE.Object3D();
player.position.set(SPAWN.x, EYE_HEIGHT, SPAWN.z);
player.rotation.y = yaw;
player.add(camera);

const WALK_SPEED = 4, RUN_SPEED = 7;

// =====================================================================
//  Collisions statiques
// =====================================================================
const COLLIDERS_OUT = [   // chambranles de la porte, côté prairie
  { minX: OPEN_X1 - CASING_W, maxX: OPEN_X1, minZ: WALL_Z - WALL_T / 2 - CASING_T, maxZ: WALL_Z + WALL_T / 2 + CASING_T },
  { minX: OPEN_X2, maxX: OPEN_X2 + CASING_W, minZ: WALL_Z - WALL_T / 2 - CASING_T, maxZ: WALL_Z + WALL_T / 2 + CASING_T },
];

function pushOutOfBox(pos, b, r) {
  const cx = Math.max(b.minX, Math.min(b.maxX, pos.x));
  const cz = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
  const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x += dx / d * (r - d); pos.z += dz / d * (r - d); }
  else {
    const l = pos.x - b.minX, rt = b.maxX - pos.x, u = pos.z - b.minZ, dn = b.maxZ - pos.z;
    const m = Math.min(l, rt, u, dn);
    if (m === l) pos.x = b.minX - r; else if (m === rt) pos.x = b.maxX + r;
    else if (m === u) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
  }
}
function resolveStatic() {
  if (world === 'back') {
    const n = collectBack(player.position.x, player.position.z);   // -> backrooms.js
    for (let k = 0; k < n; k++) pushOutOfBox(player.position, _bb[k], PLAYER_RADIUS);
    return;
  }
  for (const b of COLLIDERS_OUT) pushOutOfBox(player.position, b, PLAYER_RADIUS);
}

// =====================================================================
//  Sol et gravité
// =====================================================================
function updateVertical(dt) {
  const p = player.position;
  let feet = p.y - EYE_HEIGHT;
  const gh = world === 'out' ? hWorld(p.x, p.z) : 0;
  if (grounded) {
    if (feet - gh > 0.3) grounded = false;
    else { feet += (gh - feet) * Math.min(1, dt * 14); vy = 0; }
  }
  if (!grounded) {
    vy -= GRAVITY * dt;
    feet += vy * dt;
    if (feet <= gh && vy <= 0) { feet = gh; vy = 0; grounded = true; }
  }
  p.y = feet + EYE_HEIGHT;
}

// =====================================================================
//  Contrôles (souris / clavier)
// =====================================================================
const overlay = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');
const SENSITIVITY = 0.0022;

overlay.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  overlay.style.display = locked ? 'none' : 'flex';
  crosshair.style.display = locked ? 'block' : 'none';
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (grab.active) return;                     // <- nouveau
  yaw   -= e.movementX * SENSITIVITY;
  pitch -= e.movementY * SENSITIVITY;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  player.rotation.y = yaw;
});

const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat || document.pointerLockElement !== renderer.domElement) return;
  if (e.code === 'Space') jumpQueued = true;
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// =====================================================================
//  Mise à jour par frame (appelée par animate)
// =====================================================================
function updatePlayerHorizontal(dt, locked) {
  if (jumpQueued) {
    jumpQueued = false;
    if (grounded) { vy = JUMP_V; grounded = false; }
  }
  let ix = 0, iz = 0;
  if (locked) {
    ix = ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0) - ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0);
    iz = ((keys['KeyS'] || keys['ArrowDown'])  ? 1 : 0) - ((keys['KeyW'] || keys['ArrowUp'])   ? 1 : 0);
  }
  const len = Math.hypot(ix, iz);
  const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? RUN_SPEED : WALK_SPEED;
  let tx = 0, tz = 0;
  if (len > 0) {
    const dxl = ix / len, dzl = iz / len, sin = Math.sin(yaw), cos = Math.cos(yaw);
    tx = (dxl * cos + dzl * sin) * speed;
    tz = (-dxl * sin + dzl * cos) * speed;
  }
  const kk = Math.min(1, dt * (grounded ? 10 : 6));
  velX += (tx - velX) * kk;
  velZ += (tz - velZ) * kk;
  player.position.x += velX * dt;
  player.position.z += velZ * dt;
  resolveStatic();
}

function updatePlayerVertical(dt) {
  updateVertical(dt);
}

// ---------- Mouvements de tête ----------
const HEAD = {
  stepFreq: 1.6, bobVertical: 0.035, bobSide: 0.025, bobRoll: 0.006,
  breathPeriod: 4.5, breathVertical: 0.012, breathPitch: 0.004,
};
let stepPhase = 0, breathTime = 0, lastStepIndex = 0;

function updateHeadMotion(dt) {
  const moveSpeed = grounded ? Math.hypot(velX, velZ) : 0;
  const moveFactor = Math.min(moveSpeed / WALK_SPEED, 1.6);
  const idleFactor = 1 - Math.min(moveFactor, 1);

  stepPhase += moveSpeed * HEAD.stepFreq * dt; 
  const stepIndex = Math.floor(stepPhase / Math.PI);       // un pas tous les π de phase
  if (stepIndex !== lastStepIndex) {
    lastStepIndex = stepIndex;
    if (moveSpeed > 0.5) playStep(moveSpeed / WALK_SPEED);  // audio.js
  }
  const bobY    = Math.sin(stepPhase * 2) * HEAD.bobVertical * moveFactor;
  const bobX    = Math.sin(stepPhase)     * HEAD.bobSide     * moveFactor;
  const bobRoll = Math.sin(stepPhase)     * HEAD.bobRoll     * moveFactor;

  breathTime += dt;
  const breath = Math.sin(breathTime * Math.PI * 2 / HEAD.breathPeriod);
  const breathStrength = 0.35 + 0.65 * idleFactor;

  camera.position.set(bobX, bobY + breath * HEAD.breathVertical * breathStrength, 0);
  camera.rotation.x = pitch + breath * HEAD.breathPitch * breathStrength;
  camera.rotation.z = bobRoll;
}