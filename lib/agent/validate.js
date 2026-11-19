// Алхам 1: өгөгдөл бүрэн эсэхийг шалгах. errors байвал AI-г дуудахгүй, инженерт буцаана.
import { INDICATORS } from './config.js';
import { isNA } from './scoring.js';

export function validateInspection(insp) {
  const errors = [];
  const warnings = [];

  if (!insp || typeof insp !== 'object') return { ok: false, errors: ['Үзлэгийн өгөгдөл алга'], warnings };
  if (!str(insp.object_name)) errors.push('Объектын нэр бөглөөгүй');

  const scores = insp.scores || {};
  const missing = INDICATORS.filter((i) => scores[i.no] === undefined || scores[i.no] === null || scores[i.no] === '');
  if (missing.length) errors.push(`15 үзүүлэлтээс ${missing.length} нь оноогүй: ${missing.map((i) => i.no).join(', ')}`);
  for (const i of INDICATORS) {
    const s = scores[i.no];
    if (s !== undefined && s !== null && s !== '' && !isNA(s) && !(Number(s) >= 0 && Number(s) <= 10)) {
      errors.push(`${i.no}-р үзүүлэлтийн оноо 0–10 хооронд биш: ${s}`);
    }
  }
  if (!missing.length && INDICATORS.every((i) => isNA(scores[i.no]))) {
    errors.push('Бүх үзүүлэлт "Хамааралгүй" байна — оноо тооцох боломжгүй');
  }

  const checklist = Array.isArray(insp.checklist) ? insp.checklist : [];
  if (!checklist.length) warnings.push('Шалгах хуудас хоосон байна');
  const notChecked = checklist.filter((c) => c.status === 'not_checked');
  if (notChecked.length) warnings.push(`${notChecked.length} мөр "Шалгаагүй" төлөвтэй үлдсэн`);
  for (const c of checklist) {
    if ((c.status === 'violation' || c.status === 'partial') && !str(c.note)) warnings.push(`Зөрчлийн тайлбаргүй: "${c.item}"`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function str(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
