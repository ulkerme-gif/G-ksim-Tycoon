// Gökyüzü kubbesi: renk geçişi, güneş parıltısı, kayan bulutlar ve gece yıldızları.
// En son çizilir (derinlik = uzak düzlem), böylece görünmeyen gök pikselleri hesaplanmaz.
import * as THREE from 'three';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform vec3 cloudCol;
uniform float cover;
uniform float time;
uniform float night;
uniform float clouds;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.42));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 900.0) * 8.0 + pow(sd, 12.0) * 0.18 + pow(sd, 3.0) * 0.05) * (1.0 - cover * 0.7);
  if (night > 0.01 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.35) * 260.0;
    float st = step(0.9965, hash(floor(sp)));
    col += vec3(st) * night * 0.9 * smoothstep(0.02, 0.35, d.y) * (1.0 - cover);
  }
  if (clouds > 0.5 && d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.08) * 0.9 + vec2(time * 0.0035, time * 0.0016);
    float n = fbm(uv);
    float c = smoothstep(1.0 - cover, 1.0 - cover + 0.28, n) * smoothstep(0.01, 0.16, d.y);
    float shade = 0.75 + 0.25 * smoothstep(0.3, 0.8, n);
    col = mix(col, cloudCol * shade + sunCol * pow(sd, 6.0) * 0.25, c * 0.9);
  }
  col = mix(horizon, col, smoothstep(-0.02, 0.06, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SkyDome {
  constructor(scene) {
    this.u = {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      cloudCol: { value: new THREE.Color(1, 1, 1) },
      cover: { value: 0.35 },
      time: { value: 0 },
      night: { value: 0 },
      clouds: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth, fog: false });
    mat.toneMapped = true;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;   // opak nesnelerden sonra: örtülen pikseller hesaplanmaz
    scene.add(this.mesh);
  }

  setClouds(on) {
    this.u.clouds.value = on ? 1 : 0;
  }

  // horizon: sis rengiyle aynı (ufukta birleşsin); day 0..1
  update(camera, horizon, day, sunDir, sunColor, cover, weatherGrey, dt) {
    this.mesh.position.copy(camera.position);
    const u = this.u;
    u.horizon.value.copy(horizon);
    // tepe rengi: gündüz koyu mavi, gece lacivert; kötü havada ufukla aynı gri
    u.zenith.value.setRGB(0.006 + 0.045 * day, 0.01 + 0.14 * day, 0.035 + 0.5 * day).lerp(horizon, weatherGrey * 0.85);
    u.sunDir.value.copy(sunDir);
    u.sunCol.value.copy(sunColor).multiplyScalar(day > 0.05 ? 1 : 0);
    u.night.value = Math.max(0, 1 - day * 2.2);
    u.cover.value = cover;
    const g = 0.04 + 0.9 * day;
    u.cloudCol.value.setRGB(g, g, g * 1.03).lerp(horizon, 0.25 + weatherGrey * 0.4);
    u.time.value += dt;
  }
}
