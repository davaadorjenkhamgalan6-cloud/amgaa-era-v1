// Хууль, дүрмийн файлыг (PDF / DOCX / TXT) апп-тай хамт ирэх хайлтын сан болгоно:
//   node scripts/import-norms.mjs <файл> <код> "<нэр>"
//   жишээ: node scripts/import-norms.mjs ЦБД.pdf ЦБД "Цахилгаан байгууламжийн дүрэм"
// Үр дүн: public/norms/<код>.json ба public/norms/index.json-д бүртгэнэ. Ингэснээр бүх хэрэглэгч, бүх хөтөч нэг сан ашиглана.
// PDF-д poppler-ийн pdftotext, DOCX-д unzip хэрэгтэй.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chunkText } from '../public/norms.js';

const [file, code, name] = process.argv.slice(2);
if (!file || !code) { console.error('Хэрэглээ: node scripts/import-norms.mjs <файл> <код> "<нэр>"'); process.exit(1); }
let pages;
if (/\.pdf$/i.test(file)) {
  const n = Number((execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/) || [])[1] || 0);
  pages = [];
  for (let p = 1; p <= n; p++) pages.push({ page: p, text: execFileSync('pdftotext', ['-f', String(p), '-l', String(p), '-enc', 'UTF-8', file, '-']).toString() });
} else if (/\.docx$/i.test(file)) {
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { maxBuffer: 1 << 28 }).toString();
  pages = [{ page: null, text: xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&') }];
} else pages = [{ page: null, text: readFileSync(file, 'utf8') }];

const chunks = chunkText(pages).map((c) => ({ ...c, code }));
const text = pages.reduce((a, p) => a + p.text.trim().length, 0);
if (text < 50) { console.error('Текст бараг олдсонгүй — скан (зураг) PDF байж магадгүй.'); process.exit(2); }
const dir = new URL('../public/norms/', import.meta.url);
mkdirSync(dir, { recursive: true });
// Файлын нэрийг латинаар (вэб сервер бүрт найдвартай): ЦБД → cbd.json
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',ө:'u',п:'p',р:'r',с:'s',т:'t',у:'u',ү:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const slug = [...code.toLowerCase()].map((ch) => TR[ch] ?? ch).join('').replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'rule';
const out = `${slug}.json`;
writeFileSync(new URL(out, dir), JSON.stringify({ name: name || code, code, imported: new Date().toISOString(), pages: pages.length, chunks }));
const ixUrl = new URL('index.json', dir);
const ix = existsSync(ixUrl) ? JSON.parse(readFileSync(ixUrl, 'utf8')) : { docs: [] };
ix.docs = ix.docs.filter((d) => d.file !== out).concat([{ file: out, name: name || code, code }]);
writeFileSync(ixUrl, JSON.stringify(ix, null, 2));
const numbered = chunks.filter((c) => /^\d/.test(c.section)).length;
console.log(`${out}: ${chunks.length} хэсэг, ${numbered} нь заалтын дугаартай, ${pages.length} хуудас`);
