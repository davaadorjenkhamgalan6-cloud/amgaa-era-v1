// Алхам 6: AI хяналт ба найруулга (Claude эсвэл Gemini).
// Агент дүгнэлтээ гаргаж кодын шалгалтыг давсны дараа хянагч AI ноорогийг уншиж:
//   • монгол хэлний найруулга, үсгийн алдаа, нэр томьёог засна (утгыг өөрчлөхгүй)
//   • баримттай зөрчилдсөн, дутуу, эргэлзээтэй зүйлийг "issues"-д тэмдэглэж шууд удирдлагад үлдээнэ
// Хамгаалалт (код): тоо, хувь, V/C/I/F/N код өөрчлөгдсөн талбарыг буцааж хуучнаар нь үлдээнэ;
// найруулсан ноорог кодын шалгалтад муудвал бүхэлд нь хуучнаар нь үлдээнэ.

export const REVIEW_TOOL = {
  name: 'submit_review',
  description: 'Найруулсан текст болон хяналтын тэмдэглэлийг илгээнэ. Бүтэц, мөрийн тоо, дараалал яг хэвээр байна.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      conclusion: { type: 'string' },
      findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, evidence: { type: 'string' } }, required: ['id', 'title', 'evidence'] } },
      potential_risks: { type: 'array', items: { type: 'string' } },
      recommendations: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, title: { type: 'string' }, action: { type: 'string' } }, required: ['n', 'title', 'action'] } },
      to_verify: { type: 'array', items: { type: 'string' } },
      changes: { type: 'array', items: { type: 'string' }, description: 'Юу зассаныг товч (жишээ: "F2: үсгийн алдаа засав")' },
      issues: { type: 'array', items: { type: 'string' }, description: 'Засаагүй, шууд удирдлага анхаарах ёстой асуудал (баримттай зөрчилдсөн, дутуу, эргэлзээтэй)' },
    },
    required: ['summary', 'conclusion', 'findings', 'potential_risks', 'recommendations', 'to_verify', 'changes', 'issues'],
  },
};

export const REVIEW_SYSTEM = [
  'Чи цахилгааны аюулгүй байдал, галын эрсдэлийн үнэлгээний тайлангийн ахлах редактор-шинжээч.',
  'AI агентын бичсэн дүгнэлтийн ноорогийг талбайн үзлэгийн өгөгдөлтэй тулгаж шалгаад, найруулгыг сайжруулна.',
  '',
  'ЗАСАХ: монгол хэлний найруулга, үсэг, цэг таслал; цахилгааны нэр томьёог зөв, нэг мөр болгох; давхардсан, хэт урт өгүүлбэрийг товчлох;',
  'албан тайлангийн хэв маяг; зөвлөмж бүрийг үйл үгээр эхлүүлэх; зөвлөмжийн title-г 2–6 үгтэй товч нэр болгох;',
  'эрсдэлийн мөр бүрийг "Эрсдэлийн нэр. Шалтгаан ба үр дагавар." хэлбэрт оруулах.',
  '',
  'ӨӨРЧЛӨХГҮЙ: баримт, утга санаа; бүх тоо, хувь, оноо, хэмжилтийн утга, нэгж, хоног; зэрэглэл (AA/A/BB/B/NE/D);',
  'V-, C-, I-, F-, N- код; мөрийн тоо ба дараалал. Шинэ баримт, зөрчил, норм, тоо НЭМЭХГҮЙ.',
  '',
  'Хэрэв ноорогт үзлэгийн өгөгдөлтэй зөрчилдсөн, нотолгоогүй, дутуу зүйл байвал түүнийг засах гэж оролдохгүй — issues-д тодорхой бич.',
  'Асуудал байхгүй бол issues хоосон. Хариугаа зөвхөн submit_review хэрэгслээр илгээ.',
].join('\n');

const NUM_RE = /\d+(?:[.,]\d+)?/g;
const CODE_RE = /\b[VCIFN]\d+\b/g;
const tokens = (s, re) => (String(s ?? '').match(re) || []).map((x) => x.replace(',', '.')).sort().join('|');

// Найруулга тоо, кодыг хөндсөн эсэх
export function safeEdit(before, after) {
  if (typeof after !== 'string' || !after.trim()) return false;
  return tokens(before, NUM_RE) === tokens(after, NUM_RE) && tokens(before, CODE_RE) === tokens(after, CODE_RE);
}

// Хянагч AI-ийн хариуг ноорогт нэгтгэнэ. Буцаах: { draft, kept: [аюулгүй биш тул хуучнаар үлдсэн талбарууд] }
export function mergeReview(draft, ed) {
  const d = JSON.parse(JSON.stringify(draft));
  const kept = [];
  const take = (label, before, after, set) => { if (after === undefined || after === before) return; if (safeEdit(before, after)) set(after); else kept.push(label); };

  take('summary', d.summary, ed.summary, (v) => { d.summary = v; });
  take('conclusion', d.conclusion, ed.conclusion, (v) => { d.conclusion = v; });

  const fById = new Map((ed.findings || []).map((f) => [f.id, f]));
  d.findings.forEach((f) => {
    const e = fById.get(f.id); if (!e) return;
    take(`${f.id} гарчиг`, f.title, e.title, (v) => { f.title = v; });
    take(`${f.id} баримт`, f.evidence, e.evidence, (v) => { f.evidence = v; });
  });

  const rByN = new Map((ed.recommendations || []).map((r) => [Number(r.n), r]));
  d.recommendations.forEach((r, i) => {
    const e = rByN.get(i + 1); if (!e) return;
    take(`Зөвлөмж ${i + 1}`, r.action, e.action, (v) => { r.action = v; });
    if (e.title) take(`Зөвлөмж ${i + 1} нэр`, r.title || '', e.title, (v) => { r.title = v; });
  });

  for (const k of ['potential_risks', 'to_verify']) {
    const a = ed[k];
    if (!Array.isArray(a)) continue;
    if (a.length !== d[k].length) { kept.push(k === 'to_verify' ? 'Баталгаажуулах жагсаалт' : 'Эрсдэлийн жагсаалт'); continue; }
    d[k] = d[k].map((x, i) => (safeEdit(x, a[i]) ? a[i] : (a[i] !== x && kept.push(`${k}[${i + 1}]`), x)));
  }
  return { draft: d, kept };
}

// Хянагч AI: REVIEW_PROVIDER=anthropic|gemini гэж сонгож болно; эс бөгөөс Claude түлхүүр байвал Claude,
// байхгүй бол Gemini (үнэгүй түвшинтэй) ашиглана.
export function reviewProvider(env = process.env) {
  const want = String(env.REVIEW_PROVIDER || '').toLowerCase();
  if (want === 'anthropic' || want === 'claude') return env.ANTHROPIC_API_KEY ? 'anthropic' : null;
  if (want === 'gemini') return env.GEMINI_API_KEY ? 'gemini' : null;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}

export function reviewEnabled(env = process.env) {
  return Boolean(reviewProvider(env)) && String(env.AI_REVIEW || '').toLowerCase() !== 'off';
}

// Загварын нэрээс хянагчийн нэрийг гаргана (UI, логт)
export const reviewerName = (model = '') => (/^gemini/i.test(model) ? 'Gemini' : /^claude/i.test(model) ? 'Claude' : 'AI');

// draft: агентын батлагдсан ноорог; facts: describeInspection()-ий текст
export async function aiReview(draft, facts, { env = process.env, fetchFn = fetch, timeoutMs = 25000 } = {}) {
  const provider = reviewProvider(env);
  if (!provider) throw new Error('Хяналтын AI түлхүүр тохируулаагүй');
  const model = provider === 'gemini'
    ? env.REVIEW_MODEL || env.GEMINI_MODEL || 'gemini-3.5-flash'
    : env.REVIEW_MODEL || env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const name = reviewerName(model);
  const payload = {
    summary: draft.summary,
    conclusion: draft.conclusion,
    findings: draft.findings.map((f) => ({ id: f.id, title: f.title, evidence: f.evidence, source_ids: f.source_ids, severity: f.severity })),
    potential_risks: draft.potential_risks,
    recommendations: draft.recommendations.map((r, i) => ({ n: i + 1, title: r.title || '', group: r.group, action: r.action, priority: r.priority, finding_ids: r.finding_ids })),
    to_verify: draft.to_verify,
  };
  const user = `# Талбайн үзлэгийн өгөгдөл\n${facts}\n\n# Агентын ноорог (JSON)\n${JSON.stringify(payload, null, 1)}\n\nНоорогийг шалгаж, найруулаад submit_review-ээр илгээ.`;

  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const edit = provider === 'gemini'
      ? await geminiCall({ model, user, env, fetchFn, signal: ctl?.signal })
      : await claudeCall({ model, user, env, fetchFn, signal: ctl?.signal });
    if (!edit) throw new Error(`${name} хяналтын хариу ирүүлсэнгүй`);
    return { model, edit };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `${name} хяналт ${Math.round(timeoutMs / 1000)} секундэд дуусаагүй` : e.message);
  } finally { if (timer) clearTimeout(timer); }
}

// Хуучин нэрээр дуудсан газрууд эвдрэхгүйн тулд
export const claudeReview = aiReview;

async function claudeCall({ model, user, env, fetchFn, signal }) {
  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 8000, system: REVIEW_SYSTEM, tools: [REVIEW_TOOL], tool_choice: { type: 'tool', name: REVIEW_TOOL.name }, messages: [{ role: 'user', content: user }] }),
    signal,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude API алдаа ${r.status}: ${data?.error?.message || ''}`);
  return (data.content || []).find((c) => c.type === 'tool_use' && c.name === REVIEW_TOOL.name)?.input;
}

async function geminiCall({ model, user, env, fetchFn, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: REVIEW_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      tools: [{ functionDeclarations: [{ name: REVIEW_TOOL.name, description: REVIEW_TOOL.description, parameters: REVIEW_TOOL.input_schema }] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [REVIEW_TOOL.name] } },
      generationConfig: { temperature: 0 },
    }),
    signal,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint = r.status === 429 ? ' (үнэгүй түвшний хязгаарт хүрсэн — хэсэг хүлээгээд дахин оролдоно уу)' : '';
    throw new Error(`Gemini API алдаа ${r.status}: ${data?.error?.message || ''}${hint}`);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.find((p) => p.functionCall?.name === REVIEW_TOOL.name)?.functionCall.args;
}
