// Veri kanalı (iPhone/iPad) ve tünel (WebSocket) aktarımında H.264 karelerini
// WebCodecs ile çözüp tuvale çizer. (Masaüstü tarayıcının WebRTC yolunda
// görüntüyü tarayıcının kendi <video> öğesi oynatır.)
//
// Hattın ilkeleri (Köprü için sıfırdan yazıldı; gerekçeler ve ölçümler:
// docs/arastirma/07-istemci-goruntu.md):
//  - Çözücüden çıkan kare tek bir "bekleyen kare" yuvasına konur; yenisi gelirse
//    eskisi çizilmeden bırakılır. Çizim ekran yenilemesine bağlıdır
//    (requestAnimationFrame): ekranın gösterebileceğinden fazla kare çizilmez,
//    kare kuyruğu oluşmaz, gecikme birikmez.
//  - Sayfa görünmüyorken ne çözülür ne çizilir; dönünce taze bir anahtar kare
//    istenir, uzun aradan sonra çözücü baştan kurulur (iPhone'da uygulama
//    askıya alınınca donanım çözücü oturumu geçersizleşebilir).
//  - Kare onayı (bilgisayarın teslim denetimi) kare çözücüden çıkınca verilir:
//    telefonun çözücüsü geride kalırsa bilgisayar da yeni kare kodlamaz. Çözücü
//    bir kareyi tutarsa onay en geç ONAY_SINIR ms sonra yine verilir (kilitlenme yok).
//  - Çözücü hata verir, kapanır ya da takılırsa yeniden kurulur ve anahtar kare
//    istenir; istekler seyreltilir (300 ms'den başlayıp 3 sn'ye kadar aralıkla).
//  - Bu cihazda bu profille kareler çözülmüşse ("kanıtlanmış") geçici arızalar
//    profili "çözülemiyor" saymaz; yalnız uzun süren kesintisiz arıza bildirilir.
import { badProfiles } from './profiles.js';

export function wsProfile() {
  // iPhone ve tarayıcıların donanım çözücüsü için 4:2:0 High; desteklenmezse Main/Baseline.
  return 'high';
}

const CODECS = { high: 'avc1.640033', main: 'avc1.4D0033', baseline: 'avc1.42E033' };

// pickWsProfile çözücünün desteklediği ilk profili seçer; bu cihazda daha önce
// çözülemediği görülenleri ve "skip" ile verileni atlar.
export async function pickWsProfile(skip) {
  if (typeof VideoDecoder === 'undefined') return null;
  const bad = badProfiles('wc');
  for (const p of ['high', 'main', 'baseline']) {
    if (p === skip || bad.has(p)) continue;
    try { if ((await VideoDecoder.isConfigSupported({ codec: CODECS[p], optimizeForLatency: true })).supported) return p; } catch {}
  }
  return null;
}

const TIK = 100;            // denetim aralığı (ms)
const KUYRUK = 64;          // çözücüde aynı anda en çok bu kadar kare; dolarsa birikme sayılır
const ONAY_SINIR = 150;     // çözücüde bundan uzun kalan karenin onayı yine verilir
const TAKILMA = 1000;       // bu süre hiç kare çıkmazsa (kanıtlanmış çözücü) yeniden kurulur
const ANAHTAR_ILK = 300;    // anahtar kare yeniden isteme aralığı: başlangıç…
const ANAHTAR_EN_COK = 3000; // …ve üst sınır (her istekte iki katına çıkar)
const UZAK = 3000;          // bu kadar görünmez kaldıysa dönüşte çözücü baştan kurulur
const KANIT = 10;           // bu kadar kare çözüldüyse profil bu cihazda çalışıyor demektir
const ISRAR = 20000;        // kanıtlanmış çözücü bu kadar süre hiç kare veremezse bildirilir

// ort: üstel ortalama (istatistik ekranı için).
const ort = (a, x) => (a ? a * 0.9 + x * 0.1 : x);

export class WsVideo {
  // needKey(): bilgisayardan anahtar kare ister; gönderilemediyse false döner.
  constructor(canvas, profile, needKey) {
    // Opak tuval: saydamlık karışımı yapılmaz (çizim daha ucuz).
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.profile = profile; this.needKey = needKey;
    this.ts = 0; this.frames = 0; this.waitKey = true;
    // Art arda çözme hatası: arada tek kare bile çıkmadıysa bu profil bu cihazda
    // çözülemiyor demektir (siyah ekran); onbroken ile bildirilir.
    // Bazı çözücüler hata vermeden sessizce kare üretmez: en az iki anahtar kare
    // dahil 5+ parça girip 2 sn'de tek kare çıkmazsa da aynı sonuç.
    this.errs = 0; this.broken = false; this.closed = false;
    this.outN = 0; // bu nesnenin ömründe çözülen kare sayısı (kanıt)
    // Çözücüdeki kareler (halka): zaman damgası, giriş anı, sıra no, onay işlevi, onaylandı mı.
    this.qTs = new Float64Array(KUYRUK); this.qAt = new Float64Array(KUYRUK);
    this.qSeq = new Uint32Array(KUYRUK); this.qOk = new Uint8Array(KUYRUK); this.qAck = new Array(KUYRUK).fill(null);
    this.qH = 0; this.qL = 0;
    this.pending = null; this.pendAt = 0; this.raf = 0; this.rafAt = 0;
    this.keyAt = -1e9; this.keyGap = ANAHTAR_ILK; this.keyWant = false;
    this.resets = 0; this.badSince = 0;
    // İstatistik: çözülen, çizilmeden geçilen (yenisi geldi), atılan (anahtar kare
    // beklenirken/görünmezken), yeniden kurma, anahtar kare isteği, ortalama süreler.
    this.st = { dec: 0, skip: 0, drop: 0, reset: 0, kf: 0, decMs: 0, waitMs: 0, drawMs: 0, qMax: 0, why: '' };
    this.hiddenAt = document.hidden ? performance.now() : 0;
    this.drawCb = () => this.draw();
    this.onVis = () => this.visibility();
    document.addEventListener('visibilitychange', this.onVis);
    this.make();
    this.timer = setInterval(() => this.tick(), TIK);
  }

  get proven() { return this.outN >= KANIT; }

  make() {
    if (this.closed) return;
    clearTimeout(this.laterT); // bekleyen bir yeniden kurma varsa bu yeterli
    try { if (this.dec && this.dec.state !== 'closed') this.dec.close(); } catch {}
    this.release();
    this.waitKey = true;
    this.lastOut = performance.now(); this.inN = 0; this.inKeys = 0; this.kfAsked = false;
    const dec = new VideoDecoder({ output: (f) => this.onFrame(f, dec), error: (e) => this.onError(e, dec) });
    this.dec = dec;
    try { dec.configure({ codec: CODECS[this.profile] || CODECS.high, optimizeForLatency: true }); }
    catch (e) { this.onError(e, dec); }
  }

  // ---- çözücüdeki kareler ----
  qPush(ts, seq, ack) {
    const i = (this.qH + this.qL) % KUYRUK;
    this.qTs[i] = ts; this.qAt[i] = performance.now(); this.qSeq[i] = seq; this.qAck[i] = ack || null; this.qOk[i] = 0;
    this.qL++;
    if (this.qL > this.st.qMax) this.st.qMax = this.qL;
  }
  // qPop en eski kareyi çıkarır; onayı verilmediyse şimdi verir.
  qPop() {
    const i = this.qH;
    if (!this.qOk[i]) this.qAck[i]?.(this.qSeq[i]);
    this.qAck[i] = null;
    this.qH = (i + 1) % KUYRUK; this.qL--;
  }
  // release çözücüdeki bütün karelerin onayını verir (çözücü kapandı/yenilendi).
  release() { while (this.qL) this.qPop(); }

  // ---- giriş ----
  // push bir kareyi ([u8 anahtar][Annex-B]) çözücüye verir. seq/ack: kare
  // işlenince (çözülünce ya da atlanınca) ack(seq) çağrılır. Veri bu çağrı
  // içinde kopyalanır (EncodedVideoChunk); çağıran tamponu yeniden kullanabilir.
  push(data, seq, ack) {
    if (this.closed || this.broken) return ack?.(seq);
    const key = data[0] === 1;
    if (document.hidden) {
      // Görünmüyorken çözme ve çizme yok; dönüşte taze anahtar kare istenir.
      this.waitKey = true; this.st.drop++;
      return ack?.(seq);
    }
    // Tarayıcı çözücüyü hata bildirmeden kapatmış olabilir (geri alma): yeniden kur.
    if (this.dec.state === 'closed') this.rebuild('çözücü kapandı', true);
    // Çözücü çok geride: biriken kareleri çözmeye uğraşma, taze anahtar kareden başla.
    if (this.qL >= KUYRUK - 1) this.rebuild('birikme', true);
    if (this.waitKey && !key) { this.keyWant = true; this.askKey(); this.st.drop++; return ack?.(seq); }
    if (this.dec.state !== 'configured') { this.st.drop++; return ack?.(seq); }
    if (key) { this.waitKey = false; this.keyWant = false; this.keyGap = ANAHTAR_ILK; }
    this.inN++; if (key) this.inKeys++;
    this.ts += 16666;
    try { this.dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: this.ts, data: data.subarray(1) })); }
    catch (e) { ack?.(seq); this.onError(e, this.dec); return; }
    this.qPush(this.ts, seq, ack);
  }

  // ---- çıkış ----
  onFrame(f, dec) {
    if (dec !== this.dec || this.closed) { f.close(); return; }
    const now = performance.now();
    // Bu kareye kadar çözücüye verilenler işlendi; çıktısız kalanlar atlanmış sayılır.
    while (this.qL && this.qTs[this.qH] <= f.timestamp) {
      if (this.qTs[this.qH] === f.timestamp) this.st.decMs = ort(this.st.decMs, now - this.qAt[this.qH]);
      this.qPop();
    }
    this.outN++; this.st.dec++;
    this.errs = 0; this.resets = 0; this.badSince = 0;
    this.lastOut = now; this.inN = 0; this.inKeys = 0; this.kfAsked = false;
    // Tek yuva: çizilmeyi bekleyen eski kare varsa bırakılır, en yenisi çizilir.
    if (this.pending) { this.pending.close(); this.st.skip++; }
    this.pending = f; this.pendAt = now;
    if (document.hidden) return;
    if (!this.raf) { this.rafAt = now; this.raf = requestAnimationFrame(this.drawCb); }
    else if (now - this.rafAt > 100) { cancelAnimationFrame(this.raf); this.draw(); } // ekran yenilemesi gelmiyor: hemen çiz
  }

  draw() {
    this.raf = 0;
    const f = this.pending;
    if (!f || this.closed) return;
    this.pending = null;
    const c = this.canvas, w = f.displayWidth, h = f.displayHeight;
    let resized = false;
    // Akış boyutu değişti (otomatik çözünürlük: yakınlaştırma, döndürme): tuval yeni boyuta.
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; resized = true; }
    const t0 = performance.now();
    this.st.waitMs = ort(this.st.waitMs, t0 - this.pendAt);
    try { this.ctx.drawImage(f, 0, 0); } catch {}
    this.st.drawMs = ort(this.st.drawMs, performance.now() - t0);
    f.close();
    this.frames++;
    if (resized) this.onresize?.();
  }

  // ---- arıza ve kurtarma ----
  onError(e, dec) {
    if (dec !== this.dec || this.closed || this.broken) return;
    this.st.why = (e && (e.name || e.message)) || 'hata';
    this.release();
    // Arka planda çözücüyü geri almak ya da kanıtlanmış çözücünün geçici hatası
    // arıza sayılmaz: yeniden kur, anahtar kare iste.
    if (document.hidden || this.proven) { this.errs = 0; return this.later(() => this.rebuild(this.st.why, !document.hidden)); }
    if (!this.failed()) this.later(() => this.rebuild(this.st.why, false));
  }

  later(fn) {
    clearTimeout(this.laterT);
    this.laterT = setTimeout(() => { if (!this.closed && !this.broken) fn(); }, 50);
  }

  // rebuild çözücüyü baştan kurar ve anahtar kare ister. fault: gerçek arıza
  // (kanıtlanmış çözücüde uzun süren arızayı saymak için).
  rebuild(why, fault) {
    if (this.closed) return;
    this.st.reset++; this.st.why = why;
    if (fault) { this.resets++; if (!this.badSince) this.badSince = performance.now(); }
    this.make();
    this.keyWant = true;
    this.askKey();
  }

  // askKey anahtar kare ister; istekler seyreltilir (bilgisayar da 300 ms'den sık üretmez).
  askKey() {
    const now = performance.now();
    if (now - this.keyAt < this.keyGap) return;
    this.keyAt = now;
    if (this.needKey() === false) { this.keyAt = now - this.keyGap + 250; return; } // kanal hazır değil: az sonra yeniden
    this.st.kf++;
    this.keyGap = Math.min(this.keyGap * 2, ANAHTAR_EN_COK);
  }

  tick() {
    if (this.closed || this.broken) return;
    const now = performance.now();
    // Arka planda tarayıcı çözücüyü geri alabilir: bu bir arıza sayılmaz.
    if (document.hidden) { this.lastOut = now; this.inN = this.inKeys = 0; this.badSince = 0; return; }
    // Onay gecikmesinin sınırı: çözücü bir kareyi tutuyorsa bilgisayar beklemesin.
    for (let k = 0, i = this.qH; k < this.qL; k++, i = (i + 1) % KUYRUK) {
      if (this.qOk[i]) continue;
      if (now - this.qAt[i] <= ONAY_SINIR) break;
      this.qOk[i] = 1; this.qAck[i]?.(this.qSeq[i]);
    }
    const silent = now - this.lastOut;
    if (!this.proven) {
      // Hiç kare çıkmadı: profil bu cihazda çözülemiyor olabilir (görüntü bekçisi).
      if (this.inN >= 5 && silent > 2000) {
        if (this.inKeys >= 2) { this.failed(true); return; }
        if (!this.kfAsked) { this.kfAsked = true; this.keyWant = true; this.askKey(); }
      }
    } else if (this.qL && silent > TAKILMA && now - this.qAt[this.qH] > TAKILMA) {
      // Kanıtlanmış çözücü takıldı (kare alıyor, vermiyor): baştan kur.
      this.rebuild('takıldı', true);
    } else if (this.badSince && this.resets >= 4 && now - this.badSince > ISRAR && silent > ISRAR) {
      this.failed(true);
      return;
    }
    // Anahtar kare bekleniyor ve istenmişti: yanıt gelmediyse seyreltilmiş aralıkla yeniden iste.
    if (this.waitKey && this.keyWant) this.askKey();
  }

  failed(now) {
    if (this.closed || this.broken) return true;
    if (document.hidden) { this.errs = 0; return false; }
    if (++this.errs < 4 && !now) return false;
    this.broken = true;
    this.release();
    // proven: bu cihaz bu profili çözebildi; arıza kalıcı değil (profil işaretlenmemeli).
    this.onbroken?.(this.profile, this.proven);
    return true;
  }

  visibility() {
    if (this.closed) return;
    const now = performance.now();
    if (document.hidden) {
      this.hiddenAt = now;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
      return;
    }
    const away = this.hiddenAt ? now - this.hiddenAt : 0;
    this.hiddenAt = 0;
    this.lastOut = now; this.inN = this.inKeys = 0; this.badSince = 0; this.resets = 0;
    if (this.broken) return;
    // Uzun aradan sonra (iPhone'da uygulama askıya alınmış olabilir) çözücüyü
    // baştan kur; kısa aradan sonra yalnız anahtar kare iste (görünmezken
    // gelen kareler atlandı).
    if (away >= UZAK || this.dec.state !== 'configured') this.rebuild('geri dönüş', false);
    else if (this.waitKey) { this.keyWant = true; this.askKey(); }
    if (this.pending && !this.raf) { this.rafAt = now; this.raf = requestAnimationFrame(this.drawCb); }
  }

  // restart aktarım yenilenince (yeni veri kanalı / tünel bağlantısı) çağrılır:
  // aradaki kareler kaybolmuş olabilir, bozuk görüntü yerine anahtar kare beklenir.
  restart() {
    if (this.closed || this.broken) return;
    this.make();
  }

  // stats istatistik ekranı için özet; en büyük kuyruk okununca sıfırlanır.
  stats() {
    const s = { ...this.st, q: this.qL, state: this.dec?.state, proven: this.proven };
    this.st.qMax = this.qL;
    return s;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer); clearTimeout(this.laterT);
    document.removeEventListener('visibilitychange', this.onVis);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.pending) { this.pending.close(); this.pending = null; }
    this.release();
    try { this.dec.close(); } catch {}
  }
}
