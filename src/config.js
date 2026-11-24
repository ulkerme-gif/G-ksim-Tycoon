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
  S: { size: 3, name: 'Dar gövde park yeri', short: 'Dar', fits: ['narrow'], cost: 'standS' },
  L: { size: 5, name: 'Geniş gövde park yeri', short: 'Geniş', fits: ['narrow', 'wide'], cost: 'standL' },
};

// uçak tipleri (ölçüler metre; hızlar gerçek zaman m/s, 1x hızda)
export const AIRCRAFT = {
  narrow: {
    name: 'Dar gövde', len: 37.6, span: 35.8, dia: 3.95, tail: 11.8,
    seats: 180, minRunway: 1600, turnMin: 40, landingFee: 45_000,
    vApp: 70, vTouch: 66, vRot: 72, accel: 2.7, decel: 3.3, rMin: 28,
    doorFromNose: 6.5, gearZ: 1.6,
  },
  wide: {
    name: 'Geniş gövde', len: 73.9, span: 64.8, dia: 6.2, tail: 18.5,
    seats: 360, minRunway: 2400, turnMin: 70, landingFee: 120_000,
    vApp: 75, vTouch: 72, vRot: 82, accel: 2.3, decel: 2.9, rMin: 42,
    doorFromNose: 8.5, gearZ: 2.2,
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
  { id: 'LH', name: 'Lale Hava', code: 'LL', tail: '#d6336c', stripe: '#8e1b46', type: 'narrow', minStars: 0, perDay: [3, 4], load: 0.82 },
  { id: 'BG', name: 'Boğaz Air', code: 'BZ', tail: '#1f6fd1', stripe: '#0c3d7a', type: 'narrow', minStars: 0, perDay: [2, 4], load: 0.78 },
  { id: 'KP', name: 'Kapadokya Airlines', code: 'KP', tail: '#e8892b', stripe: '#9a4d0b', type: 'narrow', minStars: 1.5, perDay: [3, 5], load: 0.85 },
  { id: 'EG', name: 'Ege Kanatları', code: 'EK', tail: '#14a5a5', stripe: '#0b5c5c', type: 'narrow', minStars: 2, perDay: [4, 6], load: 0.8 },
  { id: 'TR', name: 'Toros Jet', code: 'TJ', tail: '#2f9e44', stripe: '#16502a', type: 'narrow', minStars: 2.5, perDay: [5, 7], load: 0.84 },
  { id: 'GA', name: 'Galata Airways', code: 'GW', tail: '#7048e8', stripe: '#3b228a', type: 'wide', minStars: 3, perDay: [1, 2], load: 0.86, needsHangar: true },
  { id: 'HT', name: 'Hitit Hava Yolları', code: 'HH', tail: '#c92a2a', stripe: '#6e1414', type: 'wide', minStars: 3.5, perDay: [2, 3], load: 0.88, needsHangar: true },
  { id: 'KD', name: 'Karadeniz Jet', code: 'KJ', tail: '#364fc7', stripe: '#1b2a6b', type: 'narrow', minStars: 3, perDay: [6, 8], load: 0.86 },
  { id: 'TV', name: 'Truva Air', code: 'TV', tail: '#f08c00', stripe: '#7a4600', type: 'wide', minStars: 4, perDay: [2, 4], load: 0.9, needsHangar: true },
];

export const CITIES = ['Londra', 'Berlin', 'Paris', 'Roma', 'Madrid', 'Viyana', 'Atina', 'Bakü', 'Tiflis', 'Dubai', 'Doha', 'Kahire', 'Amsterdam', 'Münih', 'Zürih',
  'Varşova', 'Budapeşte', 'Prag', 'Kiev', 'Moskova', 'Tahran', 'Bağdat', 'Erbil', 'Antalya', 'İzmir', 'Ankara', 'Trabzon', 'Erzurum', 'Van', 'Diyarbakır',
  'Kayseri', 'Bodrum', 'Dalaman', 'Gaziantep', 'Samsun', 'New York', 'Tokyo', 'Singapur', 'Bangkok', 'Seul', 'Pekin', 'Toronto', 'Johannesburg', 'Nairobi', 'Lagos'];
