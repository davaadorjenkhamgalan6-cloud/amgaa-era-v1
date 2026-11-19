import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { INDICATORS } from '../lib/agent/config.js';
await import('../public/files.js');
await import('../public/report.js');
const F = globalThis.EraFiles, R = globalThis.EraReport;
const IND = INDICATORS.map((i) => [i.no, i.weight, i.name]);
const scores = Object.fromEntries(IND.map(([no]) => [no, 6]));
const insp = { object_name: 'Зебра Хаус ХХК', location: 'УБ', inspection_date: '2026-11-04', engineer_name: 'Инженер', checklist: [], scores };
// 1×1 цагаан JPEG
const JPG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));

test('crc32 нь стандарт утгатай таарна', () => {
  assert.equal(F.crc32(new TextEncoder().encode('hello')), 0x3610a686);
});

test('ZIP: UTF-8 нэр, хавтас, давхардсан нэр — python zipfile уншина', () => {
  const enc = new TextEncoder();
  const z = F.zip([
    { name: 'Тайлан.docx', data: enc.encode('word') },
    { name: 'Зураг/Зураг 01 - самбар.jpg', data: JPG },
    { name: 'PDF/акт.pdf', data: enc.encode('%PDF-1.4') },
    { name: 'PDF/акт.pdf', data: enc.encode('%PDF-1.4 b') },
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'z')); const p = join(dir, 'a.zip'); writeFileSync(p, z);
  const out = execFileSync('python3', ['-c', 'import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps([[i.filename, len(z.read(i))] for i in z.infolist()], ensure_ascii=False))', p]).toString();
  assert.deepEqual(JSON.parse(out), [['Тайлан.docx', 4], ['Зураг/Зураг 01 - самбар.jpg', JPG.length], ['PDF/акт.pdf', 8], ['PDF/акт (2).pdf', 10]]);
});

test('тайлангийн хавсралт: зураг тайлбар, үзүүлэлттэй; PDF жагсаалт; сонгоогүй бол хавсралтгүй', () => {
  const m = R.buildModel(insp, IND, null, { photos: [{ caption: 'Самбарын таг байхгүй', ind: '6', w: 800, h: 600, src: 'data:image/jpeg;base64,AA' }, { caption: '', ind: '', w: 600, h: 800, src: 'data:image/jpeg;base64,BB' }], docs: [{ name: 'Газардуулгын акт.pdf' }] });
  assert.equal(m.photos[0].label, 'Зураг 1. Самбарын таг байхгүй (6. Цахилгаан самбар, хуваарилах хайрцаг)');
  assert.equal(m.photos[1].label, 'Зураг 2. Үзлэгийн зураг');
  const html = R.toHtml(m, '/');
  assert.match(html, /<div class="appx"><h2>Хавсралт<\/h2>/);
  assert.equal((html.match(/<figure>/g) || []).length, 2);
  assert.match(html, /<li>Газардуулгын акт\.pdf<\/li>/);
  assert.ok(html.indexOf('class="sign"') < html.indexOf('class="appx"'), 'хавсралт гарын үсгийн дараа');
  assert.ok(!R.toHtml(R.buildModel(insp, IND, null), '/').includes('class="appx"'));
});

test('Word тайланд зураг шигтгэгдэж, хавсралт тусдаа хуудсанд орно', async () => {
  const require = createRequire(import.meta.url);
  const src = readFileSync(new URL('../public/vendor/docx.umd.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, require);
  const D = mod.exports;
  const m = R.buildModel(insp, IND, null, { photos: [{ caption: 'Тест', ind: '3', w: 1, h: 1, data: JPG }], docs: [{ name: 'акт.pdf' }] });
  const buf = await D.Packer.toBuffer(R.toDocx(m, D, null));
  const dir = mkdtempSync(join(tmpdir(), 'd')); const p = join(dir, 't.docx'); writeFileSync(p, buf);
  const out = execFileSync('python3', ['-c', `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); x=z.read('word/document.xml').decode()
print(x.count('<pic:pic') , x.count('<w:sectPr'), 'Зураг 1. Тест (3.' in x, '1. акт.pdf' in x)`, p]).toString().trim();
  assert.equal(out, '1 3 True True');
});
