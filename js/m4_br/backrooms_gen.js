// =====================================================================
//  Monde 4 : les backrooms — données et génération
//  Constantes, textures, matériaux, règles de génération déterministes,
//  éclairage « cuit ». La construction de la géométrie est dans backrooms.js
// =====================================================================
const BK = { S: CELL, H: 4.0, T: 0.2, CH: 4, R: 3, PW: 0.9 };
const CHS = BK.CH * BK.S;
const ZERO = new THREE.Vector3();
const BK_ENTRY = new THREE.Vector3(BK.S / 2, 0, 0);
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
// Dessine un rectangle en le « bouclant » sur les bords, pour que la texture soit seamless
function wrapRect(g, n, x, y, w, h) {
  for (let ox = -n; ox <= n; ox += n)
    for (let oy = -n; oy <= n; oy += n)
      g.fillRect(x + ox, y + oy, w, h);
}
const bkWallTex = bkTex(bkCanvas(256, (g, r) => {
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#d6c36b' : '#decc77'; g.fillRect(i * 16, 0, 16, 256); }
  g.fillStyle = 'rgba(140,118,48,0.22)';
  for (let i = 0; i < 16; i++) g.fillRect(i * 16, 0, 1, 256);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(110,90,35,${0.03 + r() * 0.05})` : `rgba(255,245,185,${0.03 + r() * 0.05})`;
    wrapRect(g, 256, r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 3);
  }
}), 1.28);

const bkFloorTex = bkTex(bkCanvas(128, (g, r) => {
  g.fillStyle = '#a59f62'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(60,55,25,${0.08 + r() * 0.12})` : `rgba(220,210,140,${0.08 + r() * 0.12})`;
    wrapRect(g, 128, r() * 128, r() * 128, 1 + r() * 1.5, 1 + r() * 1.5);
  }
}), 1.0);
const bkCeilTex = bkTex(bkCanvas(128, (g, r) => {
  g.fillStyle = '#d4ca94'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(90,80,40,${0.08 + r() * 0.15})`; g.fillRect(r() * 128, r() * 128, 1, 1); }
  g.fillStyle = 'rgba(95,85,45,0.6)';
  g.fillRect(0, 0, 128, 2); g.fillRect(0, 126, 128, 2);   // joints haut et bas
  g.fillRect(0, 0, 2, 128); g.fillRect(126, 0, 2, 128);   // joints gauche et droite
}), 1.5);

const bWall  = mk(backMats, { map: bkWallTex,  vertexColors: true }, THREE.MeshBasicMaterial);
const bTrim  = mk(backMats, { color: 0x8a6b38, vertexColors: true }, THREE.MeshBasicMaterial);
const bFloor = mk(backMats, { map: bkFloorTex, vertexColors: true }, THREE.MeshBasicMaterial);
const bCeil  = mk(backMats, { map: bkCeilTex,  vertexColors: true }, THREE.MeshBasicMaterial);
const bLight = mk(backMats, { color: 0xfffbe6 }, THREE.MeshBasicMaterial);
const bWood   = mk(backMats, { color: 0x9a6a3a, vertexColors: true }, THREE.MeshBasicMaterial);
const bDrawer = mk(backMats, { color: 0x7d522b, vertexColors: true }, THREE.MeshBasicMaterial);
const bKnob   = mk(backMats, { color: 0xd8b45a, vertexColors: true }, THREE.MeshBasicMaterial);

// --- Génération déterministe
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lightOn = (i, j) => (i === 0 && j === 0) || hash2(i, j, 5) > 0.60;
const hasPillar = (i, j) => !(j === 0 && (i === 0 || i === 1)) && hash2(i, j, 77) < 0.14;

// Commodes : au plus une par cellule, collée à un mur plein (type 1)
const CM_K = 0.75;                                     // facteur d'échelle global de la commode
const CM = { W: 2.2 * CM_K, D: 1.0 * CM_K, H: 1.7 * CM_K };
function commodeAt(i, j) {
  if (i === 0 && j === 0) return null;                 // pas dans la cellule d'entrée
  if (hash2(i, j, 311) > 0.07) return null;            // ~7 % des cellules (avant : 22 %)
  const { S, T } = BK;
  const s0 = Math.floor(hash2(i, j, 312) * 4);
  for (let k = 0; k < 4; k++) {
    const side = (s0 + k) % 4;                         // 0 nord · 1 sud · 2 ouest · 3 est
    const t = side === 0 ? edgeType(0, i, j)
            : side === 1 ? edgeType(0, i, j + 1)
            : side === 2 ? edgeType(1, i, j)
            :              edgeType(1, i + 1, j);
    if (t !== 1) continue;                             // uniquement contre un mur plein
    // Nœuds aux deux extrémités du mur : on garde plus de marge s'il y a un pilier
    const [n0, n1] = side === 0 ? [[i, j], [i + 1, j]]
                   : side === 1 ? [[i, j + 1], [i + 1, j + 1]]
                   : side === 2 ? [[i, j], [i, j + 1]]
                   :              [[i + 1, j], [i + 1, j + 1]];
    const m0 = hasPillar(n0[0], n0[1]) ? 0.55 : 0.15;
    const m1 = hasPillar(n1[0], n1[1]) ? 0.55 : 0.15;
    const hw = CM.W / 2, hd = CM.D / 2;
    const aMin = m0 + hw, aMax = S - m1 - hw;
    const a = aMin + hash2(i, j, 313) * Math.max(0, aMax - aMin);   // tout le long du mur, pas forcément au centre
    const off = T / 2 + hd + 0.01;
    if (side === 0) return { x: i * S + a,           z: j * S + off,           fx: 0,  fz: 1,  hx: hw, hz: hd };
    if (side === 1) return { x: i * S + a,           z: (j + 1) * S - off,     fx: 0,  fz: -1, hx: hw, hz: hd };
    if (side === 2) return { x: i * S + off,         z: j * S + a,             fx: 1,  fz: 0,  hx: hd, hz: hw };
    return              { x: (i + 1) * S - off,     z: j * S + a,             fx: -1, fz: 0,  hx: hd, hz: hw };
  }
  return null;
}

// Arêtes du réseau : dir 0 = mur le long de x (à z = j*S), dir 1 = mur le long de z (à x = i*S)
// 0 vide · 1 plein · 2 porte · 3 grande ouverture · 4 muret · 5 porte vers la prairie
function edgeType(dir, i, j) {
  if (dir === 0 && i === 0 && j === 0) return 5;
  if ((dir === 1 && j === 0 && (i === 0 || i === 1)) || (dir === 0 && i === 0 && j === 1)) return 0;
  const r = hash2(i, j, dir + 11);
  if (r < 0.01) return 3;     // grandes ouvertures (rares)
  if (r < 0.05) return 2;     // portes normales
  if (r < 0.50) return 1;     // murs pleins
  if (r < 0.98) return 0;     // vide
  return 4;
}
// Éléments d'une arête : [début, fin (le long du mur), bas, haut, boiserie (0/1), épaisseur]
const PARTS = (() => {
  const { S, T, H } = BK, L0 = -T / 2, L1 = S + T / 2, m = S / 2;
  const gd = (OPEN_X2 - OPEN_X1) / 2;          // demi-largeur de la porte de la prairie
  const g2 = gd;                                // portes normales : mêmes dimensions que la porte de la prairie
  const g3 = 1.4;                               // grandes ouvertures : plus larges
  const top3 = OPEN_H + 0.4;                    // grandes ouvertures : plus hautes
  const g5 = gd + JAMB;
  const fw = CASING_W, fh = OPEN_H + JAMB, ft = T + 2 * CASING_T;
  const E = 0.008;   // la moulure déborde légèrement dans l'ouverture : plus aucune face coplanaire avec le mur
  const frame = (g, top, kind) => [
    [m - g - fw, m - g + E, 0, top + fw, kind, ft],
    [m + g - E, m + g + fw, 0, top + fw, kind, ft],
    [m - g + E, m + g - E, top - E, top + fw, kind, ft],
  ];
  return [
    [],
    [[L0, L1, 0, H, 0, T]],
    [[L0, m - g2, 0, H, 0, T], [m + g2, L1, 0, H, 0, T], [m - g2, m + g2, OPEN_H, H, 0, T],
     ...frame(g2, OPEN_H, 1)],
    [[L0, m - g3, 0, H, 0, T], [m + g3, L1, 0, H, 0, T], [m - g3, m + g3, top3, H, 0, T],
     ...frame(g3, top3, 1)],
    [[L0, L1, 0, 1.1, 0, T], [L0 - 0.012, L1 + 0.012, 1.1, 1.13, 1, T + 0.024]],
    [[L0, m - g5, 0, H, 0, T], [m + g5, L1, 0, H, 0, T], [m - g5, m + g5, fh, H, 0, T],
     ...frame(g5, fh, 2)],     // 2 = collision seulement : le cadre visible est celui de doorRoot
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