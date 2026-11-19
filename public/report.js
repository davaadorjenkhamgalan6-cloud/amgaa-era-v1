// AMGAA ERA — "Цахилгааны эрсдэлийн үнэлгээний тайлан"-г Word (.docx) болон PDF-ээр гаргана.
// Загвар: Богд Даатгалын тайлангийн бүтэц (нүүр хуудас, 1–5-р бүлэг, дүгнэлт, зөвлөмж).
// Нэг өгөгдлөөс (buildModel) хоёр гаралт: toDocx() — docx сангаар, toHtml() — хэвлэж PDF болгоно.
// Browser: window.EraReport   Node (тест): globalThis.EraReport
(function (root) {
  'use strict';

  // ⚠ Тайлангийн толгой мэдээлэл — шаардлагатай бол энд засна
  const ORG = {
    company: 'Богд Даатгал ХК',
    title: 'Цахилгааны эрсдэлийн үнэлгээний тайлан',
    band: 'ЭРСДЭЛИЙН ТАЙЛАН',
    phone: '+976 9485-7572',
    email: 'Enkh-amgalan.d@bogd-isurance.com',
    address: 'Ц.Жигжиджавын гудамж-9, Сүхбаатарын талбай, Богд Цамхаг 15160, Улаанбаатар хот, Чингэлтэй дүүрэг, Бага тойруу-3',
    role: 'Цахилгааны эрсдэлийн шинжээч',
    // Зөвлөмжийн төгсгөлийн стандарт өгүүлбэр (тайлангийн загвараас)
    recClosing: 'Дээрх ажлуудыг хийж дуусгах төлөвлөгөөг гарган нэг хувийг “Богд Даатгал” ХК-д ирүүлэх. Жил бүрийн 05-р сарын 01-нээс 15-ны хооронд буюу хөрс хуурай үед барилгын аянга, статик цахилгаанаас хамгаалагдсан байдалд “Цахилгаан техникийн байгууламжийн угсралтын дүрэм”-ийг баримтлан хэмжилт хийлгэж баталгаажуулах.',
    cover: 'report/cover.jpg',
  };

  // Үзүүлэлт бүрийн тайлбар (тайлангийн загварын "Тайлбар" баганаас)
  const DESC = {
    1: 'Кабель зориулалтын, ачаалалд тохирсон, шаардлагатай хэсэгт FRLS зэрэглэлтэй, холболт стандартын дагуу хийгдсэн эсэх.',
    2: 'Ил кабель болон шаардлагатай хэсэгт хамгаалалтын короб/труба/суваг байрласан эсэх, механик гэмтэл ба халалтын эрсдэлгүй эсэх.',
    3: 'Тоног төхөөрөмжийн их бие газардуулгын шинтэй холбогдсон, PE тэмдэглэгээтэй, холболт тасралтгүй эсэх.',
    4: 'Аянга хүлээн авагч, буултын дамжуулагч, газардуулгын холболт бүрэн, шаардлагатай хэсэгт цэнэг шавхагч суурилуулсан эсэх.',
    5: 'Цахилгаан хариуцагчийн мэргэжлийн үнэмлэх, аюулгүй ажиллагааны групп, сургалт зааварчилгаа авсан эсэх.',
    6: 'Самбар төмөр хийцтэй, хаалга түгжээтэй, схем зурагтай, автоматны нэршил тэмдэглэгээтэй, чадал таарч байгаа эсэх.',
    7: 'Автоматын гүйдэл кабелийн хөндлөн огтлолд тохирсон, УЗО/RCD ашигласан, хамгаалалтын төхөөрөмж бүрэн ажиллагаатай эсэх.',
    8: 'Галын дохиолол ажиллах үед барилгын ерөнхий болон холбогдох цахилгаан автоматаар эсвэл гар удирдлагаар салах шийдэлтэй эсэх.',
    9: 'Тусгай зөвшөөрөлтэй байгууллагаар хийлгэсэн цахилгааны үзлэг, тусгаарлалт, ачаалал, протокол хүчинтэй эсэх.',
    10: 'Газардуулгын эсэргүүцлийн хэмжилтийн албан ёсны акт, тамга тэмдэг, хүчинтэй хугацаа, хэмжилтийн үр дүн шаардлага хангасан эсэх.',
    11: 'Кабель, автомат таслуур, залгуурт хэт халалт үүссэн эсэх.',
    12: 'Кабелийн тусгаарлагч шалбарсан, зэс ил гарсан, холболт муудсан эсэх.',
    13: 'Уртасгагчид давхарлаж залгасан эсвэл байнгын хэрэглээ болгосон эсэх.',
    14: 'Самбарын өмнө нэвтрэх зай (0.8–1.0 м) чөлөөтэй эсэх.',
    15: 'Розетка, унтраалга салсан, утас ил гарсан эсэх.',
  };

  // Зөвлөмжийн бүлэг (lib/agent/config.js-ийн REC_GROUPS-тэй ижил)
  const REC_GROUPS = [
    ['ЦБД', 'Цахилгаан байгууламжийн дүрэм (ЦБД)-ийн хүрээнд хэрэгжүүлэх арга хэмжээ'],
    ['ТЭД', 'Хэрэглэгчийн цахилгаан тоног төхөөрөмжийн техник ашиглалтын дүрэм (ТЭД)-ийн хүрээнд хэрэгжүүлэх арга хэмжээ'],
    ['Бусад', 'Бусад арга хэмжээ'],
  ];
  const PRI = ['Яаралтай', 'Өндөр', 'Дунд', 'Бага'];
  // Үйлдлийн төгсгөлийн "(ЦБД 2.1)" ишлэлийг гарчгийн ард шилжүүлнэ: "Нэр (ЦБД 2.1). Үйлдэл."
  // Заалтын ишлэлийг ("(ЖИШЭЭ НОРМ §Ж-2)", "(Ж-2)", "(ЦБД 2.1)", "[§1.7.32]") тайлангийн текстээс хасна
  function stripRefs(text) {
    return String(text || '')
      .replace(/\s*\[[^\[\]]*§[^\[\]]*\]/g, '')
      .replace(/\s*\((?:[^()]*§[^()]*|\s*(?:ЖИШЭЭ НОРМ|ЦБД|ТЭД)[^()]*|\s*[A-ZА-ЯЁӨҮ]{1,3}-\d+(?:\.\d+)*\s*(?:[,;]\s*[A-ZА-ЯЁӨҮ]{1,3}-\d+(?:\.\d+)*\s*)*)\)/g, '')
      .replace(/\s+([.,;:!?])/g, '$1')
      .replace(/\.{2,}/g, '.')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function splitRef(action) {
    const a = String(action || '').trim();
    const m = a.match(/\s*\(((?:ЦБД|ТЭД)[^()]*)\)\s*\.?\s*$/);
    let body = m ? a.slice(0, m.index).trim() : a;
    if (body && !/[.!?]$/.test(body)) body += '.';
    return { ref: m ? m[1].trim() : '', body };
  }
  // Зөвлөмжүүдийг бүлэг → зэргээр эрэмбэлж бүлэглэнэ
  function groupRecs(recs) {
    return REC_GROUPS.map(([g, title]) => ({ g, title, items: recs.filter((r) => r.group === g)
      .map((r, i) => ({ ...r, _i: i })).sort((a, b) => (PRI.indexOf(a.priority) - PRI.indexOf(b.priority)) || (a._i - b._i)) }))
      .filter((x) => x.items.length);
  }

  const GRADES = [[90, 'AA', 'Маш сайн', '90–100%'], [80, 'A', 'Сайн', '80–90%'], [70, 'BB', 'Дунд', '70–80%'],
    [60, 'B', 'Анхаарал хандуулах', '60–70%'], [50, 'NE', 'Хангалтгүй', '50–60%'], [0, 'D', 'Аюултай', '50%-аас доош']];
  const TODO = '(шинжээч бөглөнө)';

  const fmtDate = (d) => (d ? String(d).replace(/-/g, '/') : '');
  const fmtPct = (p) => (Math.round(p * 100) / 100).toString();

  // ---------- Өгөгдөл ----------
  // insp: хуудасны collect(); indicators: [[no, weight, name], ...]; ai: агентын conclusion (заавал биш)
  // att = { photos: [{ caption, ind, w, h, src (dataURL — HTML), data (Uint8Array — Word) }], docs: [{ name }] } — заавал биш
  function buildModel(insp, indicators, ai, att) {
    const s = insp.scores || {};
    let num = 0, ws = 0, raw = 0, max = 0;
    const rows = indicators.map(([no, w, name]) => {
      const v = s[no];
      const na = v === 'na';
      if (!na && v !== undefined && v !== '') { num += w * Number(v) / 10; ws += w; raw += Number(v); max += 10; }
      return { no, name, weight: w, score: na ? 'Х/Б' : (v === undefined || v === '' ? '—' : String(v)), desc: DESC[no] || '' };
    });
    const pct = ws ? Math.round(num / ws * 1000) / 10 : 0;
    const g = GRADES.find(([m]) => pct >= m);
    const score = ai && ai.score ? { pct: ai.score.pct, raw: ai.score.raw, max: ai.score.max } : { pct, raw, max };
    const gg = GRADES.find(([m]) => score.pct >= m) || g;

    const cl = insp.checklist || [];
    const bad = cl.filter((c) => c.status === 'violation' || c.status === 'partial');
    const observed = ai
      ? ai.findings.map((f) => stripRefs(`${f.title}. ${f.evidence}`).replace(/\.\./g, '.'))
      : bad.map((c) => `${c.group}: ${c.item} — ${c.status === 'partial' ? 'хэсэгчлэн хангасан' : 'зөрчилтэй'}${c.note ? '. ' + c.note : ''}`);

    return {
      org: ORG,
      obj: {
        name: insp.object_name || '', location: insp.location || '', equipment: insp.equipment || '',
        voltage: insp.voltage_v ? `${insp.voltage_v} В` : '', date: fmtDate(insp.inspection_date), engineer: insp.engineer_name || '',
      },
      rows, score: { ...score, code: gg[1], label: gg[2] },
      summary: ai ? stripRefs(ai.summary) : '',
      observed, observations: insp.observations || '',
      measurements: (insp.measurements || []).filter((m) => m.name),
      clarify: cl.filter((c) => c.status === 'clarify').map((c) => `${c.group}: ${c.item}${c.note ? ' — ' + c.note : ''}`),
      risks: ai ? (ai.potential_risks || []).map(stripRefs) : null,
      recs: ai ? ai.recommendations.map((r) => ({ action: stripRefs(r.action), priority: r.priority, days: r.deadline_days, title: stripRefs(r.title || ''),
        group: ['ЦБД', 'ТЭД', 'Бусад'].includes(r.group) ? r.group : /ТЭД/.test(r.action || '') ? 'ТЭД' : /ЦБД/.test(r.action || '') ? 'ЦБД' : 'Бусад',
        norms: [] })) : null,   // заалтын ишлэлийг тайланд гаргахгүй
      toVerify: ai ? ai.to_verify || [] : [],
      conclusion: ai ? stripRefs(ai.conclusion) : '',
      ai: Boolean(ai),
      photos: ((att && att.photos) || []).map((p, i) => {
        const ind = indicators.find(([no]) => String(no) === String(p.ind));
        return { ...p, label: `Зураг ${i + 1}. ${(p.caption || '').trim() || 'Үзлэгийн зураг'}${ind ? ` (${ind[0]}. ${ind[2]})` : ''}` };
      }),
      docs: ((att && att.docs) || []).map((d) => d.name),
    };
  }

  function texts(m) {
    const o = m.obj;
    return {
      basis: `Захиалагчийн ирүүлсэн хүсэлтийн дагуу ${o.location ? o.location + ' байрлах ' : ''}${o.name}-д галын болон цахилгааны аюулын эрсдэлийг тодорхойлох, урьдчилан сэргийлэх шаардлагатай арга хэмжээг тогтоох, цаашид даатгалд хамруулах боломж нөхцөлийг үнэлэх зорилгоор газар дээрх үзлэг, шалгалтыг хийв. Үзлэгийг ${o.date || TODO}-ний өдөр хийсэн бөгөөд тухайн объектын ашиглалтын нөхцөл, цахилгаан тоноглол, галын аюулгүй байдлын хэрэгсэл, дотоод зохион байгуулалт болон эрсдэл үүсгэж болзошгүй нөхцөл байдлыг үнэлэх зорилгоор хийж гүйцэтгэв.`,
      method: 'Үнэлгээний скоринг системээр үзүүлэлт бүрт 0–10 оноо өгөх бөгөөд асуулт бүрийн эзлэх жингээс хамааруулан нийт оноог 0–100 хувьд шилжүүлнэ. Объектод хамааралгүй (Х/Б) үзүүлэлтийн жинг тооцооноос хасна. Гарсан үр дүнг дараах интервалын дагуу эрсдэлийн түвшинд харгалзуулан тогтооно.',
      total: `Нийт оноо ${m.score.raw}/${m.score.max}`,
      verdict: `Бидний эрсдэлийн үнэлгээгээр ${fmtPct(m.score.pct)}%-р тогтоогдсон бөгөөд энэ нь “${m.score.code}” буюу ${m.score.label} зэрэглэлд байна. Иймд тайланд тусгагдсан зөвлөмж, арга хэмжээнүүдийг шуурхай хэрэгжүүлсний дараа эрсдэлийн түвшинг бууруулж, боломжит аюулаас урьдчилан сэргийлэх боломжтой гэж үзэж байна.`,
      recIntro: `${ORG.company}-ийн эрсдэлийн нэгжээс ${o.location ? o.location + ' байрлах ' : ''}${o.name}-д цахилгааны болон галын аюулын эрсдэлээс урьдчилан сэргийлэх үзлэг хийж, илэрсэн зөрчил, дутагдлыг арилгах чиглэлээр дараах зөвлөмжийг хүргүүлж байна.`,
      sign: `${ORG.company}-ийн ${ORG.role}: ${o.engineer || TODO}`,
      contact: `Зөвлөмжтэй холбоотой мэдээллийг ${ORG.phone} утсаар авна уу.`,
    };
  }

  // ---------- HTML (хэвлэх → PDF) ----------
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ul = (a) => '<ul>' + a.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>';

  function toHtml(m, base) {
    const t = texts(m), o = m.obj;
    const info = [['Объектын нэр', o.name], ['Байршил', o.location], ['Тоног төхөөрөмж / зориулалт', o.equipment],
      ['Үзлэг хийсэн огноо', o.date], ['Үзлэгт оролцсон', o.engineer ? `${ORG.role}: ${o.engineer}` : '']];
    return `<!DOCTYPE html><html lang="mn"><head><meta charset="utf-8"><title>${esc(o.name)} — ${esc(ORG.title)}</title>
<style>
  @page { size:A4; margin:22mm 18mm 18mm;
    @top-right { content:"${ORG.band}"; background:#1d2f6f; color:#fff; font:bold 9pt Arial, sans-serif; letter-spacing:.5px;
                 width:62mm; height:9mm; margin-top:6mm; text-align:center; vertical-align:middle; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  @page :first { margin:0; @top-right { content:none; } }
  * { box-sizing:border-box; }
  body { font-family:'Times New Roman', Times, serif; font-size:11.5pt; line-height:1.45; color:#111; margin:0; }
  .cover { width:210mm; height:297mm; position:relative; background:url('${base}${ORG.cover}') center/cover no-repeat; break-after:page; -webkit-print-color-adjust:exact; print-color-adjust:exact; z-index:2; background-color:#fff; }
  .cover .t { position:absolute; left:15.5%; top:21%; right:32%; color:#1d2f6f; font-size:25pt; line-height:1.25; }
  .cover .l { position:absolute; left:15.5%; top:33%; color:#1d2f6f; font-size:12pt; }
  .cover .n { position:absolute; left:15.5%; top:36.5%; right:40%; color:#1d2f6f; font-size:20pt; }
  .cover .c { position:absolute; left:11%; color:#fff; font-size:9.5pt; }
  h2 { font-size:12pt; color:#1d2f6f; margin:20px 0 10px; text-transform:uppercase; text-align:center; letter-spacing:.3px; }
  h2 + p, h2 + table { break-before:avoid; }
  .rg { font-weight:bold; margin:12px 0 6px; text-align:justify; }
  ul.recs { margin:0 0 8px 0; padding-left:22px; } ul.recs li { margin-bottom:6px; text-align:justify; break-inside:avoid; }
  div.keep > ul { margin-bottom:0; } div.keep + ul { margin-top:6px; } li { break-inside:avoid; }
  p { text-align:justify; margin:0 0 8px; }
  table { width:100%; border-collapse:collapse; margin:6px 0 10px; break-inside:auto; }
  tr { break-inside:avoid; }
  table { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  th, td { border:1px solid #8c96aa; padding:5px 7px; vertical-align:middle; font-size:10.5pt; text-align:left; line-height:1.3; }
  th { background:#1d2f6f; color:#fff; font-weight:bold; font-size:10pt; }
  td.c, th.c { text-align:center; }
  td.k { background:#f2f4f9; font-weight:bold; width:35%; }
  tr.z td { background:#f2f4f9; }
  tr.tot td { background:#dce2ef; font-weight:bold; }
  table.keep, div.keep { break-inside:avoid; }
  table.grades { width:80%; margin:6px auto 10px; }
  .hl td { background:#c00000; color:#fff; font-weight:bold; }
  td.urg { color:#c00000; font-weight:bold; }
  .todo { color:#888; font-style:italic; }
  .sign { margin-top:28px; break-inside:avoid; } .sign p { margin:0 0 6px; text-align:left; }
  .bar { display:none; }
  .appx { break-before:page; }
  .phs { display:grid; grid-template-columns:1fr 1fr; gap:10px 14px; }
  figure { margin:0; break-inside:avoid; } figure img { display:block; width:100%; height:68mm; object-fit:contain; background:#f4f5f8; border:1px solid #8c96aa; }
  figcaption { font-size:10pt; text-align:center; margin-top:4px; line-height:1.3; }
  @media screen { body { background:#e9ebf0; } .cover, .page, .appx { margin:12px auto; box-shadow:0 2px 12px rgba(0,0,0,.18); }
    .page, .appx { width:210mm; background:#fff; padding:22mm 18mm; }
    .bar { display:flex; gap:8px; justify-content:center; padding:10px; position:sticky; top:0; background:#1d2f6f; z-index:5; }
    .bar button { font:600 14px Arial; padding:8px 16px; border:0; border-radius:6px; cursor:pointer; } }
  @media print { .page, .appx { padding:0; } }
</style></head><body>
<div class="bar"><button onclick="print()">PDF болгох / Хэвлэх</button><span style="color:#fff;font:13px Arial;align-self:center">Хэвлэх цонхонд "Save as PDF" сонгоно</span></div>
<section class="cover">
  <div class="t">${esc(ORG.title)}</div>
  <div class="l">Эрсдэлийн үнэлгээний объект:</div>
  <div class="n">${esc(o.name)}</div>
  <div class="c" style="top:86.3%">Утас: ${esc(ORG.phone)}</div>
  <div class="c" style="top:90.3%">И-мэйл: ${esc(ORG.email)}</div>
  <div class="c" style="top:94.7%;right:8%">${esc(ORG.address)}</div>
</section>
<div class="page">
<div class="keep"><h2>1. Үзлэг хийсэн үндэслэл</h2><p>${esc(t.basis)}</p></div>
<div class="keep"><h2>2. Объектын ерөнхий мэдээлэл</h2>
<table class="keep"><tr><th style="width:35%">Үзүүлэлт</th><th>Мэдээлэл</th></tr>${info.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v || '—')}</td></tr>`).join('')}</table></div>
<div class="keep"><h2>3. Ажиглагдсан нөхцөл байдал</h2>
${m.summary ? `<p>${esc(m.summary)}</p>` : ''}</div>
${m.observed.length ? ul(m.observed) : '<p>Шалгах хуудсаар зөрчил тэмдэглэгдээгүй.</p>'}
${m.observations ? `<p>${esc(m.observations)}</p>` : ''}
${m.measurements.length ? `<table class="keep"><tr><th>Хэмжилт</th><th class="c" style="width:20%">Утга</th><th class="c" style="width:30%">Нормын хязгаар</th></tr>${m.measurements.map((x) => `<tr><td>${esc(x.name)}</td><td class="c">${esc(x.value ?? '—')} ${esc(x.unit)}</td><td class="c">${esc(x.limit_text || '—')}</td></tr>`).join('')}</table>` : ''}
${m.clarify.length ? '<p><b>Тодруулах шаардлагатай:</b></p>' + ul(m.clarify) : ''}
${m.risks && m.risks.length ? `<div class="keep"><h2>4. Үүсэж болзошгүй эрсдэлүүд</h2><p>Дээрх зөрчлүүд нь дараах эрсдэлүүдийг үүсгэж болзошгүй байна. Үүнд:</p>${ul(m.risks.slice(0, 1))}</div>${m.risks.length > 1 ? ul(m.risks.slice(1)) : ''}` : `<div class="keep"><h2>4. Үүсэж болзошгүй эрсдэлүүд</h2><p class="todo">${TODO}</p></div>`}
<div class="keep"><h2>5. Эрсдэлийн түвшин</h2>
<p><b>Онооны дүнгээр эрсдэлийн түвшинг тодорхойлов.</b></p><p>${esc(t.method)}</p></div>
<table><thead><tr><th class="c" style="width:6%">№</th><th style="width:33%">Үзүүлэлт</th><th class="c" style="width:10%">Оноо</th><th>Тайлбар</th></tr></thead>
${m.rows.map((r, i) => `<tr${i % 2 ? ' class="z"' : ''}><td class="c">${r.no}</td><td><b>${esc(r.name)}</b></td><td class="c"><b>${esc(r.score)}</b></td><td>${esc(r.desc)}</td></tr>`).join('')}
<tr class="tot"><td colspan="2">Нийт</td><td class="c">${m.score.raw}/${m.score.max}</td><td>${fmtPct(m.score.pct)}% — ${m.score.code} (${esc(m.score.label)})</td></tr></table>
<div class="keep"><h2>Дүгнэлт</h2>
<p>Эрсдэлийн түвшин, одоогийн нөхцөл байдал. ${esc(t.total)}</p>
<table class="grades keep"><tr><th class="c" style="width:22%">Зэрэглэл</th><th class="c" style="width:28%">Хувь</th><th>Үнэлгээ</th></tr>${GRADES.map(([, c, l, r]) => `<tr${c === m.score.code ? ' class="hl"' : ''}><td class="c"><b>${c}</b></td><td class="c">${r}</td><td>${l}${c === m.score.code ? ' &nbsp;◄ энэ объект' : ''}</td></tr>`).join('')}</table></div>
<p>${esc(t.verdict)}</p>
<div class="keep"><h2>Зөвлөмж</h2><p>${esc(t.recIntro)}</p></div>
${m.recs && m.recs.length ? groupRecs(m.recs).map((grp, gi) => {
  const li = (r) => { const { ref, body } = splitRef(r.action); const refs = [ref, ...r.norms].filter(Boolean).join('; ');
    return `<li>${r.title ? `<b>${esc(r.title)}${refs ? ` (${esc(refs)})` : ''}.</b> ` : refs ? `<b>(${esc(refs)})</b> ` : ''}${esc(body)}</li>`; };
  // Бүлгийн гарчгийг эхний зөвлөмжтэй нь нэг хуудсанд барина
  return `<div class="keep"><p class="rg">${gi + 1}. ${esc(grp.title)}:</p><ul class="recs">${li(grp.items[0])}</ul></div>`
    + (grp.items.length > 1 ? `<ul class="recs">${grp.items.slice(1).map(li).join('')}</ul>` : '');
}).join('') + `<p>${esc(ORG.recClosing)}</p>` : `<p class="todo">${TODO}</p>`}
<div class="sign"><p>Бэлтгэсэн:</p><p>${esc(t.contact)}</p><p>${esc(t.sign)}</p></div>
</div>
${m.photos.length || m.docs.length ? `<div class="appx"><h2>Хавсралт</h2>
${m.photos.length ? `<p class="rg">Үзлэгийн үеэр авсан фото зураг (${m.photos.length}):</p><div class="phs">${m.photos.map((p) => `<figure><img src="${p.src}" alt=""><figcaption>${esc(p.label)}</figcaption></figure>`).join('')}</div>` : ''}
${m.docs.length ? `<p class="rg" style="margin-top:14px">Хавсаргасан баримт бичиг (${m.docs.length}):</p><ol>${m.docs.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>` : ''}
</div>` : ''}
<script>
// Гарын үсгийн хэсгийг сүүлийн хуудасны доод талд шахна.
// Хэвлэх хуудсыг (A4, дээд/доод зай 22/18 мм) дэлгэцэн дээрх байрлалаар дуурайж, хуваагдахгүй хэсгүүдийн шилжилтийг тооцно.
function layoutSign() {
  var page = document.querySelector('.page'), sign = document.querySelector('.sign');
  if (!page || !sign) return;
  var old = document.getElementById('signSpacer'); if (old) old.remove();
  var mm = 96 / 25.4, PH = (297 - 22 - 18) * mm;
  var base = page.getBoundingClientRect().top + parseFloat(getComputedStyle(page).paddingTop);
  var units = [];
  page.querySelectorAll(':scope > *:not(.sign)').forEach(function (el) {
    if (el.matches('table:not(.keep)')) {
      var th = el.querySelector('thead'), hh = th ? th.getBoundingClientRect().height : 0;
      el.querySelectorAll('tbody tr, :scope > tr').forEach(function (tr) { units.push({ el: tr, table: el, hh: hh }); });
    }
    else if (el.matches('ul')) el.querySelectorAll(':scope > li').forEach(function (li) { units.push({ el: li }); });
    else if (el.matches('p')) return;                  // догол мөр хуудас дамжин хуваагдана
    else units.push({ el: el });                       // h2, хүснэгт (keep), div.keep
  });
  // Хуваагдахгүй хэсэг хуудасны хил давбал дараагийн хуудас руу шилжинэ; хүснэгтийн толгой шинэ хуудас бүрт давтагдана
  var shift = 0, TOL = 3 * mm;
  page.querySelectorAll('table').forEach(function (t) { delete t.__pg; });
  units.forEach(function (u) {
    var r = u.el.getBoundingClientRect(), top = r.top - base + shift, bot = r.bottom - base + shift;
    var end = Math.ceil((top + 1) / PH) * PH;
    if (bot > end - TOL && r.height < PH) { shift += end - top; top = end; }
    if (u.table && u.hh) {
      var pgNo = Math.floor(top / PH);
      if (u.table.__pg !== undefined && pgNo > u.table.__pg) shift += u.hh;
      u.table.__pg = pgNo;
    }
  });
  var used = (sign.getBoundingClientRect().top - base + shift) % PH;
  var room = PH - used - sign.offsetHeight - 24;      // 24px — хэвлэлийн зөрүүнд нөөц
  if (room > 0) { var sp = document.createElement('div'); sp.id = 'signSpacer'; sp.style.height = room + 'px'; sign.parentNode.insertBefore(sp, sign); }
}
window.layoutSign = layoutSign;
window.addEventListener('load', function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(layoutSign); });
</script>
</body></html>`;
  }

  // ---------- Word (.docx) ----------
  // D = docx сан (window.docx эсвэл Node-ийн require('docx')); cover = зургийн ArrayBuffer/Uint8Array (заавал биш)
  function toDocx(m, D, cover) {
    const t = texts(m), o = m.obj;
    const NAVY = '1D2F6F', FONT = 'Times New Roman';
    const CW = 11906 - 2 * 1020; // агуулгын өргөн (twips)
    const run = (text, opt = {}) => new D.TextRun({ text: String(text ?? ''), font: FONT, size: opt.size || 23, bold: opt.bold, color: opt.color, italics: opt.italics });
    const para = (text, opt = {}) => new D.Paragraph({ children: Array.isArray(text) ? text : [run(text, opt)], alignment: opt.align || D.AlignmentType.JUSTIFIED, spacing: { after: opt.after ?? 120, before: opt.before || 0, line: 300 }, indent: opt.indent });
    const h2 = (text) => new D.Paragraph({ children: [run(text.toUpperCase(), { bold: true, color: NAVY, size: 24 })], alignment: D.AlignmentType.CENTER, spacing: { before: 320, after: 160 }, keepNext: true });
    const bullets = (arr) => arr.map((x) => new D.Paragraph({ children: [run(x)], bullet: { level: 0 }, alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 80, line: 300 } }));
    const todo = () => para(TODO, { italics: true, color: '888888' });
    // ---- Хүснэгтийн нэгдсэн загвар: хар хөх толгой, саарал нимгэн хүрээ, тоон баганыг голлуулна ----
    const border = { style: D.BorderStyle.SINGLE, size: 4, color: '8C96AA' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const LIGHT = 'F2F4F9';
    const cell = (text, opt = {}) => new D.TableCell({
      children: [new D.Paragraph({ keepNext: opt.keep, keepLines: true,
        children: String(text ?? '').split('\n').flatMap((ln, i) => { const r = run(ln, { size: opt.size || 21, bold: opt.bold, color: opt.color }); return i ? [new D.TextRun({ break: 1 }), r] : [r]; }),
        alignment: opt.center ? D.AlignmentType.CENTER : D.AlignmentType.LEFT, spacing: { before: 0, after: 0, line: 264 } })],
      width: opt.w ? { size: Math.round(CW * opt.w / 100), type: D.WidthType.DXA } : undefined,
      columnSpan: opt.span,
      verticalAlign: opt.top ? D.VerticalAlign.TOP : D.VerticalAlign.CENTER,
      shading: opt.fill ? { type: D.ShadingType.CLEAR, color: 'auto', fill: opt.fill } : undefined,
      borders, margins: { top: 70, bottom: 70, left: 100, right: 100 },
    });
    // Баганын өргөнийг twips-ээр тогтооно (LibreOffice, Word хоёуланд ижил харагдана)
    const table = (rows, cols, widthPct = 100, center = false) => new D.Table({ rows, layout: D.TableLayoutType.FIXED,
      alignment: center ? D.AlignmentType.CENTER : undefined,
      width: { size: Math.round(CW * cols.reduce((a, b) => a + b, 0) / 100), type: D.WidthType.DXA },
      columnWidths: cols.map((w) => Math.round(CW * w / 100)) });
    const hdr = (cols, keep = true) => new D.TableRow({ tableHeader: true, cantSplit: true,
      children: cols.map(([txt, w, c]) => cell(txt, { bold: true, fill: NAVY, color: 'FFFFFF', w, center: c, keep, size: 20 })) });
    const gap = () => new D.Paragraph({ children: [], spacing: { after: 160 } });

    // ---- нүүр хуудас ----
    const PW = 794, PH = 1123; // A4, px (96 dpi)
    const coverKids = [];
    if (cover) {
      coverKids.push(new D.Paragraph({ children: [new D.ImageRun({ type: 'jpg', data: cover, transformation: { width: PW, height: PH },
        floating: { horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: 0 }, behindDocument: true, allowOverlap: true } })] }));
    }
    const ind = { left: 1840, right: 3600 };
    coverKids.push(
      new D.Paragraph({ children: [run(ORG.title, { size: 50, color: NAVY })], spacing: { before: 3300, after: 500, line: 340 }, indent: ind }),
      new D.Paragraph({ children: [run('Эрсдэлийн үнэлгээний объект:', { size: 24, color: NAVY })], spacing: { after: 120 }, indent: ind }),
      new D.Paragraph({ children: [run(o.name, { size: 40, color: NAVY })], indent: { left: 1840, right: 4700 }, spacing: { after: 0 } }),
    );
    const contact = [`Утас: ${ORG.phone}`, `И-мэйл: ${ORG.email}`, ORG.address];
    coverKids.push(new D.Paragraph({ children: [], spacing: { before: Math.max(600, 9180 - Math.ceil(o.name.length / 22) * 560) } }));
    // Нүүрний зураг дээрх утас, и-мэйл, хаягийн дүрс тэмдэгтэй нэг мөрөнд таарахаар зайг тохируулсан
    contact.forEach((c, i) => coverKids.push(new D.Paragraph({ children: [run(c, { size: 19, color: 'FFFFFF' })], indent: { left: 1300, right: 900 }, spacing: { after: [420, 590, 0][i] } })));

    // ---- агуулга ----
    const info = [['Объектын нэр', o.name], ['Байршил', o.location], ['Тоног төхөөрөмж / зориулалт', o.equipment],
      ['Үзлэг хийсэн огноо', o.date], ['Үзлэгт оролцсон', o.engineer ? `${ORG.role}: ${o.engineer}` : '']];
    const K = [];
    K.push(h2('1. Үзлэг хийсэн үндэслэл'), para(t.basis));
    K.push(h2('2. Объектын ерөнхий мэдээлэл'), table([hdr([['Үзүүлэлт', 35], ['Мэдээлэл', 65]]),
      ...info.map(([k, v], i) => new D.TableRow({ cantSplit: true, children: [cell(k, { w: 35, bold: true, fill: LIGHT, keep: i < info.length - 1 }), cell(v || '—', { w: 65, keep: i < info.length - 1 })] }))], [35, 65]), gap());
    K.push(h2('3. Ажиглагдсан нөхцөл байдал'));
    if (m.summary) K.push(para(m.summary));
    K.push(...(m.observed.length ? bullets(m.observed) : [para('Шалгах хуудсаар зөрчил тэмдэглэгдээгүй.')]));
    if (m.observations) K.push(para(m.observations));
    if (m.measurements.length) {
      K.push(table([hdr([['Хэмжилт', 45], ['Утга', 20, 1], ['Нормын хязгаар', 35, 1]]),
        ...m.measurements.map((x) => new D.TableRow({ cantSplit: true, children: [cell(x.name, { w: 45 }), cell(`${x.value ?? '—'} ${x.unit || ''}`, { w: 20, center: 1 }), cell(x.limit_text || '—', { w: 35, center: 1 })] }))], [45, 20, 35]), gap());
    }
    if (m.clarify.length) K.push(para([run('Тодруулах шаардлагатай:', { bold: true })]), ...bullets(m.clarify));
    K.push(h2('4. Үүсэж болзошгүй эрсдэлүүд'));
    if (m.risks && m.risks.length) K.push(para('Дээрх зөрчлүүд нь дараах эрсдэлүүдийг үүсгэж болзошгүй байна. Үүнд:'), ...bullets(m.risks));
    else K.push(todo());
    K.push(h2('5. Эрсдэлийн түвшин'), para([run('Онооны дүнгээр эрсдэлийн түвшинг тодорхойлов.', { bold: true })]), para(t.method));
    const SC = [6, 33, 10, 51];
    K.push(table([hdr([['№', SC[0], 1], ['Үзүүлэлт', SC[1]], ['Оноо', SC[2], 1], ['Тайлбар', SC[3]]]),
      ...m.rows.map((r, i) => new D.TableRow({ cantSplit: true, children: [
        cell(r.no, { w: SC[0], center: 1, fill: i % 2 ? LIGHT : undefined }), cell(r.name, { w: SC[1], bold: true, fill: i % 2 ? LIGHT : undefined }),
        cell(r.score, { w: SC[2], center: 1, bold: true, fill: i % 2 ? LIGHT : undefined }),
        cell(r.desc, { w: SC[3], fill: i % 2 ? LIGHT : undefined })] })),
      new D.TableRow({ cantSplit: true, children: [
        cell('Нийт', { span: 2, w: SC[0] + SC[1], bold: true, fill: 'DCE2EF' }),
        cell(`${m.score.raw}/${m.score.max}`, { w: SC[2], center: 1, bold: true, fill: 'DCE2EF' }),
        cell(`${fmtPct(m.score.pct)}% — ${m.score.code} (${m.score.label})`, { w: SC[3], bold: true, fill: 'DCE2EF' })] })], SC), gap());
    K.push(h2('Дүгнэлт'), new D.Paragraph({ keepNext: true, spacing: { after: 120, line: 300 }, children: [run(`Эрсдэлийн түвшин, одоогийн нөхцөл байдал. ${t.total}`)] }));
    const GC = [18, 22, 40];
    K.push(table([hdr([['Зэрэглэл', GC[0], 1], ['Хувь', GC[1], 1], ['Үнэлгээ', GC[2]]]), ...GRADES.map(([, c, l, r], i) => {
      const hl = c === m.score.code;
      const o2 = hl ? { fill: 'C00000', color: 'FFFFFF', bold: true } : {};
      const keep = i < GRADES.length - 1;
      return new D.TableRow({ cantSplit: true, children: [cell(c, { ...o2, w: GC[0], center: 1, bold: true, keep }), cell(r, { ...o2, w: GC[1], center: 1, keep }), cell(l + (hl ? '  ◄ энэ объект' : ''), { ...o2, w: GC[2], keep })] });
    })], GC, 80, true));
    K.push(para(t.verdict, { before: 200 }));
    // AI-ийн дүгнэлтийн догол мөрийг тайланд оруулахгүй (загварын дүгнэлтийн өгүүлбэр хангалттай) — апп дотор харагдана
    K.push(h2('Зөвлөмж'), para(t.recIntro));
    if (m.recs && m.recs.length) {
      // Бүлэг бүр: "1. ЦБД-ийн хүрээнд ...:" → • "Нэр (ЦБД 2.1). Хийх ажил."
      groupRecs(m.recs).forEach((grp, gi) => {
        K.push(new D.Paragraph({ keepNext: true, alignment: D.AlignmentType.JUSTIFIED, spacing: { before: 200, after: 100, line: 300 }, children: [run(`${gi + 1}. ${grp.title}:`, { bold: true })] }));
        grp.items.forEach((r) => {
          const { ref, body } = splitRef(r.action);
          const refs = [ref, ...r.norms].filter(Boolean).join('; ');
          const head = r.title ? `${r.title}${refs ? ` (${refs})` : ''}. ` : refs ? `(${refs}) ` : '';
          K.push(new D.Paragraph({ bullet: { level: 0 }, alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 100, line: 300 },
            children: [...(head ? [run(head, { bold: true })] : []), run(body)] }));
        });
      });
      K.push(para(ORG.recClosing, { before: 160 }));
    } else K.push(todo());
    // Гарын үсгийн хэсэг: хүрээгүй хөвөгч хүснэгт — сүүлийн хуудасны зүүн доод буланд (захын зайн доод хил)
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    K.push(new D.Table({
      float: { horizontalAnchor: D.TableAnchorType.MARGIN, verticalAnchor: D.TableAnchorType.MARGIN,
        relativeHorizontalPosition: D.RelativeHorizontalPosition.LEFT, relativeVerticalPosition: D.RelativeVerticalPosition.BOTTOM, overlap: D.OverlapType.NEVER },
      // Бүтэн өргөнтэй тул текст хажуугаар нь урсахгүй: сүүлийн хуудас дүүрсэн бол гарын үсэг дараагийн хуудасны доод талд орно
      width: { size: CW, type: D.WidthType.DXA }, columnWidths: [CW], layout: D.TableLayoutType.FIXED,
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: [new D.TableRow({ children: [new D.TableCell({ borders: { top: none, bottom: none, left: none, right: none }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: ['Бэлтгэсэн:', t.contact, t.sign].map((x) => new D.Paragraph({ alignment: D.AlignmentType.LEFT, spacing: { before: 0, after: 40, line: 276 }, children: [run(x)] })) })] })],
    }));

    const band = new D.Header({ children: [new D.Table({ alignment: D.AlignmentType.RIGHT, width: { size: 34, type: D.WidthType.PERCENTAGE },
      rows: [new D.TableRow({ children: [new D.TableCell({ shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: NAVY },
        borders: { top: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
        margins: { top: 80, bottom: 80 },
        children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: ORG.band, bold: true, color: 'FFFFFF', font: 'Arial', size: 18 })] })] })] })] }),
      new D.Paragraph({ children: [] })] });
    // ---- Хавсралт: зураг (2 баганаар, тайлбартай) ба PDF баримтын жагсаалт ----
    const A = [];
    if (m.photos.length || m.docs.length) {
      A.push(h2('Хавсралт'));
      if (m.photos.length) {
        A.push(para([run(`Үзлэгийн үеэр авсан фото зураг (${m.photos.length}):`, { bold: true })]));
        const BW = 300, BH = 225; // px — нэг нүдний зургийн хүрээ
        const fit = (p) => { const k = Math.min(BW / (p.w || BW), BH / (p.h || BH)); return { width: Math.round((p.w || BW) * k), height: Math.round((p.h || BH) * k) }; };
        const nb = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const pcell = (p) => new D.TableCell({ width: { size: Math.round(CW / 2), type: D.WidthType.DXA }, borders: { top: nb, bottom: nb, left: nb, right: nb },
          margins: { top: 80, bottom: 160, left: 80, right: 80 },
          children: p ? [
            new D.Paragraph({ alignment: D.AlignmentType.CENTER, keepNext: true, children: [new D.ImageRun({ type: 'jpg', data: p.data, transformation: fit(p) })] }),
            new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 60, after: 0, line: 252 }, children: [run(p.label, { size: 20 })] })] : [new D.Paragraph({ children: [] })] });
        const rows = [];
        for (let i = 0; i < m.photos.length; i += 2) rows.push(new D.TableRow({ cantSplit: true, children: [pcell(m.photos[i]), pcell(m.photos[i + 1])] }));
        A.push(new D.Table({ rows, layout: D.TableLayoutType.FIXED, width: { size: CW, type: D.WidthType.DXA }, columnWidths: [Math.round(CW / 2), Math.round(CW / 2)],
          borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb } }));
      }
      if (m.docs.length) {
        A.push(para([run(`Хавсаргасан баримт бичиг (${m.docs.length}):`, { bold: true })], { before: 200 }));
        m.docs.forEach((d, i) => A.push(para(`${i + 1}. ${d}`, { align: D.AlignmentType.LEFT, after: 60 })));
      }
    }

    const A4 = { width: 11906, height: 16838 };
    return new D.Document({
      creator: ORG.company, title: `${o.name} — ${ORG.title}`,
      styles: { default: { document: { run: { font: FONT, size: 23 } } } },
      sections: [
        { properties: { page: { size: A4, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } }, children: coverKids },
        { properties: { page: { size: A4, margin: { top: 1250, bottom: 1000, left: 1020, right: 1020, header: 400 } } }, headers: { default: band }, children: K },
        ...(A.length ? [{ properties: { type: D.SectionType.NEXT_PAGE, page: { size: A4, margin: { top: 1250, bottom: 1000, left: 1020, right: 1020, header: 400 } } }, headers: { default: band }, children: A }] : []),
      ],
    });
  }

  function fileName(m, ext) {
    const n = (m.obj.name || 'tailan').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    return `${n} - Цахилгааны эрсдэлийн тайлан ${m.obj.date.replace(/\//g, '-')}.${ext}`.replace(/\s+\./, '.');
  }

  root.EraReport = { ORG, DESC, GRADES, buildModel, toHtml, toDocx, fileName };
})(typeof window !== 'undefined' ? window : globalThis);
