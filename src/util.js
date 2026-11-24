import { CELL, MAP_W, MAP_H } from './config.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;

// yön: kuzey (-z) = 0, saat yönünde artar. vektör = (sin h, -cos h)
export const dirOf = (h) => ({ x: Math.sin(h), z: -Math.cos(h) });
export const headingOf = (dx, dz) => Math.atan2(dx, -dz);
export const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
// rot 0..3 -> yön (0 = kuzey, 1 = doğu, 2 = güney, 3 = batı)
export const ROT_H = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
export const ROT_D = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const cellX = (i) => (i + 0.5 - MAP_W / 2) * CELL;
export const cellZ = (j) => (j + 0.5 - MAP_H / 2) * CELL;
export const toCellI = (x) => Math.floor(x / CELL + MAP_W / 2);
export const toCellJ = (z) => Math.floor(z / CELL + MAP_H / 2);

const nf = new Intl.NumberFormat('tr-TR');
export const money = (v) => (v < 0 ? '−' : '') + '₺' + nf.format(Math.round(Math.abs(v)));
export const moneyShort = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + ' Mn' : a >= 1e3 ? Math.round(a / 1e3) + ' bin' : String(Math.round(a));
  return (v < 0 ? '−' : '') + '₺' + s;
};
export const num = (v) => nf.format(Math.round(v));
export const hhmm = (min) => {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// tohumlu rastgele sayı (kaydedilen oyunlar aynı sonuç versin diye)
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1e9) / 1e9;
  };
}
