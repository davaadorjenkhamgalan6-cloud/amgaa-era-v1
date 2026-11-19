// Агентын хэрэгслүүд: AI аль хэрэгслийг хэзээ дуудахаа өөрөө шийднэ.
// Тооцоо, шалгалт нь кодоор хийгдэнэ — AI зөвхөн шийдвэр гаргаж, текст бичнэ.
import { computeScore } from './scoring.js';
import { checkDraft } from './check.js';
import { SEVERITIES, PRIORITIES, REC_GROUPS } from './config.js';

const str = { type: 'string' };
const strArr = { type: 'array', items: { type: 'string' } };

export const TOOL_DEFS = [
  {
    name: 'calculate_score',
    description: '15 үзүүлэлтийн жинлэсэн оноо, эрсдэлийн зэрэглэл, сул үзүүлэлтүүдийг кодоор тооцож буцаана. Дүгнэлт бичихээс өмнө заавал дуудна.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_norms',
    description: 'Норм, дүрмийн сангаас зөрчил эсвэл сэдвээр хайж, холбогдох заалтуудыг N-кодтой буцаана. Зөрчил бүрээр тусад нь хайна. Нэг алхамд олон удаа зэрэг дуудаж болно.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Хайх утга, жишээ нь "самбарын хаалт" эсвэл "RCD залгуур"' } }, required: ['query'] },
  },
  {
    name: 'return_to_engineer',
    description: 'Дүгнэлт гаргахад шаардлагатай мэдээлэл дутуу эсвэл зөрчилтэй бол инженерт буцаана. Ингэвэл ажил энд дуусна.',
    parameters: {
      type: 'object',
      properties: { missing: { ...strArr, description: 'Дутуу эсвэл тодруулах зүйлс' }, message: { type: 'string', description: 'Инженерт хандсан товч тайлбар' } },
      required: ['missing', 'message'],
    },
  },
  {
    name: 'submit_conclusion',
    description: 'Бэлэн болсон дүгнэлтийг илгээнэ. Код шалгаж, алдаа байвал буцаана — тэгвэл засаад дахин илгээнэ.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '2–3 өгүүлбэр: объект, ерөнхий байдал, оноо ба зэрэглэл' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'F1, F2…' },
              title: str,
              source_ids: { ...strArr, description: 'V-код (зөрчил), I-код (сул үзүүлэлт)' },
              evidence: { type: 'string', description: 'Талбайн баримт' },
              severity: { type: 'string', enum: SEVERITIES },
            },
            required: ['id', 'title', 'source_ids', 'evidence', 'severity'],
          },
        },
        potential_risks: strArr,
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Товч нэр томьёолол, 2–6 үг (жишээ: "Утас ба кабелийн холболт")' },
              group: { type: 'string', enum: REC_GROUPS, description: 'ЦБД — угсралт, монтаж, газардуулга, хамгаалалт, туршилт; ТЭД — ашиглалт, баримт бичиг, хаягжилт, үзлэг, ажилтан, галын аюулгүй байдал; Бусад' },
              action: { type: 'string', description: '1–2 өгүүлбэр, үйл үгээр эхэлж, юуг яаж хийхийг тодорхой бичнэ' },
              finding_ids: strArr,
              priority: { type: 'string', enum: PRIORITIES },
              deadline_days: { type: 'integer' },
              norm_refs: { ...strArr, description: 'Зөвхөн search_norms-оос авсан N-код' },
            },
            required: ['title', 'group', 'action', 'finding_ids', 'priority', 'deadline_days', 'norm_refs'],
          },
        },
        to_verify: strArr,
        conclusion: { type: 'string', description: 'Нэг догол мөр нэгдсэн дүгнэлт' },
      },
      required: ['summary', 'findings', 'potential_risks', 'recommendations', 'to_verify', 'conclusion'],
    },
  },
];

// Хэрэгслийг гүйцэтгэх. state нь нэг агентын ажлын явцын төлөв.
export async function runTool(name, args, state) {
  args = args || {};
  if (name === 'calculate_score') {
    const s = state.score;
    return {
      pct: s.pct, raw: s.raw, max: s.max, grade: s.grade,
      weak_indicators: s.weak.map((w) => ({ id: w.id, name: w.name, score: w.score, weight: w.weight })),
      not_applicable: s.na.map((no) => 'I' + String(no).padStart(2, '0')),
      note: 'Эдгээр тоог өөрчлөхгүй, яг хэвээр нь ашигла.',
    };
  }

  if (name === 'search_norms') {
    const q = String(args.query || '').trim();
    if (!q) return { results: [], note: 'query хоосон' };
    let hits = [];
    try { hits = (await state.searchNorms(q, 3)) || []; } catch { hits = []; }
    const results = [];
    for (const h of hits) {
      const key = String(h.id ?? `${h.code}-${h.section}`);
      let ref = state.normKeys.get(key);
      if (!ref) {
        ref = `N${state.norms.length + 1}`;
        state.normKeys.set(key, ref);
        state.norms.push({ ...h, db_id: h.id, id: ref });
      }
      results.push({ ref, source: h.code || h.title, section: h.section || null, page: h.page || null, text: h.content });
    }
    return results.length ? { results } : { results: [], note: 'Тохирох заалт олдсонгүй. Энэ зөрчилд norm_refs хоосон үлдээж, to_verify-д тэмдэглэ.' };
  }

  if (name === 'return_to_engineer') {
    state.done = { stage: 'returned_to_engineer', missing: Array.isArray(args.missing) ? args.missing : [], message: String(args.message || '') };
    return { ok: true };
  }

  if (name === 'submit_conclusion') {
    state.attempts += 1;
    const draft = JSON.parse(JSON.stringify(args));
    const check = checkDraft(draft, ctxOf(state));
    const lastChance = state.attempts >= state.maxAttempts;
    if (check.ok && (check.warnings.length === 0 || lastChance)) {
      state.done = { stage: 'draft_ready', draft, check };
      return { accepted: true };
    }
    if (!check.ok && lastChance) {
      state.done = { stage: 'failed', check };
      return { accepted: false, final: true };
    }
    return {
      accepted: false,
      errors: check.errors,
      warnings: check.warnings,
      auto_fixes: check.fixes,
      instruction: 'Дээрх асуудлуудыг засаад submit_conclusion-оор дахин илгээ.',
    };
  }

  return { error: `Тодорхойгүй хэрэгсэл: ${name}` };
}

// Кодын шалгалтын орчин. sourceText — дүрмийн ишлэл эх сурвалжтай эсэхийг шалгахад (инженерийн өгөгдөл + олдсон норм)
export function ctxOf(state) {
  const normText = state.norms.map((n) => `${n.code || ''} ${n.section || ''} ${n.title || ''} ${n.content || ''}`).join('\n');
  return { violations: state.violations, clarifies: state.clarifies, norms: state.norms, score: state.score, sourceText: `${state.sourceText || ''}\n${normText}` };
}
