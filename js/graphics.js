// =====================================================================
//  Qualité adaptative
// =====================================================================
const hardwareCores = navigator.hardwareConcurrency || 4;
const hardwareMemory = navigator.deviceMemory || (hardwareCores >= 8 ? 8 : 4);
const qualityPreset = hardwareCores <= 4 || hardwareMemory <= 4
  ? { pixelRatio: 1, tufts: 7000, terrainSegments: 64, postLevel: 1 }
  : hardwareCores >= 8 && hardwareMemory >= 8
    ? { pixelRatio: 1.5, tufts: 26000, terrainSegments: 112, postLevel: 3 }
    : { pixelRatio: 1.25, tufts: 14000, terrainSegments: 88, postLevel: 2 };

// =====================================================================
//  Renderer et scènes
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: true });
renderer.autoClear = false;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityPreset.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const outScene  = new THREE.Scene();
const doorScene = new THREE.Scene();
const doorRoot  = new THREE.Group(); doorScene.add(doorRoot);

const outMats = [];
const mk = (list, params, Ctor = THREE.MeshStandardMaterial) => { const m = new Ctor(params); list.push(m); return m; };

const camPos = new THREE.Vector3();
const SUN_DIR = new THREE.Vector3(0.45, 0.6, -0.5).normalize();

// =====================================================================
//  Textures procédurales
// =====================================================================

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

// =====================================================================
//  Éclairage de la porte (partagée entre salle et extérieur)
// =====================================================================
const doorAmb = new THREE.AmbientLight(0xffffff, 0.5);
const doorDir = new THREE.DirectionalLight(0xffffff, 0.6);
doorScene.add(doorAmb, doorDir);
const LOOK_BACK = { amb: new THREE.Color(0xfff0c0), ambI: 0.6, dir: new THREE.Color(0xffe8a8), dirI: 0.45, pos: new THREE.Vector3(-0.3, 0.5, 0.8) };
const LOOK_OUT  = { amb: new THREE.Color(0xd4e8ff), ambI: 0.6, dir: new THREE.Color(0xfff1d6), dirI: 0.95, pos: SUN_DIR.clone() };
let doorLookMix = 0;
function applyDoorLook() {
  const m = doorLookMix;
  doorAmb.color.copy(LOOK_BACK.amb).lerp(LOOK_OUT.amb, m);
  doorAmb.intensity = lerp(LOOK_BACK.ambI, LOOK_OUT.ambI, m);
  doorDir.color.copy(LOOK_BACK.dir).lerp(LOOK_OUT.dir, m);
  doorDir.intensity = lerp(LOOK_BACK.dirI, LOOK_OUT.dirI, m);
  doorDir.position.copy(LOOK_BACK.pos).lerp(LOOK_OUT.pos, m);
}
applyDoorLook();

// =====================================================================
//  Post-process rétro
//  Scène -> cible (avec stencil, pour les portails) -> passe plein écran :
//  courbure CRT, pixelisation, flou, aberration chromatique, contraste,
//  dithering de Bayer, palette de 16 couleurs, vignette.
// =====================================================================
const RETRO = {
  height: 0,
  block: 2,
  blur: 0.6,
  chroma: 0.005,
  distort: 0.05,
  contrast: 1.35,
  saturation: 1.15,
  dither: 0.05,
  palette: 0.5,
  vignette: 0.20,
};

const POST_HEIGHTS = [360, 480, 600, 720, 900];
const POST_PIXEL_RATIOS = [0.75, 0.85, 1, 1.1, 1.25];
const adaptiveQuality = { level: qualityPreset.postLevel, slowTime: 0, fastTime: 0 };
RETRO.height = POST_HEIGHTS[adaptiveQuality.level];

function updateAdaptiveQuality(dt) {
  if (document.hidden) return;

  if (dt > 0.024) {
    adaptiveQuality.slowTime += dt;
    adaptiveQuality.fastTime = 0;
  } else if (dt < 0.017) {
    adaptiveQuality.fastTime += dt;
    adaptiveQuality.slowTime = 0;
  } else {
    adaptiveQuality.slowTime = Math.max(0, adaptiveQuality.slowTime - dt * 0.5);
    adaptiveQuality.fastTime = 0;
  }

  let nextLevel = adaptiveQuality.level;
  if (adaptiveQuality.slowTime >= 1.5 && nextLevel > 0) nextLevel--;
  else if (adaptiveQuality.fastTime >= 8 && nextLevel < POST_HEIGHTS.length - 1) nextLevel++;
  if (nextLevel === adaptiveQuality.level) return;

  adaptiveQuality.level = nextLevel;
  adaptiveQuality.slowTime = adaptiveQuality.fastTime = 0;
  RETRO.height = POST_HEIGHTS[nextLevel];
  resizePost();
}

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
      vec3 centerR = tap(suv + co);
      vec3 centerG = tap(suv);
      vec3 centerB = tap(suv - co);
      vec3 neighbors = tap(suv + vec2(px.x, 0.0)) + tap(suv - vec2(px.x, 0.0))
                     + tap(suv + vec2(0.0, px.y)) + tap(suv - vec2(0.0, px.y));
      vec3 col;
      col.r = mix(centerR.r, centerR.r * 0.4 + neighbors.r * 0.15, uBlur);
      col.g = mix(centerG.g, centerG.g * 0.4 + neighbors.g * 0.15, uBlur);
      col.b = mix(centerB.b, centerB.b * 0.4 + neighbors.b * 0.15, uBlur);

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
  renderer.setPixelRatio(Math.min(
    window.devicePixelRatio || 1,
    qualityPreset.pixelRatio,
    POST_PIXEL_RATIOS[adaptiveQuality.level]
  ));
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
  renderScene();                                   // -> portals.js
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