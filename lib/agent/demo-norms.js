// ТУРШИЛТЫН ГОРИМД ЗОРИУЛСАН жишээ нормын сан.
// Эдгээр нь бодит стандартын текст БИШ — зөвхөн урсгалыг харуулах зорилготой.
// Жинхэнэ ажилд Supabase-ийн norm_chunks хүснэгтээс хайна.

export const DEMO_NORMS = [
  {
    id: 'demo-1', code: 'ЖИШЭЭ НОРМ', title: 'Туршилтын жишээ', section: 'Ж-1', page: null,
    content: 'Хуваарилах самбарын гүйдэл дамжуулах хэсгийг хаалт, тагаар бүрэн хамгаалж, хаалгыг түгжинэ.',
    keywords: ['самбар', 'хаалт', 'таг'],
  },
  {
    id: 'demo-2', code: 'ЖИШЭЭ НОРМ', title: 'Туршилтын жишээ', section: 'Ж-2', page: null,
    content: 'Тусгаарлагч нь гэмтэлтэй кабелийг ашиглахгүй, солих эсвэл засварласны дараа тусгаарлагчийн эсэргүүцлийг хэмжинэ.',
    keywords: ['кабел', 'тусгаарлагч'],
  },
  {
    id: 'demo-3', code: 'ЖИШЭЭ НОРМ', title: 'Туршилтын жишээ', section: 'Ж-3', page: null,
    content: 'Залгуурын шугамыг хамгаалалтын салгах төхөөрөмж (RCD/УЗО)-өөр хамгаалж, ажиллагааг тогтмол туршина.',
    keywords: ['rcd', 'узо'],
  },
];

export async function demoSearchNorms(q, k = 3) {
  const text = q.toLowerCase();
  return DEMO_NORMS
    .map((n) => ({ n, hits: n.keywords.filter((w) => text.includes(w)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, k)
    .map(({ n }) => {
      const { keywords, ...rest } = n;
      return rest;
    });
}
