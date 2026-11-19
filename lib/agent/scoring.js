// Оноо ба зэрэглэл — зөвхөн код тооцно, AI биш. Нэг өгөгдөл → үргэлж нэг үр дүн.
// Арга (tsah2.xlsx): хувь = Σ(жин × оноо/10) / Σ(жин) × 100. Жингийн нийлбэр 100 тул бүгд
// тооцоонд орвол Excel-ийн F23-тай адил. "Хамааралгүй" (na) үзүүлэлтийн жинг хасна.
import { INDICATORS, GRADES, WEAK_SCORE, NA, gradeName } from './config.js';

export const isNA = (v) => String(v).trim().toLowerCase() === NA;

// scores: { 1: 8, 2: 6, 8: 'na', ... } хэлбэр
export function computeScore(scores) {
  let num = 0;
  let wsum = 0;
  let raw = 0;
  let applicable = 0;
  const weak = [];
  const na = [];
  for (const ind of INDICATORS) {
    const v = scores[ind.no];
    if (isNA(v)) { na.push(ind.no); continue; }
    const s = Number(v);
    num += ind.weight * (s / 10);
    wsum += ind.weight;
    raw += s;
    applicable += 1;
    if (s < WEAK_SCORE) weak.push({ ...ind, score: s, id: indicatorId(ind.no) });
  }
  const pct = wsum > 0 ? Math.round((num / wsum) * 100 * 10) / 10 : 0;
  const g = gradeFor(pct);
  return { pct, raw, max: applicable * 10, grade: gradeName(g), grade_code: g.code, grade_label: g.label, weak, na };
}

export function gradeFor(pct) {
  return GRADES.find((g) => pct >= g.min) || GRADES[GRADES.length - 1];
}

export function indicatorId(no) {
  return 'I' + String(no).padStart(2, '0');
}
