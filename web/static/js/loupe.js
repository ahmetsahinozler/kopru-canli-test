// Dokunmada yerel görsel yardımcılar: büyüteç ve basılı tutma halkası.
//
// Büyüteç: parmak hedefi kapatır. Parmak bir an durunca (ya da yavaş
// sürüklerken) parmağın üstünde, altında kalan yerin büyütülmüş hâli görünür.
// Ortadaki artı, uzak bilgisayara GÖNDERİLEN noktadır (çift dokunuş yakalaması
// dahil). Görüntü, ekrandaki yüzeyden (Apple yolunda #vcanvas, diğerlerinde
// <video>) kopyalanır; ağdan ya da bilgisayardan hiçbir şey beklenmez.
//
// Basılı tutma halkası: uzun basışın sağ tıka dönüşeceği anı yerelde, gecikmesiz
// gösterir. Büyüteç açıksa halka büyütecin kenarında dolar; değilse parmağın
// çevresinde ayrı bir halka çizilir.
//
// İkisi de yalnızca görseldir: girdi gönderimi bunları beklemez. Durum
// değişiklikleri yalnızca saklanır; çizim bir sonraki ekran yenilemesinde yapılır.

const SIZE = 132; // büyüteç çapı (CSS px)
const ZOOM = 2.5; // ekranda görünen ölçeğin katı
const MAXPX = 4; // bir görüntü pikseli büyüteçte en çok bu kadar CSS px (görünüm zaten büyükse o kadar)
const LIFT = 92; // büyütecin merkezi parmağın bu kadar üstünde (alt kenarı parmak ucunun ~26 px üstünde)
const SIDE = 44; // üstte yer yoksa parmağın yanına: kenar ile parmak arası
const MARGIN = 8; // görüntü alanının kenarından en az uzaklık
const RING = 72; // ayrı halkanın çapı (CSS px)

export class TouchFx {
  constructor(app) {
    this.app = app;
    this.stage = app.$('stage');
    const c = document.createElement('canvas');
    c.className = 'loupe';
    c.setAttribute('aria-hidden', 'true');
    this.stage.appendChild(c);
    this.el = c;
    this.ctx = c.getContext('2d');
    this.dpr = 0;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'holdring');
    svg.setAttribute('viewBox', `0 0 ${RING} ${RING}`);
    svg.setAttribute('aria-hidden', 'true');
    const r = RING / 2 - 4;
    svg.innerHTML = `<circle class="hr-bg" cx="${RING / 2}" cy="${RING / 2}" r="${r}"/><circle class="hr-fg" cx="${RING / 2}" cy="${RING / 2}" r="${r}" transform="rotate(-90 ${RING / 2} ${RING / 2})"/>`;
    this.stage.appendChild(svg);
    this.ring = svg;
    this.ringFg = svg.querySelector('.hr-fg');
    this.ringLen = 2 * Math.PI * r;
    this.ringFg.style.strokeDasharray = `${this.ringLen}`;
    this.owner = null; // büyüteci/halkayı açan dokunuş
    this.finger = null; // parmağın istemci koordinatı
    this.point = null; // gönderilen noktanın istemci koordinatı
    this.loupeShown = false;
    this.hold = null; // { t0, delay, total }
    this.raf = 0;
    this.side = 0; // büyüteç parmağın yanındaysa -1 sol / +1 sağ (titremesin diye korunur)
    this.acc = '';
  }

  // track parmağın ve gönderilen noktanın yerini günceller (çizim bir sonraki karede).
  track(owner, fx, fy, point) {
    if (owner !== this.owner) return;
    this.finger = { x: fx, y: fy };
    this.point = point;
    if (this.loupeShown || this.hold) this.kick();
  }

  loupeOn(owner, fx, fy, point) {
    this.owner = owner;
    this.finger = { x: fx, y: fy };
    this.point = point;
    if (this.loupeShown) return;
    this.loupeShown = true;
    this.side = 0;
    this.el.classList.add('on');
    this.kick();
  }

  loupeOff() {
    if (!this.loupeShown) return;
    this.loupeShown = false;
    this.el.classList.remove('on');
  }

  // holdStart basılı tutma halkasını kurar: delay ms sonra görünür, total ms'de dolar.
  holdStart(owner, fx, fy, point, delay, total) {
    this.owner = owner;
    this.finger = { x: fx, y: fy };
    this.point = point;
    this.hold = { t0: performance.now(), delay, total };
    this.ring.classList.remove('on', 'done');
    this.kick();
  }

  holdStop() {
    if (!this.hold) return;
    this.hold = null;
    this.ring.classList.remove('on', 'done');
  }

  // stop parmak kalkınca, ikinci parmak gelince ya da mod değişince her şeyi kapatır.
  stop() {
    this.loupeOff();
    this.holdStop();
    this.owner = null;
  }

  // holdProgress halkanın doluluğu (0..1); henüz görünmüyorsa null.
  holdProgress(now = performance.now()) {
    const h = this.hold;
    if (!h) return null;
    const el = now - h.t0;
    if (el < h.delay) return null;
    return Math.min(1, (el - h.delay) / Math.max(1, h.total - h.delay));
  }

  kick() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  tick() {
    this.raf = 0;
    const p = this.holdProgress();
    if (this.loupeShown) this.drawLoupe(p);
    // Ayrı halka yalnızca büyüteç kapalıyken (Touchpad modu ya da büyüteç kapalı).
    const ringOn = p != null && !this.loupeShown && this.finger;
    this.ring.classList.toggle('on', !!ringOn);
    if (ringOn) {
      const sr = this.stage.getBoundingClientRect();
      this.ring.style.transform = `translate(${this.finger.x - sr.left - RING / 2}px, ${this.finger.y - sr.top - RING / 2}px)`;
      this.ringFg.style.strokeDashoffset = `${this.ringLen * (1 - p)}`;
      this.ring.classList.toggle('done', p >= 1);
    }
    // Halka dolarken ya da büyüteç açıkken her karede yeniden çiz (görüntü akıyor).
    if (this.loupeShown || (this.hold && p !== 1)) this.kick();
  }

  // source şu an ekranda görüntüyü taşıyan yüzey ve asıl boyutu.
  source() {
    const app = this.app;
    if (app.wsv) {
      const c = app.$('vcanvas');
      return { el: c, w: c.width, h: c.height };
    }
    const v = app.$('video');
    return { el: v, w: v.videoWidth, h: v.videoHeight };
  }

  // place büyütecin merkezini seçer: parmağın üstü; sığmıyorsa parmağın yanı.
  place(sr) {
    const R = SIZE / 2, f = this.finger;
    const fx = f.x - sr.left, fy = f.y - sr.top, W = sr.width, H = sr.height;
    let cx = fx, cy = fy - LIFT;
    if (cy - R < MARGIN) {
      // Üstte yer yok: parmağın yanına geç (daha geniş tarafa; seçilen taraf korunur).
      if (!this.side) this.side = fx > W / 2 ? -1 : 1;
      cx = fx + this.side * (R + SIDE);
      cy = Math.max(fy - R / 2, R + MARGIN);
      if (cx - R < MARGIN || cx + R > W - MARGIN) { this.side = -this.side; cx = fx + this.side * (R + SIDE); }
    } else this.side = 0;
    cx = Math.max(R + MARGIN, Math.min(W - R - MARGIN, cx));
    cy = Math.max(R + MARGIN, Math.min(H - R - MARGIN, cy));
    return { cx, cy };
  }

  drawLoupe(p) {
    const app = this.app, src = this.source();
    if (!this.finger || !this.point) return;
    const sr = this.stage.getBoundingClientRect();
    const { cx, cy } = this.place(sr);
    this.el.style.transform = `translate(${cx - SIZE / 2}px, ${cy - SIZE / 2}px)`;
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.el.width = Math.round(SIZE * dpr); this.el.height = Math.round(SIZE * dpr);
      this.el.style.width = SIZE + 'px'; this.el.style.height = SIZE + 'px';
    }
    const g = this.ctx, R = SIZE / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath(); g.arc(R, R, R - 1, 0, 2 * Math.PI); g.clip();
    g.fillStyle = '#000'; g.fillRect(0, 0, SIZE, SIZE);
    const r = app.input.rect();
    if (src.w > 0 && src.h > 0 && r.width > 0) {
      // Gönderilen noktanın görüntüdeki pikseli büyütecin tam ortasına gelir.
      const sx = (this.point.x - r.left) / r.width * src.w, sy = (this.point.y - r.top) / r.height * src.h;
      const shown = r.width / src.w; // ekranda bir görüntü pikseli kaç CSS px
      const k = Math.min(shown * ZOOM, Math.max(MAXPX, shown)); // büyüteçte bir görüntü pikseli kaç CSS px
      const half = R / k;
      // Kaynak dikdörtgenini görüntünün içine kırp, hedefi aynı oranda kaydır.
      const x0 = Math.max(0, sx - half), y0 = Math.max(0, sy - half);
      const x1 = Math.min(src.w, sx + half), y1 = Math.min(src.h, sy + half);
      if (x1 > x0 && y1 > y0) {
        g.imageSmoothingEnabled = k < 3;
        try { g.drawImage(src.el, x0, y0, x1 - x0, y1 - y0, R + (x0 - sx) * k, R + (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k); } catch {}
      }
    }
    g.restore();
    // Artı: ortadaki piksel görünsün diye ortası boş; koyu kenarlı açık çizgi.
    const gap = 4, arm = 16;
    const cross = (w, c) => {
      g.strokeStyle = c; g.lineWidth = w; g.beginPath();
      g.moveTo(R - gap - arm, R); g.lineTo(R - gap, R); g.moveTo(R + gap, R); g.lineTo(R + gap + arm, R);
      g.moveTo(R, R - gap - arm); g.lineTo(R, R - gap); g.moveTo(R, R + gap); g.lineTo(R, R + gap + arm);
      g.stroke();
    };
    cross(3, 'rgba(0,0,0,.75)'); cross(1.2, '#fff');
    // Kenar ve basılı tutma ilerlemesi.
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.arc(R, R, R - 2, 0, 2 * Math.PI); g.stroke();
    if (p != null) {
      if (!this.acc) this.acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#4f8cff';
      g.lineWidth = p >= 1 ? 6 : 4; g.strokeStyle = this.acc; g.lineCap = 'round';
      g.beginPath(); g.arc(R, R, R - 3, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p); g.stroke();
    }
  }
}
