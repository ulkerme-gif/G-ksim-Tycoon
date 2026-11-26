// Şehir kurma oyunu kamerası: fare, klavye, trackpad ve dokunmatik
//  - kaydırma "tutup sürükleme" gibidir: parmağın/imlecin altındaki zemin noktası parmakla birlikte gider
//  - yakınlaştırma imlecin ya da iki parmağın ortasındaki noktaya doğru yapılır ve yumuşaktır
//  - iki parmakla dönme ancak belirgin bir çevirme hareketinde başlar (yakınlaştırırken istemeden dönmez)
//  - iki parmağı birlikte yukarı/aşağı kaydırmak kamerayı eğer
import * as THREE from 'three';
import { CELL, MAP_W, MAP_H } from './config.js';
import { clamp } from './util.js';

const MIN_DIST = 45;
const MAX_DIST = 5000;
const MIN_PITCH = 0.2;
const MAX_PITCH = 1.48;
const ROT_LOCK = 0.2;     // iki parmakla dönmenin başlaması için gereken çevirme (rad, ~11°)
const TILT_LOCK = 14;     // eğme hareketinin tanınması için gereken dikey kayma (px)

export class CameraRig {
  constructor(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this._dist = 900;
    this.distGoal = 900;
    this.anchor = null;          // yumuşak yakınlaştırmada sabit tutulacak ekran noktası
    this.yaw = 0.6;
    this.pitch = 0.9;            // kullanıcının seçtiği eğim; yakındayken kendiliğinden yatıklaşır
    this.keys = new Set();
    this.follow = null;          // takip edilen nesne (uçak)
    this.pointers = new Map();
    this.onTap = null;           // (x, y, pointerType, button)
    this.onDrag = null;          // inşa aracı sürüklemesi: (phase, x, y)
    this.onHover = null;
    this.buildDrag = () => false; // tek parmak/sol tık sürüklemesi inşa için mi?
    this.ray = new THREE.Raycaster();
    this.lastTap = null;
    this.disabled = false;       // uçuş modunda kamera başka yerden sürülür
    this.bind();
    this.apply();
  }

  // dışarıdan atanan uzaklık anında geçerli olur (yumuşak geçiş iptal)
  get dist() {
    return this._dist;
  }
  set dist(v) {
    this._dist = clamp(v, MIN_DIST, MAX_DIST);
    this.distGoal = this._dist;
    this.anchor = null;
  }

  // ---------------------------------------------------------------- olaylar
  bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    d.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // Safari: sayfanın kendisinin büyümesini engelle. Mac trackpad'de kıstırma kamerayı yakınlaştırır
    // (iPad'de kıstırma zaten parmak olaylarıyla işlendiği için orada yalnızca engellenir).
    const touchDevice = (navigator.maxTouchPoints || 0) > 0;
    let gs = 1;
    document.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gs = 1;
    }, { passive: false });
    document.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (touchDevice || !e.scale || this.disabled) return;
      const k = gs / e.scale;
      gs = e.scale;
      this.zoomBy(k, e.clientX, e.clientY, false);
    }, { passive: false });
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
    // iOS: çift dokunmayla sayfa büyümesin
    document.addEventListener('dblclick', (e) => {
      if (e.target !== this.dom) e.preventDefault();
    }, { passive: false });
  }

  wheel(e) {
    e.preventDefault();
    if (this.disabled) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 400;
    // trackpad kıstırma (Chrome, Firefox, Edge) ctrlKey ile gelir: daha güçlü tepki
    const k = Math.exp(clamp(dy, -400, 400) * (e.ctrlKey ? 0.012 : 0.0016));
    this.zoomBy(k, e.clientX, e.clientY, !e.ctrlKey);
  }

  ground(x, y, maxT = 1e9) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const o = this.ray.ray.origin, dir = this.ray.ray.direction;
    if (dir.y > -0.02) return null;      // ufkun üstü ya da çok yatık
    const t = -o.y / dir.y;
    if (!(t > 0) || t > maxT) return null;
    return o.clone().addScaledVector(dir, t);
  }

  down(e) {
    if (e.target !== this.dom || this.disabled) return;
    try {
      this.dom.setPointerCapture(e.pointerId);
    } catch (err) {
      /* bazı tarayıcılarda yakalama desteklenmez */
    }
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType, t: performance.now(), moved: false, mode: null };
    this.pointers.set(e.pointerId, p);
    this.distGoal = this.dist;   // süren yumuşak yakınlaştırmayı durdur
    this.anchor = null;
    if (this.pointers.size === 1) {
      if (e.pointerType === 'mouse') p.mode = e.button === 2 ? 'rotate' : e.button === 1 ? 'pan' : this.buildDrag() ? 'build' : 'pan';
      else p.mode = this.buildDrag() ? 'build' : 'pan';
      if (p.mode === 'build' && this.onDrag) this.onDrag('start', e.clientX, e.clientY);
      if (p.mode === 'pan') p.grab = this.ground(e.clientX, e.clientY, this.dist * 6);
    } else {
      // ikinci parmak: inşa sürüklemesini iptal et, iki parmak hareketi başlat
      for (const q of this.pointers.values()) {
        if (q.mode === 'build' && this.onDrag) this.onDrag('cancel', q.x, q.y);
        q.mode = 'multi';
      }
      this.startMulti();
    }
  }

  twoPts() {
    const ps = [...this.pointers.values()];
    return [ps[0], ps[1]];
  }

  startMulti() {
    const [a, b] = this.twoPts();
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    this.multi = {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      cx, cy, sx: cx, sy: cy,
      twist: 0, rotating: false, kind: null,   // kind: 'transform' (yakınlaştır/kaydır/döndür) ya da 'tilt'
      grab: this.ground(cx, cy, this.dist * 6),
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    };
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && this.onHover && !this.disabled) this.onHover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.moved = true;
    if (p.mode === 'multi') {
      if (this.pointers.size >= 2 && this.multi) this.moveMulti();
      return;
    }
    if (p.mode === 'rotate') {
      this.yaw -= dx * 0.005;
      this.pitch = clamp(this.pitch + dy * 0.004, MIN_PITCH, MAX_PITCH);
      this.apply();
    } else if (p.mode === 'pan') {
      this.grabTo(p.grab, p.x, p.y, dx, dy);
      this.apply();
    } else if (p.mode === 'build' && this.onDrag) this.onDrag('move', e.clientX, e.clientY);
    if (this.onHover && e.pointerType === 'mouse') this.onHover(e.clientX, e.clientY);
  }

  moveMulti() {
    const M = this.multi;
    const [a, b] = this.twoPts();
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    let da = ang - M.ang;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    // hareketin türünü ilk birkaç pikselde belirle: iki parmak birlikte dikey kayıyorsa eğme
    if (!M.kind) {
      const vy = cy - M.sy, vx = cx - M.sx;
      const scaleCh = Math.abs(Math.log(d / M.d0));
      if (Math.abs(vy) > TILT_LOCK && Math.abs(vy) > Math.abs(vx) * 1.6 && scaleCh < 0.08 && Math.abs(M.twist + da) < 0.12) M.kind = 'tilt';
      else if (Math.hypot(vx, vy) > TILT_LOCK || scaleCh > 0.08 || Math.abs(M.twist + da) > 0.12) M.kind = 'transform';
    }
    if (M.kind === 'tilt') {
      this.pitch = clamp(this.pitch - (cy - M.cy) * 0.005, MIN_PITCH, MAX_PITCH);
      this.apply();
    } else {
      // yakınlaştırma
      this.dist = this.dist * (M.d / d);
      // dönme: belirgin bir çevirmeden sonra
      M.twist += da;
      if (!M.rotating && Math.abs(M.twist) > ROT_LOCK) M.rotating = true;
      if (M.rotating) this.yaw -= da;
      this.apply();
      // iki parmağın ortasındaki zemin noktası parmakların altında kalsın
      if (M.grab) this.grabTo(M.grab, cx, cy, cx - M.cx, cy - M.cy);
      else this.panScreen(cx - M.cx, cy - M.cy);
      this.apply();
    }
    M.d = d;
    M.ang = ang;
    M.cx = cx;
    M.cy = cy;
  }

  up(e, cancel) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.mode === 'build' && this.onDrag) this.onDrag(cancel ? 'cancel' : 'end', e.clientX, e.clientY);
    else if (!cancel && !p.moved && p.mode !== 'multi' && p.mode !== 'rotate') {
      // çift dokunma / çift tık: o noktaya yakınlaş
      const now = performance.now();
      const L = this.lastTap;
      if (L && now - L.t < 320 && Math.hypot(L.x - e.clientX, L.y - e.clientY) < 30 && !this.buildDrag()) {
        this.zoomBy(0.45, e.clientX, e.clientY, true);
        this.lastTap = null;
      } else {
        this.lastTap = { t: now, x: e.clientX, y: e.clientY };
        if (this.onTap) this.onTap(e.clientX, e.clientY, p.type, p.button);
      }
    }
    if (this.pointers.size === 1) {
      // iki parmaktan biri kalktı: kalan parmakla kaydırmaya devam
      const q = [...this.pointers.values()][0];
      q.mode = 'pan';
      q.moved = true;
      q.grab = this.ground(q.x, q.y, this.dist * 6);
    }
    if (this.pointers.size < 2) this.multi = null;
  }

  // ---------------------------------------------------------------- hareket
  // tutulan zemin noktasını (grab) ekrandaki (x, y) noktasının altına getir
  grabTo(grab, x, y, dx, dy) {
    this.follow = null;
    if (!grab) return this.panScreen(dx, dy);
    this.apply();
    const g = this.ground(x, y, this.dist * 8);
    if (!g) return this.panScreen(dx, dy);
    let mx = grab.x - g.x, mz = grab.z - g.z;
    const lim = this.dist * 0.6;      // ufka yakın tutuşlarda aşırı sıçramayı önle
    const m = Math.hypot(mx, mz);
    if (m > lim) {
      mx *= lim / m;
      mz *= lim / m;
    }
    this.target.x += mx;
    this.target.z += mz;
  }

  panScreen(dx, dy) {
    const k = (this.dist * 1.15) / Math.max(400, this.dom.clientHeight);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.target.x -= (dx * c + dy * s) * k;
    this.target.z -= (-dx * s + dy * c) * k;
    this.follow = null;
  }

  // k < 1 yakınlaştırır. smooth: hedefe yumuşak geçiş. (x, y): sabit kalacak ekran noktası (yoksa ekran ortası)
  zoomBy(k, x, y, smooth = true) {
    const r = this.dom.getBoundingClientRect();
    if (x === undefined || this.follow) {
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    this.distGoal = clamp((smooth ? this.distGoal : this.dist) * k, MIN_DIST, MAX_DIST);
    this.anchor = { x, y };
    if (!smooth) this.stepZoom(1);
  }

  stepZoom(a) {
    if (Math.abs(this.distGoal - this._dist) < 0.05) {
      this._dist = this.distGoal;
      this.anchor = null;
      return;
    }
    const A = this.anchor;
    const before = A && this.ground(A.x, A.y, this.dist * 8);
    this._dist += (this.distGoal - this._dist) * a;
    this.apply();
    if (before && A) {
      const after = this.ground(A.x, A.y, this.dist * 8);
      if (after) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
      }
    }
    this.apply();
  }

  // yakındayken kamera kendiliğinden yatıklaşır (uçaklar yandan görünsün), uzaktayken kullanıcının eğimi
  effPitch() {
    const maxAt = MIN_PITCH + 0.35 + (MAX_PITCH - MIN_PITCH - 0.35) * clamp((this.dist - MIN_DIST) / 900, 0, 1);
    return clamp(Math.min(this.pitch, maxAt), MIN_PITCH, MAX_PITCH);
  }

  update(dt) {
    if (this.disabled) return;
    const k = this.dist * 1.1 * dt;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let mx = 0, mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (mx || mz) {
      this.target.x += (mx * c + mz * s) * k;
      this.target.z += (-mx * s + mz * c) * k;
      this.follow = null;
    }
    if (this.keys.has('KeyQ')) this.yaw += 1.4 * dt;
    if (this.keys.has('KeyE')) this.yaw -= 1.4 * dt;
    if (this.keys.has('PageUp')) this.pitch = clamp(this.pitch + 0.9 * dt, MIN_PITCH, MAX_PITCH);
    if (this.keys.has('PageDown')) this.pitch = clamp(this.pitch - 0.9 * dt, MIN_PITCH, MAX_PITCH);
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd')) this.zoomBy(1 - 1.8 * dt);
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract')) this.zoomBy(1 + 1.8 * dt);
    this.stepZoom(1 - Math.exp(-dt * 11));
    if (this.follow) {
      const f = this.follow();
      if (f) {
        this.target.x += (f.x - this.target.x) * Math.min(1, dt * 4);
        this.target.z += (f.z - this.target.z) * Math.min(1, dt * 4);
      } else this.follow = null;
    }
    this.apply();
  }

  apply() {
    const lim = 0.5 * CELL;
    this.target.x = clamp(this.target.x, -MAP_W * lim - 800, MAP_W * lim + 800);
    this.target.z = clamp(this.target.z, -MAP_H * lim - 800, MAP_H * lim + 800);
    const pitch = this.effPitch();
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + sp * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(this.target);
    this.cam.updateMatrixWorld();
  }

  // ekrandaki düğmeler
  zoomStep(dir) {
    this.zoomBy(dir > 0 ? 0.6 : 1 / 0.6);
  }
  resetNorth() {
    this.yaw = 0;
    this.pitch = Math.max(this.pitch, 1.1);
    this.apply();
  }
}
