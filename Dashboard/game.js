// =====================================================================
const DOOR_INERTIA = DOOR.mass * DOOR.length * DOOR.length / 3;
let doorAngle = 0, doorVel = 0;

function updateDoor(dt, vWx, vWz) {
  const L = DOOR.length, reach = PLAYER_RADIUS + DOOR.thickness / 2;
  function contact() {
    const dx = Math.cos(doorAngle), dz = -Math.sin(doorAngle);
    const px = player.position.x - DOOR.hingeX, pz = player.position.z - DOOR.hingeZ;
    const s = Math.max(0, Math.min(L, px * dx + pz * dz));
    let vx = px - s * dx, vz = pz - s * dz, dist = Math.hypot(vx, vz), nx, nz;
    if (dist < 1e-6) { nx = -dz; nz = dx; dist = 0; } else { nx = vx / dist; nz = vz / dist; }
    return { dx, dz, s, dist, nx, nz };
  }
  let c = contact();
  if (c.dist < reach) {
    const tx = c.s * c.dz, tz = -c.s * c.dx;
    const k = tx * c.nx + tz * c.nz;
    const vrel = (vWx * c.nx + vWz * c.nz) - doorVel * k;
    if (vrel < 0 && Math.abs(k) > 0.05) {
      const invM = 1 / PLAYER_MASS + (k * k) / DOOR_INERTIA;
      const J = -(1 + DOOR.restitution) * vrel / invM;
      doorVel += -J * k / DOOR_INERTIA;
      doorVel = Math.max(-DOOR.maxSpeed, Math.min(DOOR.maxSpeed, doorVel));
    }
  }
  doorVel -= doorAngle * DOOR.selfClose * dt;
  doorVel *= Math.exp(-DOOR.damping * dt);
  const fr = Math.min(Math.abs(doorVel), DOOR.friction * dt);
  doorVel -= Math.sign(doorVel) * fr;
  doorAngle += doorVel * dt;
  if (doorAngle > DOOR.limit)  { doorAngle =  DOOR.limit; if (doorVel > 0) doorVel *= -DOOR.stopBounce; }
  if (doorAngle < -DOOR.limit) { doorAngle = -DOOR.limit; if (doorVel < 0) doorVel *= -DOOR.stopBounce; }
  leafPivot.rotation.y = doorAngle;
  c = contact();
  if (c.dist < reach) { const push = reach - c.dist; player.position.x += c.nx * push; player.position.z += c.nz * push; }
}

// =====================================================================
//  Collisions statiques
// =====================================================================
const OUT = 0.6;
const WALL_BACK = WALL_Z - WALL_T / 2 - OUT;
const COLLIDERS = {
  room: [
    { minX: -ROOM_W / 2 - OUT, maxX: -ROOM_W / 2, minZ: WALL_BACK, maxZ: ROOM_D / 2 + OUT },
    { minX:  ROOM_W / 2, maxX:  ROOM_W / 2 + OUT, minZ: WALL_BACK, maxZ: ROOM_D / 2 + OUT },
    { minX: -ROOM_W / 2 - OUT, maxX: ROOM_W / 2 + OUT, minZ: ROOM_D / 2, maxZ: ROOM_D / 2 + OUT },
    { minX: -ROOM_W / 2 - OUT, maxX: OPEN_X1, minZ: WALL_BACK, maxZ: -ROOM_D / 2 },
    { minX: OPEN_X2, maxX: ROOM_W / 2 + OUT, minZ: WALL_BACK, maxZ: -ROOM_D / 2 },
  ],
  out: [
    { minX: OPEN_X1 - CASING_W, maxX: OPEN_X1, minZ: WALL_Z - WALL_T / 2 - CASING_T, maxZ: WALL_Z + WALL_T / 2 + CASING_T },
    { minX: OPEN_X2, maxX: OPEN_X2 + CASING_W, minZ: WALL_Z - WALL_T / 2 - CASING_T, maxZ: WALL_Z + WALL_T / 2 + CASING_T },
  ],
  shed: [
    { minX: SHED.x1 - OUT, maxX: SHED.x1, minZ: SHED.z1 - OUT, maxZ: SHED.z2 + OUT },
    { minX: SHED.x2, maxX: SHED.x2 + OUT, minZ: SHED.z1 - OUT, maxZ: SHED.z2 + OUT },
    { minX: SHED.x1 - OUT, maxX: SHED.x2 + OUT, minZ: SHED.z1 - OUT, maxZ: SHED.z1 },
    { minX: SHED.x1 - OUT, maxX: DB.x1, minZ: SHED.z2, maxZ: SHED.z2 + OUT },          // mur avant, à gauche de la porte
    { minX: DB.x2, maxX: SHED.x2 + OUT, minZ: SHED.z2, maxZ: SHED.z2 + OUT },          // mur avant, à droite de la porte
    { minX: DB.x1 - 0.03, maxX: DB.x1 + 0.07, minZ: SHED.z2 - 1.14, maxZ: SHED.z2 },   // battant ouvert
  ],
};

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
  if (tube) return;
  if (world === 'back') {
    const n = collectBack(player.position.x, player.position.z);
    for (let k = 0; k < n; k++) pushOutOfBox(player.position, _bb[k], PLAYER_RADIUS);
    return;
  }
  for (const b of COLLIDERS[world]) pushOutOfBox(player.position, b, PLAYER_RADIUS);
}

// =====================================================================
//  Tonneau : position relative, collisions, sol
// =====================================================================
function barrelRel() {              // vecteur joueur -> tonneau (dans le monde courant)
  let dx = bp.x - player.position.x, dz = bp.z - player.position.z;
  if (world === 'out') { dx = wrapP(dx); dz = wrapP(dz); }
  return [dx, dz];
}
function nearBarrel(maxD, facing) {
  if (bp.state !== 'placed' || bp.world !== world) return false;
  const [dx, dz] = barrelRel(), d = Math.hypot(dx, dz);
  if (d > maxD) return false;
  if (!facing || d < 0.6) return true;
  return (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d > 0.5;     // il faut être tourné vers le tonneau
}
const onGround = () => player.position.y - EYE_HEIGHT < bp.y + 0.3;

function barrelCollide() {          // le tonneau est un obstacle tant que les pieds sont sous son bord
  if (bp.state !== 'placed' || bp.world !== world || tube || onLadder || world === 'shed') return;
  if (player.position.y - EYE_HEIGHT >= bp.y + BH - 0.12) return;
  const [rx, rz] = barrelRel();
  const dx = -rx, dz = -rz, d = Math.hypot(dx, dz), R = BR + PLAYER_RADIUS;
  if (d < R) {
    if (d > 1e-6) { player.position.x += dx / d * (R - d); player.position.z += dz / d * (R - d); }
    else player.position.x += R;
  }
}
function groundHeight(feet) {       // hauteur du sol sous le joueur (relief, ou dessus du tonneau)
  const p = player.position;
  let h = world === 'out' ? hWorld(p.x, p.z) : 0;
  if (bp.state === 'placed' && bp.world === world) {
    const [rx, rz] = barrelRel(), r = Math.hypot(rx, rz);
    const top = bp.y + BH + (lidOn() ? LID_T : 0);
    if (r < B_TOP + 0.03 && feet >= top - 0.12 && (lidOn() || r > HR)) h = Math.max(h, top);   // ouvert : plus de sol dans l'ouverture
  }
  return h;
}
function updateVertical(dt) {
  const p = player.position;
  let feet = p.y - EYE_HEIGHT;
  const gh = tube ? -1e9 : groundHeight(feet);
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
//  Porter, poser, retirer et remettre le couvercle
// =====================================================================
function groundUnderBarrel(x, z) {
  let h = hWorld(x, z);
  for (const [a, b] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) h = Math.max(h, hWorld(x + a, z + b));
  return h + 0.005;
}
function toggleCarry() {            // E
  if (world === 'shed' || world === 'back' || tube || onLadder || lid.mode === 'drag') return;
  if (bp.state === 'carried') {
    let x = player.position.x - Math.sin(yaw) * 1.2, z = player.position.z - Math.cos(yaw) * 1.2;
    if (world === 'room') { x = clamp(x, -ROOM_W / 2 + 1.5, ROOM_W / 2 - 1.5); z = clamp(z, -ROOM_D / 2 + 1.5, ROOM_D / 2 - 1.5); }
    bp.state = 'placed'; bp.world = world; bp.x = x; bp.z = z; bp.yaw = yaw;
    bp.y = world === 'out' ? groundUnderBarrel(x, z) : 0;
  } else if (lid.mode === 'on' && nearBarrel(2.2, true) && onGround()) {
    bp.state = 'carried';
  }
}
function startLidDrag() {           // début du clic maintenu
  if (bp.state !== 'placed' || bp.world !== world || world === 'shed' || tube || onLadder || lid.mode !== 'on' || !onGround()) return;
  const [dx, dz] = barrelRel(), d = Math.hypot(dx, dz);
  if (d > 0.55 && d < 2.2 && nearBarrel(2.2, true)) { lid.mode = 'drag'; lid.dx = 0; lid.dz = 0; }
}
function dropLid() {                // le couvercle quitte le tonneau et tombe au sol, dans la direction où on l'a tiré
  const d = Math.hypot(lid.dx, lid.dz) || 1, a = Math.cos(bp.yaw), b = Math.sin(bp.yaw);
  lid.fx = lid.x; lid.fy = lid.y; lid.fz = lid.z;
  lid.tx = lid.dx / d * 0.92; lid.tz = lid.dz / d * 0.92;
  let gy = 0;
  if (bp.world === 'out') gy = hWorld(bp.x + lid.tx * a + lid.tz * b, bp.z - lid.tx * b + lid.tz * a) - bp.y;
  lid.ty = gy + 0.01;
  lid.t = 0; lid.mode = 'fall';
}
function releaseLid() {             // fin du clic
  if (lid.mode !== 'drag') return;
  if (Math.hypot(lid.dx, lid.dz) > 0.45) dropLid();
  else { lid.fx = lid.x; lid.fy = lid.y; lid.fz = lid.z; lid.tx = 0; lid.ty = BH; lid.tz = 0; lid.t = 0; lid.mode = 'back'; }
}
function closeLid() {               // F
  if (world === 'shed' || tube || onLadder || lid.mode !== 'off' || !nearBarrel(3.2, false)) return;
  lid.fx = lid.x; lid.fy = lid.y; lid.fz = lid.z; lid.tx = 0; lid.ty = BH; lid.tz = 0; lid.t = 0; lid.mode = 'back';
}

// =====================================================================
//  Entrer dans le tonneau (sans animation : on tombe dans l'ouverture), sortir
// =====================================================================
const _a = new THREE.Vector3();
function updateBarrelTube() {       // les pieds passent sous le bord, centre dans l'ouverture
  if (tube || onLadder || world === 'shed' || bp.state !== 'placed' || bp.world !== world || lidOn()) return;
  const [rx, rz] = barrelRel();
  const top = bp.y + BH, feet = player.position.y - EYE_HEIGHT;
  if (Math.hypot(rx, rz) < HR * 0.95 && feet <= top + 0.03 && feet > top - 0.4) {
    link.O.copy(holeCenter(player.position));
    tube = true; grounded = false;
  }
}
function clampToMouth() {           // dans le col : le centre du joueur reste dans l'ouverture
  if (!tube || onLadder) return;
  const p = player.position, O = link.O, dx = p.x - O.x, dz = p.z - O.z, d = Math.hypot(dx, dz), m = HR * 0.85;
  if (d > m) { p.x = O.x + dx / d * m; p.z = O.z + dz / d * m; }
}
function crossToShed() {            // la caméra passe sous le plan de l'ouverture : on change de monde
  _a.copy(player.position).sub(link.O).applyAxisAngle(Y_AXIS, -bp.yaw).add(HOLE_S);
  player.position.copy(_a);
  const c = Math.cos(-bp.yaw), s = Math.sin(-bp.yaw);
  const vx = velX * c + velZ * s, vz = -velX * s + velZ * c; velX = vx; velZ = vz;
  yaw -= bp.yaw; player.rotation.y = yaw;
  world = 'shed'; tube = false;
}
function crossToOrigin() {          // la caméra remonte au-dessus du plan de l'ouverture
  _a.copy(player.position).sub(HOLE_S).applyAxisAngle(Y_AXIS, bp.yaw).add(link.O);
  player.position.copy(_a);
  const c = Math.cos(bp.yaw), s = Math.sin(bp.yaw);
  const vx = velX * c + velZ * s, vz = -velX * s + velZ * c; velX = vx; velZ = vz;
  yaw += bp.yaw; player.rotation.y = yaw;
  world = bp.world; tube = true; grounded = false;
}

// =====================================================================
//  Cabane : puits, plafond, échelle (contact réel, pas de zone d'interaction)
// =====================================================================
function shedLimits() {
  const p = player.position, r = PLAYER_RADIUS;
  if (p.y >= HOLE_S.y) {                                    // l'œil atteint le haut du puits
    if (Math.hypot(p.x - HOLE_S.x, p.z - HOLE_S.z) < HR) crossToOrigin();
    else { p.y = HOLE_S.y - 0.001; if (vy > 0) vy = 0; }
    return;
  }
  if (p.y + 0.12 > SH) {                                    // la tête dépasse le plafond de la cabane
    if (p.x > SHAFT.x1 && p.x < SHAFT.x2 && p.z > SHAFT.z1 && p.z < SHAFT.z2) {
      p.x = clamp(p.x, SHAFT.x1 + r, SHAFT.x2 - r);
      p.z = clamp(p.z, SHAFT.z1 + r, SHAFT.z2 - r);
    } else { p.y = SH - 0.12; if (vy > 0) vy = 0; }
  }
}
function tryGrabLadder() {          // accroche automatique : le corps (cercle de 0,30 m) touche les montants
  if (world !== 'shed' || onLadder || ladderCooldown > 0) return;
  const p = player.position;
  const cx = clamp(p.x, LAD_FACE - 0.025, LAD_FACE + 0.025);
  const cz = clamp(p.z, LAD_Z - 0.225, LAD_Z + 0.225);
  if (Math.hypot(p.x - cx, p.z - cz) <= PLAYER_RADIUS + 0.005) {
    onLadder = true; vy = 0; grounded = false; velX = velZ = 0; ladderLock = 0.4;
  }
}
function releaseLadder() {          // Espace : on lâche l'échelle
  onLadder = false; ladderCooldown = 0.5; grounded = false; vy = 2;
  player.position.x = LAD_X - 0.3;
}
function updateLadder(dt, locked) {
  const fwd = locked ? ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0) : 0;
  const dir = pitch < -0.12 ? -1 : 1;           // regard vers le bas : W descend ; regard droit ou vers le haut : W monte
  const sp = ladderLock > 0 ? 0 : fwd * dir * ((keys.ShiftLeft || keys.ShiftRight) ? 2.4 : 1.5);
  const p = player.position, k = Math.min(1, dt * 14);
  vy = 0; grounded = false;
  p.y += sp * dt;
  climbPhase += Math.abs(sp) * dt;

  if (world === 'shed') {
    p.x += (LAD_X - p.x) * k; p.z += (LAD_Z - p.z) * k;
    if (p.y <= EYE_HEIGHT && sp < 0) {            // en bas : on lâche l'échelle
      p.y = EYE_HEIGHT; onLadder = false; ladderCooldown = 0.4; grounded = true; p.x = LAD_X - 0.4;
    } else if (p.y >= HOLE_S.y && sp > 0) crossToOrigin();   // en haut : la tête sort du tonneau
  } else {                                        // on finit de sortir : l'échelle se prolonge jusqu'au bord du tonneau
    const O = link.O, c = Math.cos(bp.yaw), s = Math.sin(bp.yaw);
    const dx = p.x - O.x, dz = p.z - O.z;
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    lx += (0 - lx) * k;
    lz += ((p.y - O.y > 0.3 ? EDGE : 0) - lz) * k;   // on se décale sur la bordure, hors de l'ouverture
    p.x = O.x + lx * c + lz * s; p.z = O.z - lx * s + lz * c;
    if (p.y - EYE_HEIGHT >= O.y) {                // les pieds atteignent le bord : on est debout dessus
      p.x = O.x + EDGE * s; p.z = O.z + EDGE * c; p.y = O.y + EYE_HEIGHT;
      onLadder = false; tube = false; grounded = true; vy = 0; velX = velZ = 0;
    } else if (p.y < O.y && sp < 0) crossToShed();
  }
}

// =====================================================================
//  Contrôles
// =====================================================================
const overlay = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');
const hintEl = document.getElementById('hint');
const SENSITIVITY = 0.0022;
const LID_SENS = 0.003;

overlay.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  overlay.style.display = locked ? 'none' : 'flex';
  crosshair.style.display = locked ? 'block' : 'none';
  if (!locked) releaseLid();
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === renderer.domElement) startLidDrag();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) releaseLid(); });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (lid.mode === 'drag') {        // la souris déplace le couvercle (et plus la caméra)
    const rx = e.movementX * LID_SENS, fw = -e.movementY * LID_SENS;          // droite / avant, dans le repère du joueur
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const wx = rx * c - fw * s, wz = -rx * s - fw * c;                         // monde : droite = (c,0,-s), avant = (-s,0,-c)
    const a = Math.cos(bp.yaw), b = Math.sin(bp.yaw);
    lid.dx += wx * a - wz * b; lid.dz += wx * b + wz * a;                      // repère du tonneau
    const d = Math.hypot(lid.dx, lid.dz);
    if (d > 1.1) { lid.dx *= 1.1 / d; lid.dz *= 1.1 / d; }
    if (d > 0.85) dropLid();
    return;
  }
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
  else if (e.code === 'KeyE') toggleCarry();
  else if (e.code === 'KeyF') closeLid();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

let lastHint = '';
function updateHint(locked) {
  let txt = '';
  if (locked) {
    if (onLadder) txt = 'W / S : monter ou descendre (regarde vers le bas pour descendre avec W) · Espace : lâcher';
    else if (world === 'shed' || world === 'back' || tube) txt = '';
    else if (bp.state === 'carried') txt = 'E : poser le tonneau';
    else if (lid.mode === 'drag') txt = 'Bouge la souris pour faire glisser le couvercle, puis relâche';
    else if (bp.world !== world) txt = '';
    else if (lid.mode === 'on' && nearBarrel(2.2, true)) txt = 'E : porter le tonneau · Clic maintenu : retirer le couvercle';
    else if (lid.mode === 'off' && nearBarrel(3.2, false)) txt = 'Saute sur le tonneau et avance vers l’ouverture · F : remettre le couvercle';
  }
  if (txt !== lastHint) { lastHint = txt; hintEl.textContent = txt; hintEl.style.display = txt ? 'block' : 'none'; }
}

// ---------- Mouvements de tête ----------
const HEAD = {
  stepFreq: 1.6, bobVertical: 0.035, bobSide: 0.025, bobRoll: 0.006,
  breathPeriod: 4.5, breathVertical: 0.012, breathPitch: 0.004,
};
let stepPhase = 0, breathTime = 0, carryMix = 0;

// =====================================================================
//  Boucle principale
// =====================================================================
const WALK_SPEED = 4, RUN_SPEED = 7;
const clock = new THREE.Clock();
let lastCamZ = 0;
let lastDz = null;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const locked = document.pointerLockElement === renderer.domElement;
  const carrying = bp.state === 'carried';
  ladderCooldown = Math.max(0, ladderCooldown - dt);
  ladderLock = Math.max(0, ladderLock - dt);

  // ----- Saut (ou lâcher l'échelle) -----
  if (jumpQueued) {
    jumpQueued = false;
    if (onLadder) { if (world === 'shed') releaseLadder(); }
    else if (grounded) { vy = JUMP_V * (carrying ? 0.75 : 1); grounded = false; }
  }

  if (onLadder) {
    velX = velZ = 0;
    updateLadder(dt, locked);
  } else {
    // ----- Déplacement horizontal (moins de contrôle en l'air, ralenti quand on porte le tonneau) -----
    let ix = 0, iz = 0;
    if (locked) {
      ix = ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0) - ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0);
      iz = ((keys['KeyS'] || keys['ArrowDown'])  ? 1 : 0) - ((keys['KeyW'] || keys['ArrowUp'])   ? 1 : 0);
    }
    const len = Math.hypot(ix, iz);
    const speed = ((keys['ShiftLeft'] || keys['ShiftRight']) ? RUN_SPEED : WALK_SPEED) * (carrying ? CARRY.slow : 1);
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
    barrelCollide();
    tryGrabLadder();
  }

  if ((world === 'room' || world === 'out') && !tube) { updateDoor(dt, velX, velZ); resolveStatic(); }

  // ----- Vertical : gravité, sol, dessus du tonneau, ouverture, plafond de la cabane -----
  if (!onLadder) {
    updateVertical(dt);
    updateBarrelTube();
    clampToMouth();
    if (tube && player.position.y < link.O.y) crossToShed();
    if (world === 'shed') shedLimits();
  }

  // ----- Espace non euclidien : l'extérieur est un tore, on se « replie » sur la tuile centrale -----
  if (world === 'out' && !tube) {
    const dwx = P * Math.round((player.position.x - DOOR_CX) / P);
    const dwz = P * Math.round((player.position.z - DOOR_CZ) / P);
    if (dwx || dwz) { player.position.x -= dwx; player.position.z -= dwz; lastCamZ -= dwz; }
  }

  updateBarrelVisuals(dt);

  // ----- Lanterne -----
  lanternLight.intensity = 1.1 + Math.sin(clock.elapsedTime * 1.7) * 0.025;

  // ----- Mouvements de tête -----
  const moveSpeed = (grounded && !onLadder) ? Math.hypot(velX, velZ) : 0;
  const moveFactor = Math.min(moveSpeed / WALK_SPEED, 1.6);
  const idleFactor = 1 - Math.min(moveFactor, 1);

  stepPhase += moveSpeed * HEAD.stepFreq * dt;
  const bobY    = Math.sin(stepPhase * 2) * HEAD.bobVertical * moveFactor;
  const bobX    = Math.sin(stepPhase)     * HEAD.bobSide     * moveFactor;
  const bobRoll = Math.sin(stepPhase)     * HEAD.bobRoll     * moveFactor;
  const ladderBob = (onLadder && world === 'shed') ? Math.sin(climbPhase * 20) * 0.012 : 0;

  breathTime += dt;
  const breath = Math.sin(breathTime * Math.PI * 2 / HEAD.breathPeriod);
  const breathStrength = 0.35 + 0.65 * idleFactor;

  // Tonneau porté : la tête se penche sur le côté pour voir devant (décalage latéral + roulis)
  carryMix += ((carrying ? 1 : 0) - carryMix) * Math.min(1, dt * 6);
  camera.position.set(bobX + CARRY.lean * carryMix, bobY + ladderBob + breath * HEAD.breathVertical * breathStrength - 0.04 * carryMix, 0);
  camera.rotation.x = pitch + breath * HEAD.breathPitch * breathStrength;
  camera.rotation.z = bobRoll - CARRY.roll * carryMix;

  holder.position.set(player.position.x, player.position.y + bobY * 0.5, player.position.z);   // le tonneau suit le regard, sans roulis
  holder.rotation.set(pitch, yaw, 0);

  // ----- Passage de la porte : décidé d'après la position de la CAMÉRA -----
  player.updateMatrixWorld(true);
  camera.getWorldPosition(camPos);
  if ((world === 'room' || world === 'out') && !tube && camPos.x > OPEN_X1 && camPos.x < OPEN_X2) {
    if (world === 'room' && lastCamZ >= WALL_Z && camPos.z < WALL_Z) world = 'out';
    else if (world === 'out' && lastCamZ <= WALL_Z && camPos.z > WALL_Z) world = 'room';
  }
  lastCamZ = camPos.z;

  // ----- Porte de la cabane : passage cabane <-> backrooms, décidé d'après la CAMÉRA -----
  if ((world === 'shed' || world === 'back') && !tube) {
    const bo = world === 'back';
    const dz = camPos.z - (bo ? BOFF.z : 0) - SHED.z2;
    const dx = camPos.x - (bo ? BOFF.x : 0);
    if (lastDz !== null && dx > DB.x1 && dx < DB.x2) {
      if (!bo && lastDz < 0 && dz >= 0) { world = 'back'; player.position.add(BOFF); }
      else if (bo && lastDz >= 0 && dz < 0) { world = 'shed'; player.position.sub(BOFF); }
    }
    lastDz = dz;                       // la valeur est la même des deux côtés : le passage est continu
  } else lastDz = null;

  // ----- Chargement des backrooms autour du joueur (ou autour de la porte, vue depuis la cabane) -----
  if (world === 'back') ensureBack(player.position.x, player.position.z, BK.R, 2);
  else if (world === 'shed') ensureBack(BK_ENTRY.x, BK_ENTRY.z, 2, 1);

  doorLookMix += ((world === 'out' ? 1 : 0) - doorLookMix) * Math.min(1, dt * 4);
  applyDoorLook();

  updateHint(locked);
  renderFrame();
}

// =====================================================================
//  Post-process rétro
//  Scène -> cible (avec stencil, pour les portails) -> passe plein écran :
//  courbure CRT, pixelisation, flou, aberration chromatique, contraste,
//  dithering de Bayer, palette de 16 couleurs, vignette.
// =====================================================================
const RETRO = {
  height: 1440,      // résolution interne (nombre de lignes) ; appeler resizePost() après modification
  block: 2,          // taille d'un « gros pixel » en pixels internes
  blur: 0.6,
  chroma: 0.005,
  distort: 0.05,
  contrast: 1.35,
  saturation: 1.15,
  dither: 0.05,
  palette: 0.5,      // 0 = couleurs d'origine, 1 = palette limitée
  vignette: 0.20,
};

const RETRO_PALETTE = [
  0x0b0a10, 0x2a2233, 0x4b3a3a, 0x7a5230,
  0xb07a3e, 0xd9b46a, 0xf2e6c0, 0xfff6e0,
  0x1f3a2a, 0x3f7a3a, 0x8cc152, 0x2e3f6b,
  0x4f86c6, 0xa9d4f0, 0x6b7078, 0xb8bcc4,
];

const postRT = new THREE.WebGLRenderTarget(8, 8, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true,   // le stencil est indispensable aux portails
});
postRT.texture.generateMipmaps = false;

const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: postRT.texture },
    uRes: { value: new THREE.Vector2(8, 8) },
    uBlock: { value: 2 }, uBlur: { value: 0 }, uChroma: { value: 0 }, uDistort: { value: 0 },
    uContrast: { value: 1 }, uSaturation: { value: 1 },
    uDither: { value: 0 }, uPalette: { value: 1 }, uVignette: { value: 0 },
    uPal: { value: RETRO_PALETTE.map(h => new THREE.Vector3((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255)) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tScene;
    uniform vec2 uRes;
    uniform float uBlock, uBlur, uChroma, uDistort;
    uniform float uContrast, uSaturation, uDither, uPalette, uVignette;
    uniform vec3 uPal[16];
    varying vec2 vUv;

    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

    vec3 tap(vec2 uv) { return texture2D(tScene, uv).rgb; }
    vec3 blurTap(vec2 uv, vec2 px) {
      vec3 c0 = tap(uv);
      vec3 bl = c0 * 0.4 + (tap(uv + vec2(px.x, 0.0)) + tap(uv - vec2(px.x, 0.0))
                          + tap(uv + vec2(0.0, px.y)) + tap(uv - vec2(0.0, px.y))) * 0.15;
      return mix(c0, bl, uBlur);
    }

    void main() {
      // Courbure d'écran CRT
      vec2 c = (vUv - 0.5) * (1.0 + uDistort * dot(vUv - 0.5, vUv - 0.5)) / (1.0 + uDistort * 0.25);
      vec2 suv = c + 0.5;
      float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);

      // Pixelation
      vec2 grid = uRes / uBlock;
      suv = (floor(suv * grid) * uBlock + 0.5) / uRes;
      vec2 cell = floor(suv * grid);

      // Flou + aberration chromatique
      vec2 px = vec2(uBlock) / uRes;
      vec2 co = (suv - 0.5) * uChroma + vec2(uChroma * 0.15, 0.0);
      vec3 col;
      col.r = blurTap(suv + co, px).r;
      col.g = blurTap(suv, px).g;
      col.b = blurTap(suv - co, px).b;

      // Saturation + contrastes marqués
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, uSaturation);
      col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.5);

      // Dithering de Bayer + palette limitée
      float d = bayer8(cell) - 0.5;
      vec3 dc = col + d * uDither;
      vec3 best = uPal[0];
      float bd = 1.0e9;
      for (int i = 0; i < 16; i++) {
        vec3 df = dc - uPal[i];
        float dd = dot(df * df, vec3(0.45, 0.9, 0.35));
        if (dd < bd) { bd = dd; best = uPal[i]; }
      }
      col = mix(col, best, uPalette);

      // Vignette
      col *= 1.0 - uVignette * smoothstep(0.3, 0.75, length(vUv - 0.5));

      gl_FragColor = vec4(col * inside, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});

const postScene = new THREE.Scene();
const postCam = new THREE.Camera();
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
postQuad.frustumCulled = false;
postScene.add(postQuad);

function resizePost() {
  const h = Math.max(48, Math.round(RETRO.height));
  const w = Math.max(48, Math.round(h * window.innerWidth / window.innerHeight));
  postRT.setSize(w, h);
  postMat.uniforms.uRes.value.set(w, h);
}
resizePost();

function renderFrame() {
  const u = postMat.uniforms;
  u.uBlock.value = Math.max(1, Math.round(RETRO.block));
  u.uBlur.value = RETRO.blur;           u.uChroma.value = RETRO.chroma;
  u.uDistort.value = RETRO.distort;     u.uContrast.value = RETRO.contrast;
  u.uSaturation.value = RETRO.saturation; u.uDither.value = RETRO.dither;
  u.uPalette.value = RETRO.palette;     u.uVignette.value = RETRO.vignette;

  renderer.setRenderTarget(postRT);
  renderScene();
  if (bp.state === 'carried') drawHeld();
  renderer.clippingPlanes = [];
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizePost();
});

animate();
