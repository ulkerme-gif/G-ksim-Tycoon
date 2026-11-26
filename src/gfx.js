// Grafik kalitesi ve pil: çözünürlük, kare hızı, gölge güncelleme sıklığı
export const GFX = {
  eco: {
    key: 'eco', name: 'Pil tasarrufu', dpr: 1, fps: 30, idleFps: 2, shadows: false, shadowSize: 1024, shadowHz: 0, aa: false, clouds: false, soft: false,
    desc: 'Düşük çözünürlük, saniyede en çok 30 kare, gölge ve bulut yok. Pil en uzun bu ayarda dayanır.',
  },
  balanced: {
    key: 'balanced', name: 'Dengeli', dpr: 1.5, fps: 30, idleFps: 4, shadows: true, shadowSize: 1024, shadowHz: 12, aa: true, clouds: true, soft: false,
    desc: 'Orta çözünürlük, saniyede en çok 30 kare, gölgeler saniyede 12 kez güncellenir. iPad için önerilir.',
  },
  high: {
    key: 'high', name: 'Yüksek', dpr: 2, fps: 60, idleFps: 10, shadows: true, shadowSize: 2048, shadowHz: 60, aa: true, clouds: true, soft: true,
    desc: 'Tam çözünürlük, saniyede 60 kare, yumuşak gölgeler. Bilgisayar ya da şarjdaki cihaz için.',
  },
};

const KEY = 'havalimani.gfx';

export function loadGfx() {
  try {
    const k = localStorage.getItem(KEY);
    if (GFX[k]) return k;
  } catch (e) {
    /* yok */
  }
  const touch = navigator.maxTouchPoints > 1 || /iPad|iPhone|Android/i.test(navigator.userAgent);
  return touch ? 'balanced' : 'high';
}

export function saveGfx(k) {
  try {
    localStorage.setItem(KEY, k);
  } catch (e) {
    /* yok */
  }
}
