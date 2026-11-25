// Vercel функц: /api/records — нийтлэг үзлэгийн бүртгэл (Supabase)
//   GET                       → { configured, canEdit, records }  (линктэй хүн бүр харна; VIEW_CODE тохируулсан бол код шаардана)
//   POST { records: [...] }   → хадгална (зөвхөн EDIT_CODE-той хүн). Устгахдаа { id, deleted: true } илгээнэ.
// Тохиргоо (Vercel → Settings → Environment Variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Supabase төслийн хаяг, service түлхүүр
//   EDIT_CODE — засварлах код (зөвхөн та мэднэ). VIEW_CODE — (заавал биш) харах код.
import { cloudConfig, codeOk, listRecords, upsertRecords, cleanRecords } from '../lib/cloud.js';

export default async function handler(req, res) {
  const cfg = cloudConfig();
  if (!cfg) return res.status(200).json({ configured: false });
  const canEdit = codeOk(req.headers['x-edit-code'], process.env.EDIT_CODE);
  const editReady = Boolean(process.env.EDIT_CODE);
  try {
    if (req.method === 'GET') {
      if (process.env.VIEW_CODE && !canEdit && !codeOk(req.headers['x-view-code'], process.env.VIEW_CODE)) {
        return res.status(200).json({ configured: true, needsView: true, canEdit: false, editReady, records: [] });
      }
      return res.status(200).json({ configured: true, canEdit, editReady, records: await listRecords(cfg) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET эсвэл POST' });
    if (!editReady) return res.status(403).json({ error: 'EDIT_CODE тохируулаагүй тул хадгалах боломжгүй' });
    if (!canEdit) return res.status(401).json({ error: 'Засварлах код буруу' });
    const recs = cleanRecords((req.body || {}).records);
    await upsertRecords(cfg, recs);
    return res.status(200).json({ ok: true, saved: recs.length });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Сантай холбогдож чадсангүй' });
  }
}
