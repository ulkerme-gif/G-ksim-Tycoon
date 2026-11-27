// Havalimanı Tycoon — oyun sabitleri ve dengeleme değerleri

export const CELL = 16;            // bir kare = 16 m
export const MAP_W = 240;          // 3,84 km
export const MAP_H = 170;          // 2,72 km

// zemin türleri
export const G = { GRASS: 0, RUNWAY: 1, TAXI: 2, APRON: 3 };

// zaman: 1x hızda 1 gerçek saniye = 20 oyun saniyesi (1 oyun günü = 72 dakika, 8x hızda 9 dakika)
export const TIME_SCALE = 20;
export const SPEEDS = [0, 1, 2, 4, 8];

export const START_MONEY = 25_000_000;
export const REFUND = 0.25;

export const RUNWAYS = [
  { len: 100, label: '1.600 m', cost: 6_000_000, daily: 45_000 },
  { len: 150, label: '2.400 m', cost: 9_500_000, daily: 65_000 },
  { len: 200, label: '3.200 m', cost: 13_000_000, daily: 85_000 },
];

export const COSTS = {
  taxi: 25_000,     // kare başına
  apron: 15_000,
  standS: 250_000,
  standL: 450_000,
  jetway: 900_000,
  terminal: 7_500_000,
  tower: 2_500_000,
  hangar: 3_000_000,
};

export const DAILY = {
  taxi: 150,
  apron: 80,
  standS: 4_000,
  standL: 7_000,
  jetway: 9_000,
  terminal: 120_000,
  tower: 40_000,
  hangar: 30_000,
};

export const BUILDINGS = {
  terminal: { w: 10, h: 9, name: 'Terminal', capacity: 1100, desc: 'Yolcu kapasitesi: saatte 1.100 yolcu. Köprülü park yerleri terminalin kenarına kurulur.' },
  tower: { w: 2, h: 2, name: 'Kontrol kulesi', desc: 'Uçuşların başlaması için en az bir kule gerekir.' },
  hangar: { w: 5, h: 4, name: 'Bakım hangarı', desc: 'Günlük bakım geliri sağlar, geniş gövdeli uçak işleten havayolları için gereklidir.' },
};

export const STANDS = {
  S: { size: 3, name: 'Dar gövde park yeri', short: 'Dar', fits: ['regional', 'narrow'], cost: 'standS' },
  L: { size: 5, name: 'Geniş gövde park yeri', short: 'Geniş', fits: ['regional', 'narrow', 'wide'], cost: 'standL' },
};

// uçak tipleri (ölçüler metre; hızlar gerçek zaman m/s, 1x hızda)
export const AIRCRAFT = {
  regional: {
    name: 'Bölgesel jet', model: 'e170', len: 29.8, span: 25.7, dia: 3.3, tail: 9.8,
    seats: 78, minRunway: 1400, turnMin: 30, landingFee: 25_000,
    vApp: 66, vTouch: 62, vRot: 66, accel: 2.8, decel: 3.4, rMin: 24,
    doorFromNose: 3.9, gearZ: 1.3, sill: 2.0,
    lights: { wingY: 3.25, wingZ: 3.6, wingX: 12.5, top: 4.85, noseZ: -11.1, noseY: 1.6 },
  },
  narrow: {
    name: 'Dar gövde', len: 37.6, span: 35.8, dia: 3.95, tail: 11.8,
    seats: 180, minRunway: 1600, turnMin: 40, landingFee: 45_000,
    vApp: 70, vTouch: 66, vRot: 72, accel: 2.7, decel: 3.3, rMin: 28,
    doorFromNose: 6.5, gearZ: 1.6, sill: 3.3,
  },
  wide: {
    name: 'Geniş gövde', len: 73.9, span: 64.8, dia: 6.2, tail: 18.5,
    seats: 360, minRunway: 2400, turnMin: 70, landingFee: 120_000,
    vApp: 75, vTouch: 72, vRot: 82, accel: 2.3, decel: 2.9, rMin: 42,
    doorFromNose: 8.5, gearZ: 2.2, sill: 4.8,
  },
};

export const FEES = {
  paxDep: 600,      // giden yolcu başı
  paxArr: 200,      // gelen yolcu başı
  retail: 120,      // terminal içi harcama, yolcu başı
  jetway: 10_000,   // köprü kullanımı
  hangarPerFlight: 6_000,
};

export const TAXI_SPEED = 16;     // m/s
export const TAXI_TURN_SPEED = 6;

// havayolları (kurgusal)
export const AIRLINES = [
  { id: 'LH', name: 'Lale Hava', code: 'LL', tail: '#d6336c', stripe: '#8e1b46', type: 'regional', minStars: 0, perDay: [4, 6], load: 0.84 },
  { id: 'BG', name: 'Boğaz Air', code: 'BZ', tail: '#1f6fd1', stripe: '#0c3d7a', type: 'regional', minStars: 0, perDay: [3, 5], load: 0.8 },
  { id: 'KP', name: 'Kapadokya Airlines', code: 'KP', tail: '#e8892b', stripe: '#9a4d0b', type: 'narrow', minStars: 1.5, perDay: [3, 5], load: 0.85 },
  { id: 'EG', name: 'Ege Kanatları', code: 'EK', tail: '#14a5a5', stripe: '#0b5c5c', type: 'narrow', minStars: 2, perDay: [4, 6], load: 0.8 },
  { id: 'TR', name: 'Toros Jet', code: 'TJ', tail: '#2f9e44', stripe: '#16502a', type: 'narrow', minStars: 2.5, perDay: [5, 7], load: 0.84 },
  { id: 'GA', name: 'Galata Airways', code: 'GW', tail: '#7048e8', stripe: '#3b228a', type: 'wide', minStars: 3, perDay: [1, 2], load: 0.86, needsHangar: true },
  { id: 'HT', name: 'Hitit Hava Yolları', code: 'HH', tail: '#c92a2a', stripe: '#6e1414', type: 'wide', minStars: 3.5, perDay: [2, 3], load: 0.88, needsHangar: true },
  { id: 'KD', name: 'Karadeniz Jet', code: 'KJ', tail: '#364fc7', stripe: '#1b2a6b', type: 'narrow', minStars: 3, perDay: [6, 8], load: 0.86 },
  { id: 'TV', name: 'Truva Air', code: 'TV', tail: '#f08c00', stripe: '#7a4600', type: 'wide', minStars: 4, perDay: [2, 4], load: 0.9, needsHangar: true },
  // seviye ile açılanlar
  { id: 'MJ', name: 'Marmara Jet', code: 'MJ', tail: '#0b7285', stripe: '#063f4a', type: 'narrow', minStars: 3, minLevel: 4, perDay: [6, 9], load: 0.87 },
  { id: 'AK', name: 'Akdeniz Kanatları', code: 'AK', tail: '#fab005', stripe: '#a35f00', type: 'narrow', minStars: 3.5, minLevel: 5, perDay: [7, 10], load: 0.9 },
  { id: 'AV', name: 'Avrasya Airlines', code: 'AV', tail: '#212529', stripe: '#c9a227', type: 'wide', minStars: 4, minLevel: 6, perDay: [3, 5], load: 0.88, needsHangar: true },
  { id: 'IY', name: 'İpek Yolu Hava', code: 'IY', tail: '#a61e4d', stripe: '#5c0f29', type: 'wide', minStars: 4, minLevel: 7, perDay: [4, 6], load: 0.9, needsHangar: true },
  { id: 'KY', name: 'Kuzey Yıldızı', code: 'KY', tail: '#74c0fc', stripe: '#1c5d99', type: 'narrow', minStars: 4.5, minLevel: 8, perDay: [9, 12], load: 0.9 },
  { id: 'AN', name: 'Anka Airways', code: 'AN', tail: '#862e9c', stripe: '#4a1356', type: 'wide', minStars: 4.5, minLevel: 9, perDay: [5, 7], load: 0.92, needsHangar: true },
];

// tek seferlik charter uçuşları yapan tur şirketleri (kurgusal)
export const CHARTERS = [
  { id: 'CG', name: 'Güneş Tur Charter', code: 'GT', tail: '#ff922b', stripe: '#c2410c', type: 'narrow', load: 0.97, charter: true },
  { id: 'CM', name: 'Mavi Yolculuk', code: 'MY', tail: '#4dabf7', stripe: '#1864ab', type: 'narrow', load: 0.96, charter: true },
  { id: 'CK', name: 'Kardelen Tur', code: 'KT', tail: '#f1f3f5', stripe: '#c92a2a', type: 'wide', load: 0.95, charter: true },
  { id: 'CR', name: 'Rota Bölgesel Tur', code: 'RT', tail: '#94d82d', stripe: '#2b8a3e', type: 'regional', load: 0.95, charter: true },
];

export const CITIES = ['Londra', 'Berlin', 'Paris', 'Roma', 'Madrid', 'Viyana', 'Atina', 'Bakü', 'Tiflis', 'Dubai', 'Doha', 'Kahire', 'Amsterdam', 'Münih', 'Zürih',
  'Varşova', 'Budapeşte', 'Prag', 'Kiev', 'Moskova', 'Tahran', 'Bağdat', 'Erbil', 'Antalya', 'İzmir', 'Ankara', 'Trabzon', 'Erzurum', 'Van', 'Diyarbakır',
  'Kayseri', 'Bodrum', 'Dalaman', 'Gaziantep', 'Samsun', 'New York', 'Tokyo', 'Singapur', 'Bangkok', 'Seul', 'Pekin', 'Toronto', 'Johannesburg', 'Nairobi', 'Lagos'];

// Uçuş kulübü hangarı: GökSim'deki uçaklar ve fiyatları (sahip olunan uçakla uçulur)
export const HANGAR = [
  { id: 'f16', price: 15_000_000 },
  { id: 'f2', price: 20_000_000 },
  { id: 'f18', price: 35_000_000 },
  { id: 'f15', price: 50_000_000 },
  { id: 'rafale', price: 70_000_000 },
  { id: 'b777', price: 250_000_000 },
  { id: 'f22', price: 400_000_000 },
  { id: 'su57', price: 450_000_000 },
  { id: 'a380', price: 900_000_000 },
  { id: 'sr71', price: 1_500_000_000 },
];
