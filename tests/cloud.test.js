import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudConfig, codeOk, cleanRecords } from '../lib/cloud.js';
import handler from '../api/records.js';
await import('../public/cloud.js');
const C = globalThis.EraCloud;

const rec = (id, upd, extra = {}) => ({ id, created: upd, updated: upd, data: { object_name: 'Объект ' + id }, result: null, ...extra });
const blank = (id) => ({ id, created: '2026-11-25T00:00:00Z', updated: '2026-11-25T00:00:00Z', data: { checklist: [{ item: 'a', status: 'not_checked' }] }, result: null });

test('хоосон ноорог санд илгээгдэхгүй, бөглөсөн нь илгээгдэнэ', () => {
  assert.equal(C.isBlank(blank('x')), true);
  assert.equal(C.isBlank(rec('a', '2026-01-01')), false);
  assert.equal(C.isBlank({ id: 'p', data: {}, plan: { date: '2026-12-01' } }), false);
});

test('шинэ төхөөрөмж: сангийн 2 үзлэг харагдана, хоосон ноорог алга болно', () => {
  const remote = [rec('a', '2026-11-20'), rec('b', '2026-11-22')];
  const m = C.merge([blank('new')], remote);
  assert.deepEqual(m.records.map((r) => r.id), ['b', 'a']);
  assert.equal(m.push.length, 0);
});

test('эзэмшигчийн хөтөч дээрх шинэ/шинэчлэгдсэн үзлэг санд илгээгдэнэ', () => {
  const remote = [rec('a', '2026-11-20'), rec('b', '2026-11-22')];
  const local = [rec('a', '2026-11-24'), rec('c', '2026-11-25'), rec('b', '2026-11-21')];
  const m = C.merge(local, remote);
  assert.deepEqual(m.push.map((r) => r.id).sort(), ['a', 'c']);
  assert.equal(m.records.find((r) => r.id === 'b').updated, '2026-11-22');
  assert.equal(m.records.length, 3);
});

test('устгасан үзлэг бусад хөтөч дээр ч алга болно', () => {
  const m = C.merge([rec('a', '2026-11-20')], [{ id: 'a', deleted: true, updated: '2026-11-21' }]);
  assert.equal(m.records.length, 0);
});

test('changed: зөвхөн өөрчлөгдсөн бичлэг', () => {
  const a = rec('a', '1'), b = rec('b', '1');
  const sent = { a: JSON.stringify(a), b: JSON.stringify(b) };
  b.data.location = 'УБ';
  assert.deepEqual(C.changed([a, b, blank('z')], sent).map((r) => r.id), ['b']);
});

test('тохиргоо ба код', () => {
  assert.equal(cloudConfig({}), null);
  assert.deepEqual(cloudConfig({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'k' }), { url: 'https://x.supabase.co', key: 'k' });
  assert.equal(codeOk('1234', '1234'), true);
  assert.equal(codeOk('1235', '1234'), false);
  assert.equal(codeOk('', ''), false);
  assert.throws(() => cleanRecords([{ id: '../x' }]));
});

function mockRes() {
  return { code: 200, body: null, status(c) { this.code = c; return this; }, json(d) { this.body = d; return this; } };
}

test('/api/records: кодгүй хүн харна, бичиж чадахгүй; кодтой хүн бичнэ', async () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', EDIT_CODE: 'secret' };
  const saved = Object.assign({}, process.env); Object.assign(process.env, env);
  const realFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (!init.method) return new Response(JSON.stringify([{ id: 'a', rec: rec('a', '1') }, { id: 'b', rec: rec('b', '2') }]), { status: 200 });
    return new Response(null, { status: 201 });
  };
  try {
    let res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.body.canEdit, false);
    assert.equal(res.body.records.length, 2);

    res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { records: [rec('c', '3')] } }, res);
    assert.equal(res.code, 401);

    res = mockRes();
    await handler({ method: 'POST', headers: { 'x-edit-code': 'secret' }, body: { records: [rec('c', '3')] } }, res);
    assert.equal(res.code, 200);
    const post = calls.find((c) => c.init.method === 'POST');
    assert.match(post.url, /era_inspections\?on_conflict=id/);
    assert.equal(JSON.parse(post.init.body)[0].id, 'c');
    assert.equal(post.init.headers.apikey, 'svc');
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(env)) { if (k in saved) process.env[k] = saved[k]; else delete process.env[k]; }
  }
});
