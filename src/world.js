// Harita verisi (kareler, nesneler) ve görüntüsü
import * as THREE from 'three';
import { CELL, MAP_W, MAP_H, G, BUILDINGS, STANDS, RUNWAYS, DAILY, AIRCRAFT } from './config.js';
import { cellX, cellZ, ROT_H, ROT_D, dirOf, headingOf, clamp, rng } from './util.js';
import { makeTerminal, makeTower, makeHangar, makeTrees, A } from './assets.js';

const N = MAP_W * MAP_H;
const Y = { apron: 0.06, taxi: 0.1, runway: 0.14, decal: 0.18 };

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function noise(x, w, h, base, amp, n, seed) {
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const v = base + (r() - 0.5) * amp;
    x.fillStyle = `rgba(${v},${v},${v},0.08)`;
    x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
}
function flatMat(tex, color, layer) {
  return new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 2 });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.ground = new Uint8Array(N);       // G.*
    this.obj = new Int32Array(N).fill(-1); // nesne kimliği (pist, bina, park yeri)
    this.objects = new Map();
    this.nextId = 1;
    this.standNum = 1;
    this.version = 0;                       // her değişiklikte artar (yol bulma önbelleği için)
    this.root = new THREE.Group();
    scene.add(this.root);
    this.makeGround();
    this.makeSurfaceLayer();
    this.makeGridOverlay();
    this.lights = { runway: null };
  }

  // ---------------------------------------------------------------- yardımcılar
  idx(i, j) {
    return j * MAP_W + i;
  }
  inside(i, j) {
    return i >= 0 && j >= 0 && i < MAP_W && j < MAP_H;
  }
  g(i, j) {
    return this.inside(i, j) ? this.ground[j * MAP_W + i] : -1;
  }
  objAt(i, j) {
    if (!this.inside(i, j)) return null;
    const id = this.obj[j * MAP_W + i];
    return id >= 0 ? this.objects.get(id) : null;
  }
  footprint(kind, rot, extra) {
    if (kind === 'runway') {
      const L = extra.len;
      return rot % 2 === 0 ? [3, L] : [L, 3];   // rot 0/2 kuzey-güney, 1/3 doğu-batı
    }
    if (kind === 'stand') {
      const s = STANDS[extra.size].size;
      return [s, s];
    }
    const b = BUILDINGS[kind];
    return rot % 2 === 0 ? [b.w, b.h] : [b.h, b.w];
  }
  cellsOf(i0, j0, w, h) {
    const out = [];
    for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) out.push([i, j]);
    return out;
  }

  // ---------------------------------------------------------------- zemin
  makeGround() {
    const grass = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#5f8a3e';
      x.fillRect(0, 0, w, h);
      const r = rng(7);
      for (let k = 0; k < 2400; k++) {
        const g = 110 + r() * 60;
        x.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.35)`;
        x.fillRect(r() * w, r() * h, 2, 2 + r() * 3);
      }
    }, true);
    grass.repeat.set(160, 160);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000), new THREE.MeshStandardMaterial({ map: grass, color: 0x93a882, roughness: 1, envMapIntensity: 0.4 }));
    outer.rotation.x = -Math.PI / 2;
    outer.receiveShadow = true;
    this.root.add(outer);
    const mown = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#58853a';
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,0.022)';
      x.fillRect(0, 0, w / 2, h);
      const r = rng(9);
      for (let k = 0; k < 1500; k++) {
        const g = 120 + r() * 50;
        x.fillStyle = `rgba(${g * 0.6},${g},${g * 0.4},0.3)`;
        x.fillRect(r() * w, r() * h, 2, 2 + r() * 2);
      }
    }, true);
    mown.repeat.set(MAP_W / 4, MAP_H / 4);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * CELL, MAP_H * CELL), new THREE.MeshStandardMaterial({ map: mown, color: 0xd2dcc8, roughness: 1, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.02;
    inner.receiveShadow = true;
    this.root.add(inner);
    // çevre çiti
    const fence = new THREE.Group();
    const fm = new THREE.MeshStandardMaterial({ color: 0x8d9399, roughness: 0.6, metalness: 0.5 });
    const W = MAP_W * CELL, H = MAP_H * CELL;
    for (const [x, z, w, d] of [[0, -H / 2, W, 0.3], [0, H / 2, W, 0.3], [-W / 2, 0, 0.3, H], [W / 2, 0, 0.3, H]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), fm);
      m.position.set(x, 1.2, z);
      fence.add(m);
    }
    this.root.add(fence);
    // ağaçlar (harita dışı)
    const r = rng(42);
    const pts = [];
    while (pts.length < 900) {
      const x = (r() - 0.5) * 9000, z = (r() - 0.5) * 7000;
      if (Math.abs(x) < W / 2 + 60 && Math.abs(z) < H / 2 + 60) continue;
      const k = 0.8 + r() * 0.8;
      // kümelensin
      for (let c = 0; c < 4 && pts.length < 900; c++) pts.push([x + (r() - 0.5) * 60, z + (r() - 0.5) * 60, k * (0.8 + r() * 0.4)]);
    }
    this.root.add(makeTrees(pts));
  }

  makeGridOverlay() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { cell: { value: CELL }, hover: { value: new THREE.Vector2(1e9, 1e9) }, opacity: { value: 0.0 } },
      vertexShader: 'varying vec2 vp; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vp = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float cell; uniform vec2 hover; uniform float opacity; varying vec2 vp;
        void main(){ vec2 g = abs(fract(vp / cell) - 0.5); float l = 1.0 - smoothstep(0.46, 0.5, max(g.x, g.y));
          float d = length(vp - hover); float fade = 1.0 - smoothstep(200.0, 700.0, d);
          gl_FragColor = vec4(1.0, 1.0, 1.0, (1.0 - l) * 0.28 * opacity * (0.35 + 0.65 * fade)); }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * CELL, MAP_H * CELL), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.3;
    m.renderOrder = 5;
    this.gridOverlay = m;
    this.root.add(m);
  }

  // ---------------------------------------------------------------- taksi yolu / apron katmanı
  makeSurfaceLayer() {
    const plane = new THREE.PlaneGeometry(CELL, CELL);
    plane.rotateX(-Math.PI / 2);
    this.taxiMats = [];
    for (let mask = 0; mask < 16; mask++) {
      const tex = canvasTex(128, 128, (x, w, h) => {
        x.fillStyle = '#4a4e52';
        x.fillRect(0, 0, w, h);
        noise(x, w, h, 120, 120, 500, 100 + mask);
        const lw = 5;
        x.fillStyle = '#e8b923';
        const c = w / 2;
        const conn = [mask & 1, mask & 2, mask & 4, mask & 8];  // K D G B
        if (conn[0]) x.fillRect(c - lw / 2, 0, lw, c);
        if (conn[1]) x.fillRect(c, c - lw / 2, c, lw);
        if (conn[2]) x.fillRect(c - lw / 2, c, lw, c);
        if (conn[3]) x.fillRect(0, c - lw / 2, c, lw);
        x.beginPath();
        x.arc(c, c, lw / 2, 0, Math.PI * 2);
        x.fill();
        // bağlantısız kenarlarda kenar çizgisi
        x.fillStyle = '#d9a91e';
        const e = 4;
        if (!conn[0]) x.fillRect(0, e, w, 2);
        if (!conn[1]) x.fillRect(w - e - 2, 0, 2, h);
        if (!conn[2]) x.fillRect(0, h - e - 2, w, 2);
        if (!conn[3]) x.fillRect(e, 0, 2, h);
      });
      this.taxiMats.push(flatMat(tex, 0xffffff, 3));
    }
    const apronTex = canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#a7a8a3';
      x.fillRect(0, 0, w, h);
      noise(x, w, h, 150, 90, 600, 5);
      x.strokeStyle = 'rgba(60,60,60,0.35)';
      x.lineWidth = 1;
      for (const k of [0, 64]) {
        x.beginPath();
        x.moveTo(k + 0.5, 0);
        x.lineTo(k + 0.5, h);
        x.moveTo(0, k + 0.5);
        x.lineTo(w, k + 0.5);
        x.stroke();
      }
    });
    this.apronMat = flatMat(apronTex, 0xffffff, 2);
    this.plane = plane;
    this.surf = new THREE.Group();
    this.root.add(this.surf);
    this.decals = new THREE.Group();
    this.root.add(this.decals);
    this.rebuildSurfaces();
  }

  taxiMask(i, j) {
    let m = 0;
    const ok = (a, b) => {
      const t = this.g(a, b);
      return t === G.TAXI || t === G.RUNWAY || t === G.APRON;
    };
    if (ok(i, j - 1)) m |= 1;
    if (ok(i + 1, j)) m |= 2;
    if (ok(i, j + 1)) m |= 4;
    if (ok(i - 1, j)) m |= 8;
    return m;
  }

  rebuildSurfaces() {
    for (const c of [...this.surf.children]) {
      this.surf.remove(c);
      c.dispose && c.dispose();
    }
    const lists = Array.from({ length: 16 }, () => []);
    const apron = [];
    for (let j = 0; j < MAP_H; j++)
      for (let i = 0; i < MAP_W; i++) {
        const t = this.ground[j * MAP_W + i];
        if (t === G.TAXI) lists[this.taxiMask(i, j)].push([i, j]);
        else if (t === G.APRON) apron.push([i, j]);
      }
    const m = new THREE.Matrix4();
    const mk = (cells, mat, y) => {
      if (!cells.length) return;
      const im = new THREE.InstancedMesh(this.plane, mat, cells.length);
      cells.forEach(([i, j], k) => {
        m.makeTranslation(cellX(i), y, cellZ(j));
        im.setMatrixAt(k, m);
      });
      im.receiveShadow = true;
      this.surf.add(im);
    };
    lists.forEach((cells, mask) => mk(cells, this.taxiMats[mask], Y.taxi));
    mk(apron, this.apronMat, Y.apron);
    this.version++;
  }

  // ---------------------------------------------------------------- boyama (taksi / apron)
  canPaint(i, j, type) {
    if (!this.inside(i, j)) return false;
    const k = this.idx(i, j);
    if (this.obj[k] >= 0) return false;
    const t = this.ground[k];
    return t === G.GRASS || ((t === G.APRON || t === G.TAXI) && t !== type);
  }
  paint(cells, type) {
    for (const [i, j] of cells) this.ground[this.idx(i, j)] = type;
    this.rebuildSurfaces();
  }
  erase(cells) {
    let n = 0;
    for (const [i, j] of cells) {
      const k = this.idx(i, j);
      if (this.obj[k] < 0 && (this.ground[k] === G.TAXI || this.ground[k] === G.APRON)) {
        this.ground[k] = G.GRASS;
        n++;
      }
    }
    if (n) this.rebuildSurfaces();
    return n;
  }

  // ---------------------------------------------------------------- nesneler
  canPlace(kind, i0, j0, rot, extra) {
    const [w, h] = this.footprint(kind, rot, extra);
    for (let j = j0; j < j0 + h; j++)
      for (let i = i0; i < i0 + w; i++) {
        if (!this.inside(i, j)) return 'Harita dışına taşıyor';
        const k = this.idx(i, j);
        if (this.obj[k] >= 0) return 'Başka bir yapının üzerine kurulamaz';
        const t = this.ground[k];
        if (kind === 'runway' && t !== G.GRASS) return 'Pist yalnızca boş araziye kurulur';
        if (kind === 'stand' && t === G.RUNWAY) return 'Pistin üzerine kurulamaz';
        if (kind !== 'runway' && kind !== 'stand' && (t === G.RUNWAY || t === G.TAXI)) return 'Pist ya da taksi yolunun üzerine kurulamaz';
      }
    return null;
  }

  add(kind, i0, j0, rot, extra = {}, id = null) {
    const [w, h] = this.footprint(kind, rot, extra);
    const o = { id: id ?? this.nextId++, kind, i: i0, j: j0, w, h, rot, ...extra };
    this.nextId = Math.max(this.nextId, o.id + 1);
    o.cx = cellX(i0) + (w - 1) * CELL / 2;
    o.cz = cellZ(j0) + (h - 1) * CELL / 2;
    for (let j = j0; j < j0 + h; j++)
      for (let i = i0; i < i0 + w; i++) {
        const k = this.idx(i, j);
        this.obj[k] = o.id;
        if (kind === 'runway') this.ground[k] = G.RUNWAY;
        else if (kind === 'stand') this.ground[k] = G.APRON;
        else this.ground[k] = G.GRASS;
      }
    if (kind === 'stand') {
      o.num = extra.num ?? this.standNum++;
      this.standNum = Math.max(this.standNum, o.num + 1);
      o.flight = null;
    }
    this.objects.set(o.id, o);
    this.buildVisual(o);
    this.rebuildSurfaces();
    if (kind === 'runway') this.rebuildRunwayLights();
    return o;
  }

  remove(o) {
    for (let j = o.j; j < o.j + o.h; j++)
      for (let i = o.i; i < o.i + o.w; i++) {
        const k = this.idx(i, j);
        this.obj[k] = -1;
        if (o.kind === 'runway') this.ground[k] = G.GRASS;
      }
    if (o.mesh) this.root.remove(o.mesh);
    if (o.decal) this.decals.remove(o.decal);
    if (o.jw) this.root.remove(o.jw.root);
    this.objects.delete(o.id);
    this.rebuildSurfaces();
    if (o.kind === 'runway') this.rebuildRunwayLights();
  }

  list(kind) {
    return [...this.objects.values()].filter((o) => o.kind === kind);
  }

  dailyCost(o) {
    if (o.kind === 'runway') return RUNWAYS.find((r) => r.len === o.len).daily;
    if (o.kind === 'stand') return DAILY[STANDS[o.size].cost] + (o.jetway ? DAILY.jetway : 0);
    return DAILY[o.kind] || 0;
  }

  // ---------------------------------------------------------------- görünüm
  buildVisual(o) {
    let m;
    if (o.kind === 'runway') m = this.runwayMesh(o);
    else if (o.kind === 'terminal') m = makeTerminal();
    else if (o.kind === 'tower') m = makeTower();
    else if (o.kind === 'hangar') m = makeHangar(o.w * CELL, o.h * CELL);
    else if (o.kind === 'stand') {
      this.standDecal(o);
      if (o.jetway) this.attachJetway(o);
      return;
    }
    m.position.set(o.cx, 0, o.cz);
    if (o.kind !== 'runway') m.rotation.y = -ROT_H[o.rot];
    m.userData.objId = o.id;
    o.mesh = m;
    this.root.add(m);
  }

  // pist: iki uç (eşik + numara) ve ortası
  runwayInfo(o) {
    // eksen yönü: rot 0/2 kuzey-güney, 1/3 doğu-batı
    const ns = o.rot % 2 === 0;
    const len = o.len * CELL;
    const ax = ns ? { x: 0, z: -1 } : { x: 1, z: 0 };   // A ucundan B ucuna
    const A = { x: o.cx - ax.x * len / 2, z: o.cz - ax.z * len / 2 };
    const B = { x: o.cx + ax.x * len / 2, z: o.cz + ax.z * len / 2 };
    const hAB = headingOf(ax.x, ax.z);
    const num = (h) => {
      let d = Math.round(((h * 180) / Math.PI + 360) % 360 / 10);
      if (d === 0) d = 36;
      return String(d).padStart(2, '0');
    };
    // A ucundan B'ye inen uçağın pisti hAB yönünde: adı hAB'ye göre
    return { len, ax, A, B, ends: [{ name: num(hAB), from: A, to: B, h: hAB }, { name: num(hAB + Math.PI), from: B, to: A, h: hAB + Math.PI }] };
  }

  runwayMesh(o) {
    const info = this.runwayInfo(o);
    const W = 3 * CELL, L = info.len;
    const g = new THREE.Group();
    const endLen = 120;
    const mid = canvasTex(128, 256, (x, w, h) => {
      x.fillStyle = '#35383b';
      x.fillRect(0, 0, w, h);
      noise(x, w, h, 100, 100, 900, 3);
      x.fillStyle = '#f1f3f5';
      x.fillRect(w / 2 - 2, 0, 4, h * 0.55);   // orta çizgi kesikli
      x.fillRect(4, 0, 3, h);                    // kenar çizgileri
      x.fillRect(w - 7, 0, 3, h);
    }, true);
    mid.repeat.set(1, (L - 2 * endLen) / 60);
    const pm = flatMat(mid, 0xffffff, 4);
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(W, L - 2 * endLen), pm);
    mm.rotation.x = -Math.PI / 2;
    mm.position.y = Y.runway;
    mm.receiveShadow = true;
    g.add(mm);
    info.ends.forEach((e, k) => {
      const t = canvasTex(256, 640, (x, w, h) => {
        x.fillStyle = '#35383b';
        x.fillRect(0, 0, w, h);
        noise(x, w, h, 100, 100, 1500, 11 + k);
        x.fillStyle = '#f1f3f5';
        x.fillRect(8, 0, 5, h);
        x.fillRect(w - 13, 0, 5, h);
        // eşik çizgileri (piyano tuşları) altta
        for (let s = 0; s < 8; s++) {
          const bx = 22 + s * 28 + (s >= 4 ? 4 : 0);
          x.fillRect(bx, h - 150, 14, 130);
        }
        x.fillRect(8, h - 14, w - 16, 8);
        // pist numarası
        x.font = 'bold 120px system-ui, sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.save();
        x.translate(w / 2, h - 260);
        x.fillText(e.name, 0, 0);
        x.restore();
        // temas bölgesi işaretleri
        x.fillRect(40, h - 470, 30, 70);
        x.fillRect(w - 70, h - 470, 30, 70);
        x.fillRect(w / 2 - 2, 0, 4, 150);
      });
      const em = new THREE.Mesh(new THREE.PlaneGeometry(W, endLen), flatMat(t, 0xffffff, 4));
      em.rotation.x = -Math.PI / 2;
      // uç: düzlemin alt kenarı pist ucunda olacak şekilde, uca bakan yön
      const dir = k === 0 ? 1 : -1;
      em.rotation.z = k === 0 ? 0 : Math.PI;
      em.position.set(0, Y.runway, dir * (L / 2 - endLen / 2));
      em.receiveShadow = true;
      g.add(em);
    });
    // grup yerel ekseni: -z = B ucu (yerel z>0 A ucu)
    g.rotation.y = -info.ends[0].h;
    return g;
  }

  rebuildRunwayLights() {
    if (this.lights.runway) this.root.remove(this.lights.runway);
    const pts = [];
    for (const o of this.list('runway')) {
      const inf = this.runwayInfo(o);
      const side = { x: -inf.ax.z, z: inf.ax.x };
      const n = Math.floor(inf.len / 60);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const px = inf.A.x + (inf.B.x - inf.A.x) * t, pz = inf.A.z + (inf.B.z - inf.A.z) * t;
        for (const s of [-1, 1]) pts.push([px + side.x * s * 25, pz + side.z * s * 25, 0]);
      }
      for (const [P, s2] of [[inf.A, 1], [inf.B, 2]])
        for (let k = -4; k <= 4; k++) pts.push([P.x + side.x * k * 5.5, P.z + side.z * k * 5.5, s2]);
    }
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.7, 6, 4);
    const mats = [0xfff4d6, 0x4cff7a, 0xff4040].map((c) => new THREE.MeshBasicMaterial({ color: c }));
    mats.forEach((mat, kind) => {
      const list = pts.filter((p) => p[2] === kind);
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([x, z], i) => {
        m.makeTranslation(x, 0.8, z);
        im.setMatrixAt(i, m);
      });
      g.add(im);
    });
    this.lights.runway = g;
    this.root.add(g);
  }

  // ---------------------------------------------------------------- park yeri
  standFrame(o) {
    // ön (burun) yönü ve önemli noktalar
    const h = ROT_H[o.rot];
    const f = dirOf(h);
    const l = dirOf(h - Math.PI / 2);   // sol
    const S = STANDS[o.size].size * CELL;
    const front = { x: o.cx + f.x * S / 2, z: o.cz + f.z * S / 2 };
    const rear = { x: o.cx - f.x * S / 2, z: o.cz - f.z * S / 2 };
    const [dI, dJ] = ROT_D[o.rot];
    // arka giriş karesi (park yerinin hemen arkasındaki orta kare)
    const mid = Math.floor(STANDS[o.size].size / 2);
    let ei, ej;
    if (o.rot === 0) { ei = o.i + mid; ej = o.j + o.h; }
    else if (o.rot === 2) { ei = o.i + mid; ej = o.j - 1; }
    else if (o.rot === 1) { ei = o.i - 1; ej = o.j + mid; }
    else { ei = o.i + o.w; ej = o.j + mid; }
    return { h, f, l, S, front, rear, entry: [ei, ej], dI, dJ };
  }

  stopPoint(o, type) {
    // uçağın referans noktası (gövde ortası) durma yeri
    const F = this.standFrame(o);
    const t = AIRCRAFT[type];
    const d = S2(F.S) - 6 - t.len / 2;
    return { x: o.cx + F.f.x * d, z: o.cz + F.f.z * d, h: F.h };
    function S2(s) { return s / 2; }
  }

  standDecal(o) {
    const S = STANDS[o.size].size * CELL;
    const px = 512;
    const tex = canvasTex(px, px, (x, w, h) => {
      const k = w / S;
      x.clearRect(0, 0, w, h);
      x.strokeStyle = '#c92a2a';
      x.lineWidth = 3;
      x.setLineDash([14, 10]);
      x.strokeRect(6, 6, w - 12, h - 12);
      x.setLineDash([]);
      x.strokeStyle = '#f2c200';
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(w / 2, h);
      x.lineTo(w / 2, 6 * k + 18);
      x.stroke();
      x.fillStyle = '#f2c200';
      x.fillRect(w / 2 - 40, 6 * k + 10, 80, 10);   // durma çizgisi
      x.font = `bold ${Math.round(w * 0.12)}px system-ui, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(o.num), w / 2 + w * 0.22, h * 0.12);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -ROT_H[o.rot];
    m.position.set(o.cx, Y.decal, o.cz);
    m.receiveShadow = true;
    m.userData.objId = o.id;
    o.decal = m;
    this.decals.add(m);
  }

  // köprülü park yeri için terminal kontrolü: ön kenarın 0-1 kare önünde terminal olmalı
  terminalInFront(o) {
    const F = this.standFrame(o);
    const s = STANDS[o.size].size;
    for (let gap = 0; gap <= 1; gap++) {
      for (let k = 0; k < s; k++) {
        let i, j;
        if (o.rot === 0) { i = o.i + k; j = o.j - 1 - gap; }
        else if (o.rot === 2) { i = o.i + k; j = o.j + o.h + gap; }
        else if (o.rot === 1) { i = o.i + o.w + gap; j = o.j + k; }
        else { i = o.i - 1 - gap; j = o.j + k; }
        const t = this.objAt(i, j);
        if (t && t.kind === 'terminal') return { terminal: t, gap };
      }
    }
    return null;
  }

  attachJetway(o) {
    const tf = this.terminalInFront(o);
    const gap = tf ? tf.gap : 0;
    const F = this.standFrame(o);
    const root = A.jetway.clone(true);
    const tunnel = root.getObjectByName('jw_tunnel');
    const cab = root.getObjectByName('jw_cab');
    const lat = o.size === 'L' ? 17 : 13;
    const along = F.S / 2 + gap * CELL + 3;
    const rot = { x: o.cx + F.f.x * along + F.l.x * lat, z: o.cz + F.f.z * along + F.l.z * lat };
    root.position.set(rot.x, 0, rot.z);
    this.root.add(root);
    o.jw = { root, tunnel, cab, rot, ext: 0, cabBase: cab.position.x, tunBase: tunnel.position.x, lenBase: 21.15 };
    this.setJetway(o, 0, 'narrow');
  }

  // ext: 0 = geri çekilmiş, 1 = uçak kapısına dayanmış
  setJetway(o, ext, type) {
    const J = o.jw;
    if (!J) return;
    const F = this.standFrame(o);
    const t = AIRCRAFT[type || (o.size === 'L' ? 'wide' : 'narrow')];
    const sp = this.stopPoint(o, type || (o.size === 'L' ? 'wide' : 'narrow'));
    const along = t.len / 2 - t.doorFromNose;
    const door = { x: sp.x + F.f.x * along + F.l.x * (t.dia / 2 + 0.6), z: sp.z + F.f.z * along + F.l.z * (t.dia / 2 + 0.6) };
    // geri çekilmiş hal: kapıdan 9 m geride ve dışarı dönük
    const back = { x: door.x + F.l.x * 9 + F.f.x * 3, z: door.z + F.l.z * 9 + F.f.z * 3 };
    const tx = back.x + (door.x - back.x) * ext, tz = back.z + (door.z - back.z) * ext;
    const dx = tx - J.rot.x, dz = tz - J.rot.z;
    const dist = Math.hypot(dx, dz);
    const h = headingOf(dx, dz);
    J.root.rotation.y = Math.PI / 2 - h;
    // uzunluk: rotunda ekseni -> kabin kapısı (model: 29,5 m). Kabin tabanı 3,27 m; kapı eşiğine göre tünel eğilir
    const Lh = clamp(dist - 8.35, J.lenBase * 0.35, J.lenBase * 1.9);
    const dy = 3.27 - (t.sill || 3.3);
    J.tunnel.scale.x = Math.hypot(Lh, dy) / J.lenBase;
    J.tunnel.rotation.z = -Math.atan2(dy, Lh);
    J.cab.position.x = J.tunBase + Lh;
    J.cab.position.y = -dy;
    // kabin gövdeye dik dönsün
    const cabH = headingOf(-F.l.x, -F.l.z);
    J.cab.rotation.y = h - cabH;
    J.ext = ext;
  }

  // ---------------------------------------------------------------- ağ bağlantısı
  // pist kenarına bitişik taksi kareleri (çıkışlar)
  runwayExits(o) {
    const out = [];
    const ns = o.rot % 2 === 0;
    if (ns) {
      for (let j = o.j; j < o.j + o.h; j++)
        for (const [i, side] of [[o.i - 1, -1], [o.i + o.w, 1]]) {
          const t = this.g(i, j);
          if (t === G.TAXI || t === G.APRON) out.push({ i, j, side, along: j - o.j });
        }
    } else {
      for (let i = o.i; i < o.i + o.w; i++)
        for (const [j, side] of [[o.j - 1, -1], [o.j + o.h, 1]]) {
          const t = this.g(i, j);
          if (t === G.TAXI || t === G.APRON) out.push({ i, j, side, along: i - o.i });
        }
    }
    return out;
  }
}
