// Үзлэгийн зургаас цахилгааны үл тохирлыг AI-аар илрүүлэх.
// Нэг хүсэлтэд нэг зураг. AI зөвхөн зурган дээр ил харагдаж буй зүйлийг дүгнэнэ.
import { callModel } from './chat.js';

export const SEVERITY = ['Өндөр', 'Дунд', 'Бага'];
const MAX_IMG = 3_500_000; // base64 урт (~2.6 МБ)

export const VISION_SYSTEM = `Чи цахилгааны эрсдэлийн үзлэгийн инженерийн туслах. Үзлэгийн үеэр авсан нэг зургийг шинжилж, цахилгааны үл тохирол (зөрчил, дутагдал)-ыг илрүүлнэ.
Анхаарах зүйлс: самбарын хаалга/таг/түгжээ, ил гүйдэл дамжуулах хэсэг, схем тэмдэглэгээ, самбар доторх хог тоос, шатамхай материал, ил задгай эмх цэгцгүй кабель, короб/трубагүй кабель,
гэмтсэн тусгаарлагч, мушгиж холбосон/изолентоор ороосон холболт, хайлсан/хар болсон (халалтын) ул мөр, газардуулгын PE утас байхгүй, RCD/таслуурын байдал,
давхарласан уртасгагч, эвдэрсэн розетка/унтраалга, самбарын өмнөх зай хаагдсан, чийг ус, механик гэмтэл.
ДҮРЭМ:
1. ЗӨВХӨН зурган дээр ил харагдаж буй зүйлийг бичнэ. Харагдахгүй зүйлийг таамаглахгүй (жишээ: хэмжилтийн утга, баримт бичиг).
2. Зураг тодорхойгүй, цахилгаантай холбоогүй бол findings хоосон, caption-д юу харагдаж байгааг бичнэ.
3. Үл тохирол бүрийг шалгах хуудасны хамгийн тохирох мөрийн дугаартай (i) холбоно. Тохирох мөр байхгүй бол i = -1.
4. s: "violation" (тодорхой зөрчил) эсвэл "partial" (хэсэгчилсэн дутагдал). severity: "Өндөр" (цохилт, гал гарах шууд аюул), "Дунд", "Бага".
5. issue: юу, хаана харагдаж байгааг 1 өгүүлбэрээр, монголоор.
6. caption: зураг дээр юу харагдаж байгааг 1 өгүүлбэрээр (тайланд зургийн тайлбар болно), гол үл тохирлыг дурдана.
Хариуг ЗӨВХӨН JSON-оор: {"caption":"...","findings":[{"i":<мөрийн дугаар>,"s":"violation|partial","severity":"Өндөр|Дунд|Бага","issue":"..."}]}`;

export function visionUser(items, object = {}) {
  const obj = [object.name && `Объект: ${String(object.name).slice(0, 200)}`, object.equipment && `Тоног төхөөрөмж: ${String(object.equipment).slice(0, 120)}`].filter(Boolean);
  const rows = (Array.isArray(items) ? items : []).slice(0, 80).map((x, i) => `${i}. [${String(x?.group || '').slice(0, 120)}] ${String(x?.item || '').slice(0, 200)}`).join('\n');
  return `${obj.length ? obj.join('\n') + '\n\n' : ''}Шалгах хуудасны мөрүүд:\n${rows}\n\n===\nХавсаргасан зургийг шинжилнэ үү.`;
}

export function parseVision(text, count) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI-ийн хариу JSON биш байна');
  let d;
  try { d = JSON.parse(t.slice(a, b + 1)); } catch { throw new Error('AI-ийн хариуг уншиж чадсангүй'); }
  const findings = [];
  for (const x of Array.isArray(d.findings) ? d.findings : []) {
    const issue = String(x?.issue || '').trim().slice(0, 300);
    if (!issue) continue;
    let i = Number(x?.i);
    if (!Number.isInteger(i) || i < 0 || i >= count) i = -1;
    const s = x?.s === 'partial' ? 'partial' : 'violation';
    const severity = SEVERITY.includes(x?.severity) ? x.severity : 'Дунд';
    findings.push({ i, status: s, severity, issue });
  }
  return { caption: String(d.caption || '').trim().slice(0, 300), findings: findings.slice(0, 8) };
}

export async function analyzePhoto({ image, mime = 'image/jpeg', items, object, provider, env = process.env, fetchFn = fetch }) {
  const data = String(image || '').replace(/^data:[^,]*,/, '');
  if (!data) throw new Error('Зураг алга');
  if (data.length > MAX_IMG) throw new Error('Зураг хэт том байна');
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error('Зөвхөн JPG, PNG, WEBP зураг');
  const list = Array.isArray(items) ? items.slice(0, 80) : [];
  const e = { ...env, GEMINI_TIMEOUT_MS: env.VISION_TIMEOUT_MS || '25000' };
  const text = await callModel(provider, {
    system: VISION_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'image', mime, data }, { type: 'text', text: visionUser(list, object || {}) }] }],
    env: e, fetchFn, maxTokens: 3000, json: true,
  });
  return parseVision(text, list.length);
}
