// Uzak bilgisayarın sesini çalar.
//  - WebRTC: ajan Opus izini ayrı akışta yollar; <audio> öğesi çalar.
//  - Tünel (WebSocket) ve Apple cihazlarında veri kanalı ("aud"): Opus paketleri
//    WebCodecs AudioDecoder ile çözülür ve AudioWorklet'teki kendi çalıcımıza
//    (ses-isleyici.js) verilir: ses donanımı sesi oradan çeker, tamponu ağın
//    ölçülen sarsıntısına göre küçük tutulur, fazlası sesi bozmadan eritilir,
//    kayıp paketin yeri doldurulur. AudioWorklet yoksa eski yol (her paket ayrı
//    AudioBufferSourceNode) kullanılır.
// iOS/Safari sesi ancak bir dokunuştan sonra çalar: ilk dokunuşta kilit açılır.
//
// iPhone'un yan tuşu (zil/sessiz) sessizdeyken Safari, Web Audio'yu (AudioContext)
// "ortam sesi" sayar ve susturur; <audio> öğesi ise çalar. Veri kanalı yolunda
// ses AudioContext'ten çıktığı için sessiz kipte hiç duyulmuyordu. Safari 16.4+
// navigator.audioSession ile sayfanın sesinin "oynatma" (video/müzik gibi) olduğu
// söylenebilir: o zaman sessiz kipte de çalar. Tür, ses oturumu başlamadan
// (AudioContext kurulup çalmaya başlamadan) önce ayarlanmalıdır. Yan etkisi:
// "playback" türü karışmaz; ses çalmaya başlayınca telefonda çalan müzik durur
// (video uygulamalarındaki gibi). Ses kapatılınca ve bağlantı bitince tür
// "auto"ya döner. navigator.audioSession yoksa (iOS < 16.4, diğer tarayıcılar)
// hiçbir şey yapılmaz; iOS'ta sessiz kipte ses duyulmaz.
//
// Arka plan / kilit ekranı / gelen arama: iOS AudioContext'i "suspended" ya da
// (yalnız WebKit) "interrupted" durumuna alır. Sayfa öne gelince ve her
// dokunuşta yeniden başlatılır; başlatılamazsa "bir kez dokunun" uyarısı çıkar.

// HOLD: sırasız kanalda öne geçen paket, eksik olanı en çok bu kadar (ms)
// bekler. Hücresel ağ paketleri çoğunlukla sırayla teslim eder; eksik paket
// büyük olasılıkla kayıptır, uzun beklemek her kayıpta gecikme eklerdi.
const HOLD = 6;

// sesOturumu iOS ses oturumunun türünü ayarlar ("playback": sessiz kipte de çal;
// "auto": tarayıcı karar versin). Desteklenmiyorsa sessizce geçer.
export function sesOturumu(tur) {
  try {
    const a = navigator.audioSession;
    if (a && a.type !== tur) a.type = tur;
  } catch {}
}

export class RemoteAudio {
  constructor(el) {
    this.el = el;
    this.enabled = true;
    this.ctx = null;
    this.dec = null;
    this.blocked = false;
    this.resetState();
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.wake(); });
  }

  // stalled: ses açık, bağlam var ama çalmıyor (askıya alınmış ya da kesilmiş).
  stalled() { const st = this.ctx?.state; return !!this.ctx && this.enabled && st !== 'running' && st !== 'closed'; }

  // wake sayfa öne gelince bağlamı yeniden başlatır. Bir kez dokunuşla açılmış
  // bağlam iOS'ta dokunuşsuz da sürdürülebilir; olmazsa (ör. arama sürüyor)
  // kısa süre sonra uyarı verilir, ilk dokunuşta unlock yeniden dener.
  wake() {
    if (!this.stalled()) return;
    sesOturumu('playback');
    this.ctx.resume().catch(() => {});
    clearTimeout(this.wakeT);
    this.wakeT = setTimeout(() => { if (this.stalled() && !document.hidden) { this.blocked = true; this.onblocked?.(); } }, 600);
  }

  resetState() {
    this.node = null; this.wl = null; this.wlq = []; this.wst = null; // çalıcı (null: henüz bilinmiyor, false: yok)
    this.fifo = []; this.ext = null; this.auto = 0; // çözücüye giren kare numaraları
    this.dn = null; this.held = new Map(); clearTimeout(this.holdT); this.holdT = 0; this.skipped = 0; // çözme sırası
    this.next = 0; this.ts = 0; // eski yol
    this.target = 0.05; this.under = 0; this.dropped = 0; this.calm = 0; this.pkts = 0;
  }

  static wsSupported() { return typeof AudioDecoder !== 'undefined' && typeof AudioContext !== 'undefined'; }

  setStream(stream) {
    this.el.srcObject = stream;
    this.el.muted = !this.enabled;
    this.play();
  }

  play() {
    if (!this.enabled || !this.el.srcObject) return;
    const p = this.el.play();
    if (p && p.catch) p.catch(() => { this.blocked = true; this.onblocked?.(); });
  }

  unlock() {
    if (this.blocked || (this.el.srcObject && this.el.paused)) { this.blocked = false; this.play(); }
    // "interrupted": WebKit'in arama/Siri/başka uygulama sesi sonrası durumu; "suspended" gibi sürdürülür.
    if (this.stalled()) { sesOturumu('playback'); this.ctx.resume().catch(() => {}); }
  }

  setEnabled(on) {
    this.enabled = on;
    this.el.muted = !on;
    if (on) {
      this.play();
      if (this.ctx) { sesOturumu('playback'); this.ctx.resume().catch(() => {}); }
      this.node?.port.postMessage({ t: 'sifirla' }); // kapalıyken kalan eski sesi çalma
    } else {
      this.ctx?.suspend().catch(() => {});
      sesOturumu('auto'); // ses kapalıyken telefonun kendi sesine (müzik) karışma
    }
  }

  // unwrap 16 bitlik sıra numarasını sürekli artan kare numarasına çevirir.
  unwrap(s16) {
    if (this.ext === null) { this.ext = s16; return s16; }
    const d = ((s16 - (this.ext & 0xffff) + 32768) & 0xffff) - 32768;
    const n = this.ext + d;
    if (d > 0) this.ext = n;
    return n;
  }

  // pushOpus bir Opus paketi alır. seq: paketin başında 2 baytlık sıra
  // numarası var (veri kanalı, ajan "audseq" bildirdiyse). Sırasız kanalda yer
  // değiştiren ya da kaybolan paketi çalıcı bununla bilir.
  pushOpus(data, seq = false) {
    if (!this.enabled || !RemoteAudio.wsSupported()) return;
    if (!this.ctx) {
      sesOturumu('playback'); // bağlam kurulmadan önce: sessiz kipte de çalsın
      const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      this.ctx = ctx;
      // Çalmaya (yeniden) başlayınca askıdayken kalan eski ses atılır.
      let was = ctx.state;
      ctx.onstatechange = () => {
        if (this.ctx !== ctx) return;
        if (ctx.state === 'running' && was !== 'running') this.node?.port.postMessage({ t: 'sifirla' });
        was = ctx.state;
      };
      if (ctx.state === 'suspended') { this.blocked = true; this.onblocked?.(); }
      this.startWorklet();
    }
    let n;
    if (seq) {
      if (data.length < 3) return;
      n = this.unwrap((data[0] << 8) | data[1]);
      data = data.subarray(2);
    } else n = this.auto++;
    // Ses çalmıyorken (iOS'ta ilk dokunuştan önce, sekme arka plandayken)
    // çözme: biriken eski ses sonradan çalınmasın.
    if (this.ctx.state !== 'running') { this.dn = null; this.held.clear(); return; }
    // Opus çözücüsü her kareyi bir öncekinin kuyruğuyla birleştirir: kareleri
    // sırayla çöz. Sırasız kanalda öne geçen paket, eksik olan gelene ya da
    // kısa bir süre (HOLD) dolana kadar bekletilir; eksik gelmezse atlanır
    // (yerini çalıcı doldurur). Sırası geçmiş paket atılır.
    if (this.dn === null || n === this.dn) { this.decode(n, data); this.drain(); return; }
    if (n < this.dn) { if (n < this.dn - 1000) { this.dn = null; this.held.clear(); this.decode(n, data); } else this.skipped++; return; }
    this.held.set(n, data);
    if (this.held.size > 8) this.drain(true);
    else if (!this.holdT) this.holdT = setTimeout(() => { this.holdT = 0; this.drain(true); }, HOLD);
  }

  // drain bekleyen paketleri sırayla çözer; force: eksik olanı bekleme.
  drain(force = false) {
    for (;;) {
      if (this.held.has(this.dn)) { const d = this.held.get(this.dn); this.held.delete(this.dn); this.decode(this.dn, d); continue; }
      if (!force || !this.held.size) break;
      this.dn = Math.min(...this.held.keys()); // eksikleri atla
      force = false;
    }
    if (!this.held.size) { clearTimeout(this.holdT); this.holdT = 0; }
    else if (!this.holdT) this.holdT = setTimeout(() => { this.holdT = 0; this.drain(true); }, HOLD);
  }

  decode(n, data) {
    if (!this.dec || this.dec.state === 'closed') {
      this.fifo = [];
      this.dec = new AudioDecoder({ output: (a) => this.out(a), error: (e) => { console.warn('ses çözücü', e); this.dec = null; } });
      this.dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
    }
    this.fifo.push(n);
    this.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: n * 10000, duration: 10000, data }));
    this.dn = n + 1;
  }

  startWorklet() {
    const ctx = this.ctx;
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') { this.wl = false; return; }
    ctx.audioWorklet.addModule(new URL('./ses-isleyici.js', import.meta.url)).then(() => {
      if (this.ctx !== ctx) return;
      const node = new AudioWorkletNode(ctx, 'kopru-ses', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e) => { if (e.data.t === 'd') this.wst = e.data.st; };
      node.connect(ctx.destination);
      this.node = node; this.wl = true;
      for (const m of this.wlq) node.port.postMessage(m, [m.l.buffer, m.r.buffer]);
      this.wlq = [];
    }).catch((e) => { console.warn('ses çalıcı yüklenemedi, eski yol', e); if (this.ctx === ctx) { this.wl = false; this.wlq = []; } });
  }

  out(a) {
    try {
      const n = a.numberOfFrames, ch = Math.min(2, a.numberOfChannels);
      const seq = this.fifo.length ? this.fifo.shift() : null;
      this.pkts++;
      if (this.wl === false) { this.outLegacy(a); return; }
      if (seq === null) return;
      const l = new Float32Array(n), r = new Float32Array(n);
      a.copyTo(l, { planeIndex: 0, format: 'f32-planar' });
      a.copyTo(r, { planeIndex: Math.min(1, ch - 1), format: 'f32-planar' });
      const m = { t: 'k', s: seq, l, r };
      if (this.node) this.node.port.postMessage(m, [l.buffer, r.buffer]);
      else if (this.wlq.length < 100) this.wlq.push(m);
    } finally { a.close(); }
  }

  // outLegacy AudioWorklet olmayan tarayıcılarda (1.2.7'deki yol): her paket
  // ayrı bir AudioBufferSourceNode olarak art arda kurulur. Hedef başta 50 ms;
  // boşalırsa 20 ms büyür (en çok 160 ms), 8 sn sorunsuzsa 10 ms küçülür (en
  // az 40 ms); tampon hedefin 60 ms üstüne çıkarsa paket atılır.
  outLegacy(a) {
    const ctx = this.ctx;
    const n = a.numberOfFrames;
    const ch = Math.min(2, a.numberOfChannels);
    const buf = ctx.createBuffer(2, n, a.sampleRate);
    for (let c = 0; c < 2; c++) {
      const dst = new Float32Array(n);
      a.copyTo(dst, { planeIndex: Math.min(c, ch - 1), format: 'f32-planar' });
      buf.copyToChannel(dst, c);
    }
    const now = ctx.currentTime, t = performance.now();
    if (!this.calm) this.calm = t;
    if (this.next < now + 0.005) {
      if (this.next) { this.under++; this.target = Math.min(0.16, this.target + 0.02); }
      this.calm = t;
      this.next = now + this.target;
    } else if (this.next - now > this.target + 0.06) {
      this.dropped++;
      return;
    }
    if (t - this.calm > 8000 && this.target > 0.04) { this.target = Math.max(0.04, this.target - 0.01); this.calm = t; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(this.next);
    this.next += buf.duration;
  }

  // stats kendi çalıcımızın durumu (istatistik ekranı için); <audio> ile çalıyorsa null.
  stats() {
    if (!this.ctx || !this.pkts) return null;
    if (this.wl === false) {
      return { buf: Math.max(0, Math.round((this.next - this.ctx.currentTime) * 1000)), target: Math.round(this.target * 1000), under: this.under, dropped: this.dropped, pkts: this.pkts, legacy: true };
    }
    const w = this.wst;
    if (!w) return { buf: 0, target: 0, under: 0, dropped: 0, pkts: this.pkts };
    // dropped: gelmeyen ya da geç gelip yeri gizleme sesiyle doldurulan paket.
    return { ...w, dropped: w.lost + w.late, pkts: this.pkts, out: Math.round(((this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) * 1000) };
  }

  stop() {
    this.el.srcObject = null;
    try { this.dec?.close(); } catch {}
    this.dec = null;
    this.node?.disconnect();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    clearTimeout(this.wakeT);
    sesOturumu('auto');
    this.resetState();
  }
}
