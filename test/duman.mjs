// Duman testi: derlenmiş siteyi (dist/) yerel bir sunucuda açar ve temel
// şeylerin çalıştığını denetler. Çalıştırma: npm test  (önce derler)
//
// Tarayıcı: Playwright'ın Chromium'u (npx playwright install chromium) ya da
// CHROME_PATH ortam değişkeniyle verilen bir Chrome.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const KOK = 'dist';
const TUR = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let hata = 0;
const tamam = (m) => console.log('  ✓ ' + m);
const kotu = (m) => { hata++; console.log('  ✗ ' + m); };
const denetle = (kosul, m) => (kosul ? tamam(m) : kotu(m));

// ---------------------------------------------------------------- 1. Dosyalar
console.log('Dosyalar');
const html = await readFile(join(KOK, 'index.html'), 'utf8');
denetle(!/data-gom>/.test(html), 'stil dosyaları sayfaya gömülmüş');
denetle((html.match(/<style data-kaynak=/g) || []).length === 2, 'iki stil katmanı (temel, katmanlar) yerinde');
// Sürüm kaynaktan okunur: dist/ küçültülürken yerel değişken adları değişir
const surum = ((await readFile('index.html', 'utf8')).match(/var KISAYOL_SURUM = '([^']+)'/) || [])[1];
const manifest = JSON.parse(await readFile(join(KOK, 'manifest.webmanifest'), 'utf8'));
denetle(surum && manifest.start_url === `./?kisayol=${surum}`, `manifest start_url kısayol sürümüyle aynı (${surum})`);
for (const ic of manifest.icons) {
  try { await stat(join(KOK, ic.src)); tamam('manifest simgesi var: ' + ic.src); } catch { kotu('manifest simgesi eksik: ' + ic.src); }
}
for (const m of html.matchAll(/(?:href|content)="(?:https:\/\/derslik8\.online\/)?((?:simgeler|formlar)\/[^"]+)"/g)) {
  try { await stat(join(KOK, m[1])); } catch { kotu('bağlantılı dosya eksik: ' + m[1]); }
}
denetle(/property="og:image" content="https:\/\/derslik8\.online\/simgeler\/paylasim\.png"/.test(html), 'paylaşım görseli etiketi var');

// ---------------------------------------------------------------- 2. Sunucu
const sunucu = createServer(async (req, res) => {
  try {
    let yol = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (yol.endsWith('/')) yol += 'index.html';
    const dosya = normalize(join(KOK, yol));
    if (!dosya.startsWith(KOK)) throw new Error('dışarı');
    const veri = await readFile(dosya);
    res.writeHead(200, { 'content-type': TUR[extname(dosya)] || 'application/octet-stream' });
    res.end(veri);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${sunucu.address().port}/`;

// ---------------------------------------------------------------- 3. Tarayıcı
const tarayici = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

// Kullanıcı verisine gömülen bu yük çalışırsa window.__xss dolar
const YUK = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const PROGRAM = {
  okul: 'Test Lisesi ' + YUK, danisman: 'Hoca ' + YUK, kademe: 'Lise',
  saatler: [{ bas: '08:30', bit: '09:10' }, { bas: '09:20', bit: '10:00' }],
  siniflar: [{ id: 's1', ad: '9-A ' + YUK, ders: 'İngilizce' }],
  hucre: { 1: { 0: { s: 's1', t: 'ders' } }, 3: { 1: { s: 's1', t: 'ders' } } },
  notlar: { s1: [{ id: 'n1', metin: 'Not ' + YUK, t: 1, u: 1, g: 1, i: 0 }] }, gunler: {}, guncel: 1,
};

async function sayfaAc(ad, secenek, veri) {
  const ctx = await tarayici.newContext({ locale: 'tr-TR', timezoneId: 'Europe/Istanbul', ...secenek });
  // Dış adresler (Firebase, yazı tipleri) kapalı: site bunlarsız da açılmalı
  await ctx.route('**/*', (r) => (r.request().url().startsWith(URL_) ? r.continue() : r.abort()));
  await ctx.addInitScript((v) => {
    try { if (!sessionStorage.__t) { for (const k in v) localStorage.setItem(k, v[k]); sessionStorage.__t = 1; } } catch (e) {}
  }, { d8KisayolKart: JSON.stringify({ v: surum, d: 'eklendi', t: 0 }), ...veri });
  const pg = await ctx.newPage();
  const hatalar = [];
  pg.on('pageerror', (e) => hatalar.push(String(e).slice(0, 200)));
  pg.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) hatalar.push('console: ' + m.text().slice(0, 200));
  });
  await pg.goto(URL_);
  await pg.waitForTimeout(1500);
  console.log(ad);
  return { ctx, pg, hatalar };
}

async function sekmeler(pg, mobil) {
  for (const s of ['program', 'takvim', 'sinav', 'gorev']) {
    if (mobil) await pg.click(`#mob-btn-${s}`);
    else await pg.evaluate((x) => window.showMain(x, document.querySelector(`.mtab[onclick*="'${x}'"]`)), s);
    await pg.waitForTimeout(300);
    const gorunur = await pg.evaluate((x) => {
      const p = document.getElementById('panel-' + x);
      return !!(p && p.getClientRects().length && p.innerText.trim().length > 20);
    }, s);
    denetle(gorunur, `"${s}" sekmesi açılıyor ve içerik var`);
  }
}

// Telefon, boş kullanıcı
{
  const { ctx, pg, hatalar } = await sayfaAc('Telefon (yeni kullanıcı)',
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, {});
  denetle(await pg.isVisible('#mobile-bottom-nav'), 'alt menü görünür');
  await sekmeler(pg, true);
  denetle(hatalar.length === 0, 'JavaScript hatası yok' + (hatalar.length ? ': ' + hatalar.join(' | ') : ''));
  await ctx.close();
}

// Telefon, ders programı olan kullanıcı
{
  const { ctx, pg, hatalar } = await sayfaAc('Telefon (ders programı dolu)',
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { d8StajProgram: JSON.stringify(PROGRAM), d8DonemMode: 'd3' });
  const liste = () => pg.evaluate(() => document.querySelectorAll('#program-d3 .mob-day-header').length);
  denetle((await liste()) > 0, 'III. Dönem haftalık listesi çizildi');
  // Takvimde başka döneme geçip geri dönünce liste kaybolmamalı (düzeltilen hata)
  await pg.click('#mob-btn-takvim'); await pg.waitForTimeout(300);
  for (const d of ['d1', 'd2', 'd4']) {
    await pg.click(`[data-act=donem][data-v=${d}]:visible`); await pg.waitForTimeout(200);
    await pg.click('[data-act=donem][data-v=d3]:visible'); await pg.waitForTimeout(200);
  }
  await pg.click('#mob-btn-program'); await pg.waitForTimeout(400);
  denetle((await liste()) > 0, 'dönem değişip geri gelince liste hâlâ yerinde');
  await sekmeler(pg, true);
  denetle(!(await pg.evaluate(() => window.__xss)), 'kullanıcı verisindeki HTML çalışmıyor (kaçışlı)');
  denetle(hatalar.length === 0, 'JavaScript hatası yok' + (hatalar.length ? ': ' + hatalar.join(' | ') : ''));
  await ctx.close();
}

// Masaüstü
{
  const { ctx, pg, hatalar } = await sayfaAc('Masaüstü', { viewport: { width: 1366, height: 900 } },
    { d8StajProgram: JSON.stringify(PROGRAM) });
  await sekmeler(pg, false);
  for (const f of ['d8CarkOpenOverlay', 'd8ActOpenOverlay', 'openScreensaver']) {
    const acildi = await pg.evaluate((fn) => {
      try { window[fn](); } catch (e) { return 'hata: ' + e.message; }
      return true;
    }, f);
    denetle(acildi === true, `${f} açılıyor`);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    await pg.goto(URL_); await pg.waitForTimeout(1000);
  }
  // Duyuru bağlantısı tırnakla özniteliğin dışına taşamamalı
  const duyuru = await pg.evaluate(() => {
    window._d8Announcement = { active: true, updatedAt: 1, text: 'bak www.ornek.com/"onmouseover="window.__xss=1' };
    window.d8RenderAnnouncement();
    const a = document.querySelector('#d8-announce-text a');
    return a ? a.getAttributeNames().join(',') : 'bağlantı yok';
  });
  denetle(!/onmouseover/.test(duyuru), 'duyurudaki bağlantı yeni öznitelik açamıyor');
  denetle(hatalar.length === 0, 'JavaScript hatası yok' + (hatalar.length ? ': ' + hatalar.join(' | ') : ''));
  await ctx.close();
}

await tarayici.close();
sunucu.close();
console.log(hata ? `\n${hata} denetim başarısız` : '\nBütün denetimler geçti');
process.exit(hata ? 1 : 0);
