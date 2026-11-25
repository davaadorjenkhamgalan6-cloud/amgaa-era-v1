// Нийтлэг сан (Supabase): үзлэгүүдийг нэг газар хадгалж, линкээр орсон хүн бүр ижил бүртгэлийг харна.
// Хүснэгт: supabase/inspections.sql. Хөтөч Supabase-тэй шууд ярихгүй — бүх дуудлага /api/records-оор (service түлхүүр серверт л байна).
import { timingSafeEqual } from 'node:crypto';

const TABLE = 'inspections';

export function cloudConfig(env = process.env) {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY || '';
  return url && key ? { url, key } : null;
}

// Код таарч байгаа эсэх (хугацаагаар таах боломжгүй харьцуулалт)
export function codeOk(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function headers(cfg, extra = {}) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', ...extra };
}

async function call(cfg, path, init, fetchImpl) {
  const r = await fetchImpl(`${cfg.url}/rest/v1/${path}`, init);
  if (!r.ok) {
    let msg = ''; try { msg = (await r.json()).message || ''; } catch {}
    if (r.status === 404 || /relation .* does not exist|Could not find the table/i.test(msg)) throw new Error('Supabase-д "inspections" хүснэгт алга — supabase/inspections.sql-ийг SQL Editor-т ажиллуулна уу');
    throw new Error(`Supabase алдаа ${r.status}${msg ? ': ' + msg : ''}`);
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// Бүх бичлэг (устгасан тэмдэгтэй нь хамт — бусад төхөөрөмж дээр ч устгагдана)
export async function listRecords(cfg, fetchImpl = fetch) {
  const rows = await call(cfg, `${TABLE}?select=id,rec`, { headers: headers(cfg) }, fetchImpl);
  return rows.map((x) => ({ ...(x.rec || {}), id: x.id }));
}

export async function upsertRecords(cfg, recs, fetchImpl = fetch) {
  if (!recs.length) return;
  const body = recs.map((r) => ({ id: String(r.id), rec: r, updated_at: new Date().toISOString() }));
  await call(cfg, `${TABLE}?on_conflict=id`, { method: 'POST', headers: headers(cfg, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(body) }, fetchImpl);
}

// Хүсэлтээс ирсэн бичлэгийг шалгана: id заавал, хэт том биш
export function cleanRecords(list) {
  if (!Array.isArray(list)) throw new Error('records массив байх ёстой');
  if (list.length > 200) throw new Error('Нэг удаад 200-аас ихгүй');
  return list.map((r) => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !/^[\w-]{1,64}$/.test(r.id)) throw new Error('Буруу бичлэг');
    return r;
  });
}
