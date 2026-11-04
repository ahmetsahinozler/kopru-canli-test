// Dosya gezgini ve aktarımlar. Veri 'fs' kanalından akar:
//   [u8 tür][u32 no][yük]  tür: 1 veri, 2 dosya başlığı (JSON), 3 dosya sonu, 4 aktarım sonu (JSON)
const DATA = 1, BEGIN = 2, END = 3, XEND = 4;
const CHUNK = 32 * 1024;
const HIGH = 4 * 1024 * 1024;

const fmtSize = (n) => {
  if (n == null || n < 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
};
const fmtDate = (s) => s ? new Date(s * 1000).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';

export class Files {
  constructor(app) {
    this.app = app;
    this.nextId = 1;
    this.req = 1;
    this.pending = new Map();   // ctl istek no → çözücü
    this.xfers = new Map();     // aktarım no → durum
    this.path = '';
    this.sel = new Set();
    this.entries = [];
    this.bindDrop();
  }
  get s() { return this.app.session; }
  $(id) { return this.app.$(id); }

  // ---- ctl istek/yanıt ----
  call(t, args = {}) {
    const req = this.req++;
    return new Promise((resolve, reject) => {
      this.pending.set(req, { resolve, reject });
      if (!this.s?.sendCtl({ t, req, ...args })) { this.pending.delete(req); reject(new Error('bağlantı yok')); }
      setTimeout(() => { if (this.pending.delete(req)) reject(new Error('zaman aşımı')); }, 20000);
    });
  }
  onCtl(m) {
    switch (m.t) {
      case 'fsr': {
        const p = this.pending.get(m.req);
        if (!p) return;
        this.pending.delete(m.req);
        m.ok ? p.resolve(m) : p.reject(new Error(m.err || 'hata'));
        break;
      }
      case 'xack': { const x = this.xfers.get(m.id); if (x) { x.acked = m.bytes; this.render(x); } break; }
      case 'uldone': { const x = this.xfers.get(m.id); if (x) { x.done = true; x.path = m.path; x.resolve?.(m.path); this.finish(x); } break; }
      case 'xerr': {
        const x = this.xfers.get(m.id);
        if (x) { x.error = m.err; x.reject?.(new Error(m.err)); this.finish(x); }
        else this.app.toast(m.err);
        break;
      }
    }
  }

  // ---- gezgin ----
  async open(path = this.path) {
    this.$('fs-list').innerHTML = '<div class="muted pad">Yükleniyor…</div>';
    try {
      const r = await this.call('ls', { path });
      this.path = r.path;
      this.parent = r.parent;
      this.sep = r.sep || '\\';
      this.sel.clear();
      this.entries = r.roots ? r.roots.map((x) => ({ n: x.n, d: true, p: x.p, k: x.k })) : r.entries.map((e) => ({ ...e, p: this.join(r.path, e.n) }));
      this.renderList();
    } catch (e) {
      this.$('fs-list').innerHTML = '';
      const d = document.createElement('div'); d.className = 'muted pad'; d.textContent = 'Açılamadı: ' + e.message;
      this.$('fs-list').appendChild(d);
    }
  }
  join(dir, name) { const sep = this.sep || (dir.includes('\\') ? '\\' : '/'); return dir.endsWith(sep) ? dir + name : dir + sep + name; }

  renderList() {
    this.$('fs-path').textContent = this.path || 'Bu bilgisayar';
    this.$('fs-up').disabled = !this.path;
    const showHidden = this.$('fs-hidden').checked;
    const list = this.$('fs-list');
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const e of this.entries) {
      if (e.h && !showHidden) continue;
      const row = document.createElement('div');
      row.className = 'fs-row' + (this.sel.has(e.p) ? ' sel' : '');
      const icon = e.k === 'drive' ? '💽' : e.k === 'desktop' ? '🖥️' : e.k === 'downloads' ? '⬇️' : e.k === 'documents' ? '📄' : e.k === 'home' ? '🏠' : e.d ? '📁' : '📄';
      row.innerHTML = `<span class="ic"></span><span class="nm"></span><span class="sz"></span><span class="dt"></span>`;
      row.querySelector('.ic').textContent = icon;
      row.querySelector('.nm').textContent = e.n;
      row.querySelector('.sz').textContent = e.d ? '' : fmtSize(e.s);
      row.querySelector('.dt').textContent = fmtDate(e.m);
      row.onclick = (ev) => {
        if (e.d && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && !this.selectMode) return this.open(e.p);
        this.sel.has(e.p) ? this.sel.delete(e.p) : this.sel.add(e.p);
        row.classList.toggle('sel');
        this.updateSel();
      };
      row.oncontextmenu = (ev) => { ev.preventDefault(); this.sel.add(e.p); row.classList.add('sel'); this.updateSel(); };
      frag.appendChild(row);
    }
    if (!frag.childNodes.length) { const d = document.createElement('div'); d.className = 'muted pad'; d.textContent = 'Boş klasör'; frag.appendChild(d); }
    list.appendChild(frag);
    this.updateSel();
  }
  updateSel() {
    const n = this.sel.size;
    this.$('fs-dl').disabled = n === 0;
    this.$('fs-rm').disabled = n === 0;
    this.$('fs-selinfo').textContent = n ? `${n} seçili` : '';
    this.$('fs-ul').disabled = !this.path;
    this.$('fs-mkdir').disabled = !this.path;
  }
  up() { if (this.path) this.open(this.parent || ''); }

  async mkdir() {
    const name = prompt('Yeni klasör adı:');
    if (!name) return;
    try { await this.call('mkdir', { path: this.join(this.path, name) }); this.open(); } catch (e) { this.app.toast(e.message); }
  }
  async remove() {
    const items = [...this.sel];
    if (!items.length || !confirm(`${items.length} öğe uzak bilgisayardan kalıcı olarak silinsin mi?`)) return;
    for (const p of items) { try { await this.call('rm', { path: p }); } catch (e) { this.app.toast(e.message); } }
    this.open();
  }
  downloadSelected() {
    const paths = [...this.sel];
    const dirs = this.entries.filter((e) => this.sel.has(e.p) && e.d).length;
    this.download(paths, { zip: paths.length > 1 || dirs > 0 });
  }
  downloadClipFiles(files) {
    const zip = files.length > 1 || files.some((f) => f.dir);
    this.download(files.map((f) => f.path), { zip });
  }

  // ---- indirme ----
  async download(paths, { zip } = {}) {
    const id = this.nextId++;
    const x = { id, dir: 'down', name: paths.length === 1 ? paths[0].split(/[\\/]/).pop() : `${paths.length} öğe`, size: -1, got: 0, t0: performance.now(), parts: [], writer: null };
    this.xfers.set(id, x);
    this.render(x);
    this.app.showTransfers();
    if (!this.s?.sendCtl({ t: 'dl', id, paths, zip: !!zip })) { x.error = 'bağlantı yok'; this.finish(x); }
  }

  async onData(buf) {
    const dv = new DataView(buf);
    const typ = dv.getUint8(0), id = dv.getUint32(1, true);
    const x = this.xfers.get(id);
    if (!x || x.dir !== 'down') return;
    const payload = new Uint8Array(buf, 5);
    if (typ === BEGIN) {
      const h = JSON.parse(new TextDecoder().decode(payload));
      x.name = h.name; x.size = h.size; x.estimate = h.estimate;
      // Büyük dosyaları masaüstü Chrome'da doğrudan diske yaz (bellek şişmesin).
      const big = (h.size > 300 * 1024 * 1024) || (h.size < 0 && h.estimate > 300 * 1024 * 1024);
      if (big && window.showSaveFilePicker) {
        x.queue = Promise.resolve();
        x.queue = x.queue.then(async () => {
          try {
            const fh = await showSaveFilePicker({ suggestedName: h.name });
            x.writer = await fh.createWritable();
            for (const p of x.parts) await x.writer.write(p);
            x.parts = [];
          } catch { /* iptal: belleğe toplamaya devam */ }
        });
      }
      this.render(x);
    } else if (typ === DATA) {
      const chunk = payload.slice();
      x.got += chunk.length;
      if (x.writer) { x.queue = x.queue.then(() => x.writer.write(chunk)); }
      else x.parts.push(chunk);
      const now = performance.now();
      if (!x.lastRender || now - x.lastRender > 200) { x.lastRender = now; this.render(x); }
    } else if (typ === END) {
      if (x.queue) await x.queue;
      if (x.writer) { await x.writer.close(); }
      else {
        const blob = new Blob(x.parts);
        x.parts = [];
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = x.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      }
      x.done = true;
    } else if (typ === XEND) {
      const r = JSON.parse(new TextDecoder().decode(payload) || '{}');
      if (!r.ok) x.error = r.err || 'hata';
      this.finish(x);
    }
  }

  // ---- yükleme ----
  // files: File[] (isteğe bağlı .rel: klasör içi göreli yol). Hedef boşsa uzak İndirilenler\Kopru.
  async uploadFiles(files, { dir = '', clipboard = false } = {}) {
    const paths = [];
    this.app.showTransfers();
    for (const f of files) {
      try { paths.push(await this.uploadOne(f, dir)); } catch (e) { this.app.toast(`${f.name}: ${e.message}`); }
    }
    if (paths.length && !clipboard) this.app.toast(`${paths.length} dosya gönderildi`);
    if (this.path && this.$('files').classList.contains('open')) this.open();
    return paths;
  }

  uploadOne(file, dir) {
    const id = this.nextId++;
    const dc = this.s?.dc.fs;
    if (!dc || dc.readyState !== 'open') return Promise.reject(new Error('bağlantı yok'));
    const x = { id, dir: 'up', name: file.rel || file.name, size: file.size, got: 0, t0: performance.now() };
    this.xfers.set(id, x);
    this.render(x);
    const p = new Promise((resolve, reject) => { x.resolve = resolve; x.reject = reject; });
    const frame = (typ, payload) => {
      const b = new Uint8Array(5 + (payload ? payload.byteLength : 0));
      b[0] = typ; new DataView(b.buffer).setUint32(1, id, true);
      if (payload) b.set(new Uint8Array(payload), 5);
      return b.buffer;
    };
    (async () => {
      dc.bufferedAmountLowThreshold = 1024 * 1024;
      dc.send(frame(BEGIN, new TextEncoder().encode(JSON.stringify({ dir, name: file.name, rel: file.rel || '', size: file.size }))));
      const READ = 1024 * 1024;
      for (let off = 0; off < file.size; off += READ) {
        if (x.cancel || x.error) return;
        const buf = await file.slice(off, off + READ).arrayBuffer();
        for (let i = 0; i < buf.byteLength; i += CHUNK) {
          while (dc.bufferedAmount > HIGH) {
            await new Promise((r) => { const t = setTimeout(r, 100); dc.addEventListener('bufferedamountlow', () => { clearTimeout(t); r(); }, { once: true }); });
            if (dc.readyState !== 'open') throw new Error('bağlantı koptu');
          }
          dc.send(frame(DATA, buf.slice(i, i + CHUNK)));
          x.got += Math.min(CHUNK, buf.byteLength - i);
        }
        this.render(x);
      }
      dc.send(frame(END));
      x.got = file.size;
      this.render(x);
    })().catch((e) => { x.error = e.message; x.reject(e); this.finish(x); });
    return p;
  }

  cancel(id) {
    const x = this.xfers.get(id);
    if (!x) return;
    x.cancel = true; x.error = 'iptal edildi';
    this.s?.sendCtl({ t: 'xcancel', id });
    x.reject?.(new Error('iptal edildi'));
    this.finish(x);
  }

  finish(x) {
    x.end = performance.now();
    this.render(x);
    if (x.error && x.error !== 'iptal edildi') this.app.toast(`${x.name}: ${x.error}`);
  }

  // ---- aktarım listesi ----
  render(x) {
    let row = document.getElementById('xf-' + x.id);
    const box = this.$('xfers');
    if (!row) {
      row = document.createElement('div');
      row.id = 'xf-' + x.id; row.className = 'xf';
      row.innerHTML = '<div class="xf-top"><span class="xf-dir"></span><span class="xf-name"></span><button class="xf-x" title="İptal">✕</button></div><div class="bar"><i></i></div><div class="xf-info muted"></div>';
      row.querySelector('.xf-x').onclick = () => x.end ? row.remove() : this.cancel(x.id);
      box.prepend(row);
    }
    row.querySelector('.xf-dir').textContent = x.dir === 'up' ? '⬆' : '⬇';
    row.querySelector('.xf-name').textContent = x.name;
    const total = x.size > 0 ? x.size : x.estimate || 0;
    const pct = total ? Math.min(100, (x.got / total) * 100) : (x.done ? 100 : 0);
    row.querySelector('.bar i').style.width = pct + '%';
    const el = ((x.end || performance.now()) - x.t0) / 1000;
    const speed = el > 0.2 ? x.got / el : 0;
    let info = `${fmtSize(x.got)}${total ? ' / ' + fmtSize(total) : ''}`;
    if (x.error) info = 'Hata: ' + x.error;
    else if (x.end) info += ` · tamamlandı (${fmtSize(speed)}/sn)`;
    else if (speed) info += ` · ${fmtSize(speed)}/sn`;
    row.querySelector('.xf-info').textContent = info;
    row.classList.toggle('err', !!x.error);
    row.classList.toggle('ok', !!x.end && !x.error);
  }

  // ---- sürükle-bırak ----
  bindDrop() {
    const st = this.app.$('stage');
    st.addEventListener('dragover', (e) => { if (this.app.viewerActive) { e.preventDefault(); st.classList.add('drop'); } });
    st.addEventListener('dragleave', () => st.classList.remove('drop'));
    st.addEventListener('drop', async (e) => {
      st.classList.remove('drop');
      if (!this.app.viewerActive) return;
      e.preventDefault();
      const files = await collectDropped(e.dataTransfer);
      if (!files.length) return;
      const inPanel = this.$('files').classList.contains('open') && this.path;
      const paths = await this.uploadFiles(files, { dir: inPanel ? this.path : '' });
      if (paths.length && !inPanel) {
        // Panoya koy: uzakta istediği klasörde Ctrl+V ile yapıştırabilir.
        this.s?.sendCtl({ t: 'clipfiles', paths: topLevel(paths, files), paste: false });
        this.app.toast('Dosyalar uzak bilgisayarın "İndirilenler\\Kopru" klasörüne kaydedildi ve panoya kondu — istediğiniz yerde Ctrl+V', { timeout: 8000 });
      }
    });
  }
}

function topLevel(paths, files) {
  // Klasör yüklemelerinde panoya yalnızca üst düzey öğeleri koy.
  const out = new Set();
  paths.forEach((p, i) => {
    const rel = files[i]?.rel;
    if (!rel || !rel.includes('/')) { out.add(p); return; }
    const depth = rel.split('/').length - 1;
    let q = p;
    for (let d = 0; d < depth; d++) q = q.replace(/[\\/][^\\/]+$/, '');
    out.add(q);
  });
  return [...out];
}

async function collectDropped(dt) {
  const out = [];
  const items = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!items.length) return [...dt.files];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const f = await new Promise((res, rej) => entry.file(res, rej));
      f.rel = prefix ? prefix + '/' + f.name : '';
      out.push(f);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, prefix ? prefix + '/' + entry.name : entry.name);
      } while (batch.length);
    }
  };
  for (const e of items) await walk(e, '');
  return out;
}

export { fmtSize };
