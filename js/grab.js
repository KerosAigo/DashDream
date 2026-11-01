// =====================================================================
//  Grab (clic gauche) : les tiroirs des commodes
//  1) glissement sur l'axe  2) détachement  3) tenu en main  4) lancer
// =====================================================================
const GRAB_REACH = 2.3, GRAB_SENS = 0.004, GRAB_LEAVE = 3.6;

const DRAWER_DETACH = DRAWER_MAX * 0.72;   // le tiroir se détache plus tôt (≈ 0,50 m)
const HELD_SENS     = 0.005;               // m par pixel de souris une fois détaché
const HELD_FOLLOW   = 28;                  // raideur du suivi (plus haut = plus réactif)
const HELD_RADIUS   = 2.4;                 // distance max entre le joueur et le tiroir tenu
const THROW_WINDOW  = 100;                 // ms de mouvement de souris pris en compte
const THROW_GAIN    = 1.0;                 // multiplicateur de force du lancer
const THROW_MAX     = 12;                  // vitesse max (m/s)
const HELD_TILT     = -0.10;               // léger nez vers le bas quand il est tenu

const grab = { active: false, group: null, held: null, samples: [] };
const grabRay = new THREE.Raycaster();
grabRay.far = GRAB_REACH;
const _c0 = new THREE.Vector2(0, 0);
const _gR = new THREE.Vector3(), _gU = new THREE.Vector3(), _gB = new THREE.Vector3();

function pickDrawer() {
  if (world !== 'back') return null;
  camera.updateWorldMatrix(true, false);
  grabRay.setFromCamera(_c0, camera);
  const hit = grabRay.intersectObjects(backScene.children, true)[0];
  const g = hit && hit.object.parent;
  return g && g.userData.drawer && !g.userData.drawer.fallen ? g : null;
}

// Vitesse de la souris (en m/s monde) sur les dernières THROW_WINDOW ms
function mouseThrowVelocity(out) {
  const now = performance.now();
  let sx = 0, sy = 0, sz = 0;
  for (const s of grab.samples) {
    if (now - s.t > THROW_WINDOW) continue;
    sx += s.x; sy += s.y; sz += s.z;
  }
  const k = THROW_GAIN / (THROW_WINDOW / 1000);
  out.set(sx * k, sy * k, sz * k);
  if (out.length() > THROW_MAX) out.setLength(THROW_MAX);
  return out;
}

const _tv = new THREE.Vector3();
function throwDrawer(st) {
  mouseThrowVelocity(_tv);
  st.held = false;
  st.vx = _tv.x; st.vy = _tv.y; st.vz = _tv.z;
  st.w = -1.5;                       // la gravité et le basculement existants prennent le relais
  st.landed = false; st.rest = false;
}

function releaseGrab() {
  if (grab.held) throwDrawer(grab.held);     // relâchement : impulsion basée sur la souris
  grab.active = false; grab.group = null; grab.held = null;
  grab.samples.length = 0;
  crosshair.style.filter = '';
}

const locked = () => document.pointerLockElement === renderer.domElement;

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !locked()) return;
  const g = pickDrawer();
  if (!g) return;
  grab.active = true; grab.group = g; grab.held = null; grab.samples.length = 0;
  crosshair.style.filter = 'brightness(2.5) drop-shadow(0 0 4px #fff)';
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) releaseGrab(); });
document.addEventListener('pointerlockchange', () => { if (!locked()) releaseGrab(); });
window.addEventListener('blur', releaseGrab);

document.addEventListener('mousemove', (e) => {
  if (!grab.active) return;
  camera.matrixWorld.extractBasis(_gR, _gU, _gB);

  // ---------- Phase 3 : tiroir détaché, tenu en main, il suit le curseur ----------
  const st = grab.held;
  if (st) {
    const mx = e.movementX * HELD_SENS, my = -e.movementY * HELD_SENS;
    const dx = mx * _gR.x + my * _gU.x;
    const dy = mx * _gR.y + my * _gU.y;
    const dz = mx * _gR.z + my * _gU.z;
    st.tx += dx; st.ty += dy; st.tz += dz;

    // Garde le tiroir à portée et au-dessus du sol
    const p = player.position;
    const rx = st.tx - p.x, rz = st.tz - p.z, r = Math.hypot(rx, rz);
    if (r > HELD_RADIUS) { st.tx = p.x + rx / r * HELD_RADIUS; st.tz = p.z + rz / r * HELD_RADIUS; }
    st.ty = clamp(st.ty, DR_HY, p.y + 0.6);

    // Mémorise le mouvement pour calculer le lancer
    grab.samples.push({ t: e.timeStamp, x: dx, y: dy, z: dz });
    while (grab.samples.length && e.timeStamp - grab.samples[0].t > THROW_WINDOW * 1.5) grab.samples.shift();
    return;
  }

  // ---------- Phase 1 : le tiroir coulisse sur son axe ----------
  const d = grab.group.userData.drawer;
  const ar = d.fx * _gR.x + d.fz * _gR.z;     // axe du tiroir vers la droite de l'écran
  const au = d.fx * _gU.x + d.fz * _gU.z;     // ... vers le haut
  const ab = d.fx * _gB.x + d.fz * _gB.z;     // ... vers le joueur
  const delta = (e.movementX * ar - e.movementY * au + e.movementY * ab) * GRAB_SENS;
  const nv = clamp(d.amount + delta, 0, DRAWER_DETACH);
  setDrawer(grab.group, nv);

  // ---------- Phase 2 : détachement, sans changer de position ni lâcher le clic ----------
  if (nv >= DRAWER_DETACH - 1e-4) {
    const st2 = dropDrawer(grab.group, true);
    grab.held = st2;
    grab.samples.length = 0;
  }
});

let grabHoverT = 0;
function updateGrab(dt) {
  updateFallenDrawers(dt);

  if (grab.active) {
    const d = grab.group.userData.drawer;
    const st = grab.held;
    const far = st
      ? Math.hypot(player.position.x - st.x, player.position.z - st.z) > GRAB_LEAVE
      : Math.hypot(player.position.x - d.cx, player.position.z - d.cz) > GRAB_LEAVE;
    if (world !== 'back' || far) releaseGrab();
    return;
  }
  grabHoverT -= dt;
  if (grabHoverT > 0) return;
  grabHoverT = 0.1;                            // survol : 10 tests par seconde suffisent
  crosshair.style.filter = pickDrawer() ? 'brightness(2) drop-shadow(0 0 3px #fff)' : '';
}

// held = true : le tiroir devient un objet libre mais reste tenu (pas d'élan, pas de saut)
function dropDrawer(grp, held = false) {
  const d = grp.userData.drawer;
  d.fallen = true;
  const o = drawerOpen.get(d.i + ',' + d.j);
  if (o) o[d.k] = 0;                                   // la collision de la commode se raccourcit

  const x = d.mx + d.fx * d.amount, z = d.mz + d.fz * d.amount;
  const outer = new THREE.Group();                     // pivot au centre du tiroir
  outer.position.set(x, d.my, z);
  grp.position.set(-d.mx, -d.my, -d.mz);               // la géométrie est en coordonnées monde
  outer.add(grp);                                      // (la retire du chunk, donc plus de dispose avec lui)
  backScene.add(outer);

  const st = {
    obj: outer, x, y: d.my, z, fx: d.fx, fz: d.fz,
    vx: held ? 0 : d.fx * 1.8, vy: 0, vz: held ? 0 : d.fz * 1.8,
    th: 0, w: held ? 0 : -2.2, axis: new THREE.Vector3(-d.fz, 0, d.fx),
    landed: false, rest: false,
    held, tx: x, ty: d.my, tz: z,                      // cible suivie pendant le grab
  };
  drawerFallen.set(d.i + ',' + d.j + ',' + d.k, st);
  return st;
}

function updateFallenDrawers(dt) {
  for (const st of drawerFallen.values()) {
    if (st.rest) continue;

    if (st.held) {
      // Suit la cible de façon lissée (indépendant du framerate), sans physique
      const k = 1 - Math.exp(-HELD_FOLLOW * dt);
      st.x += (st.tx - st.x) * k;
      st.y += (st.ty - st.y) * k;
      st.z += (st.tz - st.z) * k;
      st.th += (HELD_TILT - st.th) * k;                 // inclinaison progressive, sans à-coup
      st.obj.position.set(st.x, st.y, st.z);
      st.obj.quaternion.setFromAxisAngle(st.axis, st.th);
      continue;
    }

    st.vy -= GRAVITY * dt;
    st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
    st.th = Math.max(st.th + st.w * dt, -0.7);          // nez vers le bas

    const low = DR_HY * Math.cos(st.th) + DR_HL * Math.abs(Math.sin(st.th));
    if (st.y <= low) {
      st.y = low;
      const impact = -st.vy;
      st.vy = impact > 1.2 ? impact * 0.3 : 0;          // petit rebond
      st.landed = true; st.w = 0;
      st.th += (0 - st.th) * Math.min(1, dt * 10);      // se remet à plat
      const f = Math.exp(-5 * dt);
      st.vx *= f; st.vz *= f;                           // frottement au sol
      if (impact <= 1.2 && Math.hypot(st.vx, st.vz) < 0.1 && Math.abs(st.th) < 0.02) {
        st.th = 0; st.y = DR_HY; st.vx = st.vz = st.vy = 0; st.rest = true;
      }
    }
    st.obj.position.set(st.x, st.y, st.z);
    st.obj.quaternion.setFromAxisAngle(st.axis, st.th);
  }
}