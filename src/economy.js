// Para, havayolu anlaşmaları, uçuş tarifeleri, memnuniyet ve puan
import { START_MONEY, AIRLINES, AIRCRAFT, FEES, CITIES, DAILY, G, BUILDINGS } from './config.js';
import { rng, clamp, money, wrapPi } from './util.js';

const blankDay = () => ({ income: { landing: 0, pax: 0, retail: 0, jetway: 0, hangar: 0 }, expense: { build: 0, upkeep: 0 }, flights: 0, pax: 0, diverted: 0 });

export const INCOME_NAMES = { landing: 'İniş ücretleri', pax: 'Yolcu hizmet ücretleri', retail: 'Terminal satışları', jetway: 'Köprü kullanımı', hangar: 'Hangar bakımı' };
export const EXPENSE_NAMES = { build: 'İnşaat', upkeep: 'Bakım ve personel' };

export class Economy {
  constructor(game, seed = Date.now() % 1e9) {
    this.game = game;
    this.seed = seed;
    this.rand = rng(seed);
    this.money = START_MONEY;
    this.contracts = [];
    this.offers = [];
    this.today = blankDay();
    this.history = [];
    this.log = [];
    this.seq = 1;
    this.wind = { from: 270, kt: 8 };
    this.totals = { pax: 0, flights: 0 };
    this.lastDay = 1;
  }

  airline(id) {
    return AIRLINES.find((a) => a.id === id);
  }

  notify(msg, kind = 'info') {
    this.log.unshift({ t: this.game.time, msg, kind });
    if (this.log.length > 60) this.log.pop();
    this.game.ui && this.game.ui.toast(msg, kind);
  }

  // ---------------------------------------------------------------- para
  spend(amount, cat = 'build') {
    if (amount > this.money) {
      this.notify(`Yeterli para yok: ${money(amount)} gerekiyor`, 'bad');
      return false;
    }
    this.money -= amount;
    this.today.expense[cat] = (this.today.expense[cat] || 0) + amount;
    return true;
  }
  earn(amount, cat) {
    this.money += amount;
    this.today.income[cat] = (this.today.income[cat] || 0) + amount;
  }
  refund(amount) {
    this.money += amount;
    this.today.expense.build -= amount;
  }

  upkeep() {
    const W = this.game.world;
    let sum = 0;
    for (const o of W.objects.values()) sum += W.dailyCost(o);
    let taxi = 0, apron = 0;
    for (let k = 0; k < W.ground.length; k++) {
      if (W.ground[k] === G.TAXI) taxi++;
      else if (W.ground[k] === G.APRON && W.obj[k] < 0) apron++;
    }
    return sum + taxi * DAILY.taxi + apron * DAILY.apron + this.contracts.length * 15_000;
  }

  // ---------------------------------------------------------------- puan
  rating() {
    const W = this.game.world;
    let r = 1;
    if (this.contracts.length) {
      const avg = this.contracts.reduce((s, c) => s + c.sat, 0) / this.contracts.length;
      r = 0.5 + (2.5 * avg) / 100;
    }
    r += Math.min(1, this.totals.flights / 80);       // deneyim
    if (W.list('hangar').length) r += 0.25;
    if (W.list('stand').some((s) => s.jetway)) r += 0.25;
    if (W.list('terminal').length >= 2 || this.contracts.reduce((s, c) => s + c.perDay, 0) >= 20) r += 0.5;
    if (!W.list('terminal').length) r -= 0.5;
    return clamp(Math.round(r * 2) / 2, 0.5, 5);
  }

  // ---------------------------------------------------------------- teklifler
  requirements(a) {
    const W = this.game.world;
    const t = AIRCRAFT[a.type];
    const req = [];
    req.push({ ok: W.list('tower').length > 0, text: 'Kontrol kulesi' });
    req.push({ ok: W.list('terminal').length > 0, text: 'Terminal' });
    req.push({ ok: W.list('runway').some((r) => r.len * 16 >= t.minRunway), text: `En az ${t.minRunway.toLocaleString('tr-TR')} m pist` });
    req.push({ ok: W.list('stand').some((s) => (a.type === 'wide' ? s.size === 'L' : true)), text: a.type === 'wide' ? 'Geniş gövde park yeri' : 'Park yeri' });
    if (a.needsHangar) req.push({ ok: W.list('hangar').length > 0, text: 'Bakım hangarı' });
    if (a.minStars > 0) req.push({ ok: this.rating() >= a.minStars, text: `Havalimanı puanı ${a.minStars.toString().replace('.', ',')}★` });
    return req;
  }

  estimate(a, perDay) {
    const t = AIRCRAFT[a.type];
    const pax = t.seats * a.load;
    const per = t.landingFee + pax * (FEES.paxArr + FEES.paxDep + FEES.retail);
    return Math.round(per * perDay);
  }

  genOffers() {
    const taken = new Set(this.contracts.map((c) => c.airline));
    const pool = AIRLINES.filter((a) => !taken.has(a.id));
    // açık olanlar önce, sonra bir sonraki kilidi gösteren
    pool.sort((a, b) => a.minStars - b.minStars || this.rand() - 0.5);
    this.offers = pool.slice(0, 4).map((a) => {
      const perDay = a.perDay[0] + Math.floor(this.rand() * (a.perDay[1] - a.perDay[0] + 1));
      return { id: this.seq++, airline: a.id, perDay, type: a.type };
    });
  }

  accept(offerId) {
    const o = this.offers.find((x) => x.id === offerId);
    if (!o) return;
    const a = this.airline(o.airline);
    const miss = this.requirements(a).filter((r) => !r.ok);
    if (miss.length) {
      this.notify(`${a.name} için eksik: ${miss.map((m) => m.text).join(', ')}`, 'bad');
      return;
    }
    // günlük saatler: 06:00 - 22:30 arası yayılmış
    const times = [];
    const span = 16.5 * 60;
    for (let k = 0; k < o.perDay; k++) times.push(Math.round(360 + ((k + 0.25 + this.rand() * 0.5) * span) / o.perDay));
    const c = { id: this.seq++, airline: a.id, type: o.type, perDay: o.perDay, times, sat: 65, since: this.game.day(), done: 0, warned: false, base: 100 + Math.floor(this.rand() * 80) * 10, cities: [] };
    for (let k = 0; k < o.perDay; k++) c.cities.push(CITIES[Math.floor(this.rand() * CITIES.length)]);
    this.contracts.push(c);
    this.offers = this.offers.filter((x) => x !== o);
    const now = this.game.time;
    const day = this.game.day();
    this.schedule(c, day, (now % 1440) + 50);
    this.schedule(c, day + 1, 0);
    this.notify(`${a.name} ile anlaşma imzalandı: günde ${o.perDay} sefer`, 'good');
  }

  cancel(contractId, why) {
    const c = this.contracts.find((x) => x.id === contractId);
    if (!c) return;
    this.contracts = this.contracts.filter((x) => x !== c);
    for (const f of this.game.sim.flights) if (f.contract === c.id && f.status === 'planned') f.status = 'cancelled';
    const a = this.airline(c.airline);
    this.notify(why ? `${a.name} anlaşmayı bitirdi: ${why}` : `${a.name} ile anlaşma sonlandırıldı`, why ? 'bad' : 'info');
  }

  schedule(c, day, fromMin) {
    const a = this.airline(c.airline);
    c.times.forEach((tm, k) => {
      if (tm < fromMin) return;
      const num = c.base + k * 2;
      const t = AIRCRAFT[c.type];
      const arr = (day - 1) * 1440 + tm;
      this.game.sim.flights.push({
        id: this.seq++, contract: c.id, airline: a.id, code: `${a.code} ${num}`, codeDep: `${a.code} ${num + 1}`, type: c.type,
        from: c.cities[k], to: c.cities[k], arr, dep: arr + t.turnMin + 45, status: 'planned', delay: 0, stand: null,
      });
    });
    this.game.sim.flights.sort((x, y) => x.arr - y.arr);
  }

  // ---------------------------------------------------------------- gün dönümü
  newDay(day) {
    const cost = this.upkeep();
    this.money -= cost;
    this.today.expense.upkeep += cost;
    const inc = Object.values(this.today.income).reduce((s, v) => s + v, 0);
    const exp = Object.values(this.today.expense).reduce((s, v) => s + v, 0);
    this.history.push({ day: day - 1, ...this.today, net: inc - exp });
    if (this.history.length > 30) this.history.shift();
    this.notify(`${day - 1}. gün bitti: gelir ${money(inc)}, gider ${money(exp)}`, inc - exp >= 0 ? 'good' : 'warn');
    this.today = blankDay();
    for (const c of this.contracts) this.schedule(c, day + 1, 0);
    const sim = this.game.sim;
    const keepFrom = (day - 2) * 1440;
    sim.flights = sim.flights.filter((f) => f.arr >= keepFrom || !['departed', 'diverted', 'cancelled'].includes(f.status));
    this.genOffers();
    this.newWind();
  }

  newWind() {
    this.wind = { from: Math.round(this.rand() * 36) * 10 || 360, kt: 3 + Math.round(this.rand() * 18) };
    for (const r of this.game.world.list('runway')) this.setActive(r);
  }

  setActive(r) {
    const info = this.game.world.runwayInfo(r);
    const wf = (this.wind.from * Math.PI) / 180;
    const d0 = Math.abs(wrapPi(info.ends[0].h - wf)), d1 = Math.abs(wrapPi(info.ends[1].h - wf));
    r.active = d0 <= d1 ? 0 : 1;
  }

  // ---------------------------------------------------------------- uçuş olayları
  contractOf(f) {
    return this.contracts.find((c) => c.id === f.contract);
  }

  pax(f) {
    const a = this.airline(f.airline);
    const t = AIRCRAFT[f.type];
    return Math.round(t.seats * a.load * (0.88 + this.rand() * 0.16));
  }

  onLanded(f) {
    const t = AIRCRAFT[f.type];
    this.earn(t.landingFee, 'landing');
    const h = Math.min(2, this.game.world.list('hangar').length);
    if (h) this.earn(FEES.hangarPerFlight * h * (f.type === 'wide' ? 2 : 1), 'hangar');
  }

  onDocked(f, stand) {
    f.paxArr = this.pax(f);
    this.earn(f.paxArr * FEES.paxArr, 'pax');
    this.earn((f.paxArr * FEES.retail) / 2, 'retail');
    if (stand.jetway) this.earn(FEES.jetway, 'jetway');
    this.today.pax += f.paxArr;
    this.totals.pax += f.paxArr;
  }

  onPushback(f, stand) {
    f.paxDep = this.pax(f);
    this.earn(f.paxDep * FEES.paxDep, 'pax');
    this.earn(f.paxDep * FEES.retail, 'retail');
    this.today.pax += f.paxDep;
    this.totals.pax += f.paxDep;
    f.jetway = !!stand.jetway;
  }

  onDeparted(f) {
    this.today.flights++;
    this.totals.flights++;
    const c = this.contractOf(f);
    if (!c) return;
    c.done++;
    // gecikme: 15 dk'ya kadar sorun yok, 45 dk'dan sonra ciddi
    let d = f.delay < 15 ? 3 : f.delay < 45 ? 1 - ((f.delay - 15) / 30) * 3 : -Math.min(10, 2 + (f.delay - 45) / 12);
    d += f.jetway ? 1 : -0.5;
    d -= (f.goArounds || 0) * 2;
    this.changeSat(c, d);
  }

  onDiverted(f, why) {
    this.today.diverted++;
    const a = this.airline(f.airline);
    this.notify(`${f.code} (${a.name}) başka havalimanına yönlendirildi: ${why}`, 'bad');
    const c = this.contractOf(f);
    if (c) this.changeSat(c, -15);
  }

  changeSat(c, d) {
    c.sat = clamp(c.sat + d, 0, 100);
    const a = this.airline(c.airline);
    if (c.sat < 15) this.cancel(c.id, 'memnuniyet çok düştü');
    else if (c.sat < 30 && !c.warned) {
      c.warned = true;
      this.notify(`${a.name} memnun değil (%${Math.round(c.sat)}). Gecikmeleri azaltın.`, 'warn');
    } else if (c.sat > 45) c.warned = false;
  }

  // terminal yoğunluğu: >1 ise kapasite aşılmış
  congestion() {
    const W = this.game.world;
    const cap = W.list('terminal').length * BUILDINGS.terminal.capacity;
    if (!cap) return 3;
    let load = 0;
    for (const ac of this.game.sim.ac) {
      if (ac.phase !== 'turnaround') continue;
      load += (AIRCRAFT[ac.type].seats * 1.7) / (ac.turnTotal / 60);
    }
    return load / cap;
  }

  // ---------------------------------------------------------------- kayıt
  toJSON() {
    return { seed: this.seed, money: this.money, contracts: this.contracts, offers: this.offers, today: this.today, history: this.history, seq: this.seq, wind: this.wind, totals: this.totals };
  }
  fromJSON(o) {
    Object.assign(this, { money: o.money, contracts: o.contracts, offers: o.offers, today: o.today, history: o.history, seq: o.seq, wind: o.wind, totals: o.totals || { pax: 0, flights: 0 } });
    this.seed = o.seed;
    this.rand = rng(o.seed + o.seq);
  }
}
