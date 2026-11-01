// =====================================================================
//  Monde 4 : les backrooms — géométrie, chunks, collisions
//  Dépend de backrooms_gen.js (à charger avant)
// =====================================================================

// --- Construction de la géométrie
const NX = [-1, 0, 0], PX = [1, 0, 0], NY = [0, -1, 0], PY = [0, 1, 0], NZ = [0, 0, -1], PZ = [0, 0, 1];
function addFace(b, c, n) {
  const ux = c[1][0] - c[0][0], uy = c[1][1] - c[0][1], uz = c[1][2] - c[0][2];
  const vx = c[2][0] - c[0][0], vy = c[2][1] - c[0][1], vz = c[2][2] - c[0][2];
  const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  const order = d >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  const ax = Math.abs(n[0]) > 0.5, ay = Math.abs(n[1]) > 0.5;
  for (const k of order) {
    const p = c[k];
    b.pos.push(p[0], p[1], p[2]);
    b.uv.push(ax ? p[2] : p[0], ax ? p[1] : (ay ? p[2] : p[1]));
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

// Boîte exprimée dans le repère de la commode : a = le long du mur, d = vers l'avant
function cBox(b, c, a0, a1, d0, d1, y0, y1) {
  const ax = -c.fz, az = c.fx;
  const xa = c.x + a0 * ax + d0 * c.fx, za = c.z + a0 * az + d0 * c.fz;
  const xb = c.x + a1 * ax + d1 * c.fx, zb = c.z + a1 * az + d1 * c.fz;
  bkBox(b, Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb));
}
function buildCommode(B, c) {
  const w = CM.W / 2, d = CM.D / 2;
  cBox(B.wood, c, -w, w, -d, d, 0, 1.60);                                  // caisson
  cBox(B.wood, c, -w - 0.06, w + 0.06, -d - 0.04, d + 0.06, 1.60, 1.68);   // plateau
}

// ---------- Tiroirs (objets séparés, donc déplaçables) ----------
const DRAWER_MAX = 0.7;
const drawerFallen = new Map();
const drawerOpen = new Map();   // "i,j" -> [k0, k1, k2] : ouverture de chaque tiroir (survit au déchargement du chunk)
const DR_HY = 0.21;
const DR_HL = (CM.D - 0.1) / 2 + 0.04;   // demi-longueur : caisse + poignée (≈ 0,37)
const DR_HW = CM.W / 2 - 0.08;           // demi-largeur de la façade (≈ 0,745)

function drawerGeo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.computeBoundingSphere();
  return g;
}

function buildDrawer(c, i, j, k) {
  const w = CM.W / 2, d = CM.D / 2;
  const n = 3, gap = 0.04, h = (1.36 - (n - 1) * gap) / n;
  const y0 = 0.16 + k * (h + gap), y1 = y0 + h, ym = (y0 + y1) / 2;
  const F = { pos: [], uv: [], col: [] }, K = { pos: [], uv: [], col: [] };

  cBox(F, c, -w + 0.08, w - 0.08, d, d + 0.024, y0, y1);                   // façade
  // caisse du tiroir (cachée dans le caisson tant qu'il est fermé)
  const bw = w - 0.12, bl = CM.D - 0.1, wt = 0.02, yt = y1 - 0.04;
  cBox(F, c, -bw, bw, d - bl, d, y0 + 0.02, y0 + 0.04);                    // fond
  cBox(F, c, -bw, -bw + wt, d - bl, d, y0 + 0.02, yt);                     // côté gauche
  cBox(F, c, bw - wt, bw, d - bl, d, y0 + 0.02, yt);                       // côté droit
  cBox(F, c, -bw, bw, d - bl, d - bl + wt, y0 + 0.02, yt);                 // arrière
  cBox(K, c, -0.10, 0.10, d + 0.024, d + 0.08, ym - 0.04, ym + 0.04);      // poignée

  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(drawerGeo(F), bDrawer), new THREE.Mesh(drawerGeo(K), bKnob));
  grp.userData.drawer = { i, j, k, fx: c.fx, fz: c.fz, cx: c.x, cz: c.z, amount: 0, fallen: false,
    mx: c.x + c.fx * (d - bl / 2), my: (y0 + y1) / 2, mz: c.z + c.fz * (d - bl / 2) };
  const o = drawerOpen.get(i + ',' + j);
  setDrawer(grp, o ? o[k] : 0);
  return grp;
}

function setDrawer(grp, v) {
  const d = grp.userData.drawer;
  d.amount = v;
  grp.position.set(d.fx * v, 0, d.fz * v);
  const key = d.i + ',' + d.j;
  let o = drawerOpen.get(key);
  if (!o) { o = [0, 0, 0]; drawerOpen.set(key, o); }
  o[d.k] = v;
}

// Hauteur du poteau au nœud (i,j) : selon les arêtes qui y arrivent (0 = aucun)
function nodeHeight(i, j) {
  let h = 0;
  for (const [d, a, b] of [[0, i, j], [0, i - 1, j], [1, i, j], [1, i, j - 1]]) {
    const t = edgeType(d, a, b);
    if (t === 4) h = Math.max(h, 1.1);     // muret
    else if (t) h = BK.H;                  // mur, porte, ouverture
  }
  return h;
}

function buildChunk(cx, cz) {
  const { S, H, CH } = BK;
  const nb = (col) => ({ pos: [], uv: [], col: col ? [] : null });
  const B = { wall: nb(true), trim: nb(true), floor: nb(true), ceil: nb(true), light: nb(false),
              wood: nb(true), drawer: nb(true), knob: nb(true) };
  const drawers = [];
  const i0 = cx * CH, j0 = cz * CH;
  for (let j = j0; j < j0 + CH; j++) for (let i = i0; i < i0 + CH; i++) {
    const x0 = i * S, z0 = j * S, N = 2, d = S / N;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const xa = x0 + a * d, xb = xa + d, za = z0 + b * d, zb = za + d;
      addFace(B.floor, [[xa, 0, za], [xb, 0, za], [xb, 0, zb], [xa, 0, zb]], PY);
      addFace(B.ceil,  [[xa, H, za], [xb, H, za], [xb, H, zb], [xa, H, zb]], NY);
    }
    if (lightOn(i, j)) {
      const h = 0.72;   // demi-côté : néon = 1 carreau de plafond (1,5 m)
      const lx = x0 + S / 2, lz = z0 + S / 2;
      bkBox(B.light, lx - h, H - 0.03, lz - h, lx + h, H, lz + h);
    }
    for (let dir = 0; dir < 2; dir++) {
      const t = edgeType(dir, i, j);
      if (!t) continue;
      for (const p of PARTS[t]) {
        if (p[4] === 2) continue;                       // collision seulement
        const hw = p[5] / 2, tg = p[4] ? B.trim : B.wall;
        let a = p[0], b = p[1];
        if (a < 0) a += BK.T;                           // le mur démarre après le poteau
        if (b > S) b -= BK.T;                           // et s'arrête avant le suivant
        if (dir === 0) bkBox(tg, x0 + a, p[2], z0 - hw, x0 + b, p[3], z0 + hw);
        else           bkBox(tg, x0 - hw, p[2], z0 + a, x0 + hw, p[3], z0 + b);
      }
    }
    const nh = nodeHeight(i, j);
    if (nh) { const h = BK.T / 2; bkBox(B.wall, x0 - h, 0, z0 - h, x0 + h, nh, z0 + h); }
    if (hasPillar(i, j)) { const h = BK.PW / 2; bkBox(B.wall, x0 - h, 0, z0 - h, x0 + h, BK.H, z0 + h); }

    const cm = commodeAt(i, j);
    if (cm) {
      buildCommode(B, cm);
      for (let k = 0; k < 3; k++) if (!drawerFallen.has(i + ',' + j + ',' + k)) drawers.push(buildDrawer(cm, i, j, k));
    }
  }
  const grp = new THREE.Group();
  const mats = { wall: bWall, trim: bTrim, floor: bFloor, ceil: bCeil, light: bLight,
               wood: bWood, drawer: bDrawer, knob: bKnob };
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
  for (const dr of drawers) grp.add(dr);
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
      c.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      bkChunks.delete(k);
    }
  }
}
ensureBack(BK_ENTRY.x, BK_ENTRY.z, 0, 1);

// --- Appelé à chaque frame (extrait de animate)
function updateBackrooms() {
  if (world === 'back') ensureBack(player.position.x, player.position.z, BK.R, 2);
  else ensureBack(BK_ENTRY.x, BK_ENTRY.z, 2, 1);
}

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
        if (p[2] > 0) continue;
        const hw = p[5] / 2;
        if (dir === 0) pushBox(i * S + p[0], j * S - hw, i * S + p[1], j * S + hw);
        else pushBox(i * S - hw, j * S + p[0], i * S + hw, j * S + p[1]);
      }
    }
    if (hasPillar(i, j)) { const h = BK.PW / 2; pushBox(i * S - h, j * S - h, i * S + h, j * S + h); }
    const cm = commodeAt(i, j);
    if (cm) {
      const o = drawerOpen.get(i + ',' + j);
      const m = o ? Math.max(o[0], o[1], o[2]) : 0, ext = m > 0 ? m + 0.05 : 0;
      let x0 = cm.x - cm.hx, x1 = cm.x + cm.hx, z0 = cm.z - cm.hz, z1 = cm.z + cm.hz;
      if (cm.fx > 0) x1 += ext; else if (cm.fx < 0) x0 -= ext;
      else if (cm.fz > 0) z1 += ext; else z0 -= ext;
      pushBox(x0, z0, x1, z1);
    }
  }
  for (const st of drawerFallen.values()) {
    if (!st.landed) continue;
    if (Math.abs(st.x - px) > 6 || Math.abs(st.z - pz) > 6) continue;
    const hx = st.fx ? DR_HL : DR_HW, hz = st.fx ? DR_HW : DR_HL;
    pushBox(st.x - hx, st.z - hz, st.x + hx, st.z + hz);
  }
  return _bn;
}