/* SIX SEVEN — original cinematic score.
 *
 * Written in the tradition of the DOORS soundtrack (LSPLASH): half-time tempo,
 * minor-key choir pads, a relentless string ostinato, taiko and timpani hits,
 * a ticking clock, rain bed, and a three-note leitmotif for the number 67.
 * Everything is synthesized with WebAudio at runtime — no samples, no quoted
 * melodies. This is an original cue, not a copy of any existing track.
 */

const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const HZ = (n) => 440 * Math.pow(2, (n - 69) / 12);

const P = {
  D1: HZ(26), A1: HZ(33), Bb1: HZ(34),
  D2: HZ(38), F2: HZ(41), G2: HZ(43), A2: HZ(45), Bb2: HZ(46),
  C3: HZ(48), D3: HZ(50), E3: HZ(52), F3: HZ(53), G3: HZ(55), A3: HZ(57), Bb3: HZ(58),
  C4: HZ(60), D4: HZ(62), E4: HZ(64), F4: HZ(65), G4: HZ(67), A4: HZ(69), Bb4: HZ(70),
  C5: HZ(72), D5: HZ(74), E5: HZ(76), F5: HZ(77), A5: HZ(81), Bb5: HZ(82),
  C6: HZ(84), D6: HZ(86)
};

/* cue times must line up with the scene timeline */
const CUE = {
  open: 0,
  reveal: 3.4,
  crush: 5.4,
  armUp: 7.0,
  charge: 8.6,
  slam: 10.0,
  slowEnd: 12.4,
  storm: 13.33,
  storm2: 14.6,
  final: 16.67,
  hold: 18.4,
  end: 20.0
};

let ctx = null;
let master = null;
let comp = null;
let muffle = null;
let dry = null;
let revSend = null;
let rev = null;
let noise = null;
let rainNodes = [];
let live = [];
let playing = false;

/* ---------------------------------------------------------------- plumbing */

function impulse(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.7);
    }
  }
  return buf;
}

function noiseBuffer(seconds) {
  if (noise && noise.duration >= seconds) return noise;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0.85;

  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 18;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 18000;
  muffle.Q.value = 0.5;

  dry = ctx.createGain();
  dry.gain.value = 0.85;

  rev = ctx.createConvolver();
  rev.buffer = impulse(2.8);

  revSend = ctx.createGain();
  revSend.gain.value = 0.55;

  master.connect(muffle).connect(comp).connect(ctx.destination);
  dry.connect(master);
  revSend.connect(rev);
  rev.connect(master);

  startRain();
  return ctx;
}

function bus(wet) {
  const g = ctx.createGain();
  const w = ctx.createGain();
  w.gain.value = wet;
  g.connect(dry);
  g.connect(w);
  w.connect(revSend);
  return g;
}

function keep(node) {
  live.push(node);
  if (live.length > 900) live = live.slice(-500);
  return node;
}

/* ---------------------------------------------------------------- voices */

function pad(freqs, at, dur, gain = 0.05, cutoff = 600) {
  const b = bus(0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.9;
  lp.frequency.setValueAtTime(cutoff * 0.55, at);
  lp.frequency.linearRampToValueAtTime(cutoff, at + dur * 0.45);
  lp.frequency.linearRampToValueAtTime(cutoff * 0.45, at + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + Math.min(1.1, dur * 0.4));
  g.gain.setValueAtTime(gain, at + dur * 0.72);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.7);
  lp.connect(g).connect(b);

  freqs.forEach((f, i) => {
    [-7, 6].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents;
      const og = ctx.createGain();
      og.gain.value = 0.4 / (i + 1);
      o.connect(og);
      og.connect(lp);
      o.start(at);
      o.stop(at + dur + 0.8);
      keep(o);
    });
  });
}

function choir(freqs, at, dur, gain = 0.07, bright = 520) {
  const b = bus(0.95);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = bright;
  bp.Q.value = 0.85;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + Math.min(1.3, dur * 0.5));
  g.gain.linearRampToValueAtTime(gain * 0.82, at + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 1.3);
  bp.connect(g).connect(b);

  freqs.forEach((f) => {
    [
      { type: 'triangle', mult: 1.0 },
      { type: 'triangle', mult: 1.006 },
      { type: 'sine', mult: 2.0 }
    ].forEach((v) => {
      const o = ctx.createOscillator();
      o.type = v.type;
      o.frequency.value = f * v.mult;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4.2 + Math.random() * 1.6;
      const lg = ctx.createGain();
      lg.gain.value = f * 0.0035;
      lfo.connect(lg);
      lg.connect(o.frequency);
      o.connect(bp);
      o.start(at);
      o.stop(at + dur + 1.4);
      lfo.start(at);
      lfo.stop(at + dur + 1.4);
      keep(o);
      keep(lfo);
    });
  });
}

function stringNote(freq, at, dur, gain = 0.05, cutoff = 1500) {
  const b = bus(0.4);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  lp.connect(g).connect(b);

  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = freq * 2.01;
  const g2 = ctx.createGain();
  g2.gain.value = 0.32;
  o.connect(lp);
  o2.connect(g2);
  g2.connect(lp);
  o.start(at);
  o2.start(at);
  o.stop(at + dur + 0.05);
  o2.stop(at + dur + 0.05);
  keep(o);
  keep(o2);
}

function brass(freqs, at, dur, gain = 0.09) {
  const b = bus(0.6);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 720;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.03);
  g.gain.exponentialRampToValueAtTime(gain * 0.35, at + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  bp.connect(g).connect(b);

  freqs.forEach((f) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.02, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.08);
    o.connect(bp);
    o.start(at);
    o.stop(at + dur + 0.05);
    keep(o);
  });
}

function taiko(at, gain = 0.35, pitch = 62) {
  const b = bus(0.5);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(pitch * 2.4, at);
  o.frequency.exponentialRampToValueAtTime(pitch * 0.55, at + 0.32);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  o.connect(g).connect(b);
  o.start(at);
  o.stop(at + 0.6);
  keep(o);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.4);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, at);
  lp.frequency.exponentialRampToValueAtTime(120, at + 0.25);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(gain * 0.8, at);
  ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  src.connect(lp).connect(ng).connect(b);
  src.start(at, 0, 0.3);
}

function timpani(at, freq, gain = 0.32) {
  const b = bus(0.55);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.6, at);
  o.frequency.exponentialRampToValueAtTime(freq, at + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
  o.connect(g).connect(b);
  o.start(at);
  o.stop(at + 1);
  keep(o);
}

function bell(freq, at, gain = 0.06, dur = 3.2) {
  const b = bus(1.1);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = freq * 2.01;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(freq * 0.6, at);
  mg.gain.exponentialRampToValueAtTime(1, at + 0.7);
  mod.connect(mg);
  mg.connect(o.frequency);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(b);
  o.start(at);
  mod.start(at);
  o.stop(at + dur + 0.1);
  mod.stop(at + dur + 0.1);
  keep(o);
  keep(mod);
}

function tick(at, gain = 0.05, pitch = 2400) {
  const b = bus(0.25);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.2);
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = pitch;
  hp.Q.value = 6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  src.connect(hp).connect(g).connect(b);
  src.start(at, Math.random() * 0.1, 0.08);
}

function heartbeat(at, gain = 0.5) {
  [0, 0.16].forEach((off, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, at + off);
    o.frequency.exponentialRampToValueAtTime(32, at + off + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at + off);
    g.gain.exponentialRampToValueAtTime(gain * (i ? 0.6 : 1), at + off + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + off + 0.26);
    o.connect(g).connect(bus(0.2));
    o.start(at + off);
    o.stop(at + off + 0.3);
    keep(o);
  });
}

function riser(at, dur, gain = 0.16) {
  const b = bus(0.7);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(Math.max(1, dur));
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(300, at);
  bp.frequency.exponentialRampToValueAtTime(5200, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + dur * 0.92);
  g.gain.linearRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(b);
  src.start(at);
  src.stop(at + dur + 0.05);

  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(120, at);
  o.frequency.exponentialRampToValueAtTime(620, at + dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, at);
  og.gain.linearRampToValueAtTime(gain * 0.4, at + dur * 0.9);
  og.gain.linearRampToValueAtTime(0.0001, at + dur);
  o.connect(og).connect(b);
  o.start(at);
  o.stop(at + dur + 0.05);
  keep(o);
}

function swell(at, dur, gain = 0.16) {
  const b = bus(0.9);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(Math.max(0.6, dur));
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + dur);
  g.gain.linearRampToValueAtTime(0.0001, at + dur + 0.08);
  src.connect(hp).connect(g).connect(b);
  src.start(at);
  src.stop(at + dur + 0.1);
}

function subDrop(freq, at, dur, gain = 0.8) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(16, freq * 0.3), at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus(0.15));
  o.start(at);
  o.stop(at + dur + 0.05);
  keep(o);
}

function crash(at, gain = 0.28) {
  const b = bus(0.8);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(1.6);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
  src.connect(hp).connect(g).connect(b);
  src.start(at);
  src.stop(at + 1.6);
}

function startRain() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(4);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.35;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  src.connect(bp).connect(g).connect(bus(0.4));
  src.start();
  rainNodes = [src, g, bp];
}

/* ---------------------------------------------------------------- the score */

function compose(t0) {
  const B = (n) => t0 + n * BEAT; // beat grid

  /* --- bar 1 (0.00 – 3.33): rain, ticking clock, first motif --- */
  pad([P.D3, P.F3, P.A3, P.E4], B(0), BEAT * 4.2, 0.06, 420);
  subDrop(P.D1 * 2, B(0), 3.4, 0.35);
  [0, 1, 2, 3].forEach((b) => tick(B(b), b % 2 ? 0.035 : 0.055, b % 2 ? 2100 : 2600));
  bell(P.Bb4, B(0.6), 0.05);
  bell(P.C5, B(1.7), 0.045);
  pad([P.D2, P.A2], B(2), BEAT * 2.2, 0.04, 300);

  /* --- bar 2 (3.33 – 6.67): the reveal, ostinato begins --- */
  timpani(B(4), P.D2, 0.34);
  crash(B(4), 0.1);
  subDrop(P.D1 * 2, B(4), 1.8, 0.5);
  pad([P.Bb2, P.D3, P.F3, P.A3], B(4), BEAT * 4.2, 0.075, 700);
  choir([P.Bb3, P.D4, P.F4], B(4), BEAT * 3.4, 0.055, 480);
  brass([P.D3, P.A3], B(4), 0.45, 0.1);

  for (let i = 0; i < 8; i++) {
    const accent = i % 2 === 0;
    stringNote(P.D2, B(4 + i * 0.5), 0.34, accent ? 0.075 : 0.05, accent ? 1800 : 1100);
    stringNote(P.A2, B(4 + i * 0.5), 0.3, accent ? 0.045 : 0.03, 1200);
  }
  [4, 6].forEach((b) => timpani(B(b), P.D2, 0.2));

  /* --- crush at 5.4s: body impact, brakes squeal of strings --- */
  taiko(B(6.5), 0.4, 70);
  crash(B(6.5), 0.14);
  brass([P.Bb2, P.F3], B(6.5), 0.7, 0.09);

  /* --- bar 3 (6.67 – 10.0): he raises his arm, the charge builds --- */
  pad([P.G2, P.Bb2, P.D3, P.F3], B(8), BEAT * 4.2, 0.075, 800);
  choir([P.G3, P.Bb3, P.D4], B(8), BEAT * 3, 0.06, 540);
  choir([P.A3, P.C4, P.E4], B(11), BEAT * 2.4, 0.07, 700);
  brass([P.G2, P.D3], B(9.5), 0.4, 0.07);
  brass([P.A2, P.E3], B(10.5), 0.4, 0.08);

  for (let i = 0; i < 8; i++) {
    stringNote(P.G2, B(8 + i * 0.5), 0.32, i % 2 ? 0.04 : 0.06, 1300);
  }
  // accelerating heartbeat into the slam
  [0, 1, 2, 3, 3.75].forEach((b, i) => heartbeat(B(9 + b * 0.6), 0.4 + i * 0.05));
  [10, 10.5, 11, 11.25, 11.5, 11.75].forEach((b) => tick(B(b), 0.04, 3200));
  riser(B(10.3), (12 - 10.3) * BEAT, 0.2);

  /* --- slam at 10.0s, then slow motion --- */
  crash(B(12), 0.3);
  timpani(B(12), P.D2, 0.42);
  taiko(B(12), 0.5, 52);
  brass([P.D3, P.F3, P.A3, P.D4], B(12), 1.5, 0.14);
  subDrop(P.D1 * 2, B(12), 2.2, 0.9);
  choir([P.D3, P.A3, P.D4], B(12), BEAT * 2.4, 0.09, 320);
  pad([P.D2, P.A2], B(12), BEAT * 2.6, 0.1, 220);
  bell(P.F4, B(12.6), 0.05, 4);
  // slow-motion: single ticks, spaced out, muffled by the master filter
  [13.2, 13.9, 14.6].forEach((b) => tick(B(b), 0.05, 1500));

  /* --- 12.4s: the world snaps back --- */
  swell(B(14.9), 0.35, 0.14);
  taiko(B(15), 0.4, 66);
  timpani(B(15), P.A1, 0.3);
  pad([P.D3, P.G3, P.Bb3], B(15), BEAT * 2.2, 0.07, 900);

  /* --- bar 5 (13.33 – 16.67): the storm --- */
  crash(B(16), 0.24);
  taiko(B(16), 0.45, 58);
  brass([P.D3, P.A3, P.D4], B(16), 0.5, 0.1);
  choir([P.D4, P.F4, P.A4], B(16), BEAT * 1.8, 0.06, 620);
  pad([P.D2, P.A2, P.C3], B(16), BEAT * 4, 0.08, 1000);

  for (let i = 0; i < 16; i++) {
    const accent = i % 4 === 0;
    stringNote(i % 2 ? P.D2 : P.A1 * 2, B(16 + i * 0.25), 0.2, accent ? 0.08 : 0.045, accent ? 2200 : 1200);
  }
  [16, 17, 18, 19].forEach((b, i) => taiko(B(b), i % 2 ? 0.3 : 0.42, 58 + i * 4));
  [16.5, 17.5, 18.5, 19.5].forEach((b) => timpani(B(b), P.A1, 0.22));
  brass([P.Bb2, P.F3, P.Bb3], B(18), 0.5, 0.09);
  choir([P.Bb3, P.D4, P.F4], B(18), BEAT * 1.8, 0.07, 560);
  riser(B(19.2), 0.9, 0.14);

  /* --- final (16.67s): the sky spells it out --- */
  crash(B(20), 0.34);
  timpani(B(20), P.D2, 0.45);
  taiko(B(20), 0.55, 48);
  subDrop(P.D1 * 2, B(20), 2.6, 1.0);
  brass([P.D3, P.F3, P.A3, P.D4], B(20), 1.8, 0.16);
  pad([P.D1, P.A1, P.D2, P.A2], B(20), BEAT * 4, 0.13, 1600);
  choir([P.D4, P.F4, P.A4, P.D5], B(20), BEAT * 3.6, 0.13, 700);
  choir([P.D3, P.A3], B(20), BEAT * 3.6, 0.08, 380);

  // leitmotif, full statement
  const motif = [
    [P.Bb4, 20], [P.C5, 21], [P.D5, 22], [P.A4, 23]
  ];
  motif.forEach(([f, b]) => {
    bell(f, B(b), 0.07, 3.6);
    choir([f], B(b), BEAT * 0.85, 0.035, 900);
  });

  // timpani roll into the last hit
  for (let i = 0; i < 12; i++) {
    timpani(B(20 + i * 0.333), P.D2 * (i % 2 ? 1 : 1.5), 0.1 + i * 0.012);
  }

  /* --- tail (18.4 – 20.0): decay to rain --- */
  bell(P.D5, B(23.2), 0.045, 4.5);
  pad([P.D2, P.A2], B(23), BEAT * 1.6, 0.05, 300);
}

/* ---------------------------------------------------------------- public */

export const score = {
  context: ensure,

  start() {
    if (!ensure()) return;
    if (playing) this.stop();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(0.85, t);
    muffle.frequency.cancelScheduledValues(t);
    muffle.frequency.setValueAtTime(18000, t);
    if (!rainNodes.length) startRain();
    playing = true;
    compose(t + 0.1);
  },

  stop() {
    playing = false;
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0.0001, t + 0.35);
    live.forEach((node) => {
      try { node.stop(t + 0.4); } catch (e) { /* already stopped */ }
    });
    live = [];
    rainNodes.forEach((node) => {
      try { node.stop && node.stop(t + 0.35); } catch (e) { /* already stopped */ }
    });
    rainNodes = [];
    setTimeout(() => {
      if (!ctx) return;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0.85, ctx.currentTime);
    }, 600);
  },

  muffle(amount) {
    if (!ctx) return;
    const target = 18000 - amount * 17200;
    muffle.frequency.cancelScheduledValues(ctx.currentTime);
    muffle.frequency.setValueAtTime(muffle.frequency.value, ctx.currentTime);
    muffle.frequency.linearRampToValueAtTime(Math.max(600, target), ctx.currentTime + 0.25);
  },

  /* spot effects used by the scene */
  thunder(power = 1, delay = 0) {
    if (!ensure()) return;
    const at = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3400, at);
    lp.frequency.exponentialRampToValueAtTime(80, at + 2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.55 * power, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
    src.connect(lp).connect(g).connect(bus(0.5));
    src.start(at);
    src.stop(at + 2.3);
    subDrop(80, at, 1.2, 0.45 * power);
  },

  zap(delay = 0) {
    if (!ensure()) return;
    const at = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    src.connect(bp).connect(g).connect(bus(0.3));
    src.start(at, Math.random() * 0.2, 0.25);
  },

  boom() {
    if (!ensure()) return;
    const at = ctx.currentTime;
    subDrop(150, at, 1.5, 0.9);
    crash(at, 0.16);
  },

  roar() {
    if (!ensure()) return;
    const at = ctx.currentTime;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o2.type = 'square';
    o.frequency.setValueAtTime(74, at);
    o.frequency.linearRampToValueAtTime(48, at + 1.4);
    o2.frequency.setValueAtTime(108, at);
    o2.frequency.linearRampToValueAtTime(72, at + 1.4);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(760, at);
    lp.frequency.linearRampToValueAtTime(220, at + 1.4);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 10;
    lg.gain.value = 8;
    lfo.connect(lg);
    lg.connect(o.frequency);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(bus(0.6));
    o.start(at); o2.start(at); lfo.start(at);
    o.stop(at + 1.7); o2.stop(at + 1.7); lfo.stop(at + 1.7);
  },

  sub(freq, delay, dur, gain) {
    if (!ensure()) return;
    subDrop(freq, ctx.currentTime + (delay || 0), dur || 1.2, gain || 0.5);
  },

  pad() {
    if (!ensure()) return;
    pad([P.D3, P.A3, P.D4], ctx.currentTime, BEAT * 3, 0.1, 1400);
  },

  finalChord() {
    if (!ensure()) return;
    const at = ctx.currentTime;
    [P.D2, P.A2, P.D3, P.F3, P.A3, P.D4].forEach((f, i) => {
      bell(f, at + i * 0.012, 0.05 + i * 0.008, 3.4);
    });
  },

  get playing() {
    return playing;
  }
};
