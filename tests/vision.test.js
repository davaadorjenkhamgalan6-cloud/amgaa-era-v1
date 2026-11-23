import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVision, analyzePhoto, visionUser } from '../lib/agent/vision.js';

const items = [{ group: 'Самбар', item: 'Самбарын таг, хаалт бүрэн' }, { group: 'Кабель', item: 'Ил гарсан утас байхгүй' }];

test('илрүүлэлтийг шүүж, буруу утгыг засна', () => {
  const out = parseVision('{"caption":"Самбар","findings":[{"i":0,"s":"violation","severity":"Өндөр","issue":"Таг байхгүй"},{"i":7,"s":"x","severity":"?","issue":"Кабель ил"},{"i":1,"issue":""}]}', 2);
  assert.equal(out.caption, 'Самбар');
  assert.deepEqual(out.findings, [
    { i: 0, status: 'violation', severity: 'Өндөр', issue: 'Таг байхгүй' },
    { i: -1, status: 'violation', severity: 'Дунд', issue: 'Кабель ил' },
  ]);
});

test('зургийг Gemini руу inlineData-аар илгээнэ', async () => {
  let body;
  const fetchFn = async (url, opt) => { body = JSON.parse(opt.body);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"caption":"Ил утас","findings":[{"i":1,"s":"violation","severity":"Өндөр","issue":"Утас ил"}]}' }] } }] }) }; };
  const out = await analyzePhoto({ image: 'data:image/jpeg;base64,QUJD', items, provider: 'gemini', env: { GEMINI_API_KEY: 'x' }, fetchFn });
  const parts = body.contents[0].parts;
  assert.deepEqual(parts[0], { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } });
  assert.match(parts[1].text, /1\. \[Кабель\] Ил гарсан утас/);
  assert.equal(out.findings[0].i, 1);
});

test('зураггүй бол AI дуудахгүй', async () => {
  await assert.rejects(analyzePhoto({ image: '', items, provider: 'gemini', env: {}, fetchFn: async () => { throw new Error('no'); } }), /Зураг алга/);
  assert.match(visionUser(items, { name: 'СЭЗИС' }), /Объект: СЭЗИС/);
});
