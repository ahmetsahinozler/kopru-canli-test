// Köprü servis çalışanı. Uygulama kabuğunu önbelleğe alır: iPhone'da ana ekrana
// eklenen Köprü, ilk kurulduğu bilgisayarın internet adresi sonradan değişse
// bile açılır (bilgisayarlar ilan panosundan bulunur). Ağ varsa güncel sürüm alınır.
//
// Kendini güncelleme: ana ekran uygulaması ilk eklendiği adrese bağlıdır, ama
// Cloudflare tüneli her açılışta yeni adres alır; eski adres ölünce uygulama yeni
// sürümü hiç göremez. Bu yüzden sayfa, parolası doğrulanmış bir bağlantıda
// bilgisayarın güncel adresini bildirir ("kaynak"); kabuk dosyaları oradan
// alınıp bu adresin önbelleğine yazılır. Uygulama bir sonraki açılışta yeni
// sürümle başlar. Dosyaların hepsi alınamazsa hiçbiri yazılmaz (yarım sürüm yok).
const V = 'kopru-v15';
const META = 'kopru-meta';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'js/main.js', 'js/session.js', 'js/input.js', 'js/clip.js', 'js/files.js', 'js/keymap.js', 'js/mqtt.js', 'js/wsvideo.js', 'js/audio.js', 'js/ses-isleyici.js', 'js/profiles.js', 'js/calib.js', 'js/loupe.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== META).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ms)); }

// Asıl adres yanıt vermiyorsa (eski tünel adresi) her istekte 3 sn beklememek için
// bir süre doğrudan önbellekten verilir.
let downUntil = 0;

// guncelle bilgisayarın güncel adresinden (base) kabuğu alır. Dönen değer:
// alınan sürüm ya da hata metni.
async function guncelle(base) {
  base = base.replace(/\/+$/, '') + '/';
  const get = async (f) => {
    const r = await Promise.race([fetch(new URL(f, base).href, { mode: 'cors', cache: 'no-store', credentials: 'omit' }), timeout(10000)]);
    if (!r.ok) throw new Error(f + ': ' + r.status);
    return r;
  };
  const list = await (await get('kabuk.json')).json();
  const files = (list.files || []).filter((f) => typeof f === 'string' && !f.includes('..') && !/^\//.test(f));
  if (!files.includes('index.html') || !files.includes('js/main.js')) throw new Error('eksik kabuk listesi');
  const got = [];
  for (const f of files) {
    const r = await get(f);
    got.push([f, new Response(await r.blob(), { headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream' } })]);
  }
  const cache = await caches.open(V);
  for (const [f, r] of got) {
    if (f === 'index.html') await cache.put('./', r.clone());
    await cache.put(f, r);
  }
  return list.ver || '';
}

self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.t !== 'guncelle' || !/^https?:\/\/[^/]+/.test(m.u || '')) return;
  e.waitUntil((async () => {
    let out;
    try {
      const ver = await guncelle(m.u);
      (await caches.open(META)).put('kaynak', new Response(m.u));
      out = { t: 'guncellendi', ver };
    } catch (err) {
      out = { t: 'guncellenemedi', err: String(err && err.message || err) };
    }
    if (e.source) e.source.postMessage(out);
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || /^\/(ws|api|indir)\//.test(url.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    if (Date.now() >= downUntil) {
      try {
        const res = await Promise.race([fetch(req), timeout(3000)]);
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        if (res.ok) return res;
        // Eski tünel adresi ölüyken Cloudflare kendi hata sayfasını döndürür
        // (530 / 1033, 502…): ağ hatası gibi önbellekteki kabuk verilir; yoksa
        // ana ekran uygulaması Köprü yerine Cloudflare hata sayfası açıyordu.
        const hit = await cache.match(key, { ignoreSearch: true });
        if (!hit) return res;
        if (res.status >= 500) downUntil = Date.now() + 30000;
        return hit;
      } catch {
        downUntil = Date.now() + 30000;
      }
    }
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    // Önbellekte yoksa (ör. yeni sürümün eklediği bir dosya) bilgisayarın güncel adresinden dene.
    try {
      const k = await (await caches.open(META)).match('kaynak');
      if (k) {
        const base = (await k.text()).replace(/\/+$/, '') + '/';
        const r = await Promise.race([fetch(new URL(url.pathname.replace(/^\//, ''), base).href, { mode: 'cors', credentials: 'omit' }), timeout(8000)]);
        if (r.ok) {
          const res = new Response(await r.blob(), { headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream' } });
          cache.put(key, res.clone());
          return res;
        }
      }
    } catch {}
    return new Response('Köprü çevrimdışı', { status: 503 });
  })());
});
