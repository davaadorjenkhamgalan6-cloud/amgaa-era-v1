// Алхам 5: AI-ийн ноорогийг кодоор шалгах.
// errors  — ноорогийг ашиглах боломжгүй (бүтэц эвдэрсэн г.м.)
// warnings — хэрэглэж болно, гэхдээ шууд удирдлага анхаарах ёстой
// fixes   — код автоматаар зассан зүйл (жишээ: зохиомол нормын ишлэл хассан)
import { SEVERITIES, PRIORITIES, DEADLINE_MAX_DAYS, GRADES, INDICATORS, REC_GROUPS } from './config.js';

export function checkDraft(draft, ctx) {
  const errors = [];
  const warnings = [];
  const fixes = [];
  const d = draft;

  for (const k of ['summary', 'conclusion']) {
    if (typeof d[k] !== 'string' || !d[k].trim()) errors.push(`"${k}" талбар хоосон`);
  }
  for (const k of ['findings', 'potential_risks', 'recommendations', 'to_verify']) {
    if (!Array.isArray(d[k])) {
      if (d[k] === undefined) d[k] = [];
      else errors.push(`"${k}" нь жагсаалт биш`);
    }
  }
  if (errors.length) return { ok: false, errors, warnings, fixes };

  const knownSources = new Set([
    ...ctx.violations.map((v) => v.id),
    ...ctx.clarifies.map((c) => c.id),
    ...INDICATORS.map((i) => 'I' + String(i.no).padStart(2, '0')),
  ]);
  const normIds = new Set(ctx.norms.map((n) => n.id));
  const findingIds = new Set();

  d.findings.forEach((f, i) => {
    const label = f.id || `findings[${i}]`;
    if (!f.id) errors.push(`${label}: id алга`);
    else findingIds.add(f.id);
    if (!SEVERITIES.includes(f.severity)) errors.push(`${label}: severity буруу "${f.severity}"`);
    f.source_ids = Array.isArray(f.source_ids) ? f.source_ids : [];
    const unknown = f.source_ids.filter((s) => !knownSources.has(s));
    if (unknown.length) {
      f.source_ids = f.source_ids.filter((s) => knownSources.has(s));
      fixes.push(`${label}: байхгүй эх код хассан (${unknown.join(', ')})`);
    }
    if (!f.source_ids.length) warnings.push(`${label}: аль баримтаас гарсан нь тодорхойгүй (source_ids хоосон)`);
  });

  const covered = new Set();
  d.recommendations.forEach((r, i) => {
    const label = `Зөвлөмж ${i + 1}`;
    if (typeof r.action !== 'string' || !r.action.trim()) errors.push(`${label}: action хоосон`);
    if (!PRIORITIES.includes(r.priority)) errors.push(`${label}: priority буруу "${r.priority}"`);
    const days = Number(r.deadline_days);
    if (!Number.isInteger(days) || days < 1) errors.push(`${label}: deadline_days бүхэл эерэг тоо биш`);
    else if (DEADLINE_MAX_DAYS[r.priority] && days > DEADLINE_MAX_DAYS[r.priority]) {
      warnings.push(`${label}: "${r.priority}" зэрэгт ${days} хоног хэт урт (≤ ${DEADLINE_MAX_DAYS[r.priority]})`);
    }
    r.norm_refs = Array.isArray(r.norm_refs) ? r.norm_refs : [];
    const fake = r.norm_refs.filter((n) => !normIds.has(n));
    if (fake.length) {
      r.norm_refs = r.norm_refs.filter((n) => normIds.has(n));
      fixes.push(`${label}: нормын санд байхгүй ишлэл хассан (${fake.join(', ')})`);
    }
    // Бүлэг: алга эсвэл буруу бол текстээс тааж засна
    if (!REC_GROUPS.includes(r.group)) {
      const g = /ТЭД/.test(r.action || '') ? 'ТЭД' : /ЦБД/.test(r.action || '') ? 'ЦБД' : 'Бусад';
      fixes.push(`${label}: бүлэг "${r.group ?? ''}" → "${g}"`);
      r.group = g;
    }
    if (typeof r.title !== 'string' || !r.title.trim()) warnings.push(`${label}: товч нэр (title) алга`);
    // Дүрмийн бүлгийн дугаар эх сурвалжтай эсэх (нормын сан эсвэл инженерийн өгөгдөл)
    for (const [, code, nums] of String(r.action || '').matchAll(/(ЦБД|ТЭД)\s*([\d.]+(?:\s*,\s*[\d.]+)*)/g)) {
      for (const n of nums.split(/\s*,\s*/).map((x) => x.replace(/\.$/, ''))) {
        if (n && !hasRef(ctx.sourceText || '', code, n)) warnings.push(`${label}: "${code} ${n}" ишлэл нормын сан, инженерийн өгөгдөлд алга — шалгах`);
      }
    }
    r.finding_ids = Array.isArray(r.finding_ids) ? r.finding_ids : [];
    r.finding_ids.forEach((f) => (findingIds.has(f) ? covered.add(f) : warnings.push(`${label}: байхгүй finding "${f}"-д холбогдсон`)));
  });

  for (const f of findingIds) if (!covered.has(f)) warnings.push(`${f}: зөвлөмжгүй үлдсэн`);

  // Эрсдэл, зөвлөмжийг AI өөрөө гаргах ёстой — зөрчил/сул үзүүлэлт байхад хоосон байж болохгүй
  const hasProblems = d.findings.length > 0 || ctx.violations.length > 0 || ctx.score.weak.length > 0;
  if (hasProblems && !d.potential_risks.filter((x) => String(x || '').trim()).length) {
    warnings.push('Үүсэж болзошгүй эрсдэл (potential_risks) хоосон — зөрчил бүрээс гарах эрсдэлийг бич');
  }
  if (hasProblems && !d.recommendations.length) warnings.push('Зөвлөмж (recommendations) хоосон — зөрчил бүрт зөвлөмж бич');

  // Хамралт: V зөрчил, сул үзүүлэлт бүр дүгнэлтэд орсон уу
  const used = new Set(d.findings.flatMap((f) => f.source_ids));
  const mustCover = [...ctx.violations.map((v) => v.id), ...ctx.score.weak.map((w) => w.id)];
  const missed = mustCover.filter((id) => !used.has(id));
  if (missed.length) warnings.push(`Дүгнэлтэд тусгагдаагүй: ${missed.join(', ')}`);

  // Тоо, зэрэглэл кодын тооцоотой таарч байна уу
  const text = `${d.summary}\n${d.conclusion}`;
  const allowed = new Set([ctx.score.pct, ...INDICATORS.map((i) => i.weight)].map((x) => Number(x).toFixed(1)));
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
    const v = Number(m[1].replace(',', '.')).toFixed(1);
    if (!allowed.has(v)) warnings.push(`Текстэд "${m[0]}" гэсэн тооцоолсон оноотой (${ctx.score.pct}%) таарахгүй тоо байна`);
  }
  // Зэрэглэлийг ил бичсэн газрыг л шалгана: «NE (Хангалтгүй)», «NE буюу Хангалтгүй», «"Хангалтгүй" зэрэглэл»,
  // «зэрэглэл: Сайн». "дунд зэрэг" гэх мэт энгийн үгийг зэрэглэл гэж андуурахгүй.
  const own = ctx.score.grade_code;
  for (const g of GRADES) {
    if (g.code === own) continue;
    const L = esc(g.label);
    const patterns = [
      new RegExp(`(^|[^A-Za-z])${g.code}["”»']?\\s*(\\(|буюу|-|—|–)\\s*["“«']?${L}`, 'iu'),
      new RegExp(`["“«']${L}["”»']\\s*зэрэглэл`, 'iu'),
      new RegExp(`зэрэглэл(?:ийг|д|тэй|ээр)?\\s*[:\\-—–]?\\s*["“«']?${L}(?![а-яөүё])`, 'iu'),
    ];
    const hit = patterns.map((re) => text.match(re)).find(Boolean);
    if (hit) warnings.push(`Текстэд "${g.code} (${g.label})" зэрэглэл бичсэн, тооцоолсон зэрэглэл "${ctx.score.grade}"`);
  }

  return { ok: errors.length === 0, errors, warnings, fixes };
}

// sourceText-д тухайн дүрмийн нэр ба бүлгийн дугаар хоёулаа байгаа эсэх
function hasRef(src, code, num) {
  if (!src.includes(code)) return false;
  return new RegExp(`(^|[^\\d.])${esc(num)}(?![\\d])`).test(src);
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
