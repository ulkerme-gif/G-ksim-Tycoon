// Havalimanı Tycoon — giriş noktası
import * as THREE from 'three';
import { CELL, MAP_W, MAP_H, G, TIME_SCALE, SPEEDS } from './config.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { World } from './world.js';
import { CameraRig } from './camera.js';
import { Builder } from './build.js';
import { Sim } from './sim.js';
import { Economy } from './economy.js';
import { Progress } from './progress.js';
import { Rain } from './weather.js';
import { UI } from './ui.js';
import { loadAssets } from './assets.js';
import { clamp, lerp, money } from './util.js';

const SAVE_KEY = 'havalimani.save.v1';

class Game {
  constructor() {
    const canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 2, 40000);
    this.sky = new THREE.Color();
    this.scene.background = this.sky;
    this.scene.fog = new THREE.Fog(0x9cc3e6, 5000, 16000);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x55603f, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff3dd, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // metal yüzeyler için hafif ortam yansıması
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    this.speed = 1;
    this.lastSpeed = 1;
    this.time = 6 * 60;
    this.rig = new CameraRig(this.camera, canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  async start() {
    await loadAssets();
    this.world = new World(this.scene);
    this.econ = new Economy(this);
    this.prog = new Progress(this);
    this.rain = new Rain(this.scene);
    this.sim = new Sim(this);
    this.builder = new Builder(this);
    this.ui = new UI(this);
    const B = this.builder;
    this.rig.buildDrag = () => B.isPaint();
    this.rig.onDrag = (p, x, y) => B.onDrag(p, x, y);
    this.rig.onHover = (x, y) => B.onHover(x, y);
    this.rig.onTap = (x, y, type) => B.onTap(x, y, type);
    this.econ.genOffers();
    this.econ.newWind();
    document.getElementById('loading').remove();
    if (this.hasSave()) this.load(true);
    else this.welcome();
    document.getElementById('file-in').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) this.readFile(f);
    });
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.code === 'KeyS') {
        e.preventDefault();
        this.exportFile();
      } else if (e.code === 'KeyO') {
        e.preventDefault();
        this.importFile();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save(false);
    });
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
    window.game = this;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  day() {
    return Math.floor(this.time / 1440) + 1;
  }

  setSpeed(s) {
    if (s) this.lastSpeed = s;
    this.speed = s;
  }

  changed() {
    this.ui.renderSel();
    if (this.ui.panel === 'guide') this.ui.renderPanel();
  }

  // ---------------------------------------------------------------- seçim
  select(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const acHits = ray.intersectObjects(this.sim.ac.map((a) => a.mesh), true);
    if (acHits.length) {
      const ac = this.sim.aircraftByMesh(acHits[0].object);
      if (ac) return this.ui.select({ ac });
    }
    const roots = [];
    for (const o of this.world.objects.values()) {
      if (o.mesh) roots.push(o.mesh);
      if (o.decal) roots.push(o.decal);
    }
    const hits = ray.intersectObjects(roots, true);
    for (const h of hits) {
      let ob = h.object;
      while (ob && ob.userData.objId === undefined) ob = ob.parent;
      if (ob) return this.ui.select({ obj: this.world.objects.get(ob.userData.objId) });
    }
    const p = this.rig.ground(x, y);
    if (p) {
      const o = this.world.objAt(Math.floor(p.x / CELL + MAP_W / 2), Math.floor(p.z / CELL + MAP_H / 2));
      if (o) return this.ui.select({ obj: o });
    }
    this.ui.select(null);
  }

  followAc(ac) {
    this.rig.follow = () => (this.sim.ac.includes(ac) ? { x: ac.x, z: ac.z } : null);
    this.rig.anchor = null;
    this.rig.distGoal = Math.min(this.rig.distGoal, 420);
  }

  // ---------------------------------------------------------------- döngü
  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.rig.update(dt);
    if (this.speed > 0) {
      let rem = dt * this.speed;
      while (rem > 1e-4) {
        const s = Math.min(rem, 0.05);
        rem -= s;
        const hourBefore = Math.floor(this.time / 60);
        this.time += (s * TIME_SCALE) / 60;
        const d = this.day();
        if (d > this.econ.lastDay) {
          this.econ.lastDay = d;
          this.econ.newDay(d);
        }
        this.sim.update(s, this.time);
        if (Math.floor(this.time / 60) !== hourBefore) this.save(false);
      }
    }
    this.lighting(dt);
    this.ui.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  lighting(dt = 0) {
    const m = this.time % 1440;
    // gün doğumu 06:00, batımı 20:00
    const k = (m - 360) / 840;
    const elev = Math.sin(clamp(k, -0.15, 1.15) * Math.PI);
    const day = clamp(elev * 1.6 + 0.15, 0, 1);
    const az = lerp(-1.9, 1.9, clamp(k, 0, 1));
    const tg = this.rig.target;
    const dir = new THREE.Vector3(Math.sin(az) * 0.8, Math.max(0.15, elev), -Math.cos(az) * 0.6).normalize();
    this.sun.position.copy(tg).addScaledVector(dir, 2500);
    this.sun.target.position.copy(tg);
    const S = clamp(this.rig.dist * 1.0, 350, 1800);
    const c = this.sun.shadow.camera;
    if (c.right !== S) {
      c.left = -S;
      c.right = S;
      c.top = S;
      c.bottom = -S;
      c.near = 10;
      c.far = 6000;
      c.updateProjectionMatrix();
    }
    const warm = 1 - clamp(Math.abs(elev) * 2.5, 0, 1);
    this.sun.color.setRGB(1, lerp(0.95, 0.72, warm), lerp(0.86, 0.5, warm));
    this.sun.intensity = 2.4 * clamp(elev * 1.5, 0, 1);
    this.hemi.intensity = lerp(0.3, 0.95, day);
    this.scene.environmentIntensity = lerp(0.03, 0.16, day);
    this.sky.setRGB(lerp(0.05, 0.6, day) + warm * 0.12 * day, lerp(0.08, 0.76, day), lerp(0.17, 0.9, day));
    this.renderer.toneMappingExposure = lerp(1.25, 1.0, day);
    // hava: sis ve fırtına
    const P = this.prog;
    const fog = P ? P.fogAt(this.time) : 0;
    const storm = P ? P.stormAt(this.time) : 0;
    const F = this.scene.fog;
    F.near = lerp(lerp(5000, 40, fog), 900, storm * 0.85);
    F.far = lerp(lerp(16000, 1500, fog), 5000, storm * 0.85);
    if (fog || storm) {
      const gy = lerp(0.06, 0.62, day);
      this.sky.lerp(new THREE.Color(gy, gy * 1.02, gy * 1.06), Math.max(fog * 0.9, storm * 0.9));
      this.sky.multiplyScalar(1 - 0.5 * storm);
      this.sun.intensity *= (1 - 0.8 * fog) * (1 - 0.85 * storm);
      this.hemi.intensity *= (1 - 0.45 * storm) * (1 - 0.1 * fog);
      this.scene.environmentIntensity *= 1 - 0.6 * storm;
      this.renderer.toneMappingExposure *= (1 - 0.28 * storm) * (1 - 0.06 * fog);
    }
    const R = this.rig;
    const flash = this.rain.update(dt * Math.min(this.speed || 0.3, 2), storm, R.target, clamp(R.dist / 600, 0.4, 4));
    if (flash) {
      this.hemi.intensity += flash * 2.2;
      this.renderer.toneMappingExposure += flash * 0.35;
    }
    F.color.copy(this.sky);
  }

  // ---------------------------------------------------------------- kayıt
  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return false;
    }
  }

  serialize() {
    const W = this.world;
    const runs = [];
    let prev = -1, n = 0;
    for (let k = 0; k < W.ground.length; k++) {
      let v = W.ground[k];
      if (W.obj[k] >= 0 || v === G.RUNWAY) v = 0;
      if (v === prev) n++;
      else {
        if (n) runs.push(prev, n);
        prev = v;
        n = 1;
      }
    }
    runs.push(prev, n);
    const objects = [...W.objects.values()].map((o) => ({ id: o.id, kind: o.kind, i: o.i, j: o.j, rot: o.rot, len: o.len, size: o.size, num: o.num, jetway: !!o.jetway, active: o.active || 0 }));
    const flights = this.sim.flights.filter((f) => f.status === 'planned' && f.arr > this.time).map((f) => ({ ...f }));
    const R = this.rig;
    const cam = { x: Math.round(R.target.x), z: Math.round(R.target.z), dist: Math.round(R.dist), yaw: +R.yaw.toFixed(3), pitch: +R.pitch.toFixed(3) };
    return { v: 1, time: this.time, speed: this.lastSpeed, ground: runs, objects, standNum: W.standNum, econ: this.econ.toJSON(), progress: this.prog.toJSON(), flights, lastDay: this.econ.lastDay, cam };
  }

  // ---------------------------------------------------------------- kayıt dosyası (indir / yükle)
  validate(s) {
    if (!s || typeof s !== 'object') throw new Error('bu bir oyun kaydı değil');
    if (s.game && s.game !== 'havalimani-tycoon') throw new Error('başka bir oyunun dosyası');
    if (s.v !== 1 || !Array.isArray(s.ground) || !Array.isArray(s.objects) || !s.econ || typeof s.time !== 'number') throw new Error('kayıt biçimi tanınmadı');
    let n = 0;
    for (let r = 1; r < s.ground.length; r += 2) n += s.ground[r];
    if (n !== MAP_W * MAP_H) throw new Error('harita boyutu uyuşmuyor');
    for (const o of s.objects) if (!['runway', 'stand', 'terminal', 'tower', 'hangar'].includes(o.kind)) throw new Error('tanınmayan yapı: ' + o.kind);
  }

  exportFile() {
    const s = { game: 'havalimani-tycoon', savedAt: new Date().toISOString(), ...this.serialize() };
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    const name = `havalimani-${this.day()}-gun-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.save(false);
    this.ui.toast(`Kayıt dosyası indirildi: ${name}`, 'good');
  }

  importFile() {
    const inp = document.getElementById('file-in');
    inp.value = '';
    inp.click();
  }

  readFile(file) {
    const rd = new FileReader();
    rd.onerror = () => this.ui.toast('Dosya okunamadı', 'bad');
    rd.onload = () => {
      let s;
      try {
        s = JSON.parse(String(rd.result).replace(/^\uFEFF/, ''));
        this.validate(s);
      } catch (e) {
        this.ui.toast(`Kayıt dosyası açılamadı: ${e.message || 'geçersiz dosya'}`, 'bad');
        return;
      }
      const day = Math.floor(s.time / 1440) + 1;
      const when = s.savedAt ? new Date(s.savedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      this.ui.ask('Kayıt dosyası yüklensin mi?', `${file.name}: ${day}. gün, kasada ${money(s.econ.money)}${when ? `, kaydedildiği an ${when}` : ''}. Şu anki oyun bu kayıtla değişir.`, 'Yükle', () => {
        const backup = this.serialize();
        try {
          this.apply(s);
          this.save(false);
          this.ui.toast(`Kayıt yüklendi: ${day}. gün`, 'good');
        } catch (e) {
          console.error(e);
          this.apply(backup);
          this.ui.toast('Kayıt yüklenemedi, oyun eski haline döndü', 'bad');
        }
      });
    };
    rd.readAsText(file);
  }

  save(manual) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      if (manual) this.ui.toast('Oyun kaydedildi', 'good');
    } catch (e) {
      if (manual) this.ui.toast('Kaydedilemedi: tarayıcı depolaması kapalı olabilir', 'bad');
    }
  }

  resetWorld() {
    this.sim.clear();
    this.scene.remove(this.world.root);
    this.world = new World(this.scene);
    this.sim.world = this.world;
    this.sim.compVersion = -1;
    this.builder.world = this.world;
    this.builder.setTool('select');
    this.ui.select(null);
  }

  apply(s) {
    this.resetWorld();
    const W = this.world;
    let k = 0;
    for (let r = 0; r < s.ground.length; r += 2) {
      W.ground.fill(s.ground[r], k, k + s.ground[r + 1]);
      k += s.ground[r + 1];
    }
    for (const o of s.objects) {
      const ob = W.add(o.kind, o.i, o.j, o.rot, o.kind === 'runway' ? { len: o.len, active: o.active } : o.kind === 'stand' ? { size: o.size, num: o.num, jetway: o.jetway } : {}, o.id);
      ob.active = o.active;
    }
    W.standNum = s.standNum || W.standNum;
    W.rebuildSurfaces();
    this.time = s.time;
    this.econ.fromJSON(s.econ);
    this.econ.lastDay = s.lastDay || this.day();
    this.sim.flights = s.flights || [];
    this.lastSpeed = s.speed || 1;
    this.prog = new Progress(this);
    this.prog.fromJSON(s.progress);
    this.ui.resetDots();
    if (s.cam) {
      const R = this.rig;
      R.follow = null;
      R.target.set(s.cam.x || 0, 0, s.cam.z || 0);
      R.dist = s.cam.dist || 900;
      R.yaw = s.cam.yaw ?? R.yaw;
      R.pitch = s.cam.pitch ?? R.pitch;
      R.apply();
    }
  }

  load(silent) {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      this.apply(s);
      if (!silent) this.ui.toast('Kayıtlı oyun yüklendi', 'good');
      else this.ui.toast(`Hoş geldiniz! ${this.day()}. gün, kasada ${money(this.econ.money)}`, 'info');
    } catch (e) {
      console.error(e);
      this.ui.toast('Kayıt okunamadı, yeni oyun başlıyor', 'bad');
      this.newGame();
    }
  }

  newGame(starter) {
    this.resetWorld();
    this.econ = new Economy(this);
    this.prog = new Progress(this);
    this.ui.resetDots();
    this.sim.flights = [];
    this.time = 8 * 60;
    this.econ.lastDay = 1;
    this.econ.genOffers();
    this.econ.newWind();
    if (starter) this.buildStarter();
    this.prog.startDay(1, true);
    this.rig.target.set(0, 0, starter ? -120 : 0);
    this.rig.dist = starter ? 700 : 1100;
    this.save(false);
    this.ui.openPanel('guide');
  }

  welcome() {
    this.ui.modal(`<h2>Havalimanı Tycoon</h2>
      <p>Boş bir arazide kendi havalimanınızı kurun: pist, taksi yolları, terminal, park yerleri ve yolcu köprüleri. Havayollarıyla anlaşın, uçuşları gecikmeden karşılayın, büyüdükçe daha büyük havayollarını çekin.</p>
      <div class="col"><button class="btn primary" data-m="empty">Boş araziyle başla</button><button class="btn" data-m="starter">Hazır küçük havalimanıyla başla</button></div>
      <p class="muted">iPad'de: tek parmak kaydırır, iki parmak yakınlaştırır ve döndürür. İnşaat araçları soldadır.</p>`, (k) => this.newGame(k === 'starter'));
  }

  // küçük bir başlangıç havalimanı: 1.600 m pist, paralel taksi yolu, terminal, 3 park yeri (2 köprülü), kule
  buildStarter() {
    const W = this.world;
    const ci = MAP_W / 2, cj = MAP_H / 2;
    const r = W.add('runway', ci - 50, cj - 16, 1, { len: 100 });
    this.econ.setActive(r);
    const taxi = [];
    const tj = cj - 11;
    for (let i = ci - 48; i <= ci + 47; i++) taxi.push([i, tj]);
    for (const i of [ci - 48, ci - 4, ci + 47]) for (let j = cj - 13; j < tj; j++) taxi.push([i, j]);
    W.paint(taxi, G.TAXI);
    const apron = [];
    for (let i = ci - 12; i <= ci + 1; i++) apron.push([i, tj + 1]);
    W.paint(apron, G.APRON);
    const sj = tj + 2;
    const stands = [ci - 10, ci - 7, ci - 4].map((i) => W.add('stand', i, sj, 2, { size: 'S' }));
    W.add('terminal', ci - 10, sj + 3, 0, {});
    for (const s of stands.slice(0, 2)) {
      s.jetway = true;
      W.attachJetway(s);
    }
    W.add('tower', ci + 4, sj + 4, 0, {});
    this.econ.money = 6_000_000;
  }
}

const game = new Game();
game.start().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Oyun yüklenemedi: ' + e.message;
});
void SPEEDS;
