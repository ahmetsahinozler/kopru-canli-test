// iPhone Simülatörü testi için küçük sunucu: istemciyi (web/static kopyası +
// canli-test.js) localhost'tan sunar, ayarları verir, Safari'den gelen sonuçları
// out/iphone-sonuc.jsonl dosyasına yazar. Sayfanın kendisinin yapamadığı işleri
// ("istek") simülatörde yapar: ekran görüntüsü, döndürme ve gerçek dokunuş
// (Simulator menüsü / System Events), Safari'yi arka plana alıp geri getirme.
// SIM_UDID ortam değişkeni simülatörün kimliğidir. Yalnızca 127.0.0.1'i dinler.
const http = require('http'), fs = require('fs'), path = require('path');
const { execFile } = require('child_process');
const SITE = process.argv[2], OUT = process.argv[3], PORT = +(process.env.PORT || 8000);
const UDID = process.env.SIM_UDID || '';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args, ms = 20000) => new Promise((res) => execFile(cmd, args, { timeout: ms }, (e, so, se) => res({ ok: !e, cikti: String(so || '').trim().slice(0, 300), hata: e ? String(se || e.message).trim().slice(0, 400) : '' })));
const osa = (lines) => sh('osascript', lines.flatMap((l) => ['-e', l]), 15000);
const shot = (ad) => sh('xcrun', ['simctl', 'io', UDID, 'screenshot', path.join(OUT, `foto-${String(ad || 'x').replace(/[^\w.-]/g, '')}.png`)]);

async function isle(m) {
  if (!UDID) return { ok: false, hata: 'SIM_UDID yok' };
  switch (m.is) {
    case 'foto':
      return shot(m.ad);
    case 'dondur': {
      // Simulator → Device → Rotate Left/Right; olmazsa ⌘← / ⌘→. Erişilebilirlik izni gerekir.
      const sag = m.yon === 'sag';
      const menu = await osa(['tell application "Simulator" to activate', 'delay 0.5', `tell application "System Events" to tell process "Simulator" to click menu item "${sag ? 'Rotate Right' : 'Rotate Left'}" of menu "Device" of menu bar 1`]);
      if (menu.ok) return { ...menu, yol: 'menü' };
      const tus = await osa(['tell application "Simulator" to activate', 'delay 0.5', `tell application "System Events" to key code ${sag ? 124 : 123} using command down`]);
      return { ...tus, yol: 'kısayol', menuHata: menu.hata };
    }
    case 'dokun':
      // Simülatör penceresinin ortasına gerçek tıklama (iPhone'da gerçek dokunuş:
      // iOS sesi yalnızca kullanıcı hareketinden sonra açar).
      return osa(['tell application "Simulator" to activate', 'delay 0.5',
        'tell application "System Events" to tell process "Simulator"', 'set {px, py} to position of window 1', 'set {pw, ph} to size of window 1', 'end tell',
        'tell application "System Events" to click at {px + (pw div 2), py + (ph div 2)}']);
    case 'arka-plan':
      // Yanıt sayfaya ulaşsın, sonra Ayarlar'ı aç (Safari arka plana düşer), 20 sn sonra geri dön.
      (async () => {
        await sleep(1500);
        console.log('Safari arka plana alınıyor (Ayarlar)…', await sh('xcrun', ['simctl', 'launch', UDID, 'com.apple.Preferences']));
        await sleep(20000);
        await shot('arka-plan');
        console.log('Safari\'ye geri dönülüyor…', await sh('xcrun', ['simctl', 'launch', UDID, 'com.apple.mobilesafari']));
      })();
      return { ok: true };
  }
  return { ok: false, hata: 'bilinmeyen istek' };
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && (u.pathname === '/canli-sonuc' || u.pathname === '/canli-istek')) {
    let b = ''; req.on('data', (d) => (b += d));
    req.on('end', async () => {
      if (u.pathname === '/canli-sonuc') {
        fs.appendFileSync(path.join(OUT, 'iphone-sonuc.jsonl'), b.replace(/\n/g, ' ') + '\n');
        console.log('[safari]', b.slice(0, 400));
        return res.end('ok');
      }
      let m = {}; try { m = JSON.parse(b); } catch {}
      const r = await isle(m).catch((e) => ({ ok: false, hata: String(e) }));
      console.log('[istek]', m.is, m.ad || m.yon || '', JSON.stringify(r).slice(0, 300));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(r));
    });
    return;
  }
  if (u.pathname === '/canli-ayar.json') {
    const p = path.join(OUT, 'ayar.json');
    if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('{}'); }
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    return res.end(fs.readFileSync(p));
  }
  if (u.pathname === '/api/info') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ver: 'canli-test', mode: 'p2p' })); }
  const f = path.join(SITE, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('yok'); }
  res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('iPhone test sunucusu :' + PORT + (UDID ? ' simülatör ' + UDID : '')));
