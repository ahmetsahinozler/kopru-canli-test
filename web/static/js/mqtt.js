// Herkese açık MQTT aracılarından bilgisayar ilanlarını okuyan küçük istemci.
// (Yalnızca bağlanma, abone olma ve mesaj alma — yayımlama ajanda yapılır.)
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const te = new TextEncoder(), td = new TextDecoder();
const str = (s) => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
function packet(type, body) {
  const out = [type];
  let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 0x80; out.push(d); } while (n > 0);
  return new Uint8Array([...out, ...body]);
}

class BrokerConn {
  constructor(url, hub) { this.url = url; this.hub = hub; this.ws = null; this.buf = new Uint8Array(0); this.ready = false; this.backoff = 2000; this.pid = 1; this.open(); }
  open() {
    let ws;
    try { ws = new WebSocket(this.url, ['mqtt']); } catch { return this.retry(); }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const cid = 'kopru-c-' + Math.random().toString(36).slice(2, 12);
      ws.send(packet(0x10, [...str('MQTT'), 4, 0x02, 0, 60, ...str(cid)]));
    };
    ws.onmessage = (e) => this.onData(new Uint8Array(e.data));
    ws.onclose = () => { this.ready = false; clearInterval(this.ping); if (this.ws === ws) this.retry(); };
    ws.onerror = () => {};
  }
  retry() { setTimeout(() => this.open(), this.backoff); this.backoff = Math.min(this.backoff * 2, 60000); }
  onData(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length);
    b.set(this.buf); b.set(chunk, this.buf.length);
    let i = 0;
    while (i + 2 <= b.length) {
      let len = 0, mul = 1, j = i + 1, ok = false;
      while (j < b.length) { const d = b[j++]; len += (d & 127) * mul; mul *= 128; if (!(d & 128)) { ok = true; break; } }
      if (!ok || j + len > b.length) break;
      this.onPacket(b[i], b.subarray(j, j + len));
      i = j + len;
    }
    this.buf = b.slice(i);
  }
  onPacket(h, body) {
    const t = h >> 4;
    if (t === 2) { // CONNACK
      if (body[1] !== 0) return;
      this.ready = true; this.backoff = 2000;
      this.ping = setInterval(() => { try { this.ws.send(new Uint8Array([0xC0, 0])); } catch {} }, 30000);
      for (const topic of this.hub.topics) this.subscribe(topic);
    } else if (t === 3) { // PUBLISH
      const tl = (body[0] << 8) | body[1];
      const topic = td.decode(body.subarray(2, 2 + tl));
      let off = 2 + tl;
      if ((h >> 1) & 3) off += 2;
      this.hub.onMessage(topic, td.decode(body.subarray(off)), this.url);
    }
  }
  subscribe(topic) {
    if (!this.ready) return;
    const id = this.pid++ & 0xffff || 1;
    this.ws.send(packet(0x82, [id >> 8, id & 255, ...str(topic), 0]));
  }
}

// PresenceHub birden çok aracıya bağlanır ve cihaz ilanlarını toplar.
export class PresenceHub extends EventTarget {
  constructor(brokers = BROKERS) {
    super();
    this.topics = new Set();
    this.latest = new Map(); // id → {p, at, broker}
    this.byBroker = new Map(); // id → Map(broker → p)
    this.conns = brokers.map((u) => new BrokerConn(u, this));
  }
  watch(id) {
    const topic = 'kopru1/' + id;
    if (this.topics.has(topic)) return;
    this.topics.add(topic);
    for (const c of this.conns) c.subscribe(topic);
  }
  onMessage(topic, text, broker) {
    const id = topic.split('/')[1];
    if (text && /"off":true/.test(text)) text = ''; // ajanın vasiyeti: bağlantı koptu
    if (!text) { // ilan silindi = çevrimdışı
      this.byBroker.get(id)?.delete(broker);
      const cur = this.latest.get(id);
      if (cur && cur.broker === broker) { this.latest.delete(id); this.dispatchEvent(new CustomEvent('change', { detail: id })); }
      return;
    }
    let p;
    try { p = JSON.parse(text); } catch { return; }
    if (p && p.id === id) { if (!this.byBroker.has(id)) this.byBroker.set(id, new Map()); this.byBroker.get(id).set(broker, p); }
    if (!p || p.id !== id || typeof p.u !== 'string' || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(p.u) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(p.u)) return;
    const cur = this.latest.get(id);
    if (!cur || (p.t || 0) >= (cur.p.t || 0)) {
      this.latest.set(id, { p, at: Date.now(), broker });
      this.dispatchEvent(new CustomEvent('change', { detail: id }));
    }
  }
  // find bir cihazın ilanını bekler (en çok ms).
  find(id, ms = 6000) {
    this.watch(id);
    const now = this.latest.get(id);
    if (now) return Promise.resolve(now.p);
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.removeEventListener('change', on); resolve(null); }, ms);
      const on = (e) => { if (e.detail === id && this.latest.get(id)) { clearTimeout(t); this.removeEventListener('change', on); resolve(this.latest.get(id).p); } };
      this.addEventListener('change', on);
    });
  }
  online(id) { return this.latest.has(id); }
  all(id) { return [...(this.byBroker.get(id)?.values() || [])].sort((a, b) => (b.t || 0) - (a.t || 0)); }
  connected() { return this.conns.some((c) => c.ready); }
}
