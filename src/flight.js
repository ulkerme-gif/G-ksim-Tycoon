// Uçuş kulübü: GökSim'in uçuş motoru (fizik, kontroller, gösterge paneli, otopilot, sesler, modeller)
// havalimanınızın three.js dünyasında. GökSim'deki lat/lon konumu, havalimanının düz dünyasına çevrilir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import './goksim/math.js';
import './goksim/aircraft.js';
import './goksim/physics.js';
import './goksim/autopilot.js';
import './goksim/instruments.js';
import './goksim/audio.js';
import './goksim/controls.js';
import NODES from './goksim/nodes.json';
import { HANGAR } from './config.js';
import { money, num } from './util.js';

const GS = globalThis.GS;
const { DEG, KT, FT, FPM, clamp, wrapPi, Q } = GS;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- düz dünya <-> enlem/boylam
const LAT0 = 40 * DEG, LON0 = 30 * DEG;
const WGS_A = 6378137.0, WGS_E2 = 0.00669437999014;
const den = 1 - WGS_E2 * Math.sin(LAT0) ** 2;
const NR = WGS_A / Math.sqrt(den), MR = (WGS_A * (1 - WGS_E2)) / (den * Math.sqrt(den));
const toLL = (x, z) => ({ lat: LAT0 - z / MR, lon: LON0 + x / (NR * Math.cos(LAT0)) });
const toXZ = (lat, lon) => ({ x: (lon - LON0) * NR * Math.cos(LAT0), z: -(lat - LAT0) * MR });
// ENU (doğu, kuzey, yukarı) -> three (x, y, z) = (doğu, yukarı, -kuzey)
const e2t = (v, out = new THREE.Vector3()) => out.set(v[0], v[2], -v[1]);

// ---------------------------------------------------------------- ayarlar
const SKEY = 'havalimani.goksim';
const TOUCH = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
const DEFAULTS = { hud: true, panel: true, control: 'keyboard', invertPitch: false, autoRudder: true, realistic: false, sensitivity: 1, sound: true, volume: 0.7, turb: 0, aircraft: 'f16' };
function loadS() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SKEY) || '{}') };
  } catch (e) {
    return { ...DEFAULTS };
  }
}
function saveS(S) {
  try {
    localStorage.setItem(SKEY, JSON.stringify(S));
  } catch (e) {
    /* yok */
  }
}

// ---------------------------------------------------------------- iniş notları
// [ft/dk sınırı, ad, en az ödül, günlük gelirin payı] — ödül oyuncunun gelirine göre büyür
const GRADES = [
  [60, 'Tüy gibi iniş', 200_000, 0.02],
  [180, 'Yumuşak iniş', 120_000, 0.012],
  [400, 'İyi iniş', 60_000, 0.006],
  [700, 'Sert iniş', 20_000, 0.002],
  [1e9, 'Çok sert iniş', 0, 0],
];

// ---------------------------------------------------------------- model yükleyici (tembel)
let loader = null;
const modelCache = {};
function getLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath('models/draco/');
  draco.setDecoderConfig({ type: 'wasm' });
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}
export function loadGlb(key) {
  if (!modelCache[key]) {
    modelCache[key] = new Promise((res, rej) => getLoader().load(`models/${key}.glb`, (g) => res(g.scene), undefined, rej));
    modelCache[key].catch(() => delete modelCache[key]);
  }
  return modelCache[key];
}
export function hangarDef(id) {
  return GS.AIRCRAFT.find((a) => a.id === id);
}

// ---------------------------------------------------------------- kamera (GökSim kamera modlarının three.js karşılığı)
const CAM_MODES = ['chase', 'cockpit', 'orbit', 'tower'];
const CAM_NAMES = { chase: 'Takip kamerası', cockpit: 'Kokpit', orbit: 'Serbest kamera', tower: 'Kule kamerası' };

class GsCamera {
  constructor(pilot) {
    this.p = pilot;
    this.mode = 'chase';
    this.resetView();
    this.fovCockpit = 70 * DEG;
    this.mouseYoke = false;
    this.bind();
  }
  resetView() {
    this.orbitYaw = this.orbitPitch = 0;
    this.zoom = 1;
    this.lookYaw = this.lookPitch = 0;
    this.towerZoom = 1;
    this.camHdg = null;
    this.orbit = null;
  }
  setMode(m) {
    if (!CAM_MODES.includes(m)) m = 'chase';
    this.mode = m;
    this.lookYaw = this.lookPitch = 0;
    if (m === 'chase') this.camHdg = null;
    if (m === 'orbit') this.orbit = null;
    if (m === 'tower') this.tower = null;
  }
  bind() {
    const cv = this.p.game.renderer.domElement;
    const pts = new Map();
    let pinch = 0, lastTap = 0;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.p.active) return;
      const allowed = e.pointerType !== 'mouse' || (this.mouseYoke ? e.button === 2 : e.button === 0 || e.button === 2);
      if (!allowed) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) {
        /* yok */
      }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      const now = performance.now();
      if (e.pointerType !== 'mouse' && now - lastTap < 300 && pts.size === 1) this.resetView();
      lastTap = now;
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.p.active || !pts.has(e.pointerId)) return;
      const d = pts.get(e.pointerId);
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && dd > 0) this.zoomBy(pinch / dd);
        pinch = dd;
        return;
      }
      if (this.mode === 'chase') {
        this.orbitYaw = wrapPi(this.orbitYaw + dx * 0.006);
        this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -1.2, 1.3);
      } else if (this.mode === 'cockpit') {
        this.lookYaw = clamp(this.lookYaw + dx * 0.004, -2.6, 2.6);
        this.lookPitch = clamp(this.lookPitch - dy * 0.004, -1.2, 1.2);
      } else if (this.mode === 'orbit' && this.orbit) {
        this.orbit.yaw = wrapPi(this.orbit.yaw + dx * 0.006);
        this.orbit.pitch = clamp(this.orbit.pitch - dy * 0.004, -1.45, 1.2);
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', () => this.p.active && this.resetView());
    cv.addEventListener('contextmenu', (e) => this.p.active && e.preventDefault());
    cv.addEventListener('wheel', (e) => this.p.active && this.zoomBy(Math.exp(Math.sign(e.deltaY) * 0.12)), { passive: true });
  }
  zoomBy(f) {
    if (this.mode === 'chase') this.zoom = clamp(this.zoom * f, 0.35, 12);
    else if (this.mode === 'cockpit') this.fovCockpit = clamp(this.fovCockpit * f, 25 * DEG, 100 * DEG);
    else if (this.mode === 'tower') this.towerZoom = clamp(this.towerZoom * f, 0.2, 5);
    else if (this.orbit) this.orbit.dist = clamp(this.orbit.dist * f, 8, 3000);
  }
  // pos: ağırlık merkezi (three); q: gövde->ENU dörtlüsü
  update(dt, fm, pos) {
    const cam = this.p.game.camera;
    const def = fm.def;
    let fov = 60 * DEG;
    cam.up.set(0, 1, 0);
    if (this.mode === 'chase') {
      const h = fm.heading;
      if (this.camHdg == null) this.camHdg = h;
      this.camHdg += wrapPi(h - this.camHdg) * (1 - Math.exp(-dt * 2.2));
      const range = def.cam.dist * this.zoom;
      const tz = def.cam.height * 0.35 - range * 0.11;
      const target = _t.set(pos.x, pos.y + tz, pos.z);
      let pitch = -0.13 - this.orbitPitch * 0.8;
      const lim = Math.asin(clamp((target.y - 1.2) / range, -1, 1));
      pitch = clamp(Math.min(pitch, lim), -1.5, 1.4);
      const H = this.camHdg + this.orbitYaw;
      const dE = Math.sin(H) * Math.cos(pitch), dN = Math.cos(H) * Math.cos(pitch), dU = Math.sin(pitch);
      cam.position.set(target.x - dE * range, target.y - dU * range, target.z + dN * range);
      cam.lookAt(target);
    } else if (this.mode === 'cockpit') {
      const e = def.cam.eye;
      const ly = this.lookYaw, lp = this.lookPitch;
      const dB = [Math.sin(ly) * Math.cos(lp), Math.cos(ly) * Math.cos(lp), Math.sin(lp)];
      const uB = [-Math.sin(ly) * Math.sin(lp), -Math.cos(ly) * Math.sin(lp), Math.cos(lp)];
      const eW = e2t(Q.rotate(fm.q, e), _a), dW = e2t(Q.rotate(fm.q, dB), _b), uW = e2t(Q.rotate(fm.q, uB), _c);
      cam.position.copy(pos).add(eW);
      cam.up.copy(uW);
      cam.lookAt(_t.copy(cam.position).add(dW));
      fov = this.fovCockpit;
    } else if (this.mode === 'orbit') {
      if (!this.orbit) this.orbit = { yaw: fm.heading + 2.4, pitch: -0.3, dist: def.cam.dist * 2 };
      const o = this.orbit;
      const dE = Math.sin(o.yaw) * Math.cos(o.pitch), dN = Math.cos(o.yaw) * Math.cos(o.pitch), dU = Math.sin(o.pitch);
      cam.position.set(pos.x - dE * o.dist, Math.max(1.5, pos.y - dU * o.dist), pos.z + dN * o.dist);
      cam.lookAt(pos);
    } else {
      // havalimanının kulesi yakındaysa oradan, değilse uçağın yakınında yerden
      if (!this.tower || this.tower.distanceTo(pos) > 9000) {
        const tw = this.p.game.world.list('tower').map((t) => new THREE.Vector3(t.cx + 6, 44, t.cz + 6)).sort((a, b) => a.distanceTo(pos) - b.distanceTo(pos))[0];
        if (tw && tw.distanceTo(pos) < 7000) this.tower = tw;
        else {
          const h = fm.heading;
          const rE = Math.cos(h), rN = -Math.sin(h), fE = Math.sin(h), fN = Math.cos(h);
          this.tower = new THREE.Vector3(pos.x + rE * 160 + fE * 260, 22, pos.z - (rN * 160 + fN * 260));
        }
      }
      cam.position.copy(this.tower);
      cam.lookAt(pos);
      const dist = this.tower.distanceTo(pos);
      fov = clamp(2 * Math.atan((def.span * 2.2 * this.towerZoom) / 2 / Math.max(dist, 1)), 2 * DEG, 65 * DEG);
    }
    const fd = fov / DEG;
    if (Math.abs(cam.fov - fd) > 0.01) {
      cam.fov = fd;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }
}
const _t = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// ================================================================ pilot
export class Pilot {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.ready = false;
    this.token = { player: true };
    this.S = loadS();
    this.current = null;
  }

  // GökSim parçaları ilk uçuşta kurulur (klavye dinleyicileri, ses, panel)
  setup() {
    if (this.ready) return;
    this.ready = true;
    const S = this.S;
    this.def = GS.getAircraft(S.aircraft);
    this.env = { wind: [0, 0, 0], turbulence: 0 };
    this.fm = new GS.FlightModel(this.def, this.env);
    this.fm.reset({ lat: LAT0, lon: LON0, heading: 0, onGround: true, ground: 0 });
    this.fm.setRealism(S.realistic);
    this.ap = new GS.Autopilot();
    this.ap.setDefaults(this.def);
    this.sound = new GS.Sound();
    this.sound.setEnabled(S.sound, S.volume);
    this.controls = new GS.Controls(S, (a, arg) => this.active && this.action(a, arg));
    this.instruments = new GS.Instruments($('#gs-panel'));
    this.instruments.realistic = !!S.realistic;
    this.cam = new GsCamera(this);
    this.cam.mouseYoke = S.control === 'mouse';
    this.timers = { hud: 0, scrape: 0 };
    this.fps = 30;
    this.bindUI();
  }

  owned() {
    return this.game.prog.hangar || [];
  }
  unlocked() {
    return this.game.prog.up('pilot') > 0;
  }

  // ---------------------------------------------------------------- başlatma menüsü (havalimanı görünümünde)
  openMenu() {
    const g = this.game, ui = g.ui, W = g.world;
    if (!this.unlocked()) return ui.toast('Önce Yükseltmeler sekmesinden Uçuş kulübünü alın', 'warn');
    const rws = W.list('runway');
    if (!rws.length) return ui.toast('Uçmak için bir pist gerekli', 'warn');
    const ends = [];
    for (const r of rws) {
      const inf = W.runwayInfo(r);
      inf.ends.forEach((e, k) => ends.push({ r, k, name: e.name, len: inf.len, active: (r.active || 0) === k }));
    }
    let sel = ends.find((e) => e.active) || ends[0];
    let approach = false;
    const render = () => {
      const own = this.owned();
      let id = own.includes(this.S.aircraft) ? this.S.aircraft : own[0];
      const cards = HANGAR.map(({ id: hid, price }) => {
        const d = hangarDef(hid);
        const have = own.includes(hid);
        return `<div class="hg ${have ? 'own' : ''} ${hid === id ? 'sel' : ''}">
          <div><b>${esc(d.name)}</b><small>${esc(d.specs)}</small></div>
          ${have ? `<button class="btn ${hid === id ? 'primary' : ''}" data-hsel="${hid}">${hid === id ? 'Seçili' : 'Seç'}</button>` : `<button class="btn" data-hbuy="${hid}" ${g.econ.money >= price ? '' : 'disabled'}>${money(price)}</button>`}</div>`;
      }).join('');
      ui.modal(`<h2>Uçuş kulübü</h2>
        <p class="muted">GökSim'in uçuş motoru: aynı fizik, gösterge paneli, otopilot ve kontroller. Sahip olduğunuz uçakla havalimanınızın pistinden kalkarsınız. Uçuş sırasında oyun 1× hızda akar.</p>
        <h3>Hangar</h3><div class="hgs">${cards}</div>
        <h3>Pist</h3><div class="row pick">${ends.map((e, k) => `<button class="btn ${e === sel ? 'primary' : ''}" data-pr="${k}">Pist ${e.name} · ${num(e.len)} m${e.active ? ' · rüzgâra karşı' : ''}</button>`).join('')}</div>
        <div class="row pick"><button class="btn ${!approach ? 'primary' : ''}" data-pa="0">Pistte başla</button><button class="btn ${approach ? 'primary' : ''}" data-pa="1">Yaklaşmada başla (3° süzülüş)</button></div>
        <div class="row"><button class="btn primary" data-m="go" ${id ? '' : 'disabled'}>${id ? 'Uç' : 'Önce bir uçak alın'}</button><button class="btn" data-m="close">Vazgeç</button></div>`, (k) => {
        if (k === 'go' && id) this.start(id, sel.r, sel.k, approach);
      });
      const card = document.getElementById('modal-card');
      card.querySelectorAll('[data-hsel]').forEach((b) => b.addEventListener('click', () => {
        this.S.aircraft = b.dataset.hsel;
        saveS(this.S);
        render();
      }));
      card.querySelectorAll('[data-hbuy]').forEach((b) => b.addEventListener('click', () => {
        // iki dokunuşla satın alma (yanlışlıkla büyük harcama olmasın)
        if (b.dataset.sure !== '1') {
          b.dataset.sure = '1';
          b.classList.add('primary');
          b.textContent = 'Onayla: ' + b.textContent;
          return;
        }
        if (this.buy(b.dataset.hbuy)) {
          this.S.aircraft = b.dataset.hbuy;
          saveS(this.S);
        }
        render();
      }));
      card.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => {
        sel = ends[+b.dataset.pr];
        render();
      }));
      card.querySelectorAll('[data-pa]').forEach((b) => b.addEventListener('click', () => {
        approach = b.dataset.pa === '1';
        render();
      }));
    };
    render();
  }

  buy(id) {
    const g = this.game, P = g.prog;
    const h = HANGAR.find((x) => x.id === id);
    if (!h || this.owned().includes(id)) return false;
    if (!g.econ.spend(h.price, 'hangar')) return false;
    P.hangar = [...this.owned(), id];
    g.econ.notify(`Hangara yeni uçak: ${hangarDef(id).name}`, 'good');
    P.checkAch && P.checkAch();
    return true;
  }

  // ---------------------------------------------------------------- uçuşa giriş / çıkış
  async start(id, r, endIdx, approach) {
    const g = this.game;
    this.setup();
    this.active = true;
    this.prevSpeed = g.speed || g.lastSpeed || 1;
    g.setSpeed(1);
    g.ui.openPanel(null);
    g.ui.select(null);
    g.builder.setTool('select');
    g.rig.disabled = true;
    g.rig.pointers.clear();
    g.rig.follow = null;
    this.savedRig = { x: g.rig.target.x, z: g.rig.target.z, dist: g.rig.dist, yaw: g.rig.yaw, pitch: g.rig.pitch };
    document.body.classList.add('flying');
    $('#gs').hidden = false;
    $('#gs-touch').hidden = !TOUCH;
    this.applyPanel();
    this.spawnSpec = { rid: r.id, endIdx, approach };
    this.setCamera('chase', true);
    await this.selectAircraft(id, true);
    this.spawnAtRunway();
  }

  stop() {
    const g = this.game;
    if (!this.active) return;
    this.release();
    this.ap.disengage();
    this.sound.update(this.fm, true, false);
    if (this.root) g.scene.remove(this.root);
    this.closePanel();
    this.active = false;
    document.body.classList.remove('flying');
    $('#gs').hidden = true;
    $('#gs-crash').hidden = true;
    $('#gs-pause').hidden = true;
    g.camera.fov = 42;
    g.camera.up.set(0, 1, 0);
    g.camera.updateProjectionMatrix();
    const R = g.rig;
    R.disabled = false;
    R.pointers.clear();
    const p = this.pos3();
    if (Math.hypot(p.x, p.z) < 2500) {
      R.target.set(p.x, 0, p.z);
      R.dist = 420;
    } else if (this.savedRig) {
      R.target.set(this.savedRig.x, 0, this.savedRig.z);
      R.dist = this.savedRig.dist;
      R.yaw = this.savedRig.yaw;
      R.pitch = this.savedRig.pitch;
    }
    R.apply();
    g.setSpeed(this.prevSpeed || 1);
  }

  release() {
    for (const [, st] of this.game.sim.rw) if (st.busy && st.busy.ac === this.token) st.busy = null;
  }

  async selectAircraft(id, initial) {
    if (!initial && id === this.def.id && this.root) return;
    this.def = GS.getAircraft(id);
    this.S.aircraft = id;
    saveS(this.S);
    this.fm.setAircraft(this.def);
    this.ap.disengage();
    this.ap.setDefaults(this.def);
    this.extraTarget = {};
    this.extraState = {};
    this.renderExtras();
    await this.loadModel();
    if (!initial) {
      this.spawnAtRunway();
      this.toast(this.def.name);
    }
  }

  async loadModel() {
    const g = this.game;
    const token = (this.modelToken = (this.modelToken || 0) + 1);
    if (this.root) g.scene.remove(this.root);
    this.root = null;
    this.nodes = null;
    this.loading = true;
    $('#gs-loading').hidden = false;
    $('#gs-loading-text').textContent = `${this.def.name} hazırlanıyor…`;
    let scene;
    try {
      scene = await loadGlb(this.def.glbKey);
    } catch (e) {
      console.error(e);
      $('#gs-loading-text').textContent = 'Uçak modeli yüklenemedi. Oyunu GitHub Pages ya da yerel sunucu üzerinden açın (models klasörü gerekli).';
      return;
    }
    if (token !== this.modelToken) return;
    const model = scene.clone(true);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.add(model);
    g.scene.add(root);
    this.root = root;
    // GökSim'in düğüm bilgileri (menteşe ekseni, pivot, takım ve kapak açıları)
    const info = NODES[this.def.glbKey] || {};
    const nodes = {};
    const v = (a) => (a ? new THREE.Vector3(a[0], a[1], a[2]).normalize() : null);
    for (const name of Object.keys(info)) {
      const n = model.getObjectByName(name) || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      const inf = info[name];
      if (n) nodes[name] = { node: n, pivotG: inf.pivotG, axisC: v(inf.axisG), retractC: v(inf.retractAxisG), retractAngle: inf.retractAngle, fowlerG: inf.fowlerG, openAngle: inf.openAngle, r: inf.r, hideN: inf.hideN, extra: inf.extra, extraAngle: inf.extraAngle, slideG: inf.slideG, gdoor: inf.gdoor, hideClosed: inf.hideClosed, shown: true };
    }
    this.nodes = nodes;
    this.wheelRoll = [];
    this.wheelSpd = [];
    this.propAng = 0;
    this.fanAng = 0;
    this.loading = false;
    $('#gs-loading').hidden = true;
  }

  // ---------------------------------------------------------------- başlangıç noktası
  spawnAtRunway() {
    const W = this.game.world;
    const sp = this.spawnSpec;
    let r = sp && W.objects.get(sp.rid);
    if (!r) r = W.list('runway')[0];
    if (!r) return this.stop();
    const inf = W.runwayInfo(r);
    const end = inf.ends[sp ? sp.endIdx : r.active || 0] || inf.ends[0];
    const def = this.def;
    const d = { x: Math.sin(end.h), z: -Math.cos(end.h) };
    this.lastEnd = end;
    if (!sp || !sp.approach) {
      const into = 20 + Math.max(...def.contacts.map((c) => -c.pos[1]));
      const p = toLL(end.from.x + d.x * into, end.from.z + d.z * into);
      return this.spawn({ lat: p.lat / DEG, lon: p.lon / DEG, hdgDeg: end.h / DEG, onGround: true, label: `Pist ${end.name}` });
    }
    const big = def.id === 'a380' || def.id === 'b777';
    const dist = big ? 11000 : 8000;
    const p = toLL(end.from.x - d.x * dist, end.from.z - d.z * dist);
    this.spawn({
      lat: p.lat / DEG, lon: p.lon / DEG, hdgDeg: end.h / DEG, onGround: false, altAglFt: (dist * Math.tan(3 * DEG)) / FT + 50,
      speedKt: def.speeds.approach, gearDown: true, flapIndex: def.flaps ? def.flaps.ldg : 0, gamma: -3 * DEG, approach: true, label: `Pist ${end.name} yaklaşması`,
    });
  }

  // GökSim'in spawn() işlevi (yer yüksekliği 0, karo beklemesi yok)
  spawn(o) {
    const fm = this.fm, def = this.def, c = this.controls;
    $('#gs-crash').hidden = true;
    this.ap.disengage();
    this.renderAP();
    c.reset();
    const latR = o.lat * DEG, lonR = o.lon * DEG, hdg = (o.hdgDeg || 0) * DEG;
    const real = !!this.S.realistic && def.engine.type !== 'winch';
    if (o.onGround) {
      c.flapIndex = def.flaps ? def.flaps.to : 0;
      fm.reset({ lat: latR, lon: lonR, heading: hdg, onGround: true, ground: 0, flaps: def.flaps ? def.flaps.values[c.flapIndex] : 0, engineOff: real });
      c.throttle = 0;
      c.gearDown = true;
      if (real) {
        c.engineOn = false;
        c.parkingBrake = true;
      }
    } else {
      const spd = (o.speedKt || def.speeds.cruise) * KT;
      const alt = (o.altAglFt || 2000) * FT;
      c.flapIndex = o.flapIndex || 0;
      c.gearDown = !!o.gearDown || !def.gear.retractable;
      const flaps = def.flaps ? def.flaps.values[c.flapIndex] : 0;
      const rho = GS.atmosphere(alt).rho;
      const CL0 = def.CL0 + (def.flaps ? flaps * def.flaps.dCL : 0);
      const CLreq = (def.mass * 9.81) / (0.5 * rho * spd * spd * def.S);
      const aReq = (CLreq - CL0) / def.CLa;
      const eq = (aReq - def.ctrl.alpha0) / (def.ctrl.Pa / def.ctrl.Ka);
      c.trim = clamp(eq / def.ctrl.trim, -1, 1);
      const gamma = o.gamma || 0;
      c.throttle = o.approach ? 0.42 : 0.62;
      fm.reset({ lat: latR, lon: lonR, heading: hdg, onGround: false, alt, speed: spd, throttle: def.engine.type === 'jet' ? c.throttle : 0.6, ground: 0, gearDown: c.gearDown, flaps, pitch: aReq + gamma, trim: c.trim });
      fm.vel = GS.V.scale(GS.Q.rotate(GS.Q.fromHPR(hdg, gamma, 0), [0, 1, 0]), spd);
    }
    this.cam.resetView();
    this.cam.tower = null;
    this.flight = { airT: o.onGround ? 0 : 60, flown: !o.onGround, scored: false, maxAgl: 0 };
    this.lastSpawn = o;
    this.game.setSpeed(1);
    $('#gs-pause').hidden = true;
    this.placeModel();
    if (o.label) this.toast(o.label);
    if (real && o.onGround) this.toast('Gerçekçi mod: E ile motoru çalıştırın, Shift+B ile park frenini bırakın.', 'info', 7000);
  }

  pos3(out = _p) {
    if (!this.fm) return out.set(0, 0, 0);
    const p = toXZ(this.fm.lat, this.fm.lon);
    return out.set(p.x, this.fm.alt, p.z);
  }

  // ---------------------------------------------------------------- eylemler (GökSim ile aynı)
  action(a, arg) {
    const c = this.controls, def = this.def, fm = this.fm;
    switch (a) {
      case 'any':
        this.sound.unlock();
        break;
      case 'gear':
        if (!def.gear.retractable) return this.toast('Bu uçağın iniş takımı sabit.');
        if (fm.wheelsDown > 0 && c.gearDown) return this.toast('Yerdeyken iniş takımı toplanamaz.', 'warn');
        c.gearDown = !c.gearDown;
        this.sound.clunk();
        this.toast(c.gearDown ? 'İniş takımı indiriliyor' : 'İniş takımı toplanıyor');
        break;
      case 'flapsDown':
      case 'flapsUp': {
        if (!def.flaps) return this.toast('Bu uçakta flap yok.');
        const n = def.flaps.values.length;
        c.flapIndex = clamp(c.flapIndex + (a === 'flapsDown' ? 1 : -1), 0, n - 1);
        this.toast('Flap ' + def.flaps.labels[c.flapIndex]);
        break;
      }
      case 'spoilers':
        if (!def.spoilers) return this.toast('Bu uçakta spoiler yok.');
        c.spoilers = !c.spoilers;
        this.toast(c.spoilers ? 'Spoiler açık' : 'Spoiler kapalı');
        break;
      case 'spoilerArm':
        if (!def.spoilers) return this.toast('Bu uçakta spoiler yok.');
        c.spoilerArmed = !c.spoilerArmed;
        this.toast(c.spoilerArmed ? 'Spoiler hazır: teker koyunca kendiliğinden açılacak' : 'Spoiler hazırlığı kapatıldı');
        break;
      case 'engine':
        c.engineOn = !c.engineOn;
        if (c.engineOn && this.S.realistic) {
          if (def.fuel && fm.fuel <= 0) this.toast('Yakıt yok, motor çalışmaz.', 'warn');
          else this.toast('Motor çalıştırılıyor (yaklaşık ' + def.engine.startTime + ' sn)…');
        } else this.toast(c.engineOn ? 'Motor çalıştırıldı' : 'Motor durduruldu', c.engineOn ? 'info' : 'warn');
        break;
      case 'autopilot':
        this.toggleAP();
        break;
      case 'camera':
        this.setCamera(CAM_MODES[(CAM_MODES.indexOf(this.cam.mode) + 1) % CAM_MODES.length]);
        break;
      case 'cameraSet':
        this.setCamera(arg);
        break;
      case 'panel':
        this.S.panel = !this.S.panel;
        saveS(this.S);
        this.applyPanel();
        this.syncSettings();
        break;
      case 'hud':
        this.S.hud = !this.S.hud;
        saveS(this.S);
        this.syncSettings();
        break;
      case 'pause':
        this.togglePause();
        break;
      case 'reset':
        this.spawnAtRunway();
        break;
      case 'mouseYoke':
        this.S.control = this.S.control === 'mouse' ? 'keyboard' : 'mouse';
        saveS(this.S);
        this.applySetting('control');
        this.syncSettings();
        break;
      case 'help':
        this.togglePanel('help');
        break;
      case 'escape':
        if (this.current) this.closePanel();
        else this.stop();
        break;
      case 'extras':
        this.togglePanel('extras');
        break;
      case 'extra':
        this.toggleExtra(arg);
        break;
      case 'parkingBrake':
        c.parkingBrake = !c.parkingBrake;
        this.toast(c.parkingBrake ? 'Park freni çekildi' : 'Park freni bırakıldı');
        break;
      case 'gamepad':
        this.toast('Oyun kumandası bağlandı');
        break;
      case 'map':
        break;
    }
  }

  toggleExtra(id) {
    const ex = (this.def.extras || []).find((x) => x.id === id);
    if (!ex) return;
    if (ex.groundOnly && !this.fm.onGround && !this.extraTarget[id]) return this.toast(ex.label + ' yalnızca yerdeyken kullanılabilir.', 'warn');
    this.extraTarget[id] = this.extraTarget[id] ? 0 : 1;
    this.toast(ex.label + (this.extraTarget[id] ? ': açılıyor' : ': kapanıyor'));
    this.renderExtras();
  }

  toggleAP() {
    const fm = this.fm;
    if (!this.ap.on) {
      if (fm.onGround || fm.crashed) return this.toast('Otopilot yerde açılamaz.', 'warn');
      this.ap.engage(fm, { throttle: this.controls.throttle });
      this.sound.beep(1400);
      this.toast('Otopilot açık');
    } else {
      this.ap.disengage();
      this.sound.beep(700, 0.3);
      this.toast('Otopilot kapalı', 'warn');
    }
    this.renderAP();
  }

  setCamera(mode, quiet) {
    this.cam.setMode(mode);
    $$('[data-gcam]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.gcam === mode ? 'true' : 'false'));
    this.instruments.cockpit = mode === 'cockpit';
    $('#gs').classList.toggle('cockpit', mode === 'cockpit');
    if (!quiet) this.toast(CAM_NAMES[mode]);
  }

  togglePause() {
    if (this.loading || this.fm.crashed) return;
    const g = this.game;
    g.setSpeed(g.speed ? 0 : 1);
  }

  applyPanel() {
    $('#gs-bottom').classList.toggle('no-panel', !this.S.panel);
  }

  applySetting(key) {
    const S = this.S;
    if (key === 'control') {
      this.cam.mouseYoke = S.control === 'mouse';
      $('#gs').classList.toggle('mouse-yoke', S.control === 'mouse');
      this.toast(S.control === 'mouse' ? 'Fare ile kontrol açık. Kamerayı sağ tıkla sürükleyerek çevirin.' : 'Klavye ile kontrol');
    }
    if (key === 'realistic') {
      this.fm.setRealism(S.realistic);
      this.instruments.realistic = !!S.realistic;
      this.toast(S.realistic ? 'Gerçekçi mod açık. Bir sonraki başlangıçta motor kapalı olacak.' : 'Gerçekçi mod kapalı');
    }
    if (key === 'sound' || key === 'volume') this.sound.setEnabled(S.sound, S.volume);
    if (key === 'panel') this.applyPanel();
  }

  // ---------------------------------------------------------------- döngü (GökSim frameBody)
  update(dt) {
    if (!this.active || this.loading) return;
    const g = this.game, S = this.S, fm = this.fm, def = this.def;
    const paused = g.speed === 0;
    this.fps += (1 / Math.max(dt, 0.004) - this.fps) * 0.05;
    $('#gs-pause').hidden = !paused || fm.crashed;
    $('#gs-tb-pause').setAttribute('aria-pressed', paused ? 'true' : 'false');
    this.controls.update(dt);
    if (!paused && !fm.crashed) {
      const inp = this.controls.input(def);
      if (S.autoRudder && !S.realistic && !fm.onGround && !this.ap.on) inp.rudder = clamp(inp.rudder + (fm.beta || 0) * 3 + (def.ctrl.Na / def.ctrl.Ya) * inp.aileron * 0.8, -1, 1);
      if (this.ap.on) {
        this.ap.update(dt, fm, inp);
        this.controls.throttle = inp.throttle;
      }
      // rüzgâr ve türbülans havalimanının havasından
      const W = g.econ.wind || { from: 0, kt: 0 };
      const ws = W.kt * KT, wd = W.from * DEG;
      this.env.wind = [-Math.sin(wd) * ws, -Math.cos(wd) * ws, 0];
      const storm = g.prog ? g.prog.stormAt(g.time) : 0;
      this.env.turbulence = clamp((S.turb || 0) + storm * 0.6, 0, 1);
      fm.ground = 0;
      fm.step(dt, inp);
      this.handleEvents();
    }
    for (const ex of def.extras || []) {
      const tgt = this.extraTarget[ex.id] || 0;
      this.extraState[ex.id] = GS.approach(this.extraState[ex.id] || 0, tgt, dt / (ex.time || 3));
    }
    const c = this.controls;
    if (c.spoilerArmed && def.spoilers && fm.wheelsDown > 0 && c.throttle < 0.25 && fm.gs > 15) {
      c.spoilers = true;
      c.spoilerArmed = false;
      this.toast('Spoilerlar otomatik açıldı', 'good');
    }
    // uçuş süresi (ödül için)
    const F = this.flight;
    if (!paused && !fm.crashed) {
      if (fm.wheelsDown > 0) {
        if (fm.gs < 1 && F.scored) F.done = true;
      } else {
        F.airT += dt;
        F.maxAgl = Math.max(F.maxAgl, fm.agl);
        if (F.airT > 20 && F.maxAgl > 60) F.flown = true;
        if (F.scored && fm.agl > 30) {
          // tur atıp yeniden inişe
          F.scored = false;
          F.flown = false;
          F.airT = 0;
          F.maxAgl = 0;
        }
      }
    }
    this.placeModel();
    this.animate(dt);
    const p = this.pos3();
    this.cam.update(dt, fm, p);
    if (S.panel) this.instruments.draw(fm, this.controls, this.ap, dt);
    this.sound.update(fm, paused || this.loading, this.cam.mode === 'cockpit');
    this.reserve();
    // gölge kamerası uçağı izlesin
    g.rig.target.set(p.x, 0, p.z);
    this.timers.hud += dt;
    if (this.timers.hud > 0.15) {
      this.timers.hud = 0;
      this.updateHud();
      if (this.ap.on && this.current === 'autopilot') this.renderAP();
    }
  }

  handleEvents() {
    for (const e of this.fm.popEvents()) {
      if (e.type === 'touchdown') {
        const fpm = e.vs / FPM;
        const r = fpm < 120 ? 'tüy gibi!' : fpm < 300 ? 'güzel iniş' : fpm < 550 ? 'biraz sert' : 'çok sert';
        this.toast(`Teker koydu: ${Math.round(fpm)} ft/dk, ${r}`, fpm < 550 ? 'good' : 'warn', 4000);
        this.sound.touchdown(e.vs);
        this.score(fpm);
      } else if (e.type === 'crash') {
        this.sound.crash();
        this.ap.disengage();
        this.renderAP();
        this.release();
        $('#gs-crash-reason').textContent = e.reason;
        $('#gs-crash').hidden = false;
      } else if (e.type === 'engine-started') this.toast('Motor çalıştı', 'good');
      else if (e.type === 'fuel-low') {
        this.toast('Yakıt azaldı: %10 kaldı', 'warn', 5000);
        this.sound.beep(900, 0.25);
      } else if (e.type === 'fuel-out') {
        this.toast('Yakıt bitti, motor durdu. Süzülerek inin!', 'warn', 7000);
        this.sound.beep(600, 0.5);
      } else if (e.type === 'overstress') {
        this.toast(`Aşırı G yükü: ${e.g.toFixed(1)} G. Sınırı aşmaya devam ederseniz uçak kırılır.`, 'warn', 4000);
        this.sound.beep(1000, 0.3);
      } else if (e.type === 'overspeed') {
        this.toast('Azami hız aşıldı! Gazı azaltın, burnu kaldırın.', 'warn', 4000);
        this.sound.beep(1600, 0.4);
      } else if (e.type === 'flaps-damaged') this.toast('Flaplar yüksek hızda hasar gördü ve kilitlendi.', 'warn', 6000);
      else if (e.type === 'gear-damaged') this.toast('İniş takımı yüksek hızda hasar gördü ve kilitlendi.', 'warn', 6000);
      else if (e.type === 'scrape') {
        const now = performance.now();
        if (now - this.timers.scrape > 4000) {
          this.toast('Gövde yere sürtüyor!', 'warn');
          this.timers.scrape = now;
        }
      }
    }
  }

  // piste iyi inişe ödül
  score(fpm) {
    const F = this.flight, g = this.game, P = g.prog;
    if (!F.flown || F.scored) return;
    F.scored = true;
    const p = this.pos3();
    if (!this.onRunway(p)) return this.toast(`Pistin dışına indiniz (${Math.round(fpm)} ft/dk). Ödül yok.`, 'warn', 4500);
    const [, name, base, frac] = GRADES.find((x) => fpm < x[0]);
    const reward = base && Math.max(base, Math.round((P.avgIncome() * frac) / 10_000) * 10_000);
    if (reward) g.econ.earn(reward, 'bonus');
    g.econ.notify(`${name}: ${Math.round(fpm)} ft/dk${reward ? ' · ' + money(reward) : ''}`, reward ? 'good' : 'warn');
    this.toast(`${name}${reward ? ': ' + money(reward) : ''}`, reward ? 'good' : 'warn', 4500);
    P.grant('pilot1');
    if (fpm < 60) P.grant('butter');
    if (g.lightsOn > 0.7) P.grant('nightland');
    if (this.def.id === 'a380' || this.def.id === 'b777') P.grant('widepilot');
  }

  onRunway(p, margin = 30) {
    const W = this.game.world;
    for (const r of W.list('runway')) {
      const inf = W.runwayInfo(r);
      const along = (p.x - inf.A.x) * inf.ax.x + (p.z - inf.A.z) * inf.ax.z;
      const lat = (p.x - inf.A.x) * -inf.ax.z + (p.z - inf.A.z) * inf.ax.x;
      if (Math.abs(lat) < margin && along > -10 && along < inf.len + 10) return r;
    }
    return null;
  }

  // pisti öteki trafiğe kapat: pistteyken ya da son yaklaşmadayken
  reserve() {
    const fm = this.fm;
    if (fm.crashed) return this.release();
    const g = this.game, W = g.world, S = g.sim;
    const p = this.pos3();
    let want = null;
    for (const r of W.list('runway')) {
      const inf = W.runwayInfo(r);
      const along = (p.x - inf.A.x) * inf.ax.x + (p.z - inf.A.z) * inf.ax.z;
      const lat = (p.x - inf.A.x) * -inf.ax.z + (p.z - inf.A.z) * inf.ax.x;
      const onR = Math.abs(lat) < 45 && along > -80 && along < inf.len + 80 && fm.agl < 40;
      const fin = fm.wheelsDown === 0 && Math.abs(lat) < 350 && fm.agl < 380 && ((along < 0 && along > -4500) || (along > inf.len && along < inf.len + 4500));
      if (onR || fin) want = r;
    }
    for (const [id, st] of S.rw) if (st.busy && st.busy.ac === this.token && (!want || id !== want.id)) st.busy = null;
    if (want) {
      const st = S.runwayState(want);
      if (!st.busy) st.busy = { ac: this.token, kind: 'player' };
    }
  }

  // ---------------------------------------------------------------- model konumu ve parçaları
  placeModel() {
    if (!this.root) return;
    const fm = this.fm;
    const m = Q.toMat3(fm.q);   // gövde -> ENU (satır düzeni)
    // three = A·R·Aᵀ ; A: ENU -> three
    const A = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
    const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += A[i][k] * m[k][l] * A[j][l];
        r[i][j] = s;
      }
    const p = this.pos3();
    this.root.matrix.set(r[0][0], r[0][1], r[0][2], p.x, r[1][0], r[1][1], r[1][2], p.y, r[2][0], r[2][1], r[2][2], p.z, 0, 0, 0, 1);
    this.root.matrixWorldNeedsUpdate = true;
  }

  animate(dt) {
    const N = this.nodes;
    if (!N) return;
    const fm = this.fm, def = this.def;
    const ax = { x: _AX, z: _AZ, y: _AY };
    const set = (name, axis, ang, off) => {
      const n = N[name];
      if (!n) return;
      const p = n.pivotG;
      n.node.position.set(p[0] + (off ? off[0] : 0), p[1] + (off ? off[1] : 0), p[2] + (off ? off[2] : 0));
      n.node.quaternion.setFromAxisAngle(axis, ang);
    };
    const show = (name, on) => {
      const n = N[name];
      if (n && n.shown !== on) {
        n.node.visible = on;
        n.shown = on;
      }
    };
    const ctl = (name, defAx, ang, slide) => {
      const n = N[name];
      if (!n) return;
      const f = n.fowlerG && slide ? [n.fowlerG[0] * slide, n.fowlerG[1] * slide, n.fowlerG[2] * slide] : null;
      set(name, n.axisC || ax[defAx], ang, f);
      if (n.hideN || (def.hideNeutral && n.hideN == null)) show(name, Math.abs(ang) > 0.004 || (slide || 0) > 0.01);
    };
    const e = -(fm.elev + fm.trim * def.ctrl.trim * 0.5) * 0.32;
    ctl('elevator', 'x', e);
    ctl('elevatorR', 'x', e);
    ctl('elevatorL', 'x', e);
    ctl('rudder', 'z', fm.rud * 0.4);
    ctl('rudder2', 'z', fm.rud * 0.4);
    const droop = N.flapR ? (def.id === 'f18' ? fm.flaps * 0.25 : 0) : fm.flaps * 0.3;
    const elevonPitch = def.elevons ? e : 0;
    ctl('aileronR', 'x', -fm.ail * 0.35 + droop + elevonPitch);
    ctl('aileronL', 'x', fm.ail * 0.35 + droop + elevonPitch);
    ctl('canardR', 'x', -e * 0.9);
    ctl('canardL', 'x', -e * 0.9);
    ctl('brakeDown', 'x', fm.spoiler * 0.85);
    show('doorsOpen', fm.gearPos > 0.06);
    show('doorsClosed', fm.gearPos <= 0.06);
    ctl('flapR', 'x', fm.flaps * 0.6, fm.flaps);
    ctl('flapL', 'x', fm.flaps * 0.6, fm.flaps);
    ctl('flapR2', 'x', fm.flaps * 0.55, fm.flaps);
    ctl('flapL2', 'x', fm.flaps * 0.55, fm.flaps);
    const lef = Math.min(0.45, fm.flaps * 0.4 + Math.max(0, ((fm.alpha || 0) - 0.06) * 1.6));
    for (const nm of ['slatR', 'slatL', 'slatR2', 'slatL2']) ctl(nm, 'x', -lef);
    ctl('spoilerR', 'x', -fm.spoiler * 0.85);
    ctl('spoilerL', 'x', -fm.spoiler * 0.85);
    const cockpit = this.cam.mode === 'cockpit';
    if (N.fan0) {
      const fs = (fm.engineOn || fm.engState === 'starting' ? fm.n * 14 : 0) + fm.tas * 0.02;
      this.fanAng = (this.fanAng + Math.min(fs, 7) * Math.PI * 2 * dt) % (Math.PI * 2);
      for (let k = 0; k < 8; k++) if (N['fan' + k]) set('fan' + k, ax.y, this.fanAng);
    }
    show('fuselage', !cockpit);
    show('flame', !!fm.afterburner);
    const tt = performance.now() / 1000;
    const ph = tt % 1.3;
    show('strobe', ph < 0.06 || (ph > 0.16 && ph < 0.22));
    show('beacon', tt % 1.1 < 0.15);
    const sm = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const retr = def.gear.retractable;
    const legT = retr ? sm(0.22, 0.9, fm.gearPos) : 1;
    const doorT = retr ? sm(0.0, 0.22, fm.gearPos) : 1;
    const gp = def.gear.points;
    for (let i = 0; i < gp.length; i++) {
      const leg = N['gearLeg' + i];
      if (!leg) continue;
      const gpt = gp[i];
      if (leg.retractC) set('gearLeg' + i, leg.retractC, leg.retractAngle * (1 - legT));
      show('gearLeg' + i, !retr || legT > 0.004);
      const steer = gpt.steer ? -fm.gearSteer * (gpt.pos[1] >= 0 ? 1 : -1) : 0;
      set('gear' + i, ax.z, steer, [0, fm.gearComp[i] || 0, 0]);
      const contact = (fm.gearComp[i] || 0) > 0;
      let ws = this.wheelSpd[i] || 0;
      ws = contact ? fm.gs : retr && fm.gearPos < 0.9 ? 0 : ws * Math.exp(-dt * 0.4);
      this.wheelSpd[i] = ws;
      this.wheelRoll[i] = (this.wheelRoll[i] || 0) + ws * dt;
      for (let k = 0; k < 4; k++) {
        const nm = `wheel${i}_${k}`;
        if (!N[nm]) break;
        set(nm, ax.x, -((this.wheelRoll[i] / (N[nm].r || 0.3)) % (Math.PI * 2)));
      }
    }
    for (const name in N) {
      const n = N[name];
      if (!n.extra) continue;
      if (n.extra === 'tvc') {
        set(name, n.axisC || ax.x, e * 0.6);
        continue;
      }
      let st;
      if (n.extra === 'levcon') st = clamp(((fm.alpha || 0) - 0.05) * 3, 0, 1);
      else if (n.extra === 'spike') st = clamp(((fm.mach || 0) - 1.6) / 1.4, 0, 1);
      else st = this.extraState[n.extra] || 0;
      if (n.hideClosed) show(name, st > 0.02);
      if (n.slideG) set(name, ax.x, 0, [n.slideG[0] * st, n.slideG[1] * st, n.slideG[2] * st]);
      else set(name, n.axisC || ax.x, n.extraAngle * st);
    }
    const open = clamp(fm.gearPos * 3, 0, 1);
    for (const nm of ['doorNR', 'doorNL']) if (N[nm]) set(nm, N[nm].axisC || ax.y, N[nm].openAngle * open);
    for (const name in N) {
      const n = N[name];
      if (!n.gdoor) continue;
      if (n.gdoor.hideUp) {
        show(name, !retr || fm.gearPos > 0.03);
        continue;
      }
      let t = doorT;
      if (n.gdoor.closeAfter) t *= 1 - sm(0.92, 1.0, fm.gearPos);
      set(name, n.axisC || ax.y, n.gdoor.close * (1 - t));
    }
  }

  // ---------------------------------------------------------------- arayüz (GökSim paneli)
  toast(msg, kind = 'info', ms = 2600) {
    const box = $('#gs-toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  bindUI() {
    $$('#gs-toolbar [data-open]').forEach((b) => b.addEventListener('click', () => this.togglePanel(b.dataset.open)));
    $('#gs-tb-pause').addEventListener('click', () => this.togglePause());
    $('#gs-tb-exit').addEventListener('click', () => this.stop());
    $('#gs-drawer-close').addEventListener('click', () => this.closePanel());
    $$('[data-gcam]').forEach((b) => b.addEventListener('click', () => this.setCamera(b.dataset.gcam)));
    $('#gs-cam-reset').addEventListener('click', () => this.cam.resetView());
    $('#gs-crash-reset').addEventListener('click', () => this.spawnAtRunway());
    $('#gs-crash-exit').addEventListener('click', () => this.stop());
    $('#gs-pause-resume').addEventListener('click', () => this.togglePause());
    // otopilot
    $('#gs-ap-toggle').addEventListener('click', () => this.toggleAP());
    $('#gs-ap-sync').addEventListener('click', () => {
      const ap = this.ap, fm = this.fm;
      ap.hdgDeg = Math.round(fm.heading / DEG) % 360;
      ap.altFt = Math.max(0, Math.round(fm.alt / FT / 100) * 100);
      ap.spdKt = Math.round(fm.ias / KT);
      this.renderAP();
    });
    $$('#gs [data-ap]').forEach((inp) => inp.addEventListener('change', () => {
      const ap = this.ap;
      const v = parseFloat(inp.value);
      if (!isFinite(v)) return this.renderAP();
      const k = inp.dataset.ap;
      if (k === 'hdg') ap.hdgDeg = ((Math.round(v) % 360) + 360) % 360;
      if (k === 'alt') ap.altFt = clamp(Math.round(v), 0, 60000);
      if (k === 'vs') ap.vsFpm = clamp(Math.abs(Math.round(v)), 100, 8000);
      if (k === 'spd') ap.spdKt = clamp(Math.round(v), 30, 900);
      this.renderAP();
    }));
    $$('#gs [data-ap-step]').forEach((b) => b.addEventListener('click', () => {
      const [k, d] = b.dataset.apStep.split(':');
      const ap = this.ap, n = parseFloat(d);
      if (k === 'hdg') ap.hdgDeg = (((ap.hdgDeg + n) % 360) + 360) % 360;
      if (k === 'alt') ap.altFt = clamp(ap.altFt + n, 0, 60000);
      if (k === 'vs') ap.vsFpm = clamp(ap.vsFpm + n, 100, 8000);
      if (k === 'spd') ap.spdKt = clamp(ap.spdKt + n, 30, 900);
      this.renderAP();
    }));
    // ayarlar
    const S = this.S;
    const bind = (id, key, type) => {
      const el = $(id);
      const read = () => (type === 'bool' ? el.checked : type === 'num' ? parseFloat(el.value) : el.value);
      el.addEventListener('change', () => {
        S[key] = read();
        saveS(S);
        this.applySetting(key);
        if (key === 'realistic') this.syncSettings();
      });
      if (type === 'num' && el.type === 'range') el.addEventListener('input', () => {
        S[key] = read();
        this.applySetting(key);
      });
    };
    bind('#gs-set-realistic', 'realistic', 'bool');
    bind('#gs-set-hud', 'hud', 'bool');
    bind('#gs-set-panel', 'panel', 'bool');
    bind('#gs-set-turb', 'turb', 'num');
    bind('#gs-set-control', 'control', 'str');
    bind('#gs-set-sens', 'sensitivity', 'num');
    bind('#gs-set-invert', 'invertPitch', 'bool');
    bind('#gs-set-autorudder', 'autoRudder', 'bool');
    bind('#gs-set-sound', 'sound', 'bool');
    bind('#gs-set-volume', 'volume', 'num');
    this.syncSettings();
    $('#gs').classList.toggle('mouse-yoke', S.control === 'mouse');
    // gösterge paneli yüksekliği: dokunmatik kontroller panelin üstünde dursun
    const bottom = $('#gs-bottom');
    const setH = () => $('#gs').style.setProperty('--bottom-h', bottom.offsetHeight + 'px');
    if (window.ResizeObserver) new ResizeObserver(setH).observe(bottom);
    setH();
  }

  syncSettings() {
    const S = this.S;
    const set = (id, v) => {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    };
    set('#gs-set-realistic', S.realistic);
    set('#gs-set-hud', S.hud);
    set('#gs-set-panel', S.panel);
    set('#gs-set-turb', S.turb);
    set('#gs-set-control', S.control);
    set('#gs-set-sens', S.sensitivity);
    set('#gs-set-invert', S.invertPitch);
    set('#gs-set-autorudder', S.autoRudder);
    set('#gs-set-sound', S.sound);
    set('#gs-set-volume', S.volume);
    const ar = $('#gs-set-autorudder');
    ar.disabled = !!S.realistic;
  }

  togglePanel(name) {
    if (this.current === name) this.closePanel();
    else this.openPanel(name);
  }
  openPanel(name) {
    $$('#gs-drawer [data-panel]').forEach((s) => (s.hidden = s.dataset.panel !== name));
    const sec = $(`#gs-drawer [data-panel="${name}"]`);
    $('#gs-drawer-title').textContent = sec ? sec.dataset.title : '';
    $('#gs-drawer').hidden = false;
    this.current = name;
    $$('#gs-toolbar [data-open]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.open === name ? 'true' : 'false'));
    if (name === 'autopilot') this.renderAP();
    if (name === 'extras') this.renderExtras();
    if (name === 'aircraft') this.renderHangar();
  }
  closePanel() {
    $('#gs-drawer').hidden = true;
    this.current = null;
    $$('#gs-toolbar [data-open]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  renderHangar() {
    const box = $('#gs-ac-list');
    box.innerHTML = '';
    const own = this.owned();
    for (const { id, price } of HANGAR) {
      const def = hangarDef(id);
      const have = own.includes(id);
      const b = document.createElement('button');
      b.className = 'ac-card';
      b.setAttribute('aria-current', id === this.def.id ? 'true' : 'false');
      b.innerHTML = `<span class="ac-name">${esc(def.name)}${have ? '' : ' 🔒'}</span><span class="ac-specs">${esc(def.specs)}</span><span class="ac-hint">${have ? esc(def.hint) : `Satın al: ${money(price)} (kasada ${money(this.game.econ.money)})`}</span>`;
      b.addEventListener('click', () => {
        if (!have) {
          if (this.game.econ.money < price) return this.toast('Bu uçak için para yetmiyor', 'warn');
          if (this.sure !== id) {
            this.sure = id;
            return this.toast(`${def.name}: ${money(price)}. Satın almak için yeniden dokunun.`, 'info', 3500);
          }
          this.sure = null;
          if (!this.buy(id)) return this.toast('Bu uçak için para yetmiyor', 'warn');
          this.toast(`${def.name} hangara katıldı`, 'good');
        }
        this.selectAircraft(id);
        this.renderHangar();
      });
      box.appendChild(b);
    }
  }

  renderExtras() {
    const box = $('#gs-ex-list');
    const def = this.def;
    const list = def.extras || [];
    box.innerHTML = '';
    $('#gs-ex-empty').hidden = list.length > 0;
    list.forEach((ex) => {
      const on = !!(this.extraTarget && this.extraTarget[ex.id]);
      const b = document.createElement('button');
      b.className = 'cam-btn';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML = `<b>${esc(ex.label)}</b><span>${esc(ex.hint || '')}</span><span class="ex-state">${on ? 'Açık' : 'Kapalı'}</span>`;
      b.addEventListener('click', () => this.toggleExtra(ex.id));
      box.appendChild(b);
    });
    const auto = def.autoExtras || [];
    $('#gs-ex-auto').textContent = auto.length ? 'Kendiliğinden çalışanlar: ' + auto.join(', ') + '.' : '';
  }

  renderAP() {
    if (!this.ap) return;
    const ap = this.ap;
    const vals = { hdg: String(Math.round(ap.hdgDeg)).padStart(3, '0'), alt: Math.round(ap.altFt), vs: Math.round(ap.vsFpm), spd: Math.round(ap.spdKt) };
    $$('#gs [data-ap]').forEach((i) => {
      if (document.activeElement !== i) i.value = vals[i.dataset.ap];
    });
    const t = $('#gs-ap-toggle');
    t.setAttribute('aria-pressed', ap.on ? 'true' : 'false');
    t.textContent = ap.on ? 'Otopilotu kapat' : 'Otopilotu aç';
  }

  updateHud() {
    const el = $('#gs-hud');
    const fm = this.fm;
    if (!this.S.hud) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
    const vs = fm.vs / FPM;
    const rows = [
      ['IAS', `${fmt(fm.ias / KT)} kt`],
      ['GS', `${fmt(fm.gs / KT)} kt`],
      ['İrtifa', `${fmt(fm.alt / FT)} ft`],
      ['Yerden', `${fmt(Math.max(0, fm.agl) / FT)} ft`],
      ['Dikey', `${vs >= 0 ? '+' : '−'}${fmt(Math.abs(vs))} ft/dk`],
      ['Baş', `${String(Math.round(fm.heading / DEG) % 360).padStart(3, '0')}°`],
    ];
    if (fm.def.engine.type === 'jet') rows.push(['Mach', (fm.mach || 0).toFixed(2)]);
    if (this.S.realistic && fm.def.fuel) rows.push(['Yakıt', `${fmt(fm.fuel)} kg`]);
    rows.push(['G', (fm.nz || 0).toFixed(1)]);
    // havalimanına uzaklık ve pist
    const p = this.pos3();
    const dk = Math.hypot(p.x, p.z) / 1000;
    rows.push(['Havalimanı', `${dk.toFixed(1).replace('.', ',')} km`]);
    el.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
}
const _p = new THREE.Vector3();
const _AX = new THREE.Vector3(1, 0, 0), _AZ = new THREE.Vector3(0, 1, 0), _AY = new THREE.Vector3(0, 0, -1);
