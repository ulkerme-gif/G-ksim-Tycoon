// Şehir kurma oyunu kamerası: fare, klavye ve dokunmatik
import * as THREE from 'three';
import { CELL, MAP_W, MAP_H } from './config.js';
import { clamp } from './util.js';

export class CameraRig {
  constructor(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.dist = 900;
    this.yaw = 0.6;
    this.pitch = 0.9;
    this.keys = new Set();
    this.follow = null;          // takip edilen nesne (uçak)
    this.pointers = new Map();
    this.onTap = null;           // (x, y, pointerType)
    this.onDrag = null;          // inşa aracı sürüklemesi: (phase, x, y)
    this.buildDrag = () => false; // tek parmak/sol tık sürüklemesi inşa için mi?
    this.bind();
    this.apply();
  }

  bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0012));
      this.zoomAt(k, e.clientX, e.clientY);
    }, { passive: false });
    d.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  ground(x, y) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (!(t > 0)) return null;
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
  }

  down(e) {
    if (e.target !== this.dom) return;
    try {
      this.dom.setPointerCapture(e.pointerId);
    } catch (err) {
      /* bazı tarayıcılarda yakalama desteklenmez */
    }
    const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType, t: performance.now(), moved: false, mode: null };
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      if (e.pointerType === 'mouse') p.mode = e.button === 2 ? 'rotate' : e.button === 1 ? 'pan' : this.buildDrag() ? 'build' : 'pan';
      else p.mode = this.buildDrag() ? 'build' : 'pan';
      if (p.mode === 'build' && this.onDrag) this.onDrag('start', e.clientX, e.clientY);
    } else {
      // ikinci parmak: inşa sürüklemesini iptal et, iki parmak hareketi başlat
      for (const q of this.pointers.values()) {
        if (q.mode === 'build' && this.onDrag) this.onDrag('cancel', q.x, q.y);
        q.mode = 'multi';
      }
      this.multi = this.multiState();
    }
  }

  multiState() {
    const ps = [...this.pointers.values()];
    const [a, b] = ps;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && this.onHover) this.onHover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.moved = true;
    if (p.mode === 'multi' && this.pointers.size >= 2) {
      const s = this.multiState();
      const m = this.multi;
      if (m.d > 0 && s.d > 0) this.zoomAt(m.d / s.d, s.cx, s.cy);
      let da = s.ang - m.ang;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      this.yaw -= da;
      this.panScreen(s.cx - m.cx, s.cy - m.cy);
      this.pitch = clamp(this.pitch - (s.cy - m.cy) * 0.0, 0.25, 1.45);
      this.multi = s;
      this.apply();
      return;
    }
    if (p.mode === 'rotate') {
      this.yaw -= dx * 0.005;
      this.pitch = clamp(this.pitch + dy * 0.004, 0.22, 1.5);
      this.apply();
    } else if (p.mode === 'pan') {
      this.panScreen(dx, dy);
      this.apply();
    } else if (p.mode === 'build' && this.onDrag) this.onDrag('move', e.clientX, e.clientY);
    if (this.onHover && e.pointerType === 'mouse') this.onHover(e.clientX, e.clientY);
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.mode === 'build' && this.onDrag) this.onDrag('end', e.clientX, e.clientY);
    else if (!p.moved && p.mode !== 'multi' && p.mode !== 'rotate' && this.onTap) this.onTap(e.clientX, e.clientY, p.type, p.button);
    if (this.pointers.size < 2) this.multi = null;
  }

  panScreen(dx, dy) {
    const k = this.dist * 0.0016 * (900 / Math.max(500, this.dom.clientHeight));
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.target.x -= (dx * c + dy * s) * k;
    this.target.z -= (-dx * s + dy * c) * k;
    this.follow = null;
  }

  zoomAt(k, x, y) {
    const before = this.ground(x, y);
    this.dist = clamp(this.dist * k, 60, 4200);
    this.apply();
    const after = this.ground(x, y);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
    }
    this.apply();
  }

  update(dt) {
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
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd')) this.dist = clamp(this.dist * (1 - 1.5 * dt), 60, 4200);
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract')) this.dist = clamp(this.dist * (1 + 1.5 * dt), 60, 4200);
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
    this.target.x = clamp(this.target.x, -MAP_W * lim - 600, MAP_W * lim + 600);
    this.target.z = clamp(this.target.z, -MAP_H * lim - 600, MAP_H * lim + 600);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + sp * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(this.target);
  }
}
