// Fare, klavye ve dokunmatik girdisi.
//
// Gecikme ilkeleri:
//  - Fare hareketleri sırasız/kayıplı kanaldan, en çok 4 ms'de bir ve yalnızca en güncel konum.
//  - Tıklamalar/tuşlar güvenilir kanaldan; tıklama kendi konumunu taşır.
//  - İmleç yerelde çizilir (CSS cursor veya hayalet imleç) → hareket anında hissedilir.
import { scancodeFor, SC } from './keymap.js';
import { TouchFx } from './loupe.js';

const SCANCODE_OF = (code) => SC[code] || 0;

const MOVE = 1, BUTTON = 2, WHEEL = 3, KEY = 4, TEXT = 5, TOUCH = 6;
const te = new TextEncoder();
const u16 = (v) => Math.max(0, Math.min(65535, Math.round(v * 65535)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Dokunma yardımcılarının eşikleri. Gerekçeler ve ölçümler:
// docs/arastirma/08-dokunma-ux.md.
const SNAP_MS = 350, SNAP_PX = 24; // çift dokunuş: ikinci dokunuş bu süre/uzaklık içindeyse ilkinin noktasına gider
const TAP_MS = 300; // bundan uzun basış "dokunuş" sayılmaz (çift dokunuşun ilk yarısı olamaz)
const LOUPE_MS = 220; // büyüteç: parmak bu kadar durunca
const SLOW_ON = 0.45, SLOW_OFF = 1.2, SLOW_MS = 150; // yavaş sürükleme (px/ms): bu hızın altında SLOW_MS kalınca büyüteç açılır, SLOW_OFF üstünde kapanır
const STILL_MS = 120; // sürüklerken parmak bu kadar hiç oynamazsa durmuş sayılır (büyüteç açılır)
const EDGE_PX = 36, EDGE_MS = 120, EDGE_SPEED = 900; // kenarda kaydırma: şerit, bekleme, en yüksek hız (px/sn)
const KB3_SPREAD = 250, KB3_MAX = 400, KB3_PX = 15; // üç parmakla dokunma: parmakların iniş aralığı, toplam süre, en çok oynama
const HOLD_MS = 550, HOLD_DELAY = 150; // Touchpad/Doğrudan: uzun bas = sağ tık (eşik bizim); halka 150 ms sonra dolmaya başlar
// Tablet modunda sağ tıkı Windows'un kendi "basılı tut" hareketi yapar; eşiği
// Windows ayarıdır. Varsayılanın yaklaşığı; gerçek Windows'ta ölçülüp ayarlanmalı.
const HOLD_TABLET_MS = 1000, HOLD_TABLET_DELAY = 300;

// sinkDiff gizli metin alanının önceki ve yeni içeriğinden uzak bilgisayara
// gidecekleri çıkarır: kaç kez geri silme (dels) ve sonra yazılacak metin (ins).
// Silinenler kod noktası olarak sayılır: Windows'ta geri silme bir emojiyi
// (iki UTF-16 birimi) tek seferde siler; birim saymak fazladan bir harf silerdi.
// Ortak önek bir vekil çiftin (emoji) ortasında bitmez: aynı yüksek vekille
// başlayan iki emoji yer değiştirince yarım (bozuk) karakter gönderilmezdi.
export function sinkDiff(prev, cur) {
  let p = 0;
  while (p < prev.length && p < cur.length && prev[p] === cur[p]) p++;
  if (p > 0 && p < Math.max(prev.length, cur.length)) {
    const c = prev.charCodeAt(p - 1);
    if (c >= 0xd800 && c <= 0xdbff) p--;
  }
  return { dels: [...prev.slice(p)].length, ins: cur.slice(p) };
}

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && !matchMedia('(pointer: fine)').matches;
export const isMac = /Mac/.test(navigator.platform) && !isTouchDevice();

// ABD düzeninde harf/rakam tarama kodu (yapışkan Ctrl + harf kısayolları için).
const ASCII_SC = (() => {
  const m = {};
  const rows = [['1234567890', 0x02], ['qwertyuiop', 0x10], ['asdfghjkl', 0x1e], ['zxcvbnm', 0x2c]];
  for (const [s, base] of rows) for (let i = 0; i < s.length; i++) m[s[i]] = base + i;
  return m;
})();

export class Input {
  constructor(app) {
    this.app = app;
    this.stage = app.$('stage');
    this.canvas = app.$('canvas');
    this.video = app.$('video');
    this.sink = app.$('kbdsink');
    this.ghost = app.$('ghost');
    this.mode = 'mouse';
    this.zoom = { s: 1, x: 0, y: 0 };
    this.cursor = { x: 0.5, y: 0.5 }; // touchpad/hayalet imleç (normalleştirilmiş)
    this.lastMoveSent = 0;
    this.pendingMove = null;
    this.moveTimer = null;
    this.keysDown = new Set();
    this.btnDown = new Set();
    this.sticky = new Set();
    this.touches = new Map();
    this.touchIds = new Map();
    this.wheelAcc = { x: 0, y: 0 };
    this.sinkBase = '1'.repeat(64);
    this.composing = false;
    this.fx = new TouchFx(app);
    this.scrollAt = null; // iki parmakla kaydırmanın uzak bilgisayardaki yeri (oran)
    this.tapSnap = null; // son temiz dokunuş (çift dokunuş yakalaması için)
    this.edge = null; // sürüklerken kenarda kaydırma
    this.bind();
  }

  get s() { return this.app.session; }
  active() { return this.app.viewerActive && this.s && this.app.caps.input !== false; }

  setMode(m) {
    this.mode = m;
    this.releaseTouches();
    // Tablette imleç yoktur; Touchpad/Doğrudan modunda imleç yerelde çizilir.
    this.ghost.classList.toggle('hidden', !(m === 'touchpad' || m === 'direct'));
    this.updateGhost();
  }

  // ---- koordinatlar ----
  rect() { return this.canvas.getBoundingClientRect(); }
  norm(cx, cy) {
    const r = this.rect();
    return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height, inside: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom };
  }

  // ---- gönderim ----
  sendMove(x, y) {
    x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
    this.pendingMove = [x, y];
    const now = performance.now();
    const wait = 4 - (now - this.lastMoveSent);
    if (wait <= 0) this.flushMove();
    else if (!this.moveTimer) this.moveTimer = setTimeout(() => this.flushMove(), wait);
  }
  flushMove() {
    clearTimeout(this.moveTimer); this.moveTimer = null;
    if (!this.pendingMove || !this.s) return;
    const [x, y] = this.pendingMove;
    const b = new DataView(new ArrayBuffer(5));
    b.setUint8(0, MOVE); b.setUint16(1, u16(x), true); b.setUint16(3, u16(y), true);
    this.s.sendMv(b.buffer);
    this.pendingMove = null;
    this.lastMoveSent = performance.now();
  }
  sendButton(btn, down, x, y) {
    if (down) this.btnDown.add(btn); else this.btnDown.delete(btn);
    if (down) this.app.calib?.tap(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
    const b = new DataView(new ArrayBuffer(7));
    b.setUint8(0, BUTTON); b.setUint8(1, btn); b.setUint8(2, down ? 1 : 0);
    b.setUint16(3, u16(Math.max(0, Math.min(1, x))), true); b.setUint16(5, u16(Math.max(0, Math.min(1, y))), true);
    this.s?.sendIn(b.buffer);
  }
  click(btn, x, y, n = 1) {
    for (let i = 0; i < n; i++) { this.sendButton(btn, true, x, y); this.sendButton(btn, false, x, y); }
  }
  // sendWheel tekerlek gönderir. at (oran) verilirse ileti 9 bayttır ve bilgisayar
  // önce imleci oraya taşır: Windows tekerleği imlecin altındaki pencereye verir.
  sendWheel(dx, dy, at) {
    const b = new DataView(new ArrayBuffer(at ? 9 : 5));
    b.setUint8(0, WHEEL); b.setInt16(1, Math.max(-32768, Math.min(32767, dx)), true); b.setInt16(3, Math.max(-32768, Math.min(32767, dy)), true);
    if (at) { b.setUint16(5, u16(clamp01(at.x)), true); b.setUint16(7, u16(clamp01(at.y)), true); }
    this.s?.sendIn(b.buffer);
  }
  sendKey(sc, down) {
    if (!sc) return;
    if (down) this.keysDown.add(sc); else this.keysDown.delete(sc);
    const b = new DataView(new ArrayBuffer(4));
    b.setUint8(0, KEY); b.setUint8(1, down ? 1 : 0); b.setUint16(2, sc, true);
    this.s?.sendIn(b.buffer);
  }
  tap(sc) { this.sendKey(sc, true); this.sendKey(sc, false); }
  combo(...scs) { scs.forEach((s) => this.sendKey(s, true)); scs.slice().reverse().forEach((s) => this.sendKey(s, false)); }
  sendText(str) {
    if (!str) return;
    // Yapışkan değiştirici varsa (ör. Ctrl) harfi kısayol olarak gönder.
    if (this.sticky.size && str.length === 1 && ASCII_SC[str.toLowerCase()]) {
      this.tap(ASCII_SC[str.toLowerCase()]);
      this.releaseSticky();
      return;
    }
    const parts = str.split(/(\n)/);
    for (const p of parts) {
      if (p === '\n') { this.tap(SC.Enter); continue; }
      if (!p) continue;
      const bytes = te.encode(p);
      const b = new Uint8Array(bytes.length + 1);
      b[0] = TEXT; b.set(bytes, 1);
      this.s?.sendIn(b.buffer);
    }
    this.releaseSticky();
  }
  releaseSticky() {
    for (const sc of this.sticky) this.sendKey(sc, false);
    this.sticky.clear();
    this.app.updateStickyUI?.(this.sticky);
  }
  toggleSticky(sc) {
    if (this.sticky.has(sc)) { this.sticky.delete(sc); this.sendKey(sc, false); }
    else { this.sticky.add(sc); this.sendKey(sc, true); }
    this.app.updateStickyUI?.(this.sticky);
  }
  // Özel tuş çubuğundan tek tuş: yapışkan değiştiricilerle birlikte.
  barKey(sc) { this.tap(sc); this.releaseSticky(); }

  releaseAll() {
    for (const sc of this.keysDown) this.sendKey(sc, false);
    for (const b of [...this.btnDown]) this.sendButton(b, false, this.cursor.x, this.cursor.y);
    this.keysDown.clear(); this.btnDown.clear(); this.sticky.clear();
    this.releaseTouches();
    this.app.updateStickyUI?.(this.sticky);
  }

  // ---- olay bağlama ----
  bind() {
    const st = this.stage;
    st.addEventListener('pointerdown', (e) => this.onDown(e));
    st.addEventListener('pointermove', (e) => this.onMove(e));
    st.addEventListener('pointerup', (e) => this.onUp(e));
    st.addEventListener('pointercancel', (e) => this.onUp(e, true));
    st.addEventListener('contextmenu', (e) => e.preventDefault());
    st.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e, true), true);
    window.addEventListener('keyup', (e) => this.onKey(e, false), true);
    // Üç parmakla dokunmada klavye pointerup içinde açılamadıysa (iOS klavyeyi
    // yalnızca kullanıcı hareketinin içinde açar) hemen ardından gelen touchend'de yeniden dene.
    st.addEventListener('touchend', () => this.kbRetry(), { passive: true });
    window.addEventListener('blur', () => { if (this.active()) this.releaseAll(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active()) this.releaseAll(); });
    const sink = this.sink;
    sink.value = this.sinkBase;
    sink.addEventListener('compositionstart', () => { this.composing = true; });
    sink.addEventListener('compositionend', () => { this.composing = false; this.onSinkInput(); });
    sink.addEventListener('input', () => this.onSinkInput());
    window.addEventListener('resize', () => this.layout());
    this.video.addEventListener('resize', () => this.layout());
    // iPhone döndürülürken önce genişliği, bir süre sonra yüksekliği günceller;
    // pencere "resize" olayı arada gelirse görüntü eski yüksekliğe göre
    // yerleşip yarısı ekran dışında kalıyordu. Görüntü alanının gerçek boyutunu
    // izle; döndürmeden sonra da birkaç kez yeniden yerleştir. Dönünce eski
    // yönün yakınlaştırması anlamsızdır: sıfırla.
    if (window.ResizeObserver) {
      let last = '';
      new ResizeObserver(() => {
        const k = this.stage.clientWidth + 'x' + this.stage.clientHeight;
        if (k !== last) { last = k; this.layout(); }
      }).observe(this.stage);
    }
    const settle = () => { for (const ms of [100, 300, 700, 1200]) setTimeout(() => this.layout(), ms); };
    window.addEventListener('orientationchange', () => { this.zoom = { s: 1, x: 0, y: 0 }; settle(); });
    if (screen.orientation) screen.orientation.addEventListener?.('change', () => { this.zoom = { s: 1, x: 0, y: 0 }; settle(); });
  }

  // ---- yerleşim ve yakınlaştırma ----
  layout() {
    const sz = this.app.surfaceSize ? this.app.surfaceSize() : { w: this.video.videoWidth, h: this.video.videoHeight };
    const vw = sz.w || 16, vh = sz.h || 9;
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    let fw, fh;
    if (this.app.settings.scaleMode === '1:1') { fw = vw / devicePixelRatio; fh = vh / devicePixelRatio; }
    else { const k = Math.min(W / vw, H / vh); fw = vw * k; fh = vh * k; }
    this.fit = { w: fw, h: fh, x: Math.max(0, (W - fw) / 2), y: Math.max(0, (H - fh) / 2) };
    Object.assign(this.canvas.style, { width: fw + 'px', height: fh + 'px', left: this.fit.x + 'px', top: this.fit.y + 'px' });
    this.applyZoom();
  }
  applyZoom() {
    const z = this.zoom, f = this.fit || { w: 0, h: 0, x: 0, y: 0 };
    const W = this.stage.clientWidth;
    // Klavye açıkken yalnızca klavyenin üstünde kalan alan görünür.
    const vis = this.app.visibleArea ? this.app.visibleArea() : { top: 0, h: this.stage.clientHeight };
    if (z.s < 1) z.s = 1;
    // Görüntü dışına kaymayı sınırla (görüntü ekrandan küçükse ortada kalır).
    const sw = f.w * z.s, sh = f.h * z.s;
    z.x = sw <= W ? 0 : Math.max(W - sw - f.x, Math.min(-f.x, z.x));
    z.y = sh <= vis.h ? (vis.h < this.stage.clientHeight ? Math.min(0, vis.top + vis.h - sh - f.y) : 0) : Math.max(vis.top + vis.h - sh - f.y, Math.min(vis.top - f.y, z.y));
    this.canvas.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
    this.updateGhost();
    this.app.onViewChange?.();
  }
  zoomAt(cx, cy, factor) {
    const z = this.zoom, f = this.fit;
    const ns = Math.max(1, Math.min(8, z.s * factor));
    // (cx,cy) ekran noktası yerinde kalsın.
    const px = cx - f.x - z.x, py = cy - f.y - z.y;
    z.x -= px * (ns / z.s - 1); z.y -= py * (ns / z.s - 1);
    z.s = ns;
    this.applyZoom();
  }
  panBy(dx, dy) { this.zoom.x += dx; this.zoom.y += dy; this.applyZoom(); }
  normToClient(nx, ny) { const r = this.rect(); return { x: r.left + nx * r.width, y: r.top + ny * r.height }; }
  resetZoom() { this.zoom = { s: 1, x: 0, y: 0 }; this.applyZoom(); }
  // Yakınlaştırılmışken hayalet imleç görünür alanda kalsın.
  follow() {
    if (this.zoom.s <= 1) return;
    const r = this.rect();
    const cx = r.left + this.cursor.x * r.width, cy = r.top + this.cursor.y * r.height;
    const W = this.stage.clientWidth, H = this.stage.clientHeight, m = 40;
    let dx = 0, dy = 0;
    if (cx < m) dx = m - cx; else if (cx > W - m) dx = W - m - cx;
    if (cy < m) dy = m - cy; else if (cy > H - m) dy = H - m - cy;
    if (dx || dy) this.panBy(dx, dy);
  }
  updateGhost() {
    const g = this.ghost;
    if (g.classList.contains('hidden')) return;
    const img = this.app.cursorImg;
    if (img) { g.style.backgroundImage = `url(${img.url})`; g.style.width = img.w + 'px'; g.style.height = img.h + 'px'; g.style.marginLeft = -img.hx + 'px'; g.style.marginTop = -img.hy + 'px'; }
    const r = this.rect(), sr = this.stage.getBoundingClientRect();
    g.style.left = (r.left - sr.left + this.cursor.x * r.width) + 'px';
    g.style.top = (r.top - sr.top + this.cursor.y * r.height) + 'px';
  }
  // Ajan bildirdiği imleç konumu (uzaktaki kişi fareyi oynattı).
  remoteCursor(x, y) {
    if (this.dragging || this.touches.size) return;
    this.cursor = { x, y };
    this.updateGhost();
  }

  // ---- işaretçi olayları ----
  onDown(e) {
    if (!this.active()) return;
    if (e.target.closest('.ui')) return;
    e.preventDefault();
    if (e.pointerType === 'touch') return this.touchDown(e);
    this.noteDown(e);
    this.focusSink();
    this.stage.setPointerCapture(e.pointerId);
    const p = this.norm(e.clientX, e.clientY);
    if (!p.inside) return;
    this.flushMove();
    const map = [0, 1, 2, 3, 4];
    this.sendButton(map[e.button] ?? 0, true, p.x, p.y);
  }
  onMove(e) {
    if (!this.active()) return;
    if (e.pointerType === 'touch') return this.touchMove(e);
    const p = this.norm(e.clientX, e.clientY);
    if (!p.inside && !this.btnDown.size) return;
    this.cursor = { x: p.x, y: p.y };
    this.sendMove(p.x, p.y);
  }
  onUp(e, cancel) {
    if (!this.active()) return;
    if (e.pointerType === 'touch') return this.touchUp(e, cancel);
    const p = this.norm(e.clientX, e.clientY);
    const map = [0, 1, 2, 3, 4];
    const b = map[e.button] ?? 0;
    if (this.btnDown.has(b)) { this.flushMove(); this.sendButton(b, false, p.x, p.y); }
  }
  onWheel(e) {
    if (!this.active() || e.target.closest('.ui')) return;
    e.preventDefault();
    // Dokunmatik yüzeyde iki parmak sıkıştırma Chrome'da ctrlKey'li tekerlek olarak gelir → yerel yakınlaştırma.
    if (e.ctrlKey && !this.keysDown.has(SC.ControlLeft) && !this.keysDown.has(SC.ControlRight)) {
      this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY / 200));
      return;
    }
    const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1.2;
    this.wheelAcc.x += e.deltaX * k; this.wheelAcc.y -= e.deltaY * k;
    const dx = Math.trunc(this.wheelAcc.x), dy = Math.trunc(this.wheelAcc.y);
    if (!dx && !dy) return;
    this.wheelAcc.x -= dx; this.wheelAcc.y -= dy;
    // Konum: Touchpad'de imleç, farede işaretçinin altı (hareket iletisi ayrı ve
    // sırasız kanaldan gelir; tekerlek ondan önce varırsa yanlış pencere kayardı).
    const p = this.norm(e.clientX, e.clientY);
    this.sendWheel(dx, dy, this.mode === 'touchpad' ? this.cursor : p.inside ? p : null);
  }

  // noteDown basışın ham olay bilgisini dokunuş tanısı için saklar.
  noteDown(e) {
    this.lastDown = { cx: e.clientX, cy: e.clientY, px: e.pageX, py: e.pageY, sx: e.screenX, sy: e.screenY, ox: e.offsetX, oy: e.offsetY, onCanvas: e.target === this.canvas };
  }

  // ---- dokunmatik ----
  // Tüm modlarda iki parmak cihazın kendisi gibidir: sıkıştır = görüntüyü büyüt,
  // yakınlaşmamışken iki parmakla kaydır = parmakların altındaki uzak pencereyi (ataletli) kaydır,
  // yakınlaşmışken iki parmakla kaydır = görüntüde gezin, iki parmakla iki kez dokun = sığdır,
  // iki parmakla tek dokunuş = sağ tık, üç parmakla dokunma = klavyeyi aç/kapat.
  // Tek parmak: Tablet = gerçek Windows dokunuşu, Touchpad = imleç, Doğrudan = fare tıklaması.
  // Tablet ve Doğrudan'da yardımcılar: büyüteç, basılı tutma halkası, çift dokunuşu
  // yakalama, yakınlaştırılmışken sürüklerken kenarda kaydırma.
  touchDown(e) {
    if (this.touches.size === 0) this.noteDown(e);
    this.stage.setPointerCapture(e.pointerId);
    const now = performance.now();
    // ox/oy: gönderilen noktanın parmaktan farkı (çift dokunuş yakalaması); vt/v: hız ölçümü.
    const t = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: now, moved: false, ox: 0, oy: 0, vt: now, v: 0 };
    this.touches.set(e.pointerId, t);
    this.ripple(t.x, t.y);
    this.stopMomentum();
    const n = this.touches.size;
    if (n === 1) {
      this.gesture = { kind: 'one', t0: t.t0, maxN: 1, maxD: 0 };
      if (this.mode !== 'touchpad') this.snapTo(t);
      const q = this.at0(t), p = this.norm(q.x, q.y);
      this.lastTouch = { x: p.x, y: p.y };
      this.fxStart(t);
      if (this.mode === 'tablet') {
        // İkinci parmak gelirse bu bir görüntü hareketidir; anlamak için çok kısa bekle.
        t.pending = true;
        t.timer = setTimeout(() => this.tabletCommit(t), 45);
        return;
      }
      clearTimeout(this.longTimer);
      this.longTimer = setTimeout(() => this.longPress(t), HOLD_MS);
      if (this.mode === 'direct') {
        this.cursor = { x: p.x, y: p.y };
        this.sendMove(p.x, p.y); this.updateGhost();
      } else if (this.mode === 'touchpad' && this.lastTap && t.t0 - this.lastTap.t < 280 && Math.hypot(t.x - this.lastTap.x, t.y - this.lastTap.y) < 40) {
        this.gesture.dragArmed = true; // çift dokun + sürükle
      }
    } else if (n === 2) {
      clearTimeout(this.longTimer);
      this.fxStop(); this.edgeStop();
      if (this.dragging) this.endDrag();
      for (const o of this.touches.values()) {
        if (o.pending) { clearTimeout(o.timer); o.pending = false; }
        if (o.sent) { this.tabletEvent(o, 3); o.sent = false; } // Windows'a gitmiş ilk dokunuşu iptal et
        o.local = true;
      }
      const [a, b] = [...this.touches.values()];
      const prev = this.gesture;
      // t1: ilk parmağın inişi (üç parmakla dokunma tanısı için).
      this.gesture = { kind: 'two', d0: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, t0: now, t1: prev?.t0 ?? now, lt: now, maxN: 2, maxD: prev?.maxD || 0, moved: false, pinch: false, scroll: false, vx: 0, vy: 0 };
    } else {
      t.local = true;
      const g = this.gesture;
      if (g) { g.maxN = Math.max(g.maxN, n); if (n === 3) g.t3 = now; }
    }
  }
  // at: dokunuşun uzak bilgisayara gönderilen noktası (istemci koordinatı); at0: basış noktası.
  at(t) { return { x: t.x + (t.ox || 0), y: t.y + (t.oy || 0) }; }
  at0(t) { return { x: t.sx + (t.ox || 0), y: t.sy + (t.oy || 0) }; }
  tabletCommit(t) {
    if (!t.pending) return;
    t.pending = false; t.sent = true;
    this.tabletEvent({ id: t.id, x: t.sx, y: t.sy, ox: t.ox, oy: t.oy }, 0);
  }
  touchMove(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const px = t.x, py = t.y, now = performance.now();
    t.x = e.clientX; t.y = e.clientY;
    const dist = Math.hypot(t.x - t.sx, t.y - t.sy);
    if (dist > 8) t.moved = true;
    // Parmağın hızı (px/ms), zamana göre üstel ortalama (~40 ms): büyüteç yavaş
    // sürüklemede açılır. Uzun bir duraklamadan sonraki ilk örnek eski hızı siler.
    const vdt = Math.max(1, now - t.vt);
    t.v += (1 - Math.exp(-vdt / 40)) * (Math.hypot(t.x - px, t.y - py) / vdt - t.v);
    t.vt = now;
    const g = this.gesture;
    if (g) g.maxD = Math.max(g.maxD || 0, dist);
    if (g?.kind === 'two' && this.touches.size >= 2) return this.twoMove(g);
    if (this.mode === 'tablet') {
      if (t.local) return;
      if (t.pending && t.moved) this.tabletCommit(t);
      if (t.sent) this.tabletEvent(t, 1);
      this.fxMove(t);
      if (t.sent && t.moved) this.edgeCheck(t);
      return;
    }
    if (!g || g.kind !== 'one' || this.touches.size !== 1) return;
    if (this.mode === 'direct') this.fxMove(t);
    else this.fx.track(t, t.x, t.y, this.at(t));
    if (!t.moved) return;
    clearTimeout(this.longTimer);
    this.fx.holdStop(); // parmak oynadı: uzun basış (sağ tık) yok
    if (this.mode === 'direct') {
      const q = this.at(t), p = this.norm(q.x, q.y);
      if (!this.dragging) { this.dragging = true; const s0 = this.at0(t), s = this.norm(s0.x, s0.y); this.sendButton(0, true, s.x, s.y); }
      this.cursor = { x: p.x, y: p.y };
      this.sendMove(p.x, p.y); this.updateGhost();
      this.edgeCheck(t);
      return;
    }
    // touchpad: göreli hareket + ivme
    const r = this.rect();
    const dt = Math.max(1, e.timeStamp - (t.lt || e.timeStamp - 16));
    t.lt = e.timeStamp;
    const dx = t.x - px, dy = t.y - py;
    const accel = 1 + Math.min(2.5, (Math.hypot(dx, dy) / dt) * 1.2);
    const sens = this.app.settings.sensitivity || 1;
    this.cursor.x = Math.max(0, Math.min(1, this.cursor.x + dx * accel * sens / r.width * this.zoom.s));
    this.cursor.y = Math.max(0, Math.min(1, this.cursor.y + dy * accel * sens / r.height * this.zoom.s));
    if (g.dragArmed && !this.dragging) { this.dragging = true; this.sendButton(0, true, this.cursor.x, this.cursor.y); }
    this.sendMove(this.cursor.x, this.cursor.y);
    this.updateGhost(); this.follow();
  }
  twoMove(g) {
    const [a, b] = [...this.touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const dcx = cx - g.cx, dcy = cy - g.cy;
    const now = performance.now(), dt = Math.max(1, now - g.lt);
    if (!g.pinch && !g.scroll) {
      if (Math.abs(d - g.d0) > 22) g.pinch = true;
      else if (Math.hypot(cx - g.sx, cy - g.sy) > 10) {
        g.scroll = true;
        // Uzakta kaydırılacak yer: hareketin başladığı orta nokta (dokunuşlarla aynı
        // eşleme; yakınlaştırma dahil). Hareket ve atalet boyunca sabit kalır.
        this.scrollAt = this.wheelPoint(g.sx, g.sy);
      }
    }
    if (g.pinch) {
      this.zoomAt(cx, cy, d / (g.d || g.d0));
      this.panBy(dcx, dcy);
    } else if (g.scroll) {
      if (this.zoom.s > 1.01) this.panBy(dcx, dcy);
      else this.scrollBy(dcx, dcy);
      g.vx = g.vx * 0.6 + (dcx / dt) * 0.4;
      g.vy = g.vy * 0.6 + (dcy / dt) * 0.4;
    }
    g.moved = g.moved || g.pinch || g.scroll;
    g.d = d; g.cx = cx; g.cy = cy; g.lt = now;
  }
  // wheelPoint iki parmakla kaydırmanın uzak bilgisayardaki yeri: Touchpad'de
  // imleç (parmaklar imleci sürer), diğer modlarda parmakların orta noktası.
  wheelPoint(cx, cy) {
    if (this.mode === 'touchpad') return { x: this.cursor.x, y: this.cursor.y };
    const p = this.norm(cx, cy);
    return { x: clamp01(p.x), y: clamp01(p.y) };
  }
  // scrollBy parmak hareketini uzak tekerleğe çevirir (doğal kaydırma yönü).
  scrollBy(dx, dy) {
    const k = this.app.settings.scrollSpeed || 3;
    this.wheelAcc.x -= dx * k; this.wheelAcc.y += dy * k;
    const wx = Math.trunc(this.wheelAcc.x), wy = Math.trunc(this.wheelAcc.y);
    if (wx || wy) { this.wheelAcc.x -= wx; this.wheelAcc.y -= wy; this.sendWheel(wx, wy, this.scrollAt); }
  }
  // Parmak kalkınca iOS'taki gibi yavaşlayarak süren kaydırma.
  startMomentum(vx, vy) {
    if (Math.hypot(vx, vy) < 0.25) return;
    let last = performance.now();
    const step = () => {
      const now = performance.now(), dt = Math.min(48, now - last);
      last = now;
      const f = Math.pow(0.995, dt);
      vx *= f; vy *= f;
      this.scrollBy(vx * dt, vy * dt);
      if (Math.hypot(vx, vy) > 0.03) this.momentum = requestAnimationFrame(step);
    };
    this.momentum = requestAnimationFrame(step);
  }
  stopMomentum() { if (this.momentum) cancelAnimationFrame(this.momentum); this.momentum = 0; }
  touchUp(e, cancel) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.fx.owner === t || !this.touches.size) this.fxStop();
    if (this.edge?.t === t) this.edgeStop();
    if (this.mode === 'tablet' && !t.local) {
      let quick = false;
      if (t.pending) { clearTimeout(t.timer); if (!cancel) { this.tabletCommit(t); quick = true; } else t.pending = false; }
      if (t.sent) {
        t.sent = false;
        // Çok hızlı dokunuşta "kaldır"ı biraz geciktir: bazı uygulamalar sıfır süreli dokunuşu yok sayar.
        const up = { id: t.id, x: t.x, y: t.y, ox: t.ox, oy: t.oy };
        if (quick) setTimeout(() => this.tabletEvent(up, cancel ? 3 : 2), 40);
        else this.tabletEvent(up, cancel ? 3 : 2);
      }
      this.noteTap(t, cancel, this.gesture);
      if (!this.touches.size) this.gesture = null;
      return;
    }
    const g = this.gesture;
    if (!g || this.touches.size > 0) return;
    const dur = performance.now() - g.t0;
    this.gesture = null;
    if (g.kind === 'two') {
      if (cancel) return;
      if (g.maxN === 3 && this.threeTap(g)) return;
      if (g.scroll && this.zoom.s <= 1.01) this.startMomentum(g.vx, g.vy);
      if (!g.moved && dur < 300 && g.maxN === 2) {
        const now = performance.now();
        const at = this.mode === 'touchpad' ? this.cursor : this.norm(g.cx, g.cy);
        clearTimeout(this.twoTapTimer);
        if (this.lastTwoTap && now - this.lastTwoTap < 350) { this.lastTwoTap = 0; this.resetZoom(); return; }
        this.lastTwoTap = now;
        this.twoTapTimer = setTimeout(() => this.click(2, at.x, at.y), 300); // iki parmak dokunuş = sağ tık
      }
      return;
    }
    if (this.dragging) return this.endDrag();
    if (cancel || g.longDone || t.moved || g.maxN > 1) return;
    if (this.mode === 'direct') {
      const q = this.at(t), p = this.norm(q.x, q.y);
      this.cursor = { x: p.x, y: p.y };
      this.click(0, p.x, p.y);
      this.noteTap(t, false, g);
    } else {
      this.click(0, this.cursor.x, this.cursor.y);
      this.lastTap = { t: performance.now(), x: t.x, y: t.y };
    }
  }
  longPress(t) {
    if (!this.gesture || t.moved || this.touches.size !== 1) return;
    this.gesture.longDone = true;
    const q = this.at(t);
    const p = this.mode === 'direct' ? this.norm(q.x, q.y) : this.cursor;
    this.click(2, p.x, p.y);
  }
  endDrag() {
    this.dragging = false;
    this.flushMove();
    this.sendButton(0, false, this.cursor.x, this.cursor.y);
  }

  // ---- çift dokunuşu yakalama ----
  // 4K bir ekran telefona sığınca telefonun bir CSS pikseli uzakta 3–10 piksel
  // eder; parmağın iki dokunuşu arasındaki birkaç piksellik fark Windows'un çift
  // tıklama payını (birkaç piksel) aşar ve çift tık iki ayrı tık olur. Temiz bir
  // dokunuşun hemen ardından (SNAP_MS) yakınına (SNAP_PX) gelen dokunuş, ilkinin
  // gönderilen noktasına gönderilir; parmak sonra sürüklenirse fark bütün harekete
  // uygulanır (sıçrama olmaz). Üçlü dokunuşta zincir sürer.
  snapTo(t) {
    const s = this.tapSnap;
    if (!s || s.mode !== this.mode || t.t0 - s.t > SNAP_MS || Math.hypot(t.sx - s.x, t.sy - s.y) > SNAP_PX) return;
    t.ox = s.x - t.sx; t.oy = s.y - t.sy;
  }
  // noteTap temiz bir tek parmak dokunuşunun gönderilen noktasını saklar.
  noteTap(t, cancel, g) {
    const now = performance.now();
    if (cancel || t.moved || t.local || now - t.t0 > TAP_MS || (g && (g.maxN > 1 || g.longDone))) { this.tapSnap = null; return; }
    const q = this.at0(t);
    this.tapSnap = { t: now, x: q.x, y: q.y, mode: this.mode };
  }

  // ---- büyüteç ve basılı tutma halkası (loupe.js) ----
  loupeWanted() { return (this.mode === 'tablet' || this.mode === 'direct') && this.app.settings.loupe !== false; }
  fxStart(t) {
    clearTimeout(this.loupeTimer); this.loupeTimer = 0;
    if (this.loupeWanted()) this.loupeTimer = setTimeout(() => this.loupeDue(t), LOUPE_MS);
    const tablet = this.mode === 'tablet', q = this.at0(t);
    this.fx.holdStart(t, t.x, t.y, q, tablet ? HOLD_TABLET_DELAY : HOLD_DELAY, tablet ? HOLD_TABLET_MS : HOLD_MS);
  }
  loupeDue(t) {
    this.loupeTimer = 0;
    if (this.touches.get(t.id) !== t || this.touches.size !== 1 || t.local || !this.loupeWanted()) return;
    this.fx.loupeOn(t, t.x, t.y, this.at(t));
  }
  // fxMove: parmak oynadı. Büyüteç yavaş sürüklemede (SLOW_MS sonra) ya da parmak
  // durunca (STILL_MS sonra) açılır, hızlı harekette kapanır; parmak belirgin
  // oynayınca basılı tutma yoktur.
  fxMove(t) {
    const fx = this.fx;
    fx.track(t, t.x, t.y, this.at(t));
    if (!t.moved) return;
    fx.holdStop();
    if (!this.loupeWanted()) return;
    if (fx.loupeShown) { if (t.v > SLOW_OFF) { fx.loupeOff(); this.armLoupe(t, STILL_MS); } return; }
    if (t.v < SLOW_ON) { if (!this.loupeTimer) this.armLoupe(t, SLOW_MS); }
    else this.armLoupe(t, STILL_MS); // hızlı: her harekette yeniden kurulur, parmak durunca dolar
  }
  armLoupe(t, ms) { clearTimeout(this.loupeTimer); this.loupeTimer = setTimeout(() => this.loupeDue(t), ms); }
  fxStop() { clearTimeout(this.loupeTimer); this.loupeTimer = 0; this.fx.stop(); }

  // ---- yakınlaştırılmışken sürüklerken kenarda kaydırma ----
  // Parmak görünür alanın kenarındaki şeride girip EDGE_MS kalınca görünüm o yöne
  // kayar; hız şeridin derinliğinin karesiyle artar (en çok EDGE_SPEED px/sn). Her
  // adımdan sonra parmağın uzaktaki yeri yeniden gönderilir: sürüklenen öğe de
  // görünümle birlikte gider. Dokunuş şeridin içinde başladıysa önce şeritten
  // çıkılmalı (kenardaki bir öğeyi tutmak hemen kaydırmasın).
  edgeDepth(t) {
    const sr = this.stage.getBoundingClientRect();
    const vis = this.app.visibleArea ? this.app.visibleArea() : { top: 0, h: sr.height };
    const top = sr.top + vis.top, bot = top + vis.h;
    const bx = Math.min(EDGE_PX, sr.width * 0.1), by = Math.min(EDGE_PX, vis.h * 0.1);
    let x = 0, y = 0;
    if (t.x < sr.left + bx) x = -clamp01((sr.left + bx - t.x) / bx);
    else if (t.x > sr.right - bx) x = clamp01((t.x - (sr.right - bx)) / bx);
    if (t.y < top + by) y = -clamp01((top + by - t.y) / by);
    else if (t.y > bot - by) y = clamp01((t.y - (bot - by)) / by);
    return { x, y, any: x !== 0 || y !== 0 };
  }
  edgeCheck(t) {
    if (this.zoom.s <= 1.05) return this.edgeStop();
    const d = this.edgeDepth(t);
    if (!t.edgeArmed) { if (!d.any) t.edgeArmed = true; return; }
    if (!d.any) return this.edgeStop();
    if (this.edge?.t === t) return;
    this.edgeStop();
    const now = performance.now();
    this.edge = { t, since: now, last: now, raf: requestAnimationFrame(() => this.edgeTick()) };
  }
  edgeTick() {
    const e = this.edge;
    if (!e) return;
    const t = e.t;
    if (this.touches.get(t.id) !== t || this.touches.size !== 1 || this.zoom.s <= 1.05 || (this.mode === 'direct' && !this.dragging) || (this.mode === 'tablet' && !t.sent)) return this.edgeStop();
    const d = this.edgeDepth(t);
    if (!d.any) return this.edgeStop();
    const now = performance.now(), dt = Math.min(48, now - e.last);
    e.last = now;
    if (now - e.since >= EDGE_MS) {
      const step = (v) => -Math.sign(v) * EDGE_SPEED * v * v * dt / 1000;
      const zx = this.zoom.x, zy = this.zoom.y;
      this.panBy(step(d.x), step(d.y));
      if (this.zoom.x !== zx || this.zoom.y !== zy) this.dragResend(t);
    }
    e.raf = requestAnimationFrame(() => this.edgeTick());
  }
  edgeStop() { if (this.edge) cancelAnimationFrame(this.edge.raf); this.edge = null; }
  // dragResend görünüm kayınca parmağın (yerinde duran) noktasını yeni uzak noktaya gönderir.
  dragResend(t) {
    const q = this.at(t);
    if (this.mode === 'tablet') { if (t.sent) this.tabletEvent(t, 1); }
    else if (this.mode === 'direct' && this.dragging) {
      const p = this.norm(q.x, q.y);
      this.cursor = { x: clamp01(p.x), y: clamp01(p.y) };
      this.sendMove(p.x, p.y); this.updateGhost();
    }
    this.fx.track(t, t.x, t.y, q);
  }

  // ---- üç parmakla dokunma = klavye ----
  // Üç parmak 250 ms içinde inip toplam 400 ms içinde, belirgin oynamadan
  // kalkarsa klavye açılır ya da kapanır. Araç çubuğundaki ⌨ düğmesi de çalışır.
  threeTap(g) {
    const now = performance.now();
    if (!isTouchDevice() || g.moved || (g.maxD || 0) >= KB3_PX || !g.t3 || g.t3 - g.t1 > KB3_SPREAD || now - g.t1 > KB3_MAX) return false;
    clearTimeout(this.twoTapTimer);
    this.toggleKeyboard();
    return true;
  }

  // Dokunulan yerde anında görsel geri bildirim (ağ gecikmesini hissettirmez).
  ripple(x, y) {
    const sr = this.stage.getBoundingClientRect();
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = (x - sr.left) + 'px'; r.style.top = (y - sr.top) + 'px';
    this.stage.appendChild(r);
    setTimeout(() => r.remove(), 500);
  }

  // Tablet modu: gerçek çoklu dokunuşu Windows'a ilet (Windows kendi hareketlerini tanır).
  // t.ox/t.oy: çift dokunuş yakalamasının düzeltmesi (varsa).
  tabletEvent(t, state) {
    let id = this.touchIds.get(t.id);
    if (id === undefined) {
      if (state !== 0) return;
      const used = new Set(this.touchIds.values());
      id = 0; while (used.has(id)) id++;
      this.touchIds.set(t.id, id);
    }
    if (state >= 2) this.touchIds.delete(t.id);
    const p = this.norm(t.x + (t.ox || 0), t.y + (t.oy || 0));
    const x = Math.max(0, Math.min(1, p.x)), y = Math.max(0, Math.min(1, p.y));
    this.cursor = { x, y };
    if (state === 0) this.app.calib?.tap(x, y);
    this.touchPending = this.touchPending || new Map();
    this.touchPending.set(id, [id, state, x, y]);
    if (state !== 1) return this.flushTouch();
    if (!this.touchTimer) this.touchTimer = setTimeout(() => this.flushTouch(), 8);
  }
  flushTouch() {
    clearTimeout(this.touchTimer); this.touchTimer = null;
    const list = [...(this.touchPending || new Map()).values()];
    this.touchPending = new Map();
    if (!list.length) return;
    const b = new DataView(new ArrayBuffer(2 + list.length * 6));
    b.setUint8(0, TOUCH); b.setUint8(1, list.length);
    list.forEach(([id, st, x, y], i) => {
      const o = 2 + i * 6;
      b.setUint8(o, id); b.setUint8(o + 1, st); b.setUint16(o + 2, u16(x), true); b.setUint16(o + 4, u16(y), true);
    });
    this.s?.sendIn(b.buffer);
  }
  releaseTouches() {
    if (this.touchIds?.size) {
      for (const [pid] of this.touchIds) this.tabletEvent({ id: pid, x: 0, y: 0 }, 3);
    }
    this.touches.clear(); this.touchIds.clear();
    if (this.dragging) this.endDrag();
    this.gesture = null;
    this.fxStop(); this.edgeStop();
    this.tapSnap = null;
  }

  // ---- klavye ----
  focusSink() {
    if (isTouchDevice()) return; // telefonda klavye yalnızca istenince açılsın
    if (document.activeElement !== this.sink) this.sink.focus({ preventScroll: true });
  }
  showKeyboard() {
    this.sink.value = this.sinkBase;
    this.sinkPrev = this.sink.value;
    this.sink.focus({ preventScroll: true });
    this.sink.setSelectionRange(this.sink.value.length, this.sink.value.length);
  }
  hideKeyboard() { this.sink.blur(); }
  toggleKeyboard() {
    const open = document.activeElement === this.sink;
    if (open) this.hideKeyboard(); else this.showKeyboard();
    this.kbWant = open ? 0 : performance.now();
  }
  // kbRetry: klavye açma isteği pointerup içinde iOS'a geçmediyse (odak
  // alınamadı) aynı dokunuşun touchend olayında bir kez daha dener.
  kbRetry() {
    if (!this.kbWant) return;
    const fresh = performance.now() - this.kbWant < 500;
    this.kbWant = 0;
    if (fresh && document.activeElement !== this.sink) this.showKeyboard();
  }

  onKey(e, down) {
    if (!this.active()) return;
    const tgt = e.target;
    if (tgt !== this.sink && tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    if (this.app.modalOpen) return;
    // Yerel kısayol: Ctrl+Alt+Shift+F tam ekran, Ctrl+Alt+Shift+Q ayrıl.
    if (down && e.ctrlKey && e.altKey && e.shiftKey) {
      if (e.code === 'KeyF') { e.preventDefault(); this.app.toggleFullscreen(); return; }
      if (e.code === 'KeyQ') { e.preventDefault(); this.app.disconnect(); return; }
    }
    let code = e.code;
    if (isMac && this.app.settings.macCmd !== false) {
      if (code === 'MetaLeft') code = 'ControlLeft';
      else if (code === 'MetaRight') code = 'ControlRight';
      else if (code === 'ControlLeft') code = 'MetaLeft';
    }
    const sc = scancodeFor({ code, key: e.key });
    // Dokunmatik cihazda yazılabilir karakterler gizli metin alanının 'input'
    // olayıyla işlenir (IME, dikte, uzun basmayla ş/ğ). Bu yalnız alan odaktayken
    // geçerli: iPad'e bağlı donanım klavyesinde alan odakta değilken 'input' hiç
    // gelmez; harfler burada atlanırsa kaybolurdu. O zaman masaüstündeki gibi
    // tuş olarak gönderilir.
    const viaSink = isTouchDevice() && tgt === this.sink;
    const mods = e.ctrlKey || e.altKey || e.metaKey;
    if (viaSink && (e.keyCode === 229 || (e.key.length === 1 && !mods) || !sc)) return;
    if (!sc) {
      if (down && e.key.length === 1 && !mods) { e.preventDefault(); this.sendText(e.key); }
      return;
    }
    const ctrlHeld = this.keysDown.has(SC.ControlLeft) || this.keysDown.has(SC.ControlRight);
    if (code === 'KeyV' && ctrlHeld && !e.shiftKey && !e.altKey && this.app.settings.syncClipboard !== false) {
      // Yapıştır: önce yerel panoyu uzak panoya aktar (paste olayı), sonra Ctrl+V.
      if (down) {
        this.pasteV = true;
        this.app.clip.beginPaste(() => { this.tap(SC.KeyV); this.pasteV = false; });
      }
      return; // varsayılanı engelleme: tarayıcı 'paste' olayını tetiklesin
    }
    e.preventDefault();
    if (down) this.syncMods(e, code);
    if ((code === 'KeyC' || code === 'KeyX') && ctrlHeld && down) this.app.clip.expectCopy(e);
    if (!down && !this.keysDown.has(sc)) return;
    this.sendKey(sc, down);
  }

  // Değiştirici tuş durumunu olaydan eşitle: kaçırılan keyup/keydown (ör. yerelde Alt+Tab)
  // uzakta takılı kalmış Shift/Ctrl/Alt bırakmasın veya eksik Shift yanlış harf yazdırmasın.
  syncMods(e, code) {
    const mac = isMac && this.app.settings.macCmd !== false;
    const want = [
      [e.shiftKey, SC.ShiftLeft, SC.ShiftRight],
      [mac ? e.metaKey : e.ctrlKey, SC.ControlLeft, SC.ControlRight],
      [e.altKey, SC.AltLeft, SC.AltRight],
      [mac ? e.ctrlKey : e.metaKey, SC.MetaLeft, SC.MetaRight],
    ];
    const self = SCANCODE_OF(code);
    for (const [on, l, r] of want) {
      if (self === l || self === r) continue;
      const held = this.keysDown.has(l) || this.keysDown.has(r);
      if (on && !held) this.sendKey(l, true);
      else if (!on && held && !this.sticky.has(l) && !this.sticky.has(r)) { if (this.keysDown.has(l)) this.sendKey(l, false); if (this.keysDown.has(r)) this.sendKey(r, false); }
    }
  }

  onSinkInput() {
    // Mobil klavye: önceki ve yeni metni karşılaştır, farkı gönder.
    const prev = this.sinkPrev ?? this.sinkBase;
    const cur = this.sink.value;
    const { dels, ins } = sinkDiff(prev, cur);
    for (let i = 0; i < dels; i++) this.tap(SC.Backspace);
    if (ins) this.sendText(ins.replace(/\r/g, ''));
    this.sinkPrev = cur;
    if (!this.composing && (cur.length < 16 || cur.length > 400)) {
      this.sink.value = this.sinkBase; this.sinkPrev = this.sinkBase;
    }
  }
}
