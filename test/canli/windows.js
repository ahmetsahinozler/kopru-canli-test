// Gerçek Windows üzerinde canlı test (GitHub Actions windows-latest sanal makinesi).
// Aşamalar (her biri ayrı çalıştırılır, durum dosyalarla taşınır):
//   yerel       : kullanıcı oturumunda ajan + yerel sunucu; gerçek Windows API'leriyle
//                 fare/klavye/dokunmatik/pano/dosya/gizlilik/çözünürlük/ses/uyku engeli;
//                 iPhone benzetiminde veri kanalı yolu ve dokunma yardımcıları (1.2.8)
//   kalibrasyon : 1920×1080'de Windows ölçeği %100 ve %150 iken bilinen noktalara
//                 Tablet (dokunmatik enjeksiyonu) ve Doğrudan (fare) dokunuşu; Windows'un
//                 olayı nereye koyduğu, ajanın tanı değerleri, kapalı döngünün fareye
//                 geçişi (kaydıran Windows taklidiyle), "telefona göre büyüt" önerisi
//   gpu         : GPU ile küçültme varsayılan kapalı; KOPRU_GPU=1 ile deneme (çökme yok)
//   kur         : kullanıcının yaptığı gibi çift tıklama (argümansız) kurulum + parola belirleme
//   hizmet      : SYSTEM hizmeti, sunucusuz gerçek yol (Cloudflare tüneli, herkese açık ilan
//                 panosu); bağlantı kopmaları, yeniden başlatma, işçi çökmesi; hizmette %150
//                 kalibrasyonu; iPhone için ekranı 1920×1080'e alır, ses tonu çalar
//   sifrele     : hizmet parolasını iPhone işinin açık anahtarıyla şifreler
//   bekle       : iPhone Simülatörü işinin bitmesini bekler, hedefe gelen olayları
//                 çözümler (gerçek Safari'den gelen dokunuşların Windows'taki yeri)
//   son         : güncelleme, Ctrl+Alt+Del, kilit ekranında parola yazıp açma, bağlantı
//                 bitince kilitleme, kaba kuvvet kilidi, kaldırma
// Hedef "program": 9222 hata ayıklama kapılı, tam ekran Chromium penceresi (hedef.html).
// İstemci: Microsoft Edge (Windows kullanıcılarının gerçek tarayıcısı).
// Yerelde (Linux) yalnızca kod yolunu denemek için: HEDEF_CDP, KOPRU_YEREL_PORT,
// KOPRU_TARAYICI_KANAL (ör. "chromium") ile kapılar ve tarayıcı değiştirilebilir.
const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const PHASE = process.argv[2] || 'yerel';
const BIN = path.resolve(process.env.KOPRU_BIN || 'kopru.exe');
const BIN_NEW = process.env.KOPRU_BIN_YENI ? path.resolve(process.env.KOPRU_BIN_YENI) : '';
const OUT = path.resolve(process.env.OUT || 'out');
const WORK = path.resolve(process.env.WORK || 'work');
const PD = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Kopru');
const HEDEF_CDP = process.env.HEDEF_CDP || 'http://127.0.0.1:9222';
const YEREL_PORT = +(process.env.KOPRU_YEREL_PORT || 8080);
const KANAL = process.env.KOPRU_TARAYICI_KANAL || 'msedge';
// Kalibrasyon payı (fiziksel piksel): ajanın kapalı döngü payıyla aynı, max(12, yükseklik/150).
const KAL_TOL = 12;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
// Hizmet parolası bu makinede rastgele üretilir ve hiçbir yere düz yazılmaz; iPhone
// işine yalnızca onun açık anahtarıyla şifrelenmiş olarak gider.
const PWFILE = path.join(WORK, 'hizmet-parola.txt');
if (!fs.existsSync(PWFILE)) fs.writeFileSync(PWFILE, crypto.randomBytes(12).toString('hex'));
const PW = fs.readFileSync(PWFILE, 'utf8').trim();

const results = [];
const fmt = (i) => (typeof i === 'string' ? i : JSON.stringify(i));
const ok = (name, pass, info = '') => { results.push({ phase: PHASE, name, pass: !!pass, info: fmt(info) }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + fmt(info) : ''}`); saveResults(true); };
const note = (name, info) => { results.push({ phase: PHASE, name, note: true, info: fmt(info) }); console.log(`INFO  ${name}  — ${fmt(info)}`); };
// Her senaryo kendi içinde hata yakalar: biri patlarsa diğerleri yine denenir.
async function step(name, fn) { try { await fn(); } catch (e) { ok(name, false, 'hata: ' + (e && e.message || e)); } }
// Playwright'ın arka planda fırlattığı hatalar (ör. hedef pencere yeniden boyutlanınca) testi durdurmasın.
process.on('unhandledRejection', (e) => console.log('  [yakalanmamış]', e && e.message || e));
process.on('uncaughtException', (e) => console.log('  [yakalanmamış]', e && e.message || e));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, every = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(every); }
  return null;
}
const procs = [];
// Başlatılan Köprü süreçlerinin hata çıktısı dosyaya (yerel bir bileşen çökerse
// Go'nun istisna iletisi ve iş parçacığı dökümü yalnızca buraya yazılır).
let runN = 0;
function run(args, env = {}, bin = BIN) {
  const errPath = path.join(WORK, `surec-${PHASE}-${++runN}-hata.log`);
  let fd = 'ignore';
  try { fs.mkdirSync(WORK, { recursive: true }); fd = fs.openSync(errPath, 'a'); } catch {}
  const p = spawn(bin, args, { env: { ...process.env, GOTRACEBACK: 'all', ...env }, stdio: ['ignore', fd, fd], windowsHide: true });
  p.on('error', (e) => console.log('  [süreç]', e.message));
  p.on('exit', (code) => { if (code && !p.killed) console.log(`  [süreç ${args.join(' ') || '(çift tık)'} çıktı: kod ${code}]`); });
  procs.push(p);
  return p;
}
function ps(cmd, timeout = 60000) {
  const full = "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;" + cmd;
  try { return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(full, 'utf16le').toString('base64')], { encoding: 'utf8', timeout }).trim(); }
  catch (e) { return 'HATA: ' + ((e.stdout || '') + (e.stderr || e.message)).slice(0, 600); }
}
const user32 = `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern System.IntPtr FindWindow(string c, string t); [DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h); [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(System.IntPtr h, out uint a);';`;
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function saveResults(quiet) {
  fs.writeFileSync(path.join(OUT, `sonuc-${PHASE}.json`), JSON.stringify(results, null, 2));
  if (quiet) return;
  const f = results.filter((r) => !r.note && !r.pass).length, n = results.filter((r) => !r.note).length;
  console.log(`\n[${PHASE}] ${n - f}/${n} test geçti`);
}
// Köprü'nün açtığı ayar sayfası penceresini kapat (testin kendi Playwright tarayıcılarına dokunma).
const strayBrowsers = () => parseInt(ps("@(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' OR Name='chrome.exe'\" | Where-Object { $_.CommandLine -notmatch 'remote-debugging|ms-playwright|--type=' }).Count"), 10) || 0;
function closeStrayBrowsers() { ps("Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' OR Name='chrome.exe'\" | Where-Object { $_.CommandLine -notmatch 'remote-debugging|ms-playwright' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"); }
function desktopShot(name) {
  ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object Drawing.Bitmap $b.Width,$b.Height; $g=[Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('${path.join(OUT, name)}')`);
}
// Köprü günlüğü (yerel aşamaların KOPRU_HOME'u ya da hizmetin ProgramData klasörü).
const logOf = (dir) => { try { return fs.readFileSync(path.join(dir, 'kopru.log'), 'utf8'); } catch { return ''; } };
const logLines = (txt, re) => txt.split(/\r?\n/).filter((l) => re.test(l));

// ---- ekran çözünürlüğü (Köprü'den bağımsız; iPhone aşaması için) ----
// Köprü'nün kendi "mode" isteği bağlantı bitince geri alınır; iPhone işi Windows'u
// 1920×1080'de (yazı ölçeği seçenekleri olan bir çözünürlükte) görsün diye ekran
// Windows API'siyle ayarlanır, bekle aşamasında geri alınır.
const ekranTip = `if (-not ('KopruEkran' -as [type])) { Add-Type @"
using System; using System.Runtime.InteropServices;
public class KopruEkran {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DM {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Name;
    public short SpecVersion, DriverVersion, Size, DriverExtra; public int Fields;
    public int PosX, PosY, Orientation, FixedOutput;
    public short Color, Duplex, YResolution, TTOption, Collate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string FormName;
    public short LogPixels; public int BitsPerPel, PelsWidth, PelsHeight, DisplayFlags, DisplayFrequency;
    public int ICMMethod, ICMIntent, MediaType, DitherType, Reserved1, Reserved2, PanningWidth, PanningHeight;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int EnumDisplaySettings(string d, int m, ref DM dm);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int ChangeDisplaySettings(ref DM dm, int f);
  [DllImport("user32.dll")] static extern int ChangeDisplaySettings(IntPtr dm, int f);
  public static int Ayarla(int w, int h) { var dm = new DM(); dm.Size = (short)Marshal.SizeOf(typeof(DM)); EnumDisplaySettings(null, -1, ref dm); dm.PelsWidth = w; dm.PelsHeight = h; dm.Fields = 0x80000 | 0x100000; return ChangeDisplaySettings(ref dm, 0); }
  public static int Geri() { return ChangeDisplaySettings(IntPtr.Zero, 0); }
}
"@ };`;
const ekranAyarla = (w, h) => ps(ekranTip + `[KopruEkran]::Ayarla(${w},${h})`);
const ekranGeri = () => ps(ekranTip + '[KopruEkran]::Geri()');
const ekranBoyutu = () => ps('Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "$($b.Width)x$($b.Height)"');

// ---- ses: aygıt ve Windows'ta çalan ton ----
// Sanal makinede ses aygıtı yoksa (ya da sanal ses sürücüsü kurulamadıysa) ses
// testleri "atlandı: ses aygıtı yok" diye raporlanır, başarısız sayılmaz.
const sesAygitlari = () => ps('$d=(Get-CimInstance Win32_SoundDevice | ForEach-Object Name) -join "; "; $s=(Get-Service Audiosrv -ErrorAction SilentlyContinue).Status; "aygıtlar=[$d] Audiosrv=$s"');
function tonWav(file, sec = 2, hz = 440) {
  const sr = 48000, n = sr * sec, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(2 * Math.PI * hz * i / sr) * 9000); b.writeInt16LE(v, 44 + i * 4); b.writeInt16LE(v, 46 + i * 4); }
  fs.writeFileSync(file, b);
}
// tonBaslat Windows'un varsayılan ses çıkışında döngüyle ton çalar (ayrı süreç,
// aşama bitse de sürer); WASAPI geri döngü yakalaması bunu duyar.
function tonBaslat(dakika) {
  if (process.platform !== 'win32') return;
  const f = path.join(WORK, 'ton.wav');
  if (!fs.existsSync(f)) tonWav(f);
  const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-STA', '-Command', `$p=New-Object Media.SoundPlayer '${f}'; $p.PlayLooping(); Start-Sleep -Seconds ${Math.round(dakika * 60)}`], { detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', () => {});
  p.unref();
  fs.writeFileSync(path.join(WORK, 'ton.pid'), String(p.pid));
}
function tonDurdur() {
  try { const pid = parseInt(fs.readFileSync(path.join(WORK, 'ton.pid'), 'utf8'), 10); if (pid) ps(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`); fs.unlinkSync(path.join(WORK, 'ton.pid')); } catch {}
}

// ---- hedef program ----
let tgtBrowser = null;
async function target() {
  if (tgtBrowser) { try { await tgtBrowser.close(); } catch {} }
  tgtBrowser = await chromium.connectOverCDP(HEDEF_CDP);
  const pg = tgtBrowser.contexts()[0].pages().find((p) => /hedef\.html/.test(p.url())) || tgtBrowser.contexts()[0].pages()[0];
  return { b: tgtBrowser, pg };
}
// hedefTamEkran hedef programı (kiosk penceresi) ekranın şu anki boyutuna yayar.
// Windows çözünürlüğü değişince tam ekran pencere eski boyutunda kalıyor (1.2.2
// koşusunda 1920×1080'e geçince pencere 1024×768'de kaldı, ekran görüntüsü
// hizmet-olcek-175.png). Telefon testleri ekranın oranına dokunup görüntünün oranından
// okuduğu için hedef ekranı tam kaplamalı. Önce pencere CDP ile tam ekrana yeniden
// alınır; olmazsa program iş akışındaki gibi yeniden açılır.
async function hedefTamEkran() {
  const kapliyor = async () => { const { pg } = await target(); return pg.evaluate(() => ({ ok: screenX === 0 && screenY === 0 && Math.abs(innerWidth - screen.width) <= 2 && Math.abs(innerHeight - screen.height) <= 2, pencere: [innerWidth, innerHeight], ekran: [screen.width, screen.height], dpr: devicePixelRatio })); };
  let d = await kapliyor().catch((e) => ({ ok: false, hata: e.message }));
  if (d.ok) return d;
  try {
    const { pg } = await target();
    const cdp = await pg.context().newCDPSession(pg);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
    await sleep(700);
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
    await cdp.detach().catch(() => {});
  } catch (e) { console.log('  [hedef tam ekran: CDP]', e.message); }
  d = await waitFor(async () => { const x = await kapliyor(); return x.ok && x; }, 6000, 500).catch(() => null);
  if (d) return { ...d, yol: 'CDP' };
  if (process.platform !== 'win32') return { ok: false, neden: 'yalnızca Windows\'ta yeniden açılır' };
  // Yeniden aç (iş akışındaki "Hedef programı masaüstünde aç" adımıyla aynı).
  ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -match 'remote-debugging-port=9222' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }");
  await sleep(2000);
  const exe = chromium.executablePath(), url = 'file:///' + path.join(__dirname, 'hedef.html').replace(/\\/g, '/');
  ps(`Start-Process -FilePath '${exe}' -ArgumentList @('--kiosk','--remote-debugging-port=9222',"--user-data-dir=$env:RUNNER_TEMP\\hedef",'--no-first-run','--no-default-browser-check','--disable-features=Translate','${url}')`);
  await waitFor(() => fetch(HEDEF_CDP + '/json/version').then((r) => r.ok), 30000, 500);
  await sleep(4000);
  d = await waitFor(async () => { const x = await kapliyor(); return x.ok && x; }, 10000, 1000).catch(() => null);
  return d ? { ...d, yol: 'yeniden açıldı' } : { ok: false, ...(await kapliyor().catch(() => ({}))) };
}
async function centerOf(tpg, sel, dy = 0) {
  return tpg.evaluate(([s, dy]) => {
    const r = document.querySelector(s).getBoundingClientRect(), d = devicePixelRatio;
    return { x: Math.round((screenX + r.left + r.width / 2) * d), y: Math.round((screenY + r.top + r.height / 2 + dy) * d) };
  }, [sel, dy]);
}
const tstate = (tpg) => tpg.evaluate(() => window.state());
const resetTarget = (tpg) => tpg.evaluate(() => {
  ev.length = 0; const t = document.getElementById('tap'); t.style.background = '#808080'; t.textContent = 'dokun';
  const a = document.getElementById('ta'); a.value = ''; a.dispatchEvent(new Event('input')); document.getElementById('scroll').scrollTop = 0;
  document.getElementById('dbl').style.background = ''; if (window.kalibrasyon) { window.kalibrasyon(null); window.yogunDesen(false); window.hareket(false); }
});

// ---- istemci yardımcıları ----
const edge = (o = {}) => chromium.launch({ ...(KANAL === 'chromium' ? {} : { channel: KANAL }), headless: true, args: ['--autoplay-policy=no-user-gesture-required'], ...o });
// connectClient istemciyi açıp bağlanır. o.oneriYok: "telefona göre büyüt" kartı
// bu bilgisayar için yanıtlanmış sayılsın (dokunuşların önüne çıkmasın).
async function connectClient(page, url, id, pw, ms = 45000, o = {}) {
  await page.goto(url);
  if (o.oneriYok) await page.evaluate((id) => { app.book = (app.book || []).filter((b) => b.id !== id); app.book.push({ id, name: 'Canlı test', last: Date.now(), fit: false }); }, String(id).replace(/\D/g, '')).catch(() => {});
  if (o.ayar) await page.evaluate((a) => Object.assign(app.settings, a), o.ayar).catch(() => {});
  await page.fill('#in-id', id);
  await page.fill('#in-pw', pw);
  const t0 = Date.now();
  await page.click('#btn-connect');
  // Görüntü gerçekten gelmiş olmalı: tuval yolunda (veri kanalı/tünel) çözülmüş kare,
  // <video> yolunda boyut. (Gizli tuvalin varsayılan 300×150'si sayılmaz.)
  const okc = await waitFor(() => page.evaluate(() => {
    if (!document.getElementById('overlay').classList.contains('hidden')) return false;
    const v = document.getElementById('video'), c = document.getElementById('vcanvas');
    return (v.videoWidth > 0 && !v.classList.contains('hidden')) || (!c.classList.contains('hidden') && (app.wsv?.st?.dec || 0) > 0);
  }), ms);
  const err = okc ? '' : await page.evaluate(() => (document.getElementById('connect-err')?.textContent || '') + ' | ' + (document.getElementById('overlay-text')?.textContent || '')).catch(() => '');
  return { ok: !!okc, ms: Date.now() - t0, err };
}
// Aktarım: tünel, doğrudan bağlantıda RTP görüntüsü ya da (Apple cihazlarında, 1.2.6+) veri kanalı.
const kindOf = (page) => page.evaluate(() => (app.session?.wsMode ? 'tünel(ws)' : app.session?.pc ? (app.wsv ? 'webrtc+veri kanalı' : 'webrtc') : '?'));
async function remoteSize(page) {
  return page.evaluate(() => { const v = document.getElementById('video'), c = document.getElementById('vcanvas'); return v.classList.contains('hidden') ? { w: c.width, h: c.height } : { w: v.videoWidth, h: v.videoHeight }; });
}
// goruntuYolu bağlı istemcinin görüntü yolunu ve RTP görüntüsünün boş kalıp kalmadığını verir.
const goruntuYolu = (page) => page.evaluate(async () => {
  let rtp = null;
  try { (await app.session.pc?.getStats())?.forEach((x) => { if (x.type === 'inbound-rtp' && x.kind === 'video') rtp = { kare: x.framesDecoded || 0, bayt: x.bytesReceived || 0 }; }); } catch {}
  return { veriKanali: !app.session?.wsMode && !!app.session?.o?.dcVideo && !!app.wsv, video: !document.getElementById('video').classList.contains('hidden'), cozulen: app.wsv?.st?.dec ?? null, profil: app.session?.o?.wsProfile, rtp };
});
async function pixel(page, x, y) {
  return page.evaluate(([x, y]) => {
    const v = document.getElementById('video'), c0 = document.getElementById('vcanvas');
    const src = v.classList.contains('hidden') ? c0 : v;
    const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
    return [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
  }, [x, y]);
}
// toClient uzak ekran pikselini (x, y) istemcideki noktaya çevirir. Ajan 0..65535
// oranını ekranın (W-1)×(H-1)'ine eşler; ekran boyutu ajanın "display" iletisinden
// alınır (akış küçültülmüş olsa da doğru), yoksa akış boyutu.
async function toClient(page, x, y) {
  return page.evaluate(([x, y]) => {
    const v = document.getElementById('video'), c0 = document.getElementById('vcanvas');
    const src = v.classList.contains('hidden') ? c0 : v;
    const d = app.currentDisplay;
    const W = d?.w || src.videoWidth || src.width, H = d?.h || src.videoHeight || src.height;
    const r = document.getElementById('canvas').getBoundingClientRect();
    return [r.left + x / (W - 1) * r.width, r.top + y / (H - 1) * r.height];
  }, [x, y]);
}
const near = (a, b, tol = 35) => a && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const statsOf = (page) => page.evaluate(() => app.agentStats || null);
// frameCounter çözülen kare sayısı: tuval yolunda (veri kanalı ya da tünel; 1.2.6'dan
// beri iPhone'da doğrudan bağlantı da bu yoldan) WebCodecs'in çözdüğü, <video>
// yolunda RTP'nin çözdüğü kareler. (Veri kanalı yolunda RTP görüntüsü boştur.)
async function frameCounter(page) {
  return page.evaluate(async () => {
    if (app.wsv) return app.wsv.st?.dec ?? app.wsv.frames ?? 0;
    if (app.session?.pc) { const s = await app.session.pc.getStats(); let n = 0; s.forEach((x) => { if (x.type === 'inbound-rtp' && x.kind === 'video') n = x.framesDecoded; }); return n; }
    return 0;
  });
}
// Ekranı değiştirip yeni kare gelip gelmediğini ölç (akışın canlı olduğunu kanıtlar).
async function liveFrames(page, tpg, ms = 2500) {
  const f0 = await frameCounter(page);
  await tpg.evaluate(() => { let i = 0; window.__an = setInterval(() => { document.getElementById('white').style.background = i++ % 2 ? '#FFFFFF' : '#F0F0F0'; }, 40); });
  await sleep(ms);
  await tpg.evaluate(() => { clearInterval(window.__an); document.getElementById('white').style.background = '#FFFFFF'; });
  return (await frameCounter(page)) - f0;
}
// Ayar sayfası anahtarı ajan her başladığında yenilenir: her çağrıda dosyadan oku.
function uiHelper(dir) {
  return (p, body) => {
    const uiURL = fs.readFileSync(path.join(dir, 'ui.url'), 'utf8').trim();
    const key = new URL(uiURL).searchParams.get('k');
    return fetch(new URL(p, uiURL), { method: body ? 'POST' : 'GET', headers: { 'X-Kopru-Key': key }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
  };
}
async function touchApi(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  return (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 5, radiusY: 5, force: 1 })) });
}
// Girdi → görüntü gecikmesi: istemciden tıklama gönderildiği andan, hedefteki
// renk değişikliğinin istemcide ekrana geldiği kareye kadar geçen süre (ms).
// Kapsar: ağ + Windows'un girdiyi işlemesi + programın yeniden çizmesi + yakalama +
// kodlama + ağ + çözme + gösterim. (Telefonun dokunmatik/ekran donanımı hariç.)
async function measureLatency(page, tpg, n = 12) {
  const c = await centerOf(tpg, '#tap', 40); // yazının dışından oku
  const sz = await remoteSize(page);
  return page.evaluate(async ([fx, fy, n]) => {
    const v = document.getElementById('video'), cv = document.getElementById('vcanvas');
    const ws = v.classList.contains('hidden');
    const src = ws ? cv : v;
    const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
    const k = document.createElement('canvas'); k.width = w; k.height = h;
    const g = k.getContext('2d', { willReadFrequently: true });
    const px = () => { g.drawImage(src, 0, 0); return [...g.getImageData(Math.round(fx * w), Math.round(fy * h), 1, 1).data.slice(0, 3)]; };
    const next = () => new Promise((r) => (!ws && v.requestVideoFrameCallback ? v.requestVideoFrameCallback(() => r()) : requestAnimationFrame(() => r())));
    const out = [];
    for (let i = 0; i < n; i++) {
      const before = px();
      const t0 = performance.now();
      app.input.sendButton(0, true, fx, fy); app.input.sendButton(0, false, fx, fy);
      let t1 = null;
      while (performance.now() - t0 < 2500) {
        await next();
        const p = px();
        if (Math.abs(p[0] - before[0]) + Math.abs(p[1] - before[1]) + Math.abs(p[2] - before[2]) > 120) { t1 = performance.now(); break; }
      }
      if (t1) out.push(Math.round(t1 - t0));
      await new Promise((r) => setTimeout(r, 250));
    }
    out.sort((a, b) => a - b);
    return { olcumler: out, ortanca: out[Math.floor(out.length / 2)], p90: out[Math.floor(out.length * 0.9)], basarili: out.length + '/' + n };
  }, [c.x / sz.w, c.y / sz.h, n]);
}

// Windows yazı ölçeği: 1920×1080'e geç, büyüt, hedef programın piksel oranının
// gerçekten değiştiğini doğrula, sonra her şeyi geri al.
async function scaleScenario(page, label) {
  await page.evaluate(() => app.session.sendCtl({ t: 'modes' }));
  const m = await waitFor(() => page.evaluate(() => app.modes), 5000);
  const before = await remoteSize(page);
  const big = m?.modes?.find((x) => x.w === 1920 && x.h === 1080) || m?.modes?.[0];
  if (big && (big.w !== before.w || big.h !== before.h)) {
    await page.evaluate(([w, h]) => app.session.sendCtl({ t: 'mode', w, h }), [big.w, big.h]);
    await waitFor(async () => { const s = await remoteSize(page); return s.w === big.w ? s : null; }, 20000);
    await sleep(1500);
  }
  await page.evaluate(() => { app.scales = null; app.session.sendCtl({ t: 'scales' }); });
  const sc = await waitFor(() => page.evaluate(() => app.scales), 6000);
  note(`${label}: ölçek seçenekleri`, sc);
  const target = sc?.list?.filter((p) => p > sc.cur && p <= 175).pop();
  if (!target) {
    ok(`${label}: Windows yazı ölçeği büyütülebiliyor`, false, sc);
  } else {
    let { pg: tpg } = await target_();
    const d0 = await tpg.evaluate(() => devicePixelRatio);
    await page.evaluate((p) => app.session.sendCtl({ t: 'scale', pct: p }), target);
    const d1 = await waitFor(async () => { ({ pg: tpg } = await target_()); const d = await tpg.evaluate(() => devicePixelRatio); return Math.abs(d - target / 100) < 0.01 ? d : null; }, 15000, 1000);
    await page.screenshot({ path: path.join(OUT, `${label}-olcek-${target}.png`) });
    ok(`${label}: Windows yazı ölçeği %${sc.cur} → %${target} (programlar büyüdü, çözünürlük aynı)`, !!d1, { once: d0, sonra: d1, cozunurluk: await remoteSize(page) });
    // Yazı boyutu büyükken çözünürlük küçülürse Windows izin verilen aralığı
    // daraltır; Köprü seçilen boyutu aralığa sığdırmalı, büyük çözünürlüğe
    // dönünce de seçilen boyutu geri getirmeli.
    const mid = m?.modes?.find((x) => x.w === 1280 && x.h === 720) || m?.modes?.find((x) => x.w === 1366 && x.h === 768);
    if (d1 && mid && big) {
      const dprIs = async (want) => waitFor(async () => { ({ pg: tpg } = await target_()); const d = await tpg.evaluate(() => devicePixelRatio); return Math.abs(d - want / 100) < 0.01 ? d : null; }, 15000, 1000);
      await page.evaluate(([w, h]) => app.session.sendCtl({ t: 'mode', w, h }), [mid.w, mid.h]);
      await waitFor(async () => { const s = await remoteSize(page); return s.w === mid.w ? s : null; }, 20000);
      // Önceki adımın geç gelen "scales" iletisi okunmasın: ajan boyutu uyarlayınca
      // listeyi yeniden iste.
      await sleep(2500);
      await page.evaluate(() => { app.scales = null; app.session.sendCtl({ t: 'scales' }); });
      const scM = await waitFor(() => page.evaluate(() => app.scales && app.scales.list && app.scales), 10000);
      const fit = scM ? scM.list.filter((p) => p <= target).pop() || scM.list[0] : 0;
      const dM = scM && (await dprIs(fit));
      ok(`${label}: çözünürlük ${mid.w}×${mid.h} olunca yazı boyutu aralığa sığdırıldı (%${fit})`, !!dM && scM.cur === fit, { liste: scM?.list, cur: scM?.cur, dpr: dM });
      await page.evaluate(([w, h]) => app.session.sendCtl({ t: 'mode', w, h }), [big.w, big.h]);
      await waitFor(async () => { const s = await remoteSize(page); return s.w === big.w ? s : null; }, 20000);
      const dB = await dprIs(target);
      ok(`${label}: ${big.w}×${big.h}'e dönünce seçilen %${target} geri geldi`, !!dB, { dpr: dB });
    }
    await page.evaluate(() => app.session.sendCtl({ t: 'scale', pct: 0 }));
    const d2 = await waitFor(async () => { ({ pg: tpg } = await target_()); const d = await tpg.evaluate(() => devicePixelRatio); return Math.abs(d - d0) < 0.01 ? d : null; }, 15000, 1000);
    ok(`${label}: yazı ölçeği eski haline döndü`, !!d2, { geri: d2 });
    // Telefona uydur (iPhone 15 Pro yatay 852×393): mantıksal masaüstü telefon
    // kadar olsun → istenen ≈ %225; Windows'un izin verdiği en yakın değer uygulanır.
    if (d2) {
      await page.evaluate(() => { app.scales = null; app.session.sendCtl({ t: 'fit', w: 852, h: 393 }); });
      const scF = await waitFor(() => page.evaluate(() => app.scales && app.scales.changed && app.scales), 15000);
      const near = sc.list.reduce((b, c) => (Math.abs(c - 225) < Math.abs(b - 225) || (Math.abs(c - 225) === Math.abs(b - 225) && c > b) ? c : b), sc.list[0]);
      const dF = scF && (await waitFor(async () => { ({ pg: tpg } = await target_()); const d = await tpg.evaluate(() => devicePixelRatio); return Math.abs(d - near / 100) < 0.01 ? d : null; }, 15000, 1000));
      ok(`${label}: telefona uydur (iPhone 15 Pro) → %${near}, programlar büyüdü`, !!dF && scF.cur === near, { liste: sc.list, cur: scF?.cur, dpr: dF });
      await page.evaluate(() => app.session.sendCtl({ t: 'scale', pct: 0 }));
      await waitFor(async () => { ({ pg: tpg } = await target_()); const d = await tpg.evaluate(() => devicePixelRatio); return Math.abs(d - d0) < 0.01 ? d : null; }, 15000, 1000);
    }
  }
  await page.evaluate(() => app.session.sendCtl({ t: 'mode', w: 0, h: 0 }));
  await waitFor(async () => { const s = await remoteSize(page); return s.w === before.w ? s : null; }, 20000);
  await sleep(1500);
}
const target_ = () => target();

const privacyWindow = () => ps(user32 + '$h=[W.U]::FindWindow("KopruGizlilik",[NullString]::Value); if ($h -ne [IntPtr]::Zero) { $a=0; [void][W.U]::GetWindowDisplayAffinity($h,[ref]$a); "var görünür=" + [W.U]::IsWindowVisible($h) + " yakalamaDışı=0x" + $a.ToString("x") } else { "yok" }');

// ======================= dokunuş kalibrasyonu (ortak) =======================
// Kullanıcının hatası: 4K + %150 ölçekli Windows'ta dokunuşlar hedefin 2–3 cm
// yukarısına düşüyor. Hipotez A (docs/arastirma/07-kalibrasyon.md): Windows,
// %100 olmayan ölçekte enjekte edilen dokunuşu yanlış yere koyuyor. Burada
// hedef.html'deki bilinen noktalara (window.KAL, ekranın oranı) iPhone
// benzetiminden dokunulur; Windows'un olayı nereye koyduğu (fiziksel piksel),
// ajanın tanı değerleri (enjekte edilen piksel, eşleme dikdörtgeni, imlecin
// dokunuştan sonraki yeri) ve olay türü (touch / mouse) kaydedilir.

// dprBekle hedef programın piksel oranı istenen değere gelene kadar bekler.
async function dprBekle(want, ms = 20000) {
  return waitFor(async () => { const { pg } = await target(); const d = await pg.evaluate(() => devicePixelRatio); return Math.abs(d - want) < 0.01 ? d : null; }, ms, 1000);
}
// kalHedef ekran oranındaki noktanın fiziksel piksel karşılığı (kiosk penceresi 0,0'da).
const kalHedef = (tpg, fx, fy) => tpg.evaluate(([fx, fy]) => ({ x: Math.round((screenX + fx * innerWidth) * devicePixelRatio), y: Math.round((screenY + fy * innerHeight) * devicePixelRatio), dpr: devicePixelRatio }), [fx, fy]);
// kalDinle ajanın tanı iletilerini (inputdiag/tapdbg/tapcur/notice) toplar ve tanıyı açar.
async function kalDinle(m) {
  await m.evaluate(() => {
    window.__kal = window.__kal || { msgs: [], diag: null };
    if (window.__kalS !== app.session) {
      window.__kalS = app.session;
      app.session.addEventListener('ctl', (e) => {
        const d = e.detail;
        if (!d) return;
        if (d.t === 'inputdiag') window.__kal.diag = d;
        else if (/^(tapdbg|tapcur|notice)$/.test(d.t)) window.__kal.msgs.push({ ...d, at: Date.now() });
      });
    }
    app.session.sendCtl({ t: 'dbg', on: true });
  });
}
// kalTur bir modda (tablet: Windows dokunmatiği, direct: fare tıklaması) noktalara
// sırayla dokunur. noktalar: [[sıra, [fx, fy]], ...].
async function kalTur(m, touch, tpg, mod, noktalar, bekle = 700) {
  await m.evaluate((md) => app.setMode(md), mod);
  await kalDinle(m);
  await sleep(500);
  await tpg.evaluate((md) => window.kalibrasyon(md), mod === 'tablet' ? 'tablet' : 'dogrudan');
  const rows = [];
  for (const [i, [fx, fy]] of noktalar) {
    const h = await kalHedef(tpg, fx, fy);
    await tpg.evaluate(() => { ev.length = 0; });
    await m.evaluate(() => { window.__kal.msgs = []; });
    const [cx, cy] = await toClient(m, h.x, h.y);
    await touch('touchStart', [[cx, cy]]); await sleep(50); await touch('touchEnd', []);
    const pd = await waitFor(() => tpg.evaluate(() => ev.find((e) => e.t === 'pointerdown')), 3000, 50);
    await sleep(bekle); // ajanın kapalı döngü denetimi (imleci 150–400 ms sonra okur)
    const msgs = await m.evaluate(() => window.__kal.msgs.slice());
    const dbg = msgs.find((x) => x.t === 'tapdbg'), cur = msgs.find((x) => x.t === 'tapcur'), ntc = msgs.find((x) => x.t === 'notice');
    const got = pd ? [Math.round(pd.x * pd.dpr), Math.round(pd.y * pd.dpr)] : null;
    rows.push({
      i, oran: [fx, fy], hedef: [h.x, h.y], gelen: got, fark: got ? [got[0] - h.x, got[1] - h.y] : null, tur: pd ? pd.pt || 'mouse' : null,
      ajan: dbg?.px || null, yol: dbg?.via || null, imlec: cur?.px || null, imlecGorunur: cur ? cur.vis : null,
      esleme: dbg?.d ? [dbg.d.x, dbg.d.y, dbg.d.w, dbg.d.h] : null, kare: dbg?.f || null, ham: dbg?.raw ? [dbg.raw.x, dbg.raw.y, dbg.raw.w, dbg.raw.h] : null,
      bildirim: ntc?.text || null, dpr: h.dpr,
    });
  }
  await tpg.evaluate(() => window.kalibrasyon(null));
  const diag = await m.evaluate(() => window.__kal.diag?.info || null);
  return { rows, diag };
}
// kalOzet bir turun özeti: isabet, en büyük sapma, ortalama sapma ve doğrusal uyum
// (gelen = eğim × hedef + kesişim; eğim 1/1,5 ≈ 0,67 ise koordinat ölçek kadar küçülüyor).
function kalOzet(rows, tol = KAL_TOL) {
  const hit = rows.filter((r) => r.gelen);
  const bad = hit.filter((r) => Math.abs(r.fark[0]) > tol || Math.abs(r.fark[1]) > tol);
  const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000);
  const mean = (a) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : null);
  const fit = (k) => {
    if (hit.length < 2) return null;
    const xs = hit.map((r) => r.hedef[k]), ys = hit.map((r) => r.gelen[k]);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const vx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
    if (!vx) return null;
    const b = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / vx;
    return { egim: r1(b), kesisim: Math.round(my - b * mx) };
  };
  const turler = {};
  for (const r of rows) turler[r.tur || 'yok'] = (turler[r.tur || 'yok'] || 0) + 1;
  // Kapalı döngünün varsayımı: Windows dokunuşta imleci dokunuşun (düştüğü) yere taşır.
  const yakin = (a, b) => a && b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  const dok = rows.filter((r) => r.tur === 'touch' && r.imlec);
  return {
    nokta: rows.length, gelen: hit.length, isabet: hit.length - bad.length, tol,
    enBuyuk: hit.length ? Math.max(...hit.map((r) => Math.max(Math.abs(r.fark[0]), Math.abs(r.fark[1])))) : null,
    ortFark: [mean(hit.map((r) => r.fark[0])), mean(hit.map((r) => r.fark[1]))],
    x: fit(0), y: fit(1), turler,
    imlec: { olculen: dok.length, tasindi: dok.filter((r) => yakin(r.imlec, r.gelen) || yakin(r.imlec, r.ajan)).length },
    fareyeGecis: rows.findIndex((r) => r.bildirim),
  };
}
const kalSatir = (r) => `#${r.i} hedef(${r.hedef}) → ${r.gelen ? `gelen(${r.gelen}) fark(${r.fark})` : 'olay yok'} ${r.tur || ''}${r.imlec ? ` imleç(${r.imlec})` : ''}${r.bildirim ? ' [fareye geçti]' : ''}`;
// hipotezA %150'deki Tablet (dokunmatik) ve Doğrudan (fare) turlarından karar verir.
function hipotezA(tablet, dogrudan, tol = KAL_TOL) {
  const touch = (tablet || []).filter((r) => r.gelen && r.tur === 'touch');
  const kayan = touch.filter((r) => Math.abs(r.fark[0]) > tol || Math.abs(r.fark[1]) > tol);
  const fare = (dogrudan || []).filter((r) => r.gelen);
  const fareTamam = fare.length > 0 && fare.every((r) => Math.abs(r.fark[0]) <= tol && Math.abs(r.fark[1]) <= tol);
  const ozet = { dokunmatik: kalOzet(touch, tol), fare: kalOzet(fare, tol) };
  if (!touch.length) return { karar: 'BELİRSİZ', neden: 'Tablet turunda Windows hiç dokunmatik (touch) olayı üretmedi', ...ozet };
  if (kayan.length && fareTamam) return { karar: 'DOĞRULANDI', neden: `%150'de enjekte edilen dokunuş kayıyor (${kayan.length}/${touch.length} nokta ±${tol} px dışında), fare tıklaması hedefte`, ...ozet };
  if (!kayan.length && fareTamam) return { karar: 'REDDEDİLDİ', neden: `%150'de dokunmatik (${touch.length} nokta) ve fare (${fare.length} nokta) ±${tol} px içinde`, ...ozet };
  if (!kayan.length) return { karar: 'REDDEDİLDİ (fare ölçülemedi)', neden: `dokunmatik ${touch.length} nokta ±${tol} px içinde`, ...ozet };
  return { karar: 'BELİRSİZ', neden: 'dokunmatik de fare de hedeften sapıyor: eşleme sorunu olabilir (H4)', ...ozet };
}
// iphoneBaglan iPhone 15 Pro (yatay) benzetimiyle bağlanır; bağlam, sayfa ve dokunma işlevini verir.
async function iphoneBaglan(browser, url, id, pw, o = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] });
  const m = await ctx.newPage();
  m.on('pageerror', (e) => console.log('  [iPhone istemci hata]', e.message));
  let c = { ok: false };
  for (let i = 0; i < (o.deneme || 1) && !c.ok; i++) { if (i) await sleep(3000); c = await connectClient(m, url, id, pw, o.ms || 45000, { oneriYok: o.oneriYok !== false }); }
  if (c.ok) await sleep(1500);
  return { ctx, m, c, touch: c.ok ? await touchApi(ctx, m) : null };
}
// kalIphoneTur ayrı bir iPhone bağlantısında bir tur dokunur. yenile: her bu kadar
// dokunuşta yeniden bağlanır (kapalı döngü fareye geçtiyse ham dokunmatik ölçümü sürsün).
async function kalIphoneTur(browser, url, id, pw, mod, noktalar, yenile = 0) {
  const parts = yenile ? Array.from({ length: Math.ceil(noktalar.length / yenile) }, (_, k) => noktalar.slice(k * yenile, (k + 1) * yenile)) : [noktalar];
  const out = { rows: [], diag: null, aktarim: null, hata: null };
  for (const part of parts) {
    const s = await iphoneBaglan(browser, url, id, pw, { deneme: 2 });
    if (!s.c.ok) { out.hata = 'iPhone benzetimi bağlanamadı: ' + s.c.err; await s.ctx.close(); break; }
    out.aktarim = out.aktarim || (await kindOf(s.m));
    const { pg: tpg } = await target();
    const r = await kalTur(s.m, s.touch, tpg, mod, part);
    out.rows.push(...r.rows); out.diag = out.diag || r.diag;
    await s.m.evaluate(() => app.disconnect()).catch(() => {});
    await s.ctx.close();
    await sleep(800);
  }
  return out;
}
// kalibrasyonOlc denetim bağlantısı (kp: ekranı değiştiren masaüstü istemcisi) açıkken
// %100 ve %150'de Tablet + Doğrudan turları yapar; sonucu döndürür.
async function kalibrasyonOlc(browser, kp, url, id, pw, etiket, { yuzde100 = true } = {}) {
  const tum = (await (await target()).pg.evaluate(() => window.KAL)).map((p, i) => [i, p]);
  const res = { ortam: etiket, turlar: {}, tani: {}, ekran: null, hipotez: null };
  // 1920×1080 (Windows bu çözünürlükte %150'ye izin verir)
  await kp.evaluate(() => { app.modes = null; app.session.sendCtl({ t: 'modes' }); });
  const md = await waitFor(() => kp.evaluate(() => app.modes), 6000);
  const big = md?.modes?.find((x) => x.w === 1920 && x.h === 1080);
  if (big && (await remoteSize(kp)).w !== 1920) {
    await kp.evaluate(([w, h]) => app.session.sendCtl({ t: 'mode', w, h }), [big.w, big.h]);
    await waitFor(async () => (await remoteSize(kp)).w === 1920, 20000);
    await sleep(2000);
  }
  res.ekran = await remoteSize(kp);
  res.hedef = await hedefTamEkran(); // noktalar ekranın tamamına yayılsın
  await (await target()).pg.reload(); await sleep(1500);
  if (yuzde100) {
    res.turlar['%100 Tablet'] = await kalIphoneTur(browser, url, id, pw, 'tablet', tum);
    res.turlar['%100 Doğrudan'] = await kalIphoneTur(browser, url, id, pw, 'direct', tum);
    res.tani['%100'] = res.turlar['%100 Tablet'].diag;
  }
  await kp.evaluate(() => { app.scales = null; app.session.sendCtl({ t: 'scales' }); });
  const sc = await waitFor(() => kp.evaluate(() => app.scales && app.scales.list && app.scales), 6000);
  res.olcekler = sc?.list || null;
  if (!sc?.list?.includes(150)) { res.hata = '%150 seçeneği yok: ' + JSON.stringify(sc); return res; }
  await kp.evaluate(() => app.session.sendCtl({ t: 'scale', pct: 150 }));
  const d = await dprBekle(1.5);
  res.dpr150 = d;
  if (!d) { res.hata = 'Windows ölçeği %150 olmadı'; return res; }
  await sleep(1500);
  // Sürekli tur: kullanıcının yaşadığı gibi tek bağlantıda art arda dokunuşlar
  // (kayma varsa iki dokunuştan sonra kapalı döngü fareye geçer).
  res.turlar['%150 Tablet'] = await kalIphoneTur(browser, url, id, pw, 'tablet', tum);
  res.turlar['%150 Doğrudan'] = await kalIphoneTur(browser, url, id, pw, 'direct', tum);
  res.tani['%150'] = res.turlar['%150 Tablet'].diag;
  // Fareye geçildiyse ham dokunmatik ölçümü için her iki dokunuşta yeniden bağlan.
  if (res.turlar['%150 Tablet'].rows.some((r) => r.bildirim || r.tur === 'mouse')) {
    res.turlar['%150 Tablet (yalnız dokunmatik)'] = await kalIphoneTur(browser, url, id, pw, 'tablet', tum, 2);
  }
  // Hipotez kararı: %150'deki bütün Windows dokunmatik olayları (iki Tablet turu) ve fare turu.
  const tabletRows = [...res.turlar['%150 Tablet'].rows, ...(res.turlar['%150 Tablet (yalnız dokunmatik)']?.rows || [])];
  res.hipotez = hipotezA(tabletRows, res.turlar['%150 Doğrudan'].rows);
  for (const t of Object.values(res.turlar)) t.ozet = kalOzet(t.rows);
  return res;
}
// kalRapor ölçümü dosyaya yazar, satırları günlüğe döker, denetimleri ekler.
function kalRapor(res, dosya, etiket) {
  fs.writeFileSync(path.join(OUT, dosya), JSON.stringify(res, null, 2));
  for (const [k, t] of Object.entries(res.turlar || {})) {
    console.log(`  [${etiket}] ${k}: ${JSON.stringify(t.ozet || kalOzet(t.rows))}`);
    for (const r of t.rows) console.log('     ' + kalSatir(r));
  }
  note(`${etiket}: Windows'un girdi koordinat uzayı (ajanın tanısı)`, res.tani);
  if (res.hata) ok(`${etiket}: %150 ölçümü yapılabildi`, false, res.hata);
  const t100 = res.turlar['%100 Tablet'], d100 = res.turlar['%100 Doğrudan'];
  const t150 = res.turlar['%150 Tablet'], d150 = res.turlar['%150 Doğrudan'];
  const icinde = (rows) => rows.length > 0 && rows.every((r) => r.gelen && Math.abs(r.fark[0]) <= KAL_TOL && Math.abs(r.fark[1]) <= KAL_TOL);
  if (t100) ok(`${etiket}: %100 Tablet dokunuşları hedefte (±${KAL_TOL} px, ${t100.rows.length} nokta)`, icinde(t100.rows), t100.ozet || kalOzet(t100.rows));
  if (d100) ok(`${etiket}: %100 Doğrudan (fare) dokunuşları hedefte`, icinde(d100.rows), d100.ozet || kalOzet(d100.rows));
  if (d150) ok(`${etiket}: %150 Doğrudan (fare) dokunuşları hedefte`, icinde(d150.rows), d150.ozet || kalOzet(d150.rows));
  if (t150) {
    // Kullanıcının gördüğü: kayma varsa ilk iki dokunuş kayar, sonra fare; sonrakiler hedefte olmalı.
    const sw = t150.rows.findIndex((r) => r.bildirim);
    const sonra = sw >= 0 ? t150.rows.slice(sw + 1) : t150.rows;
    ok(`${etiket}: %150 Tablet dokunuşları hedefte (kayma varsa kapalı döngüyle fareye geçtikten sonra)`, icinde(sonra) && (sw < 0 || sw <= 2), { ...(t150.ozet || kalOzet(t150.rows)), fareyeGecis: sw });
    const im = kalOzet([...t150.rows, ...(res.turlar['%150 Tablet (yalnız dokunmatik)']?.rows || [])]).imlec;
    // 1.2.8 canlı testi (Server 2025): Windows enjekte edilen dokunuşta imleci taşımıyor;
    // kapalı döngü bu durumda ölçüm yapmaz (yanlış geçiş de yapmaz). Bilgi olarak raporlanır.
    note(`${etiket}: Windows dokunuşta imleci taşıyor mu (kapalı döngünün ölçebilmesi için)`, { ...im, sonuc: im.olculen > 0 && im.tasindi >= Math.ceil(im.olculen * 0.8) ? 'evet' : 'hayır (kapalı döngü ölçemez)' });
  }
  if (res.hipotez) note(`${etiket}: HİPOTEZ A (Windows %150'de enjekte edilen dokunuşu kaydırıyor) → ${res.hipotez.karar}`, res.hipotez);
}

// ======================= 1) KULLANICI OTURUMU =======================
async function yerel() {
  note('Windows', ps('(Get-CimInstance Win32_OperatingSystem).Caption + " " + [Environment]::OSVersion.Version'));
  note('oturumlar', ps('query session 2>&1 | Out-String'));
  note('ekran kartı', ps('(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + " " + $_.CurrentHorizontalResolution + "x" + $_.CurrentVerticalResolution }) -join "; "'));
  note('ses aygıtları', sesAygitlari());
  note('ekran', ekranBoyutu());

  const home = path.join(WORK, 'home');
  fs.mkdirSync(home, { recursive: true });
  const SRV = `http://127.0.0.1:${YEREL_PORT}`;
  fs.writeFileSync(path.join(home, 'agent.json'), JSON.stringify({ server: SRV }));
  run(['server', '--addr', `127.0.0.1:${YEREL_PORT}`, '--turn-port', '0', '--data', path.join(WORK, 'srv')]);
  await waitFor(() => fetch(`${SRV}/healthz`).then((r) => r.ok), 30000);
  run(['agent', '--server', SRV, '--name', 'Canli-Windows'], { KOPRU_HOME: home });
  const cfg = await waitFor(() => { const c = JSON.parse(fs.readFileSync(path.join(home, 'agent.json'), 'utf8')); return c.id ? c : null; }, 60000);
  ok('ajan gerçek Windows\'ta başladı ve kaydoldu', !!cfg, cfg ? `kimlik ${cfg.id}` : (fs.existsSync(path.join(home, 'kopru.log')) ? fs.readFileSync(path.join(home, 'kopru.log'), 'utf8').slice(-800) : 'günlük yok'));
  if (!cfg) return;
  const ui = uiHelper(home);
  const URL0 = SRV + '/';
  let { pg: tpg } = await target();
  await tpg.reload(); await sleep(800);
  const dpr = await tpg.evaluate(() => devicePixelRatio);

  const browser = await edge();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SRV });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [istemci hata]', e.message));

  await step('yanlış parola reddedildi', async () => {
    await page.goto(URL0); await page.fill('#in-id', cfg.id); await page.fill('#in-pw', 'yanlis-parola-123');
    await page.click('#btn-connect');
    const t = await waitFor(() => page.textContent('#connect-err').then((x) => /hatalı/i.test(x) && x), 20000);
    ok('yanlış parola reddedildi', !!t, t || '');
  });
  const c = await connectClient(page, URL0, cfg.id, cfg.autoPassword);
  ok('Edge ile bağlantı (doğrudan WebRTC), görüntü geldi', c.ok, `${c.ms} ms ${c.err}`);
  if (!c.ok) { await page.screenshot({ path: path.join(OUT, 'yerel-baglanamadi.png') }); }
  else {
    await sleep(2500);
    await step('ekran yakalama ve kodlayıcı', async () => {
      const st = await statsOf(page), sz = await remoteSize(page), k = await kindOf(page);
      ok('ekran yakalama ve kodlayıcı', st && st.cap && st.enc && sz.w > 0, { cap: st?.cap, enc: st?.enc, boyut: sz, aktarim: k });
    });
    await page.screenshot({ path: path.join(OUT, 'yerel-edge.png') });
    await step('renkler doğru', async () => {
      const cols = {};
      for (const [k, ref] of [['#red', [229, 57, 53]], ['#green', [67, 160, 71]], ['#blue', [30, 136, 229]], ['#white', [255, 255, 255]]]) { const p = await centerOf(tpg, k); cols[k] = { got: await pixel(page, p.x, p.y), ref }; }
      ok('renkler doğru', Object.values(cols).every((x) => near(x.got, x.ref)), cols);
    });
    await step('canlı görüntü akışı', async () => { const n = await liveFrames(page, tpg); ok('ekran değişince görüntü akıyor', n >= 20, `${n} kare / 2,5 sn`); });
    const tapC = await centerOf(tpg, '#tap');
    await step('fare sol tık', async () => {
      await resetTarget(tpg);
      const [cx, cy] = await toClient(page, tapC.x, tapC.y);
      await page.mouse.move(cx - 30, cy - 20); await page.mouse.move(cx, cy, { steps: 4 }); await page.mouse.down(); await page.mouse.up();
      const md = await waitFor(() => tpg.evaluate(() => ev.filter((e) => e.t === 'mousedown')).then((a) => (a.length ? a : null)), 4000);
      ok('fare sol tık doğru noktada', md && Math.abs(md[0].x * dpr - tapC.x) <= 4 * dpr && Math.abs(md[0].y * dpr - tapC.y) <= 4 * dpr && md[0].b === 0, { beklenen: tapC, gelen: md?.[0] });
    });
    await step('fare sağ tık', async () => {
      await resetTarget(tpg);
      const [cx, cy] = await toClient(page, tapC.x, tapC.y);
      await page.mouse.click(cx, cy, { button: 'right' });
      const cm = await waitFor(() => tpg.evaluate(() => ev.some((e) => e.t === 'contextmenu')), 4000);
      ok('fare sağ tık (bağlam menüsü)', !!cm);
      await page.keyboard.press('Escape');
    });
    await step('fare tekerleği', async () => {
      await resetTarget(tpg);
      const sc = await centerOf(tpg, '#scroll');
      const [cx, cy] = await toClient(page, sc.x, sc.y);
      await page.mouse.move(cx, cy); for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 120); await sleep(60); }
      await sleep(800);
      const s = (await tstate(tpg)).scroll;
      ok('fare tekerleği uzak sayfayı kaydırdı', s > 100, `scrollTop ${s}`);
    });
    const taC = await centerOf(tpg, '#ta');
    await step('klavye', async () => {
      await resetTarget(tpg);
      const [cx, cy] = await toClient(page, taC.x, taC.y);
      await page.mouse.click(cx, cy); await sleep(300);
      // Gerçek klavye gibi: büyük harf ve ! için Shift'e basılır.
      const typeReal = async (t) => { for (const ch of t) { if (/[A-Z!]/.test(ch)) { await page.keyboard.down('Shift'); await page.keyboard.press(ch === '!' ? 'Digit1' : 'Key' + ch); await page.keyboard.up('Shift'); } else await page.keyboard.type(ch); } };
      await typeReal('Merhaba Kopru 123!'); await sleep(800);
      ok('klavye (tarama kodları)', (await tstate(tpg)).ta === 'Merhaba Kopru 123!', (await tstate(tpg)).ta);
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await sleep(500);
      ok('kısayol Ctrl+A, Sil', (await tstate(tpg)).ta === '', (await tstate(tpg)).ta);
    });
    await step('Türkçe metin', async () => {
      await page.evaluate(() => app.input.sendText('Çağrı ŞÖÜ İı ğ €')); await sleep(1000);
      ok('Türkçe karakterler (telefon klavyesi yolu)', (await tstate(tpg)).ta === 'Çağrı ŞÖÜ İı ğ €', JSON.stringify((await tstate(tpg)).ta));
      await tpg.evaluate(() => { document.getElementById('ta').value = ''; });
      await page.evaluate(() => app.typeKeys('Kopru-Ş1 Çğ@ü')); await sleep(1500);
      ok('tuş tuş yazdırma (giriş ekranı yolu)', (await tstate(tpg)).ta === 'Kopru-Ş1 Çğ@ü', JSON.stringify((await tstate(tpg)).ta));
    });
    await step('pano', async () => {
      ps(`Set-Clipboard -Value 'uzak-ÇĞŞ-123'`);
      const got = await waitFor(() => page.evaluate(() => app.clip.remote?.text), 8000);
      ok('pano metin: Windows → istemci', got === 'uzak-ÇĞŞ-123', String(got));
      await page.evaluate(() => app.clip.sendText('yerel-ÖÜİ-456'));
      const w = await waitFor(() => { const v = ps('Get-Clipboard'); return v === 'yerel-ÖÜİ-456' ? v : null; }, 8000, 700);
      ok('pano metin: istemci → Windows', !!w, w || ps('Get-Clipboard'));
      ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=New-Object Drawing.Bitmap 64,48; $g=[Drawing.Graphics]::FromImage($b); $g.Clear([Drawing.Color]::Orange); [Windows.Forms.Clipboard]::SetImage($b)`);
      const img = await waitFor(() => page.evaluate(() => app.clip.remote?.kind === 'image' && app.clip.remote.kind), 8000);
      ok('pano görsel: Windows → istemci', !!img);
      const f = path.join(os.homedir(), 'Downloads', 'pano-dosya.txt'); fs.writeFileSync(f, 'dosya panosu');
      ps(`Set-Clipboard -Path '${f}'`);
      const fl = await waitFor(() => page.evaluate(() => app.clip.remote?.kind === 'files' && app.clip.remote.files.map((x) => x.name)), 8000);
      ok('pano dosya: Gezgin\'de kopyalanan dosya istemcide görünüyor', fl && fl.includes('pano-dosya.txt'), fl);
    });
    await step('dosyalar', async () => {
      const fdir = path.join(os.homedir(), 'Downloads', 'kopru-canli');
      fs.mkdirSync(path.join(fdir, 'klasor', 'alt'), { recursive: true });
      fs.writeFileSync(path.join(fdir, 'klasor', 'a.txt'), 'A'); fs.writeFileSync(path.join(fdir, 'klasor', 'alt', 'b.txt'), 'B');
      const big = crypto.randomBytes(24 * 1024 * 1024); fs.writeFileSync(path.join(fdir, 'buyuk.bin'), big);
      let t0 = Date.now();
      let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.evaluate((p) => app.files.download([p], {}), path.join(fdir, 'buyuk.bin'))]);
      const dlp = path.join(WORK, 'dl.bin'); await dl.saveAs(dlp);
      ok('24 MB dosya indirme (bütünlük)', sha(dlp) === crypto.createHash('sha256').update(big).digest('hex'), `${(24 / ((Date.now() - t0) / 1000)).toFixed(1)} MB/sn`);
      [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.evaluate((p) => app.files.download([p], { zip: true }), path.join(fdir, 'klasor'))]);
      const zp = path.join(WORK, 'klasor.zip'); await dl.saveAs(zp);
      const ents = ps(`Add-Type -AssemblyName System.IO.Compression.FileSystem; ([IO.Compression.ZipFile]::OpenRead('${zp}').Entries | ForEach-Object FullName) -join ','`);
      ok('klasörü ZIP olarak indirme', /klasor\/a\.txt/.test(ents) && /klasor\/alt\/b\.txt/.test(ents), ents);
      if (await page.evaluate(() => document.getElementById('toolbar').classList.contains('collapsed'))) await page.click('#tb-toggle');
      await page.click('#tb-files');
      await waitFor(() => page.$$eval('.fs-row', (r) => r.length > 0), 10000);
      await page.evaluate((p) => app.files.open(p), fdir);
      await waitFor(() => page.$$eval('.fs-row .nm', (r) => r.some((x) => x.textContent === 'buyuk.bin')), 10000);
      const up = path.join(WORK, 'yukle.bin'); const upData = crypto.randomBytes(12 * 1024 * 1024); fs.writeFileSync(up, upData);
      t0 = Date.now();
      await page.setInputFiles('#fs-input', up);
      const upOk = await waitFor(() => fs.existsSync(path.join(fdir, 'yukle.bin')) && fs.statSync(path.join(fdir, 'yukle.bin')).size === upData.length, 60000);
      ok('12 MB dosya yükleme (bütünlük)', !!upOk && sha(path.join(fdir, 'yukle.bin')) === sha(up), `${(12 / ((Date.now() - t0) / 1000)).toFixed(1)} MB/sn`);
      await page.click('[data-close="files"]').catch(() => {});
    });
    await step('performans', async () => {
      await tpg.evaluate(() => { window.__sc = setInterval(() => { const s = document.getElementById('scroll'); s.scrollTop = (s.scrollTop + 7) % (s.scrollHeight - s.clientHeight); }, 16); });
      await sleep(2500);
      const perf = [];
      for (let i = 0; i < 6; i++) { await sleep(1000); perf.push(await statsOf(page)); }
      // Yakalama zamanlaması (1.2.8 faz kilitli kare saati): sürekli harekette
      // karelerin tarayıcıya varış aralıkları ne kadar düzenli.
      const ara = await page.evaluate(async () => {
        const v = document.getElementById('video');
        if (!v.requestVideoFrameCallback || v.classList.contains('hidden')) return null;
        const ts = [];
        await new Promise((res) => { const t0 = performance.now(); const cb = (now, md) => { ts.push(md.receiveTime || md.expectedDisplayTime || now); if (performance.now() - t0 < 3000) v.requestVideoFrameCallback(cb); else res(); }; v.requestVideoFrameCallback(cb); });
        const d = ts.slice(1).map((t, i) => t - ts[i]).filter((x) => x > 0).sort((a, b) => a - b);
        if (d.length < 5) return { kare: ts.length };
        const m = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length);
        return { kare: ts.length, ortMs: +m.toFixed(1), sapmaMs: +sd.toFixed(1), p50: +d[d.length >> 1].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), enCok: +d.at(-1).toFixed(1) };
      });
      await tpg.evaluate(() => clearInterval(window.__sc));
      const avg = (k) => Math.round(perf.reduce((a, s) => a + (s?.[k] || 0), 0) / perf.length * 10) / 10;
      ok('sürekli hareketli ekranda akıcılık (≥25 fps)', avg('fps') >= 25, { fps: avg('fps'), kbps: avg('kbps'), kodlamaMs: avg('encMs'), kademe: perf.at(-1)?.perf });
      note('kare aralığı (yakalama zamanlaması, sürekli kaydırmada tarayıcıya varış)', ara);
      note('kontrol kanalı gidiş-dönüş', `${await page.evaluate(() => app.rtt)} ms`);
    });
    // 1.2.8: büyük bir değişiklikten sonra netleştirme, kodlayıcının bildirdiği
    // kaliteye bakarak hedefe ulaşana kadar sürer (en çok 3 sn). 📶 "Netleştirme":
    // "<neden> · <kare> kare · RF <son> (hedef <hedef>)"; neden hedef/boş = ulaştı.
    await step('netleştirme', async () => {
      await sleep(1500);
      const once = (await statsOf(page))?.netl;
      const f0 = await frameCounter(page);
      await tpg.evaluate(() => window.yogunDesen(true));
      const t0 = Date.now(), seri = [];
      while (Date.now() - t0 < 7000) {
        await sleep(400);
        const s = await statsOf(page);
        if (s && s.netl !== seri.at(-1)?.netl) seri.push({ ms: Date.now() - t0, netl: s.netl, fps: s.fps, kbps: s.kbps });
      }
      const kare = (await frameCounter(page)) - f0;
      await page.screenshot({ path: path.join(OUT, 'yerel-netlestirme.png') });
      await tpg.evaluate(() => window.yogunDesen(false));
      // Aynı ekranda dize öncekiyle birebir aynı olabilir ("hedef · 3 kare · RF 21.0"): değişiklikten
      // sonra kare gelmiş olması ve son netleştirmenin hedef/boş ile bitmesi aranır.
      const son = seri.at(-1)?.netl || '';
      ok('netleştirme: ince yazılı tam ekran değişiklikten sonra kalite hedefine ulaştı (📶 "Netleştirme")', kare > 0 && /^(hedef|boş) ·/.test(son), { once, seri, kare });
    });
    const caps = await page.evaluate(() => app.caps);
    note('yetenekler', caps);
    await step('gecikme', async () => {
      ({ pg: tpg } = await target());
      await resetTarget(tpg);
      // Klavye testinden kalan odak: yanıp sönen imleç ekranı durgun bırakmaz.
      await tpg.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await sleep(500);
      // Ölçüm, çözünürlük/ölçek değişiklikleri (Edge pencerelerini yeniden
      // yerleştirip işlemciyi dakikalarca zorlar) başlamadan yapılır; yine de ajanın
      // performans kademesi 0'a dönsün ki işlemci yükünü değil gecikmeyi ölçelim.
      // Önceki adımın sürekli hareketi bitsin: ajan iki ardışık saniye boyunca hiç
      // kare göndermemiş (ekran durgun) ve performans kademesi 0 olsun.
      let idle = 0;
      const calm = await waitFor(async () => {
        const st = await page.evaluate(() => app.agentStats);
        idle = st && st.perf === 0 && st.fps <= 1 ? idle + 1 : 0;
        return idle >= 2 && st;
      }, 30000, 1000);
      note('gecikme ölçümü öncesi ajan durumu', calm || (await page.evaluate(() => app.agentStats)));
      const r = await measureLatency(page, tpg, 15);
      note('girdi → görüntü gecikmesi (aynı makine, doğrudan WebRTC)', r);
      ok('girdi → görüntü gecikmesi ölçüldü ve 150 ms altında (ortanca)', r.olcumler.length >= 10 && r.ortanca < 150, r);
    });
    await step('gizlilik kipi', async () => {
      if (!caps.privacy) return ok('gizlilik kipi destekleniyor', false, 'caps.privacy=false');
      await page.evaluate(() => { window.__priv = null; app.session.addEventListener('ctl', (e) => { if (e.detail?.t === 'privacy') window.__priv = e.detail; }); app.session.sendCtl({ t: 'privacy', on: true }); });
      await sleep(2000);
      note('gizlilik: ajanın bildirdiği durum', await page.evaluate(() => window.__priv));
      const win = privacyWindow();
      ok('gizlilik: yerel ekranı kaplayan siyah pencere açıldı ve ekran yakalamadan dışlandı', /görünür=True/.test(win) && /0x11/.test(win), win);
      const redP = await centerOf(tpg, '#red');
      ok('gizlilik: uzaktan görüntü kararmadı', near(await pixel(page, redP.x, redP.y), [229, 57, 53]), await pixel(page, redP.x, redP.y));
      await resetTarget(tpg);
      const [cx, cy] = await toClient(page, tapC.x, tapC.y);
      await page.mouse.click(cx, cy);
      ok('gizlilik: Köprü\'nün tıklaması alttaki programa geçiyor', !!(await waitFor(() => tpg.evaluate(() => ev.some((e) => e.t === 'mousedown')), 4000)));
      const [kx, ky] = await toClient(page, taC.x, taC.y); await page.mouse.click(kx, ky); await page.keyboard.type('gizli'); await sleep(700);
      ok('gizlilik: Köprü\'nün klavyesi alttaki programa geçiyor', (await tstate(tpg)).ta === 'gizli', (await tstate(tpg)).ta);
      await page.evaluate(() => app.session.sendCtl({ t: 'privacy', on: false }));
      await sleep(1500);
      ok('gizlilik kapatılınca siyah pencere kalktı', /yok/.test(privacyWindow()));
    });
    await step('çözünürlük', async () => {
      if (!caps.modes) return note('çözünürlük', 'tek mod — seçenek gizli');
      await page.evaluate(() => app.session.sendCtl({ t: 'modes' }));
      const m = await waitFor(() => page.evaluate(() => app.modes), 5000);
      note('desteklenen çözünürlükler', m?.modes?.map((x) => `${x.w}x${x.h}`));
      const before = await remoteSize(page);
      const alt = m?.modes?.find((x) => x.w !== m.cur.w && x.w >= 1024 && x.w <= 1920) || m?.modes?.find((x) => x.w !== m.cur.w);
      if (!alt) return note('çözünürlük', 'başka mod yok');
      await page.evaluate(([w, h]) => app.session.sendCtl({ t: 'mode', w, h }), [alt.w, alt.h]);
      const changed = await waitFor(async () => { const s = await remoteSize(page); return s.w === alt.w && s.h === alt.h ? s : null; }, 20000);
      await page.screenshot({ path: path.join(OUT, 'cozunurluk-degisti.png') });
      await page.evaluate(() => app.session.sendCtl({ t: 'mode', w: 0, h: 0 }));
      const back = await waitFor(async () => { const s = await remoteSize(page); return s.w === before.w && s.h === before.h ? s : null; }, 20000);
      ok('çözünürlük değiştirme ve geri alma (gerçek monitör)', !!changed && !!back, { once: before, hedef: alt, sonra: back });
      await sleep(1500);
      ({ pg: tpg } = await target());
      await tpg.reload(); await sleep(1200);
    });
    await step('yazı ölçeği', async () => { ({ pg: tpg } = await target()); await scaleScenario(page, 'yerel'); ({ pg: tpg } = await target()); await tpg.reload(); await sleep(1200); });
    await step('ses', async () => {
      if (!caps.audio) return note('ses', 'ajan ses yeteneği bildirmedi');
      const logAt = logOf(home).length;
      tonBaslat(3);
      await page.evaluate(() => { window.__aud = null; app.session.addEventListener('ctl', (e) => { if (e.detail?.t === 'audio') window.__aud = e.detail; }); app.session.sendCtl({ t: 'audio', on: false }); });
      await sleep(500);
      await page.evaluate(() => app.session.sendCtl({ t: 'audio', on: true }));
      const a = await waitFor(() => page.evaluate(() => window.__aud), 8000);
      const aygit = sesAygitlari();
      if (!a?.on) {
        tonDurdur();
        note('ses: ATLANDI — Windows\'ta ses aygıtı yok', { ajan: a, aygit, buton: await page.evaluate(() => document.getElementById('tb-audio').title) });
        ok('ses aygıtı yokken bağlantı sorunsuz sürüyor', (await liveFrames(page, tpg, 1500)) > 10);
        return;
      }
      // Masaüstü tarayıcı: WebRTC ses izi. 10 ms Opus → saniyede ~100 paket.
      const say = () => page.evaluate(async () => { let o = null; (await app.session.pc.getStats()).forEach((x) => { if (x.type === 'inbound-rtp' && x.kind === 'audio') o = { p: x.packetsReceived || 0, e: x.totalAudioEnergy || 0, gizlenen: x.concealedSamples || 0, t: x.timestamp }; }); return o; });
      await sleep(1500);
      const s0 = await say(); await sleep(3000); const s1 = await say();
      const pps = s0 && s1 ? Math.round((s1.p - s0.p) / ((s1.t - s0.t) / 1000)) : 0;
      const log = logOf(home).slice(logAt);
      const yol = logLines(log, /ses yakalama:|ses aktarımı başladı|ses yakalanamıyor/);
      ok('ses: Windows sesi (WASAPI geri döngü) masaüstü tarayıcısına akıyor', pps > 30, { paketSn: pps, once: s0, sonra: s1, aygit });
      ok('ses: 10 ms Opus (saniyede ~100 paket)', pps >= 80 && pps <= 125, { paketSn: pps });
      note('ses: sinyal (ton çalıyor; enerji artışı)', s0 && s1 ? +(s1.e - s0.e).toFixed(4) : null);
      ok('ses: WASAPI olay güdümlü yakalama kuruldu (günlük)', yol.some((l) => /ses yakalama: olay güdümlü/.test(l)), yol.length ? yol : 'günlükte ses yakalama satırı yok');
      tonDurdur();
    });
    await step('uyku engeli', async () => {
      const req = ps('powercfg /requests | Out-String');
      ok('prize takılıyken uyku engeli (powercfg /requests)', /kopru/i.test(req), req.replace(/\s+/g, ' ').slice(0, 300));
    });
  }

  // ---- iPhone emülasyonu (Edge): tek parmak = gerçek Windows dokunuşu ----
  const mctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] });
  const m = await mctx.newPage();
  const mc = await connectClient(m, URL0, cfg.id, cfg.autoPassword, 45000, { oneriYok: true });
  ok('iPhone (emülasyon) bağlandı', mc.ok, `${mc.ms} ms ${mc.err}`);
  if (mc.ok) {
    await sleep(1500);
    const touch = await touchApi(mctx, m);
    const tapC = await centerOf(tpg, '#tap');
    // 1.2.6+: Apple cihazında görüntü doğrudan bağlantının veri kanalından gelir,
    // WebCodecs ile tuvale çizilir; RTP görüntüsü boş kalır.
    await step('iPhone görüntü yolu', async () => {
      const y = await goruntuYolu(m);
      ok('iPhone (emülasyon): görüntü veri kanalından + WebCodecs, RTP görüntüsü boş', y.veriKanali && !y.video && (y.cozulen || 0) > 0 && (!y.rtp || y.rtp.kare === 0), y);
    });
    // 1.2.7/1.2.8: ses "aud" veri kanalından (sira16), AudioWorklet çalıcı.
    await step('iPhone ses yolu', async () => {
      if (!(await m.evaluate(() => app.caps?.audio))) return note('iPhone (emülasyon): ses', 'ajan ses yeteneği bildirmedi');
      tonBaslat(2);
      await m.evaluate(() => { window.__ap = 0; app.session.addEventListener('dcaudio', () => window.__ap++); app.session.sendCtl({ t: 'audio', on: true }); });
      await sleep(3000);
      const r = await m.evaluate(async () => { const n0 = window.__ap; await new Promise((x) => setTimeout(x, 3000)); const a = app.session.dc?.aud; return { kanal: a ? { protokol: a.protocol, durum: a.readyState, sirali: a.ordered, yeniden: a.maxRetransmits } : null, paketSn: Math.round((window.__ap - n0) / 3), acik: app.audioOn, hata: app.audioErr, calici: app.audio.wl, baglam: app.audio.ctx?.state, durumu: app.audio.stats(), not: app.audioNote() }; });
      tonDurdur();
      if (!r.acik) return note('iPhone (emülasyon) ses: ATLANDI — Windows\'ta ses aygıtı yok', r);
      ok('iPhone (emülasyon): ses "aud" veri kanalından (sira16, sırasız, yeniden gönderimsiz), 10 ms paket', r.kanal?.protokol === 'sira16' && r.kanal?.sirali === false && r.paketSn >= 80 && r.paketSn <= 125, r);
      ok('iPhone (emülasyon): AudioWorklet çalıcısı (ses-isleyici.js) çalışıyor, tampon ölçülüyor', r.calici === true && r.baglam === 'running' && r.durumu && r.durumu.pkts > 50 && r.durumu.target > 0, r);
    });
    await step('dokunuş', async () => {
      await resetTarget(tpg);
      const [x, y] = await toClient(m, tapC.x, tapC.y);
      await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []);
      const pd = await waitFor(() => tpg.evaluate(() => ev.filter((e) => e.t === 'pointerdown')).then((a) => (a.length ? a : null)), 4000);
      ok('tek parmak dokunuş Windows\'a ulaştı', !!pd, pd?.[0]);
      ok('dokunuş gerçek Windows dokunmatiği olarak geldi', pd && pd[0].pt === 'touch', pd?.[0]?.pt);
      ok('dokunuş doğru noktada', pd && Math.abs(pd[0].x * dpr - tapC.x) <= 6 * dpr && Math.abs(pd[0].y * dpr - tapC.y) <= 6 * dpr, { beklenen: tapC, gelen: pd?.[0] });
    });
    await step('uzun basma', async () => {
      await resetTarget(tpg);
      const [x, y] = await toClient(m, tapC.x, tapC.y);
      await touch('touchStart', [[x, y]]); await sleep(1700); await touch('touchEnd', []);
      const cm = await waitFor(() => tpg.evaluate(() => ev.some((e) => e.t === 'contextmenu')), 4000);
      ok('uzun basma = sağ tık', !!cm, await tpg.evaluate(() => ev.map((e) => e.t + ':' + (e.pt || '')).slice(-6)));
      await m.keyboard.press('Escape').catch(() => {});
    });
    await step('tek parmak kaydırma', async () => {
      await resetTarget(tpg);
      const sc = await centerOf(tpg, '#scroll');
      const [x, y] = await toClient(m, sc.x, sc.y + 120);
      await touch('touchStart', [[x, y]]);
      for (let i = 1; i <= 15; i++) { await touch('touchMove', [[x, y - i * 14]]); await sleep(16); }
      await touch('touchEnd', []);
      await sleep(1500);
      const s = (await tstate(tpg)).scroll;
      ok('tek parmakla kaydırma uzak sayfayı kaydırdı', s > 50, `scrollTop ${s}`);
    });
    await step('iki parmak yakınlaştırma', async () => {
      await resetTarget(tpg);
      const r = await m.evaluate(() => { const b = document.getElementById('canvas').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await touch('touchStart', [[r.x - 40, r.y], [r.x + 40, r.y]]);
      for (let i = 1; i <= 10; i++) { await touch('touchMove', [[r.x - 40 - i * 12, r.y], [r.x + 40 + i * 12, r.y]]); await sleep(16); }
      await touch('touchEnd', []);
      await sleep(600);
      const z = await m.evaluate(() => app.input.zoom.s);
      const remote = await tpg.evaluate(() => ev.filter((e) => e.t === 'pointerdown').length);
      ok('iki parmakla sıkıştırma telefonda yakınlaştırdı, Windows\'a dokunuş gitmedi', z > 1.5 && remote === 0, { zoom: z, uzakDokunus: remote });
      await m.evaluate(() => app.input.resetZoom());
    });
    // ---- 1.2.8 dokunma deneyimi (Windows tarafında olayla doğrulanır) ----
    await step('iki parmakla kaydırma parmakların altına', async () => {
      await resetTarget(tpg);
      // Önce soldaki kutuya dokun: Windows imleci orada kalır. Eski (konumsuz)
      // tekerlek imlecin altını, yani soldaki kutuyu kaydırırdı.
      const [x0, y0] = await toClient(m, tapC.x, tapC.y);
      await touch('touchStart', [[x0, y0]]); await sleep(40); await touch('touchEnd', []);
      await sleep(500);
      await tpg.evaluate(() => { ev.length = 0; });
      const sent = [];
      await m.evaluate(() => { window.__in = []; const o = app.session.sendIn.bind(app.session); app.session.sendIn = (b) => { window.__in.push([...new Uint8Array(b)]); return o(b); }; });
      const sc = await centerOf(tpg, '#scroll');
      const [x, y] = await toClient(m, sc.x, sc.y);
      await touch('touchStart', [[x - 30, y + 40], [x + 30, y + 40]]);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', [[x - 30, y + 40 - i * 10], [x + 30, y + 40 - i * 10]]); await sleep(16); }
      await touch('touchEnd', []);
      await sleep(1500);
      sent.push(...(await m.evaluate(() => window.__in.filter((b) => b[0] === 3))));
      const w = await tpg.evaluate(() => ev.filter((e) => e.t === 'wheel'));
      const s = (await tstate(tpg)).scroll;
      ok('iki parmakla kaydırma: tekerlek iletisi konumlu (9 bayt), Windows\'ta parmakların altındaki alan kaydı', sent.length > 0 && sent.every((b) => b.length === 9) && w.length > 0 && w.every((e) => e.id === 'scroll') && s > 0,
        { ileti: sent.length, boylar: [...new Set(sent.map((b) => b.length))], tekerlek: w.length, hedefler: [...new Set(w.map((e) => e.id))], scrollTop: s, ilkTekerlek: w[0] });
    });
    await step('çift dokunuş yakalama', async () => {
      for (const mod of ['tablet', 'direct']) {
        await m.evaluate((md) => app.setMode(md), mod);
        await resetTarget(tpg);
        await sleep(400);
        const d = await centerOf(tpg, '#dbl');
        const [x, y] = await toClient(m, d.x, d.y);
        await touch('touchStart', [[x, y]]); await sleep(50); await touch('touchEnd', []);
        await sleep(120);
        await touch('touchStart', [[x + 9, y + 5]]); await sleep(50); await touch('touchEnd', []);
        await sleep(1200);
        const e = await tpg.evaluate(() => ({ basis: ev.filter((x) => x.t === 'pointerdown').map((x) => [x.x, x.y, x.pt]), cift: ev.filter((x) => x.t === 'dblclick').map((x) => x.id), renk: window.state().dbl }));
        const ayni = e.basis.length >= 2 && e.basis[0][0] === e.basis[1][0] && e.basis[0][1] === e.basis[1][1];
        ok(`çift dokunuş (${mod}): 9 px aralı ikinci dokunuş ilkinin noktasına oturdu`, ayni, e);
        if (mod === 'direct') ok('çift dokunuş (Doğrudan): Windows\'taki programda gerçek çift tık (dblclick)', e.cift.includes('dbl'), e);
        else note('çift dokunuş (Tablet): Windows dokunmatik çift dokunuşu programa çift tık olarak verdi mi', e.cift.includes('dbl') ? 'evet (dblclick)' : 'hayır (Chromium dokunmatik çift dokunuşu dblclick yapmayabilir)');
      }
      await m.evaluate(() => app.setMode('tablet'));
    });
    await step('büyüteç', async () => {
      await resetTarget(tpg);
      const r = await centerOf(tpg, '#red');
      const [x, y] = await toClient(m, r.x, r.y);
      await touch('touchStart', [[x, y]]); await sleep(120);
      const erken = await m.evaluate(() => app.input.fx.loupeShown);
      await sleep(350);
      const st = await m.evaluate(() => { const c = document.querySelector('.loupe'); const p = [...c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data.slice(0, 3)]; const b = c.getBoundingClientRect(); return { acik: app.input.fx.loupeShown, gorunur: c.classList.contains('on'), merkez: p, kutu: [Math.round(b.left), Math.round(b.top), Math.round(b.width)] }; });
      await m.screenshot({ path: path.join(OUT, 'yerel-iphone-buyutec.png') });
      await touch('touchEnd', []); await sleep(300);
      const kapandi = !(await m.evaluate(() => app.input.fx.loupeShown));
      await m.evaluate(() => app.input.tap(0x01)).catch(() => {}); // basılı tutmadan açılan menü varsa Esc
      ok('büyüteç: parmak durunca açıldı (120 ms\'de değil, 470 ms\'de), ortası parmağın altındaki rengi gösteriyor, kalkınca kapandı', !erken && st.acik && st.gorunur && near(st.merkez, [229, 57, 53], 60) && kapandi, { erken, ...st, kapandi });
    });
    await step('üç parmakla klavye', async () => {
      await resetTarget(tpg);
      const r = await m.evaluate(() => { const b = document.getElementById('canvas').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.6 }; });
      const uc = [[r.x - 70, r.y], [r.x, r.y], [r.x + 70, r.y]];
      await touch('touchStart', uc); await sleep(120); await touch('touchEnd', []);
      await sleep(500);
      const acildi = await m.evaluate(() => document.activeElement === app.input.sink);
      await touch('touchStart', uc); await sleep(120); await touch('touchEnd', []);
      await sleep(500);
      const kapandi = await m.evaluate(() => document.activeElement !== app.input.sink);
      const uzak = await tpg.evaluate(() => ev.filter((e) => /pointerdown|mousedown|contextmenu/.test(e.t)).length);
      ok('üç parmakla dokunma klavyeyi açtı ve kapattı, Windows\'a tık gitmedi', acildi && kapandi && uzak === 0, { acildi, kapandi, uzakOlay: uzak });
      await m.evaluate(() => app.input.hideKeyboard());
    });
    await step('iki istemci aynı anda', async () => {
      const a0 = c.ok ? await frameCounter(page) : 0;
      const n1 = await liveFrames(m, tpg, 3000);
      const n2 = c.ok ? (await frameCounter(page)) - a0 : 1;
      ok('iki cihaz aynı anda bağlı, ikisine de görüntü akıyor', n1 > 20 && n2 > 20, { telefon3sn: n1, bilgisayar3sn: n2, telefonAjan: await statsOf(m), bilgisayarAjan: c.ok ? await statsOf(page) : null });
    });
    await m.screenshot({ path: path.join(OUT, 'yerel-iphone-emulasyon.png') });
  }
  await m.evaluate(() => app.disconnect()).catch(() => {}); // kullanıcı gibi "bağlantıyı kes" (geçmişe hemen yazılır)
  await mctx.close();
  await page.evaluate(() => app.disconnect()).catch(() => {});
  await ctx.close();
  await browser.close();

  await step('H.264 çözemeyen tarayıcı', async () => {
    const cb = await chromium.launch({ headless: true });
    const cpg = await (await cb.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
    const h264 = await cpg.evaluate(() => RTCRtpReceiver.getCapabilities('video').codecs.some((x) => /h264/i.test(x.mimeType))).catch(() => null);
    const cc = await connectClient(cpg, URL0, cfg.id, cfg.autoPassword);
    // Ya tünel aktarımıyla bağlanmalı ya da açık bir uyarı göstermeli (takılmamalı).
    ok('H.264 çözemeyen tarayıcıda takılma yok (bağlandı ya da açıkça uyardı)', cc.ok || /H\.264/.test(cc.err), { webrtcH264: h264, aktarim: cc.ok ? await kindOf(cpg) : '', mesaj: cc.err });
    await cb.close();
  });
  await step('bağlantı geçmişi', async () => {
    // Pencere aniden kapanan oturumu ajan bağlantı zaman aşımıyla birkaç saniyede fark eder.
    const h = (await waitFor(async () => { const x = (await ui('/api/state')).history || []; return x.length >= 2 && x; }, 30000, 1000)) || (await ui('/api/state')).history || [];
    ok('bağlantı geçmişi kaydediliyor', h.length >= 2, h.slice(0, 3).map((x) => `${x.who} ${x.secs}sn ${x.conn}`));
  });
}

// ======================= 1b) DOKUNUŞ KALİBRASYONU (%150) =======================
// Kullanıcı oturumunda ajan (yerel aşamanın kimliğiyle). Denetim bağlantısı
// (masaüstü Edge) ekranı 1920×1080'e ve Windows ölçeğini %150'ye alır; ayrı
// iPhone benzetimi bağlantıları noktalara dokunur. Sonra ajan, Windows'un
// dokunuşu 150 px yukarı koymasını taklit eden test kancasıyla
// (KOPRU_TEST_DOKUNUS_KAYMA) yeniden başlatılır: kapalı döngünün fareye geçtiği
// ve sonraki dokunuşların yerine oturduğu gerçek Windows'ta sınanır. En sonda GPU
// ile küçültme: varsayılan kapalı, KOPRU_GPU=1 ile (yazılım bağdaştırıcısı) denenir.
// yerelAjan kullanıcı oturumunda (yerel aşamanın kimliğiyle) sunucu + ajan başlatır;
// ajanBaslat(env) ajanı verilen ortam değişkenleriyle yeniden başlatır.
async function yerelAjan() {
  const home = path.join(WORK, 'home');
  const SRV = `http://127.0.0.1:${YEREL_PORT}`;
  if (!fs.existsSync(path.join(home, 'agent.json'))) { ok(`${PHASE}: yerel aşamanın ajan kaydı var`, false, 'agent.json yok'); return null; }
  ps('Get-Process kopru -ErrorAction SilentlyContinue | Stop-Process -Force');
  run(['server', '--addr', `127.0.0.1:${YEREL_PORT}`, '--turn-port', '0', '--data', path.join(WORK, 'srv')]);
  await waitFor(() => fetch(`${SRV}/healthz`).then((r) => r.ok), 30000);
  let agent = null;
  const ajanBaslat = async (env = {}) => {
    if (agent) { try { agent.kill(); } catch {} await waitFor(() => agent.exitCode !== null || agent.signalCode !== null, 10000, 200); await sleep(1500); }
    agent = run(['agent', '--server', SRV, '--name', 'Canli-Windows'], { KOPRU_HOME: home, ...env });
    await sleep(3000);
    return waitFor(() => { const c = JSON.parse(fs.readFileSync(path.join(home, 'agent.json'), 'utf8')); return c.id && c.autoPassword ? c : null; }, 60000);
  };
  return { home, SRV, URL0: SRV + '/', ajanBaslat };
}

async function kalibrasyon() {
  const y = await yerelAjan();
  if (!y) return;
  const { URL0, ajanBaslat } = y;
  let cfg = await ajanBaslat();
  ok('kalibrasyon: ajan başladı', !!cfg, cfg?.id || '');
  if (!cfg) return;
  let { pg: tpg } = await target();
  await tpg.reload(); await sleep(800);
  const browser = await edge();
  // denetim bağlantısı: ekranı ve ölçeği değiştirir (bitince ajan geri alır)
  const denetim = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const kp = await ctx.newPage();
    kp.on('pageerror', (e) => console.log('  [denetim istemci hata]', e.message));
    let c = { ok: false };
    for (let i = 0; i < 3 && !c.ok; i++) { if (i) await sleep(3000); c = await connectClient(kp, URL0, cfg.id, cfg.autoPassword); }
    return { ctx, kp, c };
  };
  let d = await denetim();
  ok('kalibrasyon: denetim bağlantısı', d.c.ok, `${d.c.ms} ms ${d.c.err}`);
  if (!d.c.ok) { await browser.close(); return; }

  // A) %100 ve %150 ölçümü (kullanıcı oturumundaki ajan)
  await step('kalibrasyon ölçümü', async () => {
    const res = await kalibrasyonOlc(browser, d.kp, URL0, cfg.id, cfg.autoPassword, 'kullanıcı oturumu (kopru agent)');
    kalRapor(res, 'kalibrasyon-yerel.json', 'kalibrasyon (kullanıcı oturumu)');
  });
  // B) "Telefona göre büyüt" önerisi: 1920×1080'de iPhone'dan ilk bağlantıda kart çıkmalı.
  await step('öneri kartı (benzetim)', async () => {
    await d.kp.evaluate(() => app.session.sendCtl({ t: 'scale', pct: 0 }));
    await dprBekle(1);
    await sleep(1500);
    const s = await iphoneBaglan(browser, URL0, cfg.id, cfg.autoPassword, { oneriYok: false, deneme: 2 });
    if (!s.c.ok) { await s.ctx.close(); return ok('öneri kartı: iPhone benzetimi bağlandı', false, s.c.err); }
    const kart = await waitFor(() => s.m.evaluate(() => !document.getElementById('fitask').classList.contains('hidden') && document.getElementById('fitask-sub').textContent), 12000);
    await s.m.screenshot({ path: path.join(OUT, 'kalibrasyon-oneri-karti.png') });
    ok('"telefona göre büyüt" önerisi ilk bağlantıda çıktı (1920×1080, %100)', !!kart, kart || await s.m.evaluate(() => ({ olcek: app.scales, ekran: app.currentDisplay })));
    if (kart) {
      await s.m.click('#fitask-no').catch(() => {});
      const kayit = await s.m.evaluate(() => app.book.find((b) => b.id === app.session?.id)?.fit);
      ok('öneri: "Olduğu gibi kalsın" bu bilgisayar için kaydedildi, Windows değişmedi', kayit === false && Math.abs((await (await target()).pg.evaluate(() => devicePixelRatio)) - 1) < 0.01, { kayit });
    }
    await s.m.evaluate(() => app.disconnect()).catch(() => {});
    await s.ctx.close();
  });
  await d.kp.evaluate(() => { app.session.sendCtl({ t: 'scale', pct: 0 }); app.session.sendCtl({ t: 'mode', w: 0, h: 0 }); }).catch(() => {});
  await sleep(2500);
  await d.kp.evaluate(() => app.disconnect()).catch(() => {});
  await d.ctx.close();
  await hedefTamEkran();

  // C) Kapalı döngü: Windows'un dokunuşu 150 px yukarı koymasını taklit eden kanca.
  await step('kapalı döngü (kaydıran Windows taklidi)', async () => {
    cfg = await ajanBaslat({ KOPRU_TEST_DOKUNUS_KAYMA: '0,-150' });
    d = await denetim();
    if (!d.c.ok) return ok('kapalı döngü: denetim bağlantısı', false, d.c.err);
    await d.kp.evaluate(() => { app.modes = null; app.session.sendCtl({ t: 'modes' }); });
    await waitFor(() => d.kp.evaluate(() => app.modes), 6000);
    await d.kp.evaluate(() => app.session.sendCtl({ t: 'mode', w: 1920, h: 1080 }));
    await waitFor(async () => (await remoteSize(d.kp)).w === 1920, 20000);
    await sleep(1500);
    await hedefTamEkran();
    await d.kp.evaluate(() => app.session.sendCtl({ t: 'scale', pct: 150 }));
    const d15 = await dprBekle(1.5);
    await sleep(1500);
    // Ekranın üst kenarına taşmasın diye alt yarıdaki noktalar.
    const kal = (await (await target()).pg.evaluate(() => window.KAL)).map((p, i) => [i, p]).filter(([, p]) => p[1] >= 0.4);
    const t = await kalIphoneTur(browser, URL0, cfg.id, cfg.autoPassword, 'tablet', kal);
    const sw = t.rows.findIndex((r) => r.bildirim);
    const sonra = sw >= 0 ? t.rows.slice(sw + 1) : [];
    const ilk = t.rows.slice(0, Math.max(0, sw + 1));
    const res = { ortam: 'kullanıcı oturumu, KOPRU_TEST_DOKUNUS_KAYMA=0,-150', dpr: d15, turlar: { '%150 Tablet (kaydıran Windows)': { ...t, ozet: kalOzet(t.rows) } } };
    fs.writeFileSync(path.join(OUT, 'kalibrasyon-kapali-dongu.json'), JSON.stringify(res, null, 2));
    for (const r of t.rows) console.log('     ' + kalSatir(r));
    // Kapalı döngü imlecin dokunuşla taşınmasına dayanır; Windows imleci taşımıyorsa
    // ölçemez (bilgi). O durumda en azından yanlışlıkla fareye geçmemeli.
    const imlecTasindi = kalOzet(t.rows).imlec.tasindi > 0;
    if (!imlecTasindi && sw < 0) {
      note('kapalı döngü: Windows dokunuşta imleci taşımadığı için ölçüm yapılamadı (yanlış fareye geçiş yok)', { ilk: t.rows.slice(0, 3).map(kalSatir), hata: t.hata });
    } else {
      ok('kapalı döngü: kaydırılan dokunuşlar ölçüldü, en geç 2. dokunuşta fareye geçildi (telefona bildirim)', sw >= 0 && sw <= 1 && ilk.every((r) => r.tur === 'touch' && r.fark && Math.abs(r.fark[1] + 150) <= 20),
        { fareyeGecis: sw, ilk: ilk.map(kalSatir), bildirim: t.rows[sw]?.bildirim, hata: t.hata });
      ok('kapalı döngü: fareye geçtikten sonraki dokunuşlar hedefte (fare, ±12 px)', sonra.length >= 3 && sonra.every((r) => r.tur === 'mouse' && r.fark && Math.abs(r.fark[0]) <= KAL_TOL && Math.abs(r.fark[1]) <= KAL_TOL), sonra.map(kalSatir));
    }
    await d.kp.evaluate(() => { app.session.sendCtl({ t: 'scale', pct: 0 }); app.session.sendCtl({ t: 'mode', w: 0, h: 0 }); }).catch(() => {});
    await sleep(2500);
    await d.kp.evaluate(() => app.disconnect()).catch(() => {});
    await d.ctx.close();
  });

  await browser.close();
  // Bir adım yarıda kaldıysa ekran ayarı değişik kalmasın: ajan açılışta, önceki
  // çalışmanın geri alınamamış çözünürlük/ölçek değişikliğini geri alır.
  await ajanBaslat();
  await sleep(3000);
  await hedefTamEkran();
  note('kalibrasyon sonrası ekran', { ekran: ekranBoyutu(), dpr: await (await target()).pg.evaluate(() => devicePixelRatio).catch(() => null) });
}

// ======================= 1c) GPU İLE KÜÇÜLTME =======================
// Varsayılan kapalı olmalı (KOPRU_GPU yok); KOPRU_GPU=1 ile yazılım bağdaştırıcısında
// (bu sanal makinenin ekran kartı yok) açılıp ilk kare denetimini geçiyor mu, ya da
// temiz biçimde işlemciye dönüyor mu, çökmeden. Akış %50'ye küçültülür (küçültme yolu).
// Ayrı aşama: bir çökme kalibrasyon sonuçlarına karışmasın.
async function gpu() {
  const y = await yerelAjan();
  if (!y) return;
  const { home, URL0, ajanBaslat } = y;
  const browser = await edge();
  let cfg = null;
  const gpuDene = async (env, etiket) => {
    const logAt = logOf(home).length;
    cfg = await ajanBaslat(env);
    if (!cfg) return { baglanti: 'ajan başlamadı' };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await ctx.newPage();
    let c = { ok: false };
    for (let i = 0; i < 3 && !c.ok; i++) { if (i) await sleep(3000); c = await connectClient(p, URL0, cfg.id, cfg.autoPassword, 45000, { ayar: { scale: 0.5 } }); }
    if (!c.ok) { await ctx.close(); return { baglanti: c.err }; }
    await p.evaluate(() => { app.modes = null; app.session.sendCtl({ t: 'modes' }); });
    await waitFor(() => p.evaluate(() => app.modes), 6000);
    await p.evaluate(() => app.session.sendCtl({ t: 'mode', w: 1920, h: 1080 }));
    await waitFor(async () => (await p.evaluate(() => app.currentDisplay?.w)) === 1920, 20000);
    await sleep(2500);
    const { pg } = await target();
    await pg.reload(); await sleep(1200);
    const kare = await liveFrames(p, pg, 4000);
    const caps = [];
    for (let i = 0; i < 3; i++) { await sleep(1000); caps.push((await statsOf(p))?.cap); }
    const boyut = await remoteSize(p);
    const renk = await p.evaluate(() => { const v = document.getElementById('video'); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0); return [...g.getImageData(Math.round(0.08 * c.width), Math.round(0.07 * c.height), 1, 1).data.slice(0, 3)]; }).catch(() => null);
    await p.screenshot({ path: path.join(OUT, `gpu-${etiket}.png`) });
    await p.evaluate(() => app.session.sendCtl({ t: 'mode', w: 0, h: 0 })).catch(() => {});
    await sleep(2000);
    await p.evaluate(() => app.disconnect()).catch(() => {});
    await ctx.close();
    const gl = logLines(logOf(home).slice(logAt), /ekran kartında küçültme/);
    return { kare, caps: [...new Set(caps)], boyut, renk, gunluk: gl, cokme: logLines(logOf(home).slice(logAt), /panic|fatal error/) };
  };
  await step('GPU varsayılan kapalı', async () => {
    const r = await gpuDene({}, 'kapali');
    note('GPU ile küçültme (KOPRU_GPU yok)', r);
    ok('GPU ile küçültme varsayılan olarak kapalı (küçültülmüş akışta yakalama "dxgi", günlükte "açık" yok)', r.kare > 5 && !(r.caps || []).some((c) => /GPU/.test(c || '')) && !(r.gunluk || []).some((l) => /açık/.test(l)), r);
  });
  await step('GPU KOPRU_GPU=1', async () => {
    const r = await gpuDene({ KOPRU_GPU: '1' }, 'acik');
    const g = r.gunluk || [];
    const durum = g.some((l) => /açık/.test(l)) ? 'açıldı ve ilk kare denetimini geçti' : g.some((l) => /kapatıldı/.test(l)) ? 'denendi, kapatıldı (işlemciye dönüldü)' : 'günlükte iz yok (denenmedi)';
    note(`KOPRU_GPU=1 (yazılım bağdaştırıcısı): ${durum}`, r);
    ok('KOPRU_GPU=1: görüntü akıyor, renk doğru, çökme yok (GPU açılsa da kapansa da)', r.kare > 5 && near(r.renk, [229, 57, 53], 45) && !r.cokme?.length, r);
  });
  await browser.close();
  await ajanBaslat(); // yarıda kalan çözünürlük değişikliği varsa geri alınsın (bkz. kalibrasyon)
  await sleep(3000);
}

// ======================= 2) ÇİFT TIKLA KURULUM =======================
async function kur() {
  ps('Get-Process kopru -ErrorAction SilentlyContinue | Stop-Process -Force');
  await sleep(1500);
  note('kurulumdan önce hizmet', ps('(Get-Service Kopru -ErrorAction SilentlyContinue).Status') || 'yok');
  // Kullanıcının yaptığı: indirilen kopru.exe'yi çift tıklamak (argümansız, yönetici onayıyla).
  run([], {});
  const svc = await waitFor(() => { const o = ps('(Get-Service Kopru -ErrorAction SilentlyContinue).Status'); return /Running/.test(o) ? o : null; }, 120000, 2000);
  ok('çift tıklayınca kendini Windows hizmeti olarak kurdu ve başlattı', !!svc, svc || ps('Get-Service *kopru* | Out-String'));
  const pf = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Kopru');
  const files = fs.existsSync(pf) ? fs.readdirSync(pf) : [];
  ok('program dosyaları kuruldu (kopru.exe, x264, opus)', files.includes('kopru.exe') && files.some((f) => /x264/i.test(f)) && files.includes('opus.dll'), files);
  ok('güvenlik duvarı kuralı eklendi', /Kopru|Köprü/i.test(ps('netsh advfirewall firewall show rule name="Köprü" | Out-String')));
  ok('Başlat menüsü kısayolu oluşturuldu', fs.existsSync(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs', 'Köprü.url')));
  const cfg = await waitFor(() => { const c = JSON.parse(fs.readFileSync(path.join(PD, 'agent.json'), 'utf8')); return c.id ? c : null; }, 60000);
  ok('hizmet kimlik aldı', !!cfg, cfg?.id);
  note('Köprü süreçleri', ps('Get-Process kopru -IncludeUserName -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) oturum=$($_.SessionId) $($_.UserName)" } | Out-String'));
  const opened = await waitFor(() => /msedge|chrome/i.test(ps("Get-Process msedge,chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -notlike '*ms-playwright*' } | Select-Object -First 1 -ExpandProperty Name")), 25000, 1000);
  ok('ilk açılışta ayar sayfası (kimlik, parola, iPhone QR) tarayıcıda açıldı', !!opened);
  await sleep(4000);
  desktopShot('kurulum-sonrasi-ayar-sayfasi.png');
  closeStrayBrowsers();
  const ui = await waitFor(() => (fs.existsSync(path.join(PD, 'ui.url')) ? uiHelper(PD) : null), 30000);
  const st = await ui('/api/state');
  ok('ayar sayfası kimlik ve otomatik parolayı gösteriyor', !!st.id && !!st.password, { id: st.id, parolaVar: !!st.password });
  // Kullanıcının "Kendi parolanızı belirleyin" alanından parola koyması.
  await ui('/api/password', { password: PW });
  const st2 = await ui('/api/state');
  ok('kendi parolasını belirledi (artık sayfada gösterilmiyor)', st2.customPassword === true && !st2.password);
}

// ======================= 3) HİZMET + GERÇEK YOL =======================
async function hizmet() {
  const cfg = JSON.parse(fs.readFileSync(path.join(PD, 'agent.json'), 'utf8'));
  const ui = uiHelper(PD);
  const st = await waitFor(async () => { const s = await ui('/api/state'); return s.publicUrl ? s : null; }, 120000, 2000);
  ok('sunucusuz: Cloudflare tüneli açıldı', !!st, st ? st.publicUrl : '');
  if (!st) return;
  let { pg: tpg } = await target();
  await tpg.reload(); await sleep(800);
  const U = 'http://127.0.0.1:21881/';
  const browser = await edge();

  // A) Doğrudan WebRTC (adres ilan panosundan bulunur)
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:21881' });
  let page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [istemci hata]', e.message));
  let c = await connectClient(page, U, cfg.id, PW, 60000);
  ok('hizmet: ilan panosundan bulup bağlandı', c.ok, `${c.ms} ms ${c.ok ? await kindOf(page) : c.err}`);
  if (c.ok) {
    await sleep(2500);
    await step('hizmet yakalama', async () => {
      const p = await centerOf(tpg, '#red'); const s = await statsOf(page);
      ok('hizmet (SYSTEM) kullanıcı masaüstünü yakalıyor', near(await pixel(page, p.x, p.y), [229, 57, 53]), { cap: s?.cap, enc: s?.enc });
    });
    await page.screenshot({ path: path.join(OUT, 'hizmet-webrtc.png') });
    const tapC = await centerOf(tpg, '#tap'), taC = await centerOf(tpg, '#ta');
    await step('hizmet fare', async () => {
      await resetTarget(tpg);
      const [hx, hy] = await toClient(page, tapC.x, tapC.y); await page.mouse.click(hx, hy);
      ok('hizmet: fare tıklaması (SYSTEM işçisinden)', !!(await waitFor(() => tpg.evaluate(() => ev.some((e) => e.t === 'mousedown')), 4000)));
    });
    await step('hizmet klavye', async () => {
      const [kx, ky] = await toClient(page, taC.x, taC.y); await page.mouse.click(kx, ky); await sleep(300);
      await page.keyboard.type('hizmet 42'); await sleep(700);
      await page.evaluate(() => app.input.sendText(' ÇŞ')); await sleep(700);
      ok('hizmet: klavye ve Türkçe metin', (await tstate(tpg)).ta === 'hizmet 42 ÇŞ', (await tstate(tpg)).ta);
    });
    await step('hizmet pano', async () => {
      ps(`Set-Clipboard -Value 'hizmet-pano-ĞÜ'`);
      const got = await waitFor(() => page.evaluate(() => app.clip.remote?.text), 8000);
      ok('hizmet: pano (kullanıcı oturumunun panosu)', got === 'hizmet-pano-ĞÜ', String(got));
    });
    await step('hizmet dosya', async () => {
      const roots = await page.evaluate(() => app.hello?.roots || []);
      ok('hizmet: dosya gezgini kullanıcının klasörlerini görüyor', roots.some((r) => r.k === 'downloads' && /runneradmin/i.test(r.p)), roots.map((r) => r.n + '=' + r.p));
    });
  }
  if (c.ok) await step('hizmet yazı ölçeği', async () => { await scaleScenario(page, 'hizmet'); ({ pg: tpg } = await target()); await tpg.reload(); await sleep(1200); });
  // Kullanıcının asıl kurulumu: hizmet (SYSTEM işçisi) + %150. Dokunuşlar Windows'ta nereye düşüyor?
  if (c.ok) {
    await step('hizmet kalibrasyon %150', async () => {
      try {
        const res = await kalibrasyonOlc(browser, page, U, cfg.id, PW, 'Windows hizmeti (SYSTEM işçisi, sunucusuz)', { yuzde100: false });
        kalRapor(res, 'kalibrasyon-hizmet.json', 'kalibrasyon (hizmet)');
      } finally {
        await page.evaluate(() => { app.session.sendCtl({ t: 'scale', pct: 0 }); app.session.sendCtl({ t: 'mode', w: 0, h: 0 }); }).catch(() => {});
        await dprBekle(1);
        await waitFor(async () => (await remoteSize(page)).w !== 1920, 20000);
        await sleep(1500);
        await hedefTamEkran();
      }
    });
    ({ pg: tpg } = await target()); await tpg.reload(); await sleep(1200);
  }
  await page.evaluate(() => app.disconnect()).catch(() => {});
  await ctx.close();

  // B) iPhone emülasyonu, SYSTEM işçisinden dokunmatik
  await step('hizmet dokunmatik', async () => {
    const mctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] });
    const m = await mctx.newPage();
    const mc = await connectClient(m, U, cfg.id, PW, 60000);
    if (!mc.ok) return ok('hizmet: iPhone emülasyonu bağlandı', false, mc.err);
    await sleep(1200);
    const touch = await touchApi(mctx, m);
    await resetTarget(tpg);
    const tapC = await centerOf(tpg, '#tap');
    const [x, y] = await toClient(m, tapC.x, tapC.y);
    await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []);
    const pd = await waitFor(() => tpg.evaluate(() => ev.filter((e) => e.t === 'pointerdown')).then((a) => (a.length ? a : null)), 4000);
    ok('hizmet: tek parmak dokunuş Windows\'a ulaştı', !!pd, pd?.[0]);
    note('hizmet: dokunuş türü', pd?.[0]?.pt === 'touch' ? 'gerçek dokunmatik' : pd ? 'fare (dokunmatik reddedildi, geri dönüş çalıştı)' : 'yok');
    await mctx.close();
  });

  // C) Gerçek Cloudflare tüneli üzerinden şifreli aktarım + tünel kopması
  ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  page = await ctx.newPage();
  c = await connectClient(page, U + '?transport=ws', cfg.id, PW, 60000);
  ok('hizmet: Cloudflare tüneli üzerinden şifreli aktarım', c.ok, `${c.ms} ms ${c.err}`);
  if (c.ok) {
    await sleep(2000);
    await step('tünel akış', async () => { const n = await liveFrames(page, tpg); ok('tünelde ekran değişince görüntü akıyor', n >= 15, `${n} kare / 2,5 sn, RTT ${await page.evaluate(() => app.rtt)} ms`); });
    await step('tünel tıklama', async () => {
      await resetTarget(tpg);
      const tapC = await centerOf(tpg, '#tap');
      const [hx, hy] = await toClient(page, tapC.x, tapC.y); await page.mouse.click(hx, hy);
      ok('tünelde fare tıklaması', !!(await waitFor(() => tpg.evaluate(() => ev.some((e) => e.t === 'mousedown')), 4000)));
    });
    await step('tünel gecikmesi', async () => {
      await resetTarget(tpg); await sleep(500);
      const r = await measureLatency(page, tpg, 12);
      note('girdi → görüntü gecikmesi (Cloudflare tüneli üzerinden, internet)', r);
      ok('tünel üzerinden girdi → görüntü gecikmesi ölçüldü', r.olcumler.length >= 8, r);
    });
    await page.screenshot({ path: path.join(OUT, 'hizmet-tunel.png') });
    await step('tünel adresi değişince', async () => {
      const oldUrl = (await ui('/api/state')).publicUrl;
      ps('Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force');
      const nu = await waitFor(async () => { const s = await ui('/api/state'); return s.publicUrl && s.publicUrl !== oldUrl ? s.publicUrl : null; }, 120000, 2000);
      note('yeni tünel adresi', nu || 'gelmedi');
      const back = await waitFor(async () => (await page.evaluate(() => app.session?.state === 'connected')) && (await liveFrames(page, tpg, 1200)) > 5, 150000, 3000);
      ok('tünel koptu, adres değişti → istemci kendiliğinden yeniden bağlandı', !!back, { eski: oldUrl, yeni: nu, durum: await page.evaluate(() => (app.session?.state || 'oturum yok') + ' | ' + document.getElementById('overlay-text').textContent) });
    });
  }
  await page.evaluate(() => app.disconnect()).catch(() => {});
  await ctx.close();

  // D) Hizmet yeniden başlatılırken süren oturum
  await step('hizmet yeniden başlatma', async () => {
    const x = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await x.newPage();
    const cc = await connectClient(p, U, cfg.id, PW, 60000);
    if (!cc.ok) return ok('yeniden başlatma öncesi bağlantı', false, cc.err);
    await sleep(1500);
    ps('Restart-Service Kopru -Force', 90000);
    const back = await waitFor(async () => (await p.evaluate(() => app.session?.state === 'connected')) && (await liveFrames(p, tpg, 1200)) > 5, 150000, 3000);
    ok('hizmet yeniden başlayınca ayar sayfası kendiliğinden açılmadı (ekranı kapatmıyor)', strayBrowsers() === 0, `${strayBrowsers()} tarayıcı penceresi`);
    ok('hizmet yeniden başlayınca istemci parola sormadan geri bağlandı', !!back, await p.evaluate(() => (app.session?.state || 'oturum yok') + ' | ' + document.getElementById('overlay-text').textContent + ' | ' + (document.getElementById('connect-err')?.textContent || '')));
    await p.screenshot({ path: path.join(OUT, 'hizmet-yeniden-baslatma.png') });
    await p.evaluate(() => app.disconnect()).catch(() => {});
    await x.close();
  });

  // E) İşçi süreç çökerse
  await step('işçi çökmesi', async () => {
    const pid = ps('(Get-Process kopru -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -ne 0 } | Select-Object -First 1).Id');
    ps(`Stop-Process -Id ${parseInt(pid, 10) || 0} -Force`);
    const again = await waitFor(() => { const o = ps('(Get-Process kopru -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -ne 0 } | Select-Object -First 1).Id'); return /^\d+$/.test(o) && o !== pid ? o : null; }, 60000, 2000);
    const online = await waitFor(async () => (await ui('/api/state').catch(() => ({}))).status === 'çevrimiçi' && (await ui('/api/state')).publicUrl, 90000, 2000);
    ok('işçi süreç çökünce hizmet onu yeniden başlattı, bilgisayar yine çevrimiçi', !!again && !!online, { eski: pid, yeni: again });
  });
  await browser.close();

  // iPhone işi için hazırlık. Ekran 1920×1080 (Windows burada yazı ölçeği seçenekleri
  // sunar: iPhone'da "telefona göre büyüt" önerisi çıkar, kabul edilince dokunuşlar
  // ölçekli Windows'ta ölçülür). Ses aygıtı varsa Windows'ta ton çalar (iPhone'un
  // ses yolu için). Hedefte yazı alanına odaklanılır (iPhone klavye testi).
  // Parola burada yazılmaz: iPhone işi başlayınca açık anahtarını yükler,
  // "sifrele" aşaması parolayı o anahtarla şifreler.
  const stNow = await ui('/api/state');
  closeStrayBrowsers();
  const ekr = ekranAyarla(1920, 1080);
  await sleep(3000);
  const tam = await hedefTamEkran();
  const sa = sesAygitlari();
  const sesVar = /aygıtlar=\[[^\]]+\]/.test(sa) && /Audiosrv=Running/.test(sa);
  if (sesVar) tonBaslat(45);
  ({ pg: tpg } = await target());
  await tpg.reload(); await sleep(1500);
  await tpg.bringToFront().catch(() => {});
  await resetTarget(tpg);
  await tpg.focus('#ta');
  ok('iPhone için hedef program ekranı tam kaplıyor (telefon testleri ekranın oranına dokunur)', !!tam?.ok, tam);
  const hazir = { id: cfg.id, name: stNow.name, url: stNow.publicUrl, ekran: ekranBoyutu(), ekranAyar: ekr, hedef: tam, ses: sesVar, dpr: await tpg.evaluate(() => devicePixelRatio) };
  note('iPhone aşaması için Windows', hazir);
  fs.writeFileSync(path.join(OUT, 'windows-hazir.json'), JSON.stringify(hazir));
}

// ======================= 3b) PAROLAYI iPHONE İÇİN ŞİFRELE =======================
// Parola günlüğe ya da artefakta düz yazılmaz; yalnızca iPhone işinin bu
// çalıştırmada ürettiği açık anahtarla (RSA-OAEP, SHA-256) şifrelenmiş hali gider.
async function sifrele() {
  const key = process.env.IPHONE_KEY;
  if (!key || !fs.existsSync(key)) return note('iPhone anahtarı', 'yok — iPhone işi başlamadı ya da anahtarını yüklemedi');
  const pwEnc = crypto.publicEncrypt({ key: fs.readFileSync(key), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(PW)).toString('base64');
  fs.writeFileSync(path.join(OUT, 'windows-parola.json'), JSON.stringify({ pwEnc }));
  ok('hizmet parolası iPhone işinin açık anahtarıyla şifrelendi', true);
}

// ======================= 4) iPHONE'U BEKLE =======================
async function bekle() {
  const run = process.env.GITHUB_RUN_ID, repo = process.env.GITHUB_REPOSITORY, tok = process.env.GH_TOKEN;
  const H = { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' };
  const t0 = Date.now(); let done = !run; // GitHub dışında (yerel deneme) beklenmez
  while (!done && Date.now() - t0 < 40 * 60 * 1000) {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run}/artifacts?per_page=100`, { headers: H }).then((x) => x.json());
      if ((r.artifacts || []).some((a) => a.name === 'iphone-bitti')) { done = true; break; }
      const j = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run}/jobs`, { headers: H }).then((x) => x.json());
      if ((j.jobs || []).some((x) => x.name === 'iphone' && x.status === 'completed')) { done = true; break; }
    } catch (e) { console.log('bekleme:', e.message); }
    await sleep(15000);
  }
  note('iPhone işi', done ? 'bitti' : 'zaman aşımı');
  let olay = null;
  try { const { pg } = await target(); olay = await pg.evaluate(() => ({ durum: window.state(), olaylar: ev, KAL: window.KAL, ekran: { w: innerWidth, h: innerHeight, sw: screen.width, sh: screen.height, dpr: devicePixelRatio } })); } catch (e) { note('hedef okunamadı', e.message); }
  if (olay) {
    fs.writeFileSync(path.join(OUT, 'iphone-hedef-olaylari.json'), JSON.stringify(olay, null, 1));
    const evs = olay.olaylar;
    const say = {};
    for (const e of evs) { const k = e.t + (e.pt ? ':' + e.pt : ''); say[k] = (say[k] || 0) + 1; }
    note('iPhone oturumunda Windows\'taki programa gelen olaylar (özet)', { durum: olay.durum, sayilar: say, son: evs.slice(-10) });
    // Gerçek Safari'den kalibrasyon: telefon F9/F8 ile bölümü açıp hedef.html'deki
    // noktalara sırayla dokundu. Her basış en yakın noktaya göre değerlendirilir.
    // Telefon ekranın (akışın) oranına dokunur: beklenen yer ekranın fiziksel boyutuna göre.
    const W = (olay.ekran.sw || olay.ekran.w) * olay.ekran.dpr, Hh = (olay.ekran.sh || olay.ekran.h) * olay.ekran.dpr;
    const kal = { ortam: 'gerçek iPhone Safari (Simülatör) → Windows hizmeti, internet üzerinden', ekran: [Math.round(W), Math.round(Hh)], turlar: {} };
    for (const [k, ad] of [['tablet', 'Tablet'], ['dogrudan', 'Doğrudan']]) {
      const pds = evs.filter((e) => e.t === 'pointerdown' && e.kal === k);
      if (!pds.length) continue;
      const rows = pds.map((e) => {
        const dpr = e.dpr || 1, got = [Math.round(e.x * dpr), Math.round(e.y * dpr)];
        let best = null;
        olay.KAL.forEach(([fx, fy], i) => { const h = [Math.round(fx * W), Math.round(fy * Hh)]; const dd = Math.hypot(got[0] - h[0], got[1] - h[1]); if (!best || dd < best.dd) best = { i, h, dd }; });
        return { i: best.i, oran: olay.KAL[best.i], hedef: best.h, gelen: got, fark: [got[0] - best.h[0], got[1] - best.h[1]], tur: e.pt || 'mouse', dpr };
      });
      kal.turlar[`${ad} (Windows %${Math.round((pds[0].dpr || 1) * 100)})`] = { rows, ozet: kalOzet(rows) };
    }
    const tt = Object.entries(kal.turlar).find(([k]) => /^Tablet/.test(k))?.[1], dd = Object.entries(kal.turlar).find(([k]) => /^Doğrudan/.test(k))?.[1];
    if (tt || dd) {
      kal.hipotez = hipotezA(tt?.rows || [], dd?.rows || []);
      fs.writeFileSync(path.join(OUT, 'kalibrasyon-iphone.json'), JSON.stringify(kal, null, 2));
      for (const [k, t] of Object.entries(kal.turlar)) {
        for (const r of t.rows) console.log('     ' + kalSatir(r));
        const sw = t.rows.findIndex((r) => r.tur === 'mouse');
        const sonra = /^Tablet/.test(k) && sw >= 0 ? t.rows.slice(sw) : t.rows;
        ok(`gerçek iPhone Safari → Windows: ${k} dokunuşları hedefte (±${KAL_TOL} px${/^Tablet/.test(k) ? ', fareye geçildiyse sonrası' : ''})`, sonra.length > 0 && sonra.every((r) => Math.abs(r.fark[0]) <= KAL_TOL && Math.abs(r.fark[1]) <= KAL_TOL), t.ozet);
      }
      note(`gerçek iPhone Safari: HİPOTEZ A → ${kal.hipotez.karar}`, kal.hipotez);
    } else note('gerçek iPhone Safari: kalibrasyon', 'telefondan kalibrasyon dokunuşu gelmedi');
    // İki parmakla kaydırma: tekerlek (yalnızca iki parmaktan gelir) parmakların altındaki alana.
    const wh = evs.filter((e) => e.t === 'wheel');
    if (wh.length) ok('gerçek iPhone Safari: iki parmakla kaydırmanın tekerleği parmakların altındaki alana gitti (#scroll)', wh.every((e) => e.id === 'scroll'), { tekerlek: wh.length, hedefler: [...new Set(wh.map((e) => e.id))] });
    else note('gerçek iPhone Safari: iki parmakla kaydırma', 'Windows\'a tekerlek gelmedi');
    note('gerçek iPhone Safari: çift dokunuş → Windows\'ta çift tık (#dbl)', evs.filter((e) => e.t === 'dblclick').map((e) => e.id));
    // "Telefona göre büyüt" kabul edildiyse bağlantı bitince Windows eski ölçeğe dönmeli.
    const enBuyuk = Math.max(1, ...evs.map((e) => e.dpr || 1));
    if (enBuyuk > 1.01) {
      const d1 = await dprBekle(1, 120000);
      ok('iPhone bağlantısı bitince Windows ölçeği eski haline döndü ("telefona göre büyüt" geri alındı)', !!d1, { iphoneSirasinda: enBuyuk, simdi: d1 });
    }
  }
  try { note('ajan bağlantı geçmişi', ((await uiHelper(PD)('/api/state')).history || []).slice(0, 8).map((x) => `${x.who} ${x.secs}sn ${x.conn} ${/iPhone/.test(x.ua) ? 'iPhone' : ''}`)); } catch {}
  // Hizmet günlüğü: GPU yolu varsayılan kapalı (iPhone'un küçültülmüş akışında da); ses yakalama yolu.
  const lg = logOf(PD);
  ok('hizmet: GPU ile küçültme varsayılan olarak kapalı (günlükte "ekran kartında küçültme açık" yok)', !logLines(lg, /ekran kartında küçültme açık/).length, logLines(lg, /ekran kartında küçültme/).slice(-3));
  const sesG = logLines(lg, /ses yakalama:|ses aktarımı başladı|ses yakalanamıyor|ses veri kanalından/).slice(-8);
  let hazir = {};
  try { hazir = JSON.parse(fs.readFileSync(path.join(OUT, 'windows-hazir.json'), 'utf8')); } catch {}
  if (hazir.ses) ok('hizmet: iPhone oturumunda WASAPI olay güdümlü yakalama kuruldu (günlük)', sesG.some((l) => /olay güdümlü/.test(l)), sesG);
  else note('hizmet ses: ATLANDI — ses aygıtı yok', sesG);
  tonDurdur();
  note('ekran geri alındı', { sonuc: ekranGeri(), simdi: ekranBoyutu() });
  await sleep(3000);
  note('hedef program yeniden ekrana yayıldı', await hedefTamEkran());
  try { const { pg } = await target(); await resetTarget(pg); } catch {}
}

// ======================= 5) DAYANIKLILIK: 10 DAKİKA KESİNTİSİZ =======================
async function uzun() {
  const cfg = JSON.parse(fs.readFileSync(path.join(PD, 'agent.json'), 'utf8'));
  const { pg: tpg } = await target();
  await tpg.bringToFront().catch(() => {});
  const browser = await edge();
  const x = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await x.newPage();
  const c = await connectClient(page, 'http://127.0.0.1:21881/', cfg.id, PW, 60000);
  ok('dayanıklılık: bağlantı', c.ok, `${c.ms} ms ${c.ok ? await kindOf(page) : c.err}`);
  if (!c.ok) { await browser.close(); return; }
  const mem = () => parseInt(ps('(Get-Process kopru -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -ne 0 } | Measure-Object WorkingSet64 -Sum).Sum'), 10) || 0;
  // Ekran sürekli değişsin (video izler gibi) ve arada girdi gelsin.
  await tpg.evaluate(() => { window.__sc = setInterval(() => { const s = document.getElementById('scroll'); s.scrollTop = (s.scrollTop + 5) % (s.scrollHeight - s.clientHeight); }, 16); });
  await page.evaluate(() => { window.__states = []; app.session.addEventListener('state', (e) => window.__states.push(e.detail.state + '@' + Math.round(performance.now() / 1000))); });
  const m0 = mem(), t0 = Date.now();
  const samples = [];
  let f0 = await frameCounter(page);
  while (Date.now() - t0 < 10 * 60 * 1000) {
    await sleep(15000);
    const f1 = await frameCounter(page);
    const st = await statsOf(page);
    samples.push({ fps: (f1 - f0) / 15, rtt: await page.evaluate(() => app.rtt), durum: await page.evaluate(() => app.session?.state), ajanFps: st?.fps, kbps: st?.kbps });
    f0 = f1;
    const tapC = await centerOf(tpg, '#tap');
    const [hx, hy] = await toClient(page, tapC.x, tapC.y); await page.mouse.click(hx, hy);
  }
  await tpg.evaluate(() => clearInterval(window.__sc));
  const m1 = mem();
  const states = await page.evaluate(() => window.__states);
  const drops = states.filter((x) => !/^connected/.test(x));
  const fpsAvg = samples.reduce((a, s) => a + s.fps, 0) / samples.length;
  const fpsMin = Math.min(...samples.map((s) => s.fps));
  ok('dayanıklılık: 10 dakika boyunca bağlantı hiç kopmadı', drops.length === 0 && samples.every((s) => s.durum === 'connected'), { durumDegisimleri: states });
  ok('dayanıklılık: akıcılık düşmedi (ortalama ≥ 25 fps, en düşük ≥ 15 fps)', fpsAvg >= 25 && fpsMin >= 15, { ortalama: Math.round(fpsAvg * 10) / 10, enDusuk: Math.round(fpsMin * 10) / 10, rttOrt: Math.round(samples.reduce((a, s) => a + (s.rtt || 0), 0) / samples.length) });
  ok('dayanıklılık: bellek şişmedi (artış < 80 MB)', m1 - m0 < 80 * 1024 * 1024, { basta: Math.round(m0 / 1048576) + ' MB', sonda: Math.round(m1 / 1048576) + ' MB' });
  note('dayanıklılık örnekleri (15 sn arayla)', samples);
  await page.evaluate(() => app.disconnect()).catch(() => {});
  await browser.close();
}

// ======================= 6) SON: GÜNCELLEME, KİLİT, KALDIRMA =======================
async function son() {
  let cfg = JSON.parse(fs.readFileSync(path.join(PD, 'agent.json'), 'utf8'));
  const browser = await edge();
  const U = 'http://127.0.0.1:21881/';
  const pf = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Kopru', 'kopru.exe');
  const logon = () => /LogonUI/i.test(ps('Get-Process LogonUI -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name'));

  await step('güncelleme', async () => {
    if (!BIN_NEW) return note('güncelleme', 'yeni sürüm dosyası yok');
    const before = sha(pf);
    run([], {}, BIN_NEW); // yeni indirilen sürümü çift tıklamak
    const upd = await waitFor(() => { try { return sha(pf) === sha(BIN_NEW) && /Running/.test(ps('(Get-Service Kopru).Status')); } catch { return false; } }, 120000, 2000);
    // Yeni sürüm hizmet olarak açılıp yerel sunucusu yanıt verene kadar bekle.
    const up = await waitFor(() => fetch(U + 'api/info').then((r) => r.ok).catch(() => false), 90000, 1000);
    await sleep(3000);
    closeStrayBrowsers();
    const cfg2 = JSON.parse(fs.readFileSync(path.join(PD, 'agent.json'), 'utf8'));
    const x = await browser.newContext({ viewport: { width: 1280, height: 760 } }); const p = await x.newPage();
    let cc = { ok: false, err: 'yerel sunucu açılmadı' };
    for (let i = 0; i < 2 && !cc.ok && up; i++) { try { cc = await connectClient(p, U, cfg2.id, PW, 90000); } catch (e) { cc = { ok: false, err: e.message }; await sleep(3000); } }
    ok('yeni sürümü çift tıklayınca güncellendi; kimlik ve parola korundu', !!upd && before !== sha(pf) && cfg2.id === cfg.id && cc.ok, { dosyaDegisti: before !== sha(pf), kimlikAyni: cfg2.id === cfg.id, baglandi: cc.ok, hata: cc.err });
    await p.evaluate(() => app.disconnect()).catch(() => {}); await x.close();
    cfg = cfg2;
  });

  // Kilit ekranında parola yazıp açabilmek için oturum kullanıcısına bilinen bir parola ver.
  const winPw = 'Kp-' + crypto.randomBytes(6).toString('hex') + 'A1!';
  ps(`net user runneradmin '${winPw}' | Out-Null`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const c = await connectClient(page, U, cfg.id, PW, 60000);
  ok('son aşama bağlantısı', c.ok, c.err);
  if (c.ok) {
    await sleep(1500);
    await step('Ctrl+Alt+Del', async () => {
      await page.evaluate(() => app.session.sendCtl({ t: 'special', a: 'sas' }));
      const up = await waitFor(logon, 10000, 500);
      await sleep(3000);
      await page.screenshot({ path: path.join(OUT, 'ctrl-alt-del-uzaktan.png') });
      ok('uzaktan Ctrl+Alt+Del güvenlik ekranını açtı', !!up);
      // Menüyü uzaktan Esc ile kapat; kapandığı doğrulanmadan kilitlemeye geçme
      // (açık kalırsa parolanın sonundaki Enter menüdeki "Kilitle"ye basar).
      let closed = false;
      for (let i = 0; i < 3 && !closed; i++) {
        await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        await page.keyboard.press('Escape');
        closed = !!(await waitFor(() => !logon(), 8000, 500));
      }
      note('Ctrl+Alt+Del menüsü Esc ile kapandı', closed);
      await sleep(1500);
    });
    await step('kilitle ve parolayla aç', async () => {
      if (logon()) note('kilitlemeden önce', 'güvenlik ekranı hâlâ açık');
      await page.evaluate(() => app.session.sendCtl({ t: 'special', a: 'lock' }));
      ok('uzaktan kilitleme', !!(await waitFor(logon, 15000, 500)));
      await sleep(3000);
      await page.screenshot({ path: path.join(OUT, 'kilit-ekrani-uzaktan.png') });
      // Telefondaki gibi: Ctrl+Alt+Del, sonra parolayı tuş tuş yaz ve Enter.
      await page.evaluate(() => app.session.sendCtl({ t: 'special', a: 'sas' }));
      await sleep(3500);
      await page.screenshot({ path: path.join(OUT, 'kilit-parola-ekrani.png') });
      await page.evaluate((pw) => app.typeKeys(pw + '\n'), winPw);
      const unlocked = await waitFor(() => !logon(), 30000, 1000);
      await sleep(2500);
      await page.screenshot({ path: path.join(OUT, 'kilit-acildi.png') });
      ok('kilit ekranında parolayı uzaktan yazıp Windows\'u açtı', !!unlocked);
    });
  }
  await step('bağlantı bitince kilitle', async () => {
    await uiHelper(PD)('/api/config', { lockOnDisconnect: true });
    await page.evaluate(() => app.disconnect()).catch(() => {});
    ok('bağlantı bitince Windows kendiliğinden kilitlendi', !!(await waitFor(logon, 20000, 1000)));
    await uiHelper(PD)('/api/config', { lockOnDisconnect: false });
  });
  await ctx.close();
  await step('kaba kuvvet kilidi', async () => {
    const x = await browser.newContext(); const p = await x.newPage();
    const msgs = [];
    for (let i = 0; i < 7; i++) {
      await p.goto(U); await p.fill('#in-id', cfg.id); await p.fill('#in-pw', 'yanlis' + i + 'xxxx'); await p.click('#btn-connect');
      msgs.push(await waitFor(() => p.textContent('#connect-err').then((t) => t.trim() || null), 30000) || '');
    }
    ok('art arda yanlış parolalardan sonra denemeler geçici olarak kilitlendi', msgs.slice(-2).some((t) => /bekle|kilit|sn|saniye|dakika|fazla/i.test(t)), msgs);
    await x.close();
  });
  await browser.close();
  await step('kaldırma', async () => {
    const p = run(['uninstall'], {});
    const gone = await waitFor(() => !/Running|Stopped|StartPending|StopPending/.test(ps('(Get-Service Kopru -ErrorAction SilentlyContinue).Status')), 60000, 2000);
    try { p.kill(); } catch {}
    ok('kaldırma: hizmet silindi', !!gone);
    ok('kaldırma: güvenlik duvarı kuralı silindi', !/Kopru|Köprü/.test(ps('netsh advfirewall firewall show rule name="Köprü" | Out-String')));
  });
}

// Köprü'nün Go çökme dökümü (cokme.log): bu aşamada yeni bir "panic"/"fatal
// error" yazıldıysa kırmızı say ve dökümü sonuca ekle (işçi süreç sessizce
// ölüp yeniden başlarsa nedeni görünsün).
// Her dosyanın okunan yeri ayrı saklanır (aşamalar aynı günlüklere ekler).
function crashCheck() {
  if (PHASE === 'bekle' || PHASE === 'sifrele') return;
  const local = PHASE === 'yerel' || PHASE === 'kalibrasyon' || PHASE === 'gpu';
  const dir = local ? path.join(WORK, 'home') : PD;
  const files = ['cokme.log', 'isci-hata.log'].map((f) => path.join(dir, f));
  if (local) for (const f of fs.readdirSync(WORK).filter((x) => /^surec-(yerel|kalibrasyon|gpu)-.*-hata\.log$/.test(x))) files.push(path.join(WORK, f));
  const ofPath = path.join(WORK, 'cokme-ofset.json');
  let of = {}; try { of = JSON.parse(fs.readFileSync(ofPath, 'utf8')); } catch {}
  let found = null;
  for (const f of files) {
    let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const from = of[f] > txt.length ? 0 : of[f] || 0;
    of[f] = txt.length;
    const m = txt.slice(from).match(/(panic:|fatal error:|Exception 0x)[\s\S]{0,2500}/);
    if (m && !found) found = path.basename(f) + ': ' + m[0];
  }
  fs.writeFileSync(ofPath, JSON.stringify(of));
  ok(`${PHASE}: Köprü bu aşamada hiç çökmedi`, !found, found || '');
}

(async () => {
  try {
    if (PHASE === 'yerel') await yerel();
    else if (PHASE === 'kalibrasyon') await kalibrasyon();
    else if (PHASE === 'gpu') await gpu();
    else if (PHASE === 'kur') await kur();
    else if (PHASE === 'hizmet') await hizmet();
    else if (PHASE === 'sifrele') await sifrele();
    else if (PHASE === 'bekle') await bekle();
    else if (PHASE === 'uzun') await uzun();
    else if (PHASE === 'son') await son();
    else ok('bilinmeyen aşama', false, PHASE);
  } catch (e) {
    ok('beklenmeyen hata', false, e.stack || String(e));
  } finally {
    try { crashCheck(); } catch (e) { note('çökme kaydı okunamadı', e.message); }
    saveResults();
    for (const p of procs) { try { p.kill(); } catch {} }
    if (PHASE === 'yerel' || PHASE === 'kalibrasyon' || PHASE === 'gpu') ps('Get-Process kopru -ErrorAction SilentlyContinue | Stop-Process -Force');
    process.exit(0);
  }
})();
