import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAgent } from '../lib/agent/agent.js';
import { demoSearchNorms } from '../lib/agent/demo-norms.js';
import { safeEdit, mergeReview, reviewEnabled } from '../lib/agent/review.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sample-inspection.json', import.meta.url)));
const good = JSON.parse(readFileSync(new URL('./fixtures/model-response.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const tu = (id, name, input = {}) => ({ type: 'tool_use', id, name, input });
const SEARCHES = ['самбарын хаалт таг', 'кабелийн тусгаарлагч гэмтэл', 'RCD залгуурын шугам'];

// Claude-ийн найруулсан хариу (жишээ): summary-г сайжруулж, F1-ийн гарчгийг засна
function editOf(d, patch = {}) {
  return {
    summary: d.summary.replace('үзлэгээр', 'үзлэгийн дүнд'),
    conclusion: d.conclusion,
    findings: d.findings.map((f) => ({ id: f.id, title: f.id === 'F1' ? f.title + ' (найруулсан)' : f.title, evidence: f.evidence })),
    potential_risks: d.potential_risks.slice(),
    recommendations: d.recommendations.map((r, i) => ({ n: i + 1, action: r.action })),
    to_verify: d.to_verify.slice(),
    changes: ['Товч дүгнэлтийн найруулга', 'F1 гарчиг'],
    issues: ['Газардуулгын хэмжилтийн огноо тодорхойгүй'],
    ...patch,
  };
}

// Агентын 2 алхам + Claude хяналтын 1 хүсэлт
function fake(reviewResponse) {
  const requests = [];
  const script = [
    [tu('a1', 'calculate_score'), ...SEARCHES.map((q, i) => tu('s' + i, 'search_norms', { query: q }))],
    [tu('c1', 'submit_conclusion', good)],
  ];
  let n = 0;
  const fetchFn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    requests.push(body);
    if (body.tool_choice) return reviewResponse(body);
    const content = script[n++];
    return { ok: true, json: async () => ({ content }) };
  };
  return { fetchFn, requests };
}
const run = (fetchFn, extra = {}) => runAgent(clone(sample), { provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' }, fetchFn, searchNorms: demoSearchNorms, review: true, ...extra });

test('safeEdit: тоо, код өөрчлөгдвөл татгалзана', () => {
  assert.equal(safeEdit('Оноо 61.2% (V1, I06)', 'Нийт оноо 61,2% буюу (I06, V1)'), true);
  assert.equal(safeEdit('Оноо 61.2%', 'Оноо 62%'), false);
  assert.equal(safeEdit('V1 зөрчил', 'Зөрчил'), false);
  assert.equal(safeEdit('Текст', ''), false);
});

test('Claude найруулга ноорогт орж, тэмдэглэл шууд удирдлагад хүрнэ', async () => {
  let edit;
  const { fetchFn, requests } = fake((body) => {
    const draft = JSON.parse(body.messages[0].content.split('# Агентын ноорог (JSON)\n')[1].split('\n\nНоорогийг')[0]);
    edit = editOf({ ...good, findings: draft.findings });
    return { ok: true, json: async () => ({ content: [tu('r1', 'submit_review', edit)] }) };
  });
  const out = await run(fetchFn);
  assert.equal(out.stage, 'draft_ready');
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2].tool_choice, { type: 'tool', name: 'submit_review' });
  assert.match(requests[2].messages[0].content, /Талбайн үзлэгийн өгөгдөл/);
  assert.equal(out.conclusion.review.status, 'applied');
  assert.match(out.conclusion.summary, /үзлэгийн дүнд/);
  assert.match(out.conclusion.findings[0].title, /найруулсан/);
  assert.deepEqual(out.conclusion.review.issues, ['Газардуулгын хэмжилтийн огноо тодорхойгүй']);
  assert.match(out.log.at(-2).text, /Claude шалгаж найруулав: 2 засвар, анхаарах 1/);
});

test('Тоо өөрчилсөн талбарыг буцааж, бусдыг нь авна', async () => {
  const { fetchFn } = fake(() => {
    const e = editOf(good, { summary: good.summary.replace('61.2%', '65%') });
    return { ok: true, json: async () => ({ content: [tu('r1', 'submit_review', e)] }) };
  });
  const out = await run(fetchFn);
  assert.equal(out.conclusion.summary, good.summary);
  assert.match(out.conclusion.findings[0].title, /найруулсан/);
  assert.deepEqual(out.conclusion.review.kept, ['summary']);
});

test('Найруулсан хувилбар кодын шалгалтад муудвал агентын ноорогийг хэвээр үлдээнэ', async () => {
  const { fetchFn } = fake(() => {
    const e = editOf(good, { conclusion: 'Объект AA (Маш сайн) зэрэглэлд байна.' }); // буруу зэрэглэл — тоо, кодгүй тул safeEdit давна
    return { ok: true, json: async () => ({ content: [tu('r1', 'submit_review', e)] }) };
  });
  const out = await run(fetchFn);
  assert.equal(out.conclusion.review.status, 'reverted');
  assert.equal(out.conclusion.conclusion, good.conclusion);
  assert.equal(out.conclusion.summary, good.summary);
  assert.deepEqual(out.conclusion.review.issues, ['Газардуулгын хэмжилтийн огноо тодорхойгүй']);
});

test('Жагсаалтын урт өөрчлөгдвөл тэр жагсаалтыг хуучнаар нь үлдээнэ', () => {
  const c = mergeReview(good, { ...editOf(good), potential_risks: ['ганц'] });
  assert.deepEqual(c.kept, ['Эрсдэлийн жагсаалт']);
  assert.deepEqual(c.draft.potential_risks, good.potential_risks);
});

test('Claude алдаа өгвөл агентын ноорог хэвээр гарна', async () => {
  const { fetchFn } = fake(() => ({ ok: false, status: 529, json: async () => ({ error: { message: 'Overloaded' } }) }));
  const out = await run(fetchFn);
  assert.equal(out.stage, 'draft_ready');
  assert.equal(out.conclusion.summary, good.summary);
  assert.equal(out.conclusion.review.status, 'error');
  assert.match(out.log.at(-2).text, /хийгдсэнгүй: Claude API алдаа 529/);
});

test('Агент удаан ажилласан бол найруулгыг алгасна', async () => {
  let t = 0;
  const { fetchFn, requests } = fake(() => { throw new Error('дуудагдах ёсгүй'); });
  const out = await run(fetchFn, { now: () => (t += 40000), reviewBudgetMs: 30000 });
  assert.equal(out.conclusion.review.status, 'skipped');
  assert.equal(requests.length, 2);
});

test('reviewEnabled: Claude түлхүүр байвал асна, AI_REVIEW=off бол унтарна', () => {
  assert.equal(reviewEnabled({ ANTHROPIC_API_KEY: 'k' }), true);
  assert.equal(reviewEnabled({ ANTHROPIC_API_KEY: 'k', AI_REVIEW: 'off' }), false);
  assert.equal(reviewEnabled({ GEMINI_API_KEY: 'g' }), false);
});
