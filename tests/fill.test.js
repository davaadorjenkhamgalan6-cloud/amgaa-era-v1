import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFill, fillUser, cleanItems, fillChecklist, FILL_SYSTEM } from '../lib/agent/fill.js';

const items = [
  { group: 'Самбар', item: 'Самбар төмөр хийцтэй, хаалга түгжээтэй' },
  { group: 'RCD', item: 'RCD суурилуулсан, ажиллагаатай' },
  { group: 'Fireman', item: 'Галын дохиоллоор цахилгаан салгах шийдэлтэй' },
  { group: 'Уртасгагч', item: 'Уртасгагчид давхарлаж залгаагүй' },
];

test('зөвшөөрөгдсөн мөр, төлөвийг л үлдээнэ', () => {
  const out = parseFill('```json\n{"items":[{"i":0,"s":"violation","n":"Хаалга түгжээгүй"},{"i":1,"s":"bad"},{"i":9,"s":"ok"},{"i":0,"s":"ok"},{"i":2,"s":"na","n":""}],"summary":"Самбар"}\n```', 4);
  assert.deepEqual(out.items, [{ i: 0, status: 'violation', note: 'Хаалга түгжээгүй' }, { i: 2, status: 'na', note: '' }]);
  assert.equal(out.summary, 'Самбар');
});

test('«Тодруулах» гэж ирвэл «Хэсэгчлэн» болгоно', () => {
  assert.deepEqual(parseFill('{"items":[{"i":0,"s":"clarify","n":"Акт байхгүй"}]}', 2).items, [{ i: 0, status: 'partial', note: 'Акт байхгүй' }]);
});

test('JSON биш хариуг алдаа гэж үзнэ', () => {
  assert.throws(() => parseFill('уучлаарай', 3), /JSON/);
});

test('prompt-д мөрийн дугаар, тайлбар орно', () => {
  const u = fillUser('Самбарын хаалга түгжээгүй', cleanItems(items), { name: 'Агуулах', voltage: '400' });
  assert.match(u, /0\. \[Самбар\] Самбар төмөр хийцтэй/);
  assert.match(u, /Хүчдэл: 400 В/);
  assert.match(u, /Самбарын хаалга түгжээгүй$/);
  assert.match(FILL_SYSTEM, /БҮХ мөрийг заавал/);
  assert.match(FILL_SYSTEM, /partial \(Хэсэгчлэн\) болгож/);
});

test('Gemini-ээр бөглөнө (JSON горимтой)', async () => {
  let body;
  const fetchFn = async (url, opt) => { body = JSON.parse(opt.body);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"items":[{"i":1,"s":"violation","n":"RCD байхгүй"}],"summary":"RCD"}' }] } }] }) }; };
  const out = await fillChecklist({ description: 'Залгуурын шугамд RCD байхгүй байна.', items, provider: 'gemini', env: { GEMINI_API_KEY: 'x' }, fetchFn });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.maxOutputTokens, 8000);
  assert.deepEqual(out.items, [{ i: 1, status: 'violation', note: 'RCD байхгүй' }]);
});

test('хэт богино тайлбарыг AI руу илгээхгүй', async () => {
  await assert.rejects(fillChecklist({ description: 'ok', items, provider: 'gemini', env: {}, fetchFn: async () => { throw new Error('дуудах ёсгүй'); } }), /богино/);
});
