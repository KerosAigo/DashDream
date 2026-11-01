// =====================================================================
//  Porte : charnière physique (fonctionne dans la prairie comme dans les backrooms)
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
//  Boucle principale
// =====================================================================
const clock = new THREE.Clock();
let previousFrameTime = 0;

function animate(timestamp) {
  requestAnimationFrame(animate);
  const frameTime = typeof timestamp === 'number' ? timestamp : performance.now();
  const frameDt = previousFrameTime ? (frameTime - previousFrameTime) / 1000 : 0;
  previousFrameTime = frameTime;
  const dt = Math.min(clock.getDelta(), 0.05);
  updateAdaptiveQuality(frameDt);                                 // graphics.js
  const locked = document.pointerLockElement === renderer.domElement;

  updatePlayerHorizontal(dt, locked);                             // player.js
  updateDoor(dt, velX, velZ);
  resolveStatic();
  updatePlayerVertical(dt);                                       // player.js
  lastCamZ -= wrapPlayerOnTorus();                                // meadow.js

  updateHeadMotion(dt);                                           // player.js
  updateWorldTransitions();                                       // portals.js 
  updateGrab(dt);                                                 // grab.js                                       
  updateBackrooms();                                              // backrooms.js
  updateHum(dt); 

  doorLookMix += ((world === 'out' ? 1 : 0) - doorLookMix) * Math.min(1, dt * 4);
  applyDoorLook();                                                 // graphics.js

  renderFrame();                                                   // graphics.js -> renderScene (portals.js)
}

animate();