// ЦБД чатбот: зөвхөн хөтчөөс ирсэн дүрмийн ишлэлд тулгуурлан хариулна.
// Хариулт бүрт [§1.7.32] хэлбэрийн ишлэл байх ёстой; код нь ишлэл үнэхээр өгөгдсөн заалтаас эсэхийг шалгана.

export const NOT_FOUND = 'Оруулсан хууль, дүрэмд энэ асуултад хариулах заалт олдсонгүй.';

export const CHAT_SYSTEM = `Чи цахилгааны хууль, дүрмийн (ЦБД, ТЭД, Эрчим хүчний тухай хууль гэх мэт) лавлагааны туслах.
Ишлэл бүрийн эхэнд аль баримтынх болох нь код/дугаараар нь заагдсан (жишээ: [§2.1.5] — ЦБД, [§ТЭД 1.3], [§ЭХТХ 12.1]).
ДҮРЭМ:
1. Зөвхөн хэрэглэгчийн мессежид өгөгдсөн хууль, дүрмийн ишлэлүүдэд тулгуурлан хариулна. Өөрийн мэдлэг, бусад стандарт (ПУЭ, IEC, БНбД гэх мэт), интернэтийн мэдээлэл ашиглахгүй.
2. Ишлэлд хариулт байхгүй бол яг ингэж хариулна: "${NOT_FOUND}" — дараа нь асуултыг яаж тодруулахыг нэг өгүүлбэрээр санал болгож болно.
3. Өгүүлбэр бүрийн ард тулгуурласан заалтаа дөрвөлжин хаалтанд бичнэ: [§1.7.32]. Зөвхөн ишлэлд байгаа дугаарыг ашиглана, зохиохгүй.
4. Тоон утга (Ом, мм, м, А, В, хугацаа)-г ишлэлд байгаагаар нь яг хуулна, тойм, тооцоо хийхгүй.
5. Цахилгаантай холбоогүй асуултад: "Би зөвхөн цахилгааны хууль, дүрмийн талаар хариулна." гэж хариулна.
7. Хэд хэдэн баримтад өөр өөр шаардлага байвал хоёуланг нь ишлэлтэй нь бичиж, ялгааг тэмдэглэнэ.
6. Монгол хэлээр, товч, тодорхой. Шаардлагатай бол жагсаалтаар.
8. Томьёог LaTeX, $ тэмдэгтгүй, энгийн текстээр бичнэ: R ≤ 125 / I, U = I · R.`;

const MAX_EXCERPTS = 8, MAX_CHARS = 14000;

export function cleanExcerpts(list) {
  if (!Array.isArray(list)) return [];
  let total = 0;
  const out = [];
  for (const x of list.slice(0, MAX_EXCERPTS)) {
    const section = String(x && x.section || '').slice(0, 40), content = String(x && x.content || '').slice(0, 3000);
    if (!content || total + content.length > MAX_CHARS) continue;
    total += content.length;
    out.push({ section, page: x.page ?? null, content });
  }
  return out;
}

export function chatUser(question, excerpts) {
  const ex = excerpts.map((e) => `[§${e.section}${e.page ? ` | х.${e.page}` : ''}]\n${e.content}`).join('\n\n---\n\n');
  return `Хууль, дүрмийн ишлэлүүд:\n\n${ex || '(тохирох заалт олдсонгүй)'}\n\n===\nАсуулт: ${question}`;
}

// Хариултын ишлэлийг шалгана: зөвшөөрөгдөөгүй дугаарыг тэмдэглэнэ
export function checkAnswer(answer, excerpts) {
  const allowed = new Set(excerpts.map((e) => e.section));
  const refs = [...String(answer).matchAll(/\[§\s*([^\]|]+?)\s*(?:\|[^\]]*)?\]/g)].map((m) => m[1].trim());
  const cited = [...new Set(refs.filter((r) => allowed.has(r)))];
  const invalid = [...new Set(refs.filter((r) => !allowed.has(r)))];
  const notFound = answer.includes(NOT_FOUND) || /зөвхөн цахилгааны хууль, дүрмийн|зөвхөн Цахилгаан байгууламжийн дүрмийн/i.test(answer);
  return { cited, invalid, grounded: notFound || (cited.length > 0 && invalid.length === 0), notFound };
}

export async function callModel(provider, { system, messages, env, fetchFn, maxTokens = 0, json = false }) {
  if (provider === 'anthropic') {
    const r = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens || 1500, temperature: 0, system, messages }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Claude API алдаа ${r.status}: ${d?.error?.message || ''}`);
    return (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  }
  if (provider === 'gemini') {
    // Үндсэн загвар ачаалалтай (503/429) эсвэл удаан байвал нөөц загвар руу шилжинэ.
    // 2026-11-21: gemini-3.5-flash "high demand" 503 өгч, хариулт 45–60 сек болж байсан.
    const primary = env.GEMINI_MODEL || 'gemini-3.5-flash';
    const fallbacks = (env.GEMINI_FALLBACK_MODELS || 'gemini-flash-lite-latest,gemini-2.5-flash').split(',').map((x) => x.trim()).filter((x) => x && x !== primary);
    const timeoutMs = Number(env.GEMINI_TIMEOUT_MS) || 12000;
    const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    // Хурд: лавлагааны хариултад гүн "бодол" хэрэггүй — thinking-ийг бага түвшинд барина.
    // Gemini 3-т temperature-ийг 1.0 (анхдагч)-аар үлдээхийг Google зөвлөдөг (0 үед давталт, удаашрал үүсдэг).
    const level = env.GEMINI_THINKING || 'low';
    const post = async (model, thinking) => {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
      try {
        const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', signal: ctl?.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents,
            generationConfig: { maxOutputTokens: maxTokens || 2048, ...(json ? { responseMimeType: 'application/json' } : {}), ...(thinking ? { thinkingConfig: { thinkingLevel: level } } : {}) } }),
        });
        return { status: r.status, ok: r.ok, d: await r.json().catch(() => ({})) };
      } catch (e) {
        return { status: e?.name === 'AbortError' ? 504 : 0, ok: false, d: { error: { message: e?.name === 'AbortError' ? `${Math.round(timeoutMs / 1000)} сек-д хариу ирсэнгүй` : (e?.message || 'сүлжээний алдаа') } } };
      } finally { if (timer) clearTimeout(timer); }
    };
    let last = null;
    for (const model of [primary, ...fallbacks]) {
      const t0 = Date.now();
      let res = await post(model, level !== 'off');
      // Загвар thinkingLevel-ийг танихгүй бол түүнгүйгээр дахин оролдоно
      if (res.status === 400 && /think/i.test(res.d?.error?.message || '')) res = await post(model, false);
      // Хурдыг Vercel-ийн Logs-оос харахад зориулсан мөр
      console.log(JSON.stringify({ chat: 'gemini', model, ms: Date.now() - t0, status: res.status, usage: res.d?.usageMetadata || null }));
      if (res.ok) {
        const text = (res.d?.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim();
        if (text) return text;
        last = { status: 200, msg: 'хоосон хариу' };
        continue;
      }
      last = { status: res.status, msg: res.d?.error?.message || '' };
      // Түлхүүр буруу, хүсэлт буруу бол өөр загвар туршаад нэмэргүй (404 = загвар байхгүй → дараагийнх)
      if ([400, 401, 403].includes(res.status)) break;
    }
    throw new Error(`Gemini API алдаа ${last?.status}: ${last?.msg || ''}`);
  }
  throw new Error('AI үйлчилгээ тохируулаагүй');
}

// AI заримдаа томьёог LaTeX-ээр ($R = 125 / I$) бичдэг — энгийн текст болгоно
const TEX = { le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', cdot: '·', times: '×', div: '÷', pm: '±',
  Omega: 'Ω', omega: 'ω', alpha: 'α', beta: 'β', Delta: 'Δ', delta: 'δ', phi: 'φ', varphi: 'φ', rho: 'ρ', lambda: 'λ', mu: 'μ', pi: 'π', sqrt: '√', degree: '°', circ: '°', infty: '∞', to: '→' };
export function plainMath(text) {
  const conv = (m) => {
    let t = m.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\^\{?\s*\\circ\s*\}?/g, '°').replace(/\^\{([^{}]*)\}/g, '^$1').replace(/_\{([^{}]*)\}/g, '$1').replace(/_(\w)/g, '$1');
    for (let i = 0; i < 3; i++) t = t.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (x, a, b) => `${/^[\wА-яЁёӨөҮү.,]+$/.test(a) ? a : `(${a})`} / ${/^[\wА-яЁёӨөҮү.,]+$/.test(b) ? b : `(${b})`}`);
    return t.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\([A-Za-z]+)/g, (x, n) => TEX[n] ?? n)
      .replace(/\\[,;! ]/g, ' ').replace(/[{}]/g, '').replace(/\s{2,}/g, ' ').trim();
  };
  return String(text)
    .replace(/\$\$([\s\S]+?)\$\$/g, (x, m) => conv(m))
    .replace(/\\\[([\s\S]+?)\\\]/g, (x, m) => conv(m))
    .replace(/\\\(([\s\S]+?)\\\)/g, (x, m) => conv(m))
    .replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (x, m) => conv(m));
}

// history: [{ q, a }] — өмнөх асуулт хариулт (сүүлийн 3)
export async function normsChat({ question, excerpts, history = [], provider, env = process.env, fetchFn = fetch }) {
  const ex = cleanExcerpts(excerpts);
  if (!ex.length) return { answer: NOT_FOUND + ' Асуултаа өөр үгээр, жишээ нь тоног төхөөрөмжийн нэрээр асууна уу.', cited: [], invalid: [], grounded: true, notFound: true, ai: false };
  const messages = [];
  for (const h of history.slice(-3)) {
    if (!h || !h.q || !h.a) continue;
    messages.push({ role: 'user', content: `Асуулт: ${String(h.q).slice(0, 500)}` }, { role: 'assistant', content: String(h.a).slice(0, 1500) });
  }
  messages.push({ role: 'user', content: chatUser(String(question).slice(0, 1000), ex) });
  const answer = plainMath(await callModel(provider, { system: CHAT_SYSTEM, messages, env, fetchFn }));
  if (!answer) throw new Error('AI хоосон хариу өгсөн');
  return { answer, ...checkAnswer(answer, ex), ai: true };
}
