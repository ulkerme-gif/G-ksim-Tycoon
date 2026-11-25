// Modeller: kullanıcının gönderdiği GLB'ler (terminal, kule, yolcu köprüsü) ve kodla çizilen modeller
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import terminalGlb from '../assets/terminal.glb';
import towerGlb from '../assets/tower.glb';
import jetwayGlb from '../assets/jetway.glb';
import e170Glb from '../assets/e170.glb';
import stairsGlb from '../assets/stairs.glb';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import hangarWallUrl from '../assets/hangar_wall.jpg';
import concreteUrl from '../assets/concrete.jpg';
import { AIRCRAFT } from './config.js';

export const A = {};   // yüklenen modeller

function parseGlb(bytes) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => loader.parse(buf, '', (g) => res(g.scene), rej));
}

function shadows(o, cast = true, receive = true) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
  return o;
}

function loadTex(url, repeat = 1) {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

export async function loadAssets() {
  await MeshoptDecoder.ready;
  const [terminal, tower, jetway, e170, stairs] = await Promise.all([parseGlb(terminalGlb), parseGlb(towerGlb), parseGlb(jetwayGlb), parseGlb(e170Glb), parseGlb(stairsGlb)]);
  A.e170 = shadows(e170, true, false);
  A.stairs = shadows(stairs, true, false);
  terminal.traverse((m) => {
    if (m.isMesh) {
      m.material.flatShading = false;
      m.material.roughness = 0.8;
      m.material.metalness = 0.05;
    }
  });
  A.terminal = shadows(terminal);
  A.tower = shadows(tower);
  jetway.traverse((m) => {
    if (m.isMesh && m.material.transparent) m.castShadow = false;
  });
  A.jetway = shadows(jetway);
  A.hangarWall = loadTex(hangarWallUrl);
  A.concrete = loadTex(concreteUrl);
}

// ---------------------------------------------------------------- binalar
export function makeTerminal() {
  const g = new THREE.Group();
  const m = A.terminal.clone(true);
  m.rotation.y = Math.PI / 2;     // modelin hava tarafı (+x) binanın önüne (-z) döner
  g.add(m);
  return g;
}

export function makeTower() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 30), new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.9 }));
  pad.position.y = 0.2;
  pad.receiveShadow = true;
  g.add(pad, A.tower.clone(true));
  return g;
}

let hangarMats = null;
export function makeHangar(wm, hm) {
  // wm x hm metre taban, ön yüz -z
  if (!hangarMats) {
    const wall = A.hangarWall.clone();
    wall.needsUpdate = true;
    wall.repeat.set(6, 1.5);
    const roof = A.hangarWall.clone();
    roof.needsUpdate = true;
    roof.repeat.set(1, 10);
    const door = A.hangarWall.clone();
    door.needsUpdate = true;
    door.repeat.set(10, 1);
    hangarMats = {
      wall: new THREE.MeshStandardMaterial({ map: wall, color: 0xe8edf2, roughness: 0.6, metalness: 0.1 }),
      roof: new THREE.MeshStandardMaterial({ map: roof, color: 0xd5dbe1, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }),
      door: new THREE.MeshStandardMaterial({ map: door, color: 0x9aa6b2, roughness: 0.55, metalness: 0.15 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x2f3a45, roughness: 0.6 }),
      floor: new THREE.MeshStandardMaterial({ map: A.concrete, color: 0xbbbbbb, roughness: 0.95 }),
      sign: new THREE.MeshStandardMaterial({ color: 0x1c7ed6, roughness: 0.5 }),
    };
  }
  const M = hangarMats;
  const g = new THREE.Group();
  const W = wm - 6, D = hm - 6, H = 14, R = W / 2;
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(wm, 0.3, hm), M.floor, 0, 0.15, 0);
  // yan ve arka duvarlar
  add(new THREE.BoxGeometry(0.6, H, D), M.wall, -W / 2, H / 2, 0);
  add(new THREE.BoxGeometry(0.6, H, D), M.wall, W / 2, H / 2, 0);
  add(new THREE.BoxGeometry(W, H, 0.6), M.wall, 0, H / 2, D / 2);
  // kemerli çatı
  const roof = add(new THREE.CylinderGeometry(R, R, D, 32, 1, true, -Math.PI / 2, Math.PI), M.roof, 0, H, 0);
  roof.rotation.x = -Math.PI / 2;   // üst yarım silindir
  roof.scale.set(1, 1, 0.42);
  // arka kemer
  const backArch = new THREE.Shape();
  backArch.absarc(0, 0, R, 0, Math.PI, false);
  const arch = add(new THREE.ShapeGeometry(backArch, 24), M.wall, 0, H, D / 2 - 0.05);
  arch.scale.set(1, 0.42, 1);
  // ön kapı: sürgülü paneller ve kemer
  const front = add(new THREE.ShapeGeometry(backArch, 24), M.frame, 0, H, -D / 2 + 0.05);
  front.scale.set(1, 0.42, 1);
  front.rotation.y = Math.PI;
  const panels = 6;
  for (let k = 0; k < panels; k++) {
    const pw = W / panels;
    add(new THREE.BoxGeometry(pw - 0.4, H - 0.6, 0.5), M.door, -W / 2 + pw * (k + 0.5), (H - 0.6) / 2, -D / 2 - 0.2);
  }
  add(new THREE.BoxGeometry(W + 1, 0.8, 0.8), M.frame, 0, H, -D / 2 - 0.3);
  add(new THREE.BoxGeometry(14, 2.6, 0.3), M.sign, 0, H + 3, -D / 2 - 0.4);
  return g;
}

// ---------------------------------------------------------------- uçaklar (kodla çizilen, havayolu boyalı)
const acCache = new Map();

function liveryTexture(type, airline) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const x = c.getContext('2d');
  // u (yatay) gövde çevresi: 0 üst, 0.25 sağ, 0.5 alt, 0.75 sol. v (dikey) boy: üst = burun
  x.fillStyle = '#f4f6f8';
  x.fillRect(0, 0, 512, 1024);
  x.fillStyle = '#c9ced4';
  x.fillRect(512 * 0.38, 0, 512 * 0.24, 1024);
  x.fillStyle = airline.stripe;
  x.fillRect(512 * 0.31, 60, 512 * 0.07, 900);
  x.fillRect(512 * 0.62, 60, 512 * 0.07, 900);
  x.fillStyle = airline.tail;
  x.fillRect(512 * 0.295, 60, 512 * 0.02, 900);
  x.fillRect(512 * 0.685, 60, 512 * 0.02, 900);
  // pencereler
  x.fillStyle = '#26323d';
  const n = type === 'wide' ? 58 : 34;
  for (let k = 0; k < n; k++) {
    const v = 0.17 + (k / (n - 1)) * 0.64;
    const y = 1024 * (1 - v);
    for (const u of [0.205, 0.795]) x.fillRect(512 * u - 3, y - 5, 6, 10);
  }
  // kapılar
  x.strokeStyle = '#9aa3ad';
  x.lineWidth = 2;
  for (const v of [0.86, 0.13]) for (const u of [0.2, 0.8]) x.strokeRect(512 * u - 7, 1024 * (1 - v) - 18, 14, 36);
  // kokpit camları
  x.fillStyle = '#1b2530';
  for (const u of [0.12, 0.2, 0.8, 0.88]) x.fillRect(512 * u - 9, 1024 * (1 - 0.955) - 8, 18, 14);
  // havayolu adı (iki yanda)
  x.fillStyle = airline.stripe;
  x.font = `bold ${type === 'wide' ? 44 : 40}px system-ui, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.save();
  x.translate(512 * 0.25, 1024 * 0.42);
  x.rotate(Math.PI / 2);
  x.fillText(airline.name.toUpperCase(), 0, 0);
  x.restore();
  x.save();
  x.translate(512 * 0.75, 1024 * 0.42);
  x.rotate(-Math.PI / 2);
  x.fillText(airline.name.toUpperCase(), 0, 0);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wingGeo(rootX, rootLE, rootChord, tipX, sweep, tipChord, thick, dihedral) {
  // kanat planı (sağ kanat), XZ düzleminde; -z ileri
  const s = new THREE.Shape();
  s.moveTo(rootX, rootLE);
  s.lineTo(tipX, rootLE + sweep);
  s.lineTo(tipX, rootLE + sweep + tipChord);
  s.lineTo(rootX, rootLE + rootChord);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2);   // düz yatır (shape y -> z)
  g.translate(0, thick / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const xx = pos.getX(i);
    pos.setY(i, pos.getY(i) + Math.max(0, xx - rootX) * Math.tan(dihedral));
  }
  g.computeVertexNormals();
  return g;
}

function mirrorX(g) {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const idx = m.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  m.computeVertexNormals();
  return m;
}

function buildAircraftParts(type, airline) {
  const t = AIRCRAFT[type];
  const L = t.len, R = t.dia / 2, S = t.span / 2;
  const yc = t.gearZ + R;          // gövde ekseni yüksekliği
  const wide = type === 'wide';
  // gövde (torna): kuyruktan buruna
  const prof = [];
  const steps = 26;
  for (let k = 0; k <= steps; k++) {
    const v = k / steps;
    let r = R;
    if (v < 0.2) r = R * (0.18 + 0.82 * Math.pow(Math.sin((v / 0.2) * Math.PI / 2), 0.9));
    if (v > 0.88) r = R * Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.88) / 0.12, 2))) * 0.98 + R * 0.02;
    prof.push(new THREE.Vector2(Math.max(r, 0.02), (v - 0.5) * L));
  }
  const body = new THREE.LatheGeometry(prof, 28);
  body.rotateX(-Math.PI / 2);
  // kuyruk konisini yukarı kaldır
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const z = bp.getZ(i);
    const v = 0.5 + z / L;    // z>0 kuyruk tarafı
    if (v > 0.68) bp.setY(i, bp.getY(i) + Math.pow((v - 0.68) / 0.32, 1.6) * R * 0.75);
  }
  body.computeVertexNormals();
  body.translate(0, yc, 0);

  const wingRootLE = -L * 0.06;
  const rootChord = L * (wide ? 0.2 : 0.19);
  const wingR = wingGeo(R * 0.7, wingRootLE, rootChord, S, S * 0.55, rootChord * 0.25, wide ? 0.7 : 0.5, 0.09);
  wingR.translate(0, yc - R * 0.55, 0);
  const wingL = mirrorX(wingR);
  const hs = wide ? 10.5 : 6.6;
  const stabR = wingGeo(R * 0.4, L * 0.36, L * 0.09, hs, hs * 0.7, L * 0.035, 0.3, 0.12);
  stabR.translate(0, yc + R * 0.3, 0);
  const stabL = mirrorX(stabR);
  // dikey kuyruk
  const fs = new THREE.Shape();
  const fh = t.tail - yc - R * 0.3, fr = L * 0.17;
  fs.moveTo(L * 0.3, 0);
  fs.lineTo(L * 0.3 + fr * 0.9, fh);
  fs.lineTo(L * 0.3 + fr * 0.9 + fr * 0.42, fh);
  fs.lineTo(L * 0.3 + fr + fr * 0.08, 0);
  fs.closePath();
  const fin = new THREE.ExtrudeGeometry(fs, { depth: wide ? 0.6 : 0.4, bevelEnabled: false });
  fin.rotateY(-Math.PI / 2);
  fin.translate(-(wide ? 0.3 : 0.2) + (wide ? 0.6 : 0.4), yc + R * 0.55, 0);
  // motorlar
  const eng = [];
  const engR = wide ? 1.75 : 1.05, engL = wide ? 7.2 : 4.4;
  const ex = S * 0.34, ez = wingRootLE + S * 0.34 * 0.55 * (S / (S - R * 0.7)) - engL * 0.55;
  for (const sx of [-1, 1]) {
    const c = new THREE.CylinderGeometry(engR, engR * 0.82, engL, 20, 1, false);
    c.rotateX(Math.PI / 2);
    c.translate(sx * ex, yc - R * 0.55 - engR * 0.95, ez);
    eng.push(c);
    const pylon = new THREE.BoxGeometry(0.4, engR * 0.9, engL * 0.6);
    pylon.translate(sx * ex, yc - R * 0.55 - engR * 0.3, ez + engL * 0.15);
    eng.push(pylon);
  }
  const intake = [];
  for (const sx of [-1, 1]) {
    const d = new THREE.CircleGeometry(engR * 0.86, 20);
    d.rotateY(Math.PI);   // disk -z (ileri) yönüne baksın
    d.translate(sx * ex, yc - R * 0.55 - engR * 0.95, ez - engL / 2 - 0.02);
    intake.push(d);
  }
  // iniş takımı
  const gear = [];
  const tyre = wide ? 0.62 : 0.5;
  const strut = (x, z, h) => {
    const s = new THREE.CylinderGeometry(0.14, 0.14, h, 6);
    s.translate(x, tyre + h / 2, z);
    gear.push(s);
  };
  const wheel = (x, z) => {
    const w = new THREE.CylinderGeometry(tyre, tyre, wide ? 0.5 : 0.36, 12);
    w.rotateZ(Math.PI / 2);
    w.translate(x, tyre, z);
    gear.push(w);
  };
  const noseZ = -L * 0.39;
  strut(0, noseZ, t.gearZ + R * 0.3 - tyre);
  wheel(-0.32, noseZ);
  wheel(0.32, noseZ);
  const mgx = wide ? 5.5 : 3.8, mgz = L * 0.04;
  for (const sx of [-1, 1]) {
    strut(sx * mgx, mgz, t.gearZ + R * 0.2 - tyre);
    const rows = wide ? [-1.5, 0, 1.5] : [0];
    for (const dz of rows) {
      wheel(sx * mgx - 0.45, mgz + dz);
      wheel(sx * mgx + 0.45, mgz + dz);
    }
  }
  const mats = {
    body: new THREE.MeshStandardMaterial({ map: liveryTexture(type, airline), roughness: 0.45, metalness: 0.1 }),
    tail: new THREE.MeshStandardMaterial({ color: airline.tail, roughness: 0.45, metalness: 0.1 }),
    wing: new THREE.MeshStandardMaterial({ color: 0xc8ced5, roughness: 0.5, metalness: 0.25 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.4, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.8 }),
  };
  return {
    meshes: [
      [body, mats.body],
      [fin, mats.tail],
      [mergeGeometries([wingR, wingL, stabR, stabL].map((g) => (g.index ? g.toNonIndexed() : g))), mats.wing],
      [mergeGeometries(eng.map((g) => (g.index ? g.toNonIndexed() : g))), mats.engine],
      [mergeGeometries([...intake, ...gear].map((g) => (g.index ? g.toNonIndexed() : g))), mats.dark],
    ],
    noseZ: -L / 2,
    gearNoseZ: noseZ,
  };
}

// gönderilen modelle (E170): kuyruk havayolu renginde, gövdeye şerit ve ad çıkartması
function buildModelLivery(type, airline) {
  const fus = A.e170.getObjectByName('fuselage');
  fus.updateMatrixWorld(true);
  const fin = new THREE.MeshStandardMaterial({ color: airline.tail, roughness: 0.45, metalness: 0.1 });
  const decalMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.45, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const canvasT = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const name = canvasT(1024, 128, (x, w, h) => {
    x.fillStyle = airline.stripe;
    x.font = 'bold 92px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const txt = airline.name.toUpperCase();
    const k = Math.min(1, (w * 0.96) / x.measureText(txt).width);
    x.save();
    x.translate(w / 2, h / 2);
    x.scale(k, 1);
    x.fillText(txt, 0, 4);
    x.restore();
  });
  const stripe = canvasT(512, 32, (x, w, h) => {
    x.fillStyle = airline.tail;
    x.fillRect(0, 0, w, h * 0.62);
    x.fillStyle = airline.stripe;
    x.fillRect(0, h * 0.72, w, h * 0.28);
  });
  const nameMat = decalMat(name), stripeMat = decalMat(stripe);
  const ray = new THREE.Raycaster();
  const decals = [];
  for (const side of [1, -1]) {
    const hitAt = (y, z) => {
      ray.set(new THREE.Vector3(side * 6, y, z), new THREE.Vector3(-side, 0, 0));
      const h = ray.intersectObject(fus, false)[0];
      return h ? h.point : new THREE.Vector3(side * 1.6, y, z);
    };
    const rot = new THREE.Euler(0, side * Math.PI / 2, 0);
    const p1 = hitAt(4.2, -1.5);
    decals.push([new DecalGeometry(fus, p1, rot, new THREE.Vector3(10.5, 1.3, 1.6)), nameMat]);
    const p2 = hitAt(3.12, 0.8);
    decals.push([new DecalGeometry(fus, p2, rot, new THREE.Vector3(25, 0.42, 1.6)), stripeMat]);
  }
  return { model: true, fin, decals };
}

export function makeAircraft(type, airline) {
  const t = AIRCRAFT[type];
  const key = type + ':' + airline.id;
  if (!acCache.has(key)) acCache.set(key, t.model ? buildModelLivery(type, airline) : buildAircraftParts(type, airline));
  const P = acCache.get(key);
  const g = new THREE.Group();
  if (P.model) {
    const m = A.e170.clone(true);
    m.getObjectByName('fin').material = P.fin;
    g.add(m);
    for (const [geo, mat] of P.decals) g.add(new THREE.Mesh(geo, mat));
  } else {
    for (const [geo, mat] of P.meshes) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = false;
      g.add(m);
    }
  }
  // seyir ışıkları ve çakar
  const lamp = (color, x, y, z, r = 0.35) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const yc = t.gearZ + t.dia / 2;
  const L = t.lights || { wingY: yc - t.dia * 0.15, wingZ: t.span * 0.27, wingX: t.span / 2, top: yc + t.dia / 2 + 0.25, noseZ: -t.len * 0.39, noseY: t.gearZ + 0.9 };
  g.userData.beacon = lamp(0xff2020, 0, L.top, 0, 0.3);
  lamp(0xff3030, -L.wingX, L.wingY, L.wingZ, 0.3);
  lamp(0x30ff60, L.wingX, L.wingY, L.wingZ, 0.3);
  // kalkış/iniş ışığı
  g.userData.landing = lamp(0xfff6d0, 0, L.noseY, L.noseZ, 0.25);
  return g;
}

// ---------------------------------------------------------------- yer araçları
const vmat = {};
const VM = (c, r = 0.6, m = 0.1) => (vmat[c + ':' + r] ||= new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
function box(g, w, h, d, c, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), VM(c));
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
function wheels(g, xs, zs, r = 0.45) {
  const geo = new THREE.CylinderGeometry(r, r, 0.35, 10);
  geo.rotateZ(Math.PI / 2);
  for (const x of xs) for (const z of zs) {
    const m = new THREE.Mesh(geo, VM(0x1e2124, 0.9));
    m.position.set(x, r, z);
    g.add(m);
  }
}
export function makeVehicle(kind, scale = 1) {
  const g = new THREE.Group();
  if (kind === 'stairs' && A.stairs) {
    // gönderilen merdiven aracı: platform önde (-z), kabinin üstünde; uçağın kapı yüksekliğine göre ölçeklenir
    const m = A.stairs.clone(true);
    m.scale.setScalar(scale);
    g.add(m);
    return g;
  }
  if (kind === 'tug') {
    box(g, 2.8, 1.2, 6, 0xf2c200, 0, 1.0, 0);
    box(g, 2.2, 1.2, 1.6, 0x2b2f33, 0, 2.2, 1.8);
    wheels(g, [-1.3, 1.3], [-1.8, 1.8], 0.55);
  } else if (kind === 'fuel') {
    box(g, 2.5, 2.2, 2.4, 0xe9ecef, 0, 1.6, -3.6);
    box(g, 2.3, 0.8, 1.2, 0x1c2a36, 0, 2.3, -4.4);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 7, 16), VM(0xf1f3f5, 0.35, 0.4));
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, 2.1, 1.3);
    tank.castShadow = true;
    g.add(tank);
    box(g, 2.6, 0.5, 0.3, 0xd9480f, 0, 2.2, 4.9);
    wheels(g, [-1.15, 1.15], [-3.6, 0.6, 3.4], 0.5);
  } else if (kind === 'baggage') {
    box(g, 1.6, 1.0, 2.6, 0x2b8a3e, 0, 0.9, -3.2);
    box(g, 1.4, 0.9, 1.0, 0x1b1f23, 0, 1.8, -2.8);
    wheels(g, [-0.75, 0.75], [-4, -2.4], 0.35);
    for (const z of [0.2, 3.4]) {
      box(g, 1.7, 0.3, 2.8, 0x495057, 0, 0.6, z);
      box(g, 1.6, 1.1, 2.5, 0x74c0fc, 0, 1.3, z);
      wheels(g, [-0.75, 0.75], [z - 1, z + 1], 0.3);
    }
  } else if (kind === 'stairs') {
    box(g, 2.4, 1.6, 6.5, 0xf8f9fa, 0, 1.2, 0);
    box(g, 2.1, 1.3, 1.8, 0x1c2a36, 0, 2.3, 2.2);
    const st = box(g, 1.6, 0.4, 7.5, 0xadb5bd, 0, 3.3, -1.5);
    st.rotation.x = 0.42;
    wheels(g, [-1.1, 1.1], [-2.2, 2.2], 0.5);
  } else if (kind === 'bus') {
    box(g, 2.9, 2.8, 13, 0x1971c2, 0, 1.8, 0);
    box(g, 2.95, 1.0, 12, 0xa5d8ff, 0, 2.4, 0);
    wheels(g, [-1.35, 1.35], [-4.5, 4.5], 0.5);
  }
  return g;
}

// ---------------------------------------------------------------- ağaçlar
export function makeTrees(points) {
  const n = points.length;
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(4, 11, 7), new THREE.MeshStandardMaterial({ color: 0x2f5d34, roughness: 0.9 }), n);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.6, 3, 5), new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.9 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  points.forEach(([x, z, k], i) => {
    s.set(k, k * (0.8 + (i % 7) * 0.06), k);
    p.set(x, 1.5 * k, z);
    m.compose(p, q, s);
    trunk.setMatrixAt(i, m);
    p.set(x, (3 + 5.5) * k, z);
    m.compose(p, q, s);
    crown.setMatrixAt(i, m);
  });
  crown.castShadow = true;
  const g = new THREE.Group();
  g.add(crown, trunk);
  return g;
}
