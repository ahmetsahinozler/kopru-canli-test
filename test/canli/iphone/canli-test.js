// iPhone Simülatöründeki gerçek Mobile Safari'de çalışır (yalnızca testte sayfaya
// eklenir). Köprü istemcisinin arayüzünü bir kullanıcı gibi kullanır: kimlik ve
// parolayı yazar, bağlanır; gerçek yoldan (ilan panosu → Cloudflare tüneli →
// WebRTC) gelen Windows görüntüsünü ölçer; dokunuşları gönderip sonucu yine
// görüntüden doğrular. Windows tarafı (bekle aşaması) aynı dokunuşların hedef
// programda nereye düştüğünü ayrıca kaydeder.
//
// Denetlenenler (1.2.3–1.2.8):
//  - görüntü veri kanalından + WebCodecs (RTP görüntüsü boş), 📶 satırları
//  - "telefona göre büyüt" önerisi (ilk bağlantı) → Windows ölçeği büyür
//  - tek parmak, kaydırma, iki parmakla parmakların altına kaydırma (9 baytlık
//    konumlu tekerlek), çift dokunuş yakalama, büyüteç, üç parmak (klavye)
//  - ölçekli Windows'ta kalibrasyon: Tablet ve Doğrudan modda bilinen noktalara
//    dokunuş; düştüğü yer görüntüdeki pembe noktadan ölçülür
//  - netleştirme (büyük değişiklikten sonra kalite hedefi), ses ("aud" kanalı,
//    sira16, 10 ms Opus, AudioWorklet çalıcı), döndürme, arka plandan dönüş
// Simülatörü yöneten işler (ekran görüntüsü, döndürme, gerçek dokunuş, Ayarlar'a
// geçip dönme) sunucuya (sunucu.js) "istek" olarak gönderilir.
(function () {
  const rep = (o) => fetch('/canli-sonuc', { method: 'POST', body: JSON.stringify({ ...o, ts: Math.round(performance.now()) }) }).catch(() => {});
  const istek = (is, o = {}) => fetch('/canli-istek', { method: 'POST', body: JSON.stringify({ is, ...o }) }).then((r) => r.json()).catch((e) => ({ ok: false, hata: String(e) }));
  const foto = (ad) => istek('foto', { ad });
  window.addEventListener('error', (e) => rep({ t: 'hata', m: e.message, f: e.filename, l: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => rep({ t: 'hata', m: String(e.reason && (e.reason.stack || e.reason)) }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(150); } return null; };
  const $ = (id) => document.getElementById(id);
  const src = () => { const v = $('video'), c = $('vcanvas'); return v.classList.contains('hidden') ? c : v; };
  const dims = () => { const s = src(); return { w: s.videoWidth || s.width || 0, h: s.videoHeight || s.height || 0 }; };
  // Görüntüden okuma: tek, yeniden kullanılan tuval.
  let gc = null, gg = null;
  const grab = () => {
    const s = src(), { w, h } = dims();
    if (!w || !h) return null;
    if (!gc) { gc = document.createElement('canvas'); gg = gc.getContext('2d', { willReadFrequently: true }); }
    if (gc.width !== w || gc.height !== h) { gc.width = w; gc.height = h; }
    gg.drawImage(s, 0, 0);
    return { w, h };
  };
  const pixel = (fx, fy) => { const f = grab(); if (!f) return [0, 0, 0]; return [...gg.getImageData(Math.min(f.w - 1, Math.round(fx * f.w)), Math.min(f.h - 1, Math.round(fy * f.h)), 1, 1).data.slice(0, 3)]; };
  // findDot hedef.html'deki pembe noktanın (son basışın Windows'ta düştüğü yer)
  // görüntüdeki ağırlık merkezini oran olarak verir.
  const findDot = () => {
    const f = grab(); if (!f) return null;
    const d = gg.getImageData(0, 0, f.w, f.h).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0, i = y * f.w * 4; x < f.w; x++, i += 4) if (d[i] > 215 && d[i + 1] < 80 && d[i + 2] > 215) { sx += x; sy += y; n++; }
    return n >= 6 ? { x: (sx / n + 0.5) / f.w, y: (sy / n + 0.5) / f.h, n } : null;
  };
  const toClient = (fx, fy) => { const r = $('canvas').getBoundingClientRect(); return [r.left + fx * r.width, r.top + fy * r.height]; };
  const near = (a, b, t = 40) => a && a.every((v, i) => Math.abs(v - b[i]) <= t);
  const decoded = () => app.wsv?.st?.dec ?? 0;
  const yol = async () => {
    let rtp = null;
    try { (await app.session.pc?.getStats())?.forEach((x) => { if (x.type === 'inbound-rtp' && x.kind === 'video') rtp = { kare: x.framesDecoded || 0, bayt: x.bytesReceived || 0 }; }); } catch {}
    return { veriKanali: !app.session?.wsMode && !!app.session?.o?.dcVideo && !!app.wsv, tunel: !!app.session?.wsMode, video: !$('video').classList.contains('hidden'), cozulen: decoded(), profil: app.session?.o?.wsProfile, baglanti: app.connKind || null, rtp };
  };
  // Sentetik dokunuş (Safari'nin gerçek dokunuşunu sayfadan otomatikleştirmek
  // mümkün değil; Köprü'nün dokunma motoru aynı PointerEvent'leri işler).
  const st = () => $('stage');
  let pid = 100;
  const pev = (type, x, y, id) => st().dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 10, height: 10, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const tap = async (fx, fy, hold = 60, dx = 0, dy = 0) => { const [x, y] = toClient(fx, fy); const id = ++pid; pev('pointerdown', x + dx, y + dy, id); await sleep(hold); pev('pointerup', x + dx, y + dy, id); };
  // Uzak tuşlar (hedef.html: F9 Tablet bölümü, F8 Doğrudan bölümü, F2 bitti, F4 ince yazılı desen).
  const KEY = { Escape: 0x01, F2: 0x3c, F4: 0x3e, F8: 0x42, F9: 0x43 };
  const tus = (k) => app.input.tap(KEY[k]);
  const shiftTus = (k) => { app.input.sendKey(0x2a, true); app.input.tap(KEY[k]); app.input.sendKey(0x2a, false); }; // Shift+F4: sürekli hareket
  // Kalibrasyon noktaları (hedef.html window.KAL ile aynı).
  const KAL = [[0.12, 0.11], [0.435, 0.11], [0.97, 0.11], [0.435, 0.45], [0.71, 0.59], [0.97, 0.55], [0.12, 0.95], [0.435, 0.85], [0.97, 0.95]];
  const TOL = 16; // Windows pikseli (görüntüden ölçüm: akış küçültülmüş, nokta merkezi ±1 akış pikseli)
  // Giden girdi iletileri (çözümlenmiş): dokunuş (6), düğme (2), tekerlek (3).
  const giden = [];
  const u16 = (b, o) => (b[o] | (b[o + 1] << 8)) / 65535;
  const coz = (b) => {
    if (b[0] === 6) { const n = b[1], c = []; for (let i = 0; i < n; i++) { const o = 2 + i * 6; c.push({ id: b[o], s: b[o + 1], x: u16(b, o + 2), y: u16(b, o + 4), xr: b[o + 2] | (b[o + 3] << 8), yr: b[o + 4] | (b[o + 5] << 8) }); } return { k: 'dokunus', c }; }
    if (b[0] === 2) return { k: 'dugme', b: b[1], d: b[2], xr: b[3] | (b[4] << 8), yr: b[5] | (b[6] << 8) };
    if (b[0] === 3) return { k: 'teker', boy: b.length, dy: (b[3] | (b[4] << 8)) << 16 >> 16, x: b.length >= 9 ? u16(b, 5) : null, y: b.length >= 9 ? u16(b, 7) : null };
    return { k: 'diger', t: b[0], boy: b.length };
  };
  const dene = async (t, fn) => { try { await fn(); } catch (e) { rep({ t, ok: false, hata: String(e && (e.stack || e)).slice(0, 600) }); } };
  const kalMsgs = [];
  let kalDiag = null;

  (async () => {
    await waitFor(() => window.app && $('btn-connect'), 20000);
    st().setPointerCapture = () => {}; st().releasePointerCapture = () => {};
    rep({ t: 'basla', ua: navigator.userAgent, ekran: [innerWidth, innerHeight, devicePixelRatio], webcodecs: typeof VideoDecoder, audioDecoder: typeof AudioDecoder, audioWorklet: typeof AudioWorkletNode, offline: typeof OfflineAudioContext, rtc: typeof RTCPeerConnection, mode: app.mode, surum: $('foot')?.textContent });
    const cfg = await waitFor(() => fetch('/canli-ayar.json').then((r) => (r.ok ? r.json() : null)), 25 * 60 * 1000);
    if (!cfg) return rep({ t: 'bitti', hata: 'ayar yok' });
    $('in-id').value = cfg.id;
    $('in-pw').value = cfg.pw;
    const t0 = performance.now();
    $('btn-connect').click();
    const okc = await waitFor(() => $('overlay').classList.contains('hidden') && decoded() + (($('video').videoWidth || 0) > 0 ? 1 : 0) > 0 && dims().w > 300, 120000);
    rep({ t: 'baglanti', ok: !!okc, ms: Math.round(performance.now() - t0), yol: await yol(), boyut: dims(), mesaj: okc ? '' : ($('connect-err')?.textContent || '') + ' | ' + ($('overlay-text')?.textContent || '') });
    if (!okc) { await foto('baglanamadi'); return rep({ t: 'bitti' }); }
    await sleep(3000);
    app.session.addEventListener('ctl', (e) => { const d = e.detail; if (!d) return; if (d.t === 'inputdiag') kalDiag = d; else if (/^(tapdbg|tapcur|notice)$/.test(d.t)) kalMsgs.push(d); });
    await foto('01-baglandi');

    // 1.2.6+: iPhone'da görüntü doğrudan bağlantının veri kanalından, WebCodecs ile.
    await dene('goruntu-yolu', async () => {
      const y = await yol();
      rep({ t: 'goruntu-yolu', ok: y.veriKanali && !y.video && y.cozulen > 0 && (!y.rtp || y.rtp.kare === 0), ...y });
    });

    // 1.2.8: ilk bağlantıda bir kez "telefona göre büyüt" önerisi. Kabul edilir:
    // sonraki dokunuşlar ölçekli Windows'ta yapılır (kullanıcının durumu).
    await dene('oneri-karti', async () => {
      const kart = await waitFor(() => !$('fitask').classList.contains('hidden') && $('fitask-sub').textContent, 15000);
      const m = app.scales, beklenen = m?.list?.length >= 2 && !m.changed ? app.fitPercentFor(m) : null;
      if (!kart) return rep({ t: 'oneri-karti', ok: beklenen == null || beklenen === m?.cur ? undefined : false, bilgi: beklenen == null || beklenen === m?.cur, neden: beklenen == null ? 'bilgisayar bu çözünürlükte tek yazı boyutu sunuyor' : 'kart çıkmadı', olcek: m, ekran: app.currentDisplay });
      await foto('02-oneri-karti');
      $('fitask-yes').click();
      const sonra = await waitFor(() => app.scales?.changed && app.scales.cur === beklenen && app.scales, 20000);
      await sleep(3000);
      const d0 = decoded(); await sleep(2000);
      rep({ t: 'oneri-karti', ok: !!sonra && decoded() > d0 - 1, kart, beklenen, olcek: sonra || app.scales, kayit: app.book.find((b) => b.id === app.session?.id)?.fit, goruntu: { boyut: dims(), cozulen: decoded() - d0 } });
    });

    // Akış ölçümü: hedefte sürekli hareket (Shift+F4, 30 kare/sn) varken.
    await dene('akis', async () => {
      shiftTus('F4');
      await sleep(500);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const d0 = decoded(); await sleep(1500);
        const a = app.agentStats || {}, w = app.wsv?.stats() || {};
        samples.push({ cozulen: decoded() - d0, rtt: app.rtt, ajan: { fps: a.fps, kbps: a.kbps, cap: a.cap, enc: a.enc, netl: a.netl, yolKuyruk: a.flowQ, yolKbps: a.flowKbps, serit: a.lanes, seritDegisim: a.laneSw }, cizim: { cozmeMs: +(w.decMs || 0).toFixed(1), beklemeMs: +(w.waitMs || 0).toFixed(1), cizimMs: +(w.drawMs || 0).toFixed(1), gecilen: w.skip, atilan: w.drop, yenidenKurma: w.reset, kuyruk: w.qMax } });
      }
      shiftTus('F4');
      const toplam = samples.reduce((s, x) => s + x.cozulen, 0);
      rep({ t: 'akis', ok: toplam >= 20, kareSn: Math.round(toplam / 7.5 * 10) / 10, yol: await yol(), boyut: dims(), ekran: app.currentDisplay, ornekler: samples });
    });
    await sleep(1500);
    // Renk doğruluğu (hedef sayfadaki kırmızı blok: ekranın %12, %11 noktası)
    await dene('renk', async () => { const red = pixel(0.12, 0.11); rep({ t: 'renk', ok: near(red, [229, 57, 53]), kirmizi: red }); });
    // Telefon klavyesiyle yazı: Windows'taki yazı alanı odakta bekliyor; metin
    // beklenen değere ulaşınca hedefteki kutu sarıya döner (%21, %83).
    await dene('klavye', async () => {
      const sink = $('kbdsink');
      sink.focus();
      const base = sink.value;
      sink.value = base + 'Kopru-Ş1';
      sink.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'Kopru-Ş1', bubbles: true }));
      const yellow = await waitFor(() => { const p = pixel(0.21, 0.83); return near(p, [255, 214, 0], 45) ? p : null; }, 8000);
      rep({ t: 'klavye', ok: !!yellow, renk: yellow || pixel(0.21, 0.83) });
      sink.blur();
    });
    // Gönderilen girdi iletilerini yakala (ağa gerçekten çıkıyor mu, biçimleri ne?).
    let sent = 0, bytes = 0;
    const origIn = app.session.sendIn.bind(app.session);
    app.session.sendIn = (b) => { sent++; bytes += b.byteLength || b.length || 0; giden.push({ at: performance.now(), m: coz(new Uint8Array(b)) }); return origIn(b); };
    rep({ t: 'girdi-durumu', mod: app.input.mode, aktif: app.input.active(), inKanal: app.session.dc?.in?.readyState, yetenek: app.caps });
    // Tek parmak dokunuş: dokunma kutusu (%21, %39) Windows'ta dokunuş gelince yeşile döner.
    await dene('dokunus', async () => {
      const before = pixel(0.21, 0.47);
      await tap(0.21, 0.39);
      const green = await waitFor(() => { const p = pixel(0.21, 0.47); return near(p, [0, 200, 0], 50) ? p : null; }, 6000);
      rep({ t: 'dokunus', ok: !!green, once: before, sonra: green || pixel(0.21, 0.47), gonderilen: sent, bayt: bytes });
    });
    // Tek parmakla kaydırma: kaydırma alanının (%71, %59) rengi değişmeli.
    await dene('kaydirma', async () => {
      const s0 = pixel(0.71, 0.59);
      const [x, y] = toClient(0.71, 0.70);
      const id2 = ++pid;
      pev('pointerdown', x, y, id2);
      for (let i = 1; i <= 16; i++) { await sleep(16); pev('pointermove', x, y - i * 9, id2); }
      pev('pointerup', x, y - 16 * 9, id2);
      await sleep(1500);
      const s1 = pixel(0.71, 0.59);
      rep({ t: 'kaydirma', ok: !near(s0, s1, 20), once: s0, sonra: s1, gonderilen: sent });
    });
    // 1.2.8: iki parmakla kaydırma parmakların altındaki pencereyi kaydırır. Önce
    // soldaki kutuya dokunulur (Windows imleci orada kalır); iki parmak sağdaki
    // alanda kaydırır. Tekerlek iletisi 9 bayt ve parmakların orta noktasını taşımalı.
    await dene('iki-parmak-kaydirma', async () => {
      await tap(0.21, 0.39); await sleep(500);
      const s0 = pixel(0.71, 0.59), n0 = giden.length;
      const [a, y] = toClient(0.66, 0.75), [b] = toClient(0.76, 0.75);
      const i1 = ++pid, i2 = ++pid;
      pev('pointerdown', a, y, i1); pev('pointerdown', b, y, i2);
      for (let i = 1; i <= 14; i++) { await sleep(16); pev('pointermove', a, y - i * 10, i1); pev('pointermove', b, y - i * 10, i2); }
      pev('pointerup', a, y - 140, i1); pev('pointerup', b, y - 140, i2);
      await sleep(2000);
      const s1 = pixel(0.71, 0.59);
      const w = giden.slice(n0).map((g) => g.m).filter((m) => m.k === 'teker');
      const konumlu = w.length > 0 && w.every((m) => m.boy === 9 && Math.abs(m.x - 0.71) < 0.03 && Math.abs(m.y - 0.75) < 0.03);
      rep({ t: 'iki-parmak-kaydirma', ok: konumlu && !near(s0, s1, 20), tekerlekIleti: w.length, boylar: [...new Set(w.map((m) => m.boy))], konum: w[0] ? [+w[0].x.toFixed(3), +w[0].y.toFixed(3)] : null, once: s0, sonra: s1 });
    });
    // 1.2.8: çift dokunuşta ikinci dokunuş (9 px yanında) ilkinin noktasına gönderilir;
    // Windows'taki programda gerçek çift tık olursa kutu renk değiştirir (%83, %11).
    await dene('cift-dokunus', async () => {
      for (const mod of ['tablet', 'direct']) {
        app.setMode(mod); await sleep(400);
        const once = pixel(0.83, 0.11), n0 = giden.length;
        await tap(0.83, 0.11, 50); await sleep(120); await tap(0.83, 0.11, 50, 9, 5);
        const degisti = await waitFor(() => !near(pixel(0.83, 0.11), once, 40), 3500);
        await sleep(300);
        const m = giden.slice(n0).map((g) => g.m);
        const basis = mod === 'tablet' ? m.filter((x) => x.k === 'dokunus').flatMap((x) => x.c.filter((c) => c.s === 0)).map((c) => [c.xr, c.yr]) : m.filter((x) => x.k === 'dugme' && x.d === 1).map((x) => [x.xr, x.yr]);
        const ayni = basis.length >= 2 && basis[0][0] === basis[1][0] && basis[0][1] === basis[1][1];
        rep({ t: 'cift-dokunus-' + mod, ok: ayni, ayniNokta: ayni, basislar: basis.slice(0, 3), windowsCiftTik: !!degisti, renk: [once, pixel(0.83, 0.11)] });
      }
      app.setMode('tablet');
    });
    // 1.2.8: büyüteç parmak durunca açılır; ortası parmağın altındaki rengi gösterir.
    await dene('buyutec', async () => {
      const [x, y] = toClient(0.12, 0.11); const id = ++pid;
      pev('pointerdown', x, y, id); await sleep(120);
      const erken = app.input.fx.loupeShown;
      await sleep(380);
      const c = document.querySelector('.loupe');
      const merkez = [...c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data.slice(0, 3)];
      const acik = app.input.fx.loupeShown && c.classList.contains('on');
      const b = c.getBoundingClientRect();
      await foto('03-buyutec');
      pev('pointerup', x, y, id); await sleep(400);
      const kapandi = !app.input.fx.loupeShown;
      tus('Escape');
      rep({ t: 'buyutec', ok: !erken && acik && near(merkez, [229, 57, 53], 60) && kapandi, erken, acik, merkez, kutu: [Math.round(b.left), Math.round(b.top), Math.round(b.width)], parmak: [Math.round(x), Math.round(y)], kapandi });
    });
    // 1.2.8: üç parmakla dokunma klavyeyi açar/kapatır; Windows'a tık gitmez.
    // iOS klavyeyi yalnızca gerçek kullanıcı hareketinde açar: odak sonucu yalnızca bildirilir.
    await dene('uc-parmak', async () => {
      const n0 = giden.length;
      const uc = async () => { const ids = [++pid, ++pid, ++pid]; const p = [toClient(0.3, 0.6), toClient(0.45, 0.6), toClient(0.6, 0.6)]; ids.forEach((id, i) => pev('pointerdown', p[i][0], p[i][1], id)); await sleep(120); ids.forEach((id, i) => pev('pointerup', p[i][0], p[i][1], id)); await sleep(500); };
      await uc();
      const acildi = document.activeElement === app.input.sink;
      await uc();
      const kapandi = document.activeElement !== app.input.sink;
      const tik = giden.slice(n0).filter((g) => g.m.k === 'dokunus' || g.m.k === 'dugme').length;
      app.input.hideKeyboard();
      rep({ t: 'uc-parmak', ok: tik === 0, windowsaTikGitmedi: tik === 0, klavyeAcildi: acildi, klavyeKapandi: kapandi, not: 'iOS odak kuralı: klavye yalnızca gerçek dokunuşta açılır; sentetik dokunuşta sonuç yalnızca bilgi' });
    });
    // Ölçekli Windows'ta kalibrasyon: hedef.html'deki noktalara Tablet ve Doğrudan
    // modda dokunulur; Windows'ta düştüğü yer pembe noktadan (görüntüde) ölçülür.
    // Tanı açık: ajan her dokunuşta enjekte ettiği pikseli ve imlecin yerini bildirir.
    await dene('kalibrasyon', async () => {
      app.calib.setOn(true);
      await waitFor(() => kalDiag, 4000);
      for (const [mod, kk] of [['tablet', 'F9'], ['direct', 'F8']]) {
        app.setMode(mod); await sleep(300);
        tus(kk); await sleep(900);
        const W = app.currentDisplay?.w || dims().w, H = app.currentDisplay?.h || dims().h;
        const rows = [];
        let prev = null;
        for (const [i, [fx, fy]] of KAL.entries()) {
          kalMsgs.length = 0;
          await tap(fx, fy);
          let dot = await waitFor(() => { const d = findDot(); return d && (!prev || Math.hypot(d.x - prev.x, d.y - prev.y) > 0.01) ? d : null; }, 3000);
          await sleep(250);
          if (dot) dot = findDot() || dot;
          if (dot) prev = dot;
          await sleep(250);
          const dbg = kalMsgs.find((x) => x.t === 'tapdbg'), cur = kalMsgs.find((x) => x.t === 'tapcur'), ntc = kalMsgs.find((x) => x.t === 'notice');
          rows.push({ i, oran: [fx, fy], gorulen: dot ? [+dot.x.toFixed(4), +dot.y.toFixed(4)] : null, fark: dot ? [Math.round((dot.x - fx) * W), Math.round((dot.y - fy) * H)] : null,
            ajan: dbg?.px || null, ajanFark: dbg?.px ? [dbg.px[0] - Math.round(fx * (W - 1)), dbg.px[1] - Math.round(fy * (H - 1))] : null, yol: dbg?.via || null, imlec: cur?.px || null, bildirim: ntc?.text || null });
        }
        if (mod === 'tablet') await foto('04-kalibrasyon-tani');
        tus('F2'); await sleep(500);
        const bul = rows.filter((r) => r.fark);
        const sw = rows.findIndex((r) => r.bildirim);
        const sonra = sw >= 0 ? rows.slice(sw + 1) : rows;
        const icinde = (r) => r.fark && Math.abs(r.fark[0]) <= TOL && Math.abs(r.fark[1]) <= TOL;
        rep({ t: 'kalibrasyon-' + mod, ok: sonra.length > 0 && sonra.every(icinde), ekran: [W, H], akis: dims(), olcek: app.scales?.cur, bulunan: `${bul.length}/${rows.length}`, isabet: bul.filter(icinde).length, enBuyuk: bul.length ? Math.max(...bul.map((r) => Math.max(Math.abs(r.fark[0]), Math.abs(r.fark[1])))) : null, fareyeGecis: sw, satirlar: rows });
      }
      rep({ t: 'kalibrasyon-tani', bilgi: true, windows: kalDiag?.info || null, os: kalDiag?.os, panel: app.calib.panel?.textContent?.slice(0, 1200) });
      app.calib.setOn(false);
      app.setMode('tablet');
    });
    // 1.2.8: netleştirme kalite hedefine ulaşana kadar sürer (en çok 3 sn).
    await dene('netlestirme', async () => {
      await sleep(1000);
      const once = app.agentStats?.netl, d0 = decoded();
      tus('F4');
      const seri = [], t1 = Date.now();
      let fotoAlindi = false;
      while (Date.now() - t1 < 7000) {
        await sleep(300);
        const n = app.agentStats?.netl;
        if (n !== seri.at(-1)?.netl) seri.push({ ms: Date.now() - t1, netl: n });
        if (!fotoAlindi && Date.now() - t1 > 3500) { fotoAlindi = true; await foto('05-netlik'); }
      }
      const kare = decoded() - d0;
      tus('F4');
      // Değişiklikten sonra kare gelmiş olmalı ve son netleştirme hedef/boş ile bitmeli
      // (aynı ekranda dize öncekiyle birebir aynı olabilir: "hedef · 3 kare · RF 21.0").
      const son = seri.at(-1)?.netl || '';
      rep({ t: 'netlestirme', ok: kare > 0 && /^(hedef|boş) ·/.test(son), once, seri, cozulenKare: kare });
    });
    // 📶 istatistik ekranı (kullanıcının açtığı gibi).
    await dene('istatistik', async () => {
      $('tb-stats').click();
      await sleep(2300);
      const rows = {};
      for (const r of $('stats').children) rows[r.children[0]?.textContent] = r.children[1]?.textContent;
      await foto('06-istatistik');
      $('tb-stats').click();
      const cc = /^([\d.]+) \/ ([\d.]+) \/ ([\d.]+) ms · geçilen (\d+) · atılan (\d+) · yeniden kurma (\d+)/.exec(rows['Çözme / çizim'] || '');
      const denetim = {
        baglanti: rows['Bağlantı'] === 'Doğrudan (görüntü veri kanalından)',
        surum: !!rows['Sürüm'] && !/bilgisayar/.test(rows['Sürüm']) && rows['Sürüm'] === app.hello?.ver,
        cozucu: /^WebCodecs \((high|main|baseline)\)$/.test(rows['Çözücü'] || ''),
        cozmeCizim: !!cc && +cc[1] < 50,
        netlestirme: !!rows['Netleştirme'] && rows['Netleştirme'] !== '—',
        ses: 'Ses' in rows,
      };
      rep({ t: 'istatistik', ok: Object.values(denetim).every(Boolean), denetim, surum: rows['Sürüm'], satirlar: rows });
      const a = app.agentStats || {};
      rep({ t: 'istatistik-yol-denetimi', ok: 'Yol denetimi' in rows, satir: rows['Yol denetimi'] ?? null, ajanDegerleri: { flowQ: a.flowQ, flowKbps: a.flowKbps, flowCuts: a.flowCuts, flowHolds: a.flowHolds, lanes: a.lanes, laneSw: a.laneSw }, not: '1.2.8 sonrası: satır veri kanalı yolunda da çiziliyor (main.js flowNote)' });
    });
    // Ses (1.2.7/1.2.8): "aud" veri kanalı, sira16, 10 ms Opus; AudioWorklet çalıcı (ses-isleyici.js).
    await dene('ses', async () => {
      const a = app.session.dc?.aud;
      const pk = [];
      const on = (e) => { if (pk.length < 40) pk.push(new Uint8Array(e.detail)); pk.n = (pk.n || 0) + 1; };
      app.session.addEventListener('dcaudio', on);
      await sleep(3000);
      app.session.removeEventListener('dcaudio', on);
      const paketSn = Math.round((pk.n || 0) / 3);
      const kanal = a ? { protokol: a.protocol, durum: a.readyState, sirali: a.ordered, yeniden: a.maxRetransmits } : null;
      // Opus TOC baytından paket süresi (ms).
      const MS = [10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20];
      const opus = pk.map((p) => (app.caps?.audseq ? p.subarray(2) : p)).filter((p) => p.length > 1);
      const sureler = [...new Set(opus.map((p) => { const c = p[0] & 3, f = MS[p[0] >> 3]; return c === 0 ? f : c < 3 ? 2 * f : f * (p[1] & 0x3f); }))];
      // Çözücü: gerçek paketler AudioDecoder ile (Safari) → kare başına örnek sayısı.
      let cozum = null;
      if (opus.length && typeof AudioDecoder !== 'undefined') {
        const ornek = [];
        try {
          const dec = new AudioDecoder({ output: (f) => { ornek.push(f.numberOfFrames); f.close(); }, error: (e) => { cozum = { hata: String(e) }; } });
          dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
          opus.slice(0, 20).forEach((p, i) => dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: i * 10000, data: p })));
          await dec.flush(); dec.close();
          cozum = cozum || { kare: ornek.length, ornek: [...new Set(ornek)] };
        } catch (e) { cozum = { hata: String(e) }; }
      }
      // Çalıcı: ses-isleyici.js bu Safari'de AudioWorklet olarak yüklenip ses üretiyor mu
      // (ses donanımı gerekmez: OfflineAudioContext).
      let calici = null;
      try {
        const oc = new OfflineAudioContext(2, 48000, 48000);
        await oc.audioWorklet.addModule(new URL('js/ses-isleyici.js', location.href));
        const node = new AudioWorkletNode(oc, 'kopru-ses', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        const sts = []; node.port.onmessage = (e) => { if (e.data.t === 'd') sts.push(e.data.st); };
        node.connect(oc.destination);
        for (let s = 0; s < 100; s++) { const l = new Float32Array(480), r = new Float32Array(480); for (let i = 0; i < 480; i++) l[i] = r[i] = 0.3 * Math.sin(2 * Math.PI * 440 * (s * 480 + i) / 48000); node.port.postMessage({ t: 'k', s, l, r }); }
        const buf = await oc.startRendering();
        await sleep(300);
        const ch = buf.getChannelData(0); let e = 0; for (let i = 0; i < ch.length; i++) e += ch[i] * ch[i];
        calici = { yuklendi: true, rms: +Math.sqrt(e / ch.length).toFixed(4), istatistik: sts.length, son: sts.at(-1) || null };
      } catch (e) {
        // Çevrimdışı bağlamda AudioWorklet yoksa: canlı bağlamda modül yüklenip düğüm kuruluyor mu.
        try {
          const ac = new AudioContext();
          await ac.audioWorklet.addModule(new URL('js/ses-isleyici.js', location.href));
          new AudioWorkletNode(ac, 'kopru-ses', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
          calici = { yuklendi: true, cevrimdisiHata: String(e), canliBaglam: ac.state };
          ac.close();
        } catch (e2) { calici = { yuklendi: false, hata: String(e) + ' | ' + String(e2) }; }
      }
      const temel = { yetenek: !!app.caps?.audio, audseq: !!app.caps?.audseq, acik: !!app.audioOn, hata: app.audioErr || '', kanal, paketSn, sureler, cozum, calici };
      if (!paketSn) rep({ t: 'ses', ok: calici?.yuklendi ? undefined : false, bilgi: !!calici?.yuklendi, atlandi: 'Windows\'tan ses gelmiyor (ses aygıtı yok ya da ses kapalı)', ...temel });
      else rep({ t: 'ses', ok: kanal?.protokol === 'sira16' && kanal?.sirali === false && paketSn >= 80 && paketSn <= 125 && sureler.length === 1 && sureler[0] === 10 && cozum?.ornek?.[0] === 480 && !!calici?.yuklendi, ...temel });
      // Canlı çalıcı: iOS sesi ancak gerçek bir dokunuştan sonra açar. Sunucudan
      // simülatöre gerçek bir dokunuş istenir; olmazsa yalnızca bildirilir.
      let gercek = null;
      if (paketSn && app.audio.ctx?.state !== 'running') { gercek = await istek('dokun'); await sleep(2500); }
      await sleep(paketSn ? 3000 : 0);
      rep({ t: 'ses-cikis', bilgi: true, baglam: app.audio.ctx?.state || 'yok', calici: app.audio.wl, gercekDokunus: gercek, oynatici: app.audio.stats(), not: app.audioNote(), cikisGecikmesiMs: app.audio.ctx ? Math.round(((app.audio.ctx.outputLatency || 0) + (app.audio.ctx.baseLatency || 0)) * 1000) : null });
    });
    // Döndürme: simülatör yan çevrilir (sunucu, Simulator menüsü). Görüntü yeni yöne
    // sığmalı, akış boyutu (otomatik) uymalı, dokunuş yine yerine düşmeli.
    await dene('dondurme', async () => {
      const once = { ekran: [innerWidth, innerHeight], akis: dims() };
      const r = await istek('dondur', { yon: 'sol' });
      const yatay = await waitFor(() => innerWidth > innerHeight, 10000);
      if (!yatay) return rep({ t: 'dondurme', bilgi: true, atlandi: 'simülatör döndürülemedi', istek: r, once });
      await sleep(3000);
      const tv = $('canvas').getBoundingClientRect(), sh = st().getBoundingClientRect();
      const sigdi = tv.left >= sh.left - 1 && tv.right <= sh.right + 1 && tv.top >= sh.top - 1 && tv.bottom <= sh.bottom + 1 && (Math.abs(tv.width - sh.width) < 2 || Math.abs(tv.height - sh.height) < 2);
      const akisUydu = await waitFor(() => dims().w !== once.akis.w && dims(), 8000);
      await foto('07-yatay');
      tus('F9'); await sleep(800);
      const prev = findDot();
      await tap(0.435, 0.45);
      const dot = await waitFor(() => { const d = findDot(); return d && (!prev || Math.hypot(d.x - prev.x, d.y - prev.y) > 0.01) ? d : null; }, 3000);
      tus('F2');
      const W = app.currentDisplay?.w || dims().w, H = app.currentDisplay?.h || dims().h;
      const fark = dot ? [Math.round((dot.x - 0.435) * W), Math.round((dot.y - 0.45) * H)] : null;
      const yan = { ekran: [innerWidth, innerHeight], tuval: [Math.round(tv.width), Math.round(tv.height)], sahne: [Math.round(sh.width), Math.round(sh.height)], sigdi, akis: akisUydu || dims() };
      const geri = await istek('dondur', { yon: 'sag' });
      const dikey = await waitFor(() => innerHeight > innerWidth, 10000);
      await sleep(2000);
      rep({ t: 'dondurme', ok: sigdi && !!fark && Math.abs(fark[0]) <= TOL && Math.abs(fark[1]) <= TOL, once, yatay: yan, dokunusFark: fark, geriDondu: !!dikey, istek: r, geriIstek: geri });
    });
    // Uygulama değiştirme: iOS sayfayı askıya alır; geri dönünce bağlantı kendiliğinden
    // toparlanmalı, veri kanalı yolu sürmeli, profil "çözülemiyor" diye işaretlenmemeli.
    await dene('arka-plan', async () => {
      let hiddenAt = 0;
      const back = new Promise((res) => document.addEventListener('visibilitychange', () => {
        if (document.hidden) hiddenAt = Date.now();
        else if (hiddenAt) res(Date.now());
      }));
      rep({ t: 'arka-plan-hazir' });
      istek('arka-plan');
      const vis = await Promise.race([back, sleep(120000).then(() => 0)]);
      if (!vis) return rep({ t: 'geri-donus', ok: false, hata: 'sayfa gizlenip geri gelmedi' });
      // Toparlanma: dönüşte çözücü yenilenir, anahtar kare istenir; ilk yeni kare çözülmeli.
      const d1 = decoded(), t1 = performance.now();
      const okb = await waitFor(() => app.session?.state === 'connected' && decoded() > d1, 20000);
      const ms = Math.round(performance.now() - t1);
      // Akış sürüyor mu: ekranı değiştir (F4 deseni aç/kapat), yeni kareler gelmeli.
      const d2 = decoded();
      tus('F4'); await sleep(1500); tus('F4');
      const akiyor = await waitFor(() => decoded() >= d2 + 2, 8000);
      const y = await yol();
      let kotu = [];
      try { kotu = Object.keys(JSON.parse(localStorage.getItem('kopru.cozulemeyen') || '{}')).filter((k) => k.startsWith('wc:')); } catch {}
      await foto('08-geri-donus');
      rep({ t: 'geri-donus', ok: !!okb && !!akiyor && y.veriKanali && !y.video && !kotu.length, arkaPlanSn: Math.round((vis - hiddenAt) / 1000), toparlanmaMs: okb ? ms : null, sonraAkiyor: !!akiyor, durum: app.session?.state, yol: y, cozulemeyen: kotu, cizim: app.wcNote() });
    });
    await sleep(5000); // ekran görüntüleri için bağlı kal
    rep({ t: 'bitti', sureSn: Math.round((performance.now() - t0) / 1000) });
  })();
})();
