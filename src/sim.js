// Uçuş simülasyonu: yaklaşma, iniş, pist çıkışı, taksi, park, yer hizmetleri, pushback, kalkış
import * as THREE from 'three';
import { CELL, MAP_W, G, AIRCRAFT, STANDS, TIME_SCALE, TAXI_SPEED, TAXI_TURN_SPEED } from './config.js';
import { cellX, cellZ, toCellI, toCellJ, dirOf, headingOf, wrapPi, clamp, smooth } from './util.js';
import { findPath } from './path.js';
import { makeAircraft, makeVehicle } from './assets.js';

const GLIDE = Math.tan((3 * Math.PI) / 180);
const APP_DIST = 7500;     // yaklaşmanın başladığı uzaklık (eşikten)
const AIM = 300;           // süzülüşün hedef noktası (eşikten sonra)
const CLEAR_DIST = 1500;   // iniş izni istenen uzaklık
const SEP_AHEAD = 80;      // taksi ayırma mesafesi

export const STATUS = {
  planned: 'Planlandı', holding: 'Havada bekliyor', approach: 'Yaklaşıyor', goaround: 'Pas geçti', rollout: 'İndi',
  taxi_in: 'Park yerine taksi', docking: 'Park ediyor', turnaround: 'Kapıda', boarding: 'Biniş', ready: 'Pushback bekliyor',
  pushback: 'Pushback', taxi_out: 'Kalkışa taksi', holding_short: 'Kalkış sırasında', lineup: 'Piste giriyor', takeoff: 'Kalkıyor',
  departed: 'Kalktı', diverted: 'Yönlendirildi', cancelled: 'İptal',
};

export class Sim {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = game.scene;
    this.ac = [];
    this.vehicles = [];
    this.flights = [];          // tüm uçuşlar (bugün ve yarın)
    this.rw = new Map();        // pist id -> { busy: {ac, kind} | null }
    this.compVersion = -1;
    this.nextAc = 1;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.blink = 0;
  }

  // ---------------------------------------------------------------- ağ bileşenleri (bağlantı kontrolü)
  components() {
    const W = this.world;
    if (this.compVersion === W.version) return this.comp;
    const N = W.ground.length;
    const comp = new Int32Array(N).fill(-1);
    let id = 0;
    const st = [];
    for (let k = 0; k < N; k++) {
      if (comp[k] >= 0 || W.ground[k] === G.GRASS) continue;
      comp[k] = id;
      st.push(k);
      while (st.length) {
        const c = st.pop();
        const i = c % MAP_W, j = (c / MAP_W) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (!W.inside(ni, nj)) continue;
          const nk = nj * MAP_W + ni;
          if (comp[nk] < 0 && W.ground[nk] !== G.GRASS) {
            comp[nk] = id;
            st.push(nk);
          }
        }
      }
      id++;
    }
    this.comp = comp;
    this.compVersion = W.version;
    return comp;
  }

  standConnected(stand, rwy) {
    const W = this.world;
    const comp = this.components();
    const [ei, ej] = W.standFrame(stand).entry;
    if (!W.inside(ei, ej)) return false;
    const ce = comp[ej * MAP_W + ei];
    if (ce < 0) return false;
    const runways = rwy ? [rwy] : W.list('runway');
    return runways.some((r) => W.runwayExits(r).some((x) => comp[x.j * MAP_W + x.i] === ce));
  }

  runwayState(r) {
    if (!this.rw.has(r.id)) this.rw.set(r.id, { busy: null });
    return this.rw.get(r.id);
  }

  activeEnd(r) {
    const info = this.world.runwayInfo(r);
    return info.ends[r.active || 0];
  }

  // ---------------------------------------------------------------- uçuş başlatma
  canHandle(type) {
    const t = AIRCRAFT[type];
    return this.world.list('runway').some((r) => r.len * CELL >= t.minRunway);
  }

  pickStand(flight, rwy) {
    const W = this.world;
    const cands = W.list('stand').filter((s) => !s.flight && !s.departing && STANDS[s.size].fits.includes(flight.type) && this.standConnected(s, rwy));
    cands.sort((a, b) => (b.jetway ? 1 : 0) - (a.jetway ? 1 : 0) || (a.size === 'S' ? 0 : 1) - (b.size === 'S' ? 0 : 1) || a.num - b.num);
    return cands[0] || null;
  }

  runwayLoad(r) {
    return this.ac.filter((a) => a.rwy === r && ['approach', 'goaround', 'rollout', 'holding_short', 'lineup', 'takeoff', 'taxi_out'].includes(a.phase)).length;
  }

  pickRunway(type) {
    const t = AIRCRAFT[type];
    const rs = this.world.list('runway').filter((r) => r.len * CELL >= t.minRunway && this.world.runwayExits(r).length);
    rs.sort((a, b) => this.runwayLoad(a) - this.runwayLoad(b) || a.len - b.len);
    return rs[0] || null;
  }

  // her karede: zamanı gelen uçuşları başlat
  spawnDue(now) {
    const leadMin = ((APP_DIST + AIM) / 69) * (TIME_SCALE / 60);
    for (const f of this.flights) {
      if (f.status !== 'planned' && f.status !== 'holding') continue;
      if (now < f.arr - leadMin) continue;
      const econ = this.game.econ;
      if (!this.world.list('tower').length || !this.world.list('terminal').length) {
        this.divert(f, !this.world.list('tower').length ? 'kontrol kulesi yok' : 'terminal yok');
        continue;
      }
      const rwy = this.pickRunway(f.type);
      if (!rwy) {
        this.divert(f, 'uygun pist yok');
        continue;
      }
      const stand = this.pickStand(f, rwy);
      if (!stand) {
        if (f.status !== 'holding' || f.seq) {
          if (f.status !== 'holding') f.holdSince = now;
          f.status = 'holding';
          f.seq = false;
          econ.notify(`${f.code}: boş park yeri yok, havada bekliyor`, 'warn');
        }
        if (now - f.holdSince > 75) this.divert(f, 'boş park yeri bulunamadı');
        continue;
      }
      // sıralama: aynı piste yaklaşan uçaklarla en az 55 sn ara
      const eta = (APP_DIST + AIM) / 69;
      const clash = this.ac.some((o) => o.rwy === rwy && (o.phase === 'approach' || o.phase === 'goaround') && Math.abs((o.phase === 'goaround' ? 200 : (AIM - this.sAlong(o.end, o.x, o.z)) / Math.max(40, o.v)) - eta) < 55)
        // uzun süredir kalkış sırası bekleyen varsa önce o kalksın
        || this.ac.some((o) => o.rwy === rwy && o.phase === 'holding_short' && now - o.holdSince > 15);
      if (clash) {
        if (f.status !== 'holding') {
          f.status = 'holding';
          f.holdSince = now;
          f.seq = true;
        }
        continue;
      }
      if (f.status === 'holding') this.addDelay(f, f.seq ? 'sequence' : 'hold', now - f.holdSince);
      this.spawnArrival(f, rwy, stand);
    }
  }

  addDelay(f, why, min) {
    f.delay += min;
    f.why = f.why || {};
    f.why[why] = (f.why[why] || 0) + min;
  }

  divert(f, why) {
    f.status = 'diverted';
    f.note = why;
    this.game.econ.onDiverted(f, why);
  }

  spawnArrival(f, rwy, stand) {
    const end = this.activeEnd(rwy);
    const d = dirOf(end.h);
    const t = AIRCRAFT[f.type];
    const airline = this.game.econ.airline(f.airline);
    const mesh = makeAircraft(f.type, airline);
    mesh.userData.acId = this.nextAc;
    this.group.add(mesh);
    const s = -APP_DIST;
    const ac = {
      id: this.nextAc++, flight: f, type: f.type, t, mesh, rwy, end, stand,
      x: end.from.x + d.x * s, z: end.from.z + d.z * s, y: (AIM - s) * GLIDE, h: end.h, v: t.vApp, pitch: 0.05, roll: 0,
      phase: 'approach', path: null, pi: 0, timer: 0, wait: 0, cleared: false, beacon: true, lights: true, vehicles: [],
    };
    f.status = 'approach';
    f.stand = stand.num;
    f.ac = ac.id;
    stand.flight = f.id;
    this.ac.push(ac);
    this.place(ac);
  }

  removeAc(ac) {
    this.group.remove(ac.mesh);
    for (const v of ac.vehicles) this.removeVehicle(v);
    this.ac = this.ac.filter((a) => a !== ac);
    for (const [, st] of this.rw) if (st.busy && st.busy.ac === ac) st.busy = null;
    if (ac.stand && ac.stand.flight === ac.flight.id) ac.stand.flight = null;
  }

  // ---------------------------------------------------------------- yardımcılar
  place(ac) {
    const m = ac.mesh;
    m.position.set(ac.x, ac.y, ac.z);
    m.rotation.set(0, 0, 0);
    m.rotation.order = 'YXZ';
    m.rotation.y = -ac.h;
    m.rotation.x = ac.pitch;
    m.rotation.z = -ac.roll;
    m.userData.beacon.visible = ac.beacon && this.blink % 1 < 0.12;
    m.userData.landing.visible = ac.lights;
  }

  sAlong(end, x, z) {
    const d = dirOf(end.h);
    return (x - end.from.x) * d.x + (z - end.from.z) * d.z;
  }
  onCenter(end, s, lat = 0) {
    const d = dirOf(end.h);
    return { x: end.from.x + d.x * s - d.z * lat, z: end.from.z + d.z * s + d.x * lat };
  }

  cellPts(cells) {
    return cells.map(([i, j]) => ({ x: cellX(i), z: cellZ(j) }));
  }

  // yol üzerinde ileri bakan nokta (saf takip)
  lookahead(ac, L) {
    const P = ac.path;
    // en yakın parçayı ilerlet
    while (ac.pi < P.length - 1) {
      const a = P[ac.pi], b = P[ac.pi + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const l2 = vx * vx + vz * vz || 1;
      const u = ((ac.x - a.x) * vx + (ac.z - a.z) * vz) / l2;
      if (u > 1 || Math.hypot(b.x - ac.x, b.z - ac.z) < 2) ac.pi++;
      else break;
    }
    let i = ac.pi;
    let px = ac.x, pz = ac.z;
    let left = L;
    // izdüşüm noktasından başla
    if (i < P.length - 1) {
      const a = P[i], b = P[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const l2 = vx * vx + vz * vz || 1;
      const u = clamp(((ac.x - a.x) * vx + (ac.z - a.z) * vz) / l2, 0, 1);
      px = a.x + vx * u;
      pz = a.z + vz * u;
    }
    while (i < P.length - 1) {
      const b = P[i + 1];
      const seg = Math.hypot(b.x - px, b.z - pz);
      if (seg >= left) return { x: px + ((b.x - px) * left) / seg, z: pz + ((b.z - pz) * left) / seg, end: false };
      left -= seg;
      px = b.x;
      pz = b.z;
      i++;
    }
    return { x: P[P.length - 1].x, z: P[P.length - 1].z, end: true };
  }

  remaining(ac) {
    const P = ac.path;
    let d = 0;
    let px = ac.x, pz = ac.z;
    for (let i = ac.pi + 1; i < P.length; i++) {
      d += Math.hypot(P[i].x - px, P[i].z - pz);
      px = P[i].x;
      pz = P[i].z;
    }
    return d;
  }

  // yol üzerinde ilerideki dönüş açısı
  turnAhead(ac, dist) {
    const P = ac.path;
    let i = ac.pi + 1, acc = 0;
    let px = ac.x, pz = ac.z;
    let maxA = 0;
    let h0 = ac.h;
    while (i < P.length && acc < dist) {
      const seg = Math.hypot(P[i].x - px, P[i].z - pz);
      if (seg > 0.5) {
        const h = headingOf(P[i].x - px, P[i].z - pz);
        maxA = Math.max(maxA, Math.abs(wrapPi(h - h0)));
        h0 = h;
      }
      acc += seg;
      px = P[i].x;
      pz = P[i].z;
      i++;
    }
    return maxA;
  }

  // önünde başka uçak var mı (yolu üzerinde)
  blockedAhead(ac) {
    const P = ac.path;
    const pts = [];
    let px = ac.x, pz = ac.z, acc = 0;
    for (let i = ac.pi + 1; i < P.length && acc < SEP_AHEAD + 40; i++) {
      const seg = Math.hypot(P[i].x - px, P[i].z - pz);
      const n = Math.max(1, Math.ceil(seg / 8));
      for (let k = 1; k <= n; k++) pts.push({ x: px + ((P[i].x - px) * k) / n, z: pz + ((P[i].z - pz) * k) / n, d: acc + (seg * k) / n });
      acc += seg;
      px = P[i].x;
      pz = P[i].z;
    }
    for (const o of this.ac) {
      if (o === ac || o.y > 5 || o.phase === 'approach' || o.phase === 'goaround') continue;
      const r = (o.t.span / 2 + ac.t.span / 2) * 0.55 + 6;
      for (const p of pts) {
        if (p.d > SEP_AHEAD + (o.t.len + ac.t.len) / 2 - 20) break;
        if (Math.hypot(o.x - p.x, o.z - p.z) < r) {
          // karşılıklı kilitlenmeyi çöz: diğeri de bizi bekliyorsa küçük kimlik geçer
          if (o.blockedBy === ac && ac.id < o.id) return null;
          return o;
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- ana döngü
  update(dt, now) {
    this.blink += dt * 0.8;
    this.spawnDue(now);
    if (this.lastVersion !== this.world.version) {
      this.lastVersion = this.world.version;
      this.replanAll();
    }
    for (const ac of [...this.ac]) this.step(ac, dt, now);
    this.updateVehicles(dt);
  }

  replanAll() {
    for (const ac of this.ac) {
      if (ac.phase === 'taxi_in' || ac.phase === 'taxi_out') this.replan(ac);
    }
  }

  step(ac, dt, now) {
    const t = ac.t;
    switch (ac.phase) {
      case 'approach': return this.stepApproach(ac, dt, now);
      case 'goaround': return this.stepAir(ac, dt, now);
      case 'rollout':
      case 'taxi_in':
      case 'taxi_out':
      case 'lineup':
        return this.stepGround(ac, dt, now);
      case 'docking': return this.stepGround(ac, dt, now);
      case 'turnaround': return this.stepTurnaround(ac, dt, now);
      case 'ready': return this.stepReady(ac, dt, now);
      case 'pushback': return this.stepPushback(ac, dt, now);
      case 'holding_short': return this.stepHoldShort(ac, dt, now);
      case 'takeoff': return this.stepTakeoff(ac, dt, now);
      case 'departed': return this.stepDeparted(ac, dt, now);
      default:
        void t;
    }
  }

  // ---------------------------------------------------------------- hava
  stepApproach(ac, dt, now) {
    const end = ac.end;
    const s = this.sAlong(end, ac.x, ac.z);
    const st = this.runwayState(ac.rwy);
    if (!ac.cleared && s > -CLEAR_DIST) {
      // iniş izni: pist boşsa al; doluysa yaklaşmaya devam et, 500 m kala hâlâ doluysa pas geç
      if (!st.busy) {
        st.busy = { ac, kind: 'landing' };
        ac.cleared = true;
      } else if (st.busy.ac !== ac && s > -500) return this.goAround(ac, now);
    }
    // yavaşla
    const vT = s > -2000 ? ac.t.vTouch : ac.t.vApp;
    ac.v += clamp(vT - ac.v, -1.2 * dt, 1.2 * dt);
    const d = dirOf(end.h);
    // merkez hattına çek
    const lat = (ac.x - end.from.x) * -d.z + (ac.z - end.from.z) * d.x;
    const hT = end.h - clamp(lat * 0.004, -0.4, 0.4);
    ac.h += clamp(wrapPi(hT - ac.h), -0.06 * dt, 0.06 * dt);
    const dd = dirOf(ac.h);
    ac.x += dd.x * ac.v * dt;
    ac.z += dd.z * ac.v * dt;
    const glide = Math.max(0, (AIM - s) * GLIDE);
    ac.y += clamp(glide - ac.y, -9 * dt, 4 * dt);
    ac.pitch = 0.05 + (s > -60 ? 0.05 : 0);
    ac.roll = clamp(wrapPi(hT - ac.h) * 2, -0.4, 0.4);
    if (s >= AIM - 5 || (ac.y < 0.3 && s > -100)) this.touchdown(ac, now);
    this.place(ac);
  }

  goAround(ac, now) {
    ac.phase = 'goaround';
    ac.flight.status = 'goaround';
    ac.flight.goArounds = (ac.flight.goArounds || 0) + 1;
    this.game.econ.notify(`${ac.flight.code} pas geçti: pist dolu`, 'warn');
    const end = ac.end;
    const d = dirOf(end.h);
    const left = { x: d.z, z: -d.x };
    const P = (s, l) => ({ x: end.from.x + d.x * s + left.x * l, z: end.from.z + d.z * s + left.z * l });
    ac.air = [P(this.sAlong(end, ac.x, ac.z) + 2200, 0), P(3200, 900), P(2400, 1800), P(-5200, 1800), P(-6400, 900), P(-6200, 0)];
    ac.airI = 0;
    ac.gaStart = now;
  }

  stepAir(ac, dt, now) {
    const tgt = ac.air[ac.airI];
    const dx = tgt.x - ac.x, dz = tgt.z - ac.z;
    if (Math.hypot(dx, dz) < 300) {
      ac.airI++;
      if (ac.airI >= ac.air.length) {
        ac.phase = 'approach';
        ac.flight.status = 'approach';
        ac.cleared = false;
        this.addDelay(ac.flight, 'goaround', Math.max(0, now - ac.gaStart));
        return;
      }
    }
    const hT = headingOf(dx, dz);
    const w = clamp(wrapPi(hT - ac.h), -0.16 * dt, 0.16 * dt);
    ac.h = wrapPi(ac.h + w);
    ac.roll = clamp((w / dt) * 5, -0.45, 0.45);
    ac.v += clamp(100 - ac.v, -2 * dt, 3 * dt);
    const dd = dirOf(ac.h);
    ac.x += dd.x * ac.v * dt;
    ac.z += dd.z * ac.v * dt;
    ac.y += clamp(450 - ac.y, -6 * dt, 9 * dt);
    ac.pitch = ac.y < 440 ? 0.12 : 0.03;
    this.place(ac);
  }

  touchdown(ac, now) {
    const f = ac.flight;
    ac.y = 0;
    ac.pitch = 0;
    ac.roll = 0;
    ac.phase = 'rollout';
    f.status = 'rollout';
    f.landedAt = now;
    this.game.econ.onLanded(f);
    // çıkış seç
    const W = this.world;
    const end = ac.end;
    const s0 = this.sAlong(end, ac.x, ac.z);
    const vExit = 18;
    const stopNeed = (ac.v * ac.v - vExit * vExit) / (2 * ac.t.decel);
    const info = W.runwayInfo(ac.rwy);
    const comp = this.components();
    const [ei, ej] = W.standFrame(ac.stand).entry;
    const target = comp[ej * MAP_W + ei];
    const exits = W.runwayExits(ac.rwy)
      .map((x) => ({ ...x, s: this.sAlong(end, cellX(x.i), cellZ(x.j)) }))
      .filter((x) => comp[x.j * MAP_W + x.i] === target);
    let ex = exits.filter((x) => x.s >= s0 + stopNeed).sort((a, b) => a.s - b.s)[0];
    let back = false;
    if (!ex) {
      ex = exits.filter((x) => x.s >= s0 + 150).sort((a, b) => b.s - a.s)[0];
      if (!ex) {
        ex = exits.sort((a, b) => b.s - a.s)[0];
        back = true;
      }
    }
    ac.exit = ex;
    const path = [{ x: ac.x, z: ac.z }];
    let lat = 0;
    if (back) {
      // pist sonunda U dönüşü ve geri taksi
      const sEnd = info.len - 60;
      path.push(this.onCenter(end, sEnd - 40));
      path.push(this.onCenter(end, sEnd, 14), this.onCenter(end, sEnd + 25, 0), this.onCenter(end, sEnd, -14), this.onCenter(end, sEnd - 30, -4));
      path.push(this.onCenter(end, ex.s + 25, 0));
    } else path.push(this.onCenter(end, Math.max(s0 + 10, ex.s - 35), lat));
    path.push(this.onCenter(end, ex.s, 0));
    ac.exitS = ex.s;
    ac.backtrack = back;
    const cells = findPath(W, [ex.i, ex.j], W.standFrame(ac.stand).entry, { allowStand: new Set([ac.stand.id]) });
    if (!cells) {
      // yol yok: yine de çıkışa kadar git, sonra yeniden dene
      path.push({ x: cellX(ex.i), z: cellZ(ex.j) });
      ac.path = path;
      ac.pi = 0;
      ac.goal = 'stand';
      return;
    }
    path.push(...this.cellPts(cells));
    this.appendDocking(ac, path);
    ac.path = this.dedupe(path);
    ac.pi = 0;
    ac.goal = 'stand';
  }

  appendDocking(ac, path) {
    const F = this.world.standFrame(ac.stand);
    const sp = this.world.stopPoint(ac.stand, ac.type);
    ac.dockStart = path.length;
    path.push({ x: F.rear.x + F.f.x * 2, z: F.rear.z + F.f.z * 2 }, { x: sp.x, z: sp.z });
  }

  dedupe(P) {
    const out = [];
    for (const p of P) {
      const q = out[out.length - 1];
      if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 1) out.push(p);
    }
    return out;
  }

  replan(ac) {
    const W = this.world;
    const i = toCellI(ac.x), j = toCellJ(ac.z);
    let goal, allow;
    if (ac.goal === 'stand') {
      goal = W.standFrame(ac.stand).entry;
      allow = new Set([ac.stand.id]);
    } else if (ac.goal === 'hold') {
      goal = [ac.hold.i, ac.hold.j];
      allow = new Set();
    } else return;
    if (ac.pi >= (ac.dockStart || 1e9)) return;
    const cells = findPath(W, [i, j], goal, { allowStand: allow, anyStart: true });
    if (!cells) {
      ac.stuck = true;
      return;
    }
    ac.stuck = false;
    const path = [{ x: ac.x, z: ac.z }, ...this.cellPts(cells.slice(1))];
    if (ac.goal === 'stand') this.appendDocking(ac, path);
    ac.path = this.dedupe(path);
    ac.pi = 0;
  }

  // ---------------------------------------------------------------- yer hareketi
  stepGround(ac, dt, now) {
    const f = ac.flight;
    const W = this.world;
    if (!ac.path) return;
    const t = ac.t;
    const rem = this.remaining(ac);
    const end = ac.end;
    let vMax = TAXI_SPEED;
    // pistte iniş koşusu
    if (ac.phase === 'rollout') {
      const s = this.sAlong(end, ac.x, ac.z);
      const toExit = ac.backtrack ? 1e9 : ac.exitS - s;
      vMax = Math.sqrt(18 * 18 + 2 * t.decel * Math.max(0, toExit - 25));
      if (ac.backtrack) {
        const fwd = Math.cos(wrapPi(ac.h - end.h)) > 0.3;
        vMax = fwd ? Math.sqrt(8 * 8 + 2 * t.decel * Math.max(0, W.runwayInfo(ac.rwy).len - 100 - s)) : 16;
      }
      // pistten çıktı mı
      const ci = toCellI(ac.x), cj = toCellJ(ac.z);
      const onRw = W.inside(ci, cj) && W.ground[W.idx(ci, cj)] === G.RUNWAY && W.obj[W.idx(ci, cj)] === ac.rwy.id;
      if (!onRw && s > 0) {
        const st = this.runwayState(ac.rwy);
        if (st.busy && st.busy.ac === ac) st.busy = null;
        ac.phase = 'taxi_in';
        f.status = 'taxi_in';
        ac.lights = false;
      }
    }
    if (ac.phase === 'lineup') vMax = 9;
    if (ac.pi >= (ac.dockStart ?? 1e9) - 1 && ac.goal === 'stand') {
      vMax = 4;
      if (ac.phase !== 'docking') {
        ac.phase = 'docking';
        f.status = 'docking';
      }
    }
    // dönüşte yavaşla
    const turn = this.turnAhead(ac, Math.max(30, ac.v * 4));
    if (ac.phase !== 'rollout' || ac.v < 20) {
      if (turn > 0.35) vMax = Math.min(vMax, TAXI_TURN_SPEED + (TAXI_SPEED - TAXI_TURN_SPEED) * clamp(1 - (turn - 0.35) / 0.9, 0, 1));
    }
    // yolun sonunda dur
    vMax = Math.min(vMax, Math.sqrt(2 * 0.9 * Math.max(0, rem - 0.5)) + 0.3);
    // pist geçişi
    const cross = this.runwayCrossCheck(ac);
    if (cross === 'wait') vMax = Math.min(vMax, Math.sqrt(2 * 1.5 * Math.max(0, ac.crossWaitDist - 2)));
    // önde uçak
    if (ac.phase !== 'rollout') {
      const o = this.blockedAhead(ac);
      ac.blockedBy = o;
      if (o) {
        const dd = Math.hypot(o.x - ac.x, o.z - ac.z) - (o.t.len + ac.t.len) / 2;
        vMax = Math.min(vMax, clamp((dd - 15) * 0.25, 0, vMax));
      }
    }
    if (ac.stuck) vMax = 0;
    const acc = ac.phase === 'rollout' ? t.decel : vMax < ac.v ? 1.6 : 0.9;
    ac.v += clamp(vMax - ac.v, -acc * dt * 1.4, acc * dt);
    if (ac.v < 0) ac.v = 0;
    if (vMax < 0.05 && ac.v < 0.3) {
      ac.waitT = (ac.waitT || 0) + dt;
      if (ac.phase === 'taxi_out' || ac.phase === 'taxi_in') this.addDelay(f, cross === 'wait' ? 'runway' : 'taxi', (dt * TIME_SCALE) / 60);
    }
    // yön
    const L = clamp(ac.v * 1.6, 10, 34);
    const la = this.lookahead(ac, L);
    const hT = headingOf(la.x - ac.x, la.z - ac.z);
    const wMax = Math.max(0.26, ac.v / t.rMin);
    if (Math.hypot(la.x - ac.x, la.z - ac.z) > 0.8) ac.h = wrapPi(ac.h + clamp(wrapPi(hT - ac.h), -wMax * dt, wMax * dt));
    const d = dirOf(ac.h);
    ac.x += d.x * ac.v * dt;
    ac.z += d.z * ac.v * dt;
    ac.pitch = 0;
    ac.roll = 0;
    // varış
    if (rem < 1.2 && ac.v < 1) {
      if (ac.goal === 'stand') return this.docked(ac, now);
      if (ac.goal === 'hold') {
        ac.phase = 'holding_short';
        f.status = 'holding_short';
        ac.holdSince = now;
        ac.v = 0;
      } else if (ac.goal === 'lineup') {
        ac.phase = 'takeoff';
        f.status = 'takeoff';
        ac.v = Math.max(ac.v, 2);
        ac.h = ac.end.h;
        ac.lights = true;
      }
    }
    this.place(ac);
  }

  // önümüzdeki yol bir pistten geçiyorsa izin iste
  runwayCrossCheck(ac) {
    const W = this.world;
    const P = ac.path;
    let px = ac.x, pz = ac.z, acc = 0;
    let hit = null;
    for (let i = ac.pi + 1; i < P.length && acc < 70; i++) {
      const seg = Math.hypot(P[i].x - px, P[i].z - pz);
      const n = Math.max(1, Math.ceil(seg / 6));
      for (let k = 1; k <= n; k++) {
        const x = px + ((P[i].x - px) * k) / n, z = pz + ((P[i].z - pz) * k) / n;
        const ci = toCellI(x), cj = toCellJ(z);
        if (W.inside(ci, cj) && W.ground[W.idx(ci, cj)] === G.RUNWAY) {
          hit = { id: W.obj[W.idx(ci, cj)], d: acc + (seg * k) / n };
          break;
        }
      }
      if (hit) break;
      acc += seg;
      px = P[i].x;
      pz = P[i].z;
    }
    // şu an pistte miyiz
    const ci = toCellI(ac.x), cj = toCellJ(ac.z);
    const onId = W.inside(ci, cj) && W.ground[W.idx(ci, cj)] === G.RUNWAY ? W.obj[W.idx(ci, cj)] : -1;
    // geçişi bitirdiysek bırak
    for (const [rid, st] of this.rw) {
      if (st.busy && st.busy.ac === ac && st.busy.kind === 'crossing' && rid !== onId && (!hit || hit.id !== rid)) st.busy = null;
    }
    if (!hit) return 'clear';
    const r = W.objects.get(hit.id);
    if (!r) return 'clear';
    const st = this.runwayState(r);
    if (st.busy && st.busy.ac === ac) return 'clear';
    if (!st.busy && !this.arrivalClose(r, 35)) {
      st.busy = { ac, kind: ac.phase === 'lineup' ? 'takeoff' : 'crossing' };
      return 'clear';
    }
    ac.crossWaitDist = Math.max(0, hit.d - 30);
    if (ac.crossWaitDist < 2) {
      // pist kenarında bekle
      ac.crossWaitDist = 0;
    }
    return 'wait';
  }

  // bu piste yaklaşan uçak eşiğe kaç saniye uzakta
  arrivalClose(r, sec) {
    for (const o of this.ac) {
      if (o.rwy !== r || o.phase !== 'approach') continue;
      const s = this.sAlong(o.end, o.x, o.z);
      if (s > -(sec * o.v)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- park ve yer hizmetleri
  docked(ac, now) {
    const f = ac.flight;
    const sp = this.world.stopPoint(ac.stand, ac.type);
    ac.x = sp.x;
    ac.z = sp.z;
    ac.h = sp.h;
    ac.v = 0;
    ac.phase = 'turnaround';
    f.status = 'turnaround';
    f.dockedAt = now;
    ac.beacon = false;
    ac.turnDone = 0;
    const remote = !ac.stand.jetway;
    ac.turnTotal = ac.t.turnMin + (remote ? 10 : 0);
    ac.jwAnim = 0;
    this.game.econ.onDocked(f, ac.stand);
    this.startServices(ac, remote);
    this.place(ac);
  }

  stepTurnaround(ac, dt, now) {
    const f = ac.flight;
    // köprü
    if (ac.stand.jw) {
      const tgt = ac.turnDone / ac.turnTotal < 0.93 ? 1 : 0;
      ac.jwAnim = clamp(ac.jwAnim + (tgt ? 1 : -1) * dt * 0.25, 0, 1);
      this.world.setJetway(ac.stand, smooth(ac.jwAnim), ac.type);
    }
    // terminal yoğunluğu biniş süresini uzatır
    const cong = this.game.econ.congestion();
    const rate = (dt * TIME_SCALE) / 60 / Math.max(1, cong);
    if (cong > 1) this.addDelay(f, 'terminal', ((dt * TIME_SCALE) / 60) * (1 - 1 / cong));
    ac.turnDone += rate;
    const p = ac.turnDone / ac.turnTotal;
    if (p > 0.5 && f.status === 'turnaround') f.status = 'boarding';
    if (p > 0.72 && !ac.servicesLeaving) this.endServices(ac);
    if (p >= 1 && (!ac.stand.jw || ac.jwAnim <= 0)) {
      ac.phase = 'ready';
      f.status = 'ready';
      ac.readySince = now;
    }
  }

  startServices(ac, remote) {
    const F = this.world.standFrame(ac.stand);
    const sp = this.world.stopPoint(ac.stand, ac.type);
    const t = ac.t;
    const fw = F.f, rt = { x: -F.l.x, z: -F.l.z };
    const at = (fa, ra) => ({ x: sp.x + fw.x * fa + rt.x * ra, z: sp.z + fw.z * fa + rt.z * ra });
    const spawn = { x: F.rear.x + rt.x * (F.S / 2 + 12), z: F.rear.z + rt.z * (F.S / 2 + 12) };
    const corner = at(-t.len / 2 - 8, t.span / 2 + 6);
    const plan = [
      ['fuel', at(-t.len * 0.04, t.span * 0.2), sp.h, 2],
      ['baggage', at(t.len * 0.22, t.dia / 2 + 3.2), sp.h + Math.PI, 6],
    ];
    if (remote) {
      const lcorner = at(-t.len / 2 - 8, -(t.span / 2 + 6));
      // merdiven aracı kapıya yüzü dönük; platform yüksekliği kapı eşiğine göre
      const sc = clamp(((t.sill || 3.3) + 0.15) / 4.2, 0.5, 1.15);
      plan.push(['stairs', at(t.len / 2 - t.doorFromNose, -(t.dia / 2 + 0.25 + 3.3 * sc)), sp.h + Math.PI / 2, 0, lcorner, sc]);
      plan.push(['bus', at(t.len * 0.12, -(t.span / 2 + 2)), sp.h, 10, lcorner]);
    }
    for (const [kind, pos, h, delay, via, sc] of plan) {
      const v = this.addVehicle(kind, spawn, [via || corner, pos], h, delay, sc);
      ac.vehicles.push(v);
    }
    ac.servicesLeaving = false;
  }

  endServices(ac) {
    ac.servicesLeaving = true;
    const F = this.world.standFrame(ac.stand);
    const rt = { x: -F.l.x, z: -F.l.z };
    const spawn = { x: F.rear.x + rt.x * (F.S / 2 + 12), z: F.rear.z + rt.z * (F.S / 2 + 12) };
    for (const v of ac.vehicles) {
      if (v.kind === 'tug') continue;
      v.route = [v.via, spawn];
      v.ri = 0;
      v.leave = true;
      v.delay = Math.random() * 3;
    }
  }

  addVehicle(kind, from, route, finalH, delay = 0, scale = 1) {
    const mesh = makeVehicle(kind, scale);
    this.group.add(mesh);
    const v = { kind, mesh, x: from.x, z: from.z, h: headingOf(route[0].x - from.x, route[0].z - from.z), route, ri: 0, finalH, delay, via: route[0], speed: kind === 'bus' ? 9 : 8, done: false };
    mesh.visible = delay <= 0;
    mesh.position.set(v.x, 0, v.z);
    mesh.rotation.y = -v.h;
    this.vehicles.push(v);
    return v;
  }

  removeVehicle(v) {
    this.group.remove(v.mesh);
    this.vehicles = this.vehicles.filter((x) => x !== v);
  }

  updateVehicles(dt) {
    for (const v of [...this.vehicles]) {
      if (v.attached) continue;
      if (v.delay > 0) {
        v.delay -= dt;
        v.mesh.visible = v.delay <= 0;
        continue;
      }
      if (v.ri >= v.route.length) {
        if (v.leave) {
          this.removeVehicle(v);
          for (const a of this.ac) a.vehicles = a.vehicles.filter((x) => x !== v);
        } else if (v.finalH !== undefined) {
          v.h += clamp(wrapPi(v.finalH - v.h), -1.2 * dt, 1.2 * dt);
          v.mesh.rotation.y = -v.h;
        }
        continue;
      }
      const tg = v.route[v.ri];
      const dx = tg.x - v.x, dz = tg.z - v.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1) {
        v.ri++;
        continue;
      }
      const hT = headingOf(dx, dz);
      v.h = wrapPi(v.h + clamp(wrapPi(hT - v.h), -1.5 * dt, 1.5 * dt));
      const sp = Math.min(v.speed, dist * 0.8 + 1) * (Math.abs(wrapPi(hT - v.h)) > 1 ? 0.4 : 1);
      const d = dirOf(v.h);
      v.x += d.x * sp * dt;
      v.z += d.z * sp * dt;
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = -v.h;
    }
  }

  // ---------------------------------------------------------------- kalkış
  pickHold(ac) {
    // kalkış eşiğine en yakın, park yerinden ulaşılabilen pist kenarı taksi karesi; birden çok pist varsa en boş olanı
    const W = this.world;
    const t = AIRCRAFT[ac.type];
    const comp = this.components();
    const [ei, ej] = W.standFrame(ac.stand).entry;
    const c = comp[ej * MAP_W + ei];
    let best = null;
    for (const rwy of W.list('runway')) {
      if (rwy.len * CELL < t.minRunway) continue;
      const end = this.activeEnd(rwy);
      const ex = W.runwayExits(rwy)
        .map((x) => ({ ...x, s: this.sAlong(end, cellX(x.i), cellZ(x.j)) }))
        .filter((x) => comp[x.j * MAP_W + x.i] === c)
        .sort((a, b) => a.s - b.s)[0];
      if (!ex) continue;
      const score = this.runwayLoad(rwy) * 600 + ex.s;
      if (!best || score < best.score) best = { rwy, end, ex, score };
    }
    if (!best) return null;
    ac.rwy = best.rwy;
    ac.end = best.end;
    return best.ex;
  }

  stepReady(ac, dt, now) {
    const f = ac.flight;
    const W = this.world;
    if (!ac.depPlan || ac.depPlan.v !== W.version) {
      const hold = this.pickHold(ac);
      const entry = W.standFrame(ac.stand).entry;
      const cells = hold && findPath(W, entry, [hold.i, hold.j], { allowStand: new Set() });
      ac.depPlan = { v: W.version, hold, cells };
    }
    const P = ac.depPlan;
    if (!P.cells) {
      if (!ac.noRouteWarned) {
        this.game.econ.notify(`${f.code}: park yeri ${ac.stand.num}'den piste yol yok`, 'warn');
        ac.noRouteWarned = true;
      }
      this.addDelay(f, 'noroute', (dt * TIME_SCALE) / 60);
      return;
    }
    // pushback alanı boş mu
    const F = W.standFrame(ac.stand);
    const ent = { x: cellX(F.entry[0]), z: cellZ(F.entry[1]) };
    const busy = this.ac.some((o) => o !== ac && o.y < 5 && o.phase !== 'turnaround' && o.phase !== 'ready' && Math.hypot(o.x - ent.x, o.z - ent.z) < 90);
    if (busy) this.addDelay(f, 'taxi', (dt * TIME_SCALE) / 60);
    if (busy || this.vehicles.some((v) => ac.vehicles.includes(v) && v.kind !== 'tug')) return;
    // pushback başlat
    ac.hold = P.hold;
    ac.phase = 'pushback';
    f.status = 'pushback';
    ac.beacon = true;
    ac.push = { stage: 'tug', t: 0, from: { x: ac.x, z: ac.z }, to: ent, h0: ac.h };
    const nose = { x: ac.x + dirOf(ac.h).x * (ac.t.len / 2 + 3), z: ac.z + dirOf(ac.h).z * (ac.t.len / 2 + 3) };
    const far = { x: nose.x + dirOf(ac.h).x * 25, z: nose.z + dirOf(ac.h).z * 25 };
    const tug = this.addVehicle('tug', far, [nose], ac.h + Math.PI, 0);
    tug.mesh.visible = true;
    ac.tug = tug;
    ac.vehicles.push(tug);
    this.game.econ.onPushback(f, ac.stand);
    ac.stand.flight = null;
    ac.stand.departing = ac;
  }

  stepPushback(ac, dt, now) {
    const P = ac.push;
    const t = ac.t;
    const tug = ac.tug;
    const first = ac.depPlan.cells.length > 1 ? { x: cellX(ac.depPlan.cells[1][0]), z: cellZ(ac.depPlan.cells[1][1]) } : P.to;
    const hFinal = headingOf(first.x - P.to.x, first.z - P.to.z);
    if (P.stage === 'tug') {
      if (tug.ri >= tug.route.length) {
        P.stage = 'back';
        tug.attached = true;
      }
    } else if (P.stage === 'back') {
      const dx = P.to.x - ac.x, dz = P.to.z - ac.z;
      const dist = Math.hypot(dx, dz);
      ac.v = Math.min(2.2, dist * 0.5 + 0.3);
      const back = dirOf(ac.h + Math.PI);
      ac.x += back.x * ac.v * dt;
      ac.z += back.z * ac.v * dt;
      if (dist < 0.6 || (dx * back.x + dz * back.z) < 0) P.stage = 'turn';
    } else if (P.stage === 'turn') {
      const dh = wrapPi(hFinal - ac.h);
      ac.h = wrapPi(ac.h + clamp(dh, -0.16 * dt, 0.16 * dt));
      if (Math.abs(dh) < 0.01) {
        ac.h = hFinal;
        P.stage = 'release';
        P.t = 0;
        tug.attached = false;
        const away = dirOf(hFinal);
        const side = { x: -away.z, z: away.x };
        const tp = { x: tug.x + side.x * 20, z: tug.z + side.z * 20 };
        tug.route = [tp, { x: tp.x - away.x * 60, z: tp.z - away.z * 60 }];
        tug.ri = 0;
        tug.leave = true;
        if (ac.stand.departing === ac) ac.stand.departing = null;
      }
    } else if (P.stage === 'release') {
      P.t += dt;
      if (P.t > 5) {
        ac.phase = 'taxi_out';
        ac.flight.status = 'taxi_out';
        ac.goal = 'hold';
        ac.path = this.dedupe([{ x: ac.x, z: ac.z }, ...this.cellPts(ac.depPlan.cells.slice(1))]);
        ac.pi = 0;
        ac.dockStart = null;
      }
    }
    if (tug.attached) {
      const d = dirOf(ac.h);
      tug.x = ac.x + d.x * (t.len / 2 + 3.5);
      tug.z = ac.z + d.z * (t.len / 2 + 3.5);
      tug.h = ac.h + Math.PI;
      tug.mesh.position.set(tug.x, 0, tug.z);
      tug.mesh.rotation.y = -tug.h;
    }
    this.place(ac);
  }

  stepHoldShort(ac, dt, now) {
    const f = ac.flight;
    const st = this.runwayState(ac.rwy);
    const free = !st.busy && !this.arrivalClose(ac.rwy, 62);
    if (!free) {
      this.addDelay(f, 'runway', (dt * TIME_SCALE) / 60);
      this.place(ac);
      return;
    }
    st.busy = { ac, kind: 'takeoff' };
    const end = ac.end;
    const info = this.world.runwayInfo(ac.rwy);
    const sH = ac.hold ? this.sAlong(end, cellX(ac.hold.i), cellZ(ac.hold.j)) : 40;
    const path = [{ x: ac.x, z: ac.z }];
    if (sH > 320) {
      // geri taksi ve eşikte U dönüşü
      path.push(this.onCenter(end, sH - 30, 0), this.onCenter(end, 90, 0), this.onCenter(end, 45, -16), this.onCenter(end, 18, 0), this.onCenter(end, 45, 16), this.onCenter(end, 80, 2), this.onCenter(end, 110, 0));
    } else path.push(this.onCenter(end, sH + 25, 0), this.onCenter(end, sH + 70, 0));
    void info;
    ac.path = this.dedupe(path);
    ac.pi = 0;
    ac.goal = 'lineup';
    ac.phase = 'lineup';
    f.status = 'lineup';
  }

  stepTakeoff(ac, dt, now) {
    const t = ac.t;
    const end = ac.end;
    ac.h += clamp(wrapPi(end.h - ac.h), -0.3 * dt, 0.3 * dt);
    const air = ac.y > 0.2 || ac.v >= t.vRot;
    ac.v += (air ? 1.2 : t.accel) * dt;
    const d = dirOf(ac.h);
    ac.x += d.x * ac.v * dt;
    ac.z += d.z * ac.v * dt;
    if (ac.v >= t.vRot) {
      ac.pitch = Math.min(0.16, ac.pitch + 0.08 * dt);
      ac.y += ac.v * Math.sin(ac.pitch * 0.85) * dt;
    }
    if (ac.y > 8 || this.sAlong(end, ac.x, ac.z) > this.world.runwayInfo(ac.rwy).len + 200) {
      const st = this.runwayState(ac.rwy);
      if (st.busy && st.busy.ac === ac) st.busy = null;
    }
    if (ac.y > 30 && ac.phase === 'takeoff') {
      ac.phase = 'departed';
      ac.flight.status = 'departed';
      ac.flight.depAt = now;
      this.game.econ.onDeparted(ac.flight);
    }
    this.place(ac);
  }

  stepDeparted(ac, dt, now) {
    const st = this.runwayState(ac.rwy);
    if (st.busy && st.busy.ac === ac && ac.y > 40) st.busy = null;
    this.stepTakeoffAir(ac, dt);
    if (ac.y > 900 || Math.hypot(ac.x, ac.z) > 12000) this.removeAc(ac);
  }

  stepTakeoffAir(ac, dt) {
    ac.v = Math.min(110, ac.v + 1.5 * dt);
    if (ac.y > 150) ac.lights = false;
    const d = dirOf(ac.h);
    ac.x += d.x * ac.v * dt;
    ac.z += d.z * ac.v * dt;
    ac.y += ac.v * Math.sin(ac.pitch * 0.85) * dt;
    if (ac.y > 120 && ac.turnTo === undefined) ac.turnTo = ac.h + (ac.id % 2 ? 0.6 : -0.6);
    if (ac.turnTo !== undefined) {
      const w = clamp(wrapPi(ac.turnTo - ac.h), -0.05 * dt, 0.05 * dt);
      ac.h += w;
      ac.roll = clamp((w / dt) * 6, -0.35, 0.35);
    }
    this.place(ac);
  }

  // ---------------------------------------------------------------- sorgular
  aircraftByMesh(obj) {
    while (obj && obj.userData.acId === undefined) obj = obj.parent;
    if (!obj) return null;
    return this.ac.find((a) => a.id === obj.userData.acId) || null;
  }

  activeOnRunway(r) {
    return this.ac.some((a) => a.rwy === r && a.phase !== 'departed' && a.phase !== 'turnaround' && a.phase !== 'ready');
  }

  clear() {
    for (const ac of [...this.ac]) this.removeAc(ac);
    for (const v of [...this.vehicles]) this.removeVehicle(v);
    this.rw.clear();
    for (const s of this.world.list('stand')) {
      s.flight = null;
      s.departing = null;
      if (s.jw) this.world.setJetway(s, 0);
    }
  }
}
