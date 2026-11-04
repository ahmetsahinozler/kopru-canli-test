// Dokunuş tanısı ("Dokunuş noktasını göster"). Gerçek cihazda "dokunduğum yer
// ile bilgisayarın tıkladığı yer farklı" sorununun hangi katmanda olduğunu ayırır:
//
//  kırmızı halka  — telefonun dokunuşu nerede saydığı (tarayıcının bildirdiği nokta)
//  yeşil artı     — bilgisayarın bu dokunuşu enjekte ettiği piksel, telefona geri çevrilmiş
//  sarı artı      — enjeksiyondan sonra Windows'un imleci gerçekte koyduğu yer
//
// Üçü parmağın altındaysa ve yine de yanlış öğe seçiliyorsa sorun Windows'ta/
// uygulamadadır. Halka parmaktan kaymışsa telefonun tarayıcısı (iOS görünüm
// alanı) kaydırıyordur. Halka doğru ama yeşil/sarı artı kaymışsa bilgisayar
// tarafındaki eşleme (monitör dikdörtgeni, DPI) yanlıştır. Panel bunların
// sayısal karşılığını ve sayfa/görünüm alanı ölçülerini yazar; ekran görüntüsü
// alınıp gönderilebilir.
export class Calib {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.diag = null; // bilgisayarın girdi koordinat uzayı özeti
    this.tapN = null; this.hit = null; this.cur = null; this.info = null;
    this.resets = 0; // sayfa kaymış bulunup sıfırlandı (iOS ana ekran uygulaması)
    const st = app.$('stage');
    const mk = (cls) => { const d = document.createElement('div'); d.className = cls + ' hidden'; st.appendChild(d); return d; };
    this.ring = mk('calib-ring'); this.plus = mk('calib-m calib-hit'); this.ycur = mk('calib-m calib-cur');
    this.panel = document.createElement('div');
    this.panel.className = 'stats calib-panel ui hidden';
    app.$('viewer').appendChild(this.panel);
    // env(safe-area-inset-*) değerlerini okumak için görünmez ölçü öğesi.
    this.probe = document.createElement('div');
    this.probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(this.probe);
  }

  get input() { return this.app.input; }

  // reset yeni bağlantıda önceki dokunuşun işaretlerini siler.
  reset() {
    this.tapN = null; this.hit = null; this.cur = null; this.info = null; this.diag = null;
    for (const el of [this.ring, this.plus, this.ycur]) el.classList.add('hidden');
    this.render();
  }

  setOn(on) {
    this.on = !!on;
    for (const el of [this.ring, this.plus, this.ycur, this.panel]) el.classList.toggle('hidden', !this.on || (el !== this.panel && !this.tapN));
    this.app.session?.sendCtl({ t: 'dbg', on: this.on });
    if (this.on) this.render();
  }

  // tap: istemcinin uzak bilgisayara gönderdiği oran (0..1).
  tap(nx, ny) {
    if (!this.on) return;
    this.tapN = { x: nx, y: ny };
    this.hit = null; this.cur = null;
    this.info = this.snapshot();
    this.update();
    this.render();
  }

  onCtl(m) {
    if (!this.on) return;
    if (m.t === 'inputdiag') this.diag = m;
    else if (m.t === 'tapdbg') this.hit = m;
    else if (m.t === 'tapcur') this.cur = m;
    this.update();
    this.render();
  }

  // pxToNorm bilgisayarın piksel koordinatını (eşlemede kullanılan dikdörtgene göre) orana çevirir.
  pxToNorm(px, d) {
    if (!px || !d || !d.w) return null;
    return { x: (px[0] - d.x) / Math.max(1, d.w - 1), y: (px[1] - d.y) / Math.max(1, d.h - 1) };
  }

  // update işaretleri görüntüye göre yeniden yerleştirir (yakınlaştırma/döndürme sonrası da).
  update() {
    if (!this.on) return;
    const sr = this.app.$('stage').getBoundingClientRect();
    const place = (el, n) => {
      el.classList.toggle('hidden', !n);
      if (!n) return;
      const p = this.input.normToClient(n.x, n.y);
      el.style.left = (p.x - sr.left) + 'px'; el.style.top = (p.y - sr.top) + 'px';
    };
    place(this.ring, this.tapN);
    place(this.plus, this.hit && this.pxToNorm(this.hit.px, this.hit.d));
    place(this.ycur, this.cur && this.hit && this.pxToNorm(this.cur.px, this.hit.d));
  }

  // snapshot dokunuş anındaki sayfa ve görünüm alanı ölçüleri.
  snapshot() {
    const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const vv = window.visualViewport;
    const cs = getComputedStyle(this.probe);
    const ins = ['Top', 'Right', 'Bottom', 'Left'].map((k) => Math.round(parseFloat(cs['padding' + k]) || 0));
    const ld = this.input.lastDown;
    const out = {
      inner: [innerWidth, innerHeight],
      vv: vv ? [Math.round(vv.width), Math.round(vv.height), Math.round(vv.offsetLeft), Math.round(vv.offsetTop), Math.round(vv.pageTop), +vv.scale.toFixed(2)] : null,
      scroll: [Math.round(scrollX), Math.round(scrollY)],
      screen: [screen.width, screen.height], dpr: devicePixelRatio,
      standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches,
      safe: ins, stage: r(this.app.$('stage')), img: r(this.input.canvas), zoom: +this.input.zoom.s.toFixed(2),
      resets: this.resets,
    };
    if (ld) {
      out.ev = { client: [Math.round(ld.cx), Math.round(ld.cy)], page: [Math.round(ld.px), Math.round(ld.py)], screen: [Math.round(ld.sx), Math.round(ld.sy)] };
      // Öğe yolu: tarayıcının kendi isabet noktasına göre görüntü içindeki yer
      // (offsetX/Y, dönüşümden bağımsız). Dikdörtgen yoluyla farklıysa tarayıcının
      // koordinat uzayları birbirini tutmuyor demektir.
      if (ld.onCanvas) {
        const c = this.input.canvas;
        out.elem = [+(ld.ox / c.offsetWidth).toFixed(4), +(ld.oy / c.offsetHeight).toFixed(4)];
      }
    }
    return out;
  }

  render() {
    if (!this.on) return;
    const L = [];
    const f4 = (v) => (v == null ? '—' : v.toFixed(4));
    const I = this.info;
    L.push('Dokunuş tanısı — kırmızı: telefon, yeşil: gönderilen, sarı: Windows imleci');
    if (!this.tapN) L.push('Uzak ekranda bir yere dokunun.');
    else {
      let s = `Telefon oranı ${f4(this.tapN.x)}, ${f4(this.tapN.y)}`;
      if (I?.elem) {
        const dx = I.elem[0] - this.tapN.x, dy = I.elem[1] - this.tapN.y;
        s += ` · öğe yolu ${f4(I.elem[0])}, ${f4(I.elem[1])}` + (Math.abs(dx) > 0.005 || Math.abs(dy) > 0.005 ? ` (FARK ${(dx * 100).toFixed(1)}%, ${(dy * 100).toFixed(1)}%)` : ' (aynı)');
      }
      L.push(s);
    }
    const h = this.hit;
    if (h) {
      const d = h.d || {};
      let s = `Bilgisayar ${h.via}: ${h.px[0]}, ${h.px[1]} px · ekran ${d.w}×${d.h}@${d.x},${d.y}`;
      if (h.f) s += ` · kare ${h.f[0]}×${h.f[1]}`;
      if (h.raw && (h.raw.w !== d.w || h.raw.h !== d.h)) s += ` · DÜZELTİLDİ (ham ${h.raw.w}×${h.raw.h})`;
      L.push(s);
      if (this.cur) {
        const dx = this.cur.px[0] - h.px[0], dy = this.cur.px[1] - h.px[1];
        L.push(`Windows imleci ${this.cur.px[0]}, ${this.cur.px[1]} · fark ${dx}, ${dy} px${Math.abs(dy) > 8 || Math.abs(dx) > 8 ? ' ← KAYMA (Windows tarafı)' : ''}`);
      }
    } else if (this.tapN) L.push('Bilgisayarın yanıtı bekleniyor…');
    if (I) {
      const vv = I.vv ? `${I.vv[0]}×${I.vv[1]} +${I.vv[2]},+${I.vv[3]} sayfa ${I.vv[4]} ×${I.vv[5]}` : '—';
      L.push(`Sayfa ${I.inner.join('×')} · görünen ${vv} · kaydırma ${I.scroll.join(',')}${I.resets ? ` (sıfırlandı ${I.resets})` : ''}`);
      L.push(`Ekran ${I.screen.join('×')} · dpr ${I.dpr} · ana ekran uyg. ${I.standalone ? 'evet' : 'hayır'} · güvenli alan ü${I.safe[0]} s${I.safe[1]} a${I.safe[2]} sl${I.safe[3]}`);
      L.push(`Sahne ${I.stage.join(',')} · görüntü ${I.img.join(',')} · yakınlaştırma ${I.zoom}`);
      if (I.ev) L.push(`Olay client ${I.ev.client.join(',')} · page ${I.ev.page.join(',')} · screen ${I.ev.screen.join(',')}`);
    }
    const g = this.diag?.info;
    if (g) L.push(`Windows: girdi DPI ${g.girdi || '?'} · süreç ${g.surec || '?'} · ölçek %${g.olcek || '?'} · monitör ${(g.monitor || []).join(',')} · sanal ${(g.sanal || []).join(',')}`);
    this.panel.textContent = '';
    for (const t of L) { const d = document.createElement('div'); d.textContent = t; this.panel.appendChild(d); }
    // Dokunulan yeri kapatmasın: dokunuş ekranın üst yarısındaysa panel altta durur.
    if (this.tapN) {
      const st = this.app.$('stage').getBoundingClientRect(), p = this.input.normToClient(this.tapN.x, this.tapN.y);
      this.panel.classList.toggle('alt', p.y < st.top + st.height / 2);
    }
  }
}
