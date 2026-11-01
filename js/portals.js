// =====================================================================
//  Portail de la porte : prairie <-> backrooms
//  Les deux mondes partagent les mêmes coordonnées. Seules les copies de la porte
//  sur le tore (décalées de ox, oz) demandent une caméra virtuelle décalée.
// =====================================================================
const quadGeo = new THREE.PlaneGeometry(OPEN_X2 - OPEN_X1 + 0.04, OPEN_H + 0.07);
quadGeo.translate(DOOR_CX, (OPEN_H - 0.03) / 2, WALL_Z);

const stencilQuadMat = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
  stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1,
  stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp
});
const depthQuadMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(BK_FOG) } },
  vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
  fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
  colorWrite: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, side: THREE.DoubleSide,
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

const planeOut        = new THREE.Plane(new THREE.Vector3(0, 0, -1), WALL_Z);    // garde z <= WALL_Z (prairie)
const planeBackBeyond = new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z);    // garde z >= WALL_Z (backrooms)
const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), tmpBox = new THREE.Box3();

function portalVisible(ox, oz) {
  tmpBox.min.set(OPEN_X1 - 0.1 + ox, -0.1, WALL_Z - 0.1 + oz);
  tmpBox.max.set(OPEN_X2 + 0.1 + ox, OPEN_H + 0.1, WALL_Z + 0.1 + oz);
  return frustum.intersectsBox(tmpBox);
}
function doorVisible(ox, oz) {
  tmpBox.min.set(OPEN_X1 - 1.3 + ox, -0.1, WALL_Z - 1.3 + oz);
  tmpBox.max.set(OPEN_X2 + 1.3 + ox, OPEN_H + 0.3, WALL_Z + 1.3 + oz);
  return frustum.intersectsBox(tmpBox);
}

// ---------- Caméra virtuelle ----------
const vcam = new THREE.PerspectiveCamera(FOV, 1, 0.02, 500);
const mPT = new THREE.Matrix4(), _ma = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _vm = new THREE.Matrix4();
const _off = new THREE.Vector3();
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

function drawWorld(target, cam, plane, ref) {
  renderer.clippingPlanes = plane ? [plane] : [];
  if (target === 'back') {
    setStencil(backMats, ref); renderer.render(backScene, cam); setStencil(backMats, 0);
  } else {
    sky.position.copy(camPos); updateTiles(camPos);
    setStencil(outMats, ref); renderer.render(outScene, cam); setStencil(outMats, 0);
  }
  renderer.clippingPlanes = [];
}

// k : référence de stencil · (ox, oz) : copie de la porte sur le tore · target : monde vu à travers
function drawPortal(k, ox, oz, target) {
  quadStencil.position.set(ox, 0, oz); quadDepth.position.set(ox, 0, oz);
  stencilQuadMat.stencilRef = k; depthQuadMat.stencilRef = k;
  depthQuadMat.uniforms.uColor.value.set(target === 'back' ? BK_FOG : FOG_COLOR);
  quadStencil.visible = true;  quadDepth.visible = false;
  renderer.render(portalScene, camera);
  quadStencil.visible = false; quadDepth.visible = true;
  renderer.render(portalScene, camera);
  if (target === 'back') {
    setPortalMatrix(mPT, _off.set(ox, 0, oz), ZERO, 0);   // la copie de porte -> la vraie porte des backrooms
    setVirtualCamera(mPT);
    drawWorld('back', vcam, planeBackBeyond, k);
  } else {
    drawWorld('out', camera, planeOut, k);
  }
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
  list.forEach((d, i) => drawPortal(i + 1, d.ox, d.oz, 'back'));
}

const TUNNEL_HALF = 0.08;
function renderTunnel() {            // caméra à cheval sur le plan de la porte : on dessine les deux moitiés
  drawWorld('back', camera, planeBackBeyond, 0);
  drawWorld('out', camera, planeOut, 0);
}

function renderDoors() {
  renderer.clippingPlanes = [];
  doorScene.fog = world === 'back' ? backScene.fog : outScene.fog;
  for (const d of doorCopies) {
    if (world === 'back' && (d.ox || d.oz)) continue;       // dans les backrooms, une seule porte
    if (!doorVisible(d.ox, d.oz)) continue;
    if (Math.hypot(camPos.x - (DOOR_CX + d.ox), camPos.z - (WALL_Z + d.oz)) > 115) continue;
    doorRoot.position.set(d.ox, 0, d.oz);
    renderer.render(doorScene, camera);
  }
  doorRoot.position.set(0, 0, 0);
}

// =====================================================================
//  Changement de monde : décidé d'après la position de la CAMÉRA
// =====================================================================
let lastCamZ = SPAWN.z;
function updateWorldTransitions() {
  player.updateMatrixWorld(true);
  camera.getWorldPosition(camPos);
  if (camPos.x > OPEN_X1 && camPos.x < OPEN_X2) {
    if (world === 'out' && lastCamZ <= WALL_Z && camPos.z > WALL_Z) world = 'back';
    else if (world === 'back' && lastCamZ >= WALL_Z && camPos.z < WALL_Z) world = 'out';
  }
  lastCamZ = camPos.z;
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
  renderer.setClearColor(world === 'back' ? BK_FOG : FOG_COLOR, 1);
  renderer.clear(true, true, true);

  const inTunnel = camPos.x > OPEN_X1 + 0.1 && camPos.x < OPEN_X2 - 0.1 &&
                   Math.abs(camPos.z - WALL_Z) < TUNNEL_HALF && camPos.y < OPEN_H;

  if (inTunnel) {
    renderTunnel();
    if (world === 'out') drawOutPortals(true);
  } else if (world === 'back') {
    drawWorld('back', camera, null, 0);
    if (camPos.z > WALL_Z && camPos.distanceTo(_off.set(DOOR_CX, 1, WALL_Z)) < 80 && portalVisible(0, 0)) {
      drawPortal(1, 0, 0, 'out');
    }
  } else {
    drawWorld('out', camera, null, 0);
    drawOutPortals(false);
  }
  renderDoors();
}