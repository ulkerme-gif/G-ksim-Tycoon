// Hava görselleri: yağmur çizgileri ve şimşek (sis sahne sisiyle yapılır)
import * as THREE from 'three';

const N = 2600;
const BOX = 700;

export class Rain {
  constructor(scene) {
    const pos = new Float32Array(N * 6);
    this.seed = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      this.seed[k * 3] = Math.random();
      this.seed[k * 3 + 1] = Math.random();
      this.seed[k * 3 + 2] = Math.random();
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaebfd0, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.t = 0;
    this.flash = 0;
    this.nextFlash = 3;
  }

  // amount 0..1; center: kameranın önündeki nokta; size: kutu ölçeği
  update(dt, amount, center, scale) {
    this.lines.visible = amount > 0.02;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (!this.lines.visible) return 0;
    this.t += dt;
    const S = BOX * scale, H = S * 0.6;
    const fall = 90 * scale;
    const len = 9 * scale;
    const p = this.geo.attributes.position.array;
    const sd = this.seed;
    for (let k = 0; k < N; k++) {
      const x = center.x + (sd[k * 3] - 0.5) * S;
      const z = center.z + (sd[k * 3 + 1] - 0.5) * S;
      const y = H - ((sd[k * 3 + 2] * H + this.t * fall) % H);
      const o = k * 6;
      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = z;
      p[o + 3] = x + 1.2 * scale;
      p[o + 4] = y + len;
      p[o + 5] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mat.opacity = 0.38 * amount;
    // şimşek
    this.nextFlash -= dt;
    if (this.nextFlash <= 0 && amount > 0.6) {
      this.flash = 1;
      this.nextFlash = 3 + Math.random() * 9;
    }
    return this.flash;
  }
}
