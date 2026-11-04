// Köprü ses çalıcısı (AudioWorklet, ses iş parçacığında çalışır).
//
// Neden: 1.2.7'de her Opus paketi ayrı bir AudioBufferSourceNode olarak ileri
// bir zamana kuruluyordu. Tampon yalnızca taşınca (hedef + 60 ms) paket atarak
// küçülüyordu; ağ bir kez takılınca fazladan biriken ses (hedefin 60 ms'e
// kadar üstü) hiç erimiyor, ses kalıcı olarak geriden geliyordu. Ölçüm (yerel
// ağda bile): hedef 40 ms iken tampon 109 ms'de kalıyordu; kesintide 20–160 ms
// sessiz boşluk ve çıtırtı vardı.
//
// Burada "çekme" modeli var: ses donanımı
// her 128 örnekte bir buradan ses ister (process), biz de sıradaki örnekleri
// kendi halka tamponumuzdan veririz. Tamponun ne kadar dolu tutulacağını ağın
// ölçülen sarsıntısı belirler; fazlası sesi bozmadan eritilir:
//
//  - Sarsıntı: her kare için varış zamanı − kare numarası × kare süresi; son
//    10 sn'deki en küçüğüne göre gecikme (d). Hedef dolu kalma = kare + 1
//    işleme dilimi + d'nin %97'lik değeri (en az ~15 ms, en çok 250 ms).
//  - "Zamanında gelen paket" dolu kalması C = (kare sonu − okuma konumu) + d;
//    ağ sarsıntısından bağımsızdır. C hedefin belirgin üstündeyse ses kısa,
//    benzer bir dalga noktasında 2,5–10 ms atlanarak (çapraz geçişle; sessizlikte
//    doğrudan) sıkıştırılır; altındaysa aynı yolla biraz uzatılır. Paket atma
//    ya da ses perdesini değiştirme yok.
//  - Kayıp (sonraki kare geldi, bu gelmedi): kare süresi kadar dalga, son
//    sesin perdesi bulunup tekrarlanarak sönümlü biçimde doldurulur (gizleme).
//  - Açlık (hiç kare yok): aynı gizleme sönerek sessizliğe iner; kare gelince
//    çapraz geçişle devam edilir. Takılma gecikmeyi büyütür, sonra yine erir.
//
// SesTamponu yalnızca hesap yapar (Web Audio'ya bağlı değil); Node'da da
// denenebilir. Yaklaşım genel ses mühendisliği bilgisidir (docs/arastirma/07-ses.md).

class SesTamponu {
  constructor(sr) {
    this.a = SesTamponu.AYAR;
    this.sr = sr;
    this.cap = 1 << 17; // ~2,7 sn
    this.mask = this.cap - 1;
    this.L = new Float32Array(this.cap);
    this.R = new Float32Array(this.cap);
    this.ta = new Float32Array(512); this.tb = new Float32Array(512); // geçici (çapraz geçiş)
    this.Q = 128; // işleme dilimi
    this.W = Math.round(sr * 0.005); // çapraz geçiş / benzerlik penceresi
    this.Dmin = Math.round(sr * 0.0025);
    this.Dmax = Math.round(sr * 0.010);
    this.dWin = new Float64Array(1024); // son varışların göreli zamanı (örnek)
    this.cWin = new Float64Array(32); // son C ölçümleri (cAdj eklenmiş)
    this.dSort = new Float64Array(1024);
    this.cSort = new Float64Array(32); // ses iş parçacığında her dilimde yeni dizi açılmasın
    this.reset();
  }

  reset() {
    this.w = 0; this.r = 0; this.hist = 0; // yazma/okuma konumu, geçmişin başı
    this.staged = new Map(); // sırası gelmemiş kareler
    this.next = null; this.maxSeq = null; this.F = 0;
    this.wStream = 0; // w'deki örneğin akış konumu (kare no × F)
    this.started = false; this.starving = false; this.afterPlc = false; this.plcP = 0; this.plcAmp = 1;
    this.starveG = 0; this.resumeAt = 0; this.peaks = []; this.peakWait = false; this.peakMed = 0;
    this.dN = 0; this.dBase = Infinity; this.dq = 0; this.cN = 0; this.cAdj = 0;
    this.lastOp = 0; this.now = 0;
    this.st = { pkts: 0, under: 0, lost: 0, late: 0, acc: 0, exp: 0, conceal: 0, resync: 0 };
  }

  level() { return this.w - this.r; }

  // Akış konumu: okuma noktasındaki örneğin kare cinsinden yeri.
  streamPos() { return this.wStream - (this.w - this.r); }

  // Hedef C (örnek).
  target() {
    const lo = this.F + this.Q + 128;
    let t = this.dN >= 20 ? lo + this.dq : Math.max(lo, Math.round(this.sr * 0.03));
    // Takılmalar sık tekrarlıyorsa (son tepeSure sn'de en az 2) hedef onların
    // gecikmesini de (ortancası) karşılasın: her takılmada ses kesilmesin.
    if (this.a.tepe && this.peaks.length >= 2) t = Math.max(t, lo + this.peakMed * this.a.tepe);
    return Math.min(Math.max(t, lo), Math.round(this.sr * this.a.enCok));
  }

  // Ağdan (çözülmüş) bir kare: s kare numarası, l/r örnekler; now ses saatinde örnek.
  push(s, l, r, now) {
    this.now = now;
    const n = l.length;
    if (!n) return;
    this.st.pkts++;
    if (this.next === null || (this.F && n !== this.F) || s < this.next - 200 || s > this.maxSeq + 3000) {
      // İlk kare, kare boyu değişti ya da akış yeniden başladı (ajan yeni oturum).
      if (this.next !== null) this.st.resync++;
      const keep = this.st;
      this.reset();
      this.st = keep;
      this.F = n; this.next = s; this.maxSeq = s; this.wStream = s * n;
    }
    // Sarsıntı ölçümü.
    const rel = now - s * this.F;
    this.dWin[this.dN % 1024] = rel;
    this.dN++;
    if (rel < this.dBase) this.dBase = rel;
    if (this.dN % 32 === 0 || this.dN === 20) this.updateDq();
    const d = Math.max(0, rel - this.dBase);
    if (this.peakWait) { // kesintiyi bitiren karenin gecikmesi: takılmanın boyu
      this.peakWait = false;
      this.peaks.push([now, d]);
      while (this.peaks.length && now - this.peaks[0][0] > this.sr * this.a.tepeSure) this.peaks.shift();
      const p = this.peaks.map((x) => x[1]).sort((a, b) => a - b);
      this.peakMed = p[p.length >> 1];
    }
    if (s < this.next) { this.st.late++; return; } // çalma noktası geçti
    if (this.staged.size > 400) { this.st.resync++; this.staged.clear(); this.next = s; this.wStream = s * this.F; this.cN = 0; }
    this.staged.set(s, [l, r]);
    if (s > this.maxSeq) this.maxSeq = s;
    this.fill();
    if (this.started) {
      // C: bu kare zamanında gelseydi tamponda ne kadar ses olurdu.
      const c = (s + 1) * this.F - this.streamPos() + d;
      this.cWin[this.cN % 32] = c + this.cAdj;
      this.cN++;
    }
  }

  updateDq() {
    const m = Math.min(this.dN, 1024);
    let base = Infinity;
    for (let i = 0; i < m; i++) if (this.dWin[i] < base) base = this.dWin[i];
    this.dBase = base;
    const a = this.dSort.subarray(0, m);
    for (let i = 0; i < m; i++) a[i] = this.dWin[i] - base;
    a.sort();
    this.dq = Math.round(a[Math.min(m - 1, Math.floor(m * this.a.q))]);
  }

  cEst() {
    const m = Math.min(this.cN, 32);
    if (m < 8) return null;
    const a = m === 32 ? this.cSort : this.cSort.subarray(0, m);
    for (let i = 0; i < m; i++) a[i] = this.cWin[i];
    a.sort();
    return a[m >> 1] - this.cAdj;
  }

  // Sırası gelen kareleri halkaya yaz.
  fill() {
    while (this.staged.has(this.next)) {
      const [l, r] = this.staged.get(this.next);
      this.staged.delete(this.next);
      this.writeReal(l, r);
      this.next++;
    }
  }

  writeReal(l, r) {
    const n = l.length, m = this.mask;
    let k = 0;
    if (this.afterPlc) {
      // Gizlemeden gerçek sese yumuşak geçiş. 3 ms: kayıptan sonra çözülen
      // karenin başı (Opus'un 2,5 ms'lik örtüşmesi) önceki kareyle uyuşmaz;
      // bu bölge geçişin içinde kalır.
      const X = Math.min(144, n);
      this.plc(X, false);
      this.w -= X;
      for (; k < X; k++) {
        const t = (k + 1) / (X + 1), i = (this.w + k) & m;
        this.L[i] = this.L[i] * (1 - t) + l[k] * t;
        this.R[i] = this.R[i] * (1 - t) + r[k] * t;
      }
      this.afterPlc = false;
    }
    for (; k < n; k++) { const i = (this.w + k) & m; this.L[i] = l[k]; this.R[i] = r[k]; }
    this.wStream = this.next * this.F + n;
    this.w += n;
    this.plcAmp = 1;
    if (this.w - this.r > this.cap / 2) {
      // Ses işlenmeden birikti (bağlam askıdaydı): eskisini atla.
      this.r = this.w - this.target();
      this.hist = this.r;
      this.st.resync++; this.cN = 0;
    }
  }

  // plc n örnek gizleme sesi yazar: son sesin perdesi (periyodu) bulunur ve
  // sönümlenerek tekrarlanır (20 ms'de yarıya). Gerçek ses yoksa sessizlik.
  plc(n, count = true) {
    const m = this.mask;
    if (this.w - this.hist < 1200 || this.plcAmp < 0.02) {
      for (let k = 0; k < n; k++) { const i = (this.w + k) & m; this.L[i] = 0; this.R[i] = 0; }
      this.w += n; this.plcAmp = 0; this.afterPlc = true;
      return;
    }
    let pre = 0; // çalınmış sesten başlarken ilk örneklerde eğimle devam
    if (!this.afterPlc) {
      this.plcP = this.period();
      // Kuyruğu periyodik kopyasına yaklaştır (birleşme yerinde kırılma olmasın).
      const M = Math.min(64, this.w - this.r);
      for (let j = 0; j < M; j++) {
        const t = (j + 1) / (M + 1), i = (this.w - M + j) & m, p = (this.w - M + j - this.plcP) & m;
        this.L[i] = this.L[i] * (1 - t) + this.L[p] * t;
        this.R[i] = this.R[i] * (1 - t) + this.R[p] * t;
      }
      // Tampon tümüyle çalındıysa kuyruk değiştirilemez: son örneklerin
      // eğiminden periyodik kopyaya geçiş yap.
      if (M < 32) pre = 32;
    }
    const P = this.plcP, dec = Math.pow(0.5, P / (this.sr * 0.02));
    const w0 = this.w, l1 = this.L[(w0 - 1) & m], r1 = this.R[(w0 - 1) & m];
    const ls = l1 - this.L[(w0 - 2) & m], rs = r1 - this.R[(w0 - 2) & m];
    for (let k = 0; k < n; k++) {
      const i = (this.w + k) & m, p = (this.w + k - P) & m;
      let a = this.L[p] * dec, b = this.R[p] * dec;
      if (k < pre) {
        const t = (k + 1) / (pre + 1), f = 1 - t; // tahminin etkisi azalır
        a = (l1 + ls * (k + 1) * f) * (1 - t) + a * t;
        b = (r1 + rs * (k + 1) * f) * (1 - t) + b * t;
      }
      this.L[i] = a; this.R[i] = b;
    }
    this.plcAmp *= Math.pow(0.5, n / (this.sr * 0.02));
    this.w += n;
    this.afterPlc = true;
    if (count) this.st.conceal += n;
  }

  // period yazma noktasının hemen öncesindeki sesin periyodunu bulur (1,7–16 ms).
  period() {
    const m = this.mask, N = 320, end = this.w;
    let best = 480, bc = -1;
    for (let P = 80; P <= 800; P += 2) {
      let xy = 0, xx = 0, yy = 0;
      for (let k = end - N; k < end; k += 2) {
        const a = this.L[k & m] + this.R[k & m], b = this.L[(k - P) & m] + this.R[(k - P) & m];
        xy += a * b; xx += a * a; yy += b * b;
      }
      const c = xy / Math.sqrt(xx * yy + 1e-12);
      if (c > bc) { bc = c; best = P; }
    }
    return best;
  }

  // bestShift x[r..r+W) ile x[r±D..r±D+W) en benzer olan D'yi [lo, hi]
  // aralığında bulur (sign=+1 ileri, −1 geri). Ses sessizse doğrudan hi.
  bestShift(lo, hi, sign) {
    const m = this.mask, W = this.W, r = this.r;
    let best = 0, bc = -2, silent = true;
    for (let k = 0; k < W + hi; k++) {
      const i = (r + sign * k) & m;
      if (Math.abs(this.L[i]) > 0.001 || Math.abs(this.R[i]) > 0.001) { silent = false; break; }
    }
    if (silent) return [hi, 1];
    for (let D = lo; D <= hi; D += 2) {
      let xy = 0, xx = 0, yy = 0;
      for (let k = 0; k < W; k += 2) {
        const i = (r + k) & m, j = (r + sign * D + k) & m;
        const a = this.L[i] + this.R[i], b = this.L[j] + this.R[j];
        xy += a * b; xx += a * a; yy += b * b;
      }
      const c = xy / Math.sqrt(xx * yy + 1e-12);
      if (c > bc) { bc = c; best = D; }
    }
    return [best, bc];
  }

  // splice okuma noktasında sesi D örnek kısaltır (sign=+1) ya da uzatır (−1):
  // x[r..r+W) ile x[r±D..) arasında çapraz geçiş.
  splice(D, sign, W = this.W) {
    const m = this.mask, r = this.r;
    for (let k = 0; k < W; k++) { const i = (r + k) & m; this.ta[k] = this.L[i]; this.tb[k] = this.R[i]; }
    const o = r + sign * D;
    for (let k = 0; k < W; k++) {
      const t = (k + 0.5) / W, i = (o + k) & m;
      this.L[i] = this.ta[k] * (1 - t) + this.L[i] * t;
      this.R[i] = this.tb[k] * (1 - t) + this.R[i] * t;
    }
    this.r = o;
    this.cAdj += sign * D;
    if (sign > 0) this.st.acc += D; else this.st.exp += D;
  }

  // skipBacklog ağ takılıp ses kesildikten sonra topluca gelen eski sesi atlar:
  // kesinti zaten gizleme sesiyle kapatıldı; takılan kısmı geç çalmak gecikmeyi
  // takılma kadar büyütürdü. Atlama benzer dalga noktasında, çapraz geçişle.
  // Kareler birkaç dilimde gelebilir: kesinti bitince 100 ms boyunca denenir.
  skipBacklog() {
    if (!this.a.atla || this.now - this.resumeAt > this.sr * 0.1) { this.starveG = 0; return; }
    const X = 2 * this.W; // uzun atlamada daha uzun çapraz geçiş
    const want = Math.min(this.starveG, this.level() - this.target() - X);
    if (want < this.Dmin) return;
    const [D] = this.bestShift(Math.max(this.Dmin, want - this.Dmax), want, 1);
    this.splice(D, 1, X);
    this.st.acc -= D; this.st.skip = (this.st.skip || 0) + D;
    this.starveG -= D;
  }

  // control tamponu hedefe yaklaştırır (her işleme diliminden sonra).
  control() {
    const c = this.cEst();
    if (c === null) return;
    const ex = c - this.target(), H = Math.round(this.sr * this.a.pay);
    const gap = this.sr * (Math.abs(ex) > this.sr * this.a.hizli ? this.a.aralikHizli : this.a.aralikYavas);
    if (this.now - this.lastOp < gap) return;
    if (ex > H) {
      const dmax = Math.min(this.Dmax, Math.round(ex));
      if (dmax < this.Dmin || this.level() < dmax + this.W + this.Q) return;
      const [D, q] = this.bestShift(this.Dmin, dmax, 1);
      if (q < 0.5) { this.lastOp = this.now - gap / 2; return; } // benzer nokta yok: biraz sonra yine dene
      this.splice(D, 1);
      this.lastOp = this.now;
    } else if (ex < -H && !this.starving) {
      const dmax = Math.min(this.Dmax, Math.round(-ex));
      if (dmax < this.Dmin || this.level() < this.W + this.Q || this.r - this.hist < dmax + this.W) return;
      const [D, q] = this.bestShift(this.Dmin, dmax, -1);
      if (q < 0.5) { this.lastOp = this.now - gap / 2; return; }
      this.splice(D, -1);
      this.lastOp = this.now;
    }
  }

  // read sıradaki n örneği (L, R) dizilerine yazar; now ses saatinde örnek.
  read(outL, outR, now) {
    this.now = now;
    const n = outL.length, m = this.mask;
    if (!this.started) {
      if (this.next !== null && this.level() >= this.target()) { this.started = true; this.hist = this.r; }
      else { outL.fill(0); if (outR) outR.fill(0); return; }
    }
    // Kayıp: sıradaki kare yok ama sonrakiler geldi; ses bitmeden yerini doldur.
    while (this.level() < n + 64 && this.maxSeq >= this.next && !this.staged.has(this.next)) {
      let first = this.next;
      while (!this.staged.has(first)) first++;
      const miss = first - this.next;
      if (miss > 10) { // uzun kopukluk: hepsini gizleme sesiyle doldurma, atla
        this.plc(3 * this.F);
        this.st.resync++; this.cN = 0;
        this.next = first;
      } else {
        this.plc(this.F);
        this.wStream += this.F;
        this.st.lost++;
        this.next++;
      }
      this.fill();
    }
    // Açlık: gelen ses yok; sönümlü gizleme ile doldur, akış konumu ilerlemez.
    if (this.level() < n) {
      if (!this.starving) { this.starving = true; this.st.under++; this.starveG = 0; this.peakWait = true; }
      const g = n - this.level();
      this.plc(g);
      this.cAdj -= g;
      this.starveG += g;
    } else if (this.starving && !this.afterPlc) { this.starving = false; this.resumeAt = now; }
    for (let k = 0; k < n; k++) {
      const i = (this.r + k) & m;
      outL[k] = this.L[i];
      if (outR) outR[k] = this.R[i];
    }
    this.r += n;
    if (this.starving && this.level() > 0) { this.starving = false; this.resumeAt = now; }
    if (this.starveG > 0 && !this.starving) this.skipBacklog();
    this.control();
  }

  stats() {
    const c = this.cEst();
    return {
      buf: this.next === null ? 0 : Math.round(((this.maxSeq + 1) * this.F - this.streamPos()) / this.sr * 1000),
      target: Math.round(this.target() / this.sr * 1000),
      c: c === null ? null : Math.round(c / this.sr * 1000),
      jitter: Math.round(this.dq / this.sr * 1000),
      ...this.st,
      acc: Math.round(this.st.acc / this.sr * 1000), exp: Math.round(this.st.exp / this.sr * 1000),
      conceal: Math.round(this.st.conceal / this.sr * 1000),
      skip: Math.round((this.st.skip || 0) / this.sr * 1000),
    };
  }
}

// Ayarlar (Node benzetimiyle seçildi, docs/arastirma/07-ses.md):
//  q            hedef, varış gecikmelerinin bu dilimini karşılar (0,97)
//  hizli        hedefin bu kadar (sn) üstündeyken hızlı eritme
//  aralikHizli  hızlı eritmede iki işlem arası en az (sn); yavaşta aralikYavas
//  pay          hedefin ± bu kadar (sn) yakınında dokunma
//  enCok        hedef üst sınırı (sn)
//  atla         kesintiden sonra topluca gelen eski sesi atla
//  tepe         takılmalar tekrarlıyorsa hedef, takılma gecikmelerinin
//               ortancasının bu katını da karşılar (son tepeSure sn)
SesTamponu.AYAR = { q: 0.97, hizli: 0.05, aralikHizli: 0.03, aralikYavas: 0.06, pay: 0.005, enCok: 0.25, atla: true, tepe: 0.5, tepeSure: 20 };

if (typeof registerProcessor === 'function') {
  registerProcessor('kopru-ses', class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.t = new SesTamponu(sampleRate);
      this.last = 0;
      this.port.onmessage = (e) => {
        const m = e.data;
        if (m.t === 'k') this.t.push(m.s, m.l, m.r, this.clock());
        else if (m.t === 'sifirla') this.t.reset();
      };
    }

    clock() { return typeof currentFrame === 'number' ? currentFrame : Math.round(currentTime * sampleRate); }

    process(_, outputs) {
      const o = outputs[0];
      if (!o || !o[0]) return true;
      const now = this.clock();
      this.t.read(o[0], o[1], now);
      if (now - this.last >= sampleRate / 4) {
        this.last = now;
        this.port.postMessage({ t: 'd', st: this.t.stats() });
      }
      return true;
    }
  });
} else if (typeof globalThis !== 'undefined') {
  globalThis.SesTamponu = SesTamponu; // Node'da deneme için
}
