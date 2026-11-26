// Gece ışıkları: pist kenar/orta/eşik/yaklaşma ışıkları, PAPI, taksi yolu ışıkları, apron projektörleri,
// uçak seyir ışıkları, çakarlar ve iniş farı ışık havuzu. Hepsi tek tek parlayan noktalar (Points) olarak çizilir.
import * as THREE from 'three';
import { CELL, MAP_W, MAP_H, G } from './config.js';

// tüm ışık malzemelerinin paylaştığı değerler
export const LU = {
  scale: { value: 800 },     // piksel ölçeği: ekran yüksekliği / (2·tan(fov/2))
  night: { value: 0 },        // 0 gündüz, 1 gece
};

const VERT = `
attribute float size;
attribute vec3 color;
uniform float scale;
uniform float minPx;
uniform float maxPx;
varying vec3 vCol;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = size * scale / max(1.0, -mv.z);
  vFade = clamp(sqrt(px / minPx), 0.6, 1.0);
  gl_PointSize = clamp(max(px, minPx), 1.0, maxPx);
  vCol = color;
}`;
const FRAG = `
uniform float opacity;
varying vec3 vCol;
varying float vFade;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.0, r);
  float core = smoothstep(0.55, 0.0, r);
  gl_FragColor = vec4(vCol * (a * 0.8 + core * 1.6) * opacity * vFade, 1.0);
}`;

// dayMin: gündüz görünürlüğü (çakarlar gündüz de görünür)
export function glowMaterial(dayMin = 0, minPx = 2, maxPx = 40) {
  const m = new THREE.ShaderMaterial({
    uniforms: { scale: LU.scale, minPx: { value: minPx }, maxPx: { value: maxPx }, opacity: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  m.userData.dayMin = dayMin;
  return m;
}

function pointsGeo(list) {
  const n = list.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  list.forEach((p, k) => {
    pos[k * 3] = p[0];
    pos[k * 3 + 1] = p[1];
    pos[k * 3 + 2] = p[2];
    col[k * 3] = p[3][0];
    col[k * 3 + 1] = p[3][1];
    col[k * 3 + 2] = p[3][2];
    size[k] = p[4];
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  return g;
}

const C = {
  white: [1, 0.93, 0.78],
  edge: [1, 0.9, 0.7],
  green: [0.3, 1, 0.45],
  red: [1, 0.18, 0.12],
  blue: [0.25, 0.45, 1],
  taxi: [0.25, 0.95, 0.4],
  flood: [1, 0.85, 0.6],
  nav: [1, 0.95, 0.85],
};

// ---------------------------------------------------------------- uçak ışıkları
const acMats = {};
function acMat(kind) {
  if (!acMats[kind]) acMats[kind] = kind === 'nav' ? glowMaterial(0.25, 3) : glowMaterial(0.9, 4);
  return acMats[kind];
}
export function aircraftLights(g, L, yc) {
  const nav = new THREE.Points(pointsGeo([
    [-L.wingX, L.wingY, L.wingZ, C.red, 1.6],
    [L.wingX, L.wingY, L.wingZ, C.green, 1.6],
    [0, L.top - 0.6, L.tailZ ?? L.wingZ + 12, C.nav, 1.2],
  ]), acMat('nav'));
  const beacon = new THREE.Points(pointsGeo([[0, L.top, 0, C.red, 2.4], [0, Math.max(0.6, yc - (L.top - yc) * 0.85), 1.5, C.red, 2.2]]), acMat('flash'));
  const strobe = new THREE.Points(pointsGeo([[-L.wingX - 0.3, L.wingY, L.wingZ + 0.6, [1, 1, 1], 3.2], [L.wingX + 0.3, L.wingY, L.wingZ + 0.6, [1, 1, 1], 3.2]]), acMat('flash'));
  const landing = new THREE.Points(pointsGeo([[0, L.noseY, L.noseZ - 0.4, C.white, 2.6]]), acMat('nav'));
  for (const p of [nav, beacon, strobe, landing]) {
    p.frustumCulled = false;
    g.add(p);
  }
  g.userData.beacon = beacon;
  g.userData.strobe = strobe;
  g.userData.landing = landing;
}

// iniş farının yerde oluşturduğu ışık havuzu
let poolTex = null;
function radialTex() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  return poolTex;
}
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export const poolMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
export function makePool() {
  if (!poolMat.map) poolMat.map = radialTex();
  const m = new THREE.Mesh(poolGeo, poolMat);
  m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------- havalimanı ışıkları
export class NightLights {
  constructor(scene, world) {
    this.world = world;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.matStatic = glowMaterial(0, 5, 30);
    this.matPapi = glowMaterial(0.85, 5);
    this.matFlood = glowMaterial(0, 4);
    this.floodPoolMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
    this.poleMat = new THREE.MeshStandardMaterial({ color: 0x7d858c, roughness: 0.5, metalness: 0.6 });
    this.version = -1;
    this.papi = [];
    this.bldMats = [];
  }

  rebuild() {
    const W = this.world;
    this.version = W.version;
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      if (c.geometry && c.geometry !== poolGeo) c.geometry.dispose();
    }
    const pts = [];
    const papi = [];
    for (const o of W.list('runway')) {
      const inf = W.runwayInfo(o);
      const ax = inf.ax;
      const side = { x: -ax.z, z: ax.x };
      const L = inf.len;
      // kenar ışıkları 60 m'de bir, orta hat 30 m'de bir
      const n = Math.floor(L / 60);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const px = inf.A.x + (inf.B.x - inf.A.x) * t, pz = inf.A.z + (inf.B.z - inf.A.z) * t;
        for (const s of [-1, 1]) pts.push([px + side.x * s * 25, 0.7, pz + side.z * s * 25, C.edge, 9]);
      }
      const m = Math.floor(L / 30);
      for (let k = 1; k < m; k++) {
        const t = k / m;
        pts.push([inf.A.x + (inf.B.x - inf.A.x) * t, 0.25, inf.A.z + (inf.B.z - inf.A.z) * t, C.white, 4.5]);
      }
      // eşikler: yeşil, uçta kırmızı; yaklaşma ışıkları dışarı doğru
      for (const e of inf.ends) {
        const d = { x: e.to.x - e.from.x, z: e.to.z - e.from.z };
        const dl = Math.hypot(d.x, d.z);
        d.x /= dl;
        d.z /= dl;
        for (let k = -6; k <= 6; k++) {
          pts.push([e.from.x + side.x * k * 4 + d.x * 1.5, 0.6, e.from.z + side.z * k * 4 + d.z * 1.5, C.green, 9]);
          pts.push([e.from.x + side.x * k * 4 - d.x * 3, 0.6, e.from.z + side.z * k * 4 - d.z * 3, C.red, 7]);
        }
        for (let s = 30; s <= 420; s += 30) {
          pts.push([e.from.x - d.x * s, 1.2, e.from.z - d.z * s, C.white, 12]);
          if (s === 150 || s === 300) for (let k = 1; k <= 4; k++) for (const sg of [-1, 1]) pts.push([e.from.x - d.x * s + side.x * sg * k * 4.5, 1.2, e.from.z - d.z * s + side.z * sg * k * 4.5, C.white, 9]);
        }
        // PAPI: eşikten 300 m içeride, inen uçağın soluna (pist kenarından 15 m dışarı)
        const left = { x: d.z, z: -d.x };
        const base = { x: e.from.x + d.x * 300 + left.x * 40, z: e.from.z + d.z * 300 + left.z * 40 };
        for (let k = 0; k < 4; k++) papi.push({ x: base.x + left.x * k * 9, z: base.z + left.z * k * 9, ang: [3.5, 3.17, 2.83, 2.5][k], dx: d.x, dz: d.z, fx: e.from.x, fz: e.from.z });
      }
    }
    // taksi yolu: orta hat yeşil, çim kenarında mavi
    const g = W.ground;
    const at = (i, j) => (i < 0 || j < 0 || i >= MAP_W || j >= MAP_H ? G.GRASS : g[j * MAP_W + i]);
    const cx = (i) => (i - MAP_W / 2 + 0.5) * CELL, cz = (j) => (j - MAP_H / 2 + 0.5) * CELL;
    const floods = [];
    for (let j = 0; j < MAP_H; j++)
      for (let i = 0; i < MAP_W; i++) {
        const t = g[j * MAP_W + i];
        if (t === G.TAXI) {
          if ((i + j) % 2 === 0) pts.push([cx(i), 0.35, cz(j), C.taxi, 5]);
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (at(i + di, j + dj) !== G.GRASS) continue;
            pts.push([cx(i) + di * (CELL / 2 - 0.8), 0.5, cz(j) + dj * (CELL / 2 - 0.8), C.blue, 5.5]);
          }
        } else if (t === G.APRON) {
          // apron kenarında her 5 karede bir projektör direği
          let edge = null;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n2 = at(i + di, j + dj);
            if (n2 === G.GRASS) edge = [di, dj];
          }
          if (edge && (i * 7 + j * 3) % 5 === 0) floods.push([cx(i) + edge[0] * (CELL / 2 - 1.5), cz(j) + edge[1] * (CELL / 2 - 1.5), -edge[0], -edge[1]]);
        }
      }
    if (pts.length) {
      const p = new THREE.Points(pointsGeo(pts), this.matStatic);
      p.frustumCulled = false;
      this.root.add(p);
    }
    // PAPI (renkleri her karede gözlemciye göre)
    this.papi = papi;
    if (papi.length) {
      this.papiPts = new THREE.Points(pointsGeo(papi.map((q) => [q.x, 1.1, q.z, C.red, 7])), this.matPapi);
      this.papiPts.frustumCulled = false;
      this.root.add(this.papiPts);
    } else this.papiPts = null;
    // projektörler: direk + parıltı + yerde ışık havuzu
    if (floods.length) {
      const H = 22;
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, H, 6).translate(0, H / 2, 0), this.poleMat, floods.length);
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.6, 1.2).translate(0, H, 0), this.poleMat, floods.length);
      const pool = new THREE.InstancedMesh(poolGeo, this.floodPoolMat, floods.length);
      const mtx = new THREE.Matrix4();
      const fpts = [];
      floods.forEach(([x, z, nx, nz], k) => {
        mtx.makeTranslation(x, 0, z);
        pole.setMatrixAt(k, mtx);
        head.setMatrixAt(k, mtx);
        mtx.makeScale(85, 1, 85).setPosition(x + nx * 26, 0.4, z + nz * 26);
        pool.setMatrixAt(k, mtx);
        fpts.push([x + nx * 0.6, H - 0.4, z + nz * 0.6, C.flood, 11]);
      });
      pole.castShadow = true;
      if (!this.floodPoolMat.map) this.floodPoolMat.map = radialTex();
      pool.renderOrder = 2;
      const fp = new THREE.Points(pointsGeo(fpts), this.matFlood);
      fp.frustumCulled = false;
      this.pool = pool;
      this.root.add(pole, head, pool, fp);
    }
    // bina pencere ışığı için malzemeler
    const mats = new Set();
    for (const o of W.objects.values()) {
      if ((o.kind === 'terminal' || o.kind === 'tower' || o.kind === 'hangar') && o.mesh)
        o.mesh.traverse((m) => {
          if (m.isMesh && m.material && m.material.isMeshStandardMaterial && !m.material.transparent) mats.add(m.material);
        });
    }
    this.bldMats = [...mats];
    for (const m of this.bldMats) {
      if (!m.userData.lit) {
        m.userData.lit = true;
        m.emissive = new THREE.Color(1, 0.78, 0.5);
        if (m.map && !m.emissiveMap) m.emissiveMap = m.map;
        m.emissiveIntensity = 0;
        m.needsUpdate = true;
      }
    }
  }

  // night: 0..1; obs: gözlemci (kamera ya da uçak) konumu
  update(camera, renderer, night, obs) {
    if (this.world.version !== this.version) this.rebuild();
    const h = renderer.getDrawingBufferSize(_v2).y;
    LU.scale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    LU.night.value = night;
    this.matStatic.uniforms.opacity.value = night;
    this.matFlood.uniforms.opacity.value = night;
    this.floodPoolMat.opacity = night * 0.5;
    this.root.visible = true;
    for (const k in acMats) {
      const m = acMats[k];
      m.uniforms.opacity.value = Math.max(m.userData.dayMin, night);
    }
    poolMat.opacity = night * 0.55;
    for (const m of this.bldMats) m.emissiveIntensity = night * 0.32;
    // PAPI: gözlemcinin süzülüş açısına göre kırmızı/beyaz
    if (this.papiPts) {
      const col = this.papiPts.geometry.attributes.color;
      this.papi.forEach((q, k) => {
        const along = (obs.x - q.x) * -q.dx + (obs.z - q.z) * -q.dz;   // eşiğin önündeki mesafe
        const ang = along > 0 ? (Math.atan2(obs.y - 1, along) * 180) / Math.PI : -1;
        const c = ang > q.ang ? C.white : C.red;
        col.setXYZ(k, c[0], c[1], c[2]);
      });
      col.needsUpdate = true;
      this.matPapi.uniforms.opacity.value = Math.max(0.85, night);
    }
  }
}
const _v2 = new THREE.Vector2();
