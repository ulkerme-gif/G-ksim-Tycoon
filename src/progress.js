// Uzun vadeli hedefler: seviyeler, günlük görevler, başarımlar, rakip sıralaması,
// yükseltmeler, hava olayları ve özel teklifler (charter, genişleme talepleri)
import { AIRLINES, CHARTERS, AIRCRAFT, CITIES, STANDS } from './config.js';
import { clamp, money, moneyShort, num, hhmm } from './util.js';
import { PROJECTS, EVENTS, projectById, perfection } from './projects.js';

// ---------------------------------------------------------------- seviyeler (toplam yolcuya göre)
const LEVELS = [
  { pax: 0, name: 'Yerel Havaalanı', reward: 0 },
  { pax: 2_000, name: 'Bölge Havalimanı', reward: 1_000_000 },
  { pax: 10_000, name: 'Şehir Havalimanı', reward: 2_000_000 },
  { pax: 30_000, name: 'Ulusal Havalimanı', reward: 3_000_000 },
  { pax: 75_000, name: 'Turizm Merkezi', reward: 5_000_000 },
  { pax: 160_000, name: 'Uluslararası Havalimanı', reward: 8_000_000 },
  { pax: 320_000, name: 'Aktarma Merkezi', reward: 12_000_000 },
  { pax: 600_000, name: 'Kıtalararası Kapı', reward: 16_000_000 },
  { pax: 1_000_000, name: 'Küresel Merkez', reward: 22_000_000 },
  { pax: 1_600_000, name: 'Dünya Yıldızı', reward: 30_000_000 },
];
const STORM_LEVEL = 3;
const CHARTER_LEVEL = 5;
const LEGEND_BONUS = 0.02;

const roman = (n) => {
  const R = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, c] of R) while (n >= v) {
    s += c;
    n -= v;
  }
  return s;
};

export function levelInfo(L) {
  if (L <= LEVELS.length) return LEVELS[L - 1];
  const k = L - LEVELS.length;
  return { pax: LEVELS[LEVELS.length - 1].pax + k * 1_000_000, name: `Efsane ${roman(k)}`, reward: 10_000_000 + 2_000_000 * k, legend: true };
}
export function levelFor(pax) {
  let L = 1;
  while (levelInfo(L + 1).pax <= pax) L++;
  return L;
}

// ---------------------------------------------------------------- yükseltmeler
export const UPGRADES = [
  { id: 'pilot', name: 'Uçuş kulübü', desc: 'GökSim uçuş motoruyla kendi pistinizden kalkıp inersiniz. Uçakları kulübün hangarından alırsınız (F-16\'dan A380 ve SR-71\'e). Sağ alttaki "Uç" düğmesiyle başlar.',
    levels: [{ cost: 3_000_000, lvl: 2 }], eff: (n) => ['Kilitli', 'Açık: hangardan uçak alıp uçabilirsiniz'][n] },
  { id: 'ground', name: 'Yer hizmetleri filosu', desc: 'Daha çok yakıt, bagaj ve ikram aracı. Uçaklar kapıda daha kısa kalır, park yerleri çabuk boşalır.',
    levels: [{ cost: 3_000_000, lvl: 2 }, { cost: 8_000_000, lvl: 4 }, { cost: 18_000_000, lvl: 6 }], eff: (n) => `Kapıda kalma süresi %${[100, 88, 78, 68][n]}` },
  { id: 'retail', name: 'Çarşı ve duty free', desc: 'Terminalde mağazalar, restoranlar ve duty free.',
    levels: [{ cost: 2_500_000, lvl: 2 }, { cost: 7_000_000, lvl: 5 }, { cost: 16_000_000, lvl: 7 }], eff: (n) => `Terminal satışları ×${[1, 1.3, 1.6, 2][n].toString().replace('.', ',')}` },
  { id: 'marketing', name: 'Pazarlama ofisi', desc: 'Havayollarına tanıtım yapar. Daha çok teklif gelir, uçaklar daha dolu uçar.',
    levels: [{ cost: 2_000_000, lvl: 2 }, { cost: 6_000_000, lvl: 4 }, { cost: 14_000_000, lvl: 7 }], eff: (n) => `${4 + n} teklif, doluluk +%${n * 3}` },
  { id: 'parking', name: 'Otopark ve raylı bağlantı', desc: 'Katlı otopark ve şehre tren hattı. Giden her yolcudan gelir.',
    levels: [{ cost: 3_000_000, lvl: 3 }, { cost: 9_000_000, lvl: 6 }, { cost: 20_000_000, lvl: 8 }], eff: (n) => (n ? `Giden yolcu başına ${money([0, 40, 80, 130][n])}` : 'Gelir yok') },
  { id: 'fuel', name: 'Yakıt çiftliği', desc: 'Havalimanının kendi yakıt tankları. Her kalkışta yakıt satış geliri.',
    levels: [{ cost: 4_000_000, lvl: 3 }, { cost: 10_000_000, lvl: 5 }, { cost: 22_000_000, lvl: 8 }], eff: (n) => (n ? `Kalkış başına ${moneyShort([0, 15_000, 30_000, 50_000][n])} (geniş gövde ×2,5)` : 'Gelir yok') },
  { id: 'lounge', name: 'CIP salonları', desc: 'Havayollarının yolcuları için salonlar. Havayolları daha memnun olur.',
    levels: [{ cost: 3_000_000, lvl: 3 }, { cost: 8_000_000, lvl: 6 }], eff: (n) => (n ? `Her kalkışta memnuniyet +${[0, 0.6, 1.2][n].toString().replace('.', ',')}` : 'Etki yok') },
  { id: 'atc', name: 'Radar ve yaklaşma kontrolü', desc: 'Modern radar ile uçaklar birbirine daha yakın sıralanır. Pist kapasitesi artar; pistten hızlı çıkış için çıkış yolları önemli.',
    levels: [{ cost: 5_000_000, lvl: 4 }, { cost: 12_000_000, lvl: 6 }, { cost: 25_000_000, lvl: 9 }], eff: (n) => `İniş aralığı ${[55, 49, 44, 40][n]} sn` },
  { id: 'ils', name: 'ILS aletli iniş sistemi', desc: 'Sisli havada uçaklar aletlerle iner.',
    levels: [{ cost: 4_000_000, lvl: 5 }, { cost: 10_000_000, lvl: 7 }], eff: (n) => ['Siste iniş aralığı 2 katına çıkar', 'CAT II: siste aralık ×1,4', 'CAT III: sis inişleri etkilemez'][n] },
];
const ATC_SEP = [55, 49, 44, 40];
const ATC_DEP = [62, 56, 51, 47];
const FOG_MUL = [2, 1.4, 1];

// ---------------------------------------------------------------- rakip havalimanları (kurgusal), haftalık yolcu
const RIVALS = [
  ['Yeşilvadi Bölge', 2_500, 0.004], ['Mavikıyı', 7_000, 0.0038], ['Bozkır', 14_000, 0.0035], ['Kartalkaya', 26_000, 0.0032],
  ['Altınkum Turizm', 45_000, 0.003], ['Demirtepe', 70_000, 0.0028], ['Poyraz Uluslararası', 100_000, 0.0026], ['Lodos', 135_000, 0.0024],
  ['Karayel Hub', 170_000, 0.0022], ['Meltem Uluslararası', 210_000, 0.002], ['Ayyıldız Uluslararası', 255_000, 0.0018], ['Anadolu Kapısı', 300_000, 0.0016],
];

// ---------------------------------------------------------------- günlük görevler
const CH = {
  flights: { w: 1, mul: 1, key: 'flights', text: (n) => `${n} kalkış yapın` },
  pax: { w: 1, mul: 1, key: 'pax', text: (n) => `${num(n)} yolcu ağırlayın` },
  ontime: { w: 1.2, mul: 1.3, key: 'ontime', text: (n) => `${n} uçuşu 15 dakikadan az gecikmeyle kaldırın` },
  jetway: { w: 0.8, mul: 1, key: 'jw', text: (n) => `${n} uçuşu köprülü park yerinden kaldırın` },
  wide: { w: 0.8, mul: 1.2, key: 'wide', text: (n) => `${n} geniş gövde kalkışı yapın` },
  nodivert: { w: 0.7, mul: 1.3, key: 'diverted', end: true, text: () => 'Gün boyu hiçbir uçuş yönlendirilmesin' },
  nogo: { w: 0.7, mul: 1.2, key: 'goarounds', end: true, text: () => 'Gün boyu hiç pas geçme olmasın' },
  profit: { w: 0.9, mul: 1.2, end: true, text: (n) => `Günü en az ${moneyShort(n)} net kârla kapatın` },
};

// ---------------------------------------------------------------- başarımlar
const ACH = [
  { id: 'f1', name: 'İlk kalkış', desc: 'İlk uçağı gönderin', reward: 100_000, prog: (c) => [c.E.totals.flights, 1] },
  { id: 'f100', name: 'Yüz kalkış', desc: 'Toplam 100 kalkış', reward: 1_000_000, prog: (c) => [c.E.totals.flights, 100] },
  { id: 'f1k', name: 'Bin kalkış', desc: 'Toplam 1.000 kalkış', reward: 5_000_000, prog: (c) => [c.E.totals.flights, 1000] },
  { id: 'f5k', name: 'Gökyüzünün efendisi', desc: 'Toplam 5.000 kalkış', reward: 20_000_000, prog: (c) => [c.E.totals.flights, 5000] },
  { id: 'p10k', name: 'On bin yolcu', desc: 'Toplam 10.000 yolcu', reward: 500_000, prog: (c) => [c.E.totals.pax, 10_000] },
  { id: 'p100k', name: 'Yüz bin yolcu', desc: 'Toplam 100.000 yolcu', reward: 3_000_000, prog: (c) => [c.E.totals.pax, 100_000] },
  { id: 'p1m', name: 'Milyoncu', desc: 'Toplam 1 milyon yolcu', reward: 15_000_000, prog: (c) => [c.E.totals.pax, 1_000_000] },
  { id: 'p10m', name: 'Dünyanın kapısı', desc: 'Toplam 10 milyon yolcu', reward: 60_000_000, prog: (c) => [c.E.totals.pax, 10_000_000] },
  { id: 'star5', name: 'Beş yıldız', desc: 'Havalimanı puanı 5★', reward: 5_000_000, prog: (c) => [c.E.rating(), 5] },
  { id: 'jw10', name: 'Köprü ustası', desc: '10 köprülü park yeri', reward: 1_500_000, prog: (c) => [c.W.list('stand').filter((s) => s.jetway).length, 10] },
  { id: 'rw2', name: 'İkinci pist', desc: 'İki pist kurun', reward: 1_000_000, prog: (c) => [c.W.list('runway').length, 2] },
  { id: 'rw3', name: 'Üç pistli dev', desc: 'Üç pist kurun', reward: 4_000_000, prog: (c) => [c.W.list('runway').length, 3] },
  { id: 'term4', name: 'Terminal şehri', desc: 'Dört terminal kurun', reward: 4_000_000, prog: (c) => [c.W.list('terminal').length, 4] },
  { id: 'wide3', name: 'Dev filo', desc: 'Üç geniş gövde havayoluyla anlaşın', reward: 4_000_000, prog: (c) => [c.E.contracts.filter((x) => x.type === 'wide').length, 3] },
  { id: 'con8', name: 'Havayolu koleksiyoncusu', desc: 'Aynı anda 8 havayolu anlaşması', reward: 3_000_000, prog: (c) => [c.E.contracts.length, 8] },
  { id: 'busy15', name: 'Kalabalık gökyüzü', desc: 'Aynı anda 15 uçak', reward: 2_000_000, prog: (c) => [c.P.maxAc, 15] },
  { id: 'sat95', name: 'Sadık ortak', desc: 'Bir havayolunda %95 memnuniyet', reward: 1_000_000, prog: (c) => [Math.max(0, ...c.E.contracts.map((x) => x.sat)), 95] },
  { id: 'punct', name: 'İsviçre saati', desc: 'Bir günde 20+ kalkış, hepsi 15 dakikadan az gecikmeli', reward: 2_000_000, flag: true },
  { id: 'perfect', name: 'Kusursuz gün', desc: 'Bir günde 15+ kalkış, hiç yönlendirme ve pas geçme yok', reward: 2_000_000, flag: true },
  { id: 'bigday', name: 'Bayram gibi', desc: 'Bir günde 40.000 yolcu', reward: 5_000_000, prog: (c) => [c.P.bestDayPax, 40_000] },
  { id: 'streak7', name: 'Disiplin', desc: '7 gün üst üste tüm günlük görevler', reward: 5_000_000, prog: (c) => [c.P.bestStreak, 7] },
  { id: 'charter5', name: 'Tur sezonu', desc: '5 charter uçuşu tamamlayın', reward: 2_000_000, prog: (c) => [c.P.count.charters, 5] },
  { id: 'expand5', name: 'Büyüme ortağı', desc: '5 genişleme talebini kabul edin', reward: 3_000_000, prog: (c) => [c.P.count.expansions, 5] },
  { id: 'storm', name: 'Fırtına avcısı', desc: 'Fırtınalı bir günü 8+ kalkış ve hiç yönlendirme olmadan bitirin', reward: 3_000_000, flag: true },
  { id: 'top10', name: 'İlk on', desc: 'Sıralamada ilk 10', reward: 3_000_000, prog: (c) => [RIVALS.length + 1 - c.P.bestRank, RIVALS.length - 9] },
  { id: 'top1', name: 'Bir numara', desc: 'Haftalık yolcuda 1. sıra', reward: 25_000_000, prog: (c) => [RIVALS.length + 1 - c.P.bestRank, RIVALS.length] },
  { id: 'upall', name: 'Tam donanım', desc: 'Tüm yükseltmeler son kademede', reward: 10_000_000, prog: (c) => [UPGRADES.reduce((s, u) => s + c.P.up(u.id), 0), UPGRADES.reduce((s, u) => s + u.levels.length, 0)] },
  { id: 'lv10', name: 'Dünya Yıldızı', desc: '10. seviyeye ulaşın', reward: 0, prog: (c) => [c.P.level, 10] },
  { id: 'pilot1', name: 'Kaptan pilot', desc: 'Kendi uçağınızla kalkıp piste inin', reward: 500_000, flag: true },
  { id: 'butter', name: 'Tereyağı gibi', desc: 'Dakikada 60 fitten yumuşak iniş', reward: 1_000_000, flag: true },
  { id: 'nightland', name: 'Gece pilotu', desc: 'Gece piste inin', reward: 1_000_000, flag: true },
  { id: 'widepilot', name: 'Dev kuş', desc: 'Boeing 777 ya da A380 ile piste inin', reward: 2_000_000, flag: true },
  { id: 'proj1', name: 'İlk anıt', desc: 'Bir anıt projeyi tamamlayın', reward: 20_000_000, flag: true },
  { id: 'goldtower', name: 'Zirvenin simgesi', desc: 'Altın kuleyi dikin', reward: 0, flag: true },
  { id: 'perfection', name: 'Kusursuz havalimanı', desc: 'Mükemmellik %100', reward: 100_000_000, flag: true },
  { id: 'hangar5', name: 'Filo sahibi', desc: 'Hangarda 5 uçak', reward: 5_000_000, prog: (c) => [(c.P.hangar || []).length, 5] },
  { id: 'hangar10', name: 'Hava kuvvetleri', desc: 'Hangardaki 10 uçağın hepsi', reward: 50_000_000, prog: (c) => [(c.P.hangar || []).length, 10] },
];

const effDelay = (f) => Math.max(0, (f.delay || 0) - ((f.why && f.why.weather) || 0));
const r10k = (v) => Math.round(v / 10_000) * 10_000;
const r50k = (v) => Math.round(v / 50_000) * 50_000;

export class Progress {
  constructor(game) {
    this.game = game;
    this.level = 1;
    this.ach = {};             // id -> gün
    this.ch = null;            // { day, list, waiting, allPaid }
    this.streak = 0;
    this.bestStreak = 0;
    this.bestRank = RIVALS.length + 1;
    this.bestDayPax = 0;
    this.maxAc = 0;
    this.ups = {};
    this.wx = { day: 0, kind: 'clear' };
    this.special = [];
    this.count = { charters: 0, expansions: 0 };
    this.queue = [];           // gösterilecek pencereler
    this.hangar = [];          // uçuş kulübünde sahip olunan GökSim uçakları
    this.newGoals = false;     // sekme üzerindeki nokta
    this.tAch = 0;
    this.charterSlot = 0;
    this.proj = {};            // anıt projeler: id -> { start, end, done }
    this.mods = [];            // geçici etkiler: { k, mul, until }
    this.flags = {};
    this.everAir = [];         // anlaşma yapılmış havayolları (mükemmellik için)
    this.forceRush = 0;
    this.ev = null;            // bugünün olay kartı: { day, at, fired }
  }

  // ---------------------------------------------------------------- anıt projeler
  has(id) {
    const p = this.proj[id];
    return !!(p && p.done);
  }
  mod(k) {
    const t = this.game.time;
    let m = 1;
    for (const x of this.mods) if (x.k === k && x.until > t) m *= x.mul;
    return m;
  }
  addMod(k, mul, minutes) {
    this.mods = this.mods.filter((x) => x.until > this.game.time);
    this.mods.push({ k, mul, until: this.game.time + minutes });
  }
  toMidnight() {
    return 1440 - (this.game.time % 1440);
  }
  canBuild(id) {
    const pr = projectById(id);
    if (this.proj[id]) return { ok: false, why: this.proj[id].done ? 'Tamamlandı' : 'İnşaatta' };
    if (this.level < pr.lvl) return { ok: false, why: `Seviye ${pr.lvl} gerekli` };
    if (pr.needHangar && this.hangar.length < pr.needHangar) return { ok: false, why: `Hangarda en az ${pr.needHangar} uçak gerekli` };
    if (pr.needAll && PROJECTS.some((p) => p.id !== id && !this.has(p.id))) return { ok: false, why: 'Önce öteki tüm anıt projeler' };
    if (Object.values(this.proj).some((p) => !p.done)) return { ok: false, why: 'Aynı anda tek inşaat' };
    if (this.E.money < pr.cost) return { ok: false, why: 'Para yetmiyor' };
    return { ok: true };
  }
  startProject(id) {
    const pr = projectById(id);
    const c = this.canBuild(id);
    if (!c.ok) return this.E.notify(`${pr.name}: ${c.why}`, 'bad');
    if (!this.E.spend(pr.cost, 'project')) return;
    const t = this.game.time;
    this.proj[id] = { start: t, end: t + pr.days * 1440, done: false };
    this.E.notify(`${pr.name} inşaatı başladı: ${pr.days} gün sürecek (çitin güney dışında)`, 'good');
  }
  projectUpkeep() {
    return PROJECTS.reduce((s, p) => s + (this.has(p.id) ? p.cost * 0.001 : 0), 0);
  }
  tickProjects() {
    for (const pr of PROJECTS) {
      const st = this.proj[pr.id];
      if (!st || st.done || this.game.time < st.end) continue;
      st.done = true;
      this.E.notify(`${pr.name} açıldı! ${pr.eff}`, 'good');
      this.queue.push({ kind: 'project', id: pr.id });
      this.grant('proj1');
      if (pr.id === 'gold') this.grant('goldtower');
    }
  }

  // ---------------------------------------------------------------- olay kartları
  avgIncome() {
    const H = this.E.history.slice(-3);
    if (!H.length) return 2_000_000;
    return H.reduce((s, d) => s + Object.entries(d.income).reduce((a, [k, v]) => a + (k === 'bonus' ? 0 : v), 0), 0) / H.length;
  }
  eventCost(frac) {
    return Math.max(200_000, Math.round((this.avgIncome() * frac) / 10_000) * 10_000);
  }
  toast(text, kind = 'good') {
    this.E.notify(text, kind);
  }
  satAll(d) {
    for (const c of this.E.contracts) this.E.changeSat(c, d);
  }
  satOne(cid, d) {
    const c = this.E.contracts.find((x) => x.id === cid);
    if (c) this.E.changeSat(c, d);
  }
  offerExpand(cid) {
    const E = this.E;
    const c = E.contracts.find((x) => x.id === cid);
    if (!c || this.special.some((s) => s.kind === 'expand')) return;
    const add = 1;
    this.special.push({ id: E.seq++, kind: 'expand', contract: c.id, airline: c.airline, add, bonus: { regional: 300_000, narrow: 500_000, wide: 1_000_000 }[c.type], day: this.game.day() });
    this.game.ui && this.game.ui.dot('airlines');
  }
  tickEvents() {
    const g = this.game;
    const day = g.day();
    if (this.level < 3 || !this.E.contracts.length) return;
    if (!this.ev || this.ev.day !== day) this.ev = { day, at: (day - 1) * 1440 + 600 + Math.floor(this.E.rand() * 360), fired: false };
    if (this.ev.fired || g.time < this.ev.at || (g.pilot && g.pilot.active)) return;
    this.ev.fired = true;
    const yest = this.E.history[this.E.history.length - 1];
    const pool = EVENTS.filter((e) => (!e.minLevel || this.level >= e.minLevel) && (!e.needUp || this.up(e.needUp) > 0) && (!e.noFlag || !this.flags[e.noFlag]) && (!e.needLate || (yest && yest.flights > 4 && yest.ontime < yest.flights * 0.6)) && (!e.needContracts || this.E.contracts.length));
    if (!pool.length) return;
    const ev = pool[Math.floor(this.E.rand() * pool.length)];
    const inst = { id: ev.id, costs: ev.choices.map((c) => (c.cost ? this.eventCost(c.cost) : 0)) };
    if (ev.id === 'ceo') {
      const c = this.E.contracts[Math.floor(this.E.rand() * this.E.contracts.length)];
      inst.contract = c.id;
      inst.airlineName = this.E.airline(c.airline).name;
    }
    this.queue.push({ kind: 'event', inst });
  }
  resolveEvent(inst, k) {
    const ev = EVENTS.find((e) => e.id === inst.id);
    const ch = ev.choices[k];
    const cost = inst.costs[k];
    if (cost && !this.E.spend(cost, 'event')) {
      // para yetmezse ikinci seçenek uygulanır
      return ev.choices.length > 1 && k === 0 ? this.resolveEvent(inst, 1) : null;
    }
    ch.apply(this, inst);
  }

  // ---------------------------------------------------------------- mükemmellik
  markAirline(id) {
    if (!this.everAir.includes(id) && AIRLINES.some((a) => a.id === id)) this.everAir.push(id);
  }
  upgradesDone() {
    return [UPGRADES.reduce((s, u) => s + this.up(u.id), 0), UPGRADES.reduce((s, u) => s + u.levels.length, 0)];
  }
  achDone() {
    return ACH.filter((a) => a.id !== 'perfection' && this.ach[a.id]).length;
  }
  achTotal() {
    return ACH.length - 1;
  }
  perfection() {
    return perfection(this);
  }

  get E() {
    return this.game.econ;
  }

  // ---------------------------------------------------------------- etkiler
  up(id) {
    return this.ups[id] || 0;
  }
  incomeMul() {
    return (1 + Math.min(0.6, LEGEND_BONUS * Math.max(0, this.level - LEVELS.length))) * (this.has('gold') ? 1.1 : 1);
  }
  turnMul() {
    return [1, 0.88, 0.78, 0.68][this.up('ground')] * (this.has('mro') ? 0.92 : 1) * this.mod('turn');
  }
  retailMul() {
    return [1, 1.3, 1.6, 2][this.up('retail')] * (this.wx.kind === 'rush' ? 1.3 : 1) * (this.has('hotel') ? 1.15 : 1) * this.mod('retail');
  }
  loadMul() {
    return (1 + this.up('marketing') * 0.03 + (this.wx.kind === 'rush' ? 0.08 : 0) + (this.has('metro') ? 0.05 : 0) + (this.has('expo') ? 0.04 : 0)) * this.mod('load');
  }
  parkingRate() {
    return [0, 40, 80, 130][this.up('parking')] * (this.wx.kind === 'rush' ? 1.5 : 1) * (this.has('metro') ? 1.5 : 1);
  }
  fuelFor(type) {
    const v = [0, 15_000, 30_000, 50_000][this.up('fuel')];
    return v * (type === 'wide' ? 2.5 : type === 'regional' ? 0.6 : 1) * this.mod('fuel');
  }
  offerCount() {
    return 4 + this.up('marketing');
  }
  fogAt(t) {
    const w = this.wx;
    if (w.kind !== 'fog') return 0;
    return clamp(Math.min(t - w.from, w.to - t) / 25 + 0.5, 0, 1);
  }
  stormAt(t) {
    const w = this.wx;
    if (w.kind !== 'storm') return 0;
    return clamp(Math.min(t - w.from, w.to - t) / 20 + 0.5, 0, 1);
  }
  storm(t) {
    const w = this.wx;
    return w.kind === 'storm' && t >= w.from && t < w.to;
  }
  arrSep(t) {
    let s = ATC_SEP[this.up('atc')];
    if (this.fogAt(t) > 0.5) s *= FOG_MUL[this.up('ils')];
    return s;
  }
  depGap() {
    return ATC_DEP[this.up('atc')];
  }

  // ---------------------------------------------------------------- olay kancaları
  onDeparted(f) {
    const E = this.E, T = E.today;
    if (effDelay(f) < 15) T.ontime++;
    if (f.jetway) T.jw++;
    if (f.type === 'wide') T.wide++;
    const fuel = this.fuelFor(f.type);
    if (fuel) E.earn(fuel, 'fuel');
    if (f.charter) {
      const late = effDelay(f) >= 25;
      const pay = late ? Math.round(f.bonus / 2) : f.bonus;
      E.earn(pay, 'charter');
      T.charters++;
      this.count.charters++;
      E.notify(`Charter ${f.codeDep} tamamlandı: ${money(pay)}${late ? ' (gecikme nedeniyle yarısı)' : ''}`, 'good');
    }
  }
  satBonus() {
    return [0, 0.6, 1.2][this.up('lounge')];
  }
  effDelay(f) {
    return effDelay(f);
  }

  // ---------------------------------------------------------------- gün başı / sonu
  // gün sonu: today sıfırlandıktan sonra çağrılır; rec biten günün kaydı
  endDay(rec) {
    const E = this.E;
    this.checkChallenges(rec, true);
    // günlük başarımlar
    if (rec.flights >= 20 && rec.ontime >= rec.flights) this.grant('punct');
    if (rec.flights >= 15 && !rec.diverted && !rec.goarounds) this.grant('perfect');
    if (this.wx.kind === 'storm' && rec.flights >= 8 && !rec.diverted) this.grant('storm');
    this.bestDayPax = Math.max(this.bestDayPax, rec.pax || 0);
    // gece kargo uçuşları ve müze ziyaretçileri
    const flightInc = ['landing', 'pax', 'retail', 'jetway', 'hangar', 'fuel', 'parking'].reduce((s, k) => s + (rec.income[k] || 0), 0);
    if (this.has('cargo')) E.earn(Math.round(flightInc * 0.12), 'cargo');
    if (this.has('museum') && this.hangar.length) E.earn(3_000_000 * this.hangar.length, 'museum');
    this.mods = this.mods.filter((x) => x.until > this.game.time);
    // süresi dolan özel teklifler
    this.special = this.special.filter((s) => s.kind === 'charter' && s.expires > this.game.time);
    void E;
  }

  startDay(day, quiet) {
    this.rollWeather(day, quiet);
    if (!quiet) this.rollSpecials(day);
    this.ch = null;
    this.ensureChallenges();
  }

  rollWeather(day, quiet) {
    const E = this.E;
    const sod = (day - 1) * 1440;
    const r = E.rand();
    let w = { day, kind: 'clear' };
    if (this.forceRush === day) w = { day, kind: 'rush', show: true };
    else if (day >= 3) {
      if (r < 0.12) {
        const from = sod + 300 + Math.floor(E.rand() * 60);
        w = { day, kind: 'fog', from, to: from + 150 + Math.floor(E.rand() * 120) };
      } else if (r < 0.2 && this.level >= STORM_LEVEL) {
        const from = sod + 600 + Math.floor(E.rand() * 540);
        w = { day, kind: 'storm', from, to: from + 60 + Math.floor(E.rand() * 60) };
      } else if (r < (this.has('expo') ? 0.42 : 0.3) && this.level >= 2) w = { day, kind: 'rush' };
    }
    this.wx = w;
    if (quiet) return;
    if (w.kind === 'fog') E.notify(`Hava durumu: ${hhmm(w.from)}–${hhmm(w.to)} arası yoğun sis. İnişler arası mesafe artar${this.up('ils') >= 2 ? ', ama ILS CAT III sayesinde etkilenmezsiniz' : '; ILS yükseltmesi bunu azaltır'}.`, 'warn');
    if (w.kind === 'storm') E.notify(`Hava durumu: ${hhmm(w.from)}–${hhmm(w.to)} arası fırtına. Bu sürede iniş ve kalkış yapılmaz; havayolları hava gecikmesini size yazmaz.`, 'warn');
    if (w.kind === 'rush') E.notify('Bayram yoğunluğu: bugün uçaklar daha dolu, terminal satışları ve otopark geliri yüksek.', 'good');
  }

  rollSpecials(day) {
    const E = this.E;
    // genişleme talebi: çok memnun havayolu sefer sayısını artırmak ister
    this.special = this.special.filter((s) => s.kind === 'charter' && s.expires > this.game.time);
    const cands = E.contracts.filter((c) => {
      const a = E.airline(c.airline);
      return c.sat >= 80 && c.done >= c.perDay * 2 && c.perDay < a.perDay[1] + 6;
    });
    if (cands.length && E.rand() < 0.4) {
      const c = cands[Math.floor(E.rand() * cands.length)];
      const add = E.rand() < 0.5 ? 1 : 2;
      const bonus = r50k(add * { regional: 300_000, narrow: 500_000, wide: 1_000_000 }[c.type]);
      this.special.push({ id: E.seq++, kind: 'expand', contract: c.id, airline: c.airline, add, bonus, day });
      const a = E.airline(c.airline);
      E.notify(`${a.name} günde ${add} sefer daha eklemek istiyor (Havayolları sekmesi)`, 'good');
      this.game.ui && this.game.ui.dot('airlines');
    }
    if (this.level >= CHARTER_LEVEL && E.rand() < 0.4) this.makeCharter((day - 1) * 1440 + 360);
    void day;
  }

  makeCharter(from) {
    const E = this.E, W = this.game.world, S = this.game.sim;
    const can = CHARTERS.filter((c) => S.canHandle(c.type) && W.list('stand').some((s) => STANDS[s.size].fits.includes(c.type)));
    if (!can.length) return;
    can.sort((a, b) => AIRCRAFT[b.type].seats - AIRCRAFT[a.type].seats);
    const a = E.rand() < 0.6 ? can[0] : can[Math.floor(E.rand() * can.length)];
    const sod = Math.floor(from / 1440) * 1440;
    const arr = Math.round(Math.max(from + 120, sod + 480) + E.rand() * 240);
    if (arr % 1440 > 1290 || arr < this.game.time + 60) return;
    const t = AIRCRAFT[a.type];
    const bonus = r50k(t.landingFee * 4 + t.seats * 2 * 1500);
    const city = CITIES[Math.floor(E.rand() * CITIES.length)];
    this.special.push({ id: E.seq++, kind: 'charter', airline: a.id, type: a.type, arr, bonus, city, expires: arr - 40 });
    E.notify(`${a.name} ${hhmm(arr)} için charter uçuşu teklif ediyor: ${moneyShort(bonus)} ek ödeme`, 'good');
    this.game.ui && this.game.ui.dot('airlines');
  }

  acceptSpecial(id) {
    const E = this.E;
    const s = this.special.find((x) => x.id === id);
    if (!s) return;
    if (s.kind === 'charter') {
      const a = E.airline(s.airline);
      const miss = E.requirements(a).filter((r) => !r.ok);
      if (miss.length) return E.notify(`${a.name} için eksik: ${miss.map((m) => m.text).join(', ')}`, 'bad');
      if (s.expires <= this.game.time) return E.notify('Bu teklifin süresi doldu', 'bad');
      const t = AIRCRAFT[s.type];
      const num0 = 700 + Math.floor(E.rand() * 90) * 2;
      this.game.sim.flights.push({
        id: E.seq++, contract: null, charter: true, bonus: s.bonus, airline: a.id, code: `${a.code} ${num0}`, codeDep: `${a.code} ${num0 + 1}`, type: s.type,
        from: s.city, to: s.city, arr: s.arr, dep: s.arr + t.turnMin + 45, status: 'planned', delay: 0, stand: null,
      });
      this.game.sim.flights.sort((x, y) => x.arr - y.arr);
      E.notify(`Charter kabul edildi: ${a.name}, ${hhmm(s.arr)}`, 'good');
    } else if (s.kind === 'expand') {
      const c = E.contracts.find((x) => x.id === s.contract);
      if (!c) return;
      E.expand(c, s.add);
      E.earn(s.bonus, 'bonus');
      this.count.expansions++;
      E.notify(`${E.airline(c.airline).name} artık günde ${c.perDay} sefer yapıyor: ${money(s.bonus)} imza ödemesi`, 'good');
    }
    this.special = this.special.filter((x) => x !== s);
  }

  declineSpecial(id) {
    this.special = this.special.filter((x) => x.id !== id);
  }

  // ---------------------------------------------------------------- günlük görevler
  todayFlights() {
    const g = this.game;
    const sod = (g.day() - 1) * 1440;
    return g.sim.flights.filter((f) => f.arr >= sod && f.arr < sod + 1440 && !['departed', 'diverted', 'cancelled'].includes(f.status));
  }

  ensureChallenges() {
    const g = this.game;
    const day = g.day();
    if (this.ch && this.ch.day === day && !this.ch.waiting) return;
    const E = this.E;
    const fl = this.todayFlights();
    const R = fl.length;
    if (R < 3) {
      this.ch = { day, list: [], waiting: true };
      return;
    }
    const T = E.today;
    let expPax = 0, expInc = 0, wideR = 0;
    for (const f of fl) {
      const a = E.airline(f.airline);
      const t = AIRCRAFT[f.type];
      const p = Math.min(t.seats, t.seats * a.load * this.loadMul());
      expPax += f.status === 'planned' || f.status === 'holding' ? p * 2 : p;
      expInc += E.estimate(a, 1);
      if (f.type === 'wide') wideR++;
    }
    const jwStands = g.world.list('stand').filter((s) => s.jetway).length;
    const avail = ['flights', 'pax', 'ontime', 'nodivert', 'nogo'];
    if (jwStands) avail.push('jetway');
    if (wideR >= 2) avail.push('wide');
    const incSoFar = Object.values(T.income).reduce((s, v) => s + v, 0) - (T.income.bonus || 0);
    const expSoFar = Object.values(T.expense).reduce((s, v) => s + v, 0);
    const profitT = r50k((incSoFar + expInc) * 0.55 - expSoFar - E.upkeep());
    if (profitT >= 100_000) avail.push('profit');
    const base = clamp(expInc * 0.1, 200_000, 8_000_000);
    const list = [];
    const pool = [...avail];
    while (list.length < 3 && pool.length) {
      const tw = pool.reduce((s, k) => s + CH[k].w, 0);
      let x = E.rand() * tw, k = 0;
      while (k < pool.length - 1 && (x -= CH[pool[k]].w) > 0) k++;
      const type = pool.splice(k, 1)[0];
      let target = 0;
      if (type === 'flights') target = Math.max(2, Math.ceil(R * 0.8));
      if (type === 'pax') target = Math.max(200, Math.round((expPax * 0.65) / 100) * 100);
      if (type === 'ontime') target = Math.max(2, Math.ceil(R * 0.45));
      if (type === 'jetway') target = Math.max(2, Math.min(Math.ceil(R * 0.5), jwStands * 4));
      if (type === 'wide') target = Math.max(1, Math.ceil(wideR * 0.75));
      if (type === 'nodivert' || type === 'nogo') target = Math.max(2, Math.ceil(R * 0.5));
      if (type === 'profit') target = profitT;
      const c = { type, target, reward: r10k(base * CH[type].mul), state: 'open' };
      if (CH[type].key) c.base = T[CH[type].key] || 0;
      if (type === 'nodivert' || type === 'nogo') c.fbase = T.flights;
      list.push(c);
    }
    this.ch = { day, list, allPaid: false };
    this.newGoals = true;
    g.ui && g.ui.dot('goals');
  }

  chText(c) {
    return CH[c.type].text(c.target);
  }

  chProgress(c, T = this.E.today) {
    if (c.type === 'profit') return null;
    if (c.type === 'nodivert' || c.type === 'nogo') return [Math.max(0, T.flights - c.fbase), c.target];
    return [Math.max(0, (T[CH[c.type].key] || 0) - c.base), c.target];
  }

  streakMul() {
    return 1 + Math.min(this.streak, 10) * 0.1;
  }

  checkChallenges(T = this.E.today, dayEnd = false) {
    const ch = this.ch;
    if (!ch || !ch.list.length) return;
    const E = this.E;
    for (const c of ch.list) {
      if (c.state !== 'open') continue;
      if (c.type === 'nodivert' || c.type === 'nogo') {
        if ((T[CH[c.type].key] || 0) > c.base) {
          c.state = 'fail';
          E.notify(`Görev kaçtı: ${this.chText(c)}`, 'warn');
        } else if (dayEnd) c.state = T.flights - c.fbase >= c.target ? 'done' : 'fail';
      } else if (c.type === 'profit') {
        if (dayEnd) c.state = T.net - (T.income.bonus || 0) - (T.income.charter || 0) >= c.target ? 'done' : 'fail';
      } else {
        const [v, n] = this.chProgress(c, T);
        if (v >= n) c.state = 'done';
        else if (dayEnd) c.state = 'fail';
      }
      if (c.state === 'done') {
        const pay = r10k(c.reward * this.streakMul());
        E.earn(pay, 'bonus');
        c.paid = pay;
        E.notify(`Görev tamamlandı: ${this.chText(c)} · ${money(pay)}`, 'good');
        this.newGoals = true;
        this.game.ui && this.game.ui.dot('goals');
      }
    }
    if (!ch.allPaid && ch.list.every((c) => c.state === 'done')) {
      ch.allPaid = true;
      const bonus = r10k(ch.list.reduce((s, c) => s + (c.paid || 0), 0) * 0.5);
      E.earn(bonus, 'bonus');
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      E.notify(`Günün tüm görevleri tamam! ${money(bonus)} bonus · seri ${this.streak} gün (ödüller +%${Math.min(this.streak, 10) * 10})`, 'good');
    } else if (dayEnd && !ch.allPaid && this.streak) {
      E.notify(`Görev serisi bozuldu (${this.streak} gün)`, 'warn');
      this.streak = 0;
    }
  }

  // ---------------------------------------------------------------- sıralama
  rivals() {
    const day = this.game.day();
    return RIVALS.map(([name, base, g], i) => ({ name, pax: Math.round(base * Math.pow(1 + g, day - 1) * (1 + 0.03 * Math.sin(day * 1.7 + i * 2.3))) }));
  }
  weekPax() {
    const H = this.E.history.slice(-6);
    return H.reduce((s, d) => s + (d.pax || 0), 0) + this.E.today.pax;
  }
  board() {
    const me = { name: 'Havalimanınız', pax: this.weekPax(), me: true };
    const all = [...this.rivals(), me].sort((a, b) => b.pax - a.pax);
    all.forEach((r, k) => (r.rank = k + 1));
    return all;
  }
  rank() {
    const mine = this.weekPax();
    return 1 + this.rivals().filter((r) => r.pax > mine).length;
  }

  // ---------------------------------------------------------------- başarımlar
  ctx() {
    const g = this.game;
    return { E: g.econ, W: g.world, S: g.sim, P: this };
  }
  achList() {
    const c = this.ctx();
    return ACH.map((a) => {
      const p = a.prog ? a.prog(c) : null;
      return { ...a, done: !!this.ach[a.id], cur: p ? p[0] : 0, max: p ? p[1] : 0 };
    });
  }
  grant(id, silent) {
    if (this.ach[id]) return;
    const a = ACH.find((x) => x.id === id);
    this.ach[id] = this.game.day();
    if (silent) return;
    if (a.reward) this.E.earn(a.reward, 'bonus');
    this.E.notify(`Başarım: ${a.name}${a.reward ? ` · ${money(a.reward)}` : ''}`, 'good');
    this.newGoals = true;
    this.game.ui && this.game.ui.dot('goals');
  }
  checkAch(silent) {
    const c = this.ctx();
    for (const a of ACH) {
      if (this.ach[a.id] || !a.prog) continue;
      const [v, n] = a.prog(c);
      if (v >= n) this.grant(a.id, silent);
    }
  }

  // ---------------------------------------------------------------- yükseltme satın alma
  upCost(u) {
    const n = this.up(u.id);
    return n < u.levels.length ? u.levels[n] : null;
  }
  buyUp(id) {
    const u = UPGRADES.find((x) => x.id === id);
    const nx = u && this.upCost(u);
    if (!nx) return;
    if (this.level < nx.lvl) return this.E.notify(`${u.name} için seviye ${nx.lvl} gerekli`, 'bad');
    if (!this.E.spend(nx.cost, 'upgrade')) return;
    this.ups[id] = this.up(id) + 1;
    if (id !== 'pilot') this.E.notify(`${u.name} ${this.ups[id]}. kademe: ${u.eff(this.ups[id])}`, 'good');
    if (id === 'pilot') this.E.notify('Uçuş kulübü açıldı: sağ alttaki "Uç" düğmesinden hangara girip ilk uçağınızı alın', 'good');
    if (id === 'marketing') {
      // mevcut teklifler kalır, boş yerlere yenileri eklenir
      const E = this.E, keep = E.offers;
      E.genOffers();
      const seen = new Set(keep.map((o) => o.airline));
      E.offers = [...keep, ...E.offers.filter((o) => !seen.has(o.airline))].slice(0, this.offerCount());
    }
  }

  // ---------------------------------------------------------------- seviye
  unlocksFor(L) {
    const out = [];
    for (const a of AIRLINES) if (a.minLevel === L) out.push(`Yeni havayolu: ${a.name} (${AIRCRAFT[a.type].name.toLowerCase()})`);
    for (const u of UPGRADES) u.levels.forEach((x, k) => x.lvl === L && out.push(`Yükseltme: ${u.name}${u.levels.length > 1 ? ` ${k + 1}. kademe` : ''}`));
    if (L === STORM_LEVEL) out.push('Fırtınalı günler (dikkat: iniş ve kalkışlar durur)');
    if (L === CHARTER_LEVEL) out.push('Charter teklifleri: tek seferlik ek ödemeli uçuşlar');
    if (L === LEVELS.length) out.push('Efsane seviyeleri: her seviye kalıcı +%2 gelir');
    if (L > LEVELS.length) out.push(`Kalıcı gelir bonusu: toplam +%${Math.round((this.incomeMulFor(L) - 1) * 100)}`);
    return out;
  }
  incomeMulFor(L) {
    return 1 + Math.min(0.6, LEGEND_BONUS * Math.max(0, L - LEVELS.length));
  }

  checkLevel(silent) {
    const L = levelFor(this.E.totals.pax);
    if (L <= this.level) return;
    const E = this.E;
    while (this.level < L) {
      this.level++;
      if (silent) continue;
      const info = levelInfo(this.level);
      if (info.reward) E.earn(info.reward, 'bonus');
      // yeni açılan havayolu hemen teklif gönderir
      for (const a of AIRLINES) {
        if (a.minLevel !== this.level || E.contracts.some((c) => c.airline === a.id) || E.offers.some((o) => o.airline === a.id)) continue;
        const perDay = a.perDay[0] + Math.floor(E.rand() * (a.perDay[1] - a.perDay[0] + 1));
        E.offers.unshift({ id: E.seq++, airline: a.id, perDay, type: a.type });
        this.game.ui && this.game.ui.dot('airlines');
      }
      E.notify(`Seviye ${this.level}: ${info.name}! ${info.reward ? money(info.reward) + ' ödül' : ''}`, 'good');
      this.queue.push({ kind: 'level', level: this.level });
    }
    this.newGoals = true;
    this.game.ui && this.game.ui.dot('goals');
  }

  // ---------------------------------------------------------------- düzenli kontrol (gerçek zamanda ~4/sn)
  tick(dt) {
    const g = this.game;
    this.maxAc = Math.max(this.maxAc, g.sim.ac.length);
    this.ensureChallenges();
    this.checkChallenges();
    this.checkLevel();
    this.tickProjects();
    this.tickEvents();
    // öğleden sonra ikinci charter şansı
    const day = g.day();
    if (this.level >= CHARTER_LEVEL && g.time % 1440 >= 720 && this.charterSlot !== day) {
      this.charterSlot = day;
      if (this.E.rand() < 0.3) this.makeCharter(g.time);
    }
    this.special = this.special.filter((s) => s.kind !== 'charter' || s.expires > g.time);
    this.tAch -= dt;
    if (this.tAch <= 0) {
      this.tAch = 1;
      this.checkAch();
      if (!this.ach.perfection && this.perfection().pct >= 100) this.grant('perfection');
      const r = this.rank();
      if (r < this.bestRank) {
        const gained = this.bestRank - r;
        const pay = r10k(300_000 * gained * Math.max(1, (RIVALS.length + 2 - r) / 2));
        this.bestRank = r;
        const passed = this.rivals().sort((a, b) => b.pax - a.pax)[r - 1];
        this.E.earn(pay, 'bonus');
        this.E.notify(`Sıralamada yükseldiniz: #${r}${passed ? ` (${passed.name} geride kaldı)` : ''} · ${money(pay)}`, 'good');
        this.game.ui && this.game.ui.dot('goals');
      }
    }
    if (this.queue.length && document.getElementById('modal').hidden) this.showQueued(this.queue.shift());
  }

  showQueued(q) {
    const ui = this.game.ui;
    if (q.kind === 'event') {
      const inst = q.inst;
      const ev = EVENTS.find((e) => e.id === inst.id);
      const text = ev.text.replace('{airline}', inst.airlineName || '');
      ui.modal(`<div class="evc"><div class="ev-tag">Olay</div><h2>${ev.title}</h2><p>${text}</p>
        <div class="col">${ev.choices.map((c, k) => {
          const cost = inst.costs[k];
          const can = !cost || this.E.money >= cost;
          return `<button class="btn ${k === 0 ? 'primary' : ''}" data-m="c${k}" ${can ? '' : 'disabled'}>${c.label}${cost ? ` · ${money(cost)}` : ''}</button>`;
        }).join('')}</div>
        <p class="muted">Bedeller son günlerin gelirine göre belirlenir.</p></div>`, (k) => {
        if (k && k[0] === 'c') this.resolveEvent(inst, +k.slice(1));
        else this.resolveEvent(inst, ev.choices.length - 1);
      }, { sticky: true });
      return;
    }
    if (q.kind === 'project') {
      const pr = projectById(q.id);
      ui.modal(`<div class="lvlup"><div class="lv-badge">★</div><h2>${pr.name} açıldı</h2><p>${pr.desc}</p><p class="lv-rew"><b>${pr.eff}</b></p>
        <p class="muted">Yapı havalimanının güney çitinin dışında.</p><div class="row"><button class="btn primary" data-m="ok">Harika</button></div></div>`);
      return;
    }
    if (q.kind === 'level') {
      const info = levelInfo(q.level);
      const un = this.unlocksFor(q.level);
      const nx = levelInfo(q.level + 1);
      ui.modal(`<div class="lvlup"><div class="lv-badge">${q.level}</div><h2>Seviye ${q.level} · ${info.name}</h2>
        ${info.reward ? `<p class="lv-rew">Ödül: <b>${money(info.reward)}</b></p>` : ''}
        ${un.length ? `<h3>Açılanlar</h3><ul>${un.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
        <p class="muted">Sonraki seviye: ${nx.name}, toplam ${num(nx.pax)} yolcu.</p>
        <div class="row"><button class="btn primary" data-m="goals">Hedeflere bak</button>${UPGRADES.some((u) => u.levels.some((x) => x.lvl === q.level)) ? '<button class="btn" data-m="ups">Yükseltmeler</button>' : ''}<button class="btn" data-m="ok">Devam</button></div></div>`, (k) => {
        if (k === 'goals') ui.openPanel('goals');
        if (k === 'ups') ui.openPanel('upgrades');
      });
    } else if (q.kind === 'intro') {
      const info = levelInfo(this.level);
      ui.modal(`<div class="lvlup"><div class="lv-badge">${this.level}</div><h2>Yeni: hedefler ve yükseltmeler</h2>
        <p>Havalimanınız <b>seviye ${this.level} · ${info.name}</b> olarak değerlendirildi. Artık 5 yıldızdan sonra da yapacak çok şey var:</p>
        <ul><li>Her gün yenilenen 3 görev ve seri bonusu</li><li>${ACH.length} başarım, her biri para ödüllü</li><li>Rakip havalimanlarıyla haftalık yolcu sıralaması</li><li>${UPGRADES.length} yükseltme: ATC, ILS, duty free, yakıt…</li><li>Sis, fırtına, bayram yoğunluğu, charter ve genişleme talepleri</li><li>Seviyeyle açılan 6 yeni havayolu, 10. seviyeden sonra sonsuz efsane seviyeleri</li></ul>
        <div class="row"><button class="btn primary" data-m="goals">Hedeflere bak</button><button class="btn" data-m="ok">Devam</button></div></div>`, (k) => {
        if (k === 'goals') ui.openPanel('goals');
      });
    }
  }

  // ---------------------------------------------------------------- kayıt
  toJSON() {
    return { level: this.level, ach: this.ach, ch: this.ch, streak: this.streak, bestStreak: this.bestStreak, bestRank: this.bestRank, bestDayPax: this.bestDayPax, maxAc: this.maxAc, ups: this.ups, wx: this.wx, special: this.special, count: this.count, charterSlot: this.charterSlot, hangar: this.hangar, proj: this.proj, mods: this.mods, flags: this.flags, everAir: this.everAir, forceRush: this.forceRush, ev: this.ev };
  }
  fromJSON(o) {
    if (!o) {
      // eski kayıt: kazanılmış ilerlemeyi ödül vermeden işle
      this.level = levelFor(this.E.totals.pax);
      this.checkAch(true);
      this.bestRank = this.rank();
      this.bestDayPax = Math.max(0, ...this.E.history.map((d) => d.pax || 0));
      this.wx = { day: this.game.day(), kind: 'clear' };
      this.ch = null;
      this.ensureChallenges();
      for (const c of this.E.contracts) this.markAirline(c.airline);
      this.queue.push({ kind: 'intro' });
      return;
    }
    Object.assign(this, {
      level: o.level || 1, ach: o.ach || {}, ch: o.ch || null, streak: o.streak || 0, bestStreak: o.bestStreak || 0, bestRank: o.bestRank || RIVALS.length + 1,
      bestDayPax: o.bestDayPax || 0, maxAc: o.maxAc || 0, ups: o.ups || {}, wx: o.wx || { day: 0, kind: 'clear' }, special: o.special || [], count: { charters: 0, expansions: 0, ...(o.count || {}) }, charterSlot: o.charterSlot || 0,
      hangar: o.hangar || [], proj: o.proj || {}, mods: o.mods || [], flags: o.flags || {}, everAir: o.everAir || [], forceRush: o.forceRush || 0, ev: o.ev || null,
    });
    for (const c of this.E.contracts) this.markAirline(c.airline);
    // eski uçuş kulübü kademeleri (bölgesel/dar/geniş) hangar uçaklarına çevrilir
    if ((this.ups.pilot || 0) > 1 || (this.ups.pilot && !o.hangar)) {
      const n = this.ups.pilot;
      const give = ['f16', 'f18', 'b777'].slice(0, n);
      this.hangar = [...new Set([...this.hangar, ...give])];
      this.ups.pilot = 1;
    }
  }
}

export const RIVAL_COUNT = RIVALS.length;
export { effDelay };
