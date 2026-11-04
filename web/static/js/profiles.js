// Çözülemeyen görüntü profili hafızası.
//
// Bazı cihazlar bir H.264 profilini "destekliyorum" deyip yine de çözemez
// (siyah ekran). Görüntü bekçisi bunu fark edince profili bu cihaz için
// işaretler; sonraki bağlantılarda o profil 30 gün boyunca atlanır ve
// doğrudan çalışan bir sonrakiyle başlanır.
//
// İki ayrı çözücü olduğu için iki ayrı ad alanı var:
//   rtc — tarayıcının WebRTC çözücüsü (doğrudan bağlantı)
//   wc  — WebCodecs çözücüsü (tünel aktarımı)

const KEY = 'kopru.cozulemeyen';
const DAYS = 30;
const mem = {}; // localStorage kullanılamazsa (gizli sekme) bu oturum için

const GROUP = { f400: '444', '640c': 'high', 6400: 'high', '4d00': 'main', '42e0': 'baseline', 4200: 'baseline' };

// profileOf bir fmtp satırındaki profile-level-id'den profil grubunu bulur.
export function profileOf(fmtp) {
  const m = /profile-level-id=([0-9a-f]{4})/i.exec(fmtp || '');
  return m ? GROUP[m[1].toLowerCase()] || '' : '';
}

function load() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  return Object.assign(o, mem);
}

// badProfiles kind ("rtc" | "wc") için atlanacak profillerin kümesi.
export function badProfiles(kind) {
  const now = Date.now(), out = new Set();
  for (const [k, t] of Object.entries(load())) {
    if (k.startsWith(kind + ':') && now - t < DAYS * 864e5) out.add(k.slice(kind.length + 1));
  }
  return out;
}

export function markBadProfile(kind, prof) {
  if (!prof) return;
  const k = kind + ':' + prof;
  mem[k] = Date.now();
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    o[k] = mem[k];
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {}
}
