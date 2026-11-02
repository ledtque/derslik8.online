// Build step run by Wrangler before each deploy (see "build" in wrangler.jsonc).
// Copies the site into dist/ and serves a minified index.html; the source in
// the repository stays readable.
import { minify } from 'html-minifier-terser';
import { minify as minifyJs } from 'terser';
import { cp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';

const OUT = 'dist';
const STATIC = ['manifest.webmanifest', 'sw.js', 'simgeler', 'formlar'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const p of STATIC) {
  try {
    await stat(p);
    await cp(p, `${OUT}/${p}`, { recursive: true });
  } catch {
    /* optional file missing: skip */
  }
}

const src = await readFile('index.html', 'utf8');

// Scripts are minified here (module scripts need terser's module mode);
// a script that fails to minify is kept as it is.
const parts = [];
let last = 0;
for (const m of src.matchAll(/<script(\b[^>]*)>([\s\S]*?)<\/script>/g)) {
  const [all, attrs, code] = m;
  parts.push(src.slice(last, m.index));
  last = m.index + all.length;
  const typ = (attrs.match(/type\s*=\s*["']([^"']*)["']/) || [])[1] || '';
  const isJs = !/\bsrc\s*=/.test(attrs) && (typ === '' || /javascript|module/.test(typ));
  if (!isJs || !code.trim()) { parts.push(all); continue; }
  const module = typ === 'module';
  try {
    const r = await minifyJs(code, {
      module,
      compress: { passes: 1 },
      // top-level names stay: inline handlers and other scripts use them
      mangle: { toplevel: module },
      format: { comments: false },
    });
    parts.push(`<script${attrs}>${r.code.replace(/<\/script/gi, '<\\/script')}</script>`);
  } catch (e) {
    console.warn('script kept unminified:', e.message);
    parts.push(all);
  }
}
parts.push(src.slice(last));
const pre = parts.join('');

const out = await minify(pre, {
  // HTML: conservative so inline layout never changes
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  keepClosingSlash: true,
  // CSS: level 1 only (no rule merging or reordering, cascade untouched)
  minifyCSS: { level: 1 },
  // scripts were minified above
  minifyJS: false,
});

await writeFile(`${OUT}/index.html`, out);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`index.html ${kb(Buffer.byteLength(src))} -> ${kb(Buffer.byteLength(out))}`);
