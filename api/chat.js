// Vercel функц: POST /api/chat  { question, excerpts: [{section, page, content}], history: [{q, a}] }
// ЦБД чатбот — хөтөч дүрмээс хайж олсон заалтуудыг илгээнэ, AI зөвхөн тэдгээрт тулгуурлан хариулна.
import { pickProvider } from '../lib/agent/providers.js';
import { normsChat } from '../lib/agent/chat.js';

export default async function handler(req, res) {
  const provider = pickProvider();
  if (req.method === 'GET') return res.status(200).json({ ready: Boolean(provider), provider });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Зөвхөн POST' });
  if (process.env.ACCESS_CODE && req.headers['x-access-code'] !== process.env.ACCESS_CODE) return res.status(401).json({ error: 'Нэвтрэх код буруу' });
  if (!provider) return res.status(503).json({ error: 'AI түлхүүр тохируулаагүй' });
  const { question, excerpts, history } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Асуулт алга' });
  try {
    return res.status(200).json(await normsChat({ question, excerpts, history: Array.isArray(history) ? history : [], provider }));
  } catch (e) {
    return res.status(502).json({ error: e.message || 'AI үйлчилгээтэй холбогдож чадсангүй' });
  }
}
