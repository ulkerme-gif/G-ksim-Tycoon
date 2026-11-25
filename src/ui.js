// Arayüz: üst çubuk, inşaat araçları, paneller, bildirimler, seçim kartı
import { TOOLS } from './build.js';
import { RUNWAYS, AIRCRAFT, STANDS, BUILDINGS, COSTS, AIRLINES } from './config.js';
import { money, moneyShort, hhmm, esc, num } from './util.js';
import { STATUS } from './sim.js';
import { INCOME_NAMES, EXPENSE_NAMES } from './economy.js';

const $ = (s, r = document) => r.querySelector(s);

const ICON = {
  select: '<path d="M6 3l12 9-5.5 1.2L15 19l-2.3 1-2.5-5.6L6 18z"/>',
  runway: '<path d="M9 2h6l1 20H8z"/><path d="M12 4v3M12 10v3M12 16v3" stroke-dasharray="0"/>',
  taxi: '<path d="M4 20c2-6 4-9 8-11s6-4 8-7" fill="none" stroke-width="2.4"/>',
  apron: '<path d="M3 5h18v14H3z"/><path d="M9 5v14M15 5v14M3 12h18"/>',
  standS: '<path d="M12 3v18M5 11l7-2 7 2M9 19l3-1 3 1"/>',
  standL: '<path d="M12 2v20M3 11l9-3 9 3M8 20l4-1.5 4 1.5"/><circle cx="12" cy="12" r="10" fill="none"/>',
  jetway: '<path d="M3 17h5V9h2v4l10-4v4l-10 4v0H3z"/>',
  terminal: '<path d="M3 20V10l9-5 9 5v10z"/><path d="M7 20v-5h10v5M7 11h10"/>',
  tower: '<path d="M10 21l1-12h2l1 12zM7 9h10l-1.5-4h-7z"/>',
  hangar: '<path d="M3 20v-8a9 9 0 0118 0v8z"/><path d="M7 20v-6h10v6"/>',
  bulldoze: '<path d="M5 5l14 14M19 5L5 19"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ''}</svg>`;

export class UI {
  constructor(game) {
    this.game = game;
    this.panel = null;
    this.t = 0;
    this.buildDom();
  }

  buildDom() {
    const tb = $('#tools');
    tb.innerHTML = TOOLS.map((t) => `<button data-tool="${t.id}" title="${esc(t.name)}">${svg(t.id)}<span>${esc(t.name)}</span>${t.cost ? `<small>${moneyShort(t.cost)}${t.paint ? '/kare' : ''}</small>` : ''}</button>`).join('');
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (b) this.game.builder.setTool(this.game.builder.tool === b.dataset.tool && b.dataset.tool !== 'select' ? 'select' : b.dataset.tool);
    });
    $('#speed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]');
      if (b) this.game.setSpeed(+b.dataset.speed);
    });
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-panel]');
      if (b) this.openPanel(this.panel === b.dataset.panel ? null : b.dataset.panel);
    });
    $('#panel-close').addEventListener('click', () => this.openPanel(null));
    $('#opts').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.len) {
        this.game.builder.rwLen = +b.dataset.len;
        this.onTool(this.game.builder.tool);
        this.game.builder.refresh();
      } else if (b.dataset.act === 'rotate') this.game.builder.rotate();
    });
    $('#confirm-ok').addEventListener('click', () => this.game.builder.confirm());
    $('#confirm-cancel').addEventListener('click', () => this.game.builder.cancel());
    $('#confirm-rot').addEventListener('click', () => this.game.builder.rotate());
    $('#menu-btn').addEventListener('click', () => this.menu());
    $('#zoomctl').addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      const R = this.game.rig;
      if (b.dataset.z === 'in') R.zoomStep(1);
      else if (b.dataset.z === 'out') R.zoomStep(-1);
      else R.resetNorth();
    });
    $('#modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') this.closeModal();
    });
    $('#panel-body').addEventListener('click', (e) => this.panelClick(e));
    $('#sel').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') this.select(null);
      if (b.dataset.act === 'follow' && this.sel && this.sel.ac) this.game.followAc(this.sel.ac);
      if (b.dataset.act === 'demolish' && this.sel && this.sel.obj) this.game.builder.askDelete(this.sel.obj);
    });
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,textarea')) return;
      const t = TOOLS.find((x) => x.key === e.code);
      if (t) this.game.builder.setTool(t.id);
      if (e.code === 'KeyR') this.game.builder.rotate();
      if (e.code === 'Space') {
        e.preventDefault();
        this.game.setSpeed(this.game.speed ? 0 : this.game.lastSpeed || 1);
      }
      if (e.code === 'Escape') {
        this.closeModal();
        this.select(null);
      }
    });
    this.onTool('select');
  }

  // ---------------------------------------------------------------- araç seçenekleri
  onTool(id) {
    document.querySelectorAll('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
    const o = $('#opts');
    const B = this.game.builder;
    let h = '';
    if (id === 'runway') h = RUNWAYS.map((r, k) => `<button data-len="${k}" class="${B.rwLen === k ? 'on' : ''}">${r.label}<small>${moneyShort(r.cost)}</small></button>`).join('') + '<button data-act="rotate">Döndür <kbd>R</kbd></button>';
    else if (['standS', 'standL', 'terminal', 'hangar'].includes(id)) h = '<button data-act="rotate">Döndür <kbd>R</kbd></button>';
    const hints = {
      runway: 'Pisti yerleştirmek için tıklayın. Kuzey-güney ya da doğu-batı yönünde kurulur.',
      taxi: 'Sürükleyerek düz taksi yolu çizin. Pist kenarına bağlanan kareler pist çıkışı olur.',
      apron: 'Sürükleyerek alan doldurun. Apron üzerinde uçaklar ve araçlar hareket eder.',
      standS: 'Ok uçağın burnunun bakacağı yönü gösterir. Park yerinin arkasına taksi yolu bağlayın.',
      standL: 'Geniş gövdeli uçaklar için. Dar gövdeliler de kullanabilir.',
      jetway: 'Ön kenarı terminale bitişik bir park yerine dokunun.',
      terminal: 'Yolcuların geçtiği bina. Park yerlerini kenarına dizin.',
      tower: 'Uçuşların başlaması için gerekli.',
      hangar: 'Bakım geliri sağlar; geniş gövde havayolları ister.',
      bulldoze: 'Bir yapıya dokunun ya da taksi yolu/apron üzerinde sürükleyin.',
    };
    o.innerHTML = h + (hints[id] ? `<p>${hints[id]}</p>` : '');
    o.hidden = !hints[id];
    this.confirmBar(false);
  }

  tip(title, sub, bad) {
    const t = $('#tip');
    if (!title) {
      t.hidden = true;
      return;
    }
    t.hidden = false;
    t.className = bad ? 'bad' : '';
    t.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  }

  confirmBar(on) {
    $('#confirm').hidden = !on;
  }

  // ---------------------------------------------------------------- bildirim
  toast(msg, kind = 'info') {
    const box = $('#toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = msg;
    box.prepend(d);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 5200);
    setTimeout(() => d.remove(), 5800);
  }

  ask(title, text, okLabel, onOk) {
    this.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn danger" data-m="ok">${esc(okLabel)}</button><button class="btn" data-m="cancel">Vazgeç</button></div>`, (k) => {
      if (k === 'ok') onOk();
    });
  }

  modal(html, cb) {
    const m = $('#modal');
    $('#modal-card').innerHTML = html;
    m.hidden = false;
    m.onclick = (e) => {
      const b = e.target.closest('[data-m]');
      if (e.target.id === 'modal') return this.closeModal();
      if (!b) return;
      const k = b.dataset.m;
      this.closeModal();
      cb && cb(k);
    };
  }
  closeModal() {
    $('#modal').hidden = true;
  }

  menu() {
    const g = this.game;
    const has = g.hasSave();
    this.modal(`<h2>Havalimanı Tycoon</h2>
      <div class="col">
        <button class="btn primary" data-m="export">Dosyaya kaydet (indir)</button>
        <button class="btn" data-m="import">Dosyadan yükle</button>
        <button class="btn" data-m="save">Tarayıcıya kaydet</button>
        <button class="btn" data-m="load" ${has ? '' : 'disabled'}>Tarayıcıdaki kaydı yükle</button>
        <button class="btn" data-m="new">Yeni oyun</button>
        <button class="btn" data-m="help">Kontroller</button>
        <button class="btn" data-m="close">Kapat</button>
      </div><p class="muted">Oyun her oyun saatinde tarayıcıya kendiliğinden kaydedilir. Dosyaya kaydettiğiniz ilerlemeyi başka bir cihazda ya da tarayıcı verisi silindikten sonra açabilirsiniz (iPad'de dosya İndirilenler klasörüne gider). Kısayollar: Ctrl/⌘+S kaydet, Ctrl/⌘+O aç.</p>`, (k) => {
      if (k === 'export') g.exportFile();
      if (k === 'import') g.importFile();
      if (k === 'save') g.save(true);
      if (k === 'load') g.load();
      if (k === 'new') this.ask('Yeni oyun başlasın mı?', 'Kaydedilmemiş ilerleme kaybolur.', 'Yeni oyun', () => g.newGame());
      if (k === 'help') this.help();
    });
  }

  help() {
    this.modal(`<h2>Kontroller</h2>
      <table class="keys">
        <tr><td>Kaydırma</td><td>Sol tık sürükle · tek parmak · WASD / oklar</td></tr>
        <tr><td>Yakınlaştırma</td><td>Tekerlek · trackpad'de kıstır · iki parmak kıstır · çift dokun · + / − düğmeleri ya da tuşları</td></tr>
        <tr><td>Döndürme</td><td>Sağ tık sürükle · iki parmakla belirgin çevir · Q / E · pusula kuzeye döndürür</td></tr>
        <tr><td>Eğme</td><td>Sağ tık yukarı/aşağı · iki parmağı birlikte yukarı/aşağı kaydır · PageUp / PageDown</td></tr>
        <tr><td>İnşaat</td><td>Soldaki araçlar ya da 1–9 tuşları; R döndürür, Esc seçime döner</td></tr>
        <tr><td>Boyama</td><td>Taksi yolu, apron ve yıkım: sürükleyin (iPad'de tek parmak)</td></tr>
        <tr><td>Zaman</td><td>Boşluk duraklatır; üstteki düğmelerle hız</td></tr>
      </table><div class="row"><button class="btn" data-m="close">Tamam</button></div>`);
  }

  // ---------------------------------------------------------------- paneller
  openPanel(name) {
    this.panel = name;
    document.querySelectorAll('#tabs [data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === name));
    $('#panel').hidden = !name;
    this.lastPanelHtml = null;
    if (name) {
      $('#panel-title').textContent = { flights: 'Uçuşlar', airlines: 'Havayolları', finance: 'Finans', guide: 'Başlangıç rehberi' }[name];
      this.renderPanel();
    }
  }

  renderPanel() {
    const n = this.panel;
    if (!n) return;
    const body = $('#panel-body');
    const html = this['render_' + n]();
    if (html === this.lastPanelHtml && body.childElementCount) return;   // içerik değişmediyse dokunma (iPad'de düğmeler kaybolmasın)
    this.lastPanelHtml = html;
    const keep = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = keep;
  }

  render_flights() {
    const g = this.game;
    const now = g.time;
    const list = g.sim.flights.filter((f) => f.status !== 'cancelled' && (f.arr > now - 240 || !['departed', 'diverted'].includes(f.status))).slice(0, 60);
    if (!list.length) return '<p class="muted">Henüz uçuş yok. Havayolları sekmesinden bir anlaşma imzalayın.</p>';
    const row = (f) => {
      const a = g.econ.airline(f.airline);
      const st = f.status === 'turnaround' || f.status === 'boarding' ? `${STATUS[f.status]} · ${f.stand}` : STATUS[f.status];
      const late = f.delay >= 8 ? `<em>+${Math.round(f.delay)} dk</em>` : '';
      const dd = Math.floor(f.arr / 1440) + 1 - g.day();
      return `<tr class="st-${f.status}"><td>${hhmm(f.arr)}${dd > 0 ? '<sup>+1</sup>' : ''}</td><td><i style="background:${a.tail}"></i>${esc(f.code)}</td><td>${esc(f.from)}</td><td>${AIRCRAFT[f.type].name}</td><td>${st}${late}</td></tr>`;
    };
    return `<table class="board"><thead><tr><th>Saat</th><th>Uçuş</th><th>Nereden</th><th>Tip</th><th>Durum</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`;
  }

  render_airlines() {
    const E = this.game.econ;
    const stars = E.rating();
    let h = '<h3>Anlaşmalar</h3>';
    if (!E.contracts.length) h += '<p class="muted">Henüz anlaşma yok.</p>';
    for (const c of E.contracts) {
      const a = E.airline(c.airline);
      h += `<div class="card"><div class="ch"><i style="background:${a.tail}"></i><b>${esc(a.name)}</b><span>${AIRCRAFT[c.type].name} · günde ${c.perDay}</span></div>
        <div class="bar"><div style="width:${c.sat}%;background:${c.sat > 60 ? '#51cf66' : c.sat > 35 ? '#fcc419' : '#ff6b6b'}"></div></div>
        <div class="cf"><span>Memnuniyet %${Math.round(c.sat)} · ${c.done} sefer</span><button class="link" data-cancel="${c.id}">Sonlandır</button></div></div>`;
    }
    h += `<h3>Teklifler</h3>`;
    if (!E.offers.length) h += '<p class="muted">Yeni teklifler her gün gelir.</p>';
    for (const o of E.offers) {
      const a = E.airline(o.airline);
      const req = E.requirements(a);
      const ok = req.every((r) => r.ok);
      h += `<div class="card"><div class="ch"><i style="background:${a.tail}"></i><b>${esc(a.name)}</b><span>${AIRCRAFT[o.type].name} · günde ${o.perDay} sefer</span></div>
        <p class="est">Tahmini gelir: <b>${money(E.estimate(a, o.perDay))}</b> / gün</p>
        <ul class="req">${req.map((r) => `<li class="${r.ok ? 'ok' : 'no'}">${esc(r.text)}</li>`).join('')}</ul>
        <button class="btn ${ok ? 'primary' : ''}" data-accept="${o.id}" ${ok ? '' : 'disabled'}>Anlaşmayı imzala</button></div>`;
    }
    const locked = AIRLINES.filter((a) => a.minStars > stars && !E.offers.some((o) => o.airline === a.id) && !E.contracts.some((c) => c.airline === a.id));
    if (locked.length) h += `<p class="muted">Puanınız yükseldikçe ${locked.length} havayolu daha teklif verecek.</p>`;
    return h;
  }

  render_finance() {
    const E = this.game.econ;
    const T = E.today;
    const inc = Object.entries(T.income).filter(([, v]) => v);
    const exp = Object.entries(T.expense).filter(([, v]) => v);
    const sum = (a) => a.reduce((s, [, v]) => s + v, 0);
    let h = `<h3>Bugün</h3><table class="fin">
      ${inc.map(([k, v]) => `<tr><td>${INCOME_NAMES[k]}</td><td class="pos">${money(v)}</td></tr>`).join('') || '<tr><td class="muted">Gelir yok</td><td></td></tr>'}
      ${exp.map(([k, v]) => `<tr><td>${EXPENSE_NAMES[k]}</td><td class="neg">${money(-v)}</td></tr>`).join('')}
      <tr class="tot"><td>Net</td><td>${money(sum(inc) - sum(exp))}</td></tr></table>
      <p class="muted">Gece yarısı ödenecek bakım ve personel gideri: <b>${money(E.upkeep())}</b></p>
      <p class="muted">Bugün ${num(T.pax)} yolcu, ${T.flights} kalkış${T.diverted ? `, ${T.diverted} yönlendirme` : ''}. Toplam ${num(E.totals.pax)} yolcu.</p>`;
    if (E.history.length) {
      const last = E.history.slice(-10);
      const max = Math.max(1, ...last.map((d) => Math.abs(d.net)));
      h += `<h3>Son günler</h3><div class="chart">${last.map((d) => `<div title="${d.day}. gün: ${money(d.net)}"><span class="${d.net >= 0 ? 'p' : 'n'}" style="height:${(Math.abs(d.net) / max) * 100}%"></span><small>${d.day}</small></div>`).join('')}</div>`;
    }
    return h;
  }

  render_guide() {
    const g = this.game;
    const W = g.world, E = g.econ;
    const stands = W.list('stand');
    const steps = [
      [W.list('runway').length > 0, 'Bir pist kurun', 'En kısa pist (1.600 m) dar gövdeli uçaklar için yeterli.'],
      [W.list('tower').length > 0, 'Kontrol kulesi kurun', 'Kule olmadan uçuş gelmez.'],
      [W.list('terminal').length > 0, 'Terminal kurun', 'Pistten biraz uzağa, park yerlerine yer bırakarak.'],
      [stands.length > 0, 'Terminalin önüne park yeri kurun', 'Ok, uçağın burnunun bakacağı yönü gösterir: terminale çevirin.'],
      [stands.some((s) => g.sim.standConnected(s)), 'Park yerini taksi yoluyla piste bağlayın', 'Taksi yolu pistin kenarına değmeli ve park yerinin arkasına ulaşmalı.'],
      [stands.some((s) => s.jetway), 'Bir yolcu köprüsü ekleyin', 'Köprülü park yerleri havayollarını daha mutlu eder.'],
      [E.contracts.length > 0, 'Bir havayoluyla anlaşın', 'Havayolları sekmesinden teklifleri inceleyin.'],
      [E.totals.flights > 0, 'İlk kalkışı izleyin', 'Hızı artırmak için üstteki 2× ve 4× düğmeleri.'],
    ];
    return `<ol class="guide">${steps.map(([ok, t, d]) => `<li class="${ok ? 'ok' : ''}"><b>${t}</b><span>${d}</span></li>`).join('')}</ol>
      <p class="muted">İpucu: pistin iki ucuna yakın taksi yolu bağlantıları kalkışları hızlandırır; yoksa uçaklar pistte geri taksi yapar ve iniş yapacak uçaklar pas geçebilir.</p>`;
  }

  panelClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const E = this.game.econ;
    if (b.dataset.accept) {
      E.accept(+b.dataset.accept);
      this.renderPanel();
    }
    if (b.dataset.cancel) {
      const c = E.contracts.find((x) => x.id === +b.dataset.cancel);
      if (c) this.ask(`${E.airline(c.airline).name} anlaşması sonlandırılsın mı?`, 'Planlanmış uçuşları iptal edilir.', 'Sonlandır', () => {
        E.cancel(c.id);
        this.renderPanel();
      });
    }
  }

  // ---------------------------------------------------------------- seçim kartı
  select(sel) {
    this.sel = sel;
    this.renderSel();
  }

  renderSel() {
    const box = $('#sel');
    const s = this.sel;
    if (!s) {
      box.hidden = true;
      return;
    }
    const g = this.game;
    let h = '';
    if (s.ac) {
      const ac = s.ac;
      if (!g.sim.ac.includes(ac)) return this.select(null);
      const f = ac.flight;
      const a = g.econ.airline(f.airline);
      h = `<div class="ch"><i style="background:${a.tail}"></i><b>${esc(f.code)}</b><span>${esc(a.name)}</span></div>
        <p>${AIRCRAFT[f.type].name} · ${esc(f.from)} ⇄ ${esc(f.to)}</p>
        <p><b>${STATUS[f.status]}</b>${f.stand ? ` · Park ${f.stand}` : ''}${ac.v > 1 ? ` · ${Math.round(ac.v * 1.944)} kt` : ''}${ac.y > 5 ? ` · ${Math.round(ac.y * 3.28)} ft` : ''}</p>
        ${f.paxArr ? `<p>Yolcu: ${f.paxArr} geldi${f.paxDep ? `, ${f.paxDep} gidiyor` : ''}</p>` : ''}
        ${f.delay >= 1 ? `<p class="warn">Havalimanı kaynaklı gecikme: ${Math.round(f.delay)} dk</p>` : ''}
        ${ac.stuck ? '<p class="warn">Gideceği yere taksi yolu yok!</p>' : ''}
        <div class="row"><button class="btn" data-act="follow">Takip et</button><button class="btn" data-act="close">Kapat</button></div>`;
    } else if (s.obj) {
      const o = s.obj;
      if (!g.world.objects.has(o.id)) return this.select(null);
      const B = g.builder;
      let info = '';
      if (o.kind === 'stand') {
        const conn = g.sim.standConnected(o);
        const fl = o.flight && g.sim.flights.find((f) => f.id === o.flight);
        info = `<p>${o.jetway ? 'Köprülü' : 'Uzak (otobüslü)'} · ${STANDS[o.size].fits.map((t) => AIRCRAFT[t].name).join(', ')}</p>
          <p class="${conn ? 'okc' : 'warn'}">${conn ? 'Piste bağlı' : 'Piste bağlı değil: arkasına taksi yolu çizin'}</p>
          ${fl ? `<p>${esc(fl.code)} · ${STATUS[fl.status]}</p>` : '<p class="muted">Boş</p>'}`;
      } else if (o.kind === 'runway') {
        const inf = g.world.runwayInfo(o);
        const ex = g.world.runwayExits(o).length;
        info = `<p>${num(inf.len)} m · aktif pist ${inf.ends[o.active || 0].name} (rüzgâra göre)</p><p class="${ex ? 'okc' : 'warn'}">${ex ? `${ex} çıkış karesi` : 'Pistte çıkış yok: kenarına taksi yolu bağlayın'}</p>`;
      } else if (BUILDINGS[o.kind]) info = `<p>${BUILDINGS[o.kind].desc}</p>`;
      info += `<p class="muted">Günlük gider: ${money(g.world.dailyCost(o))}</p>`;
      h = `<div class="ch"><b>${esc(B.objName(o))}</b></div>${info}<div class="row"><button class="btn danger" data-act="demolish">Yık</button><button class="btn" data-act="close">Kapat</button></div>`;
    }
    box.innerHTML = h;
    box.hidden = false;
  }

  // ---------------------------------------------------------------- üst çubuk
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const g = this.game;
    const E = g.econ;
    $('#money').textContent = money(E.money);
    $('#money').classList.toggle('neg', E.money < 0);
    const inc = Object.values(E.today.income).reduce((s, v) => s + v, 0);
    const exp = Object.values(E.today.expense).reduce((s, v) => s + v, 0);
    const net = inc - exp;
    $('#net').textContent = (net >= 0 ? '+' : '') + moneyShort(net) + ' bugün';
    $('#net').className = net >= 0 ? 'pos' : 'neg';
    $('#clock').textContent = hhmm(g.time);
    $('#day').textContent = `${g.day()}. gün`;
    const r = E.rating();
    $('#stars').innerHTML = [1, 2, 3, 4, 5].map((k) => `<span class="${r >= k ? 'f' : r >= k - 0.5 ? 'h' : ''}">★</span>`).join('');
    $('#stars').title = `Havalimanı puanı: ${String(r).replace('.', ',')}`;
    const rw = g.world.list('runway')[0];
    $('#wind').textContent = `Rüzgâr ${String(E.wind.from).padStart(3, '0')}° ${E.wind.kt} kt` + (rw ? ` · Pist ${g.world.runwayInfo(rw).ends[rw.active || 0].name}` : '');
    document.querySelectorAll('#speed [data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === g.speed));
    $('#compass').style.transform = `rotate(${(g.rig.yaw * 180) / Math.PI}deg)`;
    const nextF = g.sim.flights.find((f) => f.status === 'planned' && f.arr > g.time);
    $('#next').textContent = nextF ? `Sıradaki: ${nextF.code} ${hhmm(nextF.arr)}` : '';
    if (this.panel) {
      this.pt = (this.pt || 0) + 1;
      if (this.pt % 4 === 0 && !document.activeElement?.closest?.('#panel')) this.renderPanel();
    }
    if (this.sel) this.renderSel();
  }
}
