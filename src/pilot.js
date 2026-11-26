// Pilot modu (Uçuş kulübü yükseltmesi): kendi havalimanınızın pistinden kalkış, serbest uçuş ve iniş.
// Uçuş modeli oyun için basitleştirilmiştir ve bağışlayıcıdır: çubuk bırakılınca kanatlar kendiliğinden düzelir,
// iniş takımı açık ve dikey hız makulse iniş kazasız olur.
import * as THREE from 'three';
import { AIRCRAFT } from './config.js';
import { makeAircraft } from './assets.js';
import { dirOf, clamp, wrapPi, money, num } from './util.js';
import { LU, makePool } from './lights.js';

const LIVERY = { id: 'PL', name: 'Uçuş Kulübü', code: 'UK', tail: '#f5c518', stripe: '#1b2430' };
const DEG = Math.PI / 180;
const GRAV = 9.81;
const KT = 1.94384, FT = 3.28084;
const STALL = 15 * DEG;
export const PILOT_TYPES = ['regional', 'narrow', 'wide'];
// vref: iniş hızı (m/s); alpha0: vref'te temiz kanatla gereken hücum açısı
const FM = {
  regional: { vr: 62, vref: 66, alpha0: 7 * DEG, thrust: 3.7, cd: 1.35e-4, pitchRate: 0.3, rollMax: 50, rollRate: 45 },
  narrow: { vr: 70, vref: 71, alpha0: 7 * DEG, thrust: 3.3, cd: 1.25e-4, pitchRate: 0.25, rollMax: 45, rollRate: 36 },
  wide: { vr: 80, vref: 76, alpha0: 7 * DEG, thrust: 2.8, cd: 1.1e-4, pitchRate: 0.19, rollMax: 40, rollRate: 26 },
};
const FLAP_K = [1, 1.18, 1.36];
const FLAP_DRAG = [0, 0.25, 0.7];
const GRADES = [
  [60, 'Kusursuz iniş', 200_000],
  [180, 'Yumuşak iniş', 120_000],
  [400, 'İyi iniş', 60_000],
  [700, 'Sert iniş', 20_000],
  [1e9, 'Çok sert iniş', 0],
];

export class Pilot {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.ac = null;
    this.pending = null;
    this.token = { player: true };
    this.keys = new Set();
    this.joy = { x: 0, y: 0, id: null };
    this.camMode = 'chase';
    this.orbitYaw = 0;
    this.orbitPitch = 0.16;
    this.camDist = 0;
    this.camH = 0;
    this.invert = false;
    try {
      this.invert = localStorage.getItem('havalimani.pilotInvert') === '1';
    } catch (e) {
      /* yok */
    }
    this.bind();
  }

  unlocked() {
    const n = this.game.prog.up('pilot');
    return PILOT_TYPES.slice(0, n);
  }

  // ---------------------------------------------------------------- başlatma / bitirme
  openMenu() {
    const g = this.game, ui = g.ui, W = g.world;
    const types = this.unlocked();
    if (!types.length) return ui.toast('Önce Yükseltmeler sekmesinden Uçuş kulübünü alın', 'warn');
    const rws = W.list('runway');
    if (!rws.length) return ui.toast('Uçmak için bir pist gerekli', 'warn');
    let type = types.includes(this.lastType) ? this.lastType : types[0];
    const ends = [];
    for (const r of rws) {
      const inf = W.runwayInfo(r);
      inf.ends.forEach((e, k) => ends.push({ r, k, name: e.name, len: inf.len, active: (r.active || 0) === k }));
    }
    let sel = ends.find((e) => e.active) || ends[0];
    const html = () => `<h2>Uçuş kulübü</h2>
      <p class="muted">Kendi uçağınızla pistten kalkın, havalimanınızın üstünde dolaşın ve geri inin. Uçuş sırasında oyun 1× hızda akar.</p>
      <h3>Uçak</h3><div class="row pick" id="pk-type">${PILOT_TYPES.map((t) => `<button class="btn ${t === type ? 'primary' : ''}" data-pt="${t}" ${types.includes(t) ? '' : 'disabled'}>${AIRCRAFT[t].name}${types.includes(t) ? '' : ' 🔒'}</button>`).join('')}</div>
      <h3>Kalkış pisti</h3><div class="row pick" id="pk-rwy">${ends.map((e, k) => `<button class="btn ${e === sel ? 'primary' : ''}" data-pr="${k}">Pist ${e.name} · ${num(e.len)} m${e.active ? ' · rüzgâra karşı' : ''}</button>`).join('')}</div>
      ${sel.len < AIRCRAFT[type].minRunway ? `<p class="warnc">Bu pist ${AIRCRAFT[type].name.toLowerCase()} için kısa (en az ${num(AIRCRAFT[type].minRunway)} m).</p>` : ''}
      <table class="keys"><tr><td>Çubuk</td><td>Sol alttaki daireyi sürükleyin · klavye: oklar / WASD (↑ burun aşağı, ↓ burun yukarı)</td></tr>
      <tr><td>Gaz</td><td>Sağdaki çubuk · PageUp/PageDown, + / −, Shift / Ctrl</td></tr>
      <tr><td>Takım, flap, fren</td><td>G, F, B (Boşluk basılı tutunca fren) · ekrandaki düğmeler</td></tr>
      <tr><td>Kamera</td><td>C ile takip / kokpit / kule · ekranı sürükleyip çevirin, kıstırıp yakınlaştırın</td></tr>
      <tr><td>İpucu</td><td>Gazı tam açın, ${Math.round(FM[type].vr * KT)} kt'ta çubuğu çekin. İnişte flap 2, takım aşağı, PAPI ışıklarında 2 beyaz 2 kırmızı.</td></tr></table>
      <label class="chk"><input type="checkbox" id="pk-inv" ${this.invert ? 'checked' : ''}> Çubuğu ters çevir (yukarı sürükleyince burun kalksın)</label>
      <div class="row"><button class="btn primary" data-m="go" ${sel.len < AIRCRAFT[type].minRunway ? 'disabled' : ''}>Kalkışa geç</button><button class="btn" data-m="close">Vazgeç</button></div>`;
    const render = () => {
      ui.modal(html(), (k) => {
        if (k === 'go') this.start(type, sel.r, sel.k);
      });
      const card = document.getElementById('modal-card');
      card.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => {
        type = b.dataset.pt;
        render();
      }));
      card.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => {
        sel = ends[+b.dataset.pr];
        render();
      }));
      card.querySelector('#pk-inv').addEventListener('change', (e) => {
        this.invert = e.target.checked;
        try {
          localStorage.setItem('havalimani.pilotInvert', this.invert ? '1' : '0');
        } catch (err) {
          /* yok */
        }
      });
    };
    render();
  }

  start(type, r, endIdx) {
    const g = this.game;
    this.lastType = type;
    this.active = true;
    this.pending = { type, rid: r.id, endIdx };
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
    document.getElementById('fly').hidden = false;
    this.camMode = 'chase';
    this.orbitYaw = 0;
    this.orbitPitch = 0.16;
    this.camDist = 0;
    this.msg('');
  }

  trySpawn() {
    const g = this.game, W = g.world, S = g.sim;
    const p = this.pending;
    const r = W.objects.get(p.rid);
    if (!r) return this.stop();
    const inf = W.runwayInfo(r);
    const e = inf.ends[p.endIdx];
    const d = dirOf(e.h);
    // pist boşalana kadar eşikten bak
    const st = S.runwayState(r);
    if (st.busy || S.arrivalClose(r, 70)) {
      this.msg(`Pist ${e.name} dolu: kalkış izni bekleniyor…`, 'warn');
      const cam = g.camera;
      cam.position.set(e.from.x - d.x * 120 + d.z * 60, 35, e.from.z - d.z * 120 - d.x * 60);
      cam.lookAt(e.from.x + d.x * 400, 0, e.from.z + d.z * 400);
      cam.updateMatrixWorld();
      return;
    }
    st.busy = { ac: this.token, kind: 'player' };
    this.pending = null;
    const t = AIRCRAFT[p.type];
    const mesh = makeAircraft(p.type, LIVERY);
    g.scene.add(mesh);
    this.ac = {
      type: p.type, t, fm: FM[p.type], mesh,
      pos: new THREE.Vector3(e.from.x + d.x * 40, 0, e.from.z + d.z * 40),
      h: e.h, pitch: 0, roll: 0, V: 0, gamma: 0, thr: 0, lever: 0, flaps: 1, gearDown: true, gearT: 1, brake: false, spoilers: false,
      onGround: true, airT: 0, flown: false, scored: false, crashed: false, maxAlt: 0, rwyName: e.name,
    };
    this.camH = e.h;
    this.msg(`Pist ${e.name}: kalkışa hazır. Gazı tam açın.`, 'good');
    this.place();
  }

  stop() {
    const g = this.game;
    this.release();
    if (this.ac) {
      g.scene.remove(this.ac.mesh);
      if (this.ac.pool) g.scene.remove(this.ac.pool);
    }
    const A = this.ac;
    this.ac = null;
    this.pending = null;
    this.active = false;
    document.body.classList.remove('flying');
    document.getElementById('fly').hidden = true;
    g.camera.fov = 42;
    g.camera.updateProjectionMatrix();
    const R = g.rig;
    R.disabled = false;
    R.pointers.clear();
    if (A && Math.hypot(A.pos.x, A.pos.z) < 2500) {
      R.target.set(A.pos.x, 0, A.pos.z);
      R.dist = 420;
    } else if (this.savedRig) {
      R.target.set(this.savedRig.x, 0, this.savedRig.z);
      R.dist = this.savedRig.dist;
      R.yaw = this.savedRig.yaw;
      R.pitch = this.savedRig.pitch;
    }
    R.apply();
    g.setSpeed(this.prevSpeed || 1);
    this.keys.clear();
  }

  release() {
    const S = this.game.sim;
    for (const [, st] of S.rw) if (st.busy && st.busy.ac === this.token) st.busy = null;
  }

  // ---------------------------------------------------------------- girdiler
  bind() {
    const $ = (s) => document.getElementById(s);
    window.addEventListener('keydown', (e) => {
      if (!this.active || (e.target.closest && e.target.closest('input,textarea'))) return;
      if (!document.getElementById('modal').hidden) return;
      const c = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'].includes(c)) e.preventDefault();
      if (!e.repeat) {
        if (c === 'KeyG') this.cmd('gear');
        if (c === 'KeyF') this.cmd('flaps');
        if (c === 'KeyB') this.cmd('brake');
        if (c === 'KeyC') this.cmd('cam');
        if (c === 'Escape') this.cmd('exit');
        if (c === 'KeyP') this.game.setSpeed(this.game.speed ? 0 : 1);
      }
      this.keys.add(c);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // ekrandaki düğmeler
    $('fly-btns').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) this.cmd(b.dataset.f);
    });
    $('fly-btn').addEventListener('click', () => this.openMenu());
    // çubuk (joystick)
    const stick = $('fly-stick'), knob = $('fly-knob');
    const R = 58;
    const setKnob = (x, y) => (knob.style.transform = `translate(${x * R}px, ${y * R}px)`);
    const stickMove = (e) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / R, y = (e.clientY - (r.top + r.height / 2)) / R;
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      this.joy.x = x;
      this.joy.y = y;
      setKnob(x, y);
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.joy.id = e.pointerId;
      try {
        stick.setPointerCapture(e.pointerId);
      } catch (err) {
        /* yok */
      }
      stickMove(e);
    });
    stick.addEventListener('pointermove', (e) => e.pointerId === this.joy.id && stickMove(e));
    const stickUp = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy = { x: 0, y: 0, id: null };
      setKnob(0, 0);
    };
    stick.addEventListener('pointerup', stickUp);
    stick.addEventListener('pointercancel', stickUp);
    // gaz kolu
    const thr = $('fly-thr');
    let thrId = null;
    const thrMove = (e) => {
      const r = thr.getBoundingClientRect();
      if (this.ac) this.ac.lever = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    };
    thr.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      thrId = e.pointerId;
      try {
        thr.setPointerCapture(e.pointerId);
      } catch (err) {
        /* yok */
      }
      thrMove(e);
    });
    thr.addEventListener('pointermove', (e) => e.pointerId === thrId && thrMove(e));
    thr.addEventListener('pointerup', () => (thrId = null));
    thr.addEventListener('pointercancel', () => (thrId = null));
    // kamera: ekranı sürükle = çevir, iki parmak = yakınlaştır, tekerlek = yakınlaştır
    const cv = this.game.renderer.domElement;
    const pts = new Map();
    let pinch = 0, lastTap = 0;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
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
      if (now - lastTap < 300 && pts.size === 1) {
        this.orbitYaw = 0;
        this.orbitPitch = 0.16;
        this.camDist = 0;
      }
      lastTap = now;
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.active || !pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 1) {
        this.orbitYaw -= dx * 0.006;
        this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -0.25, 1.35);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.zoomCam(pinch / d);
        pinch = d;
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      if (this.active) this.zoomCam(Math.exp(clamp(e.deltaY, -200, 200) * 0.002));
    }, { passive: true });
  }

  zoomCam(k) {
    if (!this.ac) return;
    const base = this.ac.t.len * 1.7 + 14;
    this.camDist = clamp((this.camDist || base) * k, this.ac.t.len * 0.7, 900);
  }

  cmd(c) {
    const A = this.ac;
    if (c === 'exit') return this.stop();
    if (c === 'again') {
      if (A && !A.onGround && !A.crashed) this.release();
      return this.restart();
    }
    if (c === 'cam') {
      this.camMode = { chase: 'cockpit', cockpit: 'tower', tower: 'chase' }[this.camMode];
      if (this.camMode === 'tower' && !this.game.world.list('tower').length) this.camMode = 'chase';
      this.orbitYaw = 0;
      this.game.ui.toast(`Kamera: ${{ chase: 'takip', cockpit: 'kokpit', tower: 'kule' }[this.camMode]}`);
      return;
    }
    if (!A || A.crashed) return;
    if (c === 'gear') {
      if (A.onGround) return this.msg('Yerdeyken iniş takımı toplanamaz', 'warn');
      A.gearDown = !A.gearDown;
    }
    if (c === 'flaps') A.flaps = (A.flaps + 1) % 3;
    if (c === 'brake') A.brake = !A.brake;
  }

  msg(text, kind = '') {
    const m = document.getElementById('fly-msg');
    if (m.textContent !== text) m.textContent = text;
    m.className = kind;
    m.hidden = !text;
  }

  // ---------------------------------------------------------------- döngü
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    if (this.pending) {
      this.trySpawn();
      if (this.pending) return;
    }
    const A = this.ac;
    if (g.speed > 0 && !A.crashed) {
      let rem = Math.min(dt, 0.1);
      while (rem > 1e-5) {
        const s = Math.min(rem, 1 / 60);
        this.step(s);
        rem -= s;
        if (A.crashed) break;
      }
    }
    this.place();
    this.reserve();
    this.camUpdate(dt);
    this.hud();
  }

  step(dt) {
    const A = this.ac, F = A.fm, K = this.keys;
    // girdiler: çubuk + klavye. iy > 0 burun yukarı
    let ix = this.joy.x, iy = this.invert ? -this.joy.y : this.joy.y;
    if (K.has('ArrowLeft') || K.has('KeyA')) ix = -1;
    if (K.has('ArrowRight') || K.has('KeyD')) ix = 1;
    if (K.has('ArrowUp') || K.has('KeyW')) iy = -1;
    if (K.has('ArrowDown') || K.has('KeyS')) iy = 1;
    // küçük dokunuşlarda yumuşak tepki
    ix = Math.sign(ix) * ix * ix * 0.4 + ix * 0.6;
    iy = Math.sign(iy) * iy * iy * 0.4 + iy * 0.6;
    const rud = (K.has('KeyQ') || K.has('Comma') ? -1 : 0) + (K.has('KeyE') || K.has('Period') ? 1 : 0);
    if (K.has('PageUp') || K.has('Equal') || K.has('NumpadAdd') || K.has('ShiftLeft') || K.has('ShiftRight')) A.lever = Math.min(1, A.lever + 0.6 * dt);
    if (K.has('PageDown') || K.has('Minus') || K.has('NumpadSubtract') || K.has('ControlLeft') || K.has('ControlRight')) A.lever = Math.max(0, A.lever - 0.6 * dt);
    const braking = A.brake || K.has('Space');
    A.thr += (A.lever - A.thr) * Math.min(1, dt * 0.9);
    A.gearT = clamp(A.gearT + (A.gearDown ? 1 : -1) * dt / 5, 0, 1);
    for (const m of A.mesh.userData.gear) m.visible = A.gearT > 0.5;
    // hız
    const flapK = FLAP_K[A.flaps];
    const cdMul = 1 + FLAP_DRAG[A.flaps] + A.gearT * 0.3 + (A.spoilers ? 1.6 : 0);
    const thinAir = clamp(1 - (A.pos.y - 3500) / 2500, 0.2, 1);
    let acc = F.thrust * A.thr * thinAir - F.cd * cdMul * A.V * A.V - GRAV * Math.sin(A.gamma);
    const d = dirOf(A.h);
    if (A.onGround) {
      const onRwy = this.onRunway(A.pos);
      acc -= (A.V > 0.3 ? 0.12 + (braking ? 2.9 : 0) + (onRwy ? 0 : 0.7) : 0);
      A.V = Math.max(0, A.V + acc * dt);
      // burun tekerleği ile dönüş
      A.h = wrapPi(A.h + (ix + rud * 0.7) * Math.min(0.45, 5 / Math.max(A.V, 1)) * Math.min(1, A.V / 3) * dt);
      A.roll += -A.roll * Math.min(1, dt * 5);
      // dönüş (rotation): ancak kalkış hızına yakınken burun kalkar
      let alphaReq = (F.alpha0 * (F.vref / Math.max(A.V, 20)) ** 2) / flapK;
      if (A.spoilers) alphaReq *= 1.7;
      if (A.V > F.vr * 0.9 && iy > 0) A.pitch = Math.min(A.pitch + iy * F.pitchRate * 0.5 * dt, 13 * DEG);
      else if (iy <= 0 || A.V < F.vr * 0.9) A.pitch = Math.max(0, A.pitch - 3 * DEG * dt);
      A.gamma = 0;
      A.pos.y = 0;
      A.pos.x += d.x * A.V * dt;
      A.pos.z += d.z * A.V * dt;
      if (A.lever > 0.5) A.spoilers = false;
      if (A.pitch - alphaReq > 0.3 * DEG && alphaReq < STALL) {
        A.onGround = false;
        A.gamma = 0.5 * DEG;
        A.gHold = null;
        A.spoilers = false;
        A.brake = false;
        A.airT = 0;
        A.flown = false;
        A.scored = false;
        this.msg('');
      }
      if (A.V < 0.5 && A.flown && !A.scored) this.score(null);
    } else {
      A.V = Math.max(0, A.V + acc * dt);
      // yatış: çubuk bırakılınca kanatlar düzelir
      const rollT = ix * F.rollMax * DEG;
      A.roll += clamp(rollT - A.roll, -F.rollRate * DEG * dt, F.rollRate * DEG * dt);
      let alphaReq = (F.alpha0 * (F.vref / Math.max(A.V, 15)) ** 2) / flapK / Math.max(0.5, Math.cos(A.roll));
      if (Math.abs(iy) > 0.04) {
        A.pitch = clamp(A.pitch + iy * F.pitchRate * dt, -25 * DEG, 30 * DEG);
        A.gHold = null;
      } else {
        // çubuk bırakılınca uçuş yolu korunur (hız değişse de tırmanış/alçalma açısı sabit kalır);
        // hücum açısı 12°'yi geçmeye çalışırsa burun kendiliğinden düşer
        if (A.gHold == null) A.gHold = A.gamma;
        const want = A.gHold + Math.min(alphaReq, 12 * DEG);
        A.pitch += clamp(want - A.pitch, -F.pitchRate * 0.6 * dt, F.pitchRate * 0.6 * dt);
      }
      const stall = alphaReq > STALL;
      let gT = A.pitch - Math.min(alphaReq, STALL);
      if (stall) {
        gT -= (alphaReq - STALL) * 2;
        A.pitch -= 4 * DEG * dt;
      }
      A.stall = stall;
      A.gamma += (gT - A.gamma) * Math.min(1, dt * 1.6);
      A.gamma = clamp(A.gamma, -40 * DEG, 35 * DEG);
      A.h = wrapPi(A.h + ((GRAV * Math.tan(A.roll)) / Math.max(A.V, 30) + rud * 0.03) * dt);
      const hv = A.V * Math.cos(A.gamma);
      A.pos.x += d.x * hv * dt;
      A.pos.z += d.z * hv * dt;
      A.pos.y += A.V * Math.sin(A.gamma) * dt;
      A.airT += dt;
      A.maxAlt = Math.max(A.maxAlt, A.pos.y);
      if (A.airT > 8 && A.pos.y > 15) A.flown = true;
      if (A.pos.y <= 0) this.touchdown();
    }
  }

  onRunway(p, margin = 26) {
    const W = this.game.world;
    for (const r of W.list('runway')) {
      const inf = W.runwayInfo(r);
      const along = (p.x - inf.A.x) * inf.ax.x + (p.z - inf.A.z) * inf.ax.z;
      const lat = (p.x - inf.A.x) * -inf.ax.z + (p.z - inf.A.z) * inf.ax.x;
      if (Math.abs(lat) < margin && along > -10 && along < inf.len + 10) return r;
    }
    return null;
  }

  touchdown() {
    const A = this.ac;
    const vy = A.V * Math.sin(A.gamma);
    const fpm = Math.round(-vy * 60 * FT);
    A.pos.y = 0;
    let why = null;
    if (A.gearT < 0.9) why = 'İniş takımı açık değildi';
    else if (vy < -7.5) why = `Çok sert iniş (${num(fpm)} ft/dk)`;
    else if (Math.abs(A.roll) > 22 * DEG) why = 'Kanat yere değdi';
    else if (A.pitch < -7 * DEG) why = 'Burun yere çarptı';
    if (why) return this.crash(why);
    A.onGround = true;
    A.gamma = 0;
    A.roll = 0;
    if (A.lever < 0.25) A.spoilers = true;
    if (A.flown && !A.scored) this.score(fpm);
  }

  score(fpm) {
    const A = this.ac, g = this.game, P = g.prog;
    A.scored = true;
    if (fpm == null) return;
    const rwy = this.onRunway(A.pos);
    if (!rwy) {
      this.msg(`Pistin dışına indiniz (${num(fpm)} ft/dk). Ödül yok.`, 'warn');
      return;
    }
    const [, name, reward] = GRADES.find((x) => fpm < x[0]);
    if (reward) g.econ.earn(reward, 'bonus');
    A.grade = `${name}: ${num(fpm)} ft/dk`;
    this.msg(`${name}: ${num(fpm)} ft/dk${reward ? ' · ' + money(reward) : ''}`, reward ? 'good' : 'warn');
    g.ui.toast(`${name}: ${num(fpm)} ft/dk${reward ? ' · ' + money(reward) : ''}`, reward ? 'good' : 'warn');
    P.grant('pilot1');
    if (fpm < 60) P.grant('butter');
    if (LU.night.value > 0.7) P.grant('nightland');
    if (A.type === 'wide') P.grant('widepilot');
  }

  crash(why) {
    const A = this.ac, ui = this.game.ui;
    A.crashed = true;
    A.V = 0;
    this.release();
    ui.modal(`<h2>Kaza</h2><p>${why}. Neyse ki bu bir oyun: uçak onarıldı, ücret alınmadı.</p>
      <p class="muted">İpucu: inişte iniş takımını açın (G), flap 2 kullanın, dikey hızı 700 ft/dk'nın altında tutun ve kanatları düz tutun.</p>
      <div class="row"><button class="btn primary" data-m="again">Pistten yeniden kalk</button><button class="btn" data-m="exit">Uçuşu bitir</button></div>`, (k) => {
      if (k === 'again') this.restart();
      else this.stop();
    });
  }

  restart() {
    const g = this.game;
    const A = this.ac;
    const type = A ? A.type : this.lastType;
    if (A) {
      g.scene.remove(A.mesh);
      if (A.pool) g.scene.remove(A.pool);
    }
    this.ac = null;
    // en yakın pist ucu
    const W = g.world;
    let best = null;
    for (const r of W.list('runway')) {
      const inf = W.runwayInfo(r);
      inf.ends.forEach((e, k) => {
        const dd = A ? Math.hypot(e.from.x - A.pos.x, e.from.z - A.pos.z) : 0;
        if (!best || ((r.active || 0) === k && dd < best.d + 500) || dd < best.d) best = { r, k, d: dd };
      });
    }
    if (!best) return this.stop();
    this.pending = { type, rid: best.r.id, endIdx: best.k };
  }

  // pisti AI trafiğine kapat: pistteyken ya da son yaklaşmadayken
  reserve() {
    const A = this.ac;
    if (!A || A.crashed) return;
    const g = this.game, W = g.world, S = g.sim;
    let want = null;
    for (const r of W.list('runway')) {
      const inf = W.runwayInfo(r);
      const along = (A.pos.x - inf.A.x) * inf.ax.x + (A.pos.z - inf.A.z) * inf.ax.z;
      const lat = (A.pos.x - inf.A.x) * -inf.ax.z + (A.pos.z - inf.A.z) * inf.ax.x;
      const onR = Math.abs(lat) < 45 && along > -80 && along < inf.len + 80 && A.pos.y < 40;
      const fin = !A.onGround && Math.abs(lat) < 350 && A.pos.y < 380 && ((along < 0 && along > -4500) || (along > inf.len && along < inf.len + 4500));
      if (onR || fin) want = r;
    }
    for (const [id, st] of S.rw) if (st.busy && st.busy.ac === this.token && (!want || id !== want.id)) st.busy = null;
    if (want) {
      const st = S.runwayState(want);
      if (!st.busy) st.busy = { ac: this.token, kind: 'player' };
    }
  }

  place() {
    const A = this.ac;
    if (!A) return;
    const m = A.mesh;
    m.position.copy(A.pos);
    m.rotation.set(0, 0, 0);
    m.rotation.order = 'YXZ';
    m.rotation.y = -A.h;
    m.rotation.x = A.pitch;
    m.rotation.z = -A.roll;
    const blink = performance.now() / 1000;
    m.userData.beacon.visible = blink % 1 < 0.12;
    const sb = blink % 1.3;
    m.userData.strobe.visible = !A.onGround || A.V > 20 ? sb < 0.05 || (sb > 0.13 && sb < 0.18) : false;
    m.userData.landing.visible = A.pos.y < 3000;
    const night = LU.night.value;
    if (night > 0.05 && A.pos.y < 150) {
      if (!A.pool) {
        A.pool = makePool();
        this.game.scene.add(A.pool);
      }
      const d = dirOf(A.h);
      const ahead = A.t.len * 0.5 + 30 + A.pos.y * 0.8;
      const sc = 28 + A.pos.y * 0.35;
      A.pool.position.set(A.pos.x + d.x * ahead, 0.35, A.pos.z + d.z * ahead);
      A.pool.rotation.y = -A.h;
      A.pool.scale.set(sc * 0.8, 1, sc * 1.7);
      A.pool.visible = true;
    } else if (A.pool) A.pool.visible = false;
  }

  // ---------------------------------------------------------------- kamera
  camUpdate(dt) {
    const g = this.game, A = this.ac, cam = g.camera;
    if (!A) return;
    const t = A.t;
    const k = 1 - Math.exp(-dt * 3);
    this.camH += wrapPi(A.h - this.camH) * k;
    let fov = 55;
    if (this.camMode === 'chase') {
      const dist = this.camDist || t.len * 1.7 + 14;
      const yaw = this.camH + this.orbitYaw;
      const b = dirOf(yaw);
      const tgt = _v.set(A.pos.x, A.pos.y + t.dia * 0.9, A.pos.z);
      const cp = Math.cos(this.orbitPitch), sp = Math.sin(this.orbitPitch);
      cam.position.set(tgt.x - b.x * dist * cp, Math.max(1.5, tgt.y + dist * sp), tgt.z - b.z * dist * cp);
      cam.up.set(0, 1, 0);
      cam.lookAt(tgt);
    } else if (this.camMode === 'cockpit') {
      const m = A.mesh;
      m.updateMatrixWorld();
      _v.set(0, t.gearZ + t.dia * 0.78, -t.len * 0.5 - 0.6).applyMatrix4(m.matrixWorld);
      cam.position.copy(_v);
      cam.quaternion.copy(m.quaternion);
      if (this.orbitYaw) cam.rotateY(this.orbitYaw);
      cam.rotateX(-0.08);
      fov = 62;
    } else {
      const tw = g.world.list('tower')[0];
      cam.position.set(tw.cx + 6, 46, tw.cz + 6);
      _v.set(A.pos.x, A.pos.y + t.dia * 0.5, A.pos.z);
      cam.up.set(0, 1, 0);
      cam.lookAt(_v);
      const dd = cam.position.distanceTo(_v);
      fov = clamp((2 * Math.atan((t.len * 2.2) / dd) * 180) / Math.PI, 3, 55);
    }
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    // gölge kamerası uçağı izlesin
    g.rig.target.set(A.pos.x, 0, A.pos.z);
  }

  // ---------------------------------------------------------------- gösterge
  hud() {
    const A = this.ac;
    if (!A) return;
    const set = (id, v) => {
      const e = document.getElementById(id);
      if (e.textContent !== v) e.textContent = v;
    };
    const vs = A.onGround ? 0 : A.V * Math.sin(A.gamma) * 60 * FT;
    set('fh-spd', String(Math.round(A.V * KT)));
    set('fh-alt', num(Math.round((A.pos.y * FT) / 10) * 10));
    set('fh-vs', (vs > 0 ? '+' : '') + num(Math.round(vs / 10) * 10));
    set('fh-hdg', String(Math.round((((A.h * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, '0'));
    set('fh-thr', String(Math.round(A.thr * 100)));
    set('fh-flap', `FLAP ${A.flaps}`);
    set('fh-gear', A.gearT >= 1 ? 'TAKIM ↓' : A.gearT <= 0 ? 'TAKIM ↑' : 'TAKIM ↕');
    set('fh-brk', A.spoilers ? 'SPOYLER' : A.brake ? 'FREN' : '');
    document.getElementById('fh-gear').className = A.gearT >= 1 ? 'on' : A.gearT <= 0 ? '' : 'mid';
    document.getElementById('fly-thr-fill').style.height = `${A.lever * 100}%`;
    if (this.game.speed === 0) return this.msg('Duraklatıldı (P ya da üstteki 1× ile devam)', 'warn');
    if (A.crashed) return;
    // uyarılar ve iniş rehberi
    if (!A.onGround && A.stall) return this.msg('HIZ ÇOK DÜŞÜK! Burnu indirin, gazı açın', 'bad');
    if (!A.onGround && A.pos.y < 150 && A.gearT < 1 && vs < -200) return this.msg('İNİŞ TAKIMI! (G)', 'bad');
    if (Math.hypot(A.pos.x, A.pos.z) > 15000) return this.msg('Havalimanından çok uzaklaştınız: geri dönün', 'warn');
    const app = this.approach();
    if (app) return this.msg(app.text, app.kind);
    if (A.onGround && A.V < 1 && A.scored) return this.msg((A.grade ? A.grade + '. ' : '') + 'İniş tamam. Uçuşu bitirin (Çık) ya da yeniden kalkın (Başa al). Pistte beklerken gelen uçaklar pas geçer.', 'good');
    if (A.onGround && !A.flown && A.V < 1) return;
    if (!A.onGround && A.airT > 3 && A.airT < 12) this.msg('Pozitif tırmanış: iniş takımını toplayın (G), flapı kapatın (F)', 'good');
    else if (!A.scored && !(A.onGround && A.V > 1)) this.msg('');
  }

  // en uygun pist ucuna göre süzülüş ve hiza rehberi
  approach() {
    const A = this.ac, W = this.game.world;
    if (A.onGround || !A.flown) return null;
    let best = null;
    for (const r of W.list('runway')) {
      const inf = W.runwayInfo(r);
      for (const e of inf.ends) {
        const d = dirOf(e.h);
        const aimX = e.from.x + d.x * 300, aimZ = e.from.z + d.z * 300;
        const along = (aimX - A.pos.x) * d.x + (aimZ - A.pos.z) * d.z;   // nişan noktasına mesafe
        const lat = (A.pos.x - aimX) * -d.z + (A.pos.z - aimZ) * d.x;
        const hd = Math.abs(wrapPi(A.h - e.h));
        if (along < 200 || along > 9000 || hd > 40 * DEG || Math.abs(lat) > along * 0.35 + 200) continue;
        if (!best || along < best.along) best = { e, along, lat };
      }
    }
    if (!best) return null;
    const ideal = best.along * Math.tan(3 * DEG);
    const dev = A.pos.y - ideal;
    const tol = Math.max(12, best.along * 0.012);
    const gs = dev > tol * 2 ? 'çok yüksek ⇊' : dev > tol ? 'biraz yüksek ↓' : dev < -tol * 2 ? 'çok alçak ⇈' : dev < -tol ? 'biraz alçak ↑' : 'süzülüş iyi ✓';
    const latTol = Math.max(10, best.along * 0.01);
    const lt = best.lat > latTol ? '← sola' : best.lat < -latTol ? 'sağa →' : 'hiza iyi ✓';
    const km = (best.along / 1000).toFixed(1).replace('.', ',');
    const hints = [];
    if (A.gearT < 1 && best.along < 5000) hints.push('takım!');
    if (A.flaps < 2 && best.along < 4000) hints.push('flap 2');
    const spd = A.V * KT, vref = A.fm.vref * KT;
    if (best.along < 4000 && spd > vref + 25) hints.push('hız fazla');
    return { text: `Pist ${best.e.name} · ${km} km · ${gs} · ${lt}${hints.length ? ' · ' + hints.join(', ') : ''}`, kind: Math.abs(dev) < tol * 2 && Math.abs(best.lat) < latTol * 2 ? 'good' : 'warn' };
  }
}
const _v = new THREE.Vector3();
