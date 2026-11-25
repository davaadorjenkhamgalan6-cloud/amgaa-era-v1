// Нэг файлтай HTML угсарна: dist/amgaa-era.html — бүх JS, docx, pdf.js, нүүрний зураг дотроо.
// file:// -ээр (Downloads хавтаснаас) шууд нээгдэж ажиллана. AI агент/чатбот-ын AI хариулт серверт (Vercel) л ажиллана.
//   node scripts/build-single.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const R = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
let html = R('index.html');
const rep = (a, b) => { if (!html.includes(a)) throw new Error('олдсонгүй: ' + a.slice(0, 60)); html = html.replace(a, () => b); };

const cover = 'data:image/jpeg;base64,' + readFileSync(new URL('../public/report/cover.jpg', import.meta.url)).toString('base64');
// norms.js (ES модуль) → энгийн объект N
const normsSrc = R('norms.js');
const names = [...normsSrc.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
const normsInline = `const N = (() => {\n${normsSrc.replace(/^export /gm, '')}\nreturn { ${names.join(', ')} };\n})();`;

rep('<script src="files.js"></script>', `<script>\n${safe(R('files.js'))}\n</script>`);
rep('<script src="cloud.js"></script>', `<script>\n${safe(R('cloud.js'))}\n</script>`);
rep('<script src="report.js"></script>', `<script>\n${safe(R('report.js'))}\nEraReport.ORG.cover = ${JSON.stringify(cover)};\n</script>
<script>\n${safe(R('vendor/docx.umd.js'))}\n</script>
<script type="text/plain" id="pdfjs-main">${safe(R('vendor/pdfjs/pdf.min.mjs'))}</script>
<script type="text/plain" id="pdfjs-worker">${safe(R('vendor/pdfjs/pdf.worker.min.mjs'))}</script>
<script>
// pdf.js-ийг хуудсан доторх текстээс blob URL болгож ачаална (file:// дээр ч ажиллана)
globalThis.__pdfjsUrls = () => {
  if (!globalThis.__pdfjsCache) {
    const b = (id) => URL.createObjectURL(new Blob([document.getElementById(id).textContent], { type: 'text/javascript' }));
    globalThis.__pdfjsCache = { main: b('pdfjs-main'), worker: b('pdfjs-worker') };
  }
  return globalThis.__pdfjsCache;
};
</script>`);
rep("import * as N from './norms.js';", safe(normsInline));
// Сервергүй (file://) үед API дуудлага шууд алдаа өгнө — хэрэглэгчид ойлгомжтой мэдэгдэл
rep('<title>', '<meta name="amgaa-build" content="single-file">\n<title>');
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/amgaa-era.html', import.meta.url), html);
console.log('dist/amgaa-era.html', (Buffer.byteLength(html) / 1048576).toFixed(2), 'МБ');
