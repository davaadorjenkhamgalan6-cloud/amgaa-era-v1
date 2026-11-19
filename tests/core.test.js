import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeScore } from '../lib/agent/scoring.js';
import { validateInspection } from '../lib/agent/validate.js';
import { checkDraft } from '../lib/agent/check.js';
import { demoSearchNorms } from '../lib/agent/demo-norms.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sample-inspection.json', import.meta.url)));
const good = JSON.parse(readFileSync(new URL('./fixtures/model-response.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

async function ctxFor(insp) {
  const cl = insp.checklist;
  const norms = [];
  for (const q of ['самбар', 'кабел', 'rcd']) for (const h of await demoSearchNorms(q)) norms.push({ ...h, id: `N${norms.length + 1}` });
  return {
    score: computeScore(insp.scores),
    violations: cl.filter((c) => c.status === 'violation').map((c, i) => ({ ...c, id: `V${i + 1}` })),
    clarifies: cl.filter((c) => c.status === 'clarify').map((c, i) => ({ ...c, id: `C${i + 1}` })),
    norms,
  };
}

test('оноо, зэрэглэлийг жингээр зөв тооцно', () => {
  const s = computeScore(sample.scores);
  assert.equal(s.pct, 61.2);
  assert.equal(s.raw, 92);
  assert.equal(s.grade, 'B (Анхаарал хандуулах)');
  assert.deepEqual(s.weak.map((w) => w.id), ['I06', 'I07', 'I12']);
});

test('бүх үзүүлэлт 10 бол 100% — AA (Маш сайн)', () => {
  const s = computeScore(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, 10])));
  assert.equal(s.pct, 100);
  assert.equal(s.grade, 'AA (Маш сайн)');
});

// tsah2.xlsx "Sheet1 (2)": F23 = 52.82 → NE
const EXCEL = [7, 5, 4, 3, 3, 5, 5, 0, 8, 5, 7, 7, 5, 5, 8];
const byNo = (arr) => Object.fromEntries(arr.map((v, i) => [i + 1, v]));

test('Excel-ийн жишээтэй таарна: 52.8% — NE (Хангалтгүй)', () => {
  const s = computeScore(byNo(EXCEL));
  assert.equal(s.pct, 52.8);
  assert.equal(s.grade_code, 'NE');
});

test('Хамааралгүй үзүүлэлтийн жинг хасна (Fireman switch → 54.5%)', () => {
  const a = EXCEL.slice(); a[7] = 'na';
  const s = computeScore(byNo(a));
  assert.equal(s.pct, 54.5);
  assert.equal(s.max, 140);
  assert.deepEqual(s.na, [8]);
  assert.ok(!s.weak.some((w) => w.no === 8));
});

test('зэрэглэлийн хил: доод хил тухайн зэрэглэлд багтана', () => {
  const all = (v) => byNo(Array(15).fill(v));
  assert.deepEqual([9, 8, 7, 6, 5, 4.9].map((v) => computeScore(all(v)).grade_code), ['AA', 'A', 'BB', 'B', 'NE', 'D']);
});

test('Хамааралгүй оноог validate зөвшөөрнө, бүгд Хамааралгүй бол алдаа', () => {
  const insp = clone(sample);
  insp.scores['8'] = 'na';
  assert.equal(validateInspection(insp).ok, true);
  insp.scores = byNo(Array(15).fill('na'));
  assert.match(validateInspection(insp).errors.join(' '), /Хамааралгүй/);
});

test('оноо дутуу, хүрээнээс гарсан бол алдаа', () => {
  const insp = clone(sample);
  delete insp.scores['7'];
  insp.scores['3'] = 14;
  const v = validateInspection(insp);
  assert.equal(v.ok, false);
  assert.match(v.errors.join(' '), /оноогүй: 7/);
  assert.match(v.errors.join(' '), /3-р үзүүлэлтийн оноо 0–10/);
});

test('сайн ноорог шалгалтыг бүрэн давна', async () => {
  const c = checkDraft(clone(good), await ctxFor(sample));
  assert.deepEqual([c.errors, c.warnings, c.fixes], [[], [], []]);
});

test('зохиомол норм хасагдана; тусгаагүй зөрчил, буруу тоо, буруу зэрэглэл илэрнэ', async () => {
  const bad = clone(good);
  bad.recommendations[0].norm_refs = ['N1', 'N9'];
  bad.findings = bad.findings.filter((f) => f.id !== 'F2');
  bad.recommendations = bad.recommendations.filter((r) => !r.finding_ids.includes('F2'));
  bad.summary = bad.summary.replace('61.2%', '75%').replace('B (Анхаарал хандуулах)', 'BB (Дунд)');
  const c = checkDraft(bad, await ctxFor(sample));
  assert.deepEqual(bad.recommendations[0].norm_refs, ['N1']);
  assert.match(c.fixes.join(' '), /N9/);
  const w = c.warnings.join(' | ');
  assert.match(w, /тусгагдаагүй: V2/);
  assert.match(w, /"75%"/);
  assert.match(w, /"BB \(Дунд\)"/);
});

test('"Маш сайн"-ыг "Сайн"-тай андуурахгүй, "дунд зэрэг" гэх энгийн үгийг зэрэглэл гэж үзэхгүй', async () => {
  const insp = clone(sample);
  for (const k of Object.keys(insp.scores)) insp.scores[k] = 10;
  const ctx = await ctxFor(insp);
  assert.equal(ctx.score.grade, 'AA (Маш сайн)');
  const d = clone(good);
  d.summary = 'Объект AA (Маш сайн) зэрэглэлд байна, оноо 100%. Тоос дунд зэрэг хуримтлагдсан.';
  d.conclusion = '"Маш сайн" зэрэглэл.';
  const c = checkDraft(d, ctx);
  assert.ok(!c.warnings.some((x) => x.includes('зэрэглэл')), c.warnings.join('\n'));
});

test('"Хэсэгчлэн" мөрийг зөрчилтэй адил дүгнэлтэд тусгахыг шаардана', async () => {
  const insp = clone(sample);
  insp.checklist.push({ group: 'Уртасгагч ба түр холболт', item: 'Уртасгагчид давхарлаж залгаагүй', status: 'partial', note: '2 уртасгагч дамжуулан залгасан' });
  const v = validateInspection(insp);
  assert.equal(v.ok, true);
  insp.checklist.at(-1).note = '';
  assert.match(validateInspection(insp).warnings.join(' '), /тайлбаргүй/);
});

test('буруу зэрэг, буруу хугацааг алдаа гэж үзнэ', async () => {
  const d = clone(good);
  d.recommendations[0].priority = 'Маш яаралтай';
  d.recommendations[1].deadline_days = 'долоо хоног';
  const c = checkDraft(d, await ctxFor(sample));
  assert.equal(c.ok, false);
  assert.equal(c.errors.length, 2);
});

test('зөвлөмжийн бүлэг алга бол текстээс тааж засна, нэр алга бол анхааруулна', async () => {
  const d = clone(good);
  delete d.recommendations[1].group; d.recommendations[1].action += ' (ТЭД)';
  delete d.recommendations[2].title;
  const c = checkDraft(d, await ctxFor(sample));
  assert.equal(d.recommendations[1].group, 'ТЭД');
  assert.match(c.fixes.join(' '), /Зөвлөмж 2: бүлэг "" → "ТЭД"/);
  assert.match(c.warnings.join(' '), /Зөвлөмж 3: товч нэр/);
});

test('дүрмийн бүлгийн дугаар эх сурвалжгүй бол анхааруулна', async () => {
  const d = clone(good);
  d.recommendations[0].action += ' (ЦБД 1.7, 4.1).';
  const ctx = { ...(await ctxFor(sample)), sourceText: 'Инженер: газардуулга ЦБД 1.7-р бүлэг' };
  const w = checkDraft(d, ctx).warnings.join(' | ');
  assert.match(w, /"ЦБД 4\.1" ишлэл/);
  assert.doesNotMatch(w, /"ЦБД 1\.7"/);
});
