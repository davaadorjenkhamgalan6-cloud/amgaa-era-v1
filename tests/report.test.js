import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INDICATORS } from '../lib/agent/config.js';
import { computeScore } from '../lib/agent/scoring.js';
await import('../public/report.js');
const R = globalThis.EraReport;

const IND = INDICATORS.map((i) => [i.no, i.weight, i.name]);
const byNo = (arr) => Object.fromEntries(arr.map((v, i) => [i + 1, v]));
const insp = (scores, extra = {}) => ({ object_name: 'Жишээ ХХК', location: 'Улаанбаатар', inspection_date: '2026-11-04', engineer_name: 'Жишээ инженер', checklist: [], scores, ...extra });

test('тайлангийн оноо серверийн тооцоотой таарна (Х/Б-тэй)', () => {
  const sc = byNo([7, 5, 4, 3, 3, 4, 7, 'na', 3, 5, 5, 5, 6, 5, 8]);
  const m = R.buildModel(insp(sc), IND, null);
  const s = computeScore(sc);
  assert.equal(m.score.pct, s.pct);
  assert.equal(m.score.code, s.grade_code);
  assert.equal(`${m.score.raw}/${m.score.max}`, `${s.raw}/${s.max}`);
  assert.equal(m.rows[7].score, 'Х/Б');
});

test('AI дүгнэлтгүй бол эрсдэл, зөвлөмж хоосон; зөрчил шалгах хуудаснаас орно', () => {
  const m = R.buildModel(insp(byNo(Array(15).fill(10)), {
    checklist: [{ group: 'Цахилгаан самбар', item: 'Схем байгаа', status: 'violation', note: 'Схемгүй' },
      { group: 'Уртасгагч', item: 'Давхарлаагүй', status: 'partial', note: '' }, { group: 'X', item: 'Y', status: 'ok' }],
  }), IND, null);
  assert.equal(m.risks, null);
  assert.equal(m.recs, null);
  assert.equal(m.observed.length, 2);
  const html = R.toHtml(m, '/');
  assert.match(html, /шинжээч бөглөнө/);
  assert.match(html, /“AA” буюу Маш сайн/);
  assert.match(html, /<tr class="hl"><td[^>]*><b>AA</);
});

test('AI дүгнэлт байвал текст, зөвлөмж, нормын нэр тайланд орно', () => {
  const ai = JSON.parse(readFileSync(new URL('./fixtures/model-response.json', import.meta.url), 'utf8'));
  ai.norms = [{ id: 'N1', code: 'ЦБД', section: '1.7' }];
  ai.recommendations[0].norm_refs = ['N1'];
  ai.score = { pct: 61.2, raw: 92, max: 150 };
  const m = R.buildModel(insp(byNo([7, 6, 7, 5, 8, 4, 3, 6, 5, 7, 8, 4, 9, 6, 7])), IND, ai);
  assert.equal(m.score.code, 'B');
  assert.deepEqual(m.recs[0].norms, ['ЦБД §1.7']);
  const html = R.toHtml(m, '/');
  assert.match(html, /61\.2%-р тогтоогдсон/);
  assert.ok(!html.includes(ai.conclusion), 'AI-ийн дүгнэлтийн догол мөр тайланд орохгүй');
});

test('файлын нэрээс хориотой тэмдэгт хасна', () => {
  const m = R.buildModel(insp(byNo(Array(15).fill(5)), { object_name: 'А/Б "Тест" ХХК' }), IND, null);
  assert.equal(R.fileName(m, 'docx'), 'А Б Тест ХХК - Цахилгааны эрсдэлийн тайлан 2026-11-04.docx');
});

test('зөвлөмж бүлгээр (ЦБД → ТЭД), зэргээр эрэмбэлэгдэж, ишлэл гарчгийн ард шилжинэ', () => {
  const ai = JSON.parse(readFileSync(new URL('./fixtures/model-response.json', import.meta.url), 'utf8'));
  ai.norms = [];
  ai.recommendations.forEach((r) => { r.norm_refs = []; });
  ai.recommendations[2].action = 'Гэмтэлтэй кабелийг солих (ЦБД 2.1).';
  const html = R.toHtml(R.buildModel(insp(byNo(Array(15).fill(6))), IND, ai), '/');
  const i1 = html.indexOf('1. Цахилгаан байгууламжийн дүрэм (ЦБД)'), i2 = html.indexOf('2. Хэрэглэгчийн цахилгаан тоног');
  assert.ok(i1 > 0 && i2 > i1);
  const cbd = html.slice(i1, i2);
  assert.ok(cbd.indexOf('Самбарын таг ба хаалга') < cbd.indexOf('Гэмтэлтэй кабель солих'), 'Яаралтай зөвлөмжүүд эхэнд');
  assert.ok(cbd.indexOf('Гэмтэлтэй кабель солих') < cbd.indexOf('RCD хамгаалалт'), 'Өндөр нь Яаралтайн дараа');
  assert.match(cbd, /<b>Гэмтэлтэй кабель солих \(ЦБД 2\.1\)\.<\/b> Гэмтэлтэй кабелийг солих\./);
  assert.doesNotMatch(html, /<table><thead><tr><th class="c" style="width:6%">№<\/th><th>Арга хэмжээ/);
  assert.match(html, /Дээрх ажлуудыг хийж дуусгах төлөвлөгөөг/);
});
