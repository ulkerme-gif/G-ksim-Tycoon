// Havalimanı çevresi: tarlalar, uzak tepeler, kasabalar (gece pencereleri yanar), göl ve yollar.
// Uçuş modunda dışarıdan bakınca boş bir düzlük görünmesin diye.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// tarla deseni: rastgele bölünmüş parseller, sürüm izleri, çit sıraları ve toprak yollar
let farmCache = null;
export function farmlandTexture() {
  if (farmCache) return farmCache;
  return (farmCache = canvasTex(1024, 1024, (x, W, H) => {
    const r = rng(1234);
    const pal = ['#5d7f3a', '#6a8d42', '#78913f', '#8a9a4a', '#a89a55', '#9c8a52', '#7a6a45', '#56783a', '#64883e', '#b5a463', '#6f8f4f'];
    x.fillStyle = '#5f7f3d';
    x.fillRect(0, 0, W, H);
    const fields = [];
    const split = (x0, y0, w, h, d) => {
      if (d > 5 || (w < 160 && h < 160) || (d > 2 && r() < 0.18)) return fields.push([x0, y0, w, h]);
      if (w > h ? r() < 0.8 : r() < 0.2) {
        const s = w * (0.3 + r() * 0.4);
        split(x0, y0, s, h, d + 1);
        split(x0 + s, y0, w - s, h, d + 1);
      } else {
        const s = h * (0.3 + r() * 0.4);
        split(x0, y0, w, s, d + 1);
        split(x0, y0 + s, w, h - s, d + 1);
      }
    };
    split(0, 0, W, H, 0);
    for (const [fx, fy, fw, fh] of fields) {
      x.fillStyle = pal[Math.floor(r() * pal.length)];
      x.fillRect(fx, fy, fw, fh);
      // sürüm izleri
      x.save();
      x.beginPath();
      x.rect(fx, fy, fw, fh);
      x.clip();
      x.strokeStyle = r() < 0.5 ? 'rgba(255,255,240,0.07)' : 'rgba(0,0,0,0.07)';
      x.lineWidth = 2;
      const vert = r() < 0.5;
      for (let k = 0; k < (vert ? fw : fh); k += 6) {
        x.beginPath();
        if (vert) {
          x.moveTo(fx + k, fy);
          x.lineTo(fx + k, fy + fh);
        } else {
          x.moveTo(fx, fy + k);
          x.lineTo(fx + fw, fy + k);
        }
        x.stroke();
      }
      x.restore();
      // çit (koyu yeşil kenar) bazen
      if (r() < 0.6) {
        x.strokeStyle = 'rgba(38,60,30,0.75)';
        x.lineWidth = 3;
        x.strokeRect(fx + 1.5, fy + 1.5, fw - 3, fh - 3);
      }
    }
    // ağaç kümeleri
    for (let k = 0; k < 260; k++) {
      x.fillStyle = `rgba(${30 + r() * 20},${55 + r() * 25},${28 + r() * 15},0.85)`;
      const cx = r() * W, cy = r() * H;
      for (let j = 0; j < 5; j++) {
        x.beginPath();
        x.arc(cx + (r() - 0.5) * 18, cy + (r() - 0.5) * 18, 3 + r() * 5, 0, Math.PI * 2);
        x.fill();
      }
    }
    // toprak yollar
    x.strokeStyle = 'rgba(190,170,130,0.8)';
    x.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      x.beginPath();
      const y0 = r() * H;
      x.moveTo(0, y0);
      x.bezierCurveTo(W * 0.3, y0 + (r() - 0.5) * 300, W * 0.7, y0 + (r() - 0.5) * 300, W, y0);
      x.stroke();
    }
  }));
}

// pencere dokusu: gündüz cephe, gece yanan pencereler (emissive)
function facadeTextures() {
  const r = rng(77);
  const lit = [];
  const day = canvasTex(64, 128, (x, W, H) => {
    x.fillStyle = '#b9b4aa';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#8f8a82';
    x.fillRect(0, H - 8, 8, 8);   // çatı köşesi (uv 0..0.1)
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 4; i++) {
        x.fillStyle = '#3d4d5c';
        x.fillRect(5 + i * 15, 6 + j * 12, 9, 7);
        lit.push(r() < 0.45);
      }
  });
  let k = 0;
  const night = canvasTex(64, 128, (x, W, H) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 4; i++) {
        if (lit[k++]) {
          x.fillStyle = r() < 0.7 ? '#ffd58a' : '#cfe3ff';
          x.fillRect(5 + i * 15, 6 + j * 12, 9, 7);
        }
      }
  });
  return { day, night };
}

let sceneryCache = null;
export function makeScenery(root, quality = 1) {
  // aynı nesneler yeni dünyaya taşınır (yeniden çizilmez)
  if (sceneryCache) {
    root.add(sceneryCache.group);
    return sceneryCache;
  }
  const out = { windowMats: [], group: new THREE.Group() };
  root = (root.add(out.group), out.group);
  // ---- kasabalar
  const { day, night } = facadeTextures();
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // çatı yüzü (+y): düz renkli köşeye
  const uv = box.attributes.uv;
  for (let k = 8; k < 12; k++) uv.setXY(k, 0.02 + (k % 2) * 0.08, 0.02 + (k > 9 ? 0.03 : 0));
  const mat = new THREE.MeshStandardMaterial({ map: day, emissiveMap: night, emissive: new THREE.Color(1, 0.9, 0.7), emissiveIntensity: 0, roughness: 0.85 });
  out.windowMats.push(mat);
  const towns = [[-7200, 4600, 1000, 240], [6600, -5400, 800, 170], [-3800, -7600, 500, 90], [9800, 3200, 450, 70]];
  const total = towns.reduce((s, t) => s + Math.round(t[3] * quality), 0);
  const im = new THREE.InstancedMesh(box, mat, total);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const r = rng(99);
  let n = 0;
  for (const [tx, tz, R, cnt] of towns) {
    const rot = r() * Math.PI;
    for (let k = 0; k < Math.round(cnt * quality); k++) {
      // ızgara sokaklar: merkezde yüksek binalar
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      let x = Math.cos(a) * d, z = Math.sin(a) * d;
      x = Math.round(x / 45) * 45;
      z = Math.round(z / 45) * 45;
      const cx = tx + x * Math.cos(rot) - z * Math.sin(rot), cz = tz + x * Math.sin(rot) + z * Math.cos(rot);
      const center = 1 - d / R;
      const h = 8 + r() * 14 + (center > 0.6 && r() < 0.5 ? 25 + r() * 70 * center : 0);
      const w = 14 + r() * 16;
      q.setFromAxisAngle(_Y, rot);
      sc.set(w, h, w * (0.7 + r() * 0.6));
      p.set(cx + (r() - 0.5) * 8, 0, cz + (r() - 0.5) * 8);
      m4.compose(p, q, sc);
      im.setMatrixAt(n, m4);
      const g = 0.8 + r() * 0.35;
      col.setRGB(g, g * (0.96 + r() * 0.06), g * (0.9 + r() * 0.1));
      im.setColorAt(n, col);
      n++;
    }
  }
  im.count = n;
  root.add(im);
  // ---- yollar: havalimanından kasabalara
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const road = (x0, z0, x1, z1, w = 14) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L).rotateX(-Math.PI / 2), roadMat);
    m.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(x1 - x0, -(z1 - z0));
    m.receiveShadow = true;
    root.add(m);
  };
  road(-1980, 300, -7200, 4600);
  road(1980, -400, 6600, -5400);
  road(-7200, 4600, -3800, -7600, 10);
  // ---- göl
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x24506b, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.5 }));
  lake.scale.set(1300, 1, 750);
  lake.position.set(4300, 0.08, 5600);
  lake.rotation.y = 0.4;
  root.add(lake);
  // ---- uzak tepeler: 11–17 km halkası
  const seg = 160, rings = 6;
  const pos = [], cols = [], idx = [];
  const rr = rng(5);
  const ph = [rr() * 6, rr() * 6, rr() * 6];
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const t = j / rings;
      const R = 11000 + t * 6000;
      const hN = (Math.sin(a * 3 + ph[0]) * 0.5 + 0.5) * 0.5 + (Math.sin(a * 7 + ph[1]) * 0.5 + 0.5) * 0.3 + (Math.sin(a * 17 + ph[2]) * 0.5 + 0.5) * 0.2;
      const h = Math.sin(t * Math.PI) * (250 + hN * 900) * (j === 0 || j === rings ? 0 : 1);
      pos.push(Math.cos(a) * R, h - 5, Math.sin(a) * R);
      const g = 0.28 + hN * 0.12;
      cols.push(g * 0.75, g, g * 0.78);
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  hg.setIndex(idx);
  hg.computeVertexNormals();
  const hills = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  hills.frustumCulled = false;
  root.add(hills);
  sceneryCache = out;
  return out;
}
const _Y = new THREE.Vector3(0, 1, 0);
