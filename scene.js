/* SIX SEVEN — 3D kaiju cutscene.
 * A giant kid rises over a night city and levels it with lightning.
 * Three.js scene, procedural geometry, one pre-rendered bloom pass. */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { score } from './score.js';

const DURATION = 20.0;

/* Three acts: the city, the kid, the number.
 * 0.0 – 3.4   rain, clock, a title card, the city breathing
 * 3.4 – 10.0  reveal, first step, arm raised, charge
 * 10.0 – 12.4 slow motion through the shockwave
 * 12.4 – 16.67 the storm answers
 * 16.67 – 20.0 the sky spells it out
 */
const T = {
  reveal: 3.4,
  strike: 5.4,
  armUp: 7.0,
  charge: 8.6,
  slam: 10.0,
  slowEnd: 12.4,
  orbit: 12.8,
  storm: 13.33,
  storm2: 14.6,
  final: 16.67,
  hold: 18.4,
};

const CAM = [
  { t: 0.0,   p: [0, 820, 1500],    l: [0, 300, 0] },
  { t: 3.4,   p: [380, 330, 990],   l: [0, 640, 0] },
  { t: 5.4,   p: [720, 230, 700],   l: [120, 380, 120] },
  { t: 7.0,   p: [560, 430, 790],   l: [0, 620, 0] },
  { t: 8.6,   p: [300, 520, 780],   l: [0, 650, 0] },
  { t: 10.0,  p: [430, 330, 640],   l: [0, 300, 0] },
  { t: 12.4,  p: [520, 300, 560],   l: [0, 250, 0] },
  { t: 13.33, p: [-420, 430, 820],  l: [0, 600, 0] },
  { t: 14.6,  p: [-700, 520, 700],  l: [0, 640, 0] },
  { t: 16.67, p: [0, 900, 1900],    l: [0, 1200, -600] },
  { t: 18.4,  p: [0, 980, 1760],    l: [0, 1180, -600] },
  { t: 20.0,  p: [0, 1060, 1640],   l: [0, 1150, -600] },
];

/* ---------------------------------------------------------------- helpers */

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* ---------------------------------------------------------------- state */

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let composer = null;
let bloom = null;

let built = false;
let running = false;
let elapsed = 0;
let lastTime = 0;
let rafId = 0;
let ended = false;

let onEvent = null;
let onEnd = null;

const fired = Object.create(null);

const state = {
  city: [],
  kid: null,
  handLight: null,
  eyeLight: null,
  eyeMat: null,
  skyGroup: null,
  skyGlow: null,
  flashLights: [],
  flashLevel: 0,
  shake: 0,
  fovPunch: 0,
  strikes: [],
  stormSchedule: [],
  bolt: null,
  debris: null,
  sparks: null,
  dust: null,
  rings: [],
  droneNodes: [],
  audio: null,
  master: null,
  noise: null,
  fxPass: null,
  aberration: 0,
  rain: null,
  aura: null,
  charge: null,
  chargeRing: [],
  fire: [],
  crater: null,
  fireCols: [],
};

const BASE_FOG = new THREE.Color(0x070a13);

// chromatic-aberration / heat-haze style distortion, pulsed on impacts
const FX_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0.0015 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      float amt = uAberration * (0.35 + r2 * 2.2);
      vec2 wob = vec2(sin(vUv.y * 42.0 + uTime * 9.0), cos(vUv.x * 38.0 - uTime * 7.0)) * amt * 0.35;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + d * amt + wob).r;
      col.g = texture2D(tDiffuse, vUv + wob * 0.5).g;
      col.b = texture2D(tDiffuse, vUv - d * amt - wob).b;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/* ---------------------------------------------------------------- audio */

/* The cutscene is scored by score.js; the scene only fires spot effects. */

const audioContext = () => score.context();
const audioStart = () => score.start();
const audioStop = () => score.stop();
const sub = (freq, delay, dur, gain) => score.sub(freq, delay, dur, gain);
const thunder = (power, delay) => score.thunder(power, delay);
const zap = (delay) => score.zap(delay);
const boom = () => score.boom();
const roar = () => score.roar();
const pad = () => score.pad();
const finalChord = () => score.finalChord();

/* ---------------------------------------------------------------- textures */

function windowTexture() {
  const W = 128;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#04060b';
  g.fillRect(0, 0, W, H);
  const cols = 8;
  const rows = 16;
  const cw = W / cols;
  const ch = H / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (Math.random() > 0.24) continue;
      const warm = Math.random() > 0.42;
      g.fillStyle = warm
        ? `rgba(255, ${Math.floor(rnd(150, 200))}, ${Math.floor(rnd(70, 120))}, 0.9)`
        : `rgba(${Math.floor(rnd(110, 160))}, ${Math.floor(rnd(175, 215))}, 255, 0.8)`;
      g.fillRect(x * cw + cw * 0.2, y * ch + ch * 0.26, cw * 0.6, ch * 0.34);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#010207');
  grad.addColorStop(0.45, '#070b18');
  grad.addColorStop(0.72, '#131a33');
  grad.addColorStop(0.88, '#2a1a3a');
  grad.addColorStop(1, '#3d1f2c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 130; i++) {
    const y = Math.random() * 300;
    const a = 0.15 + Math.random() * 0.55;
    g.fillStyle = `rgba(220, 235, 255, ${a})`;
    g.fillRect(Math.random() * 128, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glyphTexture(text, size, color, glow) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = Math.round(size * 0.62);
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = `900 ${Math.round(c.height * 0.86)}px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = glow;
  g.shadowBlur = c.height * 0.18;
  g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2);
  g.shadowBlur = c.height * 0.34;
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(205,230,255,0.7)');
  grad.addColorStop(1, 'rgba(120,170,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(2, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

function fireTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,232,180,0.95)');
  grad.addColorStop(0.2, 'rgba(255,175,70,0.9)');
  grad.addColorStop(0.5, 'rgba(240,95,20,0.6)');
  grad.addColorStop(1, 'rgba(180,30,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildGlows() {
  const tex = glowTexture();
  state.glows = [];
  for (let i = 0; i < 8; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xbfe4ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    sprite.visible = false;
    scene.add(sprite);
    state.glows.push({ sprite, life: 0, max: 0.45, size: 1 });
  }

  const fireTex = fireTexture();
  for (let i = 0; i < 7; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: fireTex,
        color: 0xffb15a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    sprite.visible = false;
    scene.add(sprite);
    state.fire.push({ sprite, life: 0, max: 0.7, base: 200 });
  }
}

function buildRain() {
  const count = window.innerWidth < 520 ? 750 : 1200;
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rnd(-1300, 1300);
    pos[i * 3 + 1] = rnd(0, 1700);
    pos[i * 3 + 2] = rnd(-1300, 1300);
    vel[i] = rnd(1500, 2400);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 38,
      map: streakTexture(),
      color: 0xa9c8ff,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  points.frustumCulled = false;
  scene.add(points);
  state.rain = { points, pos, vel, count };
}

function buildKidFx() {
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(540, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xff4d1a,
      transparent: true,
      opacity: 0.02,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    })
  );
  aura.position.set(0, 520, 0);
  scene.add(aura);
  state.aura = aura;

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(72, 20, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffe0a8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  orb.position.set(0, -330, 0);
  orb.scale.setScalar(0.01);
  state.kid.arms.right.add(orb);
  state.charge = orb;

  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(110, 5, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    ring.position.set(0, -330, 0);
    ring.rotation.x = Math.PI / 2;
    state.kid.arms.right.add(ring);
    state.chargeRing.push(ring);
  }
}

/* ---------------------------------------------------------------- crater + fire */

function buildCrater() {
  const group = new THREE.Group();

  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(340, 56),
    new THREE.MeshBasicMaterial({
      color: 0x05060b,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = 2.5;
  group.add(disk);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(300, 356, 72),
    new THREE.MeshBasicMaterial({
      color: 0xff6a1e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 4;
  group.add(ring);

  const cracks = [];
  for (let i = 0; i < 12; i++) {
    const crack = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff7a22,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    const a = (i / 12) * Math.PI * 2 + rnd(-0.12, 0.12);
    crack.rotation.set(-Math.PI / 2, 0, a);
    crack.position.set(Math.cos(a) * 300, 5, Math.sin(a) * 300);
    crack.scale.x = rnd(0.5, 1.4);
    group.add(crack);
    cracks.push({ mesh: crack, phase: Math.random() * 10, base: crack.scale.x });
  }

  group.visible = false;
  scene.add(group);
  state.crater = { group, ring, cracks, glow: 0 };
}

function buildFires() {
  const tex = dotTexture();
  state.fireCols = [];
  for (let i = 0; i < 16; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xff8a3a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    sprite.visible = false;
    scene.add(sprite);
    state.fireCols.push({ sprite, life: 0, base: 120, phase: Math.random() * 10 });
  }
}

function igniteFire(b) {
  const f = state.fireCols.find((x) => x.life <= 0);
  if (!f) return;
  const pos = b.group.position.clone();
  pos.y = Math.max(30, b.h * 0.16);
  f.sprite.position.copy(pos);
  f.sprite.visible = true;
  f.base = Math.max(90, b.h * 0.55);
  f.life = 60;
  f.sprite.material.opacity = 0.7;
  f.sprite.scale.set(f.base * 0.55, f.base, 1);
}

function crushNearest() {
  const foot = new THREE.Vector3(430, 0, 300);
  let target = null;
  let best = Infinity;
  state.city.forEach((b) => {
    if (b.crushed) return;
    const d = b.group.position.distanceTo(foot);
    if (d < best) {
      best = d;
      target = b;
    }
  });
  if (!target) return null;
  target.crushed = true;
  target.ignited = true;
  target.group.scale.y = 0.28;
  target.group.rotation.z = rnd(-0.14, 0.14);
  const p = target.group.position.clone();
  spawnDust(new THREE.Vector3(p.x, 30, p.z), 70, 1.6);
  spawnDebris(new THREE.Vector3(p.x, 60, p.z), 50, 1.6);
  spawnSparks(new THREE.Vector3(p.x, 60, p.z), 90, 1.4);
  igniteFire(target);
  state.aberration = Math.min(0.5, state.aberration + 0.25);
  return target;
}

function slowFactor(t) {
  if (t < T.slam || t > T.slowEnd) return 1;
  return 0.28 + 0.72 * smooth(T.slam + 0.15, T.slowEnd, t);
}

/* ---------------------------------------------------------------- scene build */

function buildSky() {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(5200, 32, 24),
    new THREE.MeshBasicMaterial({
      map: skyTexture(),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    })
  );
  scene.add(sphere);
}

function buildGround() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(70, 90, 130, 0.30)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(0, i * 64);
    g.lineTo(256, i * 64);
    g.stroke();
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, 256);
    g.stroke();
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255, ${Math.floor(rnd(170, 220))}, ${Math.floor(rnd(110, 160))}, ${rnd(0.1, 0.4)})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 26);
  tex.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5600, 5600),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0x8fb4ff,
      emissiveIntensity: 0.14,
      color: 0x121722,
      roughness: 0.85,
      metalness: 0.1,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}

function buildingMaterial(tex) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffcf9a,
    emissiveIntensity: 1.45,
    color: 0x101728,
    roughness: 0.72,
    metalness: 0.4,
  });
}

function scaleBoxUV(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const module = 70;
  for (let f = 0; f < 6; f++) {
    const ru = faces[f][0] / module;
    const rv = faces[f][1] / module;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * ru, uv.getY(idx) * rv);
    }
  }
  uv.needsUpdate = true;
}

function buildCity() {
  const mat = buildingMaterial(windowTexture());
  const signTex = glyphTexture('67', 512, '#ff9f0a', '#ff4d00');

  function addBuilding(x, z, w, d, h, withSign) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = h / 2;
    group.add(mesh);

    if (h > 200 && Math.random() < 0.45) {
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(4, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2b3d, toneMapped: false })
      );
      beacon.position.y = h + 6;
      group.add(beacon);
    }

    if (withSign && Math.random() < 0.22) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(58, 36),
        new THREE.MeshBasicMaterial({
          map: signTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      sign.position.set(0, h * rnd(0.55, 0.8), d / 2 + 2);
      group.add(sign);
    }

    scene.add(group);
    state.city.push({
      group,
      w,
      d,
      h,
      toppled: false,
      tilt: 0,
      speed: 0,
      dir: 1,
      axis: Math.random() < 0.5 ? 'x' : 'z',
    });
  }

  for (let gx = -7; gx <= 7; gx++) {
    for (let gz = -7; gz <= 5; gz++) {
      const x = gx * 228 + rnd(-44, 44);
      const z = gz * 228 + rnd(-44, 44);
      if (Math.hypot(x, z) < 520) continue;
      if (Math.random() < 0.12) continue;
      const far = clamp(Math.hypot(x, z) / 1350, 0, 1);
      addBuilding(
        x,
        z,
        rnd(50, 100),
        rnd(50, 100),
        rnd(50, 145) + far * rnd(60, 230),
        true
      );
    }
  }

  // downtown towers looming behind the giant
  for (let i = 0; i < 9; i++) {
    const angle = rnd(-Math.PI * 0.92, -Math.PI * 0.08);
    const dist = rnd(720, 1350);
    addBuilding(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist,
      rnd(70, 130),
      rnd(70, 130),
      rnd(280, 520),
      false
    );
  }

  // foreground towers inside the plaza, so the giant has something underfoot
  [
    [430, 300, 92, 84, 205],
    [640, 520, 96, 90, 240],
    [-560, 480, 100, 94, 250],
    [700, -330, 88, 84, 190],
    [-660, -470, 96, 96, 235],
    [330, -640, 84, 86, 160],
  ].forEach(([x, z, w, d, h]) => addBuilding(x, z, w, d, h, true));
}

function buildKid() {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8c2ad, roughness: 0.85, flatShading: true });
  const hoodie = new THREE.MeshStandardMaterial({ color: 0x1b2244, roughness: 0.92, flatShading: true });
  const pants = new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.95, flatShading: true });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x080a12, roughness: 0.7, flatShading: true });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe8edf7, roughness: 0.55, flatShading: true });

  for (const sx of [-84, 84]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(54, 190, 6, 14), pants);
    leg.position.set(sx, 150, 0);
    root.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(122, 54, 168), shoeMat);
    shoe.position.set(sx, 32, 30);
    root.add(shoe);
  }

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(118, 180, 8, 18), hoodie);
  torso.position.set(0, 512, 0);
  root.add(torso);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(96, 30, 10, 26), hoodie);
  collar.position.set(0, 690, 8);
  collar.rotation.x = Math.PI / 2;
  root.add(collar);

  const head = new THREE.Group();
  head.position.set(0, 848, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(122, 26, 20), skin);
  skull.scale.set(1, 0.96, 0.96);
  head.add(skull);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(127, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hairMat
  );
  hair.position.y = 8;
  head.add(hair);

  const hood = new THREE.Mesh(new THREE.SphereGeometry(150, 20, 16), hoodie);
  hood.position.set(0, 826, -46);
  hood.scale.set(1.02, 0.9, 0.78);
  root.add(hood);

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffe6b0,
    emissive: 0xffa21f,
    emissiveIntensity: 3,
    toneMapped: false,
  });
  for (const ex of [-52, 52]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(23, 16, 12), eyeMat);
    eye.position.set(ex, 4, 106);
    eye.scale.set(1, 1.3, 0.6);
    head.add(eye);
  }
  root.add(head);

  const arms = {};
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 184, 636, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(56, 240, 6, 14), hoodie);
    upper.position.y = -160;
    pivot.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(66, 18, 14), skin);
    hand.position.y = -320;
    pivot.add(hand);
    root.add(pivot);
    arms[side === -1 ? 'left' : 'right'] = pivot;
  }
  arms.left.rotation.z = 0.12;
  arms.right.rotation.z = -0.12;

  // chest number
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 106),
    new THREE.MeshBasicMaterial({
      map: glyphTexture('67', 512, '#ffcf8a', '#ff7a00'),
      transparent: true,
      opacity: 1,
      blending: THREE.NormalBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  badge.position.set(0, 552, 120);
  root.add(badge);

  const handLight = new THREE.PointLight(0xffb347, 0, 2200, 2);
  handLight.position.set(0, -300, 0);
  arms.right.add(handLight);

  const eyeLight = new THREE.PointLight(0xffb347, 0.9, 1200, 2);
  eyeLight.position.set(0, 848, 150);
  root.add(eyeLight);

  scene.add(root);
  state.kid = { root, head, torso, arms, badge, eyeMat };
  state.handLight = handLight;
  state.eyeLight = eyeLight;
  state.eyeMat = eyeMat;
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x223258, 0x070910, 0.65));

  const key = new THREE.DirectionalLight(0xbcd2ff, 1.9);
  key.position.set(-700, 1200, 900);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xff6a1e, 2.1);
  rim.position.set(650, 520, -1000);
  scene.add(rim);

  const rim2 = new THREE.DirectionalLight(0x8fc4ff, 0.9);
  rim2.position.set(-950, 700, -700);
  scene.add(rim2);

  for (let i = 0; i < 3; i++) {
    const light = new THREE.PointLight(0xcfe4ff, 0, 3200, 2);
    scene.add(light);
    state.flashLights.push({ light, intensity: 0, decay: 6 });
  }
}

/* ---------------------------------------------------------------- bolts */

function boltPolyline(start, end, detail, roughness) {
  let pts = [start.clone(), end.clone()];
  let rough = roughness;
  for (let k = 0; k < detail; k++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      mid.x += rnd(-len, len) * rough;
      mid.y += rnd(-len, len) * rough * 0.5;
      mid.z += rnd(-len, len) * rough;
      next.push(a, mid);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    rough *= 0.62;
  }
  return pts;
}

function addBolt(points, width, color, life) {
  state.strikes.push({
    points,
    width,
    color,
    born: elapsed,
    life: life === undefined ? 0.5 : life,
  });
}

function strikeSky() {
  for (let i = 0; i < 3; i++) {
    const x = rnd(-700, 700);
    const z = rnd(-900, -300);
    addBolt(
      boltPolyline(
        new THREE.Vector3(x + rnd(-200, 200), 2600, z + rnd(-200, 200)),
        new THREE.Vector3(x, rnd(150, 500), z),
        6,
        0.2
      ),
      rnd(12, 22),
      new THREE.Color(1.6, 2.2, 3.4),
      0.65
    );
  }
}

function groundStrike(x, z, height) {
  const top = new THREE.Vector3(x, height || 120, z);
  const sky = new THREE.Vector3(x + rnd(-260, 260), 2500, z + rnd(-320, 320));
  const main = boltPolyline(sky, top, 7, 0.19);
  addBolt(main, rnd(15, 26), new THREE.Color(1.8, 2.4, 3.6), 0.5);

  for (let i = 0; i < 3; i++) {
    const origin = main[Math.floor(rnd(2, main.length - 3))];
    const fork = boltPolyline(
      origin,
      new THREE.Vector3(origin.x + rnd(-320, 320), origin.y - rnd(120, 460), origin.z + rnd(-320, 320)),
      4,
      0.26
    );
    addBolt(fork, rnd(8, 15), new THREE.Color(1.3, 1.8, 2.9), 0.36);
  }

  explode(new THREE.Vector3(x, 50, z), 1.0);
  addShake(0.55);
}

function digitPaths() {
  const cz = -980;
  const paths = [];

  // "6" — loop plus an ascender
  const cx = -420;
  const cy = 1490;
  const r = 260;
  const six = [];
  for (let i = 0; i <= 44; i++) {
    const a = -Math.PI * 0.28 + (i / 44) * Math.PI * 1.92;
    six.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.08, cz));
  }
  const tail = [];
  const start = six[0];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    tail.push(new THREE.Vector3(
      start.x - r * 1.05 * t + r * 0.28 * t * t,
      start.y + r * 1.0 * t,
      cz
    ));
  }
  paths.push(tail.reverse().concat(six));

  // "7" — bar then diagonal
  const sx = 380;
  const sy = 1740;
  const w = 460;
  const h = 600;
  const seven = [];
  for (let i = 0; i <= 10; i++) {
    seven.push(new THREE.Vector3(sx - w / 2 + (w * i) / 10, sy + Math.sin((i / 10) * Math.PI) * 16, cz));
  }
  for (let i = 1; i <= 14; i++) {
    seven.push(new THREE.Vector3(sx + w / 2 - (w * 0.92) * (i / 14), sy - h * (i / 14), cz));
  }
  paths.push(seven);

  return paths;
}

function showSky67() {
  const group = new THREE.Group();
  digitPaths().forEach((path) => {
    const pts = path.map((p) => p.clone().add(new THREE.Vector3(rnd(-14, 14), rnd(-14, 14), rnd(-8, 8))));
    state.strikes.push({
      points: pts,
      width: 15,
      color: new THREE.Color(1.3, 1.8, 2.9),
      born: elapsed,
      life: Infinity,
    });
  });

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1300, 560),
    new THREE.MeshBasicMaterial({
      map: glyphTexture('67', 1024, '#dff0ff', '#3aa0ff'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  glow.position.set(0, 1600, -1010);
  scene.add(glow);

  for (let i = 0; i < 4; i++) {
    const x = rnd(-900, 900);
    addBolt(
      boltPolyline(
        new THREE.Vector3(x + rnd(-200, 200), 2600, rnd(-1100, -500)),
        new THREE.Vector3(x, rnd(300, 700), rnd(-1100, -500)),
        6,
        0.2
      ),
      rnd(10, 16),
      new THREE.Color(1.4, 1.9, 3.0),
      0.6
    );
  }

  state.skyGroup = group;
  state.skyGlow = glow;
}

/* ---------------------------------------------------------------- particles */

const DEBRIS_MAX = 280;
const SPARK_MAX = 1100;
const DUST_MAX = 320;

function buildParticles() {
  const dummy = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2b3140, roughness: 0.9, flatShading: true }),
    DEBRIS_MAX
  );
  mesh.frustumCulled = false;
  scene.add(mesh);
  const items = [];
  for (let i = 0; i < DEBRIS_MAX; i++) {
    items.push({
      alive: false,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      r: new THREE.Vector3(),
      rv: new THREE.Vector3(),
      s: 1,
      life: 0,
    });
    dummy.position.set(0, -5000, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  state.debris = { mesh, items, dummy, cursor: 0 };

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_MAX * 3);
  const sparkCol = new Float32Array(SPARK_MAX * 3);
  for (let i = 0; i < SPARK_MAX; i++) sparkPos[i * 3 + 1] = -9000;
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkPts = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      size: 22,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  sparkPts.frustumCulled = false;
  scene.add(sparkPts);
  state.sparks = {
    points: sparkPts,
    pos: sparkPos,
    col: sparkCol,
    vel: new Float32Array(SPARK_MAX * 3),
    life: new Float32Array(SPARK_MAX),
    max: SPARK_MAX,
    cursor: 0,
  };

  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_MAX * 3);
  const dustCol = new Float32Array(DUST_MAX * 3);
  for (let i = 0; i < DUST_MAX; i++) dustPos[i * 3 + 1] = -9000;
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustPts = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 190,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  dustPts.frustumCulled = false;
  scene.add(dustPts);
  state.dust = {
    points: dustPts,
    pos: dustPos,
    col: dustCol,
    vel: new Float32Array(DUST_MAX * 3),
    life: new Float32Array(DUST_MAX),
    max: DUST_MAX,
    cursor: 0,
  };

  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1.06, 96),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    state.rings.push({ mesh: ring, age: 0, active: false, radius: 100, speed: 400 });
  }
}

function spawnDebris(pos, count, power) {
  const d = state.debris;
  for (let i = 0; i < count; i++) {
    const item = d.items[d.cursor];
    d.cursor = (d.cursor + 1) % DEBRIS_MAX;
    item.alive = true;
    item.p.copy(pos).add(new THREE.Vector3(rnd(-60, 60), rnd(-40, 40), rnd(-60, 60)));
    item.v.set(rnd(-1, 1) * 260 * power, rnd(0.3, 1.4) * 300 * power, rnd(-1, 1) * 260 * power);
    item.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    item.rv.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
    item.s = rnd(12, 46) * power;
    item.life = rnd(2.2, 4.2);
  }
}

function spawnSparks(pos, count, power) {
  const s = state.sparks;
  for (let i = 0; i < count; i++) {
    const idx = s.cursor;
    s.cursor = (s.cursor + 1) % s.max;
    s.pos[idx * 3] = pos.x + rnd(-40, 40);
    s.pos[idx * 3 + 1] = pos.y + rnd(-30, 30);
    s.pos[idx * 3 + 2] = pos.z + rnd(-40, 40);
    s.vel[idx * 3] = rnd(-1, 1) * 420 * power;
    s.vel[idx * 3 + 1] = rnd(0.2, 1.5) * 460 * power;
    s.vel[idx * 3 + 2] = rnd(-1, 1) * 420 * power;
    s.life[idx] = rnd(0.5, 1.5);
    const warm = Math.random() > 0.3;
    s.col[idx * 3] = warm ? 1 : 0.6;
    s.col[idx * 3 + 1] = warm ? rnd(0.45, 0.8) : 0.85;
    s.col[idx * 3 + 2] = warm ? 0.2 : 1.2;
  }
}

function spawnDust(pos, count, power) {
  const d = state.dust;
  for (let i = 0; i < count; i++) {
    const idx = d.cursor;
    d.cursor = (d.cursor + 1) % d.max;
    d.pos[idx * 3] = pos.x + rnd(-90, 90);
    d.pos[idx * 3 + 1] = pos.y + rnd(-20, 90);
    d.pos[idx * 3 + 2] = pos.z + rnd(-90, 90);
    d.vel[idx * 3] = rnd(-1, 1) * 110 * power;
    d.vel[idx * 3 + 1] = rnd(20, 130) * power;
    d.vel[idx * 3 + 2] = rnd(-1, 1) * 110 * power;
    d.life[idx] = rnd(1.6, 3.2);
    const shade = rnd(0.12, 0.3);
    d.col[idx * 3] = shade;
    d.col[idx * 3 + 1] = shade * 1.05;
    d.col[idx * 3 + 2] = shade * 1.3;
  }
}

function flashAt(pos, power, color) {
  let best = state.flashLights[0];
  for (const f of state.flashLights) if (f.intensity < best.intensity) best = f;
  best.light.position.copy(pos);
  best.light.color.setHex(color || 0xcfe4ff);
  best.intensity = 5 * power;
  state.flashLevel = Math.min(1.4, state.flashLevel + 0.32 * power);

  if (state.glows) {
    const glow = state.glows.find((g) => g.life <= 0);
    if (glow) {
      glow.sprite.position.copy(pos);
      glow.sprite.visible = true;
      glow.sprite.material.color.setHex(color || 0xbfe4ff);
      glow.sprite.material.opacity = 0.95;
      glow.size = 380 * power;
      glow.sprite.scale.setScalar(glow.size);
      glow.max = 0.45;
      glow.life = 0.45;
    }
  }
}

function spawnFire(pos, power) {
  const f = state.fire.find((x) => x.life <= 0);
  if (!f) return;
  f.sprite.position.copy(pos);
  f.sprite.visible = true;
  f.sprite.material.opacity = 0.85;
  f.base = 118 * power;
  f.sprite.scale.setScalar(f.base);
  f.max = 0.7;
  f.life = 0.7;
}

function explode(pos, power) {
  spawnDebris(pos, Math.round(16 * power), power);
  spawnSparks(pos, Math.round(60 * power), power);
  spawnDust(pos, Math.round(18 * power), power);
  flashAt(pos, power, power > 1.4 ? 0xffa050 : 0xbfe4ff);
  if (power > 0.9) spawnFire(pos, power);
  state.aberration = Math.min(0.55, state.aberration + 0.2 * power);
}

function addShake(v) {
  state.shake = Math.min(2.4, Math.max(state.shake, v));
}

function shockwave(pos, radius, speed) {
  const ring = state.rings.find((r) => !r.active) || state.rings[0];
  ring.active = true;
  ring.age = 0;
  ring.radius = radius;
  ring.speed = speed;
  ring.mesh.position.copy(pos);
  ring.mesh.position.y = 6;
  ring.mesh.visible = true;
  ring.mesh.scale.setScalar(radius * 0.1);
  ring.mesh.material.opacity = 0.9;
}

/* ---------------------------------------------------------------- build */

function build() {
  if (built) return;
  canvas = document.getElementById('csCanvas');
  if (!canvas) return;

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BASE_FOG.getHex(), 0.0004);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 12000);
  camera.position.set(0, 760, 1450);
  camera.lookAt(0, 470, 0);

  composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.62,
    0.55,
    0.78
  );
  composer.addPass(bloom);
  state.fxPass = new ShaderPass(FX_SHADER);
  composer.addPass(state.fxPass);
  composer.addPass(new OutputPass());

  buildSky();
  buildGround();
  buildCity();
  buildKid();
  buildKidFx();
  buildCrater();
  buildFires();
  buildLights();
  buildParticles();
  buildGlows();
  buildRain();

  window.addEventListener('resize', resize);
  built = true;

  try {
    renderer.compile(scene, camera);
  } catch (e) {
    /* older drivers — ignore */
  }
}

function resize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}

/* ---------------------------------------------------------------- reset */

function resetScene() {
  elapsed = 0;
  ended = false;
  state.shake = 0;
  state.flashLevel = 0;
  state.fovPunch = 0;
  state.strikes.length = 0;
  Object.keys(fired).forEach((k) => delete fired[k]);

  state.city.forEach((b) => {
    b.toppled = false;
    b.tilt = 0;
    b.speed = 0;
    b.group.rotation.set(0, 0, 0);
    b.group.scale.y = 1;
    b.crushed = false;
    b.ignited = false;
  });

  if (state.crater) {
    state.crater.group.visible = false;
    state.crater.glow = 0;
    state.crater.ring.material.opacity = 0;
    state.crater.cracks.forEach((k) => { k.mesh.material.opacity = 0; });
  }
  state.fireCols.forEach((f) => {
    f.life = 0;
    f.sprite.visible = false;
    f.sprite.material.opacity = 0;
  });

  state.fire.forEach((f) => {
    f.life = 0;
    f.sprite.visible = false;
    f.sprite.material.opacity = 0;
  });
  state.aberration = 0;
  if (state.aura) state.aura.material.opacity = 0.02;
  if (state.charge) {
    state.charge.material.opacity = 0;
    state.charge.scale.setScalar(0.01);
  }
  state.chargeRing.forEach((ring) => { ring.material.opacity = 0; });

  state.debris.items.forEach((item) => { item.alive = false; });
  state.debris.mesh.instanceMatrix.needsUpdate = true;
  state.sparks.life.fill(0);
  state.sparks.pos.fill(-9000);
  state.dust.life.fill(0);
  state.dust.pos.fill(-9000);

  state.rings.forEach((r) => {
    r.active = false;
    r.mesh.visible = false;
    r.mesh.material.opacity = 0;
  });
  state.flashLights.forEach((f) => { f.intensity = 0; f.light.intensity = 0; });
  if (state.glows) {
    state.glows.forEach((g) => {
      g.life = 0;
      g.sprite.visible = false;
      g.sprite.material.opacity = 0;
    });
  }

  if (state.skyGroup) {
    scene.remove(state.skyGroup);
    state.skyGroup = null;
  }
  if (state.skyGlow) {
    scene.remove(state.skyGlow);
    state.skyGlow = null;
  }

  const kid = state.kid;
  kid.root.rotation.set(0, 0, 0);
  kid.torso.scale.set(1, 1, 1);
  kid.head.rotation.set(0, 0, 0);
  kid.arms.right.rotation.set(0.05, 0, -0.12);
  kid.arms.left.rotation.set(0.05, 0, 0.12);
  state.handLight.intensity = 0;
  state.eyeMat.emissiveIntensity = 3;
  state.eyeLight.intensity = 0.9;
  state.fovPunch = 0;
  if (camera) {
    camera.fov = 60;
    camera.updateProjectionMatrix();
    camera.position.set(0, 760, 1450);
    camera.lookAt(0, 470, 0);
  }
  if (scene) scene.fog.color.copy(BASE_FOG);
}

/* ---------------------------------------------------------------- update */

function once(key, fn) {
  if (fired[key]) return;
  fired[key] = true;
  fn();
}

function sampleCam(t) {
  let i = 0;
  while (i < CAM.length - 2 && t > CAM[i + 1].t) i++;
  const a = CAM[i];
  const b = CAM[i + 1];
  const k = smooth(a.t, b.t, t);
  return {
    p: [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)],
    l: [lerp(a.l[0], b.l[0], k), lerp(a.l[1], b.l[1], k), lerp(a.l[2], b.l[2], k)],
  };
}

function topple(b, force) {
  if (b.toppled) return;
  b.toppled = true;
  b.axis = Math.random() < 0.5 ? 'x' : 'z';
  b.dir = Math.random() < 0.5 ? 1 : -1;
  b.speed = rnd(0.7, 1.9) * force;
}

function toppleNear(pos, radius, force) {
  state.city.forEach((b) => {
    if (b.toppled) return;
    if (b.group.position.distanceTo(pos) < radius) {
      if (Math.random() < 0.85) topple(b, force);
    }
  });
}

function updateRain(dt) {
  const r = state.rain;
  if (!r) return;
  const pos = r.pos;
  for (let i = 0; i < r.count; i++) {
    pos[i * 3 + 1] -= r.vel[i] * dt;
    pos[i * 3] += dt * 90;
    if (pos[i * 3 + 1] < 0) {
      pos[i * 3 + 1] = 1700;
      pos[i * 3] = rnd(-1300, 1300);
      pos[i * 3 + 2] = rnd(-1300, 1300);
    }
  }
  r.points.geometry.attributes.position.needsUpdate = true;
}

function updateFire(dt) {
  state.fire.forEach((f) => {
    if (f.life <= 0) return;
    f.life -= dt;
    const k = Math.max(0, f.life / f.max);
    f.sprite.material.opacity = k * 0.8;
    f.sprite.scale.setScalar(f.base * (1.5 - k * 0.5));
    if (f.life <= 0) f.sprite.visible = false;
  });

  // burning ruins keep flickering until the cutscene ends
  state.fireCols.forEach((f) => {
    if (f.life <= 0) return;
    f.life -= dt;
    const flick = 0.72 + Math.sin(elapsed * 7 + f.phase) * 0.16 + Math.sin(elapsed * 13.7 + f.phase * 2) * 0.1;
    f.sprite.material.opacity = clamp(flick, 0, 1) * 0.85;
    f.sprite.scale.set(f.base * 0.55 * flick, f.base * (0.9 + flick * 0.3), 1);
    if (f.life <= 0) f.sprite.visible = false;
  });

  const c = state.crater;
  if (c && c.group.visible) {
    c.glow = Math.max(0, c.glow - dt * 0.18);
    const pulse = 0.45 + Math.sin(elapsed * 5.1) * 0.12 + c.glow * 0.6;
    c.ring.material.opacity = clamp(pulse * 0.8, 0, 1);
    c.cracks.forEach((k) => {
      k.mesh.material.opacity = clamp(0.28 + Math.sin(elapsed * 6.3 + k.phase) * 0.16 + c.glow * 0.5, 0, 1);
      k.mesh.scale.x = k.base * (0.9 + Math.sin(elapsed * 4 + k.phase) * 0.08);
    });
  }
}

function kidPose(t) {
  const kid = state.kid;
  const up = smooth(T.armUp, T.armUp + 0.95, t);
  const down = smooth(T.slam, T.slam + 0.22, t);
  const settle = smooth(T.slam + 0.22, T.slam + 1.0, t);

  let angle;
  if (t < T.slam) {
    angle = lerp(0.05, -2.55, easeOut(up));
    if (up > 0.4) angle += Math.sin(t * 46) * 0.03;
  } else {
    angle = lerp(-2.55, 0.32, easeOut(down));
    angle = lerp(angle, 0.12, settle);
  }
  kid.arms.right.rotation.x = angle;
  kid.arms.right.rotation.z = -0.12 + Math.sin(t * 1.7) * 0.03;
  kid.arms.left.rotation.x = 0.05 + Math.sin(t * 1.3) * 0.05;

  // the step at T.strike lands with the whole body
  const stomp = t > T.strike && t < T.strike + 0.6
    ? Math.sin(((t - T.strike) / 0.6) * Math.PI)
    : 0;
  kid.root.rotation.z = Math.sin(t * 0.9) * 0.006 - stomp * 0.02;
  kid.root.position.y = Math.sin(t * 1.4) * 3 - stomp * 46;
  kid.torso.scale.set(1 + Math.sin(t * 1.4) * 0.006, 1 + Math.sin(t * 1.4) * 0.008, 1);
  kid.head.rotation.y = Math.sin(t * 0.8) * 0.07;
  kid.head.rotation.x = smooth(T.slam + 0.1, T.slam + 0.5, t) * -0.18;

  // charge crackle
  const charging = smooth(T.charge, T.charge + 0.2, t) * (1 - smooth(T.slam, T.slam + 0.1, t));
  state.handLight.intensity = charging * (3.5 + Math.random() * 3);

  if (state.charge) {
    const burst = t > T.slam && t < T.slam + 0.25 ? 2.2 : 0;
    state.charge.scale.setScalar(0.05 + charging * 1.5 + burst);
    state.charge.material.opacity = Math.max(charging * 0.95, burst * 0.3);
  }
  state.chargeRing.forEach((ring, i) => {
    ring.material.opacity = charging * (0.75 - i * 0.16);
    ring.rotation.z += 0.09 + i * 0.05;
    ring.rotation.x = Math.PI / 2 + Math.sin(t * 3 + i * 1.7) * 0.35;
    ring.scale.setScalar(0.55 + charging * (0.7 + i * 0.25));
  });
  if (state.aura) {
    const pulse = 1 + Math.sin(t * 2.2) * 0.03;
    state.aura.scale.setScalar(pulse + charging * 0.06);
    state.aura.material.opacity = 0.02 + charging * 0.055 + (t > T.final ? 0.05 : 0);
  }
  if (charging > 0.3 && Math.random() < 0.28) {
    const handPos = new THREE.Vector3();
    kid.arms.right.children[1].getWorldPosition(handPos);
    const tip = handPos.clone().add(new THREE.Vector3(rnd(-160, 160), rnd(-120, 240), rnd(-160, 160)));
    addBolt(boltPolyline(handPos, tip, 3, 0.34), rnd(7, 12), new THREE.Color(2.2, 1.3, 2.4), 0.12);
  }

  state.eyeMat.emissiveIntensity = 3 + Math.sin(t * 6) * 0.7 + (t > T.final ? 1.6 : 0);
}

function updateWorld(dt, t) {
  // timeline beats
  once('reveal', () => {});
  if (t >= T.reveal) once('revealBolt', () => {
    strikeSky();
    state.flashLevel = 0.85;
    thunder(0.75, 0.15);
    if (onEvent) onEvent('flash');
  });

  if (t >= T.strike) once('strike', () => {
    const b = crushNearest();
    const pos = b ? b.group.position.clone() : new THREE.Vector3(620, 0, 480);
    groundStrike(pos.x, pos.z, b ? b.h : 180);
    explode(new THREE.Vector3(pos.x, b ? b.h * 0.55 : 90, pos.z), 1.9);
    toppleNear(pos, 460, 1.1);
    addShake(1.2);
    state.fovPunch = 0.5;
    state.flashLevel = 1.3;
    thunder(1, 0);
    boom();
    if (onEvent) onEvent('flash');
  });

  if (t >= T.charge) {
    once('zap1', () => { zap(); });
    once('zap2', () => { zap(0.12); });
  }

  if (t >= T.slam) once('slam', () => {
    shockwave(new THREE.Vector3(0, 0, 80), 900, 1500);
    toppleNear(new THREE.Vector3(0, 0, 0), 1500, 1.6);
    const impact = new THREE.Vector3(0, 20, 0);
    explode(impact, 2.6);
    spawnDebris(impact, 110, 2.2);
    spawnSparks(impact, 420, 2.2);
    spawnDust(impact, 160, 2.2);
    addShake(1.8);
    state.flashLevel = 1.6;
    state.fovPunch = 1;
    if (state.crater) {
      state.crater.group.visible = true;
      state.crater.glow = 1;
    }
    // everything close enough catches fire
    state.city.forEach((b) => {
      if (b.toppled && b.group.position.length() < 900) igniteFire(b);
    });
    score.muffle(0.9);
    boom();
    thunder(0.9, 0.05);
    roar();
    if (onEvent) onEvent('bigflash');
  });

  if (t >= T.slowEnd) once('slowEnd', () => {
    score.muffle(0);
    addShake(0.55);
    spawnDust(new THREE.Vector3(0, 20, 0), 60, 1.2);
    thunder(0.45, 0.05);
    if (onEvent) onEvent('flash');
  });

  if (t >= T.storm) once('storm1', () => {
    const targets = state.city.filter((b) => !b.toppled).slice(0, 60);
    for (let i = 0; i < 2; i++) {
      const b = targets[Math.floor(Math.random() * targets.length)];
      if (!b) continue;
      groundStrike(b.group.position.x, b.group.position.z, b.h);
      topple(b, 1.3);
      toppleNear(b.group.position, 300, 1.2);
    }
    thunder(0.8, 0);
    zap();
    addShake(0.8);
    if (onEvent) onEvent('flash');
  });

  if (t >= T.storm2) once('storm2', () => {
    for (let i = 0; i < 3; i++) {
      const b = state.city[Math.floor(Math.random() * state.city.length)];
      if (!b) continue;
      groundStrike(b.group.position.x, b.group.position.z, b.h);
      topple(b, 1.5);
    }
    toppleNear(new THREE.Vector3(rnd(-500, 500), 0, rnd(-500, 500)), 620, 1.4);
    thunder(0.9, 0);
    addShake(1.0);
    if (onEvent) onEvent('flash');
  });

  if (t >= T.final) once('final', () => {
    score.muffle(0);
    addBolt(
      boltPolyline(
        new THREE.Vector3(rnd(-200, 200), 3200, -900),
        new THREE.Vector3(0, 420, -900),
        8,
        0.16
      ),
      46,
      new THREE.Color(2.6, 3.2, 4.4),
      0.9
    );
    addShake(1.5);
    state.aberration = 0.65;
    pad();
    showSky67();
    state.flashLevel = 1.8;
    addShake(0.9);
    thunder(1, 0);
    finalChord();
    if (onEvent) onEvent('bigflash');
  });

  // slow motion stretches every physical body, not the story clock
  const pdt = dt * slowFactor(t);

  // city collapse
  state.city.forEach((b) => {
    if (!b.toppled) return;
    if (b.tilt < Math.PI / 2) {
      b.tilt = Math.min(Math.PI / 2, b.tilt + b.speed * pdt);
      const axis = b.axis === 'x' ? 'x' : 'z';
      b.group.rotation[axis] = b.tilt * b.dir;
      if (Math.random() < 0.25) {
        const top = b.group.position.clone();
        top.y = b.h * 0.4;
        spawnDust(top, 1, 0.5);
      }
    } else if (b.group.position.y > -b.h * 0.55) {
      b.group.position.y -= pdt * 26;
      if (!b.ignited) {
        b.ignited = true;
        igniteFire(b);
      }
    }
  });

  // debris
  const d = state.debris;
  d.items.forEach((item, i) => {
    if (!item.alive) return;
    item.life -= dt;
    if (item.life <= 0) {
      item.alive = false;
      d.dummy.position.set(0, -5000, 0);
      d.dummy.scale.setScalar(0.0001);
      d.dummy.updateMatrix();
      d.mesh.setMatrixAt(i, d.dummy.matrix);
      return;
    }
    item.v.y -= 520 * pdt;
    item.p.addScaledVector(item.v, pdt);
    if (item.p.y < 6) {
      item.p.y = 6;
      item.v.y *= -0.32;
      item.v.x *= 0.6;
      item.v.z *= 0.6;
    }
    item.r.addScaledVector(item.rv, pdt);
    d.dummy.position.copy(item.p);
    d.dummy.rotation.set(item.r.x, item.r.y, item.r.z);
    d.dummy.scale.setScalar(item.s * Math.min(1, item.life));
    d.dummy.updateMatrix();
    d.mesh.setMatrixAt(i, d.dummy.matrix);
  });
  d.mesh.instanceMatrix.needsUpdate = true;

  // sparks
  const s = state.sparks;
  for (let i = 0; i < s.max; i++) {
    if (s.life[i] <= 0) continue;
    s.life[i] -= dt;
    if (s.life[i] <= 0) {
      s.pos[i * 3 + 1] = -9000;
      continue;
    }
    s.vel[i * 3 + 1] -= 620 * pdt;
    s.pos[i * 3] += s.vel[i * 3] * pdt;
    s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * pdt;
    s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * pdt;
    const k = Math.min(1, s.life[i] * 1.6);
    s.col[i * 3] *= 0.994;
    s.col[i * 3 + 1] *= 0.994;
    s.col[i * 3 + 2] *= 0.994;
    if (k < 0.2) s.pos[i * 3 + 1] = -9000;
  }
  s.points.geometry.attributes.position.needsUpdate = true;
  s.points.geometry.attributes.color.needsUpdate = true;

  // dust
  const du = state.dust;
  for (let i = 0; i < du.max; i++) {
    if (du.life[i] <= 0) continue;
    du.life[i] -= dt;
    if (du.life[i] <= 0) {
      du.pos[i * 3 + 1] = -9000;
      continue;
    }
    du.vel[i * 3 + 1] += 26 * pdt;
    du.pos[i * 3] += du.vel[i * 3] * pdt;
    du.pos[i * 3 + 1] += du.vel[i * 3 + 1] * pdt;
    du.pos[i * 3 + 2] += du.vel[i * 3 + 2] * pdt;
    const f = Math.min(1, du.life[i] * 0.9);
    du.col[i * 3] *= f > 0.5 ? 1 : 0.985;
  }
  du.points.geometry.attributes.position.needsUpdate = true;
  du.points.geometry.attributes.color.needsUpdate = true;

  // rings
  state.rings.forEach((r) => {
    if (!r.active) return;
    r.age += dt;
    const scale = r.radius * (0.1 + r.age * r.speed / 1000);
    r.mesh.scale.setScalar(scale);
    r.mesh.material.opacity = Math.max(0, 0.85 - r.age * 1.1);
    if (r.mesh.material.opacity <= 0) {
      r.active = false;
      r.mesh.visible = false;
    }
  });

  // flash lights decay
  state.flashLights.forEach((f) => {
    f.intensity = Math.max(0, f.intensity - dt * 14);
    f.light.intensity = f.intensity;
  });

  if (state.glows) {
    state.glows.forEach((g) => {
      if (g.life <= 0) return;
      g.life -= dt;
      const k = Math.max(0, g.life / g.max);
      g.sprite.material.opacity = k * 0.95;
      g.sprite.scale.setScalar(g.size * (1.7 - k * 0.7));
      if (g.life <= 0) g.sprite.visible = false;
    });
  }

  state.flashLevel = Math.max(0, state.flashLevel - dt * 2.4);

  const fogBoost = state.flashLevel * 0.28;
  scene.fog.color.copy(BASE_FOG).lerp(new THREE.Color(0x6d86c9), Math.min(0.45, fogBoost));
  scene.fog.density = 0.0004 + state.flashLevel * 0.00003;

  if (state.skyGlow) {
    state.skyGlow.material.opacity = Math.min(0.45, (state.skyGlow.material.opacity + dt * 1.2));
    state.skyGlow.material.opacity *= 0.98 + 0.02 * Math.sin(t * 22);
  }

  // bolts
  state.strikes = state.strikes.filter((b) => b.life === Infinity || t - b.born < b.life);
  rebuildBolts();

  kidPose(t);
  updateRain(dt);
  updateFire(dt);

  // camera
  const cam = sampleCam(t);
  const shake = state.shake;
  state.shake = Math.max(0, shake - dt * 3.4);
  const sx = (Math.random() - 0.5) * shake * 26 + Math.sin(t * 0.9) * 4;
  const sy = (Math.random() - 0.5) * shake * 26 + Math.cos(t * 1.15) * 3;
  const sz = (Math.random() - 0.5) * shake * 18;

  camera.position.set(cam.p[0] + sx, cam.p[1] + sy, cam.p[2] + sz);
  camera.lookAt(cam.l[0] + sx * 0.4, cam.l[1] + sy * 0.4, cam.l[2]);

  const impactRoll = t > T.slam ? Math.max(0, 1 - (t - T.slam) * 1.6) * 0.1 : 0;
  const roll = Math.sin(t * 0.8) * 0.008 + impactRoll - (t > T.final ? 0.045 : 0);
  camera.rotation.z += roll;

  const targetFov = 60 - state.fovPunch * 9 + (t > T.slam ? (1 - smooth(T.slam, T.slam + 1.2, t)) * 8 : 0);
  state.fovPunch = Math.max(0, state.fovPunch - dt * 3);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();

  if (bloom) {
    bloom.strength = 0.62 + state.flashLevel * 0.24 + (t > T.final ? 0.1 : 0);
  }

  state.aberration = Math.max(0, state.aberration - dt * 1.9);
  if (state.fxPass) {
    state.fxPass.uniforms.uAberration.value = 0.0012 + state.aberration * 0.028;
    state.fxPass.uniforms.uTime.value = t;
  }
}

let lastBolt = -1;

function rebuildBolts() {
  if (!state.strikes.length) {
    if (state.bolt && state.bolt.mesh.visible) {
      state.bolt.mesh.visible = false;
    }
    return;
  }
  if (elapsed - lastBolt < 0.075) return;
  lastBolt = elapsed;

  const positions = [];
  const colors = [];
  const view = new THREE.Vector3();
  const side = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const camPos = camera.position;

  state.strikes.forEach((stroke) => {
    const pts = stroke.points;
    const c = stroke.color;
    const jitter = Math.max(2, stroke.width * 0.25);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      dir.subVectors(b, a);
      if (dir.lengthSq() < 1e-6) continue;
      view.subVectors(camPos, a);
      side.crossVectors(dir, view);
      if (side.lengthSq() < 1e-6) side.set(dir.y, -dir.x, 0);
      side.normalize().multiplyScalar(stroke.width * 0.5);
      const ax = a.x + rnd(-jitter, jitter) * 0.2;
      const ay = a.y + rnd(-jitter, jitter) * 0.2;
      const az = a.z + rnd(-jitter, jitter) * 0.2;
      const bx = b.x + rnd(-jitter, jitter) * 0.2;
      const by = b.y + rnd(-jitter, jitter) * 0.2;
      const bz = b.z + rnd(-jitter, jitter) * 0.2;

      const a1x = ax + side.x, a1y = ay + side.y, a1z = az + side.z;
      const a2x = ax - side.x, a2y = ay - side.y, a2z = az - side.z;
      const b1x = bx + side.x, b1y = by + side.y, b1z = bz + side.z;
      const b2x = bx - side.x, b2y = by - side.y, b2z = bz - side.z;

      positions.push(
        a1x, a1y, a1z, a2x, a2y, a2z, b1x, b1y, b1z,
        a2x, a2y, a2z, b2x, b2y, b2z, b1x, b1y, b1z
      );
      for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
    }
  });

  if (!positions.length) {
    if (state.bolt) state.bolt.mesh.visible = false;
    return;
  }

  if (!state.bolt) {
    const geo = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    mesh.frustumCulled = false;
    scene.add(mesh);
    state.bolt = { mesh, geo };
  }

  const geo = state.bolt.geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  state.bolt.mesh.visible = true;
}

/* ---------------------------------------------------------------- loop */

function frame(now) {
  if (!running) return;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;
  updateWorld(dt, elapsed);
  composer.render();
  if (elapsed >= DURATION) {
    running = false;
    if (!ended) {
      ended = true;
      if (onEnd) onEnd();
    }
    return;
  }
  rafId = requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- api */

function play(options) {
  build();
  if (!renderer) return false;
  onEvent = (options && options.onEvent) || null;
  onEnd = (options && options.onEnd) || null;
  resetScene();
  audioStart();
  running = true;
  lastTime = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
  return true;
}

function stop() {
  running = false;
  cancelAnimationFrame(rafId);
  audioStop();
}

function warm() {
  build();
  if (renderer && !running) {
    // draw one frame off-screen so shaders/warm-up cost is paid early
    updateWorld(0.016, 0);
    composer.render();
  }
}

window.CityScene = { play, stop, warm, duration: DURATION };
window.dispatchEvent(new Event('cityscene-ready'));
