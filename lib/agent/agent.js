// AMGAA ERA AI агент — "Дүгнэлт гаргана" алхам.
// AI өөрөө: оноо тооцуулах → зөрчил бүрээр норм хайх → (дутуу бол инженерт буцаах)
//          → дүгнэлт бичих → кодын шалгалтаар засах → илгээх
import { INDICATORS, STATUS_LABEL, DEADLINE_MAX_DAYS } from './config.js';
import { validateInspection } from './validate.js';
import { computeScore, isNA } from './scoring.js';
import { TOOL_DEFS, runTool, ctxOf } from './tools.js';
import { createProvider } from './providers.js';
import { checkDraft } from './check.js';
import { claudeReview, mergeReview } from './review.js';

export const SYSTEM_PROMPT = [
  'Чи цахилгааны аюулгүй байдал, галын эрсдэлийн үнэлгээний туршлагатай инженер-шинжээч AI агент.',
  'Талбайн үзлэгийн өгөгдлөөс эрсдэлийн дүгнэлтийн НООРОГ гаргана. Ноорогийг шууд удирдлага хянана.',
  '',
  'АЖЛЫН ДАРААЛАЛ (хэрэгслүүдээ өөрөө ашигла):',
  '1. calculate_score — оноо, зэрэглэл, сул үзүүлэлтийг ав.',
  '2. search_norms — V-код бүхий зөрчил бүр, сул үзүүлэлт бүрээр нормын сангаас хай. Олон хайлтыг нэг алхамд зэрэг хийж болно.',
  '3. Хэрэв дүгнэлт гаргахад шаардлагатай мэдээлэл дутуу бол (жишээ: зөрчлийн тайлбаргүй, хэмжилт хязгаараас хэтэрсэн ч шалтгаан тодорхойгүй) return_to_engineer-ээр буцаа.',
  '4. submit_conclusion — дүгнэлтээ илгээ. Код буцаасан алдаа, анхааруулгыг засаад дахин илгээ.',
  '',
  'ХАТУУ ДҮРЭМ:',
  '- Зөвхөн өгсөн баримт болон хэрэгслийн үр дүнг ашигла. Хэмжилт, зөрчил, тоо зохиохгүй.',
  '- Нормыг ЗӨВХӨН search_norms-оос авсан N-кодоор иш тат. Олдоогүй бол norm_refs хоосон, to_verify-д "Нормын ишлэл тодруулах".',
  '- Оноо, зэрэглэлийг calculate_score-оос яг хэвээр нь хэрэглэ.',
  '- V-код бүхий зөрчил ба сул үзүүлэлт (I-код) бүр дор хаяж нэг finding-ийн source_ids-д орно.',
  '- "Тодруулах" (C-код) мөрийг батлагдсан зөрчил гэж бичихгүй — to_verify-д оруул.',
  `- deadline_days дээд хязгаар: ${Object.entries(DEADLINE_MAX_DAYS).map(([k, v]) => `${k} ≤ ${v}`).join(', ')} хоног.`,
  '- Албан, тодорхой, товч монгол хэлээр бич. Зөвлөмж бүрийг үйл үгээр эхлүүл.',
  '',
  'ЭМХ ЦЭГЦ (тайланд шууд орно):',
  '- findings: ноцтой байдлаар эрэмбэл (Өндөр → Дунд → Бага). title нь 4–10 үгтэй нэр томьёолол, evidence нь талбайн баримт 1–2 өгүүлбэр.',
  '- potential_risks: мөр бүр "Эрсдэлийн нэр. Шалтгаан ба үр дагавар." хэлбэртэй, 2 өгүүлбэрээс хэтрэхгүй, давхардахгүй.',
  '- recommendations: group (ЦБД / ТЭД / Бусад)-ээр ангилж, бүлэг дотроо зэрэг (Яаралтай → Бага)-ээр эрэмбэл.',
  '  title — 2–6 үгтэй товч нэр (жишээ: "Утас ба кабелийн холболт"); action — 1–2 өгүүлбэр, үйл үгээр эхэлсэн тодорхой ажил.',
  '  Нэг ажлыг давтахгүй; ижил төрлийн жижиг ажлыг нэг зөвлөмжид нэгтгэ.',
  '- Текстэд (title, action, evidence, potential_risks, summary, conclusion) заалтын дугаар, "§", "(Ж-1)", "(ЦБД 2.1)" зэрэг ишлэл БИЧИХГҮЙ. Нормыг зөвхөн norm_refs талбарт заана.',
  '- summary: 2–3 өгүүлбэр; conclusion: нэг догол мөр, давтамжгүй.',
].join('\n');

export function describeInspection(insp, violations, clarifies) {
  const L = [];
  L.push('## Объект', `- Нэр: ${insp.object_name}`);
  if (insp.location) L.push(`- Байршил: ${insp.location}`);
  if (insp.equipment) L.push(`- Тоног төхөөрөмж: ${insp.equipment}`);
  if (insp.voltage_v) L.push(`- Хүчдэл: ${insp.voltage_v} В`);
  if (insp.inspection_date) L.push(`- Үзлэгийн огноо: ${insp.inspection_date}`);
  if (insp.engineer_name) L.push(`- Инженер: ${insp.engineer_name}`);

  L.push('', '## Илэрсэн зөрчил (V)');
  if (violations.length) violations.forEach((v) => L.push(`- [${v.id}] ${v.group}: ${v.item}${v.status === 'partial' ? ' (хэсэгчлэн хангасан)' : ''}${v.note ? ' — ' + v.note : ' — (тайлбаргүй)'}`));
  else L.push('- Шалгах хуудсаар зөрчил тэмдэглээгүй');

  if (clarifies.length) {
    L.push('', `## ${STATUS_LABEL.clarify} (C) — батлагдаагүй`);
    clarifies.forEach((c) => L.push(`- [${c.id}] ${c.group}: ${c.item}${c.note ? ' — ' + c.note : ''}`));
  }
  const notChecked = (insp.checklist || []).filter((c) => c.status === 'not_checked');
  if (notChecked.length) L.push('', '## Шалгаагүй үлдсэн', ...notChecked.map((c) => `- ${c.group}: ${c.item}`));

  L.push('', '## 15 үзүүлэлтийн оноо (0–10)');
  INDICATORS.forEach((i) => L.push(`- I${String(i.no).padStart(2, '0')} ${i.name} (жин ${i.weight}%): ${isNA(insp.scores[i.no]) ? 'Хамааралгүй (тооцоонд ороогүй)' : insp.scores[i.no]}`));

  if (insp.measurements?.length) {
    L.push('', '## Хэмжилт');
    insp.measurements.forEach((m) => L.push(`- ${m.name}: ${m.value ?? '—'} ${m.unit || ''}${m.limit_text ? ` (хязгаар: ${m.limit_text})` : ''}${m.note ? ' — ' + m.note : ''}`));
  }
  if (insp.observations) L.push('', '## Инженерийн тэмдэглэл', insp.observations);
  L.push('', 'Ажлын дарааллын дагуу хэрэгслүүдээ ашиглан дүгнэлтээ гарга.');
  return L.join('\n');
}

// review: true бол агент дууссаны дараа Claude ноорогийг шалгаж найруулна (ANTHROPIC_API_KEY шаардлагатай).
// reviewBudgetMs: эхнээс хойш ийм хугацаа өнгөрсөн бол найруулгыг алгасна (Vercel-ийн 60 секундын хязгаар).
export async function runAgent(inspection, { provider, env = process.env, fetchFn = fetch, searchNorms, maxSteps = 8, review = false, reviewBudgetMs = 30000, now = Date.now } = {}) {
  const t0 = now();
  const log = [];
  const validation = validateInspection(inspection);
  if (!validation.ok) {
    return { stage: 'returned_to_engineer', by: 'code', missing: validation.errors, message: 'Өгөгдөл дутуу тул AI-г дуудалгүй буцаалаа.', log, validation };
  }

  const checklist = inspection.checklist || [];
  const state = {
    score: computeScore(inspection.scores),
    // "Хэсэгчлэн" хангасан мөр нь мөн дутагдал тул зөрчилтэй адил дүгнэлтэд заавал тусгана
    violations: checklist.filter((c) => c.status === 'violation' || c.status === 'partial').map((c, i) => ({ ...c, id: `V${i + 1}` })),
    clarifies: checklist.filter((c) => c.status === 'clarify').map((c, i) => ({ ...c, id: `C${i + 1}` })),
    norms: [], normKeys: new Map(),
    searchNorms: searchNorms || (async () => []),
    sourceText: [inspection.observations, ...checklist.map((c) => c.note), ...(inspection.measurements || []).map((m) => `${m.name} ${m.limit_text || ''} ${m.note || ''}`)].filter(Boolean).join('\n'),
    attempts: 0, maxAttempts: 3, done: null,
  };

  const ai = createProvider(provider, {
    system: SYSTEM_PROMPT,
    user: describeInspection(inspection, state.violations, state.clarifies),
    tools: TOOL_DEFS, env, fetchFn,
  });
  log.push({ kind: 'start', text: `Агент ажиллаж эхэллээ (${provider} · ${ai.model})` });

  let idle = 0;
  for (let step = 1; step <= maxSteps && !state.done; step++) {
    const { calls, text } = await ai.step();
    if (text) log.push({ kind: 'think', text });
    if (!calls.length) {
      if (++idle > 1) break;
      ai.nudge('Ажлаа хэрэгслээр үргэлжлүүл: дүгнэлтээ submit_conclusion-оор илгээ, эсвэл мэдээлэл дутуу бол return_to_engineer.');
      continue;
    }
    idle = 0;
    const results = [];
    for (const call of calls) {
      const result = await runTool(call.name, call.args, state);
      results.push({ call, result });
      log.push(describeStep(call, result));
      if (state.done) break;
    }
    if (!state.done) ai.respond(results);
  }

  const d = state.done;
  if (!d) return { stage: 'failed', log, message: `Агент ${maxSteps} алхамд дуусгаж чадсангүй.` };
  if (d.stage === 'returned_to_engineer') return { stage: d.stage, by: 'agent', missing: d.missing, message: d.message, log, score: publicScore(state.score) };
  if (d.stage === 'failed') return { stage: 'failed', log, check: d.check, message: 'Дүгнэлт шалгалтыг давсангүй.' };

  // ---- Claude хяналт ба найруулга ----
  let draft = d.draft, check = d.check, reviewInfo = null;
  if (review) {
    const elapsed = now() - t0;
    if (elapsed > reviewBudgetMs) {
      reviewInfo = { status: 'skipped', reason: `Агент ${Math.round(elapsed / 1000)} секунд ажилласан тул хугацаа хүрэлцэхгүй — найруулгыг алгаслаа` };
    } else {
      try {
        const facts = describeInspection(inspection, state.violations, state.clarifies);
        const timeoutMs = Math.max(8000, Math.min(25000, reviewBudgetMs + 22000 - elapsed));
        const { model, edit } = await claudeReview(draft, facts, { env, fetchFn, timeoutMs });
        const { draft: merged, kept } = mergeReview(draft, edit);
        const c2 = checkDraft(merged, ctxOf(state));
        const issues = Array.isArray(edit.issues) ? edit.issues.filter(Boolean) : [];
        if (!c2.ok || c2.warnings.length > check.warnings.length) {
          reviewInfo = { status: 'reverted', model, issues, changes: [], kept, reason: 'Найруулсан хувилбар кодын шалгалтад муудсан тул агентын ноорогийг хэвээр үлдээв' };
        } else {
          draft = merged; check = c2;
          reviewInfo = { status: 'applied', model, issues, changes: Array.isArray(edit.changes) ? edit.changes.filter(Boolean) : [], kept };
        }
      } catch (e) {
        reviewInfo = { status: 'error', reason: e.message };
      }
    }
    log.push(describeReview(reviewInfo));
  }

  const conclusion = {
    object: {
      name: inspection.object_name, location: inspection.location || null, equipment: inspection.equipment || null,
      inspection_date: inspection.inspection_date || null, engineer: inspection.engineer_name || null,
    },
    score: publicScore(state.score),
    ...draft,
    review: reviewInfo,
    norms: state.norms
      .filter((n) => draft.recommendations.some((r) => r.norm_refs.includes(n.id)))
      .map(({ id, code, title, section, page, content }) => ({ id, code, title, section, page, content })),
  };
  log.push({ kind: 'done', text: check.warnings.length ? `Ноорог бэлэн — хянахад ${check.warnings.length} анхааруулгатай` : 'Ноорог бэлэн — бүх шалгалтыг давсан' });
  return { stage: 'draft_ready', log, conclusion, check, attempts: state.attempts };
}

function publicScore(s) {
  return { pct: s.pct, raw: s.raw, max: s.max, grade: s.grade, grade_code: s.grade_code, grade_label: s.grade_label, na: s.na };
}

function describeReview(r) {
  if (r.status === 'applied') {
    const parts = [`${r.changes.length} засвар`];
    if (r.issues.length) parts.push(`анхаарах ${r.issues.length}`);
    if (r.kept.length) parts.push(`тоо/код хөндсөн ${r.kept.length} засварыг буцаав`);
    return { kind: 'check', text: `Claude шалгаж найруулав: ${parts.join(', ')}` };
  }
  if (r.status === 'reverted') return { kind: 'fix', text: `Claude найруулга: ${r.reason}${r.issues.length ? ` · анхаарах ${r.issues.length}` : ''}` };
  return { kind: 'fix', text: `Claude хяналт хийгдсэнгүй: ${r.reason} — агентын ноорог хэвээр` };
}

function describeStep(call, r) {
  const a = call.args || {};
  switch (call.name) {
    case 'calculate_score':
      return { kind: 'tool', text: `Оноо тооцоолов: ${r.pct}% · ${r.grade} · сул үзүүлэлт ${r.weak_indicators.length}` };
    case 'search_norms':
      return { kind: 'tool', text: `Нормын сангаас хайв: «${a.query}» → ${r.results.length ? r.results.map((x) => `${x.ref} §${x.section}`).join(', ') : 'олдсонгүй'}` };
    case 'return_to_engineer':
      return { kind: 'stop', text: `Инженерт буцаав: ${a.message || ''}` };
    case 'submit_conclusion':
      if (r.accepted) return { kind: 'check', text: 'Дүгнэлт илгээв → кодын шалгалт давлаа' };
      if (r.final) return { kind: 'stop', text: 'Дүгнэлт шалгалтыг давж чадсангүй' };
      return { kind: 'fix', text: `Дүгнэлт илгээв → код ${r.errors.length + r.warnings.length} асуудал илрүүлэв, агент засаж байна` };
    default:
      return { kind: 'tool', text: `${call.name}` };
  }
}
