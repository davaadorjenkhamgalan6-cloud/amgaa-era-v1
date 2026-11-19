import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAgent } from '../lib/agent/agent.js';
import { demoSearchNorms } from '../lib/agent/demo-norms.js';
import handler from '../api/agent.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sample-inspection.json', import.meta.url)));
const good = JSON.parse(readFileSync(new URL('./fixtures/model-response.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

// Эхний оролдлогод V2 (схемгүй) зөрчлийг орхисон ноорог → код буцаах ёстой
function flawed() {
  const d = clone(good);
  d.findings = d.findings.filter((f) => f.id !== 'F2');
  d.recommendations = d.recommendations.filter((r) => !r.finding_ids.includes('F2'));
  return d;
}
const SEARCHES = ['самбарын хаалт таг', 'кабелийн тусгаарлагч гэмтэл', 'RCD залгуурын шугам'];

// ---------- Claude-ийн дуураймал ----------
function fakeAnthropic(script) {
  const requests = [];
  let n = 0;
  const fetchFn = async (url, opts) => {
    requests.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    const content = script[n++];
    return { ok: true, json: async () => ({ content, stop_reason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn' }) };
  };
  return { fetchFn, requests };
}
const tu = (id, name, input = {}) => ({ type: 'tool_use', id, name, input });

test('Claude: оноо → норм хайх → алдаатай илгээх → засах → батлагдах', async () => {
  const { fetchFn, requests } = fakeAnthropic([
    [{ type: 'text', text: 'Эхлээд оноогоо тооцоолж, зөрчил бүрээр норм хайя.' }, tu('a1', 'calculate_score'), ...SEARCHES.map((q, i) => tu('s' + i, 'search_norms', { query: q }))],
    [tu('b1', 'submit_conclusion', flawed())],
    [tu('c1', 'submit_conclusion', good)],
  ]);
  const out = await runAgent(clone(sample), { provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' }, fetchFn, searchNorms: demoSearchNorms });

  assert.equal(out.stage, 'draft_ready');
  assert.equal(out.attempts, 2);
  assert.equal(out.conclusion.score.pct, 61.2);
  assert.deepEqual(out.conclusion.norms.map((n) => n.section), ['Ж-1', 'Ж-2', 'Ж-3']);
  assert.deepEqual(out.check.warnings, []);

  // AI руу явсан хүсэлтүүд зөв бүтэцтэй эсэх
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(requests[0].body.tools.map((t) => t.name), ['calculate_score', 'search_norms', 'return_to_engineer', 'submit_conclusion']);
  const toolResults = requests[1].body.messages.at(-1).content;
  assert.equal(toolResults.length, 4);
  assert.equal(toolResults[0].tool_use_id, 'a1');
  assert.match(toolResults[1].content, /"ref":"N1"/);
  // Код буцаасан тайлбар агент руу хүрсэн эсэх
  const rejection = JSON.parse(requests[2].body.messages.at(-1).content[0].content);
  assert.equal(rejection.accepted, false);
  assert.match(rejection.warnings.join(' '), /V2/);

  const kinds = out.log.map((l) => l.kind);
  assert.deepEqual(kinds, ['start', 'think', 'tool', 'tool', 'tool', 'tool', 'fix', 'check', 'done']);
});

test('Claude: мэдээлэл дутуу бол агент инженерт буцаана', async () => {
  const insp = clone(sample);
  insp.checklist[0].note = '';
  const { fetchFn } = fakeAnthropic([
    [tu('a', 'calculate_score')],
    [tu('b', 'return_to_engineer', { missing: ['V1 зөрчлийн тайлбар'], message: 'Самбарын хаалтын зөрчил юу болохыг тодруулна уу.' })],
  ]);
  const out = await runAgent(insp, { provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' }, fetchFn, searchNorms: demoSearchNorms });
  assert.equal(out.stage, 'returned_to_engineer');
  assert.equal(out.by, 'agent');
  assert.deepEqual(out.missing, ['V1 зөрчлийн тайлбар']);
});

test('Оноо дутуу бол AI-г огт дуудахгүй (төлбөр гарахгүй)', async () => {
  const insp = clone(sample);
  delete insp.scores['4'];
  let called = false;
  const out = await runAgent(insp, { provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' }, fetchFn: async () => { called = true; } });
  assert.equal(out.stage, 'returned_to_engineer');
  assert.equal(out.by, 'code');
  assert.equal(called, false);
});

test('Зохиомол нормын ишлэлийг код автоматаар хасна', async () => {
  const bad = clone(good);
  bad.recommendations[0].norm_refs = ['N1', 'N7'];
  const { fetchFn } = fakeAnthropic([
    [tu('a', 'calculate_score'), ...SEARCHES.map((q, i) => tu('s' + i, 'search_norms', { query: q }))],
    [tu('b', 'submit_conclusion', bad)],
  ]);
  const out = await runAgent(clone(sample), { provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' }, fetchFn, searchNorms: demoSearchNorms });
  assert.equal(out.stage, 'draft_ready');
  assert.deepEqual(out.conclusion.recommendations[0].norm_refs, ['N1']);
  assert.match(out.check.fixes.join(' '), /N7/);
});

test('AI хэрэгсэл дуудахгүй зогсвол сануулж, дахин зогсвол бууж өгнө', async () => {
  const { fetchFn, requests } = fakeAnthropic([[{ type: 'text', text: 'Сайн байна уу' }], [{ type: 'text', text: '...' }]]);
  const out = await runAgent(clone(sample), { provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' }, fetchFn });
  assert.equal(out.stage, 'failed');
  assert.match(requests[1].body.messages.at(-1).content, /submit_conclusion/);
});

// ---------- Gemini-ийн дуураймал ----------
test('Gemini: function calling, thought signature хадгалагдана', async () => {
  const requests = [];
  const script = [
    { role: 'model', parts: [
      { functionCall: { name: 'calculate_score', args: {} }, thoughtSignature: 'SIG_1' },
      ...SEARCHES.map((q) => ({ functionCall: { name: 'search_norms', args: { query: q } } })),
    ] },
    { role: 'model', parts: [{ functionCall: { name: 'submit_conclusion', args: good }, thoughtSignature: 'SIG_2' }] },
  ];
  let n = 0;
  const fetchFn = async (url, opts) => {
    requests.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ candidates: [{ content: script[n++] }] }) };
  };
  const out = await runAgent(clone(sample), { provider: 'gemini', env: { GEMINI_API_KEY: 'g' }, fetchFn, searchNorms: demoSearchNorms });
  assert.equal(out.stage, 'draft_ready');
  assert.match(requests[0].url, /models\/gemini-3\.5-flash:generateContent$/);
  assert.equal(requests[0].headers['x-goog-api-key'], 'g');
  assert.equal(requests[0].body.tools[0].functionDeclarations.length, 4);
  const c = requests[1].body.contents;
  assert.equal(c[1].role, 'model');
  assert.equal(c[1].parts[0].thoughtSignature, 'SIG_1');
  assert.equal(c[2].role, 'user');
  assert.equal(c[2].parts.length, 4);
  assert.equal(c[2].parts[0].functionResponse.name, 'calculate_score');
  assert.equal(c[2].parts[0].functionResponse.response.pct, 61.2);
});

test('Gemini: загвар олдохгүй бол ойлгомжтой алдаа', async () => {
  const fetchFn = async () => ({ ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) });
  await assert.rejects(
    runAgent(clone(sample), { provider: 'gemini', env: { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'old-model' }, fetchFn }),
    /GEMINI_MODEL/,
  );
});

// ---------- Vercel функц ----------
function call(method, body, headers = {}) {
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); return this; } };
    handler({ method, headers, body }, res);
  });
}

test('API: түлхүүргүй үед ойлгомжтой мэдэгдэл, линк нээлттэй (код шаардахгүй)', async () => {
  const saved = { ...process.env };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.ACCESS_CODE;
  const g = await call('GET');
  assert.deepEqual(g.data, { ready: false, provider: null, review: false, needs_code: false });
  const p = await call('POST', { inspection: clone(sample) });
  assert.equal(p.code, 503);
  assert.match(p.data.error, /GEMINI_API_KEY/);
  process.env = saved;
});

test('API: ACCESS_CODE тохируулсан үед л код шаардана', async () => {
  const saved = { ...process.env };
  process.env.ACCESS_CODE = '1234'; process.env.GEMINI_API_KEY = 'g';
  assert.equal((await call('POST', { inspection: clone(sample) }, { 'x-access-code': 'буруу' })).code, 401);
  process.env = saved;
});
