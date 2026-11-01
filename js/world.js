// =====================================================================
//  La porte : un seul objet, visible depuis la prairie et depuis les backrooms
// =====================================================================
function addBox(root, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); root.add(m); return m;
}

const DOOR = {
  length: 1.48, height: 2.7, thickness: 0.042, bottom: 0.02,   // length était 1.08
  mass: 25, hingeX: OPEN_X1 + 0.01, hingeZ: WALL_Z,
  limit: 1.9, damping: 1.2, friction: 0.3, restitution: 0.1, stopBounce: 0.25, selfClose: 0, maxSpeed: 8,
};

const woodTex   = makeWoodTexture();
const leafMat   = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.65 });
const panelMat  = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xd8c3a2, roughness: 0.6 });
const jambMat   = new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.7 });
const casingMat = new THREE.MeshStandardMaterial({ color: 0x6b4730, roughness: 0.65 });
const sillMat   = new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 0.9 });
const metalMat  = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.35 });

const addDoorBox = (mat, w, h, d, x, y, z) => addBox(doorRoot, mat, w, h, d, x, y, z);
const JT = WALL_T + 0.01;   // légèrement plus épais que le mur
addDoorBox(jambMat, JAMB, OPEN_H, JT, OPEN_X1 - JAMB / 2, OPEN_H / 2, WALL_Z);
addDoorBox(jambMat, JAMB, OPEN_H, JT, OPEN_X2 + JAMB / 2, OPEN_H / 2, WALL_Z);
addDoorBox(jambMat, OPEN_X2 - OPEN_X1 + 2 * JAMB, JAMB, JT, DOOR_CX, OPEN_H + JAMB / 2, WALL_Z);
for (const s of [1, -1]) {
  const cz = WALL_Z + s * (WALL_T / 2 + CASING_T / 2);
  addDoorBox(casingMat, CASING_W, OPEN_H, CASING_T, OPEN_X1 - CASING_W / 2, OPEN_H / 2, cz);
  addDoorBox(casingMat, CASING_W, OPEN_H, CASING_T, OPEN_X2 + CASING_W / 2, OPEN_H / 2, cz);
  addDoorBox(casingMat, OPEN_X2 - OPEN_X1 + 2 * CASING_W, CASING_W, CASING_T, DOOR_CX, OPEN_H + CASING_W / 2, cz);
}
addDoorBox(sillMat, OPEN_X2 - OPEN_X1, 0.012, JT, DOOR_CX, 0.006, WALL_Z);

function makeLeaf() {
  const pivot = new THREE.Group();
  const L = DOOR.length, H = DOOR.height, T = DOOR.thickness, y0 = DOOR.bottom;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(L, H, T), leafMat);
  slab.position.set(L / 2, y0 + H / 2, 0);
  pivot.add(slab);
  const stile = 0.14, mid = 0.10, pw = (L - 2 * stile - mid) / 2;
  const rows = [{ y: 0.28, h: 0.95 }, { y: 1.35, h: 1.05 }];
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
  for (const y of [0.22, 1.35, 2.5]) for (const s of [1, -1]) {
    const pl = new THREE.Mesh(plateGeo, metalMat); pl.position.set(0.03, y, s * (T / 2 + 0.002)); pivot.add(pl);
  }
  return pivot;
}
const leafPivot = makeLeaf();
leafPivot.position.set(DOOR.hingeX, 0, DOOR.hingeZ);
doorRoot.add(leafPivot);
for (const y of [0.22, 1.35, 2.5]) {
  const k = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 12), metalMat);
  k.position.set(DOOR.hingeX, y, DOOR.hingeZ);
  doorRoot.add(k);
}