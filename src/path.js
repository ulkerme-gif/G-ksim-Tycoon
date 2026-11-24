// Taksi yolu ağı üzerinde A* yol bulma (4 komşulu kare ızgara)
import { MAP_W, MAP_H, G } from './config.js';

class Heap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
  get size() {
    return this.k.length;
  }
}

const N = MAP_W * MAP_H;
const gScore = new Float32Array(N);
const came = new Int32Array(N);
const seen = new Uint32Array(N);
let stamp = 1;

// opts: { allowStand: Set(id), avoidRunway: bool }
export function findPath(world, start, goal, opts = {}) {
  const [si, sj] = start, [gi, gj] = goal;
  const S = sj * MAP_W + si, Gl = gj * MAP_W + gi;
  stamp++;
  const ground = world.ground, obj = world.obj;
  const allow = opts.allowStand || new Set();
  const cost = (k) => {
    const t = ground[k];
    if (t === G.GRASS) return -1;
    const id = obj[k];
    if (t === G.APRON && id >= 0) {
      // başka park yerlerinin içinden geçme
      return allow.has(id) ? 1.2 : 30;
    }
    if (t === G.RUNWAY) return opts.avoidRunway === false ? 1 : 14;
    if (t === G.APRON) return 1.15;
    return 1;
  };
  if (cost(S) < 0 && !opts.anyStart) return null;
  const h = (k) => Math.abs((k % MAP_W) - gi) + Math.abs(((k / MAP_W) | 0) - gj);
  const open = new Heap();
  seen[S] = stamp;
  gScore[S] = 0;
  came[S] = -1;
  open.push(h(S), S);
  let iter = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === Gl) break;
    if (++iter > 60000) return null;
    const ci = cur % MAP_W, cj = (cur / MAP_W) | 0;
    const gc = gScore[cur];
    for (let d = 0; d < 4; d++) {
      const ni = ci + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = cj + (d === 2 ? 1 : d === 0 ? -1 : 0);
      if (ni < 0 || nj < 0 || ni >= MAP_W || nj >= MAP_H) continue;
      const nk = nj * MAP_W + ni;
      const c = cost(nk);
      if (c < 0) continue;
      // dönüşleri biraz cezalandır (düz yolları tercih et)
      let turn = 0;
      const pk = came[cur];
      if (pk >= 0 && seen[pk] === stamp) {
        const pdx = ci - (pk % MAP_W), pdz = cj - ((pk / MAP_W) | 0);
        if (pdx !== ni - ci || pdz !== nj - cj) turn = 0.4;
      }
      const ng = gc + c + turn;
      if (seen[nk] !== stamp || ng < gScore[nk]) {
        seen[nk] = stamp;
        gScore[nk] = ng;
        came[nk] = cur;
        open.push(ng + h(nk), nk);
      }
    }
  }
  if (seen[Gl] !== stamp) return null;
  const out = [];
  for (let k = Gl; k >= 0; k = came[k]) {
    out.push([k % MAP_W, (k / MAP_W) | 0]);
    if (k === S) break;
  }
  return out.reverse();
}

// basit bağlantı kontrolü: bir kareden diğerine taksi/apron/pist üzerinden ulaşılabiliyor mu
export function reachable(world, start, goal, opts) {
  return !!findPath(world, start, goal, opts);
}
