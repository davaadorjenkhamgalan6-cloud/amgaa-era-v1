// AMGAA ERA — нийтлэг сантай (/api/records) нэгтгэх цэвэр функцууд.
// Хөтөч дээр window.EraCloud, Node дээр (тест) globalThis.EraCloud.
(function (root) {
  // Хоосон ноорог (юу ч бөглөөгүй) — санд илгээхгүй
  function isBlank(r) {
    if (!r || r.deleted) return false;
    if (r.result || r.plan || r.request || r.review) return false;
    const d = r.data || {};
    const filled = ['object_name', 'location', 'equipment', 'voltage_v', 'engineer_name', 'observations', 'inspection_story']
      .some((k) => String(d[k] ?? '').trim());
    const ck = (d.checklist || []).some((c) => c && c.status && c.status !== 'not_checked');
    const ms = (d.measurements || []).some((m) => m && Object.values(m).some((v) => String(v ?? '').trim()));
    return !filled && !ck && !ms;
  }

  const time = (r) => String((r && r.updated) || (r && r.created) || '');
  const byCreated = (a, b) => String(b.created || '').localeCompare(String(a.created || ''));

  // local: энэ хөтчийн бичлэгүүд, remote: сангийн бичлэгүүд (deleted:true тэмдэгтэй нь хамт).
  // Буцаана: records — харуулах жагсаалт, push — сан руу илгээх (энэ хөтөч дээр шинэ/шинэчлэгдсэн).
  function merge(local, remote) {
    const map = new Map();
    for (const r of remote || []) map.set(r.id, r);
    const push = [];
    const anyRemote = (remote || []).some((r) => !r.deleted);
    for (const l of local || []) {
      const r = map.get(l.id);
      if (isBlank(l)) { if (!r && !anyRemote) map.set(l.id, l); continue; }
      if (!r) { map.set(l.id, l); push.push(l); continue; }
      if (time(l) > time(r) && !r.deleted) { map.set(l.id, l); push.push(l); }
    }
    const records = [...map.values()].filter((r) => !r.deleted).sort(byCreated);
    return { records, push };
  }

  // Сүүлд илгээснээс хойш өөрчлөгдсөн бичлэгүүд
  function changed(records, sent) {
    return (records || []).filter((r) => !isBlank(r) && JSON.stringify(r) !== sent[r.id]);
  }

  root.EraCloud = { isBlank, merge, changed };
})(typeof window !== 'undefined' ? window : globalThis);
