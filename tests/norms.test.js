import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../public/norms.js';
import { normsChat, checkAnswer, NOT_FOUND, cleanExcerpts } from '../lib/agent/chat.js';
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
  assert.match(body.system, /Зөвхөн хэрэглэгчийн мессежид өгөгдсөн ЦБД-ийн ишлэлүүдэд/);
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
