// Vercel функц: POST /api/fill  { description, items: [{group, item}], object: {name, equipment, voltage} }
// → { items: [{i, status, note}], summary } — шалгах хуудсыг инженерийн тайлбараас AI бөглөнө.
import { pickProvider } from '../lib/agent/providers.js';
import { fillChecklist } from '../lib/agent/fill.js';

export default async function handler(req, res) {
  const provider = pickProvider();
  if (req.method === 'GET') return res.status(200).json({ ready: Boolean(provider), provider });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Зөвхөн POST' });
  if (process.env.ACCESS_CODE && req.headers['x-access-code'] !== process.env.ACCESS_CODE) return res.status(401).json({ error: 'Нэвтрэх код буруу' });
  if (!provider) return res.status(503).json({ error: 'AI түлхүүр тохируулаагүй' });
  const { description, items, object } = req.body || {};
  if (!description || typeof description !== 'string') return res.status(400).json({ error: 'Үзлэгийн тайлбар алга' });
  try {
    return res.status(200).json(await fillChecklist({ description, items, object, provider }));
  } catch (e) {
    const bad = /богино|мөр алга/.test(e.message || '');
    return res.status(bad ? 400 : 502).json({ error: e.message || 'AI үйлчилгээтэй холбогдож чадсангүй' });
  }
}
