// GARGANTUA — Schwarzschild Black Hole Raytracer
// Fullscreen WebGL2 geodesic raytracer: app orchestration, UI, camera, post.

import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { VERT, SCENE_FRAG, BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG } from './shaders.js';
import { BHAudio } from './audio.js';

// ------------------------------------------------------------------ parameters
// Exactly 21 live parameters. Every one is exposed as a slider and hot-reloads
// into shader uniforms (or the camera) without recompilation.
export const PARAM_DEFS = [
  { k: 'diskInner',  label: 'Disk inner edge (rs)',     min: 1.05, max: 5.0,  step: 0.01,   def: 2.3,   g: 'DISK' },
  { k: 'diskOuter',  label: 'Disk outer edge (rs)',     min: 4.0,  max: 24.0, step: 0.1,    def: 11.0,  g: 'DISK' },
  { k: 'diskBright', label: 'Disk brightness',          min: 0.0,  max: 6.0,  step: 0.01,   def: 1.7,   g: 'DISK' },
  { k: 'diskTemp',   label: 'Disk temperature',         min: 0.2,  max: 2.0,  step: 0.01,   def: 1.0,   g: 'DISK' },
  { k: 'turb',       label: 'Turbulence amount',        min: 0.0,  max: 1.0,  step: 0.01,   def: 0.65,  g: 'DISK' },
  { k: 'turbSpeed',  label: 'Turbulence speed',         min: 0.0,  max: 3.0,  step: 0.01,   def: 1.0,   g: 'DISK' },
  { k: 'diskThick',  label: 'Disk thickness',           min: 0.0,  max: 1.0,  step: 0.01,   def: 0.25,  g: 'DISK' },
  { k: 'doppler',    label: 'Doppler beaming',          min: 0.0,  max: 1.0,  step: 0.01,   def: 1.0,   g: 'RELATIVITY' },
  { k: 'redshift',   label: 'Gravitational redshift',   min: 0.0,  max: 1.0,  step: 0.01,   def: 1.0,   g: 'RELATIVITY' },
  { k: 'beamExp',    label: 'Beaming exponent',         min: 0.0,  max: 4.0,  step: 0.05,   def: 2.6,   g: 'RELATIVITY' },
  { k: 'photonGlow', label: 'Photon ring glow',         min: 0.0,  max: 3.0,  step: 0.01,   def: 0.9,   g: 'RELATIVITY' },
  { k: 'starBright', label: 'Star brightness',          min: 0.0,  max: 3.0,  step: 0.01,   def: 1.0,   g: 'SKY' },
  { k: 'mwBright',   label: 'Milky Way brightness',     min: 0.0,  max: 3.0,  step: 0.01,   def: 0.9,   g: 'SKY' },
  { k: 'mwTilt',     label: 'Milky Way tilt',           min: -1.6, max: 1.6,  step: 0.01,   def: 0.55,  g: 'SKY' },
  { k: 'exposure',   label: 'Exposure',                 min: 0.1,  max: 3.0,  step: 0.01,   def: 1.05,  g: 'POST' },
  { k: 'bloom',      label: 'Bloom strength',           min: 0.0,  max: 2.5,  step: 0.01,   def: 0.55,  g: 'POST' },
  { k: 'bloomThresh',label: 'Bloom threshold',          min: 0.0,  max: 3.0,  step: 0.01,   def: 1.1,   g: 'POST' },
  { k: 'grain',      label: 'Film grain',               min: 0.0,  max: 0.25, step: 0.005,  def: 0.045, g: 'POST' },
  { k: 'vignette',   label: 'Vignette',                 min: 0.0,  max: 1.0,  step: 0.01,   def: 0.32,  g: 'POST' },
  { k: 'ca',         label: 'Chromatic aberration',     min: 0.0,  max: 0.02, step: 0.0005, def: 0.006, g: 'POST' },
  { k: 'camDist',    label: 'Camera distance (rs)',     min: 2.2,  max: 40.0, step: 0.1,    def: 11.0,  g: 'CAMERA' },
];

const PRESETS = [
  { name: 'GARGANTUA', p: { diskInner: 2.3, diskOuter: 11, diskBright: 1.7, diskTemp: 1.0, turb: 0.65, turbSpeed: 1.0, diskThick: 0.25, doppler: 1, redshift: 1, beamExp: 2.6, photonGlow: 0.9, starBright: 1.0, mwBright: 0.9, mwTilt: 0.55, exposure: 1.05, bloom: 0.55, bloomThresh: 1.1, grain: 0.045, vignette: 0.32, ca: 0.006, camDist: 11.0 } },
  { name: 'SGR A*',    p: { diskInner: 3.0, diskOuter: 9,  diskBright: 1.15,diskTemp: 0.8, turb: 0.9,  turbSpeed: 1.4, diskThick: 0.55, doppler: 1, redshift: 1, beamExp: 3.2, photonGlow: 1.4, starBright: 1.2, mwBright: 0.5, mwTilt: 0.2,  exposure: 0.95, bloom: 0.5,  bloomThresh: 1.0,  grain: 0.06,  vignette: 0.4,  ca: 0.004, camDist: 10 } },
  { name: 'QUASAR',    p: { diskInner: 1.6, diskOuter: 20, diskBright: 2.9, diskTemp: 1.7, turb: 0.5,  turbSpeed: 1.8, diskThick: 0.35, doppler: 1, redshift: 1, beamExp: 2.0, photonGlow: 0.7, starBright: 0.6, mwBright: 0.45,mwTilt: 0.9,  exposure: 1.0,  bloom: 1.0,  bloomThresh: 1.2,  grain: 0.03,  vignette: 0.25, ca: 0.008, camDist: 20 } },
  { name: 'PHOTON LAB',p: { diskInner: 1.2, diskOuter: 5,  diskBright: 0.9, diskTemp: 1.2, turb: 0.15, turbSpeed: 0.6, diskThick: 0.1,  doppler: 1, redshift: 1, beamExp: 2.6, photonGlow: 2.6, starBright: 1.4, mwBright: 1.2, mwTilt: 0.4,  exposure: 1.0,  bloom: 0.4,  bloomThresh: 1.1,  grain: 0.04,  vignette: 0.3,  ca: 0.005, camDist: 6.5 } },
];

const QUALITY = {
  low:    { label: 'LOW',    steps: 160, pr: 0.66, bloom: false },
  medium: { label: 'MEDIUM', steps: 300, pr: 1.0,  bloom: true  },
  high:   { label: 'HIGH',   steps: 440, pr: 2.0,  bloom: true  },
};
const QUALITY_ORDER = ['low', 'medium', 'high'];

const DEBUG_NAMES = [
  '0 Beauty', '1 Min-radius', '2 Step cost', '3 Disk crossings', '4 Shift map',
  '5 Impact parameter', '6 Photon-ring mask', '7 Background only', '8 Disk only', '9 Critical curve',
];

const STORE_KEY = 'gargantua-v1';

// ------------------------------------------------------------------ error hook
window.__errors = [];
window.addEventListener('error', (e) => { window.__errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', (e) => { window.__errors.push(String(e.reason)); });

// ------------------------------------------------------------------ URL params
const qs = new URLSearchParams(location.search);
const SHOT = qs.get('shot') === '1';

// ------------------------------------------------------------------ state
const params = {};
PARAM_DEFS.forEach(d => { params[d.k] = d.def; });
let quality = 'high';
let debugView = 0;
let paused = false;
let cinematic = false;
let simTime = 0;
let presetIdx = 0;

// persistence
function save() {
  if (SHOT) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ params, quality, presetIdx })); } catch (e) {}
}
function load() {
  if (SHOT) return;
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s) {
      Object.assign(params, s.params || {});
      if (QUALITY[s.quality]) quality = s.quality;
      if (typeof s.presetIdx === 'number') presetIdx = s.presetIdx | 0;
    }
  } catch (e) {}
}
load();

// URL overrides (deterministic screenshot mode)
if (qs.get('preset') !== null) {
  const i = Math.max(0, Math.min(3, parseInt(qs.get('preset'), 10) || 0));
  presetIdx = i; Object.assign(params, PRESETS[i].p);
}
if (qs.get('quality') && QUALITY[qs.get('quality')]) quality = qs.get('quality');
if (qs.get('debug') !== null) debugView = Math.max(0, Math.min(9, parseInt(qs.get('debug'), 10) || 0));

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: SHOT,
  });
} catch (e) {
  document.getElementById('fatal').style.display = 'grid';
  throw e;
}
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = true;

const ctxLost = document.getElementById('ctxlost');
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  ctxLost.style.display = 'grid';
});
canvas.addEventListener('webglcontextrestored', () => { location.reload(); });

// ------------------------------------------------------------------ camera
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.2;
controls.maxDistance = 60;

function placeCamera(azDeg, polDeg, dist) {
  const az = azDeg * Math.PI / 180, pol = polDeg * Math.PI / 180;
  camera.position.set(
    dist * Math.sin(pol) * Math.sin(az),
    dist * Math.cos(pol),
    dist * Math.sin(pol) * Math.cos(az),
  );
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}
{
  const az = parseFloat(qs.get('az') ?? '35');
  const pol = parseFloat(qs.get('pol') ?? '76');
  placeCamera(az, pol, params.camDist);
}

// cinematic path: closed Catmull-Rom sweep with radius breathing
const cineCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(9.5, 2.4, 0), new THREE.Vector3(4.5, 4.2, 7.5),
  new THREE.Vector3(-7.0, 3.0, 6.0), new THREE.Vector3(-12.0, 1.2, -1.0),
  new THREE.Vector3(-5.0, -2.6, -7.5), new THREE.Vector3(6.5, -1.4, -6.0),
], true, 'catmullrom', 0.6);
let cineBlend = 0;
function updateCinematic(t, dt) {
  cineBlend = Math.min(1, cineBlend + dt / 1.4);
  const u = (t * 0.013) % 1;
  const pos = cineCurve.getPointAt(u);
  const breathe = 1 + 0.10 * Math.sin(t * 0.11);
  pos.multiplyScalar(breathe);
  const k = cineBlend * cineBlend * (3 - 2 * cineBlend);
  camera.position.lerp(pos, k);
  const look = new THREE.Vector3(0, 0.25 * Math.sin(t * 0.07), 0);
  camera.lookAt(look);
}

// ------------------------------------------------------------------ fullscreen passes
class FSPass {
  constructor(frag, uniforms) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }
}

const sceneUniforms = {
  uRes: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  uCamMat: { value: new THREE.Matrix3() },
  uFov: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) },
  uAspect: { value: 1 },
  uSteps: { value: QUALITY[quality].steps },
  uDebug: { value: 0 },
  uDiskInner: { value: 0 }, uDiskOuter: { value: 0 }, uDiskBright: { value: 0 },
  uDiskTemp: { value: 0 }, uTurb: { value: 0 }, uTurbSpeed: { value: 0 },
  uDiskThick: { value: 0 }, uDoppler: { value: 0 }, uRedshift: { value: 0 },
  uBeamExp: { value: 0 }, uStarBright: { value: 0 }, uMWBright: { value: 0 },
  uMWTilt: { value: 0 }, uPhotonGlow: { value: 0 },
  uShowDisk: { value: 1 }, uShowBG: { value: 1 },
};
const scenePass = new FSPass(SCENE_FRAG, sceneUniforms);

const brightUniforms = { tDiffuse: { value: null }, uThresh: { value: params.bloomThresh } };
const brightPass = new FSPass(BRIGHT_FRAG, brightUniforms);

const blurUniforms = { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } };
const blurPass = new FSPass(BLUR_FRAG, blurUniforms);

const compUniforms = {
  tScene: { value: null }, tBloom: { value: null },
  uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
  uExposure: { value: 1 }, uBloom: { value: 0 }, uGrain: { value: 0 },
  uVignette: { value: 0 }, uCA: { value: 0 },
};
const compPass = new FSPass(COMPOSITE_FRAG, compUniforms);

// render targets
let rtScene = null, rtBloomA = null, rtBloomB = null;
function makeRTs(w, h) {
  [rtScene, rtBloomA, rtBloomB].forEach(rt => rt && rt.dispose());
  const opts = {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false,
  };
  rtScene = new THREE.WebGLRenderTarget(w, h, opts);
  const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
  rtBloomA = new THREE.WebGLRenderTarget(bw, bh, opts);
  rtBloomB = new THREE.WebGLRenderTarget(bw, bh, opts);
}

// ------------------------------------------------------------------ sizing
function resize() {
  const q = QUALITY[quality];
  const dpr = Math.min(window.devicePixelRatio || 1, q.pr) * (q.pr < 1 ? 1 : 1);
  const scale = q.pr < 1 ? q.pr : Math.min(window.devicePixelRatio || 1, q.pr);
  const w = Math.max(2, Math.round(window.innerWidth * scale));
  const h = Math.max(2, Math.round(window.innerHeight * scale));
  renderer.setSize(w, h, false);
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  makeRTs(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  sceneUniforms.uRes.value.set(w, h);
  sceneUniforms.uAspect.value = w / h;
  compUniforms.uRes.value.set(w, h);
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ param plumbing
const UNIFORM_MAP = {
  diskInner: 'uDiskInner', diskOuter: 'uDiskOuter', diskBright: 'uDiskBright',
  diskTemp: 'uDiskTemp', turb: 'uTurb', turbSpeed: 'uTurbSpeed', diskThick: 'uDiskThick',
  doppler: 'uDoppler', redshift: 'uRedshift', beamExp: 'uBeamExp',
  photonGlow: 'uPhotonGlow', starBright: 'uStarBright', mwBright: 'uMWBright', mwTilt: 'uMWTilt',
};
function pushUniforms() {
  for (const k in UNIFORM_MAP) sceneUniforms[UNIFORM_MAP[k]].value = params[k];
  brightUniforms.uThresh.value = params.bloomThresh;
  compUniforms.uExposure.value = params.exposure;
  compUniforms.uBloom.value = QUALITY[quality].bloom ? params.bloom : 0;
  compUniforms.uGrain.value = params.grain;
  compUniforms.uVignette.value = params.vignette;
  compUniforms.uCA.value = params.ca;
  sceneUniforms.uSteps.value = QUALITY[quality].steps;
  sceneUniforms.uDebug.value = debugView;
  sceneUniforms.uShowDisk.value = debugView === 7 ? 0 : 1;
  sceneUniforms.uShowBG.value = debugView === 8 ? 0 : 1;
}

// ------------------------------------------------------------------ UI build
const hud = document.getElementById('hud');
const panel = document.getElementById('panel');
const sliders = {};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildPanel() {
  panel.innerHTML = '';
  const head = el('div', 'p-head');
  head.append(el('span', 'p-title', 'GARGANTUA'), el('span', 'p-sub', 'Schwarzschild raytracer'));
  panel.append(head);

  // presets
  const pr = el('div', 'p-row');
  pr.append(el('label', 'p-lab', 'PRESET  (shift+1..4)'));
  const prb = el('div', 'p-btns');
  PRESETS.forEach((p, i) => {
    const b = el('button', 'p-btn', `${i + 1} ${p.name}`);
    b.onclick = () => applyPreset(i);
    if (i === presetIdx) b.classList.add('on');
    prb.append(b);
  });
  pr.append(prb); panel.append(pr);

  // quality
  const qr = el('div', 'p-row');
  qr.append(el('label', 'p-lab', 'QUALITY  (Q)'));
  const qb = el('div', 'p-btns');
  QUALITY_ORDER.forEach(k => {
    const b = el('button', 'p-btn', QUALITY[k].label);
    b.dataset.q = k;
    b.onclick = () => setQuality(k);
    if (k === quality) b.classList.add('on');
    qb.append(b);
  });
  qr.append(qb); panel.append(qr);

  // debug views
  const dr = el('div', 'p-row');
  dr.append(el('label', 'p-lab', 'DEBUG VIEW  (0..9)'));
  const db = el('div', 'p-btns');
  DEBUG_NAMES.forEach((n, i) => {
    const b = el('button', 'p-btn', n);
    b.dataset.dbg = i;
    b.onclick = () => setDebug(i);
    if (i === debugView) b.classList.add('on');
    db.append(b);
  });
  dr.append(db); panel.append(dr);

  // 21 sliders grouped
  let group = null;
  PARAM_DEFS.forEach(d => {
    if (d.g !== group) { group = d.g; panel.append(el('div', 'p-grp', group)); }
    const row = el('div', 'p-slider');
    const lab = el('label', '', d.label);
    const val = el('span', 'p-val', params[d.k].toFixed(d.step < 0.01 ? 4 : 2));
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step;
    inp.value = params[d.k];
    inp.oninput = () => {
      params[d.k] = parseFloat(inp.value);
      val.textContent = params[d.k].toFixed(d.step < 0.01 ? 4 : 2);
      if (d.k === 'camDist') {
        const dir = camera.position.clone().normalize();
        camera.position.copy(dir.multiplyScalar(params.camDist));
      }
      pushUniforms(); save();
    };
    row.append(lab, val, inp);
    panel.append(row);
    sliders[d.k] = { inp, val, def: d };
  });

  // actions
  const ar = el('div', 'p-row p-actions');
  const audioB = el('button', 'p-btn', 'AUDIO (A)');
  audioB.id = 'audioBtn';
  audioB.onclick = () => toggleAudio();
  const cineB = el('button', 'p-btn', 'CINEMATIC (C)');
  cineB.id = 'cineBtn';
  cineB.onclick = () => toggleCinematic();
  const resetB = el('button', 'p-btn', 'RESET CAM (R)');
  resetB.onclick = () => resetCamera();
  ar.append(audioB, cineB, resetB);
  panel.append(ar);

  const keys = el('div', 'p-keys',
    'SPACE pause · C cinematic · O orbit · H hud · G panel · A audio · F fullscreen · Q quality · R reset · 0-9 debug · SHIFT+1-4 presets');
  panel.append(keys);
}

function refreshPanelSelections() {
  panel.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === quality));
  panel.querySelectorAll('[data-dbg]').forEach(b => b.classList.toggle('on', +b.dataset.dbg === debugView));
  PARAM_DEFS.forEach(d => {
    const s = sliders[d.k];
    if (s) {
      s.inp.value = params[d.k];
      s.val.textContent = params[d.k].toFixed(d.step < 0.01 ? 4 : 2);
    }
  });
}

function applyPreset(i) {
  presetIdx = i;
  Object.assign(params, PRESETS[i].p);
  pushUniforms(); refreshPanelSelections(); save();
}
function setQuality(k) {
  quality = k; pushUniforms(); resize(); refreshPanelSelections(); save();
}
function setDebug(i) {
  debugView = i; pushUniforms(); refreshPanelSelections();
}
function resetCamera() {
  placeCamera(35, 76, params.camDist);
}
function toggleCinematic() {
  cinematic = !cinematic;
  controls.enabled = !cinematic;
  if (!cinematic) cineBlend = 0;
  const b = document.getElementById('cineBtn');
  if (b) b.classList.toggle('on', cinematic);
}

// ------------------------------------------------------------------ audio
const audio = new BHAudio();
function toggleAudio() {
  const on = audio.toggle(camera.position.length(), params.diskBright);
  const b = document.getElementById('audioBtn');
  if (b) b.classList.toggle('on', on);
}

// ------------------------------------------------------------------ hotkeys
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'text')) return;
  if (e.shiftKey && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    applyPreset(+e.code.slice(-1) - 1); e.preventDefault(); return;
  }
  switch (e.code) {
    case 'Space': paused = !paused; e.preventDefault(); break;
    case 'KeyC': toggleCinematic(); break;
    case 'KeyO': controls.enabled = !controls.enabled; break;
    case 'KeyH': hud.classList.toggle('hidden'); break;
    case 'KeyG': panel.classList.toggle('hidden'); break;
    case 'KeyA': toggleAudio(); break;
    case 'KeyQ': {
      const i = (QUALITY_ORDER.indexOf(quality) + 1) % 3;
      setQuality(QUALITY_ORDER[i]); break;
    }
    case 'KeyR': resetCamera(); break;
    case 'KeyF':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
      break;
    default:
      if (/^Digit[0-9]$/.test(e.code)) setDebug(+e.code.slice(-1));
  }
});

// ------------------------------------------------------------------ HUD
const hudLines = {};
['fps', 'ms', 'res', 'cam', 'steps', 'q', 'dbg', 'time', 'preset', 'audio'].forEach(k => {
  const d = el('div', 'h-line');
  const l = el('span', 'h-k', k.toUpperCase());
  const v = el('span', 'h-v', '—');
  d.append(l, v); hud.append(d);
  hudLines[k] = v;
});
hud.append(el('div', 'h-title', '◉ GARGANTUA'));

let fpsEMA = 60, msEMA = 16;
let hudTimer = 0;

function updateHUD(dt) {
  fpsEMA += ((1 / Math.max(dt, 1e-4)) - fpsEMA) * 0.06;
  msEMA += (dt * 1000 - msEMA) * 0.06;
  hudTimer += dt;
  if (hudTimer < 0.2) return;
  hudTimer = 0;
  const p = camera.position;
  const r = p.length();
  const th = Math.acos(THREE.MathUtils.clamp(p.y / r, -1, 1)) * 180 / Math.PI;
  const ph = Math.atan2(p.x, p.z) * 180 / Math.PI;
  hudLines.fps.textContent = fpsEMA.toFixed(0);
  hudLines.ms.textContent = msEMA.toFixed(1) + ' ms';
  hudLines.res.textContent = `${sceneUniforms.uRes.value.x}×${sceneUniforms.uRes.value.y}`;
  hudLines.cam.textContent = `r=${r.toFixed(2)} θ=${th.toFixed(0)}° φ=${ph.toFixed(0)}°`;
  hudLines.steps.textContent = QUALITY[quality].steps + '/px';
  hudLines.q.textContent = QUALITY[quality].label;
  hudLines.dbg.textContent = DEBUG_NAMES[debugView];
  hudLines.time.textContent = (paused ? '⏸ ' : '') + simTime.toFixed(1) + ' s';
  hudLines.preset.textContent = PRESETS[presetIdx].name;
  hudLines.audio.textContent = audio.running ? 'ON' : 'off';
}

// ------------------------------------------------------------------ main loop
const camMat = new THREE.Matrix3();
const clock = new THREE.Clock();
let shotFrames = 0;
window.__shotReady = false;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused && !SHOT) simTime += dt;
  if (SHOT) simTime = parseFloat(qs.get('t') ?? '6');

  if (cinematic) updateCinematic(simTime, dt);
  else if (controls.enabled && controls.enableDamping) controls.update();

  // camera basis -> ray basis in shader
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  camMat.set(
    e[0], e[4], -e[8],
    e[1], e[5], -e[9],
    e[2], e[6], -e[10],
  );
  sceneUniforms.uCamMat.value.copy(camMat);
  sceneUniforms.uCamPos.value.copy(camera.position);
  sceneUniforms.uTime.value = simTime;
  compUniforms.uTime.value = simTime;
  pushUniforms();

  // 1) HDR scene
  scenePass.render(rtScene);

  // 2) bloom chain (bright pass + 3 separable blur iterations at half res)
  const doBloom = QUALITY[quality].bloom && params.bloom > 0;
  if (doBloom) {
    brightUniforms.tDiffuse.value = rtScene.texture;
    brightPass.render(rtBloomA);
    const bw = rtBloomA.width, bh = rtBloomA.height;
    for (let i = 0; i < 3; i++) {
      const s = (i + 1) * 1.6;
      blurUniforms.tDiffuse.value = rtBloomA.texture;
      blurUniforms.uDir.value.set(s / bw, 0);
      blurPass.render(rtBloomB);
      blurUniforms.tDiffuse.value = rtBloomB.texture;
      blurUniforms.uDir.value.set(0, s / bh);
      blurPass.render(rtBloomA);
    }
    compUniforms.tBloom.value = rtBloomA.texture;
  } else {
    compUniforms.tBloom.value = rtBloomA.texture; // empty (never rendered) — uBloom=0 anyway
  }

  // 3) composite to screen
  compUniforms.tScene.value = rtScene.texture;
  compPass.render(null);

  updateHUD(dt);
  audio.update(camera.position.length(), params.diskBright);

  if (SHOT) {
    shotFrames++;
    if (shotFrames >= 8 && !window.__shotReady) {
      window.__shotReady = true;
      document.title = 'SHOT_READY';
    }
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
buildPanel();
pushUniforms();
resize();
if (SHOT) {
  document.body.classList.add('shot');
  hud.classList.add('hidden');
  panel.classList.add('hidden');
  document.getElementById('hint').style.display = 'none';
}
requestAnimationFrame(frame);
