// Sinyal sunucusu bağlantısı, uçtan uca kimlik doğrulama ve WebRTC oturumu.
//
// Kopma dayanıklılığı (sık bağlantı kopması sorununa karşı):
//  1) Sinyal WebSocket'i koparsa sessizce yeniden bağlanır, oturum "resume" ile sürer.
//  2) WebRTC "disconnected" olursa 1,5 sn sonra ICE yeniden başlatılır (ağ değişimi, Wi-Fi→4G).
//  3) Kurtarılamazsa aynı anahtarla, parola sormadan baştan bağlanılır.

import { badProfiles, markBadProfile, profileOf } from './profiles.js';

const enc = new TextEncoder();

// MIN_ITER kabul edilen en düşük PBKDF2 tekrar sayısı (ajan: proto.PBKDF2Iter = 210000).
export const MIN_ITER = 100000;

export const b64u = {
  enc(buf) {
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const s = atob(str);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  },
};

export async function deriveKey(password, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64u.dec(saltB64), iterations: iter, hash: 'SHA-256' }, base, 256);
  return b64u.enc(bits);
}

export function fingerprints(sdp) {
  const set = new Set();
  const re = /^a=fingerprint:\s*(\S+)\s+([0-9a-f:]+)\s*$/gim;
  let m;
  while ((m = re.exec(sdp))) set.add(m[1].toLowerCase() + ' ' + m[2].toLowerCase());
  return [...set].sort().join(',');
}

export async function hmac(keyB64, ...parts) {
  const k = await crypto.subtle.importKey('raw', b64u.dec(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u.enc(await crypto.subtle.sign('HMAC', k, enc.encode(parts.join('|'))));
}

async function hmacRaw(keyBytes, text) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}

function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------------- Sinyal ----------------

// wsBase "https://x" → "wss://x"
export function wsBase(httpUrl) {
  const u = new URL(httpUrl || location.href);
  return (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host;
}

// stereoOpus teklifte Opus için stereo alımı ister (yoksa tarayıcı tek kanala indirir).
export function stereoOpus(sdp) {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return sdp;
  const re = new RegExp('(a=fmtp:' + m[1] + ' [^\\r\\n]*)');
  return re.test(sdp) ? sdp.replace(re, (l) => (/stereo=1/.test(l) ? l : l + ';stereo=1;sprop-stereo=1')) : sdp;
}

export class Signal extends EventTarget {
  constructor(url) {
    super();
    this.url = url || wsBase() + '/ws/client';
    this.ws = null;
    this.queue = [];
    this.backoff = 500;
    this.closed = false;
    this.open();
  }
  open() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 500;
      this.fails = 0;
      this.dispatchEvent(new Event('open'));
      const q = this.queue; this.queue = [];
      q.forEach((m) => this.send(m));
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.dispatchEvent(new CustomEvent('msg', { detail: m }));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.dispatchEvent(new Event('close'));
      if (this.closed) return;
      // Sunucusuz kipte bilgisayarın internet adresi (tünel) değişmiş olabilir:
      // iki başarısız denemeden sonra ilan panosundan güncel adresi sor.
      this.fails = (this.fails || 0) + 1;
      const again = () => setTimeout(() => this.open(), this.backoff);
      if (this.resolve && this.fails >= 2) {
        this.resolve().then((u) => { if (u && u !== this.url) { this.url = u; this.backoff = 500; } }).catch(() => {}).finally(again);
      } else again();
      this.backoff = Math.min(this.backoff * 2, 8000);
    };
    ws.onerror = () => {};
  }
  get ready() { return this.ws && this.ws.readyState === WebSocket.OPEN; }
  send(m) {
    if (this.ready) this.ws.send(JSON.stringify(m));
    else this.queue.push(m);
  }
  close() { this.closed = true; if (this.ws) this.ws.close(); }
}

// ---------------- Oturum ----------------

// H.264 profil tercihi: 4:4:4 (en net metin) > High > Main > Constrained Baseline.
// Bu cihazın çözemediği görülen profiller (görüntü bekçisi) listeye alınmaz.
export function codecOrder(prefer444) {
  if (!window.RTCRtpReceiver || !RTCRtpReceiver.getCapabilities) return null;
  const caps = RTCRtpReceiver.getCapabilities('video').codecs;
  const bad = badProfiles('rtc');
  const rank = (c) => {
    if (!/h264/i.test(c.mimeType) || !/packetization-mode=1/.test(c.sdpFmtpLine || '')) return -1;
    const m = /profile-level-id=([0-9a-f]{6})/i.exec(c.sdpFmtpLine);
    if (!m) return -1;
    if (bad.has(profileOf(c.sdpFmtpLine))) return -1;
    const p = m[1].toLowerCase().slice(0, 4);
    if (p === 'f400') return prefer444 ? 100 : 5;
    if (p === '640c' || p === '6400') return 50;
    if (p === '4d00') return 40;
    if (p === '42e0') return 30;
    if (p === '4200') return 20;
    return -1;
  };
  const list = caps.filter((c) => rank(c) >= 0).sort((a, b) => rank(b) - rank(a));
  return list.length ? list : null;
}

export function supports444() {
  const o = codecOrder(true);
  return !!(o && /profile-level-id=f400/i.test(o[0].sdpFmtpLine));
}

export class RemoteSession extends EventTarget {
  // opts: {signal, id, password?, key?, salt?, prefer444, onKey(key,salt,iter)}
  constructor(opts) {
    super();
    this.o = opts;
    this.sig = opts.signal;
    this.id = opts.id;
    this.key = opts.key || null;
    this.keySalt = opts.salt || null;
    this.sid = null;
    this.rk = null;
    this.pc = null;
    this.dc = {};
    this.state = 'idle';
    this.closed = false;
    this.restartTimer = null;
    this.fullTimer = null;
    this.reconnects = 0;
    this.pendingCands = [];
    this.guardStats = { kf: 0, down: 0 };
    this._onMsg = (e) => this.onSignal(e.detail);
    this._onOpen = () => this.onSignalOpen();
    this.sig.addEventListener('msg', this._onMsg);
    this.sig.addEventListener('open', this._onOpen);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  setState(s, info) { this.state = s; this.emit('state', { state: s, info }); }

  start() {
    this.setState('connecting', 'Sunucuya bağlanılıyor…');
    this.sig.send({ t: 'connect', id: this.id });
  }

  onSignalOpen() {
    // Sinyal bağlantısı yenilendi: süren oturumu sahiplen.
    if (this.sid && this.rk && !this.closed) this.sig.send({ t: 'resume', sid: this.sid, rk: this.rk });
  }

  sendE2E(data) { if (this.sid) this.sig.send({ t: 'signal', sid: this.sid, data }); }

  async onSignal(m) {
    if (this.closed) return;
    if (m.t === 'error' && (m.id === this.id && !this.sid || m.sid && m.sid === this.sid)) {
      if (m.err === 'offline') return this.fail('Uzak bilgisayar çevrimdışı', true);
      if (m.err === 'no_session') { if (this.pc && this.pc.connectionState === 'connected') return; return this.reconnectFull(); }
      if (m.err === 'rate') return this.fail('Çok fazla deneme, biraz bekleyin');
      return this.fail('Sunucu hatası: ' + m.err);
    }
    if (m.t === 'session' && m.id === this.id && !this.sid) {
      this.sid = m.sid; this.rk = m.rk; this.ice = m.ice || [];
      this.peerName = m.name; this.peerOS = m.os;
      this.setState('auth', 'Kimlik doğrulanıyor…');
      // Oturum kimliğinden önce gelmiş iletileri (ör. hızlı ajanın parola sorusu) işle.
      const early = (this.early || []).filter((x) => x.sid === this.sid);
      this.early = null;
      for (const x of early) this.onSignal(x);
      return;
    }
    if (!this.sid && m.t === 'signal' && m.sid) { (this.early ||= []).length < 32 && this.early.push(m); return; }
    if (m.sid !== this.sid) return;
    if (m.t === 'resumed') { if (m.ice) this.ice = m.ice; return; }
    if (m.t === 'bye') {
      const d = m.data || {};
      return this.fail(d.reason ? 'Bağlantı kapandı: ' + d.reason : 'Uzak bilgisayar bağlantıyı kapattı', false, true);
    }
    if (m.t !== 'signal' || !m.data) return;
    const d = m.data;
    try {
      switch (d.k) {
        case 'challenge': await this.onChallenge(d); break;
        case 'answer': await this.onAnswer(d); break;
        case 'reanswer':
          if (this.pc) await this.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
          break;
        case 'wsok': await this.onWSOk(d); break;
        case 'cand':
          if (!d.cand) break;
          if (this.pc && this.pc.remoteDescription) await this.pc.addIceCandidate(d.cand).catch(() => {});
          else this.pendingCands.push(d.cand);
          break;
        case 'denied':
          if (d.reason === 'bad_password') {
            this.key = null;
            this.emit('badpassword', { retry: d.retry });
            return this.fail(d.retry ? `Parola hatalı. ${d.retry} sn sonra tekrar deneyin.` : 'Parola hatalı', false, true);
          }
          if (d.reason === 'locked') return this.fail(`Çok fazla hatalı deneme. ${d.retry} sn bekleyin.`, false, true);
          return this.fail('Bağlantı reddedildi: ' + d.reason, false, true);
      }
    } catch (err) {
      console.error(err);
      this.fail('Bağlantı hatası: ' + err.message);
    }
  }

  async onChallenge(d) {
    // İstemci kanıtını karşı taraftan önce gönderir; sahte bir "bilgisayar" (ör.
    // ilan panosundaki sahte adres) tuzu ve tekrar sayısını kendisi seçip, yakaladığı
    // kanıtla parolayı çevrimdışı dener. Tekrar sayısı 1 olsaydı bu çok ucuz olurdu:
    // Köprü ajanı her zaman 210000 ve 16 baytlık tuz kullanır, altı reddedilir.
    let saltLen = 0;
    try { saltLen = b64u.dec(String(d.salt || '')).length; } catch {}
    if (!Number.isInteger(d.iter) || d.iter < MIN_ITER || saltLen < 16) {
      return this.fail('Güvenlik uyarısı: uzak bilgisayar zayıf parola ayarları istedi. Bağlantı iptal edildi.', false, true);
    }
    this.challenge = d;
    this.peerName = d.name || this.peerName;
    if (!this.key || this.keySalt !== d.salt) {
      let pw = this.o.password;
      if (!pw) {
        pw = await this.o.askPassword?.(this);
        if (!pw) return this.fail('Parola gerekli', false, true);
      }
      this.setState('auth', 'Anahtar türetiliyor…');
      this.key = await deriveKey(pw, d.salt, d.iter);
      this.keySalt = d.salt;
      this.o.password = null;
    }
    // Tarayıcının WebRTC'si H.264 çözemiyorsa (bazı Chromium derlemeleri) doğrudan
    // şifreli WebSocket aktarımına geç; görüntüyü WebCodecs çözer.
    if (!codecOrder(false)) {
      if (this.o.noFallback) return this.fail('Bu tarayıcı H.264 görüntüyü çözemiyor. Chrome, Edge veya Safari kullanın.', false, true);
      return this.startWS();
    }
    await this.createPeer();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription({ type: 'offer', sdp: stereoOpus(offer.sdp) });
    const nc = b64u.enc(crypto.getRandomValues(new Uint8Array(18)));
    this.nc = nc;
    const sdp = this.pc.localDescription.sdp;
    this.offerSDP = sdp;
    const proof = await hmac(this.key, 'kopru-c1', d.na, nc, fingerprints(sdp));
    this.sendE2E({ k: 'offer', sdp, nc, proof });
    this.setState('auth', 'Uzak bilgisayar yanıtı bekleniyor…');
  }

  async onAnswer(d) {
    const want = await hmac(this.key, 'kopru-a1', this.challenge.na, this.nc, fingerprints(this.offerSDP), fingerprints(d.sdp));
    if (!timingSafeEq(want, d.proof || '')) {
      // Sunucu araya girmeye çalışıyor olabilir: asla bağlanma.
      return this.fail('Güvenlik uyarısı: uzak bilgisayarın kimliği doğrulanamadı. Bağlantı iptal edildi.', false, true);
    }
    this.emit('authed', { key: this.key, salt: this.keySalt, name: this.peerName });
    // Durumu yanıtı uygulamadan ÖNCE "kuruluyor" yap: hızlı ağlarda (aynı ağ, aynı
    // makine) bağlantı aşağıdaki beklemeler sırasında kurulabilir; sonradan
    // "kuruluyor"a dönmek, görüntü akarken perdeyi açık bırakıyordu.
    this.setState('connecting', 'Bağlantı kuruluyor…');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    for (const c of this.pendingCands) await this.pc.addIceCandidate(c).catch(() => {});
    this.pendingCands = [];
    if (this.pc?.connectionState === 'connected' && this.state !== 'connected') this.onPCState();
    // Doğrudan bağlantı (P2P) kurulamazsa şifreli tünel aktarımına geç.
    clearTimeout(this.wsTimer);
    if (!this.o.noFallback) this.wsTimer = setTimeout(() => { if (this.pc?.connectionState !== 'connected') this.startWS(); }, this.o.forceWS ? 0 : 6000);
  }

  async createPeer() {
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: 'max-bundle', iceTransportPolicy: this.o.forceRelay ? 'relay' : 'all' });
    this.pc = pc;
    const tr = pc.addTransceiver('video', { direction: 'recvonly' });
    if (this.o.audio !== false) pc.addTransceiver('audio', { direction: 'recvonly' });
    const order = codecOrder(this.o.prefer444);
    this.firstProfile = order ? profileOf(order[0].sdpFmtpLine) : '';
    if (order && tr.setCodecPreferences) {
      try { tr.setCodecPreferences(order); } catch (e) { console.warn('codec tercihi', e); }
    }
    this.dc.ctl = pc.createDataChannel('ctl', { ordered: true });
    this.dc.in = pc.createDataChannel('in', { ordered: true });
    this.dc.mv = pc.createDataChannel('mv', { ordered: false, maxRetransmits: 0 });
    this.dc.fs = pc.createDataChannel('fs', { ordered: true });
    for (const k of ['in', 'mv', 'fs']) this.dc[k].binaryType = 'arraybuffer';
    if (this.o.dcVideo) {
      // Görüntü veri kanalından: [u8 anahtar][Annex-B]; her kare u32 sayaçla onaylanır
      // (bilgisayar yol doluysa kare kodlamaz). Çizim WebCodecs ile (main.js useCanvas).
      // Üç sıralı şerit ("vid", "kv2", "kv3"): bir şeritte kaybolan paketin yeniden
      // iletimi takılırsa (bilgisayarın SCTP'si bunu ancak ~1 sn sonra onarır)
      // bilgisayar boş bir şeritten anahtar kareyle devam eder. O zaman parçaların
      // başında u32 kare sırası olur (bayrak bit2), onay "bu sıraya kadar" demektir
      // ve eski şeritten geç gelen kareler atılır. Eski bilgisayar "kv" kanallarını
      // tanımaz; eski biçim sürer.
      const prof = this.o.wsProfile || 'high';
      const v = this.dc.vid = pc.createDataChannel('vid:' + prof, { ordered: true });
      const lanes = [v, ...['kv2:', 'kv3:'].map((l) => pc.createDataChannel(l + prof, { ordered: true }))];
      const ack = frameAcker((b) => { for (const c of lanes) if (c.readyState === 'open') { c.send(b); return true; } return false; });
      let want = 0; // sıradaki beklenen kare (sıra + 1 = onay değeri)
      this.dcLate = 0;
      v.onopen = () => this.emit('dcvideo');
      const frame = (data, flags, seq) => {
        if (seq === undefined) { want = (want + 1) >>> 0; return this.emitFrame(data, ack); }
        if (seq < want) { this.dcLate++; return; } // eski şeritten geç gelen kare
        if (seq !== want && !(flags & 1)) { this.dcLate++; this.sendCtl({ t: 'kf' }); return; } // arada kare yok
        want = (seq + 1) >>> 0;
        this.emit('wsvideo', { data, seq: want, ack: ack.ack });
      };
      for (const c of lanes) {
        c.binaryType = 'arraybuffer';
        // Kare parçalar halinde gelir: [u8 bayrak (bit0 anahtar, bit1 devamı var, bit2 sıra)][u32 sıra?][veri].
        // Tek parçalı kare (çoğu kare) kopyalanmadan iletilir; parçalı kare tek, yeniden
        // kullanılan bir tamponda birleşir: her karede yeni bellek ayrılmaz (çöp
        // toplayıcı duraklaması yok). Çözücü veriyi push sırasında zaten kopyalar.
        let buf = new Uint8Array(256 << 10), size = 0;
        c.onmessage = (e) => {
          const b = new Uint8Array(e.data);
          if (!b.length) return;
          const fl = b[0], h = fl & 4 ? 5 : 1;
          const seq = h === 5 ? new DataView(e.data).getUint32(1) : undefined;
          if (!size && !(fl & 2)) { const f = b.subarray(h - 1); f[0] = fl & 1; return frame(f, fl, seq); }
          if (!size) { buf[0] = fl & 1; size = 1; }
          if (size + b.length - h > buf.length) {
            const nb = new Uint8Array(Math.max(buf.length * 2, size + b.length));
            nb.set(buf.subarray(0, size)); buf = nb;
          }
          buf.set(b.subarray(h), size); size += b.length - h;
          if (fl & 2) return;
          const n = size; size = 0;
          frame(buf.subarray(0, n), fl, seq);
        };
      }
    }
    if (this.o.dcAudio) {
      // Ses veri kanalından: 10 ms'lik Opus paketleri, sırasız ve yeniden gönderimsiz
      // (geç kalan sesin anlamı yok). Tamponu tarayıcı değil audio.js yönetir.
      // "sira16": yeni ajan her paketin başına 2 baytlık sıra numarası koyar
      // (hello'da caps.audseq); eskisi bunu yok sayıp düz Opus yollar.
      const a = this.dc.aud = pc.createDataChannel('aud', { ordered: false, maxRetransmits: 0, protocol: 'sira16' });
      a.binaryType = 'arraybuffer';
      a.onmessage = (e) => this.emit('dcaudio', new Uint8Array(e.data));
    }
    this.dc.ctl.onopen = () => {
      this.emit('ctlopen');
      // Güvenlik ağı: kontrol kanalı açıldıysa bağlantı kurulmuştur.
      if (this.state !== 'connected' && this.pc?.connectionState === 'connected') this.onPCState();
    };
    this.dc.ctl.onmessage = (e) => this.onCtl(e.data);
    this.dc.mv.onmessage = (e) => this.emit('mv', e.data);
    this.dc.fs.onmessage = (e) => this.emit('fs', e.data);
    pc.onicecandidate = (e) => { if (e.candidate) this.sendE2E({ k: 'cand', cand: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const r = e.receiver;
      // Oynatma gecikmesini en aza indir.
      try { if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0; } catch {}
      try { if ('playoutDelayHint' in r) r.playoutDelayHint = 0; } catch {}
      this.emit(e.track.kind === 'audio' ? 'audiotrack' : 'track', e.streams[0] || new MediaStream([e.track]));
    };
    pc.onconnectionstatechange = () => this.onPCState();
    this.chunks = new Map();
  }

  // emitFrame bir görüntü karesini çizene (main.js → WsVideo.push) verir. Onay,
  // kare işlenince (çözülünce ya da atlanınca) detail.ack(detail.seq) ile gider;
  // kareyi alan yoksa hemen onaylanmalıdır (bilgisayar onaysız kareyi yolda sanar).
  emitFrame(data, ack) {
    this.emit('wsvideo', { data, seq: ack.next(), ack: ack.ack });
  }

  onPCState() {
    if (this.wsMode) return;
    const s = this.pc.connectionState;
    if (s === 'failed' && !this.everConnected && !this.o.noFallback) return this.startWS();
    if (s === 'connected') {
      this.everConnected = true;
      clearTimeout(this.wsTimer);
      clearTimeout(this.restartTimer); clearTimeout(this.fullTimer);
      this.restartTimer = this.fullTimer = null;
      this.reconnects = 0;
      this.setState('connected', '');
      this.startGuard();
    } else if (s === 'disconnected') {
      this.setState('reconnecting', 'Bağlantı zayıfladı, kurtarılıyor…');
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => this.iceRestart(), 1500);
      this.armFull();
    } else if (s === 'failed') {
      this.setState('reconnecting', 'Bağlantı koptu, yeniden kuruluyor…');
      this.iceRestart();
      this.armFull();
    }
  }

  armFull() {
    if (this.fullTimer) return;
    this.fullTimer = setTimeout(() => { this.fullTimer = null; if (this.pc?.connectionState !== 'connected') this.reconnectFull(); }, 15000);
  }

  async iceRestart() {
    if (!this.pc || this.closed || this.pc.connectionState === 'connected') return;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription({ type: 'offer', sdp: stereoOpus(offer.sdp) });
      this.sendE2E({ k: 'reoffer', sdp: this.pc.localDescription.sdp });
    } catch (e) { console.warn('ICE yeniden başlatma', e); }
  }

  // Ağ değişince (online olayı, sekme geri gelince) tetiklenir.
  // nudge: sayfa öne gelince (iPhone'da uygulamaya geri dönüş) bağlantıyı yokla.
  // Ajan saniyede bir istatistik yollar; 4-5 sn ses yoksa bağlantı ölüdür.
  nudge() {
    if (this.closed) return;
    const silent = Date.now() - (this.lastMsg || 0) > 5000;
    if (this.wsMode) {
      const t = this.wst;
      if (!t) { if (this.wsKey) this.openMedia(); return; }
      if (silent) t.abandon();
      return;
    }
    if (this.pc && (this.pc.connectionState !== 'connected' || (silent && this.state === 'connected'))) this.iceRestart();
  }

  reconnectFull() {
    if (this.closed) return;
    this.reconnects++;
    if (this.reconnects > 30) return this.fail('Bağlantı kurulamadı', false, true);
    this.teardownPeer();
    if (this.sid) this.sig.send({ t: 'bye', sid: this.sid });
    this.sid = null; this.rk = null;
    this.setState('reconnecting', 'Yeniden bağlanılıyor…');
    const wait = Math.min(1000 * this.reconnects, 5000);
    setTimeout(() => { if (!this.closed) this.sig.send({ t: 'connect', id: this.id }); }, wait);
  }

  teardownPeer() {
    this.stopGuard();
    clearTimeout(this.restartTimer); clearTimeout(this.fullTimer); clearTimeout(this.wsTimer);
    this.restartTimer = this.fullTimer = null;
    this.wsMode = false; this.everConnected = false; this.wsKey = null;
    if (this.wst) { this.wst.close(); this.wst = null; }
    if (this.pc) { try { this.pc.close(); } catch {} }
    this.pc = null; this.dc = {};
    this.pendingCands = [];
    this.emit('teardown');
  }

  fail(msg, retryable, final) {
    if (this.closed) return;
    if (!final && retryable && this.state !== 'idle' && this.reconnects > 0) {
      // Yeniden bağlanırken çevrimdışı görünüyorsa beklemeye devam et.
      this.setState('reconnecting', msg + ' — bekleniyor…');
      setTimeout(() => this.reconnectFull(), 3000);
      return;
    }
    this.close(msg);
  }

  close(msg) {
    if (this.closed) return;
    this.closed = true;
    this.stopGuard();
    try { this.sendCtl({ t: 'bye' }); } catch {}
    if (this.sid) this.sig.send({ t: 'bye', sid: this.sid });
    this.teardownPeer();
    this.sig.removeEventListener('msg', this._onMsg);
    this.sig.removeEventListener('open', this._onOpen);
    this.setState('closed', msg || '');
  }

  // ---- görüntü bekçisi ----
  // Görüntü paketleri geldiği hâlde cihaz kareleri çözemiyorsa (siyah ekran):
  //  1) 2 sn boyunca en az 5 tam kare gelip hiçbiri çözülmezse yeni anahtar kare ister;
  //  2) 3 sn daha düzelmezse bu profili bu cihaz için "çözülemiyor" diye işaretler ve
  //     bir sonraki uyumlu profille (High → Main → Baseline, en son tünel) yeniden bağlanır.
  // Ekran durgunken kare gelmez; bu bekçiyi tetiklemez (yalnızca gelen ama çözülemeyen kare sayılır).
  startGuard() {
    this.stopGuard();
    this.guardTimer = setInterval(() => this.checkVideo(), 1000);
  }

  stopGuard() { clearInterval(this.guardTimer); this.guardTimer = null; this.guard = null; }

  async checkVideo() {
    const pc = this.pc;
    if (this.closed || this.wsMode || this.o.dcVideo || !pc || this.state !== 'connected') return;
    const rx = pc.getReceivers().find((r) => r.track && r.track.kind === 'video');
    if (!rx) return;
    let st;
    try { st = await rx.getStats(); } catch { return; }
    if (pc !== this.pc || !this.guardTimer) return;
    let inb = null;
    st.forEach((r) => { if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'video') inb = r; });
    if (!inb) return;
    const now = Date.now(), dec = inb.framesDecoded || 0, recv = inb.framesReceived, bytes = inb.bytesReceived || 0;
    const g = this.guard;
    // İlerleme varsa (ya da sayfa arka plandaysa) ölçüyü baştan al.
    if (!g || document.hidden || dec > g.dec) { this.guard = { dec, recv, bytes, t: now, stage: 0 }; return; }
    // Safari bazı sürümlerde framesReceived vermez: o zaman gelen bayta bak. Eşik,
    // yavaş bir hatta yolda olan tek bir büyük anahtar karenin bile aşamayacağı kadar yüksek.
    const stuck = (r0, b0, n) => (recv != null && r0 != null ? recv - r0 >= n : bytes - b0 >= 1000000);
    if (g.stage === 0) {
      if (now - g.t < 2000 || !stuck(g.recv, g.bytes, 5)) return;
      g.stage = 1; g.t1 = now; g.recv1 = recv; g.bytes1 = bytes;
      this.guardStats.kf++;
      this.sendCtl({ t: 'kf' });
      return;
    }
    if (g.stage === 1 && now - g.t1 >= 3000 && stuck(g.recv1, g.bytes1, 4)) {
      g.stage = 2;
      const c = inb.codecId && st.get(inb.codecId);
      this.undecodable('rtc', profileOf(c && c.sdpFmtpLine) || this.firstProfile);
    }
  }

  // undecodable: bu cihaz bu profili çözemiyor; işaretle ve uyumlu biçimle yeniden bağlan.
  undecodable(kind, prof) {
    if (this.closed) return;
    this.guardStats.down++;
    markBadProfile(kind, prof);
    if (this.guardStats.down > 4) return this.fail('Bu cihaz uzak bilgisayarın görüntüsünü çözemiyor.', false, true);
    const msg = 'Görüntü bu cihazda çözülemedi; uyumlu biçimle yeniden bağlanılıyor…';
    this.emit('notice', { text: msg, level: 'warn', kind, prof });
    this.reconnectFull();
    this.setState('reconnecting', msg);
  }

  // ---- kontrol kanalı ----
  sendCtl(obj) {
    const dc = this.dc.ctl;
    if (!dc || dc.readyState !== 'open') return false;
    const s = JSON.stringify(obj);
    const part = 24 * 1024;
    if (s.length <= part * 2) { dc.send(s); return true; }
    const id = Math.random().toString(36).slice(2);
    for (let i = 0; i < s.length; i += part) {
      dc.send(JSON.stringify({ t: 'chunk', id, d: s.slice(i, i + part), last: i + part >= s.length }));
    }
    return true;
  }

  onCtl(data) {
    this.lastMsg = Date.now();
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'chunk') {
      const arr = this.chunks.get(m.id) || [];
      arr.push(m.d);
      if (!m.last) { this.chunks.set(m.id, arr); return; }
      this.chunks.delete(m.id);
      return this.onCtl(arr.join(''));
    }
    this.emit('ctl', m);
  }

  // ---- şifreli WebSocket aktarımı (yedek yol) ----
  async startWS() {
    if (this.wsMode || this.closed || !this.challenge) return;
    this.wsMode = true;
    clearTimeout(this.wsTimer);
    // Eski WebRTC denemesini şimdi kapatma: ajan geçiş isteğini almadan kapanırsa
    // bunu "istemci ayrıldı" sanar. Ajan onaylayınca (wsok) kapatılır.
    if (this.pc) this.pc.onconnectionstatechange = null;
    this.dc = {};
    this.setState('connecting', 'Doğrudan bağlantı kurulamadı, güvenli tünelden bağlanılıyor…');
    const nc = b64u.enc(crypto.getRandomValues(new Uint8Array(18)));
    this.wsNC = nc;
    const proof = await hmac(this.key, 'kopru-w1', this.challenge.na, nc);
    this.sendE2E({ k: 'wsauth', nc, proof, profile: this.o.wsProfile || 'high' });
  }

  async onWSOk(d) {
    const want = await hmac(this.key, 'kopru-w2', this.challenge.na, this.wsNC);
    if (!timingSafeEq(want, d.proof || '')) return this.fail('Güvenlik uyarısı: uzak bilgisayar doğrulanamadı.', false, true);
    this.emit('authed', { key: this.key, salt: this.keySalt, name: this.peerName });
    if (this.pc) { const pc = this.pc; this.pc = null; try { pc.close(); } catch {} }
    this.wsKey = b64u.dec(await hmac(this.key, 'kopru-wk', this.challenge.na, this.wsNC));
    this.wsTries = 0;
    this.openMedia();
  }

  async openMedia() {
    if (this.closed || !this.wsKey) return;
    const cn = b64u.enc(crypto.getRandomValues(new Uint8Array(12)));
    const key = await hmacRaw(this.wsKey, 'kopru-wc|' + cn);
    const url = wsBase(this.sig.url.replace(/^ws/, 'http')) + `/ws/media?sid=${encodeURIComponent(this.sid)}&rk=${encodeURIComponent(this.rk)}&cn=${cn}`;
    const t = new WsTransport(url, key);
    this.wst = t;
    // Kare onayı: ajan, yoldaki birikmeyi onayların gecikmesinden anlar (tünel
    // arabellekleri dolunca yeni kare göndermeyi bekletir → düşük gecikme).
    const ack = frameAcker((b) => t.send(6, b));
    t.onopen = () => {
      this.wsTries = 0;
      this.dc = t.channels();
      this.emit('wsmode');
      this.setState('connected', '');
      this.emit('ctlopen');
    };
    t.onmessage = (ch, data) => {
      if (ch === 0) this.onCtl(new TextDecoder().decode(data));
      else if (ch === 2) this.emit('mv', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      else if (ch === 3) this.emit('fs', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      else if (ch === 4) this.emitFrame(data, ack);
      else if (ch === 5) this.emit('wsaudio', data);
    };
    t.onclose = () => {
      if (this.wst !== t || this.closed) return;
      this.wst = null;
      this.dc = {};
      this.wsTries = (this.wsTries || 0) + 1;
      if (this.wsTries > 8) return this.reconnectFull();
      this.setState('reconnecting', 'Bağlantı koptu, yeniden bağlanılıyor…');
      setTimeout(() => this.openMedia(), Math.min(500 * this.wsTries, 3000));
    };
  }

  nudgeWS() { if (this.wsMode && !this.wst && this.wsKey) this.openMedia(); }

  // viewOnly: "yalnızca izle" — hiçbir fare/klavye/dokunuş gönderilmez.
  sendIn(buf) { if (this.viewOnly) return; const dc = this.dc.in; if (dc && dc.readyState === 'open') dc.send(buf); }
  sendMv(buf) {
    if (this.viewOnly) return;
    const dc = this.dc.mv;
    // Kuyrukta bekleyen eski hareket varsa yenisini gönderme: en güncel konum önemli.
    if (dc && dc.readyState === 'open' && dc.bufferedAmount < 2048) dc.send(buf);
  }
}

// frameAcker görüntü karesi onayları (veri kanalı ve tünel yolu): u32 büyük
// endian, "şu sıra numarasına kadar işlenen kare sayısı". Sıra numarası her
// gelen karede bir artar (next); ack(seq) yalnızca ileri giden onayı gönderir.
// Onay kare alınınca değil, çözücüden çıkınca verilir: bilgisayarın teslim
// denetimi böylece yalnız ağı değil telefonun çözücüsünü de görür; çözücü
// yetişemezse bilgisayar yeni kare kodlamaz, gecikme telefonda birikmez.
function frameAcker(send) {
  let recv = 0, done = 0;
  const b = new Uint8Array(4), dv = new DataView(b.buffer);
  return {
    next: () => (recv = (recv + 1) >>> 0),
    ack: (seq) => {
      if (((seq - done) | 0) <= 0) return;
      done = seq; dv.setUint32(0, seq); send(b);
    },
  };
}

// WsTransport: [12 bayt nonce][AES-GCM] çerçeveleri; sıra korunur.
class WsTransport {
  constructor(url, keyBytes) {
    this.ctr = 0n; this.rctr = 0n; this.pend = 0;
    this.keyP = crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    this.sendChain = Promise.resolve(); this.recvChain = Promise.resolve();
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => this.onopen?.();
    ws.onclose = () => { this.closed = true; const f = this.onclose; this.onclose = null; f?.(); };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      const b = new Uint8Array(e.data);
      this.recvChain = this.recvChain.then(async () => {
        if (this.closed || b.length < 28) return;
        if (b[0] !== 65 || b[1] !== 50 || b[2] !== 67 || b[3] !== 0) return this.close(); // "A2C\0"
        const n = new DataView(b.buffer, b.byteOffset + 4, 8).getBigUint64(0);
        if (n <= this.rctr) return this.close();
        this.rctr = n;
        let pt;
        try { pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, await this.keyP, b.subarray(12))); }
        catch { return this.close(); }
        if (pt.length) this.onmessage?.(pt[0], pt.subarray(1));
      });
    };
  }
  get open() { return this.ws.readyState === 1 && !this.closed; }
  get buffered() { return this.ws.bufferedAmount + this.pend; }
  send(ch, data) {
    if (!this.open) return false;
    const body = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const pt = new Uint8Array(body.length + 1);
    pt[0] = ch; pt.set(body, 1);
    this.pend += pt.length;
    this.sendChain = this.sendChain.then(async () => {
      this.ctr += 1n;
      const iv = new Uint8Array(12);
      iv.set([67, 50, 65, 0]); // "C2A\0"
      new DataView(iv.buffer).setBigUint64(4, this.ctr);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.keyP, pt));
      this.pend -= pt.length;
      if (!this.open) return;
      const msg = new Uint8Array(12 + ct.length);
      msg.set(iv); msg.set(ct, 12);
      this.ws.send(msg);
    });
    return true;
  }
  close() { this.closed = true; try { this.ws.close(); } catch {} }
  // abandon: ölü (yanıt vermeyen) bağlantıyı kapanmasını beklemeden bırak ve
  // hemen yeniden bağlanmayı başlat.
  abandon() { this.close(); const f = this.onclose; this.onclose = null; f?.(); }
  // WebRTC veri kanallarının yerine geçen sanal kanallar.
  channels() {
    const t = this;
    const mk = (ch, buffered = () => t.buffered) => {
      const c = new EventTarget();
      Object.defineProperty(c, 'readyState', { get: () => (t.open ? 'open' : 'closed') });
      Object.defineProperty(c, 'bufferedAmount', { get: buffered });
      c.bufferedAmountLowThreshold = 0;
      c.send = (d) => t.send(ch, d);
      return c;
    };
    const fs = mk(3);
    const tick = setInterval(() => {
      if (t.closed) return clearInterval(tick);
      if (t.buffered <= (fs.bufferedAmountLowThreshold || 0)) fs.dispatchEvent(new Event('bufferedamountlow'));
    }, 50);
    const mv = mk(2, () => 0); // hareketler kuyruğa girer, bırakılmaz
    return { ctl: mk(0), in: mk(1), mv, fs };
  }
}
