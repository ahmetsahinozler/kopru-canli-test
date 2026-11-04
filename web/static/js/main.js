import { Signal, RemoteSession, supports444, wsBase, hmac } from './session.js';
import { PresenceHub } from './mqtt.js';
import { WsVideo, pickWsProfile } from './wsvideo.js';
import { markBadProfile } from './profiles.js';
import { Input, isTouchDevice, isMac } from './input.js';
import { Clip } from './clip.js';
import { Files, fmtSize } from './files.js';
import { SC } from './keymap.js';
import { RemoteAudio } from './audio.js';
import { Calib } from './calib.js';

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); if (v == null) return d; return Array.isArray(d) ? v : { ...d, ...v }; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const fmtId = (id) => (id || '').replace(/\D/g, '').replace(/(\d{3})(?=\d)/g, '$1 ').trim();
// Uzak bilgisayarın işlemci yüküne göre otomatik kademe (ajan bildirir).
const perfText = (p) => ['Tam', 'Hafif kodlama (işlemci yoğun)', '45 fps (işlemci yoğun)', '30 fps (işlemci yoğun)'][p || 0];
const isPhone = () => Math.min(screen.width, screen.height) < 600;
// SURUM bu istemcinin sürümü (ajanınkiyle aynı tutulur; web/surum_test.go denetler).
const SURUM = '1.2.9';
// Apple çözücüsü (iPhone/iPad'deki tüm tarayıcılar ve Mac Safari) çok dilimli
// H.264 karelerinde bazı dilimleri çözemiyor, görüntü bantlar halinde gri
// kalıyordu; bu cihazlara kare tek dilim gönderilir.
// dcVideoWanted: görüntü RTP yerine veri kanalından + WebCodecs ile mi gelsin.
// Apple cihazlarında varsayılan (Safari'nin WebRTC görüntü katmanı bantlar halinde
// gri/bozuk gösteriyordu; aynı kareler WebCodecs ile düzgün çözülüyor).
// localStorage 'kopru.dcvideo' = '1'/'0' ile zorlanabilir (test/hata ayıklama).
const dcVideoWanted = () => { const f = localStorage.getItem('kopru.dcvideo'); return f ? f === '1' : appleDecoder(); };
// dcAudioWanted: ses Safari'nin WebRTC ses katmanı yerine veri kanalından + kendi tamponumuzla mı çalsın.
const dcAudioWanted = () => localStorage.getItem('kopru.dcaudio') !== '0' && RemoteAudio.wsSupported();
const appleDecoder = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(navigator.userAgent));
// cmpVer "1.2.10" > "1.2.9" gibi sayısal karşılaştırır.
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };

const DEFAULTS = { mode: 'auto', sensitivity: 1.2, wake: true, syncClipboard: true, quality: 'balanced', fps: 60, scale: isTouchDevice() ? 0 : 1, scaleMode: 'fit', prefer444: true, macCmd: true, audio: true, maxKbps: 0 };

class App {
  constructor() {
    this.settings = load('kopru.settings', DEFAULTS);
    // 1.2.3: telefon/tablette çözünürlük varsayılanı "Yerel"den "Otomatik"e geçti; eski kayıtları taşı.
    if ((this.settings.v || 0) < 2) {
      if (this.settings.scale === 1 && isTouchDevice()) this.settings.scale = 0;
      this.settings.v = 2;
      this.saveSettings();
    }
    this.book = load('kopru.book', []);
    this.caps = {};
    this.session = null;
    this.viewerActive = false;
    this.modalOpen = false;
    this.cursors = new Map();
    // Çalışma biçimi: "p2p" (sunucusuz, varsayılan) veya "server" (kendi sunucunuz).
    this.mode = localStorage.getItem('kopru.mode') || 'p2p';
    this.setupMode();
    this.input = new Input(this);
    this.calib = new Calib(this);
    this.audio = new RemoteAudio(this.$('audio'));
    this.audio.enabled = this.settings.audio !== false;
    this.audio.onblocked = () => { if (this.viewerActive && !this.audioHint) { this.audioHint = true; this.toast('Sesi açmak için ekrana bir kez dokunun'); } };
    this.clip = new Clip(this);
    this.files = new Files(this);
    this.bindHome();
    this.bindViewer();
    this.renderBook();
    setInterval(() => this.pollStatus(), 15000);
    window.addEventListener('online', () => { this.session?.nudge(); this.session?.nudgeWS(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.session?.nudge(); this.requestWake(); } });
    // Geri hareketi (iPhone'da kenardan kaydırma, Android geri tuşu) oturumu yanlışlıkla kapatmasın.
    window.addEventListener('popstate', () => {
      if (!this.viewerActive) return;
      history.pushState({ v: 1 }, '', '#oturum');
      this.toast('Bağlantıyı kesmek için araç çubuğundaki ✕ düğmesini kullanın', { timeout: 3000 });
    });
    const m = /[#&]id=(\d{9})/.exec(location.hash);
    if (m) this.$('in-id').value = fmtId(m[1]);
    this.handleInstallLink();
    fetch('api/info').then((r) => r.json()).then((i) => {
      if (i.mode && i.mode !== this.mode) { this.mode = i.mode; localStorage.setItem('kopru.mode', i.mode); this.setupMode(); }
      this.$('foot').textContent = `Köprü ${SURUM}` + (i.ver && i.ver !== SURUM ? ` · bilgisayar ${i.ver}` : '') + (this.mode === 'server' ? ` · ${location.host}` : '');
      if (i.agentDownload && !isTouchDevice()) {
        this.$('share-card').classList.remove('hidden');
        if (i.agentKeyRequired) {
          const k = new URLSearchParams(location.search).get('anahtar');
          if (k) this.$('dl-agent').href = 'indir/kopru.exe?anahtar=' + encodeURIComponent(k);
          else this.$('share-card').classList.add('hidden');
        }
      }
    }).catch(() => {});
    this.$('foot').textContent ||= `Köprü ${SURUM}`;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (e) => this.onSwMsg(e.data || {}));
    }
  }

  // ================= Kendini güncelleme =================
  // Ana ekran uygulaması ilk eklendiği adrese bağlıdır; bilgisayarın adresi
  // değişince yeni sürümü kendiliğinden göremez. Parolası doğrulanmış bir
  // bağlantıda bilgisayarın Köprü'sü daha yeniyse, servis çalışanı yeni kabuğu
  // bilgisayarın güncel adresinden alır; bağlantı bitince uygulama yeni sürümle açılır.
  selfUpdate(ver) {
    const sw = navigator.serviceWorker?.controller;
    const base = this.agentBase || location.origin;
    if (!sw || !ver || cmpVer(ver, SURUM) <= 0 || this.updating === ver) return;
    this.updating = ver;
    sw.postMessage({ t: 'guncelle', u: base });
  }

  onSwMsg(m) {
    if (m.t === 'guncellendi' && m.ver && cmpVer(m.ver, SURUM) > 0) {
      this.updateReady = m.ver;
      this.toast(`Köprü ${m.ver} indirildi; bağlantı bitince yeni sürümle açılacak`, { timeout: 5000 });
      if (!this.viewerActive) location.reload();
    } else if (m.t === 'guncellenemedi') {
      this.updating = null;
      console.warn('Köprü güncellenemedi:', m.err);
    }
  }

  $(id) { return document.getElementById(id); }

  // ================= Ana ekran =================
  bindHome() {
    const idIn = this.$('in-id');
    idIn.addEventListener('input', () => { const p = idIn.selectionStart; const before = idIn.value.length; idIn.value = fmtId(idIn.value); idIn.setSelectionRange(p + idIn.value.length - before, p + idIn.value.length - before); });
    this.$('connect-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = idIn.value.replace(/\D/g, '');
      if (id.length !== 9) return this.showErr('Kimlik 9 haneli olmalı');
      const saved = this.book.find((b) => b.id === id);
      const pw = this.$('in-pw').value;
      this.connect(id, { password: pw || null, key: pw ? null : saved?.key, salt: pw ? null : saved?.salt, remember: this.$('in-remember').checked });
    });
    this.$('btn-settings').onclick = () => this.openSettings();
  }

  showErr(msg) { this.$('connect-err').textContent = msg || ''; }

  renderBook() {
    const box = this.$('book');
    box.innerHTML = '';
    if (!this.book.length) { box.innerHTML = '<div class="muted">Henüz kayıtlı bilgisayar yok. Bağlandığınızda burada görünür.</div>'; return; }
    const sorted = [...this.book].sort((a, b) => (b.last || 0) - (a.last || 0));
    for (const b of sorted) {
      const el = document.createElement('div');
      el.className = 'book-item';
      el.innerHTML = `<div class="dot ${this.isOnline(b.id) ? 'on' : 'off'}"></div>
        <div class="bi-text"><div class="bi-name"></div><div class="bi-id muted small"></div></div>
        <button class="primary">Bağlan</button><button class="icon-btn more" title="Seçenekler">⋯</button>`;
      el.querySelector('.bi-name').textContent = b.name || 'Bilgisayar';
      el.querySelector('.bi-id').textContent = fmtId(b.id) + (b.key ? ' · parola kayıtlı' : '');
      el.querySelector('.primary').onclick = () => this.connect(b.id, { key: b.key, salt: b.salt, remember: !!b.key });
      el.querySelector('.more').onclick = () => {
        const act = prompt(`${b.name || fmtId(b.id)}\n\nYeni ad yazın veya silmek için "sil" yazın:`, b.name || '');
        if (act == null) return;
        if (act.trim().toLowerCase() === 'sil') this.book = this.book.filter((x) => x.id !== b.id);
        else b.name = act.trim();
        save('kopru.book', this.book); this.renderBook();
      };
      box.appendChild(el);
    }
  }

  pollStatus() {
    if (this.mode === 'server') { if (this.book.length && this.sig?.ready) this.sig.send({ t: 'status', ids: this.book.map((b) => b.id) }); }
    else for (const b of this.book) this.hub?.watch(b.id);
  }
  isOnline(id) { return this.mode === 'server' ? this.online?.[id] : this.hub?.online(id); }
  onSig(m) { if (m.t === 'status') { this.online = m.online; if (!this.viewerActive) this.renderBook(); } }

  setupMode() {
    if (this.mode === 'server') {
      if (!this.sig) {
        this.sig = new Signal();
        this.sig.addEventListener('msg', (e) => this.onSig(e.detail));
        this.sig.addEventListener('open', () => this.pollStatus());
      }
    } else if (!this.hub) {
      const q = new URLSearchParams(location.search).get('mqtt');
      this.hub = new PresenceHub(q ? q.split(',') : undefined);
      this.hub.addEventListener('change', () => { if (!this.viewerActive) this.renderBook(); });
      for (const b of this.book) this.hub.watch(b.id);
    }
  }

  // QR koddan gelindiyse (…/#ekle=ID&ad=AD) bilgisayarı listeye ekle ve ana ekran yönergesini göster.
  handleInstallLink() {
    const h = new URLSearchParams(location.hash.slice(1));
    const id = (h.get('ekle') || '').replace(/\D/g, '');
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    if (id.length === 9) {
      if (!this.book.find((b) => b.id === id)) { this.book.push({ id, name: h.get('ad') || 'Bilgisayar', last: Date.now() }); save('kopru.book', this.book); }
      this.hub?.watch(id);
      this.renderBook();
      this.$('in-id').value = fmtId(id);
      this.$('install-added').textContent = `"${h.get('ad') || fmtId(id)}" listeye eklendi. Bağlanmak için parolasını girmeniz yeterli.`;
      history.replaceState(null, '', location.pathname);
    }
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !standalone) this.$('install-banner').classList.remove('hidden');
  }

  // findDevice ilan panosundan bilgisayarın güncel adresini bulur; parola anahtarı
  // biliniyorsa imzası doğrulanan ilanı tercih eder (sahte ilanlara karşı).
  async findDevice(id, key) {
    const p = await this.hub.find(id, 8000);
    if (!p) return null;
    if (key) {
      for (const e of this.hub.all(id)) {
        try { if (await hmac(key, 'kopru-p1', id, e.u, String(e.t)) === e.m) return e; } catch {}
      }
    }
    return p;
  }

  surfaceSize() {
    const c = this.$('vcanvas'), v = this.$('video');
    return this.wsv ? { w: c.width, h: c.height } : { w: v.videoWidth, h: v.videoHeight };
  }

  remember(id, data) {
    let b = this.book.find((x) => x.id === id);
    if (!b) { b = { id }; this.book.push(b); }
    Object.assign(b, data, { last: Date.now() });
    save('kopru.book', this.book);
  }

  openSettings() {
    const d = this.$('settings-dlg');
    this.$('set-mode').value = this.settings.mode;
    this.$('set-sens').value = this.settings.sensitivity;
    this.$('set-wake').checked = this.settings.wake;
    this.$('set-clear').onclick = () => { if (confirm('Tüm kayıtlı bilgisayarlar ve parolalar silinsin mi?')) { this.book = []; save('kopru.book', []); this.renderBook(); } };
    d.onclose = () => {
      this.settings.mode = this.$('set-mode').value;
      this.settings.sensitivity = parseFloat(this.$('set-sens').value);
      this.settings.wake = this.$('set-wake').checked;
      this.saveSettings();
    };
    d.showModal();
  }
  saveSettings() { save('kopru.settings', this.settings); }

  // Ses: ajan destekliyorsa ve (tünel modunda) tarayıcı Opus çözebiliyorsa.
  audioPossible() {
    if (!this.caps.audio) return false;
    return !this.session?.wsMode || RemoteAudio.wsSupported();
  }

  renderAudio() {
    const b = this.$('tb-audio');
    const on = this.settings.audio !== false;
    b.textContent = on ? '🔊' : '🔇';
    b.title = this.audioErr ? 'Ses yok: ' + this.audioErr : on ? 'Sesi kapat' : 'Sesi aç';
    b.classList.toggle('on', on && !!this.audioOn);
  }

  askPassword(sess, title, sub) {
    return new Promise((resolve) => {
      const d = this.$('pw-dlg');
      this.$('pw-title').textContent = title || `${sess.peerName || fmtId(sess.id)} parolası`;
      this.$('pw-sub').textContent = sub || 'Uzak bilgisayardaki Köprü penceresinde görünen parolayı girin.';
      this.$('pw-input').value = '';
      this.modalOpen = true;
      const done = (v) => { this.modalOpen = false; d.close(); resolve(v); };
      this.$('pw-form').onsubmit = (e) => { e.preventDefault(); this.pwRemember = this.$('pw-remember').checked; done(this.$('pw-input').value); };
      this.$('pw-cancel').onclick = () => done(null);
      d.oncancel = () => done(null);
      d.showModal();
      this.$('pw-input').focus();
    });
  }

  // ================= Bağlantı =================
  async connect(id, { password, key, salt, remember }) {
    if (this.session) { this.userClosed = true; this.session.close(); }
    this.showErr('');
    this.fitSt = { want: null, asked: false, ctl: -1 }; // "telefona uydur" önerisi (bu bağlantı)
    this.hideFitAsk();
    this.pwRemember = remember;
    let signal = this.sig, own = false;
    this.agentBase = null;
    if (this.mode !== 'server') {
      this.enterViewer(id);
      this.$('overlay-text').textContent = 'Bilgisayar aranıyor…';
      this.hub.watch(id);
      const p = await this.findDevice(id, key);
      if (!this.viewerActive) return;
      if (!p) {
        this.leaveViewer();
        this.showErr(this.hub.connected() ? 'Bilgisayar bulunamadı: kapalı olabilir veya Köprü çalışmıyor olabilir.' : 'İnternet bağlantısı yok gibi görünüyor.');
        return;
      }
      signal = new Signal(wsBase(p.u) + '/ws/client');
      this.agentBase = p.u;
      signal.resolve = async () => { const q = await this.findDevice(id, this.session?.key || key); return q ? wsBase(q.u) + '/ws/client' : null; };
      own = true;
    }
    const wsProf = await pickWsProfile();
    const s = new RemoteSession({
      signal, id, password, key, salt,
      wsProfile: wsProf || 'high', noFallback: !wsProf,
      dcVideo: !!wsProf && dcVideoWanted() && !/[?&]transport=ws/.test(location.search),
      dcAudio: !!wsProf && dcVideoWanted() && dcAudioWanted() && !/[?&]transport=ws/.test(location.search),
      forceWS: /[?&]transport=ws/.test(location.search),
      prefer444: this.settings.prefer444 && !isTouchDevice(),
      forceRelay: /[?&]relay=1/.test(location.search), // hata ayıklama: yalnızca TURN aktarıcısı
      askPassword: (sess) => this.askPassword(sess),
    });
    this.session = s;
    s.ownSignal = own;
    if (!this.viewerActive) this.enterViewer(id);
    s.addEventListener('state', (e) => this.onState(e.detail));
    s.addEventListener('authed', (e) => {
      const d = e.detail;
      if (this.pwRemember) this.remember(id, { name: d.name, key: d.key, salt: d.salt });
      else this.remember(id, { name: d.name, key: undefined, salt: undefined });
      this.$('tb-name').textContent = d.name || fmtId(id);
    });
    s.addEventListener('badpassword', () => { this.remember(id, { key: undefined, salt: undefined }); });
    s.addEventListener('notice', (e) => this.toast(e.detail.text, { level: e.detail.level, timeout: 6000 }));
    s.addEventListener('track', (e) => { const v = this.$('video'); v.srcObject = e.detail; v.play().catch(() => {}); });
    s.addEventListener('ctlopen', () => this.onCtlOpen());
    s.addEventListener('ctl', (e) => this.onCtl(e.detail));
    s.addEventListener('mv', (e) => this.onMv(e.detail));
    s.addEventListener('fs', (e) => this.files.onData(e.detail));
    s.addEventListener('wsmode', () => this.useCanvas(s));
    s.addEventListener('dcvideo', () => this.useCanvas(s));
    // Kareyi çizen yoksa (görüntü yolu değişirken) hemen onayla: bilgisayar onaysız kareyi yolda sanıp beklerdi.
    s.addEventListener('wsvideo', (e) => { const d = e.detail; if (this.wsv && s === this.session) this.wsv.push(d.data, d.seq, d.ack); else d.ack(d.seq); });
    s.addEventListener('audiotrack', (e) => this.audio.setStream(e.detail));
    s.addEventListener('wsaudio', (e) => this.audio.pushOpus(e.detail));
    s.addEventListener('dcaudio', (e) => this.audio.pushOpus(e.detail, !!this.caps?.audseq));
    s.start();
  }

  // Tünel aktarımında görüntüyü WebCodecs ile tuvale çiz.
  useCanvas(s) {
    // Aktarım yenilendi (yeni veri kanalı/tünel bağlantısı): aradaki kareler
    // kaybolmuş olabilir; çözücü anahtar kareden yeniden başlasın.
    if (this.wsv) { this.wsv.restart(); return; }
    const c = this.$('vcanvas');
    this.$('video').classList.add('hidden');
    c.classList.remove('hidden');
    this.wsv = new WsVideo(c, s.o.wsProfile, () => s.sendCtl({ t: 'kf' }));
    this.wsv.onresize = () => this.input.layout();
    // Görüntü bekçisi (tünel yolu): bu profil çözülemiyorsa sıradakiyle yeniden bağlan.
    // proven: bu cihaz bu profili bu bağlantıda çözebilmişti; arıza geçici
    // sayılır, profil "çözülemiyor" diye hatırlanmaz (yalnız bu bağlantı için yol değişir).
    this.wsv.onbroken = async (p, proven) => {
      if (!s.wsMode && s.o.dcVideo) {
        // Veri kanalı yolunda çözülemedi: bu cihazda RTP görüntüsüne dön.
        if (!proven) markBadProfile('wc', p);
        s.o.dcVideo = false;
        if (this.wsv) { this.wsv.close(); this.wsv = null; }
        this.$('vcanvas').classList.add('hidden'); this.$('video').classList.remove('hidden');
        this.toast('Görüntü yolu değiştiriliyor…', { timeout: 3000 });
        return s.reconnectFull();
      }
      if (proven) {
        if (this.wsv) { this.wsv.close(); this.wsv = null; }
        return s.reconnectFull();
      }
      const next = await pickWsProfile(p);
      if (s !== this.session) return;
      if (!next) { markBadProfile('wc', p); return s.fail('Bu cihaz uzak bilgisayarın görüntüsünü çözemiyor.', false, true); }
      s.o.wsProfile = next;
      s.o.forceWS = true; // doğrudan yol zaten kurulamamıştı: vakit kaybetmeden tünele
      if (this.wsv) { this.wsv.close(); this.wsv = null; }
      s.undecodable('wc', p);
    };
  }

  onState({ state, info }) {
    const ov = this.$('overlay');
    if (state === 'connected') {
      ov.classList.add('hidden');
      this.requestWake();
      return;
    }
    if (state === 'closed') {
      const wasUser = this.userClosed;
      this.userClosed = false;
      this.leaveViewer();
      if (!wasUser && info) this.showErr(info);
      return;
    }
    ov.classList.remove('hidden');
    this.$('overlay-text').textContent = info || '…';
    ov.classList.toggle('soft', state === 'reconnecting');
  }

  onCtlOpen() {
    const s = this.settings;
    this.ctlSeq = (this.ctlSeq || 0) + 1;
    this.session.sendCtl({ t: 'start', video: this.videoReq() });
    this.calib.reset();
    if (s.calib) this.calib.setOn(true);
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const s = this.session;
      if (!s) return;
      s.sendCtl({ t: 'ping', ts: performance.now(), rtt: this.rtt || 0 });
      // Bekçi: 8 sn hiç ileti gelmediyse bağlantı sessizce ölmüş olabilir (uyku, ağ değişimi).
      if (s.state === 'connected' && Date.now() - (s.lastMsg || Date.now()) > 8000) s.nudge();
    }, 1000);
  }

  // videoReq görüntü isteği. Çözünürlük "Otomatik"te (scale 0) uzak ekranın bu
  // cihazda kapladığı alan cihaz pikseli olarak bildirilir (yakınlaştırma dahil);
  // bilgisayar bundan fazla piksel göndermez. 1:1 piksel görünümünde tam çözünürlük.
  videoReq() {
    const s = this.settings;
    const scale = s.scaleMode === '1:1' && !s.scale ? 1 : s.scale;
    const v = this.viewSize();
    this.sentView = v;
    return { display: this.displayIndex || 0, fps: s.fps, quality: s.quality, scale, maxKbps: s.maxKbps || 0, view: v, slices: appleDecoder() ? 1 : 0 };
  }

  viewSize() {
    const f = this.input?.fit, z = this.input?.zoom?.s || 1, k = window.devicePixelRatio || 1;
    if (!f || !f.w) return { w: 0, h: 0 };
    return { w: Math.round(f.w * z * k), h: Math.round(f.h * z * k) };
  }

  // wcNote WebCodecs hattının durumunu yazar: çözme süresi, karenin ekran
  // yenilemesini bekleme süresi, çizim süresi; yenisi geldiği için çizilmeden
  // geçilen, anahtar kare beklenirken atılan kare; çözücünün yeniden kurulması
  // ve anahtar kare isteği sayısı; çözücüde bekleyen en çok kare.
  wcNote() {
    const t = this.wsv?.stats();
    if (!t) return '—';
    const ms = (x) => x.toFixed(1);
    return `${ms(t.decMs)} / ${ms(t.waitMs)} / ${ms(t.drawMs)} ms · geçilen ${t.skip} · atılan ${t.drop} · yeniden kurma ${t.reset}${t.why ? ' (' + t.why + ')' : ''} · anahtar istek ${t.kf} · kuyruk ${t.qMax}`;
  }

  // audioNote ses yolunu ve kendi tamponumuzun durumunu yazar.
  audioNote() {
    const st = this.audio?.stats();
    // Çalıcı henüz ses almadıysa yolu bağlantıdan söyle: veri kanalı açıldıysa ses
    // oradan gelecek, tarayıcının WebRTC ses katmanından değil.
    if (!st) return this.session?.wsMode ? 'tünel (bekleniyor)' : this.session?.dc?.aud ? 'veri kanalı (bekleniyor)' : 'WebRTC (tarayıcı tamponu)';
    const way = this.session?.wsMode ? 'tünel' : 'veri kanalı';
    if (st.legacy) return `${way} · tampon ${st.buf} ms (hedef ${st.target}) · kesinti ${st.under} · atılan ${st.dropped}`;
    // Kendi çalıcımız (ses-isleyici.js): tampon, ağ sarsıntısı, kesinti, gizlenen
    // (kayıp/geç paket yerine üretilen) ve eritilen (sıkıştırılan/atlanan) ses.
    return `${way} · tampon ${st.buf} ms (hedef ${st.target}, sarsıntı ${st.jitter ?? 0}) · kesinti ${st.under} · kayıp/geç ${st.dropped} · gizlenen ${st.conceal ?? 0} ms · eritilen ${(st.acc ?? 0) + (st.skip ?? 0)} ms · cihaz ${st.out ?? 0} ms`;
  }

  // flowNote ajanın yol denetimini yazar (veri kanalı, tünel ve RTP yolunda ortak).
  flowNote(a) {
    return a.flowKbps != null ? `kuyruk ${a.flowQ} ms · teslim ${(a.flowKbps / 1000).toFixed(1)} Mbps · düşüş ${a.flowCuts} / bekleme ${a.flowHolds}${a.lanes ? ` · şerit değişimi ${a.laneSw}` : ''}` : '—';
  }

  // nativeNote akış uzak ekrandan küçükse ekranın kendi boyutunu ekler.
  nativeNote(res) {
    const d = this.currentDisplay;
    return d && d.w && `${d.w}×${d.h}` !== res ? ` (ekran ${d.w}×${d.h})` : '';
  }

  sendVideoCfg() {
    this.session?.sendCtl({ t: 'cfg', video: this.videoReq() });
  }

  // onViewChange yerleşim/yakınlaştırma değişince çağrılır; hareket bitince
  // (450 ms) görünen boyut belirgin değiştiyse bilgisayara bildirilir.
  onViewChange() {
    this.calib?.update();
    if (this.settings.scale || !this.session) return;
    clearTimeout(this.viewTimer);
    this.viewTimer = setTimeout(() => {
      const v = this.viewSize(), o = this.sentView;
      if (!v.w || (o && o.w && Math.abs(v.w - o.w) / o.w < 0.08 && Math.abs(v.h - o.h) / o.h < 0.08)) return;
      this.sendVideoCfg();
    }, 450);
  }

  onCtl(m) {
    switch (m.t) {
      case 'hello':
        this.caps = m.caps || {};
        this.hello = m;
        this.selfUpdate(m.ver);
        this.displays = m.displays || [];
        this.$('tb-name').textContent = m.name;
        this.renderDisplay();
        if (this.caps.files === false) this.$('tb-files').classList.add('hidden');
        this.$('tb-audio').classList.toggle('hidden', !this.audioPossible());
        this.$('row-privacy').classList.toggle('hidden', !this.caps.privacy);
        this.$('row-modes').classList.toggle('hidden', !this.caps.modes);
        this.$('row-scales').classList.add('hidden');
        if (this.caps.scales) this.session.sendCtl({ t: 'scales' });
        if (this.caps.modes) this.session.sendCtl({ t: 'modes' });
        if (this.session.viewOnly) this.$('opt-view').checked = true;
        this.renderAudio();
        if (this.audioPossible() && this.settings.audio !== false) this.session.sendCtl({ t: 'audio', on: true });
        break;
      case 'display': this.currentDisplay = m.display; this.displayIndex = m.display.i; this.renderDisplay(); break;
      case 'cursor': this.setCursor(m); break;
      case 'conn': this.connKind = m.kind; break;
      case 'modes': this.modes = m; this.renderModes(); if (this.caps.scales) this.session?.sendCtl({ t: 'scales' }); break;
      case 'scales': this.scales = m; this.renderScales(); this.offerFit(); break;
      case 'privacy':
        this.$('opt-privacy').checked = !!m.on;
        if (m.err) this.toast('Gizlilik kipi açılamadı: ' + m.err, { level: 'warn' });
        else this.toast(m.on ? 'Gizlilik açık: uzaktaki ekran karardı, oradaki fare/klavye kilitli' : 'Gizlilik kapalı');
        break;
      case 'audio':
        this.audioOn = !!m.on;
        this.audioErr = m.err || '';
        if (m.err && this.audioUserAsked) this.toast('Ses aktarılamıyor: ' + m.err, { level: 'warn' });
        this.renderAudio();
        break;
      case 'stats': this.agentStats = m; break;
      case 'inputdiag': case 'tapdbg': case 'tapcur': this.calib.onCtl(m); break;
      case 'notice': this.toast(m.text, { level: m.level }); break;
      case 'clip': this.clip.onRemote(m); break;
      case 'clipack': this.clip.onAck(m); break;
      case 'caret': this.onCaret(m); break;
      case 'pong': this.rtt = Math.round(performance.now() - m.ts); break;
      case 'fsr': case 'xack': case 'uldone': case 'xerr': this.files.onCtl(m); break;
    }
  }

  onMv(buf) {
    const dv = new DataView(buf);
    if (dv.getUint8(0) === 0x81 && buf.byteLength >= 6) {
      this.input.remoteCursor(dv.getUint16(1, true) / 65535, dv.getUint16(3, true) / 65535);
    }
  }

  setCursor(m) {
    let c = this.cursors.get(m.id);
    if (!c && m.png) {
      c = { url: 'data:image/png;base64,' + m.png, w: m.w, h: m.h, hx: m.hx, hy: m.hy };
      this.cursors.set(m.id, c);
    }
    if (!c) return;
    this.cursorImg = c;
    // Yerel imleç olarak çiz: hareket ağ gecikmesinden bağımsız, anında.
    this.$('stage').style.cursor = c.w <= 128 && c.h <= 128 ? `url(${c.url}) ${c.hx} ${c.hy}, default` : 'default';
    this.input.updateGhost();
  }

  // ================= Görüntüleyici =================
  enterViewer(id) {
    this.$('home').classList.add('hidden');
    this.$('viewer').classList.remove('hidden');
    this.viewerActive = true;
    this.$('overlay').classList.remove('hidden', 'soft');
    this.$('overlay-text').textContent = 'Bağlanıyor…';
    this.$('tb-name').textContent = fmtId(id);
    this.$('stage').style.cursor = 'default';
    this.cursors.clear(); this.cursorImg = null;
    this.input.resetZoom();
    const mode = this.settings.mode === 'auto' ? 'tablet' : this.settings.mode;
    this.setMode(isTouchDevice() ? mode : 'mouse');
    document.body.classList.toggle('touch', isTouchDevice());
    this.$('xfers').innerHTML = '';
    history.pushState({ v: 1 }, '', '#oturum');
    setTimeout(() => this.input.layout(), 0);
    this.collapseToolbarSoon();
    if (isTouchDevice() && innerHeight > innerWidth) {
      const n = parseInt(localStorage.getItem('kopru.rotHint') || '0', 10);
      if (n < 3) { localStorage.setItem('kopru.rotHint', String(n + 1)); setTimeout(() => this.toast('Daha büyük görüntü için telefonu yan çevirin', { timeout: 5000 }), 1500); }
    }
  }

  leaveViewer() {
    clearInterval(this.pingTimer);
    if (this.session?.ownSignal) this.session.sig.close();
    if (this.wsv) { this.wsv.close(); this.wsv = null; }
    this.audio.stop();
    this.audioOn = false;
    this.audioHint = false;
    this.$('vcanvas').classList.add('hidden');
    this.$('video').classList.remove('hidden');
    this.input.releaseAll();
    this.viewerActive = false;
    this.session = null;
    this.$('video').srcObject = null;
    this.$('viewer').classList.add('hidden');
    this.$('home').classList.remove('hidden');
    for (const id of ['files', 'clip', 'display']) this.$(id).classList.remove('open');
    this.hideFitAsk(); clearTimeout(this.fitTimer);
    this.$('keys').classList.add('hidden');
    this.$('stats').classList.add('hidden');
    this.releaseWake();
    // Bağlantı sırasında yeni sürüm indirildiyse şimdi geç (oturum kesilmeden).
    if (this.updateReady) setTimeout(() => location.reload(), 300);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (location.hash === '#oturum') history.replaceState(null, '', location.pathname);
    this.renderBook();
    this.pollStatus();
  }

  disconnect() {
    this.userClosed = true;
    this.session?.close('Bağlantı kesildi');
    if (!this.session) this.leaveViewer();
  }

  setMode(m) {
    this.input.setMode(m);
    for (const b of this.$('mode-seg').children) b.classList.toggle('on', b.dataset.mode === m);
  }

  bindViewer() {
    const v = this.$('video');
    v.addEventListener('resize', () => this.input.layout());
    v.addEventListener('loadedmetadata', () => this.input.layout());
    this.$('overlay-cancel').onclick = () => this.disconnect();
    this.$('tb-toggle').onclick = () => this.$('toolbar').classList.toggle('collapsed');
    this.$('tb-close').onclick = () => this.disconnect();
    this.$('tb-full').onclick = () => this.toggleFullscreen();
    this.$('tb-keys').onclick = () => { this.$('keys').classList.toggle('hidden'); };
    this.$('tb-kbd').onclick = () => (document.activeElement === this.$('kbdsink') ? this.input.hideKeyboard() : this.input.showKeyboard());
    this.$('tb-zoom').onclick = () => { this.input.resetZoom(); this.smartZoomed = false; };
    this.$('kchip').onclick = () => { this.input.showKeyboard(); this.$('kchip').classList.add('hidden'); };
    this.setupViewport();
    this.setupFloatingToolbar();
    // Safari'nin kendi sayfa yakınlaştırma hareketlerini engelle (iki parmak görüntüye ait).
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    this.$('tb-audio').onclick = () => {
      const on = this.settings.audio === false;
      this.audioUserAsked = on;
      this.settings.audio = on; this.saveSettings();
      this.audio.setEnabled(on);
      this.session?.sendCtl({ t: 'audio', on });
      this.renderAudio();
      this.toast(on ? 'Ses açık' : 'Ses kapalı');
    };
    this.$('tb-stats').onclick = () => { this.$('stats').classList.toggle('hidden'); this.renderStats(); };
    for (const b of this.$('mode-seg').children) b.onclick = () => { this.setMode(b.dataset.mode); this.settings.mode = b.dataset.mode; this.saveSettings(); };
    const panel = (id, onOpen) => () => {
      const el = this.$(id), open = !el.classList.contains('open');
      for (const p of ['files', 'clip', 'display']) this.$(p).classList.remove('open');
      el.classList.toggle('open', open);
      if (open) onOpen?.();
    };
    this.$('tb-files').onclick = panel('files', () => { if (!this.files.entries.length) this.files.open(''); });
    this.$('tb-clip').onclick = panel('clip', () => this.renderClipSheet());
    this.$('tb-display').onclick = panel('display', () => this.renderDisplay());
    document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => this.$(b.dataset.close).classList.remove('open'); });

    // Özel tuşlar
    this.$('keys').addEventListener('pointerdown', (e) => e.preventDefault());
    this.$('keys').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.key) this.input.barKey(SC[b.dataset.key]);
      else if (b.dataset.sticky) this.input.toggleSticky(SC[b.dataset.sticky]);
      else if (b.dataset.combo) {
        const keys = b.dataset.combo.split('+').map((k) => SC[k]);
        if (b.dataset.combo === 'ControlLeft+KeyV') { this.clip.pushNow?.(); setTimeout(() => this.input.combo(...keys), 250); }
        else this.input.combo(...keys);
        this.input.releaseSticky();
      } else if (b.dataset.typeclip) {
        this.typeClipboard();
      } else if (b.dataset.special) {
        if (b.dataset.special === 'sas' && !this.caps.sas) this.input.combo(SC.ControlLeft, SC.AltLeft, SC.Delete);
        this.session?.sendCtl({ t: 'special', a: b.dataset.special });
      }
    });

    // Dosyalar
    this.$('fs-up').onclick = () => this.files.up();
    this.$('fs-home').onclick = () => this.files.open('');
    this.$('fs-dl').onclick = () => this.files.downloadSelected();
    this.$('fs-rm').onclick = () => this.files.remove();
    this.$('fs-mkdir').onclick = () => this.files.mkdir();
    this.$('fs-hidden').onchange = () => this.files.renderList();
    this.$('fs-ul').onclick = () => this.$('fs-input').click();
    this.$('fs-input').onchange = async (e) => { const fl = [...e.target.files]; e.target.value = ''; await this.files.uploadFiles(fl, { dir: this.files.path }); };
    let lp;
    this.$('fs-list').addEventListener('pointerdown', () => { lp = setTimeout(() => { this.files.selectMode = true; }, 500); });
    this.$('fs-list').addEventListener('pointerup', () => clearTimeout(lp));

    // Pano
    this.$('clip-sync').onchange = (e) => { this.settings.syncClipboard = e.target.checked; this.saveSettings(); };
    this.$('clip-copy').onclick = () => { const m = this.clip.remote; if (m && m.kind !== 'files') this.clip.writeLocal(m).then(() => this.toast('Bu cihazın panosuna kopyalandı')).catch(() => this.toast('Kopyalanamadı')); };
    this.$('clip-save').onclick = () => {
      const m = this.clip.remote;
      if (!m) return;
      if (m.kind === 'files') this.files.downloadClipFiles(m.files);
      else if (m.kind === 'image') { const a = document.createElement('a'); a.href = 'data:image/png;base64,' + m.png; a.download = 'pano.png'; a.click(); }
    };
    this.$('clip-push').onclick = () => this.clip.pushNow();
    this.$('clip-send-text').onclick = async () => { const t = this.$('clip-text').value; if (t) { await this.clip.sendText(t); this.toast('Uzak panoya gönderildi'); } };
    this.$('clip-type-text').onclick = () => { const t = this.$('clip-text').value; if (t) this.typeKeys(t); };

    // Ekran/kalite
    const seg = (id, attr, key, cb) => {
      for (const b of this.$(id).children) b.onclick = () => {
        let v = b.dataset[attr];
        if (key === 'fps' || key === 'scale') v = parseFloat(v);
        this.settings[key] = v; this.saveSettings(); this.renderDisplay(); cb?.();
      };
    };
    seg('q-seg', 'q', 'quality', () => this.sendVideoCfg());
    seg('fps-seg', 'fps', 'fps', () => this.sendVideoCfg());
    seg('scale-seg', 'scale', 'scale', () => this.sendVideoCfg());
    seg('fit-seg', 'fit', 'scaleMode', () => { this.input.layout(); this.sendVideoCfg(); });
    for (const b of this.$('kbps-seg').children) b.onclick = () => { this.settings.maxKbps = parseInt(b.dataset.kbps, 10); this.saveSettings(); this.renderDisplay(); this.sendVideoCfg(); };
    this.$('opt-privacy').onchange = (e) => this.session?.sendCtl({ t: 'privacy', on: e.target.checked });
    this.$('opt-view').onchange = (e) => this.setViewOnly(e.target.checked);
    this.$('opt-calib').onchange = (e) => { this.settings.calib = e.target.checked; this.saveSettings(); this.calib.setOn(e.target.checked); };
    this.$('tb-display').addEventListener('click', () => {
      if (this.caps.modes) this.session?.sendCtl({ t: 'modes' });
      if (this.caps.scales) this.session?.sendCtl({ t: 'scales' });
    });
    this.$('opt-444').onchange = (e) => {
      this.settings.prefer444 = e.target.checked; this.saveSettings();
      const s = this.session;
      if (s) { this.toast('Yeniden bağlanılıyor…'); s.o.prefer444 = e.target.checked; s.reconnectFull(); }
    };
    this.$('opt-mac').onchange = (e) => { this.settings.macCmd = e.target.checked; this.saveSettings(); };
    this.$('opt-loupe').onchange = (e) => { this.settings.loupe = e.target.checked; this.saveSettings(); };
    this.$('opt-autofit').onchange = (e) => {
      const id = this.session?.id;
      if (!id) return;
      this.remember(id, { fit: e.target.checked });
      this.fitDecided(e.target.checked ? 'yes' : 'no');
      if (e.target.checked && this.scales && !this.scales.changed) this.sendFit();
    };
    this.$('fitask-yes').onclick = () => this.answerFit(true);
    this.$('fitask-no').onclick = () => this.answerFit(false);

    // İstatistikler
    setInterval(() => this.renderStats(), 1000);
    this.frameCount = 0;
    const tick = () => { this.frameCount++; v.requestVideoFrameCallback?.(tick); };
    v.requestVideoFrameCallback?.(tick);
  }

  renderDisplay() {
    const s = this.settings;
    const mark = (id, attr, val) => { for (const b of this.$(id).children) b.classList.toggle('on', String(b.dataset[attr]) === String(val)); };
    mark('q-seg', 'q', s.quality); mark('fps-seg', 'fps', s.fps); mark('scale-seg', 'scale', s.scale); mark('fit-seg', 'fit', s.scaleMode);
    mark('kbps-seg', 'kbps', s.maxKbps || 0);
    this.$('opt-444').checked = !!s.prefer444;
    this.$('opt-calib').checked = !!s.calib;
    this.$('opt-loupe').checked = s.loupe !== false;
    this.$('row-444').classList.toggle('hidden', isTouchDevice() || !supports444());
    this.$('opt-mac').parentElement.classList.toggle('hidden', !isMac);
    this.$('opt-mac').checked = s.macCmd !== false;
    const box = this.$('disp-list');
    box.innerHTML = '';
    (this.displays || []).forEach((d, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}${d.primary ? ' (ana)' : ''} · ${d.w}×${d.h}`;
      b.classList.toggle('on', (this.displayIndex || 0) === d.i);
      b.onclick = () => { this.displayIndex = d.i; this.sendVideoCfg(); this.renderDisplay(); };
      box.appendChild(b);
    });
  }

  renderModes() {
    const m = this.modes, box = this.$('mode-list');
    box.innerHTML = '';
    if (!m || !m.modes) return;
    const native = m.modes[0];
    // Asıl çözünürlük + en-boy oranı aynı olan daha küçük birkaç seçenek.
    const ar = native.w / native.h;
    const opts = [native, ...m.modes.slice(1).filter((x) => Math.abs(x.w / x.h - ar) < 0.02 && x.w >= 1024)].slice(0, 4);
    for (const x of opts) {
      const b = document.createElement('button');
      b.textContent = x === native ? `Asıl (${x.w}×${x.h})` : `${x.w}×${x.h}`;
      b.classList.toggle('on', m.cur && m.cur.w === x.w && m.cur.h === x.h);
      b.onclick = () => { this.toast('Çözünürlük değiştiriliyor…'); this.session?.sendCtl({ t: 'mode', w: x === native ? 0 : x.w, h: x === native ? 0 : x.h }); };
      box.appendChild(b);
    }
  }

  renderScales() {
    const m = this.scales, box = this.$('scale-list');
    box.innerHTML = '';
    // Bu çözünürlükte tek seçenek varsa (ör. küçük ekran) satırı gizle.
    this.$('row-scales').classList.toggle('hidden', !m || !m.list || m.list.length < 2);
    if (!m || !m.list) return;
    for (const pct of m.list) {
      const b = document.createElement('button');
      b.textContent = pct === m.orig ? `Asıl (%${pct})` : `%${pct}`;
      b.classList.toggle('on', m.cur === pct);
      b.onclick = () => {
        this.fitDecided('no'); // kullanıcı boyutu kendisi seçti
        this.toast('Yazı boyutu ayarlanıyor…'); this.session?.sendCtl({ t: 'scale', pct: pct === m.orig ? 0 : pct });
      };
      box.appendChild(b);
    }
    // Telefona uydur: Windows'un mantıksal masaüstü telefonun kendi ekranı kadar
    // olsun; pencereler ve yazılar telefondaki uygulamalar kadar büyük görünür.
    if (isTouchDevice()) {
      const f = document.createElement('button');
      f.className = 'fit';
      f.textContent = '📱 Telefona uydur';
      f.onclick = () => { this.fitDecided('yes'); this.sendFit(); };
      box.appendChild(f);
    }
    const auto = this.$('row-autofit');
    auto.classList.toggle('hidden', !isTouchDevice() || !m.list || m.list.length < 2);
    this.$('opt-autofit').checked = this.book.find((b) => b.id === this.session?.id)?.fit === true;
  }

  // ---- "Telefona uydur" önerisi ----
  // Telefondan bir bilgisayara ilk bağlanışta, Windows'un yazı boyutunu telefona
  // göre büyütmek bir kez sorulur; yanıt o bilgisayar için (kayıtlı bilgisayar
  // listesinde, kimliğine göre) hatırlanır. Bilgisayarın ayarı kullanıcı
  // dokunmadan değiştirilmez: yalnızca "büyüt + hatırla" seçildiyse sonraki
  // bağlantılarda aynı istek kendiliğinden gönderilir ve "Geri al" düğmeli bir
  // bildirim çıkar. Ekran panelindeki seçenekle seçim her zaman değiştirilebilir.
  // Bağlantı bitince Windows eski haline döner (ajan geri alır).
  fitTarget() { return { w: Math.max(screen.width, screen.height), h: Math.min(screen.width, screen.height) }; }
  sendFit(quiet) {
    const t = this.fitTarget();
    if (!quiet) this.toast('Yazı boyutu telefona göre ayarlanıyor…');
    this.session?.sendCtl({ t: 'fit', w: t.w, h: t.h });
  }
  // fitPercentFor ajanın "telefona uydur"da seçeceği yüzdenin tahmini (aynı kural:
  // mantıksal masaüstü telefon ekranına en yakın, izin verilen seçeneklerden).
  fitPercentFor(m) {
    const d = this.currentDisplay;
    if (!d?.w || !m?.list?.length) return null;
    const t = this.fitTarget();
    const want = Math.round(Math.min(Math.max(d.w, d.h) / t.w, Math.min(d.w, d.h) / t.h) * 100);
    let best = m.list[0];
    for (const c of m.list) { const a = Math.abs(c - want), b = Math.abs(best - want); if (a < b || (a === b && c > best)) best = c; }
    return best;
  }
  offerFit() {
    const m = this.scales, s = this.session, f = this.fitSt;
    if (!isTouchDevice() || !s || !f || !m?.list || m.list.length < 2 || m.changed || f.ctl === this.ctlSeq) return;
    // Görüntü gelmeden sorulmasın (bağlanma ekranının üstünde anlamsız).
    // Ekranın boyutu ("display" iletisi) da gelmiş olmalı.
    clearTimeout(this.fitTimer);
    const pct = this.fitPercentFor(m);
    if (!this.surfaceSize().w || !this.$('overlay').classList.contains('hidden') || pct == null) { this.fitTimer = setTimeout(() => this.offerFit(), 500); return; }
    f.ctl = this.ctlSeq; // her kanal açılışında en çok bir karar
    if (pct === m.cur || f.want === 'no') return;
    if (f.want === 'yes') return this.sendFit(true); // yeniden bağlandı: seçim sürsün
    const pref = this.book.find((b) => b.id === s.id)?.fit;
    if (pref === false) { f.want = 'no'; return; }
    if (pref === true) {
      f.want = 'yes';
      this.sendFit(true);
      this.toast('Bu bilgisayar için kayıtlı seçim: yazılar telefona göre büyütülüyor', { action: 'Geri al', onAction: () => { this.fitDecided('no'); this.session?.sendCtl({ t: 'scale', pct: 0 }); }, timeout: 7000 });
      return;
    }
    if (f.asked) return;
    f.asked = true;
    this.askFit(m, pct);
  }
  askFit(m, pct) {
    const d = this.currentDisplay;
    this.$('fitask-sub').textContent = `Ekran ${d.w}×${d.h}, yazı boyutu %${m.cur}. Bağlantı süresince Windows'un yazı boyutu bu telefona göre %${pct} yapılabilir; bağlantı bitince eski haline döner.`;
    this.$('fitask-rem').checked = true;
    this.$('fitask').classList.remove('hidden');
    clearTimeout(this.fitAskTimer);
    // Yanıtlanmazsa kendiliğinden kapanır (kaydedilmez; sonraki bağlantıda yeniden sorulur).
    this.fitAskTimer = setTimeout(() => this.hideFitAsk(), 30000);
  }
  // fitDecided kullanıcı bu bağlantı için seçimini yaptı (öneri, düğme ya da
  // yazı boyutu seçimiyle): bu kanal açılışında artık kendiliğinden bir şey yapılmaz.
  fitDecided(want) {
    const f = this.fitSt;
    this.hideFitAsk();
    if (!f) return;
    f.want = want; f.asked = true; f.ctl = this.ctlSeq;
  }
  answerFit(yes) {
    const s = this.session;
    const rem = this.$('fitask-rem').checked;
    this.fitDecided(yes ? 'yes' : 'no');
    if (!s) return;
    if (rem) { this.remember(s.id, { fit: yes }); this.$('opt-autofit').checked = yes; }
    if (yes) this.sendFit();
  }
  hideFitAsk() { clearTimeout(this.fitAskTimer); this.$('fitask').classList.add('hidden'); }

  setViewOnly(on) {
    const s = this.session;
    if (!s) return;
    if (on) this.input.releaseAll();
    s.viewOnly = on;
    this.$('opt-view').checked = on;
    this.toast(on ? 'Yalnızca izleme: dokunuşlar uzak bilgisayara gitmiyor' : 'Kontrol açık');
  }

  // Metni gerçek tuş vuruşlarıyla yazdır (Windows giriş ekranı, eski programlar).
  typeKeys(text) {
    if (!text) return;
    if (this.caps.typekeys) this.session?.sendCtl({ t: 'typekeys', text: text.slice(0, 4096) });
    else this.input.sendText(text);
  }

  async typeClipboard() {
    let t = '';
    try { t = await navigator.clipboard.readText(); } catch {}
    if (!t) t = prompt('Yazılacak metin (ör. parola):') || '';
    this.typeKeys(t);
  }

  renderClipSheet() {
    this.$('clip-sync').checked = this.settings.syncClipboard !== false;
    const m = this.clip.remote, box = this.$('clip-remote');
    box.innerHTML = '';
    this.$('clip-copy').classList.toggle('hidden', !m || m.kind === 'files');
    this.$('clip-save').classList.toggle('hidden', !m || m.kind === 'text');
    if (!m) { box.textContent = '—'; return; }
    if (m.kind === 'text') { box.textContent = m.text.length > 600 ? m.text.slice(0, 600) + '…' : m.text; }
    else if (m.kind === 'image') { const img = document.createElement('img'); img.src = 'data:image/png;base64,' + m.png; box.appendChild(img); }
    else { box.textContent = m.files.map((f) => (f.dir ? '📁 ' : '📄 ') + f.name + (f.dir ? '' : ' (' + fmtSize(f.size) + ')')).join('\n'); }
  }

  updateStickyUI(set) {
    for (const b of this.$('keys').querySelectorAll('[data-sticky]')) b.classList.toggle('on', set.has(SC[b.dataset.sticky]));
  }

  async renderStats() {
    const el = this.$('stats');
    const pc = this.session?.pc;
    if (!el.classList.contains('hidden') && this.wsv) {
      const a = this.agentStats || {};
      const f = this.wsv.frames; this.wsv.frames = 0;
      const dcv = !this.session?.wsMode;
      const lines = [['Bağlantı', dcv ? 'Doğrudan (görüntü veri kanalından)' : 'Güvenli tünel (uçtan uca şifreli)'], ['Gecikme', this.rtt != null ? this.rtt + ' ms' : '—'],
        ['Görüntü', `${this.$('vcanvas').width}×${this.$('vcanvas').height}${this.nativeNote(this.$('vcanvas').width + '×' + this.$('vcanvas').height)} · ${f} fps`], ['Bit hızı', `${((a.kbps || 0) / 1000).toFixed(1)} Mbps (hedef ${((a.target || 0) / 1000).toFixed(1)})`],
        ['Kodlayıcı', a.enc || '—'], ['Netleştirme', a.netl || '—'], ['Performans', perfText(a.perf)], ['Çözücü', 'WebCodecs (' + (this.session?.o.wsProfile || '—') + ')'],
        ['Çözme / çizim', this.wcNote()],
        ['Yol denetimi', this.flowNote(a)],
        ['Ses', this.audioNote()],
        ['Sürüm', `${SURUM}${this.hello?.ver && this.hello.ver !== SURUM ? ' · bilgisayar ' + this.hello.ver : ''}`], ['Yakalama', a.cap || '—']];
      el.innerHTML = '';
      for (const [k, v] of lines) { const r = document.createElement('div'); r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = k; r.children[1].textContent = v; el.appendChild(r); }
      return;
    }
    if (el.classList.contains('hidden') || !pc) { this.frameCount = 0; return; }
    const fps = this.frameCount; this.frameCount = 0;
    let kbps = 0, lost = 0, jb = 0, dec = 0, res = '', codec = '', pair = null, local = null, remote = null, inb = null;
    const stats = await pc.getStats();
    stats.forEach((r) => {
      if (r.type === 'inbound-rtp' && r.kind === 'video') {
        const prev = this.prevIn;
        if (prev) kbps = Math.round(((r.bytesReceived - prev.bytesReceived) * 8) / ((r.timestamp - prev.timestamp) || 1));
        this.prevIn = r;
        lost = r.packetsLost;
        if (r.jitterBufferEmittedCount) jb = Math.round((r.jitterBufferDelay / r.jitterBufferEmittedCount) * 1000);
        if (r.framesDecoded) dec = ((r.totalDecodeTime / r.framesDecoded) * 1000).toFixed(1);
        res = `${r.frameWidth}×${r.frameHeight}`;
        inb = r;
        const c = stats.get(r.codecId); if (c) codec = (c.sdpFmtpLine || '').match(/profile-level-id=(\w{4})/)?.[1] || '';
      }
      if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r;
    });
    if (pair) { local = stats.get(pair.localCandidateId); remote = stats.get(pair.remoteCandidateId); }
    const relay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
    const a = this.agentStats || {};
    const prof = { f400: '4:4:4', '640c': 'High', 6400: 'High', '4d00': 'Main', '42e0': 'Baseline', 4200: 'Baseline' }[codec] || codec;
    const lines = [
      ['Bağlantı', pair ? (relay ? 'Aktarıcı (TURN)' : local?.candidateType === 'host' && remote?.candidateType === 'host' ? 'Doğrudan (yerel ağ)' : 'Doğrudan (P2P)') : '—'],
      ['Gecikme', this.rtt != null ? this.rtt + ' ms' : '—'],
      ['Görüntü', `${res}${this.nativeNote(res)} · ${fps} fps`],
      ['Bit hızı', `${(kbps / 1000).toFixed(1)} Mbps (hedef ${((a.target || 0) / 1000).toFixed(1)})`],
      ['Kodlayıcı', `${a.enc || '—'} · ${prof}`],
      ['Kodlama / çözme', `${(a.encMs && a.fps ? a.encMs / a.fps : 0).toFixed(1)} / ${dec} ms`],
      ['Netleştirme', a.netl || '—'],
      ['Performans', perfText(a.perf)],
      ['Tampon', jb + ' ms'],
      ['Kayıp paket', lost],
      ['Tahmin / taban', `${((a.bwe || 0) / 1000).toFixed(1)} / ${((a.floor || 0) / 1000).toFixed(1)} Mbps`],
      ['Yol denetimi', this.flowNote(a)],
      ['Atılan / donma', inb ? `${inb.framesDropped ?? '—'} kare · ${inb.freezeCount ?? '—'} donma` : '—'],
      ['Anahtar kare / istek', inb ? `${inb.keyFramesDecoded ?? '—'} / PLI ${inb.pliCount ?? '—'} · NACK ${inb.nackCount ?? '—'}` : '—'],
      ['Çözücü', inb?.decoderImplementation || '—'],
      ['Ses', this.audioNote()],
      ['Sürüm', `${SURUM}${this.hello?.ver && this.hello.ver !== SURUM ? ' · bilgisayar ' + this.hello.ver : ''}`],
      ['Yakalama', a.cap || '—'],
    ];
    el.innerHTML = '';
    for (const [k, v] of lines) { const r = document.createElement('div'); r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = k; r.children[1].textContent = v; el.appendChild(r); }
  }

  toast(text, { action, onAction, timeout = 4000, level } = {}) {
    const t = document.createElement('div');
    t.className = 'toast' + (level ? ' ' + level : '');
    const span = document.createElement('span'); span.textContent = text; t.appendChild(span);
    if (action) { const b = document.createElement('button'); b.textContent = action; b.onclick = () => { onAction(); t.remove(); }; t.appendChild(b); }
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.onclick = () => t.remove(); t.appendChild(x);
    (this.viewerActive ? this.$('toasts') : document.body).appendChild(t);
    setTimeout(() => t.remove(), timeout);
  }

  showTransfers() { if (!this.$('files').classList.contains('open')) { this.$('files').classList.add('open'); if (!this.files.entries.length) this.files.open(''); } }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) { navigator.keyboard?.unlock?.(); await document.exitFullscreen(); }
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        // Tam ekranda Win, Alt+Tab, Esc gibi tuşlar da uzak bilgisayara gitsin.
        await navigator.keyboard?.lock?.().catch(() => {});
      }
    } catch { this.toast('Tam ekran bu tarayıcıda desteklenmiyor'); }
    setTimeout(() => this.input.layout(), 200);
  }

  collapseToolbarSoon() {
    const tb = this.$('toolbar');
    clearTimeout(this.tbTimer);
    if (isTouchDevice()) { tb.classList.add('collapsed'); return; }
    tb.classList.remove('collapsed');
    this.tbTimer = setTimeout(() => tb.classList.add('collapsed'), 5000);
  }

  // Telefonda araç çubuğu, ekranın üstünü (pencere düğmelerini) kapatmayan,
  // sürüklenebilir küçük bir düğmedir; dokununca açılır, kullanılmayınca kapanır.
  setupFloatingToolbar() {
    const tb = this.$('toolbar'), h = this.$('tb-toggle');
    const saved = JSON.parse(localStorage.getItem('kopru.tbpos') || 'null');
    const place = (x, y) => {
      if (!isTouchDevice()) return;
      x = Math.max(4, Math.min(innerWidth - 52, x)); y = Math.max(4, Math.min(innerHeight - 52, y));
      document.documentElement.style.setProperty('--tbx', x + 'px'); document.documentElement.style.setProperty('--tby', y + 'px');
      return { x, y };
    };
    if (saved) place(saved.x, saved.y);
    let drag = null;
    h.addEventListener('pointerdown', (e) => { if (!isTouchDevice() || !tb.classList.contains('collapsed')) return; drag = { x: e.clientX, y: e.clientY, moved: false }; h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) drag.pos = place(e.clientX - 22, e.clientY - 22);
    });
    h.addEventListener('pointerup', () => { if (drag?.moved && drag.pos) localStorage.setItem('kopru.tbpos', JSON.stringify(drag.pos)); setTimeout(() => { drag = null; }, 0); });
    h.onclick = (e) => {
      if (drag?.moved) { e.preventDefault(); return; }
      tb.classList.toggle('collapsed');
      this.armToolbarAutoCollapse();
    };
    tb.addEventListener('pointerdown', () => this.armToolbarAutoCollapse());
  }
  armToolbarAutoCollapse() {
    if (!isTouchDevice()) return;
    clearTimeout(this.tbTimer);
    this.tbTimer = setTimeout(() => {
      if (!['files', 'clip', 'display'].some((p) => this.$(p).classList.contains('open'))) this.$('toolbar').classList.add('collapsed');
    }, 6000);
  }

  // ---- iPhone klavyesi ----
  setupViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => {
      const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--kb', kb + 'px');
      const open = kb > 80 && document.activeElement === this.$('kbdsink');
      if (open !== this.kbOpen) { this.kbOpen = open; this.onKeyboard(open); }
      else if (open) this.ensureCaretVisible(false);
    };
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    window.addEventListener('scroll', () => this.unshift());
    window.addEventListener('orientationchange', () => { for (const ms of [100, 400, 900]) setTimeout(() => this.unshift(), ms); });
    window.addEventListener('pageshow', () => this.unshift());
    this.$('kbdsink').addEventListener('blur', () => setTimeout(on, 50));
    this.$('kbdsink').addEventListener('focus', () => setTimeout(on, 300));
  }
  // unshift: görüntüleyicide sayfanın kendisi hiç kaymamalı (her şey sabit
  // konumlu). iOS ana ekran uygulamasında klavye kapandıktan veya döndürmeden
  // sonra sayfa kaymış kalabiliyor; bu durumda çizim ile dokunuş noktaları
  // arasında kayma oluşabildiği biliniyor (WebKit). Klavye açık değilken sayfa
  // kaymışsa başa al; dokunuş tanısı bunun kaç kez olduğunu gösterir.
  unshift() {
    if (!this.viewerActive || this.kbOpen || document.activeElement === this.$('kbdsink')) return;
    if (window.scrollX || window.scrollY || (window.visualViewport && (visualViewport.offsetTop || visualViewport.pageTop) && visualViewport.scale <= 1.01)) {
      window.scrollTo(0, 0);
      this.calib.resets++;
    }
  }

  // Klavyenin üstünde kalan görünür alan (stage koordinatlarında).
  visibleArea() {
    const st = this.$('stage').getBoundingClientRect();
    if (!this.kbOpen || !window.visualViewport) return { top: 0, h: st.height };
    const vv = visualViewport, keys = this.$('keys');
    const keysH = keys.classList.contains('hidden') ? 0 : keys.getBoundingClientRect().height;
    const top = Math.max(0, vv.offsetTop - st.top);
    return { top, h: Math.max(100, vv.height - keysH - (st.top > vv.offsetTop ? st.top - vv.offsetTop : 0)) };
  }
  onKeyboard(open) {
    document.body.classList.toggle('kb-open', open);
    const keys = this.$('keys');
    if (open) {
      this.keysWasHidden = keys.classList.contains('hidden');
      keys.classList.remove('hidden'); keys.classList.add('compact');
      this.$('kchip').classList.add('hidden');
      this.$('toolbar').classList.add('collapsed');
      this.preKbZoom = { ...this.input.zoom };
      this.ensureCaretVisible(true);
    } else {
      keys.classList.remove('compact');
      if (this.keysWasHidden) keys.classList.add('hidden');
      // Klavye için otomatik yakınlaştırdıysak eski görünüme dön.
      if (this.smartZoomed && this.preKbZoom) { this.input.zoom = { ...this.preKbZoom }; this.smartZoomed = false; }
      this.input.applyZoom();
      window.scrollTo(0, 0);
      // Klavye kapanma canlandırması sürerken iOS sayfayı yeniden kaydırabiliyor.
      for (const ms of [150, 450, 900]) setTimeout(() => this.unshift(), ms);
    }
  }
  // Yazılan yer (Windows'un bildirdiği yazı imleci, yoksa son dokunulan nokta)
  // klavyenin üstünde, okunabilir büyüklükte görünsün.
  ensureCaretVisible(zoomIn) {
    if (!this.viewerActive) return;
    const c = this.caret?.v ? this.caret : this.input.lastTouch;
    if (!c) { this.input.applyZoom(); return; }
    const vis = this.visibleArea();
    const st = this.$('stage').getBoundingClientRect();
    if (zoomIn && isTouchDevice() && this.input.zoom.s < 1.8) {
      const p = this.input.normToClient(c.x, c.y);
      this.input.zoomAt(p.x, p.y, 2 / this.input.zoom.s);
      this.smartZoomed = true;
    }
    const p = this.input.normToClient(c.x, c.y);
    const y = p.y - st.top, target = vis.top + vis.h * 0.35;
    if (zoomIn || y < vis.top + 20 || y > vis.top + vis.h - 20) this.input.panBy(0, target - y);
    const x = p.x - st.left;
    if (x < 30 || x > st.width - 30) this.input.panBy(st.width / 2 - x, 0);
  }
  onCaret(m) {
    const was = this.caret?.v;
    this.caret = m;
    if (!isTouchDevice() || !this.viewerActive) return;
    if (this.kbOpen) { if (m.v) this.ensureCaretVisible(false); return; }
    const chip = this.$('kchip');
    if (m.v && !was && this.input.mode !== 'touchpad') {
      chip.classList.remove('hidden');
      clearTimeout(this.chipTimer);
      this.chipTimer = setTimeout(() => chip.classList.add('hidden'), 6000);
    } else if (!m.v) chip.classList.add('hidden');
  }

  async requestWake() {
    if (!this.settings.wake || !this.viewerActive || !navigator.wakeLock || this.wake) return;
    try { this.wake = await navigator.wakeLock.request('screen'); this.wake.onrelease = () => { this.wake = null; }; } catch {}
  }
  releaseWake() { this.wake?.release().catch(() => {}); this.wake = null; }
}

window.app = new App();
