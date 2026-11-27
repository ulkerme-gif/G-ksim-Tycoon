// Geç oyun: anıt projeler (Cities: Skylines anıtları gibi), günlük olay kartları (Sims'teki seçimler gibi),
// mükemmellik ölçeri (Stardew Valley gibi). Paranın her aşamada bir anlamı olsun diye.
import * as THREE from 'three';
import { MAP_H, CELL, AIRLINES, HANGAR } from './config.js';
import { money, moneyShort } from './util.js';
import { facadeTextures } from './scenery.js';

// ---------------------------------------------------------------- anıt projeler
export const PROJECTS = [
  { id: 'hotel', name: 'Havalimanı oteli', cost: 200_000_000, days: 2, lvl: 5, desc: 'Terminale bağlı 30 katlı otel. Aktarma yolcuları burada geceler.', eff: 'Gelen yolcu başına ₺60 otel geliri, terminal satışları ×1,15' },
  { id: 'cargo', name: 'Kargo merkezi', cost: 300_000_000, days: 2, lvl: 6, desc: 'Gece çalışan kargo terminali ve kargo apronu.', eff: 'Her gece kargo uçuşları: günlük uçuş gelirinin %12\'si' },
  { id: 'mro', name: 'Bakım merkezi (MRO)', cost: 400_000_000, days: 3, lvl: 6, desc: 'Dev bakım hangarı. Havayolları uçaklarını bakıma size getirir.', eff: 'Hangar bakım geliri ×2, uçaklar kapıda %8 daha kısa kalır' },
  { id: 'metro', name: 'Metro hattı', cost: 500_000_000, days: 3, lvl: 7, desc: 'Şehir merkezine raylı sistem. Yolcu havalimanına kolay gelir.', eff: 'Uçak doluluğu +%5, otopark ve ulaşım geliri ×1,5' },
  { id: 'museum', name: 'Havacılık müzesi', cost: 600_000_000, days: 3, lvl: 8, needHangar: 3, desc: 'Uçuş kulübü uçaklarınız müzenin önünde sergilenir.', eff: 'Her gün hangardaki uçak başına ₺3 Mn müze geliri' },
  { id: 'expo', name: 'Kongre ve fuar merkezi', cost: 800_000_000, days: 4, lvl: 9, desc: 'Uluslararası fuarlar ve kongreler. İş yolcusu getirir.', eff: 'Doluluk +%4, yoğun fuar günleri daha sık' },
  { id: 'gold', name: 'Altın kule', cost: 5_000_000_000, days: 7, lvl: 10, needAll: true, desc: 'Dünyanın en yüksek havalimanı kulesi. Zirvenin simgesi.', eff: 'Günlük bakım giderleri sıfır, tüm uçuş gelirleri +%10' },
];
export const projectById = (id) => PROJECTS.find((p) => p.id === id);

// ---------------------------------------------------------------- olay kartları
// cost: son günlerin ortalama günlük gelirine oranı (paranın her aşamada anlamı olsun)
export const EVENTS = [
  {
    id: 'strike', title: 'Yer hizmetleri grevi', text: 'Bagaj ve yakıt ekipleri zam istiyor. Anlaşmazsanız yarına kadar işler yavaşlar.',
    choices: [
      { label: 'Zam ver', cost: 0.22, apply: (P) => P.toast('Ekipler işbaşında. Grev sona erdi.') },
      { label: 'Direnin', apply: (P) => { P.addMod('turn', 1.35, 1440); P.satAll(-4); P.toast('Grev sürüyor: uçaklar kapıda daha uzun kalacak.', 'warn'); } },
    ],
  },
  {
    id: 'vip', title: 'Devlet konuğu geliyor', text: 'Bir devlet başkanının uçağı yarın havalimanınıza inecek. Karşılama töreni havayollarının gözünde itibarınızı artırır.',
    choices: [
      { label: 'Görkemli tören', cost: 0.12, apply: (P) => { P.satAll(4); P.toast('Tören haberlere çıktı. Havayolları memnun.'); } },
      { label: 'Sade karşılama', apply: () => {} },
    ],
  },
  {
    id: 'airshow', minLevel: 3, title: 'Hava gösterisi teklifi', text: 'Akrobasi ekipleri yarın havalimanınızda gösteri yapmak istiyor. Masrafları siz karşılarsanız şehir akın akın gelir.',
    choices: [
      { label: 'Gösteriyi düzenle', cost: 0.3, apply: (P) => { P.forceRush = P.game.day() + 1; P.toast('Yarın hava gösterisi: yolcu ve satışlar artacak. Uçuş kulübüyle siz de katılın!'); } },
      { label: 'Reddet', apply: () => {} },
    ],
  },
  {
    id: 'hvac', title: 'Terminal klima arızası', text: 'Terminalin klimaları bozuldu. Yolcular bunalıyor, mağazalar boş.',
    choices: [
      { label: 'Hemen onar', cost: 0.08, apply: (P) => P.toast('Klimalar onarıldı.') },
      { label: 'Yarın onar', apply: (P) => { P.addMod('retail', 0.6, P.toMidnight()); P.satAll(-2); P.toast('Terminal satışları gün sonuna kadar düşük.', 'warn'); } },
    ],
  },
  {
    id: 'ceo', needContracts: true, title: 'Havayolu genel müdürü ziyareti', text: '{airline} genel müdürü havalimanınızı görmek istiyor. İyi ağırlanırsa sefer sayısını artırmayı düşünecek.',
    choices: [
      { label: 'Ağırla', cost: 0.1, apply: (P, ev) => { P.satOne(ev.contract, 15); P.offerExpand(ev.contract); P.toast(`${ev.airlineName} çok memnun kaldı.`); } },
      { label: 'Zamanım yok', apply: (P, ev) => { P.satOne(ev.contract, -5); P.toast(`${ev.airlineName} kırıldı.`, 'warn'); } },
    ],
  },
  {
    id: 'press', needLate: true, title: 'Basında gecikme haberleri', text: 'Dünkü gecikmeler gazetelere çıktı. Havayolları tedirgin.',
    choices: [
      { label: 'Reklam ve PR kampanyası', cost: 0.15, apply: (P) => { P.satAll(4); P.toast('Kampanya haberleri unutturdu.'); } },
      { label: 'Görmezden gel', apply: (P) => { P.satAll(-4); P.toast('Haberler büyüdü. Havayolları memnuniyetsiz.', 'warn'); } },
    ],
  },
  {
    id: 'festival', title: 'Şehirde festival', text: 'Önümüzdeki iki gün şehirde büyük bir festival var. Sponsor olursanız festival yolcuları sizin havalimanınızı seçer.',
    choices: [
      { label: 'Sponsor ol', cost: 0.1, apply: (P) => { P.addMod('load', 1.08, 2880); P.toast('Festival yolcuları geliyor: iki gün boyunca uçaklar daha dolu.'); } },
      { label: 'Geç', apply: () => {} },
    ],
  },
  {
    id: 'birds', noFlag: 'birdRadar', title: 'Kuş sürüsü uyarısı', text: 'Göç mevsimi başladı. Pist çevresinde kuş sürüleri görülüyor.',
    choices: [
      { label: 'Kuş radarı ve ekip kur (kalıcı)', cost: 0.18, apply: (P) => { P.flags.birdRadar = true; P.toast('Kuş radarı kuruldu. Bu uyarı bir daha gelmeyecek.'); } },
      { label: 'Risk al', apply: (P) => { if (P.E.rand() < 0.5) { P.satAll(-3); P.toast('Kuş çarpması: bir uçak geri döndü, havayolları tedirgin.', 'warn'); } else P.toast('Şanslıydınız, olay olmadı.'); } },
    ],
  },
  {
    id: 'fuel', needUp: 'fuel', title: 'Yakıt tedarikçisinden indirim', text: 'Tedarikçi ön ödeme karşılığında üç gün ucuz yakıt veriyor. Yakıt satış kârınız artar.',
    choices: [
      { label: 'Ön ödeme yap', cost: 0.2, apply: (P) => { P.addMod('fuel', 1.6, 4320); P.toast('Üç gün boyunca yakıt geliri ×1,6.'); } },
      { label: 'Geç', apply: () => {} },
    ],
  },
  {
    id: 'charity', title: 'Hastane bağış kampanyası', text: 'Şehrin çocuk hastanesi yeni bir bina için bağış topluyor.',
    choices: [
      { label: 'Bağışla', cost: 0.1, apply: (P) => { P.satAll(2); P.count.charity = (P.count.charity || 0) + 1; P.toast('Bağışınız için teşekkür ettiler. Havalimanının itibarı arttı.'); } },
      { label: 'Bu sefer değil', apply: () => {} },
    ],
  },
];

// ---------------------------------------------------------------- anıt yapıların görüntüsü (çitin güney dışında)
const SLOT_Z = (MAP_H * CELL) / 2 + 330;
const slotX = (k) => -1650 + k * 550;

export class Landmarks {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.items = {};
    this.mats = null;
    this.museumKey = '';
  }

  material() {
    if (this.mats) return this.mats;
    const { day, night } = facadeTextures();
    const fac = (rep) => {
      const d = day.clone(), n = night.clone();
      d.repeat.set(rep[0], rep[1]);
      n.repeat.set(rep[0], rep[1]);
      d.needsUpdate = n.needsUpdate = true;
      const m = new THREE.MeshStandardMaterial({ map: d, emissiveMap: n, emissive: new THREE.Color(1, 0.9, 0.7), emissiveIntensity: 0, roughness: 0.7 });
      return m;
    };
    this.mats = {
      hotel: fac([3, 6]),
      office: fac([6, 2]),
      metal: new THREE.MeshStandardMaterial({ color: 0xb7bec6, roughness: 0.45, metalness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.8 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x5d89a8, roughness: 0.08, metalness: 0.5, envMapIntensity: 1.6 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffcf5a, roughness: 0.28, metalness: 0.75, emissive: 0x3a2600, envMapIntensity: 1.6 }),
      scaffold: new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.6, wireframe: true }),
      crane: new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.5 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xd2d6db, roughness: 0.5 }),
      train: new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.35, metalness: 0.3 }),
    };
    this.windowMats = [this.mats.hotel, this.mats.office];
    return this.mats;
  }

  box(w, h, d, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // tamamlanmış yapı
  build(id) {
    const M = this.material();
    const g = new THREE.Group();
    const B = (...a) => g.add(this.box(...a));
    if (id === 'hotel') {
      B(70, 14, 50, M.office);
      B(34, 120, 34, M.hotel, 0, 14, 0);
      B(36, 4, 36, M.dark, 0, 134, 0);
    } else if (id === 'cargo') {
      B(220, 22, 70, M.metal, 0, 0, -40);
      for (let k = 0; k < 8; k++) B(12, 9, 4, M.dark, -90 + k * 25, 0, -3);
      B(240, 0.6, 110, M.concrete, 0, 0, 60);
    } else if (id === 'mro') {
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, 170, 24, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), M.metal);
      roof.position.set(0, 0, 0);
      roof.material.side = THREE.DoubleSide;
      roof.castShadow = true;
      g.add(roof);
      B(170, 0.6, 130, M.concrete, 0, 0, 40);
    } else if (id === 'metro') {
      B(110, 16, 34, M.glass, 0, 9, 0);
      B(120, 3, 40, M.dark, 0, 25, 0);
      for (let k = -6; k <= 6; k++) B(3, 9, 3, M.concrete, k * 45, 0, 30);
      B(600, 2, 9, M.rail, 0, 9, 30);
      const train = new THREE.Group();
      for (let k = 0; k < 4; k++) train.add(this.box(22, 4.2, 3.6, M.train, k * 23 - 34, 11, 30));
      g.add(train);
      g.userData.train = train;
    } else if (id === 'museum') {
      B(90, 18, 50, M.glass, 0, 0, -50);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
      dome.position.set(0, 18, -50);
      g.add(dome);
      B(420, 0.5, 120, M.concrete, 0, 0, 40);
      g.userData.display = new THREE.Group();
      g.add(g.userData.display);
    } else if (id === 'expo') {
      B(200, 20, 90, M.office);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 210, 20, 1, true, -0.7, 1.4).rotateZ(Math.PI / 2), M.metal);
      roof.position.set(0, -38, 0);
      roof.material.side = THREE.DoubleSide;
      g.add(roof);
      for (let k = 0; k < 6; k++) B(0.6, 16, 0.6, M.metal, -60 + k * 24, 0, 60);
    } else if (id === 'gold') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 300, 16).translate(0, 150, 0), M.gold);
      shaft.castShadow = true;
      g.add(shaft);
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(24, 16, 26, 20).translate(0, 300, 0), M.gold);
      g.add(cab);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(24.5, 24.5, 9, 20).translate(0, 306, 0), M.glass);
      g.add(glass);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 10).translate(0, 343, 0), M.gold);
      g.add(spire);
      B(60, 8, 60, M.concrete);
    }
    return g;
  }

  // inşaat: iskele ve vinç; ilerlemeyle yükselir
  scaffold() {
    const M = this.material();
    const g = new THREE.Group();
    const sc = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 60).translate(0, 0.5, 0), M.scaffold);
    g.add(sc);
    g.userData.sc = sc;
    const mast = this.box(3, 110, 3, M.crane, 50, 0, 0);
    const jib = this.box(90, 2.5, 2.5, M.crane, 30, 108, 0);
    g.add(mast, jib);
    g.add(this.box(90, 0.6, 70, M.concrete));
    return g;
  }

  // her çeyrek saniyede çağrılır; yalnızca durum değişince yeniden kurar
  // owned: [{ id, span }]; loadModel(id) -> Promise<{ scene }>
  sync(P, time, owned, loadModel) {
    PROJECTS.forEach((pr, k) => {
      const st = P.proj[pr.id];
      const want = !st ? '' : st.done ? 'done' : 'build';
      let it = this.items[pr.id];
      if (!it || it.state !== want) {
        if (it) this.root.remove(it.obj);
        it = null;
        if (want) {
          const obj = want === 'done' ? this.build(pr.id) : this.scaffold();
          obj.position.set(slotX(k), 0, SLOT_Z);
          this.root.add(obj);
          it = { state: want, obj };
        }
        this.items[pr.id] = it;
      }
      if (it && want === 'build') {
        const f = Math.max(0.02, Math.min(1, (time - st.start) / (st.end - st.start)));
        it.obj.userData.sc.scale.y = 8 + f * 90;
      }
    });
    // metro treni gidip gelir
    const m = this.items.metro;
    if (m && m.state === 'done' && m.obj.userData.train) m.obj.userData.train.position.x = Math.sin(performance.now() / 9000) * 230;
    // müzede sergilenen uçaklar
    const mu = this.items.museum;
    if (mu && mu.state === 'done') {
      const key = owned.map((o) => o.id).join(',');
      if (key !== this.museumKey) {
        this.museumKey = key;
        const disp = mu.obj.userData.display;
        disp.clear();
        let x = -190;
        for (const { id, span } of owned) {
          const slot = x;
          loadModel(id).then((info) => {
            if (!info || this.museumKey !== key) return;
            const m2 = info.scene.clone(true);
            const box = new THREE.Box3().setFromObject(m2);
            const w = box.max.x - box.min.x;
            m2.position.set(slot + span / 2, -box.min.y + 0.3, 40);
            void w;
            m2.rotation.y = Math.PI;
            m2.traverse((o) => o.isMesh && (o.castShadow = true));
            disp.add(m2);
          });
          x += span + 12;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- mükemmellik
export function perfection(P) {
  const E = P.E;
  const ups = P.upgradesDone();
  const parts = [
    { name: '10. seviye', cur: Math.min(P.level, 10), max: 10, w: 15 },
    { name: 'Başarımlar', cur: P.achDone(), max: P.achTotal(), w: 20 },
    { name: 'Hangardaki uçaklar', cur: (P.hangar || []).length, max: HANGAR.length, w: 15 },
    { name: 'Anıt projeler', cur: PROJECTS.filter((p) => P.proj[p.id] && P.proj[p.id].done).length, max: PROJECTS.length, w: 20 },
    { name: 'Anlaşma yapılan havayolları', cur: P.everAir.length, max: AIRLINES.length, w: 10 },
    { name: 'Yükseltme kademeleri', cur: ups[0], max: ups[1], w: 10 },
    { name: 'Haftalık sıralamada 1.', cur: P.bestRank === 1 ? 1 : 0, max: 1, w: 5 },
    { name: '5 yıldız', cur: E.rating() >= 5 || P.ach.star5 ? 1 : 0, max: 1, w: 5 },
  ];
  const pct = parts.reduce((s, p) => s + (Math.min(p.cur, p.max) / p.max) * p.w, 0);
  return { pct: Math.floor(pct * 10) / 10, parts };
}
export { money, moneyShort };
