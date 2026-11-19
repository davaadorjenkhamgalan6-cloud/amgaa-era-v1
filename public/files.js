// AMGAA ERA — үзлэгийн хавсралт (зураг, PDF): хөтчийн IndexedDB-д хадгална, зургийг багасгана, ZIP үүсгэнэ.
// Хөтөч дээр window.EraFiles, Node дээр (тест) globalThis.EraFiles.
(function (root) {
  const DB = 'amgaa_files_v1', ST = 'files';
  const MAX_SIDE = 1600, JPEG_Q = 0.82, MAX_PDF = 20 * 1024 * 1024;

  // ---------- IndexedDB ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { const s = rq.result.createObjectStore(ST, { keyPath: 'id' }); s.createIndex('insp', 'insp'); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error || new Error('IndexedDB нээгдсэнгүй'));
    });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(ST, mode), s = t.objectStore(ST);
      let out; const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Хадгалах зай хүрэлцэхгүй байж магадгүй'));
    });
  };
  const put = (f) => tx('readwrite', (s) => s.put(f));
  const del = (id) => tx('readwrite', (s) => s.delete(id));
  const get = (id) => tx('readonly', (s) => s.get(id));
  async function list(insp) {
    const all = await tx('readonly', (s) => s.index('insp').getAll(insp));
    return (all || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created.localeCompare(b.created));
  }
  async function removeInsp(insp) { for (const f of await list(insp)) await del(f.id); }

  // ---------- Зургийг багасгах (урт тал ≤ 1600px, JPEG) ----------
  function loadImg(file) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error(`${file.name}: зураг уншигдсангүй (JPG, PNG хэлбэрээр оруулна уу)`)); };
      im.src = u;
    });
  }
  async function shrink(file) {
    const im = await loadImg(file);
    const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', JPEG_Q));
    return { blob, w, h };
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const jpgName = (n) => n.replace(/\.[^.]+$/, '') + '.jpg';

  // Файлуудыг (зураг/PDF) нэмнэ. Буцаах: { added: [...], errors: [...] }
  async function add(insp, files, startOrder = 0) {
    const added = [], errors = [];
    let order = startOrder;
    for (const file of files) {
      try {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
          if (file.size > MAX_PDF) throw new Error(`${file.name}: 20 МБ-аас том PDF оруулах боломжгүй`);
          const f = { id: uid(), insp, kind: 'pdf', name: file.name, type: 'application/pdf', size: file.size, blob: file, created: new Date().toISOString(), order: order++ };
          await put(f); added.push(f);
        } else if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)) {
          const { blob, w, h } = await shrink(file);
          const f = { id: uid(), insp, kind: 'photo', name: jpgName(file.name), type: 'image/jpeg', size: blob.size, w, h, blob,
            caption: '', ind: '', inReport: true, created: new Date().toISOString(), order: order++ };
          await put(f); added.push(f);
        } else throw new Error(`${file.name}: зөвхөн зураг (JPG, PNG) эсвэл PDF оруулна`);
      } catch (e) { errors.push(e.message); }
    }
    return { added, errors };
  }
  async function update(id, patch) { const f = await get(id); if (!f) return null; Object.assign(f, patch); await put(f); return f; }

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
  function dataUrl(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }
  const size = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ';

  // ---------- ZIP (шахалтгүй "stored", UTF-8 нэртэй) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  // entries: [{ name, data: Uint8Array, date?: Date }] → Uint8Array
  function zip(entries) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    const seen = new Set();
    for (const e of entries) {
      const base = e.name.replace(/[\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
      let name = base;
      for (let i = 2; seen.has(name.toLowerCase()); i++) name = base.replace(/(\.[^./]+)?$/, ` (${i})$1`);
      seen.add(name.toLowerCase());
      const nb = enc.encode(name), d = e.data, crc = crc32(d), dt = e.date || new Date();
      const time = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1);
      const date = ((Math.max(1980, dt.getFullYear()) - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nb, d);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true);
      ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + d.length;
    }
    const cs = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cs, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }

  root.EraFiles = { add, list, get, update, remove: del, removeInsp, download, bytes, dataUrl, size, zip, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
