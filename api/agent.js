// Vercel функц: POST /api/agent  { inspection }  → AI агент дүгнэлт гаргана.
// AI-ийн түлхүүр зөвхөн Vercel → Settings → Environment Variables-д хадгалагдана.
import { runAgent } from '../lib/agent/agent.js';
import { pickProvider } from '../lib/agent/providers.js';
import { demoSearchNorms } from '../lib/agent/demo-norms.js';
import { reviewEnabled, reviewProvider } from '../lib/agent/review.js';
import { buildIndex, search } from '../public/norms.js';

// Хөтчөөс ирсэн ЦБД-ийн заалтууд (оруулсан дүрмээс үзлэгийн зөрчлөөр урьдчилан шүүсэн) — байвал жишээ нормын оронд
export function normsFrom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const chunks = list.slice(0, 40).map((c, i) => ({ id: String(c.id || 'c' + i).slice(0, 40), code: String(c.code || 'ЦБД').slice(0, 20), title: String(c.title || '').slice(0, 160),
    section: String(c.section || '').slice(0, 40), page: c.page ?? null, content: String(c.content || '').slice(0, 3000) })).filter((c) => c.content);
  if (!chunks.length) return null;
  const ix = buildIndex(chunks);
  return async (q, k = 3) => search(ix, q, k).map(({ score, matched, part, ...c }) => c);
}

export default async function handler(req, res) {
  const provider = pickProvider();

  if (req.method === 'GET') {
    return res.status(200).json({ ready: Boolean(provider), provider, review: reviewEnabled(), reviewer: reviewEnabled() ? reviewProvider() : null, needs_code: Boolean(process.env.ACCESS_CODE) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Зөвхөн POST' });

  // Сонголттой хамгаалалт: ACCESS_CODE тохируулсан үед л код шаардана
  if (process.env.ACCESS_CODE && req.headers['x-access-code'] !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: 'Нэвтрэх код буруу' });
  }
  if (!provider) {
    return res.status(503).json({ error: 'AI түлхүүр тохируулаагүй байна. Vercel → Settings → Environment Variables-д GEMINI_API_KEY эсвэл ANTHROPIC_API_KEY нэмнэ үү.' });
  }

  const inspection = req.body?.inspection;
  if (!inspection || typeof inspection !== 'object') return res.status(400).json({ error: 'Үзлэгийн өгөгдөл алга' });

  try {
    const real = normsFrom(req.body?.norms);
    const out = await runAgent(inspection, { provider, searchNorms: real || demoSearchNorms, review: reviewEnabled() });
    return res.status(200).json({ ...out, demo_norms: !real });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'AI үйлчилгээтэй холбогдож чадсангүй' });
  }
}
