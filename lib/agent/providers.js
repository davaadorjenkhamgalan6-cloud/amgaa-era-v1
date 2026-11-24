// AI үйлчилгээний адаптерууд. Агентын давталт нь аль үйлчилгээ болохоос үл хамаарна.
//   step()    → AI-аас дараагийн алхмыг авна: { calls: [{id, name, args}], text }
//   respond() → хэрэгслийн үр дүнг AI руу буцаана
//   nudge()   → AI хэрэгсэл дуудалгүй зогсвол сануулна

export function pickProvider(env = process.env) {
  const want = (env.AI_PROVIDER || '').toLowerCase();
  if (want === 'anthropic' || want === 'claude') return env.ANTHROPIC_API_KEY ? 'anthropic' : null;
  if (want === 'gemini') return env.GEMINI_API_KEY ? 'gemini' : null;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}

// AI-ийн нэг дуудлагын хугацааны хязгаар (байхгүй бол хязгааргүй)
const sig = (ms) => (ms > 0 && typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(Math.round(ms)) : undefined);

export function createProvider(name, { system, user, tools, env = process.env, fetchFn = fetch }) {
  if (name === 'anthropic') return anthropic({ system, user, tools, env, fetchFn });
  if (name === 'gemini') return gemini({ system, user, tools, env, fetchFn });
  throw new Error('AI үйлчилгээ тохируулаагүй');
}

function anthropic({ system, user, tools, env, fetchFn }) {
  const model = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const messages = [{ role: 'user', content: user }];
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  return {
    model,
    async step({ timeoutMs } = {}) {
      const r = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 8000, system, tools: toolDefs, messages }),
        signal: sig(timeoutMs),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Claude API алдаа ${r.status}: ${data?.error?.message || ''}`);
      messages.push({ role: 'assistant', content: data.content });
      return {
        calls: data.content.filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, args: c.input })),
        text: data.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim(),
      };
    },
    respond(results) {
      messages.push({
        role: 'user',
        content: results.map(({ call, result }) => ({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) })),
      });
    },
    nudge(text) { messages.push({ role: 'user', content: text }); },
  };
}

function gemini({ system, user, tools, env, fetchFn }) {
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash';
  const contents = [{ role: 'user', parts: [{ text: user }] }];
  const toolDefs = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
  return {
    model,
    async step({ timeoutMs } = {}) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const r = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, tools: toolDefs }),
        signal: sig(timeoutMs),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const hint = r.status === 404 ? ` ("${model}" загвар олдсонгүй — GEMINI_MODEL тохиргоог шалга)` : '';
        throw new Error(`Gemini API алдаа ${r.status}: ${data?.error?.message || ''}${hint}`);
      }
      const content = data?.candidates?.[0]?.content;
      if (!content) throw new Error('Gemini хоосон хариу өгсөн');
      // Thought signature-ийг хадгалахын тулд AI-ийн хариуг өөрчлөлтгүй буцааж нэмнэ
      contents.push({ ...content, role: 'model' });
      const parts = content.parts || [];
      return {
        calls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: p.functionCall.id || `g${i}`, name: p.functionCall.name, args: p.functionCall.args || {}, raw: p.functionCall })),
        text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim(),
      };
    },
    respond(results) {
      contents.push({
        role: 'user',
        parts: results.map(({ call, result }) => ({
          functionResponse: { ...(call.raw?.id ? { id: call.raw.id } : {}), name: call.name, response: result },
        })),
      });
    },
    nudge(text) { contents.push({ role: 'user', parts: [{ text }] }); },
  };
}
