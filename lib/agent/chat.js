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
6. Монгол хэлээр, товч, тодорхой. Шаардлагатай бол жагсаалтаар.`;

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

async function callModel(provider, { system, messages, env, fetchFn }) {
  if (provider === 'anthropic') {
    const r = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1500, temperature: 0, system, messages }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Claude API алдаа ${r.status}: ${d?.error?.message || ''}`);
    return (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  }
  if (provider === 'gemini') {
    const model = env.GEMINI_MODEL || 'gemini-3.5-flash';
    const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, generationConfig: { temperature: 0 },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini API алдаа ${r.status}: ${d?.error?.message || ''}`);
    return (d?.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim();
  }
  throw new Error('AI үйлчилгээ тохируулаагүй');
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
  const answer = await callModel(provider, { system: CHAT_SYSTEM, messages, env, fetchFn });
  if (!answer) throw new Error('AI хоосон хариу өгсөн');
  return { answer, ...checkAnswer(answer, ex), ai: true };
}
