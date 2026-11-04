// Çift yönlü pano.
//
//  Buradan oraya: Ctrl+V'ye basıldığında tarayıcının 'paste' olayından yerel pano
//  (metin, görsel veya dosyalar) okunur → uzak panoya yazılır → onay gelince uzakta
//  Ctrl+V basılır. Dosyalar önce uzak bilgisayara yüklenir, sonra Windows panosuna
//  dosya olarak (CF_HDROP) konur: Explorer'da doğrudan yapıştırılır.
//
//  Oradan buraya: uzakta kopyalanan içerik anında gelir ve yerel panoya yazılır.
//  Safari kullanıcı hareketi istediği için Ctrl+C anında, içeriği sonradan gelecek
//  bir ClipboardItem oluşturulur.

const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

async function toPNG(blob) {
  if (blob.type === 'image/png') return blob;
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

export class Clip {
  constructor(app) {
    this.app = app;
    this.remote = null;     // uzak panonun son içeriği
    this.lastSentText = null;
    this.ackSeq = 0;
    this.acks = new Map();
    this.copyWaiter = null;
    document.addEventListener('paste', (e) => this.onPaste(e));
    window.addEventListener('focus', () => this.autoPush());
  }

  get enabled() { return this.app.settings.syncClipboard !== false && this.app.caps.clipboard !== false; }

  // ---------- uzaktan gelen ----------
  onRemote(m) {
    this.remote = m;
    this.app.renderClipSheet?.();
    if (!this.enabled) return;
    if (m.kind === 'files') {
      if (m.initial) return;
      const n = m.files.length;
      const label = n === 1 ? m.files[0].name : `${n} öğe`;
      this.app.toast(`Uzak bilgisayarda kopyalandı: ${label}`, { action: 'İndir', onAction: () => this.app.files.downloadClipFiles(m.files), timeout: 12000 });
      return;
    }
    if (m.kind === 'text') this.lastSentText = m.text; // geri yankılamayı önle
    if (this.copyWaiter) { const w = this.copyWaiter; this.copyWaiter = null; w(m); return; }
    if (m.initial) return;
    this.writeLocal(m).catch(() => {
      if (m.kind === 'text' || m.kind === 'image') {
        this.app.toast('Uzak panoda yeni içerik var', { action: 'Kopyala', onAction: () => this.writeLocal(m), timeout: 8000 });
      }
    });
  }

  async writeLocal(m) {
    if (!navigator.clipboard) throw new Error('pano yok');
    if (m.kind === 'text') return navigator.clipboard.writeText(m.text);
    if (m.kind === 'image') {
      const blob = new Blob([fromB64(m.png)], { type: 'image/png' });
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
  }

  // Ctrl+C / Ctrl+X: Safari'de kullanıcı hareketi içinde gecikmeli pano öğesi oluştur.
  expectCopy() {
    if (!this.enabled || !isSafari || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return;
    const p = new Promise((resolve, reject) => {
      this.copyWaiter = resolve;
      setTimeout(() => { if (this.copyWaiter === resolve) { this.copyWaiter = null; reject(new Error('zaman aşımı')); } }, 3000);
    });
    const text = p.then((m) => new Blob([m.kind === 'text' ? m.text : ''], { type: 'text/plain' }));
    navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })]).catch(() => {});
  }

  // ---------- yerelden giden ----------
  sendClip(obj) {
    const ack = ++this.ackSeq;
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.acks.delete(ack); resolve(false); }, 4000);
      this.acks.set(ack, (ok) => { clearTimeout(t); resolve(ok); });
      if (!this.app.session?.sendCtl({ t: 'clip', ack, ...obj })) { clearTimeout(t); this.acks.delete(ack); resolve(false); }
    });
  }
  onAck(m) { const f = this.acks.get(m.ack); if (f) { this.acks.delete(m.ack); f(m.ok); } }

  async sendText(text) {
    if (text == null) return false;
    this.lastSentText = text;
    return this.sendClip({ kind: 'text', text });
  }
  async sendImage(blob) {
    const png = await toPNG(blob);
    if (png.size > 20 * 1024 * 1024) { this.app.toast('Görsel çok büyük (20 MB sınırı)'); return false; }
    return this.sendClip({ kind: 'image', png: toB64(await png.arrayBuffer()) });
  }

  beginPaste(done) {
    clearTimeout(this.pasteTimer);
    this.pasteDone = done;
    // Paste olayı gelmezse (boş pano vb.) yine de Ctrl+V gönder.
    this.pasteTimer = setTimeout(() => this.finishPaste(), 700);
  }
  finishPaste() {
    clearTimeout(this.pasteTimer);
    const d = this.pasteDone; this.pasteDone = null;
    d?.();
  }

  async onPaste(e) {
    if (!this.app.viewerActive || this.app.modalOpen) return;
    const t = e.target;
    if (t && t !== this.app.$('kbdsink') && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (!this.enabled) return this.finishPaste();
    clearTimeout(this.pasteTimer);
    const dt = e.clipboardData;
    const files = [...(dt?.files || [])];
    try {
      // Tek bir görsel (ekran görüntüsü) görsel olarak; diğer her şey dosya olarak aktarılır.
      if (files.length > 1 || (files.length === 1 && !files[0].type.startsWith('image/'))) {
        // Dosyalar: uzak bilgisayara yükle, panoya dosya olarak koy, sonra yapıştır.
        const done = this.pasteDone; this.pasteDone = null;
        const paths = await this.app.files.uploadFiles(files, { clipboard: true });
        if (paths.length) this.app.session?.sendCtl({ t: 'clipfiles', paths, paste: !!done });
        return;
      }
      const img = [...(dt?.items || [])].find((i) => i.type.startsWith('image/'));
      const text = dt?.getData('text/plain');
      if (text) await this.sendText(text);
      else if (img) await this.sendImage(img.getAsFile());
    } catch (err) {
      console.warn('yapıştırma', err);
    }
    this.finishPaste();
  }

  // Pencereye dönüldüğünde yerel panoyu sessizce uzağa aktar (izin verilmişse).
  async autoPush() {
    if (!this.enabled || !this.app.viewerActive || !navigator.clipboard?.readText || isSafari) return;
    try {
      const st = await navigator.permissions?.query({ name: 'clipboard-read' });
      if (st && st.state !== 'granted') return;
      const text = await navigator.clipboard.readText();
      if (text && text !== this.lastSentText) await this.sendText(text);
    } catch {}
  }

  // "Telefonun panosunu gönder" düğmesi (kullanıcı hareketi içinde).
  async pushNow() {
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const imgType = it.types.find((t) => t.startsWith('image/'));
          if (imgType) { await this.sendImage(await it.getType(imgType)); this.app.toast('Görsel uzak panoya gönderildi'); return; }
          if (it.types.includes('text/plain')) { await this.sendText(await (await it.getType('text/plain')).text()); this.app.toast('Metin uzak panoya gönderildi'); return; }
        }
      }
      const text = await navigator.clipboard.readText();
      await this.sendText(text);
      this.app.toast('Metin uzak panoya gönderildi');
    } catch (e) {
      this.app.toast('Pano okunamadı: tarayıcı izin vermedi');
    }
  }
}
