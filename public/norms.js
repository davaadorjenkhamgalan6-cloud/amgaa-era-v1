// AMGAA ERA — Цахилгаан байгууламжийн дүрэм (ЦБД): файлаас оруулах, заалтаар хуваах, хайх.
// ES модуль: хөтөч (index.html) болон сервер (api/agent.js, api/chat.js) хоёулаа ашиглана.
// Импорт хийхэд хөтчийн API (indexedDB, document) хэрэглэхгүй — зөвхөн функц дотор.

export const CODE = 'ЦБД';

// ---------- Текстийг заалтаар хуваах ----------
// "1.7.32." / "2.1.5" гэх мэт дугаараар эхэлсэн мөр шинэ заалт эхлүүлнэ. "1-р бүлэг", "БҮЛЭГ 1" — бүлгийн гарчиг.
const SEC = /^\s*(\d{1,2}(?:\.\d{1,3}){1,4})\.?\s+(\S.*)$/;
const CHAP = /^\s*((?:[IVX]+|\d{1,2})\s*[-–]?\s*(?:р|дүгээр|дугаар|дахь)?\s*бүлэг(?=[\s.,:]|$).*|[а-яөүё]+(?:дугаар|дүгээр|дахь)\s+бүлэг(?=[\s.,:]|$).*|бүлэг\s+[IVX\d]+.*|[IVX]+\.\s+\S.*)$/i;
const MAX = 1800;

// pages: [{ page, text }] эсвэл нэг мөр текст
export function chunkText(pages) {
  if (typeof pages === 'string') pages = [{ page: null, text: pages }];
  const out = [];
  let chapter = '', cur = null;
  const push = () => {
    if (!cur) return;
    const body = cur.lines.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (body.length > 15) {
      // Урт заалтыг хэсэглэнэ (өгүүлбэрийн хилээр)
      const parts = [];
      let rest = body;
      while (rest.length > MAX) {
        let cut = rest.lastIndexOf('. ', MAX); if (cut < MAX * 0.5) cut = rest.lastIndexOf(' ', MAX); if (cut < 1) cut = MAX;
        parts.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
      }
      if (rest) parts.push(rest);
      parts.forEach((content, i) => out.push({ id: 'c' + out.length, code: CODE, section: cur.section || (cur.page != null ? `х.${cur.page}` : 'Оршил'), part: parts.length > 1 ? i + 1 : undefined,
        title: chapterTitle(cur.chapter), page: cur.page, content }));
    }
    cur = null;
  };
  let numbered = 0;
  for (const { page, text } of pages) {
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.replace(/ /g, ' ').trimEnd();
      if (!line.trim()) { if (cur) cur.lines.push(''); continue; }
      const c = line.match(CHAP);
      if (c && line.length < 160) { push(); chapter = line.trim(); continue; }
      const m = line.match(SEC);
      if (m && plausible(m[1], m[2])) { push(); numbered++; cur = { section: m[1], chapter, page, lines: [line.trim()] }; continue; }
      if (!cur) cur = { section: page != null ? `х.${page}` : '', chapter, page, lines: [] };
      cur.lines.push(line.trim());
      // Дугааргүй баримтыг ~1000 тэмдэгтээр хэсэглэнэ
      if (!numbered && cur.lines.join(' ').length > 1000) push();
    }
    if (!numbered) push();                       // дугааргүй бол хуудас бүр тусдаа
  }
  push();
  return out;
}
const chapterTitle = (c) => (c || '').replace(/\s+/g, ' ').slice(0, 120);
// "2.5 мм" гэх мэт хэмжээг заалт гэж андуурахгүй: дараагийн үг нь нэгж бол алгасна
function plausible(num, rest) {
  const n = num.split('.').map(Number);
  if (n.some((x) => x > 300) || n[0] === 0) return false;
  return !/^(мм|см|м|км|кв|в|ва|ква|мва|а|ка|ма|ом|мом|гц|вт|квт|мвт|%|°|х|-аас|-ээс|дахин|сек|с|мин|цаг|жил|сар|хоног)(\b|[\s²³.,)])/i.test(rest);
}

// ---------- Хайлт (BM25, монгол үгийн язгуурыг ойролцоогоор) ----------
const STOP = new Set(('болон бол нь юм байх байна байдаг тухай ямар хэд хэдэн вэ уу үү бэ энэ тэр ба эсвэл гэж гэх хэрхэн яаж дүрэм дүрмийн цбд заалт заалтыг заасан ' +
  'хэрэгтэй шаардлагатай шаардлага ямар ямархуу хэр хэрэв бас мөн бүр бүх ч л зөвхөн дээр доор онд оны тул учир гэвэл бөгөөд харин хийх хийнэ байгаа').split(' '));
export function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»“”"'()[\]{}:;,!?]/g, ' '); }
export function terms(s) {
  const out = [];
  for (let w of norm(s).split(/[^0-9a-zа-яөүa-z.]+/i)) {
    w = w.replace(/^\.+|\.+$/g, '');
    if (!w) continue;
    if (/^\d+(\.\d+)+$/.test(w)) { out.push('#' + w); continue; }   // заалтын дугаар
    if (/^\d+$/.test(w)) { if (w.length >= 2) out.push(w); continue; }
    if (w.length < 3 || STOP.has(w)) continue;
    out.push(w.length > 5 ? w.slice(0, 5) : w);
  }
  return out;
}
// chunks → индекс (нэг удаа тооцоод хадгална)
export function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const t = terms(`${c.section} ${c.content}`);
    const tf = new Map(); for (const x of t) tf.set(x, (tf.get(x) || 0) + 1);
    if (c.section && /^\d/.test(c.section)) tf.set('#' + c.section, (tf.get('#' + c.section) || 0) + 3);
    return { c, tf, len: t.length };
  });
  const df = new Map();
  for (const d of docs) for (const k of d.tf.keys()) df.set(k, (df.get(k) || 0) + 1);
  const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg, N: docs.length };
}
export function search(index, q, k = 6) {
  if (!index || !index.N) return [];
  const qt = [...new Set(terms(q))];
  if (!qt.length) return [];
  const K1 = 1.2, B = 0.75;
  const res = [];
  for (const d of index.docs) {
    let s = 0, hit = 0;
    for (const t of qt) {
      const f = d.tf.get(t); if (!f) continue;
      const df = index.df.get(t) || 0;
      const idf = Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
      s += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / index.avg)) * (t[0] === '#' ? 4 : 1);
      hit++;
    }
    if (hit) res.push({ ...d.c, score: Math.round(s * 100) / 100, matched: hit / qt.length });
  }
  res.sort((a, b) => b.score - a.score);
  // Сул илэрцийг хасна: дээд онооны 35%-аас бага, эсвэл асуултын үгийн 1/4-ээс бага таарсан
  const top = res[0] ? res[0].score : 0;
  return res.filter((r) => r.score >= top * 0.35 && (r.matched >= 0.25 || qt.length <= 2)).slice(0, k);
}
// Олон хайлтын илэрцийг нэгтгэнэ (агентад дамжуулах заалтууд)
export function pick(index, queries, k = 24) {
  const seen = new Map();
  for (const q of queries) for (const r of search(index, q, 4)) if (!seen.has(r.id) || seen.get(r.id).score < r.score) seen.set(r.id, r);
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
export const label = (c) => {
  const code = c.code || CODE, sec = String(c.section || '');
  return `${sec.startsWith(code + ' ') ? sec : `${code} ${sec}`}${c.part ? ` (${c.part})` : ''}`.trim();
};

// Файлын нэрээс дүрмийн товч код: ЦБД, ТЭД, эсвэл эхний үгсийн үсгээр (жишээ: "Галын аюулгүй байдлын дүрэм" → "ГАБД")
export function guessCode(name) {
  const n = String(name || '');
  if (/ТЭД|техник(ийн)?\s+ашиглалт/i.test(n)) return 'ТЭД';
  if (/ЦБД|байгууламжийн\s+дүрэм|БД-43-101/i.test(n)) return 'ЦБД';
  const w = n.replace(/[^А-ЯЁӨҮа-яёөүA-Za-z\s]/g, ' ').split(/\s+/).filter((x) => x.length > 1);
  return (w.slice(0, 4).map((x) => x[0]).join('').toUpperCase() || 'ДҮРЭМ');
}

// Олон дүрмийг нэг хайлтын сан болгоно. ЦБД-ээс бусад дүрмийн заалтын дугаарт кодыг нь угтвар болгож (жишээ: "ТЭД 2.1")
// ижил дугаартай заалтуудыг ялгана. id-г дүрэм бүрээр давхардалгүй болгоно.
export function mergeDocs(docs) {
  const out = [];
  for (const d of docs || []) {
    for (const c of d.chunks || []) {
      const code = c.code || d.code || CODE, sec = String(c.section || '');
      const section = code !== CODE && !sec.startsWith(code + ' ') ? `${code} ${sec}` : sec;
      out.push({ ...c, code, section, id: `${d.id || 'd'}-${c.id}` });
    }
  }
  return out;
}

// ---------- Файлаас текст гаргах (зөвхөн хөтөч) ----------
export async function extract(file, onProgress = () => {}) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdf(file, onProgress);
  if (name.endsWith('.docx')) return [{ page: null, text: await extractDocx(file) }];
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) return [{ page: null, text: await file.text() }];
  if (name.endsWith('.json')) { const j = JSON.parse(await file.text()); if (Array.isArray(j.chunks)) return { chunks: j.chunks }; }
  throw new Error('PDF, Word (.docx) эсвэл текст (.txt) файл оруулна уу. Хуучин .doc бол Word-оор нээж .docx болгож хадгална.');
}
async function extractPdf(file, onProgress) {
  const base = new URL('vendor/pdfjs/', document.baseURI).href;
  const pdfjs = await import(base + 'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    // y-координатаар мөр болгоно
    const rows = [];
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = Math.round(it.transform[5]);
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x: it.transform[4], s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push({ page: p, text: rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((x) => x.s).join('').replace(/\s+/g, ' ')).join('\n') });
    onProgress(p, doc.numPages);
  }
  if (pages.reduce((a, p) => a + p.text.trim().length, 0) < 50 * Math.min(doc.numPages, 3))
    throw new Error('PDF-ээс текст уншигдсангүй — скан хийсэн (зураг) PDF байж магадгүй. Word эсвэл текст хэлбэрийн PDF оруулна уу.');
  return pages;
}
// .docx = ZIP → word/document.xml (DecompressionStream "deflate-raw")
async function extractDocx(file) {
  const b = new Uint8Array(await file.arrayBuffer()), v = new DataView(b.buffer);
  let e = b.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Word файл гэмтэлтэй байна');
  let p = v.getUint32(e + 16, true);
  const n = v.getUint16(e + 10, true), dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const fname = dec.decode(b.subarray(p + 46, p + 46 + nl));
    if (fname === 'word/document.xml') {
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      const data = b.subarray(start, start + csize);
      const raw = method === 0 ? data : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      const xml = dec.decode(raw);
      return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error('Word файлаас текст олдсонгүй');
}

// ---------- Хадгалах: хөтчийн IndexedDB (нэг идэвхтэй дүрэм) ----------
const DB = 'amgaa_norms_v1';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function op(mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction('docs', mode); const q = fn(t.objectStore('docs')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
}
export const saveDoc = (doc) => op('readwrite', (s) => s.put({ ...doc, id: 'active' }));
export const loadDoc = () => op('readonly', (s) => s.get('active'));
export const clearDoc = () => op('readwrite', (s) => s.delete('active'));
// Олон дүрэм: дүрэм бүр өөрийн id-тай (хуучин 'active' нь эхний дүрэм хэвээр үлдэнэ)
export const listDocs = async () => ((await op('readonly', (s) => s.getAll())) || []).filter((d) => d && d.chunks && d.chunks.length)
  .sort((a, b) => String(a.imported || '').localeCompare(String(b.imported || '')));
export const addDoc = (doc) => op('readwrite', (s) => s.put(doc));
export const removeDoc = (id) => op('readwrite', (s) => s.delete(id));
// Апп-тай хамт ирсэн дүрэм (public/norms/cbd.json) — байвал бүх хэрэглэгчид ашиглана
export async function loadBundled() {
  try { const r = await fetch('norms/cbd.json', { cache: 'no-cache' }); if (!r.ok) return null; const j = await r.json(); return Array.isArray(j.chunks) && j.chunks.length ? j : null; } catch { return null; }
}
