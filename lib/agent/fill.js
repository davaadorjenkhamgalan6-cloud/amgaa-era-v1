// Шалгах хуудсыг инженерийн чөлөөт тайлбараас AI-аар бөглөх.
// Инженер "үзлэг хэрхэн явагдсан" тухай бичнэ → AI мөр бүрийн төлөв, тайлбарыг санал болгоно.
// Тайлбарт дурдагдаагүй мөрийг AI бөглөхгүй ("Шалгаагүй" үлдэнэ) — инженер өөрөө шалгана.
import { callModel } from './chat.js';

// «Тодруулах» төлөвийг AI ашиглахгүй — үндэслэл дутуу мөр «Хэсэгчлэн» болно (инженерийн шийдвэр, 2026-11-23)
export const FILL_STATUSES = ['ok', 'partial', 'violation', 'na'];
const MAX_ITEMS = 80, MAX_DESC = 6000;

export const FILL_SYSTEM = `Чи цахилгааны эрсдэлийн үзлэгийн шалгах хуудсыг бөглөх туслах.
Инженер үзлэг хэрхэн явагдсаныг чөлөөт хэлбэрээр бичнэ. Чи шалгах хуудасны мөр бүрийн төлөвийг ЗӨВХӨН тэр тайлбарт тулгуурлан тогтооно.
Төлөвүүд:
- ok = Хэвийн (шаардлага бүрэн хангасан)
- partial = Хэсэгчлэн (зарим хэсэгт л хангасан, дутуу, эсвэл хангасан нь батлагдаагүй)
- violation = Зөрчилтэй (шаардлага хангаагүй, гэмтэл, дутагдал)
- na = Хамааралгүй (энэ объектод уг шаардлага хамаарахгүй)
ДҮРЭМ:
1. Шалгах хуудасны БҮХ мөрийг заавал бөглөнө — нэг ч мөрийг орхихгүй.
2. Тайлбарт шууд дурдсан мөрт тэр ажиглалтыг ашиглана.
3. Шууд дурдаагүй мөрийг ерөнхий тайлбараас үндэслэлтэйгээр дүгнэнэ. Жишээ: "кабель ил задгай, эмх цэгцгүй" гэвэл кабелийн хамгаалалт, бүрэн бүтэн байдлын мөрүүдэд хамаарна; "бусад нь хэвийн" гэвэл дурдаагүй мөр ok.
4. Ямар ч үндэслэл олдохгүй, тодорхойгүй мөрийг partial (Хэсэгчлэн) болгож, юу дутуу эсвэл юу батлагдаагүйг тайлбарт бичнэ. "clarify", "Тодруулах" төлөв ашиглахгүй. Үндэслэлгүйгээр ok гэж зохиохгүй.
5. Мөр БҮРТ тайлбар (n) заавал бичнэ: юу ажиглагдсан, эсвэл юуг тодруулах — 1 өгүүлбэр. ok мөрт ч юу хэвийн байсныг товч бичнэ.
6. Тоо, байршил, ширхэгийг тайлбарт байгаагаар нь хуулна, зохиохгүй. Дүгнэлтээр бөглөсөн мөрийн тайлбарт "(ерөнхий тайлбараас)" гэж төгсгөнө.
7. Монгол хэлээр.
Хариуг ЗӨВХӨН JSON-оор: {"items":[{"i":<мөрийн дугаар>,"s":"<төлөв>","n":"<тайлбар>"}],"summary":"<1–2 өгүүлбэр: гол эрсдэлүүд>"}`;

export function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((x, i) => ({ i, group: String(x?.group || '').slice(0, 120), item: String(x?.item || '').slice(0, 200) })).filter((x) => x.item);
}

export function fillUser(description, items, object = {}) {
  const obj = [object.name && `Объект: ${object.name}`, object.equipment && `Тоног төхөөрөмж: ${object.equipment}`, object.voltage && `Хүчдэл: ${object.voltage} В`]
    .filter(Boolean).map((x) => String(x).slice(0, 200));
  const rows = items.map((x) => `${x.i}. [${x.group}] ${x.item}`).join('\n');
  return `${obj.length ? obj.join('\n') + '\n\n' : ''}Шалгах хуудасны мөрүүд:\n${rows}\n\n===\nИнженерийн үзлэгийн тайлбар:\n${description}`;
}

// AI-ийн хариуг задлаад зөвшөөрөгдсөн мөр, төлөвийг л үлдээнэ
export function parseFill(text, count) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI-ийн хариу JSON биш байна');
  let d;
  try { d = JSON.parse(t.slice(a, b + 1)); } catch { throw new Error('AI-ийн хариуг уншиж чадсангүй'); }
  const seen = new Set(), items = [];
  for (const x of Array.isArray(d.items) ? d.items : []) {
    const i = Number(x?.i), s = (String(x?.s || '').trim() === 'clarify' ? 'partial' : String(x?.s || '').trim());
    if (!Number.isInteger(i) || i < 0 || i >= count || seen.has(i) || !FILL_STATUSES.includes(s)) continue;
    seen.add(i);
    items.push({ i, status: s, note: String(x?.n || '').trim().slice(0, 300) });
  }
  return { items: items.sort((p, q) => p.i - q.i), summary: String(d.summary || '').trim().slice(0, 600) };
}

export async function fillChecklist({ description, items, object, provider, env = process.env, fetchFn = fetch }) {
  const desc = String(description || '').trim().slice(0, MAX_DESC);
  const list = cleanItems(items);
  if (desc.length < 10) throw new Error('Үзлэгийн тайлбар хэт богино байна');
  if (!list.length) throw new Error('Шалгах хуудасны мөр алга');
  // JSON хариу урт тул үндсэн загварыг арай удаан хүлээнэ
  const e = { ...env, GEMINI_TIMEOUT_MS: env.FILL_TIMEOUT_MS || env.GEMINI_TIMEOUT_MS || '25000' };
  const text = await callModel(provider, { system: FILL_SYSTEM, messages: [{ role: 'user', content: fillUser(desc, list, object || {}) }], env: e, fetchFn, maxTokens: 8000, json: true });
  return parseFill(text, list.length);
}
