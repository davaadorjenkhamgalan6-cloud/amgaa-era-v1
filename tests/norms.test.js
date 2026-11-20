import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../public/norms.js';
import { normsChat, checkAnswer, NOT_FOUND, cleanExcerpts, plainMath } from '../lib/agent/chat.js';
import { normsFrom } from '../api/agent.js';

const TEXT = `ЦАХИЛГААН БАЙГУУЛАМЖИЙН ДҮРЭМ (туршилтын текст)
1-р бүлэг. Ерөнхий заалт
1.1.1. Энэ дүрэм нь 1000 В хүртэлх цахилгаан байгууламжид хамаарна.
1.1.2. Хуваарилах самбарын хаалгыг түгжиж, гүйдэл дамжуулах хэсгийг тагаар хаана.
2.5 мм² хөндлөн огтлолтой зэс утсыг гэрэлтүүлгийн шугамд хэрэглэнэ.
ХОЁРДУГААР БҮЛЭГ. Газардуулга
2.1.5. Газардуулгын төхөөрөмжийн эсэргүүцэл 4 Ом-оос ихгүй байна.
2.1.6. Залгуурын шугамыг 30 мА-ийн хамгаалалтын салгах төхөөрөмж (RCD, УЗО)-өөр хамгаална.
2.1.7. Хуваарилах самбарын өмнө 0.8 м-ээс багагүй чөлөөт зай үлдээнэ.`;

test('заалтаар хуваана: бүлэг, дугаар; "2.5 мм²" шинэ заалт биш', () => {
  const c = N.chunkText(TEXT);
  assert.deepEqual(c.map((x) => x.section), ['Оршил', '1.1.1', '1.1.2', '2.1.5', '2.1.6', '2.1.7']);
  assert.match(c[2].content, /2\.5 мм²/);
  assert.equal(c[3].title, 'ХОЁРДУГААР БҮЛЭГ. Газардуулга');
});

test('хайлт: монгол үгийн хувилбар, заалтын дугаар, хамааралгүй асуулт', () => {
  const ix = N.buildIndex(N.chunkText(TEXT));
  assert.equal(N.search(ix, 'Газардуулгын эсэргүүцэл хэдээс ихгүй байх вэ?')[0].section, '2.1.5');
  assert.equal(N.search(ix, 'самбарын өмнөх чөлөөт зай')[0].section, '2.1.7');
  assert.equal(N.search(ix, 'залгуурт RCD тавих уу')[0].section, '2.1.6');
  assert.equal(N.search(ix, '2.1.6 юу гэж заасан бэ')[0].section, '2.1.6');
  assert.deepEqual(N.search(ix, 'сагсан бөмбөгийн дүрэм'), []);
});

test('дугааргүй текстийг хуудсаар хэсэглэнэ', () => {
  const c = N.chunkText([{ page: 3, text: 'Энд дугаартай заалт байхгүй, зөвхөн энгийн текст байна.' }, { page: 4, text: 'Дараагийн хуудасны текст энд байна.' }]);
  assert.deepEqual(c.map((x) => x.section), ['х.3', 'х.4']);
});

test('ишлэлийн шалгалт: зөвшөөрөгдөөгүй дугаар → grounded=false', () => {
  const ex = [{ section: '2.1.5', content: 'x' }];
  assert.deepEqual(checkAnswer('4 Ом-оос ихгүй [§2.1.5].', ex), { cited: ['2.1.5'], invalid: [], grounded: true, notFound: false });
  assert.equal(checkAnswer('4 Ом [§2.1.5], 10 Ом [§9.9.9].', ex).grounded, false);
  assert.equal(checkAnswer('Ишлэлгүй хариулт.', ex).grounded, false);
  assert.equal(checkAnswer(NOT_FOUND, ex).grounded, true);
});

test('чатбот: заалт олдоогүй бол AI дуудахгүй; Claude-д зөвхөн ишлэл, temperature 0', async () => {
  let called = 0;
  const none = await normsChat({ question: 'юу?', excerpts: [], provider: 'anthropic', env: {}, fetchFn: async () => { called++; } });
  assert.equal(called, 0); assert.equal(none.notFound, true);
  let body;
  const fetchFn = async (url, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Эсэргүүцэл 4 Ом-оос ихгүй [§2.1.5].' }] }) }; };
  const r = await normsChat({ question: 'Газардуулга хэд вэ?', excerpts: [{ section: '2.1.5', page: 12, content: 'Газардуулгын эсэргүүцэл 4 Ом-оос ихгүй байна.' }], provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' }, fetchFn });
  assert.equal(r.grounded, true); assert.deepEqual(r.cited, ['2.1.5']);
  assert.equal(body.temperature, 0);
  assert.match(body.system, /Зөвхөн хэрэглэгчийн мессежид өгөгдсөн хууль, дүрмийн ишлэлүүдэд/);
  assert.match(body.messages.at(-1).content, /\[§2\.1\.5 \| х\.12\]/);
});

test('ишлэлийн хэмжээг хязгаарлана', () => {
  const big = Array.from({ length: 20 }, (_, i) => ({ section: String(i), content: 'а'.repeat(2500) }));
  const c = cleanExcerpts(big);
  assert.ok(c.length <= 8 && c.reduce((a, x) => a + x.content.length, 0) <= 14000);
});

test('агент: хөтчөөс ирсэн ЦБД заалтаар хайна (жишээ нормын оронд)', async () => {
  const f = normsFrom(N.chunkText(TEXT));
  const hits = await f('самбарын хаалга түгжээгүй', 3);
  assert.equal(hits[0].section, '1.1.2'); assert.equal(hits[0].code, 'ЦБД');
  assert.equal(normsFrom([]), null);
});

test('олон дүрэм: mergeDocs кодоор ялгаж, id давхардуулахгүй; guessCode, label', async () => {
  const { mergeDocs, guessCode, label } = await import('../public/norms.js');
  assert.equal(guessCode('1БД-43-101-03-Цахилгаан-байгууламжийн-дүрэм'), 'ЦБД');
  assert.equal(guessCode('Хэрэглэгчийн цахилгаан тоноглолын техник ашиглалтын дүрэм'), 'ТЭД');
  assert.equal(guessCode('Галын аюулгүй байдлын дүрэм'), 'ГАБД');
  const m = mergeDocs([
    { id: 'a', chunks: [{ id: 'c0', code: 'ЦБД', section: '1.1', content: 'x' }] },
    { id: 'b', code: 'ТЭД', chunks: [{ id: 'c0', code: 'ТЭД', section: '1.1', content: 'y' }] },
  ]);
  assert.deepEqual(m.map((c) => c.id), ['a-c0', 'b-c0']);
  assert.deepEqual(m.map((c) => c.section), ['1.1', 'ТЭД 1.1']);
  assert.equal(label(m[0]), 'ЦБД 1.1');
  assert.equal(label(m[1]), 'ТЭД 1.1');
  // дахин нэгтгэхэд (JSON-оор суулгасан) угтвар давхардахгүй
  assert.equal(mergeDocs([{ id: 'z', chunks: m }])[1].section, 'ТЭД 1.1');
});

test('хуучин фонтын ї/є-г ү/ө болгож, хайлтад олдоно', async () => {
  const { chunkText, buildIndex, search, fixMn } = await import('../public/norms.js');
  assert.equal(fixMn('эсэргїїцэл Єндєр'), 'эсэргүүцэл Өндөр');
  const ch = chunkText('1.7.1. Газардуулгын эсэргїїцэл 4 Ом-оос ихгїй байна.\n1.7.2. Єєр заалт текст энд байна.');
  assert.match(ch[0].content, /эсэргүүцэл/);
  assert.equal(search(buildIndex(ch), 'газардуулгын эсэргүүцэл')[0].section, '1.7.1');
});

test('апп-тай хамт ирэх ЦБД: 1423 заалт, ү/ө зөв', async () => {
  const fs = await import('node:fs');
  const ix = JSON.parse(fs.readFileSync(new URL('../public/norms/index.json', import.meta.url)));
  const e = ix.docs.find((d) => d.code === 'ЦБД'); assert.ok(e);
  const j = JSON.parse(fs.readFileSync(new URL('../public/norms/' + e.file, import.meta.url)));
  assert.equal(new Set(j.chunks.map((c) => c.section)).size, 1423);
  assert.ok(!j.chunks.some((c) => /[їє]/i.test(c.content)));
});

test('plainMath: LaTeX томьёог энгийн текст болгоно, мөнгөн дүнд хүрэхгүй', () => {
  assert.equal(plainMath('Томьёо: $R = 125 / I$ [§1.7.62]'), 'Томьёо: R = 125 / I [§1.7.62]');
  assert.equal(plainMath('$$R \\le \\frac{125}{I_{\\text{з}}}$$'), 'R ≤ 125 / Iз');
  assert.equal(plainMath('$U = I \\cdot R$, 4 $\\Omega$'), 'U = I · R, 4 Ω');
  assert.equal(plainMath('Үнэ $5 ба $10'), 'Үнэ $5 ба $10');
});

test('normsChat (Gemini): thinking бага, temperature-гүй, LaTeX цэвэрлэнэ', async () => {
  const bodies = [];
  const fetchFn = async (url, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Эсэргүүцэл $R \\le 4$ Ом [§2.1.5].' }] } }] }) }; };
  const r = await normsChat({ question: 'Газардуулга?', excerpts: [{ section: '2.1.5', content: 'Газардуулгын эсэргүүцэл 4 Ом-оос ихгүй.' }], provider: 'gemini', env: { GEMINI_API_KEY: 'k' }, fetchFn });
  assert.equal(r.answer, 'Эсэргүүцэл R ≤ 4 Ом [§2.1.5].');
  assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.equal(bodies[0].generationConfig.temperature, undefined);
  assert.ok(r.grounded);
});

test('normsChat (Gemini): загвар thinkingLevel-ийг танихгүй бол түүнгүйгээр дахин оролдоно', async () => {
  const bodies = [];
  const fetchFn = async (url, o) => {
    const b = JSON.parse(o.body); bodies.push(b);
    if (b.generationConfig.thinkingConfig) return { ok: false, status: 400, json: async () => ({ error: { message: 'Unknown name "thinkingLevel"' } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '4 Ом [§2.1.5].' }] } }] }) };
  };
  const r = await normsChat({ question: 'Газардуулга?', excerpts: [{ section: '2.1.5', content: '4 Ом' }], provider: 'gemini', env: { GEMINI_API_KEY: 'k' }, fetchFn });
  assert.equal(bodies.length, 2);
  assert.equal(r.answer, '4 Ом [§2.1.5].');
});

test('normsChat (Gemini): үндсэн загвар 503 (ачаалалтай) бол нөөц загвар руу шилжинэ', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes('gemini-3.5-flash')) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '4 Ом [§2.1.5].' }] } }] }) };
  };
  const r = await normsChat({ question: 'Газардуулга?', excerpts: [{ section: '2.1.5', content: '4 Ом' }], provider: 'gemini', env: { GEMINI_API_KEY: 'k' }, fetchFn });
  assert.equal(r.answer, '4 Ом [§2.1.5].');
  assert.equal(urls.length, 2);
  assert.ok(urls[1].includes('gemini-flash-lite-latest'));
});

test('normsChat (Gemini): түлхүүр буруу (403) бол нөөц загвар туршихгүй', async () => {
  let n = 0;
  const fetchFn = async () => { n++; return { ok: false, status: 403, json: async () => ({ error: { message: 'API key invalid' } }) }; };
  await assert.rejects(normsChat({ question: 'Газардуулга?', excerpts: [{ section: '2.1.5', content: '4 Ом' }], provider: 'gemini', env: { GEMINI_API_KEY: 'k' }, fetchFn }), /403/);
  assert.equal(n, 1);
});
