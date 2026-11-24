// İnşaat araçları: önizleme, doğrulama, maliyet, yerleştirme, yıkım, seçim
import * as THREE from 'three';
import { CELL, G, COSTS, RUNWAYS, STANDS, BUILDINGS, REFUND } from './config.js';
import { cellX, cellZ, toCellI, toCellJ, ROT_H, money } from './util.js';

export const TOOLS = [
  { id: 'select', name: 'Seç', key: 'Escape' },
  { id: 'runway', name: 'Pist', key: 'Digit1' },
  { id: 'taxi', name: 'Taksi yolu', key: 'Digit2', paint: 'line', cost: COSTS.taxi },
  { id: 'apron', name: 'Apron', key: 'Digit3', paint: 'area', cost: COSTS.apron },
  { id: 'standS', name: 'Park yeri · dar', key: 'Digit4', cost: COSTS.standS },
  { id: 'standL', name: 'Park yeri · geniş', key: 'Digit5', cost: COSTS.standL },
  { id: 'jetway', name: 'Yolcu köprüsü', key: 'Digit6', cost: COSTS.jetway },
  { id: 'terminal', name: 'Terminal', key: 'Digit7', cost: COSTS.terminal },
  { id: 'tower', name: 'Kule', key: 'Digit8', cost: COSTS.tower },
  { id: 'hangar', name: 'Hangar', key: 'Digit9', cost: COSTS.hangar },
  { id: 'bulldoze', name: 'Yık', key: 'Delete', paint: 'area' },
];

export class Builder {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.tool = 'select';
    this.rot = 0;
    this.rwLen = 0;
    this.manualRot = false;
    this.hover = null;
    this.drag = null;
    this.pending = null;
    this.preview = new THREE.Group();
    this.preview.renderOrder = 10;
    game.scene.add(this.preview);
    this.mOk = new THREE.MeshBasicMaterial({ color: 0x51cf66, transparent: true, opacity: 0.38, depthWrite: false });
    this.mBad = new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.42, depthWrite: false });
    this.mDel = new THREE.MeshBasicMaterial({ color: 0xff922b, transparent: true, opacity: 0.45, depthWrite: false });
    this.cellGeo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96).rotateX(-Math.PI / 2);
  }

  get def() {
    return TOOLS.find((t) => t.id === this.tool);
  }
  isPaint() {
    return !!this.def.paint;
  }

  setTool(id) {
    if (id !== this.tool) this.rot = 0;
    this.tool = id;
    this.manualRot = false;
    this.pending = null;
    this.drag = null;
    if (id === 'runway') this.rot = this.rot % 2;
    this.clearPreview();
    this.world.gridOverlay.material.uniforms.opacity.value = id === 'select' ? 0 : 1;
    this.game.ui.onTool(id);
    if (this.hover) this.refresh();
  }

  rotate() {
    this.rot = this.tool === 'runway' ? (this.rot + 1) % 2 : (this.rot + 1) % 4;
    this.manualRot = true;
    this.refresh();
  }

  clearPreview() {
    for (const c of [...this.preview.children]) this.preview.remove(c);
    this.game.ui.tip(null);
  }

  cellAt(x, y) {
    const p = this.game.rig.ground(x, y);
    if (!p) return null;
    return [toCellI(p.x), toCellJ(p.z)];
  }

  // ---------------------------------------------------------------- nesne türü ve ayarları
  spec() {
    const t = this.tool;
    if (t === 'runway') return { kind: 'runway', extra: { len: RUNWAYS[this.rwLen].len }, cost: RUNWAYS[this.rwLen].cost };
    if (t === 'standS' || t === 'standL') return { kind: 'stand', extra: { size: t === 'standS' ? 'S' : 'L' }, cost: COSTS[t] };
    if (BUILDINGS[t]) return { kind: t, extra: {}, cost: COSTS[t] };
    return null;
  }

  anchor(spec, hi, hj, rot) {
    const [w, h] = this.world.footprint(spec.kind, rot, spec.extra);
    return [hi - Math.floor(w / 2), hj - Math.floor(h / 2), w, h];
  }

  autoRot(spec, hi, hj) {
    // park yeri: önce terminale bakan ve arkası yola bağlı yön, sonra yalnızca arkası yola bağlı yön
    if (spec.kind !== 'stand' || this.manualRot) return this.rot;
    const W = this.world;
    let best = null;
    for (let r = 0; r < 4; r++) {
      const [i0, j0] = this.anchor(spec, hi, hj, r);
      const [w, h] = W.footprint('stand', r, spec.extra);
      const fake = { kind: 'stand', i: i0, j: j0, w, h, rot: r, size: spec.extra.size, cx: cellX(i0) + ((w - 1) * CELL) / 2, cz: cellZ(j0) + ((h - 1) * CELL) / 2 };
      const [ei, ej] = W.standFrame(fake).entry;
      const t = W.g(ei, ej);
      const paved = t === G.TAXI || t === G.APRON;
      const score = (W.terminalInFront(fake) ? 2 : 0) + (paved ? 1 : 0);
      if (score && (!best || score > best.score)) best = { r, score };
    }
    return best ? best.r : this.rot;
  }

  // ---------------------------------------------------------------- önizleme
  refresh() {
    const h = this.pending || this.hover;
    this.clearPreview();
    if (!h) return;
    const [hi, hj] = h;
    if (this.drag && this.isPaint()) return this.previewPaint();
    if (this.isPaint()) return this.previewPaint([hi, hj], [hi, hj]);
    if (this.tool === 'jetway') return this.previewJetway(hi, hj);
    const spec = this.spec();
    if (!spec) return;
    const rot = this.autoRot(spec, hi, hj);
    const [i0, j0, w, hh] = this.anchor(spec, hi, hj, rot);
    const err = this.world.canPlace(spec.kind, i0, j0, rot, spec.extra);
    const box = new THREE.Mesh(new THREE.PlaneGeometry(w * CELL, hh * CELL).rotateX(-Math.PI / 2), err ? this.mBad : this.mOk);
    box.position.set(cellX(i0) + ((w - 1) * CELL) / 2, 0.5, cellZ(j0) + ((hh - 1) * CELL) / 2);
    this.preview.add(box);
    // yön oku
    if (spec.kind !== 'tower') {
      const len = Math.min(w, hh) * CELL * 0.45;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(len * 0.35, len, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
      arrow.position.copy(box.position).setY(0.8);
      arrow.rotation.y = -(spec.kind === 'runway' ? ROT_H[rot === 0 ? 0 : 1] : ROT_H[rot]);
      this.preview.add(arrow);
    }
    let extra = '';
    if (spec.kind === 'stand') {
      const fake = { kind: 'stand', i: i0, j: j0, w, h: hh, rot, size: spec.extra.size, cx: box.position.x, cz: box.position.z };
      extra = this.world.terminalInFront(fake) ? 'Terminale bakıyor: köprü kurulabilir' : 'Uzak park yeri (yolcular otobüsle)';
    }
    this.game.ui.tip(`${this.def.name}${spec.kind === 'runway' ? ' ' + RUNWAYS[this.rwLen].label : ''} · ${money(spec.cost)}`, err || extra, !!err);
    this.cur = { spec, i0, j0, rot, err };
  }

  previewJetway(hi, hj) {
    const o = this.world.objAt(hi, hj);
    let err = null;
    if (!o || o.kind !== 'stand') err = 'Köprü eklemek için bir park yerine dokunun';
    else if (o.jetway) err = 'Bu park yerinde zaten köprü var';
    else if (!this.world.terminalInFront(o)) err = 'Park yerinin ön kenarı terminale bitişik olmalı (en fazla 1 kare boşluk)';
    if (o && o.kind === 'stand') {
      const box = new THREE.Mesh(new THREE.PlaneGeometry(o.w * CELL, o.h * CELL).rotateX(-Math.PI / 2), err ? this.mBad : this.mOk);
      box.position.set(o.cx, 0.5, o.cz);
      this.preview.add(box);
    }
    this.game.ui.tip(`Yolcu köprüsü · ${money(COSTS.jetway)}`, err, !!err);
    this.cur = { jetwayStand: o, err };
  }

  paintCells(a, b) {
    const [ai, aj] = a, [bi, bj] = b;
    const out = [];
    if (this.def.paint === 'line') {
      // baskın eksende düz çizgi
      if (Math.abs(bi - ai) >= Math.abs(bj - aj)) for (let i = Math.min(ai, bi); i <= Math.max(ai, bi); i++) out.push([i, aj]);
      else for (let j = Math.min(aj, bj); j <= Math.max(aj, bj); j++) out.push([ai, j]);
    } else {
      for (let j = Math.min(aj, bj); j <= Math.max(aj, bj); j++) for (let i = Math.min(ai, bi); i <= Math.max(ai, bi); i++) out.push([i, j]);
    }
    return out.slice(0, 4000);
  }

  previewPaint(a, b) {
    a = a || this.drag.a;
    b = b || this.drag.b;
    const cells = this.paintCells(a, b);
    const W = this.world;
    let ok = [], bad = [];
    if (this.tool === 'bulldoze') {
      for (const [i, j] of cells) {
        const t = W.g(i, j);
        if ((t === G.TAXI || t === G.APRON) && W.obj[W.idx(i, j)] < 0) ok.push([i, j]);
      }
      // tek kareye dokunuluyorsa üstündeki yapıyı göster
      if (cells.length === 1) {
        const o = W.objAt(a[0], a[1]);
        if (o) {
          const box = new THREE.Mesh(new THREE.PlaneGeometry(o.w * CELL, o.h * CELL).rotateX(-Math.PI / 2), this.mDel);
          box.position.set(o.cx, 0.6, o.cz);
          this.preview.add(box);
          this.game.ui.tip(`Yık: ${this.objName(o)}`, `İade: ${money(this.objValue(o) * REFUND)}`, false);
          this.cur = { cells: [], delObj: o };
          return;
        }
      }
    } else for (const c of cells) (W.canPaint(c[0], c[1], this.tool === 'taxi' ? G.TAXI : G.APRON) ? ok : bad).push(c);
    const mk = (list, mat) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(this.cellGeo, mat, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([i, j], k) => {
        m.makeTranslation(cellX(i), 0.5, cellZ(j));
        im.setMatrixAt(k, m);
      });
      this.preview.add(im);
    };
    if (this.tool === 'bulldoze') {
      mk(ok, this.mDel);
      this.game.ui.tip(`Yık · ${ok.length} kare`, ok.length ? `İade: ${money(ok.length * this.cellValue(ok) * REFUND)}` : 'Silinecek taksi yolu ya da apron yok', false);
    } else {
      mk(ok, this.mOk);
      mk(bad, this.mBad);
      this.game.ui.tip(`${this.def.name} · ${ok.length} kare · ${money(ok.length * this.def.cost)}`, bad.length ? `${bad.length} kare uygun değil` : null, false);
    }
    this.cur = { cells: ok };
  }

  cellValue(cells) {
    const W = this.world;
    let s = 0;
    for (const [i, j] of cells) s += W.g(i, j) === G.TAXI ? COSTS.taxi : COSTS.apron;
    return s / Math.max(1, cells.length);
  }

  objName(o) {
    if (o.kind === 'runway') return `Pist ${this.world.runwayInfo(o).ends.map((e) => e.name).join('/')}`;
    if (o.kind === 'stand') return `${STANDS[o.size].name} ${o.num}`;
    return BUILDINGS[o.kind].name;
  }
  objValue(o) {
    if (o.kind === 'runway') return RUNWAYS.find((r) => r.len === o.len).cost;
    if (o.kind === 'stand') return COSTS[o.size === 'S' ? 'standS' : 'standL'] + (o.jetway ? COSTS.jetway : 0);
    return COSTS[o.kind];
  }

  // ---------------------------------------------------------------- girdiler
  onHover(x, y) {
    if (this.tool === 'select' || this.pending) return;
    const c = this.cellAt(x, y);
    if (!c) return;
    if (this.hover && c[0] === this.hover[0] && c[1] === this.hover[1]) return;
    this.hover = c;
    this.world.gridOverlay.material.uniforms.hover.value.set(cellX(c[0]), cellZ(c[1]));
    this.refresh();
  }

  onDrag(phase, x, y) {
    const c = this.cellAt(x, y);
    if (phase === 'start' && c) {
      this.drag = { a: c, b: c };
      this.refresh();
    } else if (phase === 'move' && this.drag && c) {
      if (c[0] !== this.drag.b[0] || c[1] !== this.drag.b[1]) {
        this.drag.b = c;
        this.hover = c;
        this.refresh();
      }
    } else if (phase === 'end' && this.drag) {
      this.previewPaint();
      this.commitPaint();
      this.drag = null;
      this.clearPreview();
    } else if (phase === 'cancel') {
      this.drag = null;
      this.clearPreview();
    }
  }

  onTap(x, y, type) {
    if (this.tool === 'select') return this.game.select(x, y);
    const c = this.cellAt(x, y);
    if (!c) return;
    if (this.isPaint()) return;   // boyama sürükleme ile (tek dokunuş da 'end' olarak gelir)
    if (type === 'mouse') {
      this.hover = c;
      this.refresh();
      this.commit();
    } else {
      // dokunmatik: önce önizle, alttaki çubuktan onayla
      this.pending = c;
      this.hover = c;
      this.refresh();
      this.game.ui.confirmBar(true);
    }
  }

  confirm() {
    this.commit();
    this.pending = null;
    this.game.ui.confirmBar(false);
  }
  cancel() {
    this.pending = null;
    this.clearPreview();
    this.game.ui.confirmBar(false);
  }

  commitPaint() {
    const W = this.world, E = this.game.econ;
    const cur = this.cur;
    if (!cur) return;
    if (this.tool === 'bulldoze') {
      if (cur.delObj) return this.askDelete(cur.delObj);
      if (!cur.cells.length) return;
      const val = cur.cells.length * this.cellValue(cur.cells) * REFUND;
      W.erase(cur.cells);
      E.refund(val);
      this.game.changed();
      return;
    }
    if (!cur.cells.length) return;
    const cost = cur.cells.length * this.def.cost;
    if (!E.spend(cost)) return;
    W.paint(cur.cells, this.tool === 'taxi' ? G.TAXI : G.APRON);
    this.game.changed();
  }

  commit() {
    const cur = this.cur;
    if (!cur) return;
    const W = this.world, E = this.game.econ;
    if (cur.err) {
      this.game.ui.toast(cur.err, 'bad');
      return;
    }
    if (this.tool === 'jetway') {
      const o = cur.jetwayStand;
      if (!E.spend(COSTS.jetway)) return;
      o.jetway = true;
      W.attachJetway(o);
      this.game.changed();
      this.refresh();
      return;
    }
    const { spec, i0, j0, rot } = cur;
    if (!E.spend(spec.cost)) return;
    const o = W.add(spec.kind, i0, j0, rot, { ...spec.extra });
    if (o.kind === 'runway') this.game.econ.setActive(o);
    this.game.changed();
    this.hover = null;
    this.clearPreview();
  }

  askDelete(o) {
    const sim = this.game.sim;
    if (o.kind === 'stand' && (o.flight || o.departing)) return this.game.ui.toast('Park yeri dolu, uçak ayrılınca yıkabilirsiniz', 'bad');
    if (o.kind === 'runway' && sim.activeOnRunway(o)) return this.game.ui.toast('Bu pisti kullanan uçaklar var', 'bad');
    const refund = this.objValue(o) * REFUND;
    this.game.ui.ask(`${this.objName(o)} yıkılsın mı?`, `İnşaat bedelinin %${Math.round(REFUND * 100)}'i iade edilir: ${money(refund)}`, 'Yık', () => this.removeObj(o, refund));
  }

  removeObj(o, refund) {
    const W = this.world;
    if (o.kind === 'terminal') {
      // bu terminale bağlı köprüleri kaldır
      for (const s of W.list('stand')) {
        if (s.jetway && W.terminalInFront(s) && W.terminalInFront(s).terminal === o) {
          W.root.remove(s.jw.root);
          s.jw = null;
          s.jetway = false;
          refund += COSTS.jetway * REFUND;
        }
      }
    }
    W.remove(o);
    this.game.econ.refund(refund);
    this.game.changed();
    this.clearPreview();
  }
}
