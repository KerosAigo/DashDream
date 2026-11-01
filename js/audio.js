// =====================================================================
//  Le bruit des néons : bourdonnement 100 Hz (2 × 50 Hz secteur) + harmoniques + souffle
//  Généré en Web Audio. Le volume dépend de la proximité des néons allumés.
// =====================================================================
const hum = { ctx: null, master: null, level: 0 };

function initHum() {
  if (hum.ctx) { if (hum.ctx.state === 'suspended') hum.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  hum.ctx = ctx;

  hum.master = ctx.createGain();
  hum.master.gain.value = 0;
  hum.master.connect(ctx.destination);

  // ---------- Reverb ----------
  // Réponse impulsionnelle : bruit stéréo à décroissance exponentielle, assombri vers la fin
  const irLen = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < irLen; i++) {
      const t = i / irLen;
      const k = 0.6 - 0.45 * t;                       // filtre de plus en plus sombre
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * Math.pow(1 - t, 3);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = ir;
  hum.send = ctx.createGain(); hum.send.gain.value = 1;     // entrée de la reverb
  hum.wet = ctx.createGain();  hum.wet.gain.value = 0.3;    // niveau de reverb
  hum.send.connect(convolver); convolver.connect(hum.wet); hum.wet.connect(ctx.destination);
  hum.master.connect(hum.send);                             // le bourdonnement passe aussi dedans

  // Adoucit les harmoniques agressives
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2800; lp.Q.value = 0.07;
  lp.connect(hum.master);

  // Tremblement lent de l'amplitude (légère instabilité du ballast)
  const trem = ctx.createGain(); trem.gain.value = 0.5; trem.connect(lp);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.01;
  const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.2;
  lfo.connect(lfoDepth); lfoDepth.connect(trem.gain); lfo.start();

  // Fondamentale et harmoniques du secteur 50 Hz
  const partials = [
    [50,  'sine',     0.20],
    [100, 'sawtooth', 0.32],
    [200, 'square',   0.10],
    [300, 'sawtooth', 0.07],
    [400, 'square',   0.03],
  ];
  for (const [f, type, g] of partials) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 6;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(trem); o.start();
  }

  // Souffle électrique aigu
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5500; bp.Q.value = 1.5;
  const ng = ctx.createGain(); ng.gain.value = 0.035;
  noise.connect(bp); bp.connect(ng); ng.connect(hum.master); noise.start();
}
// L'audio doit être déclenché par un geste de l'utilisateur
document.addEventListener('click', initHum);
document.addEventListener('keydown', initHum);

function updateHum(dt) {
  if (!hum.ctx || hum.ctx.state !== 'running') return;

  let target = 0;
  if (world === 'back') {
    target = 0.10 + 0.20 * lightAt(player.position.x, player.position.z);
  } else {
    const dist = Math.hypot(player.position.x - DOOR_CX, player.position.z - WALL_Z);
    const open = Math.min(1, Math.abs(doorAngle) / 0.5);
    target = 0.12 * open * Math.max(0, 1 - dist / 14);
  }

  hum.master.gain.setTargetAtTime(target, hum.ctx.currentTime, 0.08);
}

document.addEventListener('visibilitychange', () => {
  if (!hum.ctx) return;
  if (document.hidden) hum.ctx.suspend(); else hum.ctx.resume();
});

// =====================================================================
//  Bruits de pas
// =====================================================================
let stepNoiseBuf = null;
function getStepNoise() {
  if (stepNoiseBuf) return stepNoiseBuf;
  const ctx = hum.ctx, len = Math.floor(ctx.sampleRate * 0.5);
  stepNoiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = stepNoiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return stepNoiseBuf;
}

function playStep(speedFactor) {
  const ctx = hum.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const vol = clamp(0.5 + 0.5 * speedFactor, 0.4, 1.3) * (0.85 + Math.random() * 0.3);

  // Souffle filtré (le frottement de la semelle)
  const src = ctx.createBufferSource();
  src.buffer = getStepNoise();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.connect(filter); filter.connect(g); g.connect(ctx.destination);

  if (world === 'back') {
    // Moquette : sourd et court
    filter.type = 'lowpass';
    filter.frequency.value = 450 + Math.random() * 150;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28 * vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.start(t, Math.random() * 0.3, 0.14);

    // Petit choc grave du talon
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 + Math.random() * 20, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og); og.connect(ctx.destination);
    o.start(t); o.stop(t + 0.12);
  } else {
    // Herbe : frottement plus aigu et plus long
    filter.type = 'bandpass';
    filter.frequency.value = 2200 + Math.random() * 900;
    filter.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.start(t, Math.random() * 0.3, 0.22);
  }
}