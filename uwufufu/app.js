/* Akademi Uwufufu — akıllı tahta + telefon.
 *
 * Adresler:  ./            giriş (koda katıl / tahtada başlat)
 *            ./?tahta      tahta ekranı (oturumu kurar, QR gösterir, turları yönetir)
 *            ./?k=1234     telefon ekranı (eşleşmeleri oylar)
 *
 * Akış: her turda herkes o turun bütün eşleşmelerini kendi hızında oylar.
 * Tahta oyları canlı sayar; "Turu bitir" deyince her eşleşmenin çoğunluk
 * kazananı bir sonraki tura geçer (eşitlikte kura). 32 → 16 → 8 → 4 → 2 → şampiyon.
 *
 * Firestore:
 *   uwufufu/{kod}             durum: 'lobi'|'oylama'|'sonuc'|'bitti', tur, kartlar[],
 *                             gecmis{ t0:{kartlar,a,b,k,kura} ... }, sampiyon, moderatorUid
 *   uwufufu/{kod}/oylar/{uid} katildi, son, t0:{ 0:kartId, 1:kartId ... }, t1:{...}
 * Giriş gerekmez: her cihaz anonim kimlik alır.
 */

const KARTLAR = [
  'Eylül\'de başlayacak denilip yıl sonu, Ocak, Şubat derken ancak Nisan\'da kayıt alınması',
  'Yurt ücretlerinin akademi başlamadan 3 gün önce açıklanması',
  'Yurtta kalacakların son iki günde açıklanması',
  'Dekontta "öğretmen adayı harçlığı" yazan maaş yatması',
  'Kayıta git gel, taşınma, kira, depozito, komisyon masrafları üstüne maaşın önden verilmeyip 17 gün sonra 17 günlük yatması',
  'Akademinin ilk günü otobüsler dolu diye durakta saatlik bekleme',
  'Genel otobüs çilesi',
  'Adı "Prestij" olup kendisi vukuat ve sıkıntı yuvası olan meşhur Akbaş Prestij Rezidans',
  'Voleybol draması',
  'Son sınav bir gün erkene alınsın mı alınmasın mı draması',
  'Teorik ve uygulamalı sınavlardaki adaletsiz puanlamalar',
  '10,5 aylık süreçte sadece 1 haftanın ara tatil olması',
  'Teorik ders hocasının tüm haftaları öğretmen adaylarına sunum şeklinde kitlemesi ve tüm dönem yatması',
  '100 beklediğimiz sınav kağıtlarını okumadan "aynı notlardan çalışmışsınız" deyip herkese 80 verme rezaleti',
  'Uygulama notunun 100 olmaması',
  'Akademi sıralarının rahatsızlığı',
  'Yazın dersliklerdeki sıcaklık seviyesi',
  'Derslikleri basan arılar',
  'Atanınca 2 haftada kazanılacak öğretmenlik deneyiminin 10,5 aya yayılması',
  'Fiyatına karşılık alınan yemeğin yetersizliği',
  'Yemekhane sırası',
  'Kantin sırası',
  'Hocasını ikna edenlerin öğle arasına veya çıkışa 5-10 dk erken çıkması',
  'Kültür ve sanat dersinin varlığı',
  'Kültür ve sanat dersinde boya kalemi getirmeyenin eksi alması',
  'Akademinin ilk günü eğitim personeline o gün ne yapılacağına dair bilgi verilmemiş olması',
  'Eğitim personelinin öğretmen adaylarının hangi sistemden geçerek geldiğini bilmemesi ve akademi sürecinden habersiz olması',
  'İlk dönem sınavların nasıl ve ne zaman olacağının son dakikaya kadar devlet sırrı olarak tutulması',
  'Uygulamalı derslerin kılavuzlarının son dakikaya kadar devlet sırrı olarak saklanması',
  'Konferans ve seminerlerin akademi çıkış saatinden sonra yapılması',
  'Hafta sonunu kitleyen ÖBA eğitimleri',
  'İlk dönem her bir maddeye 3000 karakter doldurulacak 7 sayfalık form doldurma işi'
];
const IDLER = KARTLAR.map((_, i) => i + 1);
const metin = (id) => KARTLAR[id - 1] || '';
const gorsel = (id) => 'gorseller/' + String(id).padStart(2, '0') + '.jpg';
const turAdi = (n) => (n === 2 ? 'Final' : n === 4 ? 'Yarı Final' : n === 8 ? 'Çeyrek Final' : 'Son ' + n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const foto = (id, alt) => {
  const u = gorsel(id);
  return '<div class="foto"><img class="ard" src="' + u + '" alt="" aria-hidden="true"><img src="' + u + '" alt="' + esc(alt || '') + '"></div>';
};
const no = (id) => '<span class="no">#' + id + '</span>';
const app = document.getElementById('app');
const P = new URLSearchParams(location.search);
const MARKA = '<a class="marka" href="../"><i>8</i>Derslik 8</a>';
const GECICI = 'uwuTahtaKod';

function karistir(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function sakla(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
function oku(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

function bildir(msg) {
  let t = document.getElementById('uwu-bildirim');
  if (!t) {
    t = document.createElement('div');
    t.id = 'uwu-bildirim';
    t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:12px;font-weight:600;font-size:.9rem;z-index:60;box-shadow:var(--golge);max-width:90vw;text-align:center;transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._z);
  t._z = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

function ekran(html) { app.innerHTML = html; }
function yukleniyor(msg) { ekran('<div class="giris">' + MARKA + '<p class="durum-yazi">' + esc(msg) + '</p></div>'); }
function hataEkrani(msg) {
  ekran('<div class="giris">' + MARKA + '<div class="panel" style="display:flex;flex-direction:column;gap:14px"><p>' + esc(msg) +
    '</p><div class="lobi-dugmeler"><button class="btn" id="tekrar">Tekrar dene</button><a class="btn ikincil" href="./">Başa dön</a></div></div></div>');
  document.getElementById('tekrar').onclick = () => location.reload();
}

/* ------------------------------------------------------------------ Firebase */
const FB = 'https://www.gstatic.com/firebasejs/12.16.0/';
let F = null;
async function firebase() {
  if (F) return F;
  const [{ initializeApp }, { getAuth, signInAnonymously }, fs] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')
  ]);
  const fbApp = initializeApp({
    apiKey: 'AIzaSyC1X6QrbqUaHevdPbeE_GiN34i3PBOXVq0',
    authDomain: 'derslik8-online.firebaseapp.com',
    projectId: 'derslik8-online',
    storageBucket: 'derslik8-online.firebasestorage.app',
    messagingSenderId: '691814192695',
    appId: '1:691814192695:web:070dc72b80a191634dd1b2'
  });
  const auth = getAuth(fbApp);
  /* Ana sitede Google ile girilmişse o hesap kullanılır, yoksa anonim kimlik */
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  F = { uid: auth.currentUser.uid, db: fs.getFirestore(fbApp), ...fs };
  return F;
}
const oturumRef = (kod) => F.doc(F.db, 'uwufufu', kod);
const oylarCol = (kod) => F.collection(F.db, 'uwufufu', kod, 'oylar');
const oyRef = (kod, uid) => F.doc(F.db, 'uwufufu', kod, 'oylar', uid);

/* Bir turun oylarını sayar */
function say(S, oyuncular, tur) {
  const k = tur === S.tur && S.durum === 'oylama' ? S.kartlar : (S.gecmis['t' + tur] || {}).kartlar || S.kartlar;
  const m = k.length / 2, a = new Array(m).fill(0), b = new Array(m).fill(0);
  let bitiren = 0, katilan = 0;
  for (const p of Object.values(oyuncular)) {
    katilan++;
    const s = p['t' + tur] || {};
    let n = 0;
    for (let i = 0; i < m; i++) {
      const v = s[i];
      if (v === k[2 * i]) { a[i]++; n++; } else if (v === k[2 * i + 1]) { b[i]++; n++; }
    }
    if (n === m) bitiren++;
  }
  return { k, m, a, b, bitiren, katilan };
}

/* ------------------------------------------------------------------ Giriş */
function girisCiz(uyari) {
  ekran('<div class="giris">' +
    '<div class="ust">' + MARKA + '</div>' +
    '<div><div class="etiket">Akademi Uwufufu</div><h1>32 dert, <em>tek şampiyon.</em></h1></div>' +
    '<p>Akademinin en büyük çilesini birlikte seçiyoruz. Her eşleşmede birini seç, sıradakine geç; tahtada sonuçlar canlı akar.</p>' +
    (uyari ? '<div class="panel" role="alert">' + esc(uyari) + '</div>' : '') +
    '<div class="panel" style="display:flex;flex-direction:column;gap:12px"><div class="etiket">Oyuna katıl</div>' +
    '<form class="kod-form" id="kodForm"><input id="kodInp" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="0000" aria-label="Oyun kodu" autocomplete="off"><button class="btn">Katıl</button></form></div>' +
    '<div class="panel" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start"><div class="etiket">Akıllı tahta</div>' +
    '<p>Oylamayı bu ekranda başlat; herkes QR\'ı okutup telefonundan katılsın.</p><a class="btn" href="?tahta">Oylamayı başlat</a></div>' +
    '<div class="onizleme" aria-hidden="true">' + IDLER.map((id) => foto(id)).join('') + '</div>' +
    '</div>');
  document.getElementById('kodForm').onsubmit = (e) => {
    e.preventDefault();
    const v = document.getElementById('kodInp').value.replace(/\D/g, '');
    if (v.length === 4) location.search = '?k=' + v;
    else bildir('Kod 4 haneli olmalı');
  };
}

/* ================================================================== TAHTA */
const T = { kod: null, S: null, oyuncular: {}, anahtar: null, cizimBekliyor: false, onay: 0 };

async function tahtaBaslat() {
  yukleniyor('Oyun hazırlanıyor…');
  await firebase();
  let kod = oku(GECICI);
  if (kod) {
    const s = await F.getDoc(oturumRef(kod)).catch(() => null);
    if (!(s && s.exists() && s.data().moderatorUid === F.uid)) kod = null;
  }
  if (!kod) kod = await oturumKur();
  sakla(GECICI, kod);
  T.kod = kod;
  F.onSnapshot(oturumRef(kod), (s) => {
    if (!s.exists()) { sakla(GECICI, null); girisCiz('Bu oyun kapatıldı.'); T.S = null; return; }
    T.S = s.data();
    T.S.gecmis = T.S.gecmis || {};
    tahtaCiz();
  }, (e) => { console.warn('[uwufufu] oturum', e); hataEkrani('Oyun okunamadı (izin ya da bağlantı sorunu).'); });
  F.onSnapshot(oylarCol(kod), (q) => {
    const o = {};
    q.forEach((d) => { o[d.id] = d.data(); });
    T.oyuncular = o;
    tahtaCiz();
  }, (e) => console.warn('[uwufufu] oylar', e));
}

async function oturumKur() {
  for (let i = 0; i < 12; i++) {
    const kod = String(1000 + Math.floor(Math.random() * 9000));
    const s = await F.getDoc(oturumRef(kod));
    if (s.exists()) continue;
    await F.setDoc(oturumRef(kod), {
      moderatorUid: F.uid, createdAt: Date.now(), durum: 'lobi', tur: 0,
      kartlar: karistir(IDLER), gecmis: {}, sampiyon: null
    });
    return kod;
  }
  throw new Error('Boş kod bulunamadı');
}

function katilmaAdresi(kod) { return location.origin + location.pathname + '?k=' + kod; }
function qrSvg(kod) {
  if (location.protocol === 'file:' || !window.d8QR) return '';
  try { return window.d8QR.svg(katilmaAdresi(kod), { dark: '#1C1917', light: '#FFFFFF', quiet: 2 }); } catch (e) { return ''; }
}

function tahtaCiz() {
  if (T.cizimBekliyor) return;
  T.cizimBekliyor = true;
  requestAnimationFrame(() => {
    T.cizimBekliyor = false;
    const S = T.S;
    if (!S) return;
    const anahtar = S.durum + ':' + S.tur;
    if (anahtar !== T.anahtar) { T.anahtar = anahtar; T.onay = 0; tahtaTamCiz(); }
    tahtaGuncelle();
  });
}

function izgaraOlcu(m) {
  /* sütun, satır, yazı boyu, metin satırı, oy yazısı */
  if (m >= 16) return [4, 4, '.76rem', 2, '.8rem'];
  if (m >= 8) return [4, 2, '.92rem', 3, '.95rem'];
  if (m >= 4) return [2, 2, '1.02rem', 3, '1.05rem'];
  if (m >= 2) return [2, 1, '1.25rem', 4, '1.3rem'];
  return [1, 1, '1.5rem', 3, '1.5rem'];
}

function macHtml(k, i, sonuc) {
  const A = k[2 * i], B = k[2 * i + 1];
  let sA = '', sB = '';
  if (sonuc) {
    const kaz = sonuc.k[i];
    sA = kaz === A ? ' kazandi' : ' kaybetti';
    sB = kaz === B ? ' kazandi' : ' kaybetti';
  }
  const yan = (id, t, s) =>
    '<div class="yan ' + t + s + '">' + foto(id, metin(id)) +
    '<div class="metin">' + no(id) + esc(metin(id)) + '</div>' +
    '<div class="oy"><span data-say="' + t + i + '">0</span><span class="cubuk"><b data-cubuk="' + t + i + '" style="width:0"></b></span></div></div>';
  return '<div class="mac' + (sonuc ? ' bitti' : '') + '" id="mac' + i + '">' + yan(A, 'A', sA) + '<span class="vs">VS</span>' + yan(B, 'B', sB) +
    (sonuc && sonuc.kura && sonuc.kura.indexOf(i) > -1 ? '<span class="kura">🎲 Kura</span>' : '') + '</div>';
}

function tahtaTamCiz() {
  const S = T.S, kod = T.kod;
  const dugmeUst = '<button class="btn ikincil kucuk" id="tamEkran" title="Tam ekran">⛶ Tam ekran</button>';

  if (S.durum === 'lobi') {
    const qr = qrSvg(kod);
    ekran('<div class="tahta"><div class="tahta-ust">' + MARKA + '<div class="orta"></div>' + dugmeUst + '</div>' +
      '<section class="lobi">' +
      (qr ? '<div class="qr-buyuk" aria-label="Katılma QR kodu">' + qr + '</div>' : '<div class="panel">QR için sayfayı internet adresinden aç.</div>') +
      '<div><div class="etiket">Akademi Uwufufu · 32 kart</div><h1>Akademinin en büyük çilesi <em>hangisi?</em></h1>' +
      '<p style="margin-top:14px;color:var(--soluk);font-size:clamp(1rem,1.5vw,1.25rem)">Telefonunla QR\'ı okut ya da kodu gir:</p>' +
      '<div class="kod-buyuk">' + kod + '</div><div class="adres">' + esc(katilmaAdresi(kod)) + '</div>' +
      '<div class="katilimci"><span class="nabiz"></span><span id="katSay">0 kişi katıldı</span></div>' +
      '<div class="lobi-dugmeler"><button class="btn" id="baslat">Oylamayı başlat →</button>' +
      '<button class="btn ikincil" id="kopyala">Bağlantıyı kopyala</button></div></div>' +
      '</section></div>');
    document.getElementById('baslat').onclick = () => yaz({ durum: 'oylama' });
    document.getElementById('kopyala').onclick = () => {
      const u = katilmaAdresi(kod);
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => bildir('Bağlantı kopyalandı'), () => bildir(u));
    };
  } else if (S.durum === 'oylama' || S.durum === 'sonuc') {
    const sonuc = S.durum === 'sonuc' ? S.gecmis['t' + S.tur] : null;
    const k = sonuc ? sonuc.kartlar : S.kartlar;
    const m = k.length / 2;
    const [sut, sat, fs, satir, ofs] = izgaraOlcu(m);
    const qr = qrSvg(kod);
    let alt;
    if (sonuc) {
      const sonraki = sonuc.k.length;
      alt = '<span class="bilgi">Tur kapandı · kazananlar işaretli</span><button class="btn" id="sonraki">' + esc(turAdi(sonraki)) + ' turuna geç →</button>';
    } else {
      alt = '<span class="bilgi" id="altBilgi"></span><button class="btn" id="bitir">Turu bitir</button>';
    }
    ekran('<div class="tahta sabit"><div class="tahta-ust">' + MARKA +
      '<div class="orta"><div class="tur-adi">' + esc(turAdi(k.length)) + (sonuc ? ' · Sonuçlar' : '') + '</div>' +
      '<div class="etiket" style="margin-top:4px" id="ustBilgi">' + m + ' eşleşme</div>' +
      (sonuc ? '' : '<div class="ilerleme"><b id="ilerleme" style="width:0"></b></div>') + '</div>' +
      '<div class="kod-rozet">' + (qr ? '<div class="qr-mini">' + qr + '</div>' : '') + '<div><div class="etiket">Katılma kodu</div><div class="no">' + kod + '</div></div></div>' +
      dugmeUst + '</div>' +
      '<section class="izgara" style="grid-template-columns:repeat(' + sut + ',minmax(0,1fr));grid-template-rows:repeat(' + sat + ',minmax(0,1fr));--vs-y:' + (m >= 16 ? 32 : 38) + ';--metin-fs:' + fs + ';--satir:' + satir + ';--oy-fs:' + ofs + (m === 1 ? ';max-width:1200px;margin:0 auto;width:100%' : '') + '">' +
      Array.from({ length: m }, (_, i) => macHtml(k, i, sonuc)).join('') + '</section>' +
      '<div class="tahta-alt">' + alt + '</div></div>');
    if (sonuc) document.getElementById('sonraki').onclick = () => yaz({ durum: 'oylama', tur: S.tur + 1, kartlar: sonuc.k });
    else document.getElementById('bitir').onclick = turuBitir;
  } else if (S.durum === 'bitti') {
    sampiyonCiz();
  }
  const te = document.getElementById('tamEkran');
  if (te) te.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  };
}

function tahtaGuncelle() {
  const S = T.S;
  const kat = Object.keys(T.oyuncular).length;
  const ks = document.getElementById('katSay');
  if (ks) ks.textContent = kat + ' kişi katıldı';
  if (S.durum !== 'oylama' && S.durum !== 'sonuc') return;
  const sonuc = S.durum === 'sonuc' ? S.gecmis['t' + S.tur] : null;
  const r = sonuc ? { m: sonuc.a.length, a: sonuc.a, b: sonuc.b } : say(S, T.oyuncular, S.tur);
  for (let i = 0; i < r.m; i++) {
    const top = r.a[i] + r.b[i];
    for (const [t, v] of [['A', r.a[i]], ['B', r.b[i]]]) {
      const e = app.querySelector('[data-say="' + t + i + '"]');
      if (e) e.textContent = v + (top ? ' · %' + Math.round((v / top) * 100) : '');
      const c = app.querySelector('[data-cubuk="' + t + i + '"]');
      if (c) c.style.width = (top ? (v / top) * 100 : 0) + '%';
    }
  }
  if (!sonuc) {
    const il = document.getElementById('ilerleme');
    if (il) il.style.width = (r.katilan ? (r.bitiren / r.katilan) * 100 : 0) + '%';
    const ub = document.getElementById('ustBilgi');
    if (ub) ub.textContent = r.m + ' eşleşme · ' + r.bitiren + '/' + r.katilan + ' kişi turu bitirdi';
    const ab = document.getElementById('altBilgi');
    if (ab && !T.onay) ab.textContent = r.katilan ? 'Herkes bitirince turu kapat. Geç kalanlar QR\'dan hâlâ katılabilir.' : 'Henüz kimse katılmadı — QR\'ı okutun.';
  }
}

async function yaz(veri) {
  try { await F.setDoc(oturumRef(T.kod), veri, { merge: true }); }
  catch (e) { console.warn('[uwufufu] yazma', e); bildir('Kaydedilemedi (bağlantı ya da izin sorunu)'); }
}

async function turuBitir() {
  const S = T.S;
  const r = say(S, T.oyuncular, S.tur);
  const eksik = r.katilan - r.bitiren;
  if (eksik > 0 && Date.now() - T.onay > 4000) {
    /* İlk tıkta uyar, ikinci tıkta kapat (tarayıcı onay penceresi açmadan) */
    T.onay = Date.now();
    const b = document.getElementById('bitir'), ab = document.getElementById('altBilgi');
    if (b) b.textContent = 'Yine de bitir';
    if (ab) ab.textContent = eksik + ' kişi henüz bitirmedi. Kapatmak için tekrar bas.';
    setTimeout(() => {
      if (T.onay && Date.now() - T.onay >= 4000) { T.onay = 0; if (b && b.isConnected) b.textContent = 'Turu bitir'; tahtaGuncelle(); }
    }, 4100);
    return;
  }
  T.onay = 0;
  const kaz = [], kura = [];
  for (let i = 0; i < r.m; i++) {
    if (r.a[i] > r.b[i]) kaz.push(r.k[2 * i]);
    else if (r.b[i] > r.a[i]) kaz.push(r.k[2 * i + 1]);
    else { kura.push(i); kaz.push(r.k[2 * i + (Math.random() < 0.5 ? 0 : 1)]); }
  }
  const gecmis = Object.assign({}, S.gecmis, { ['t' + S.tur]: { kartlar: r.k, a: r.a, b: r.b, k: kaz, kura } });
  if (kaz.length === 1) await yaz({ durum: 'bitti', gecmis, sampiyon: kaz[0] });
  else await yaz({ durum: 'sonuc', gecmis });
}

function sampiyonYolu(S) {
  const c = S.sampiyon, yol = [];
  for (let t = 0; S.gecmis['t' + t]; t++) {
    const g = S.gecmis['t' + t];
    const idx = g.kartlar.indexOf(c);
    if (idx < 0) break;
    const i = idx >> 1, biz = idx % 2 === 0 ? g.a[i] : g.b[i], onlar = idx % 2 === 0 ? g.b[i] : g.a[i];
    yol.push({ tur: turAdi(g.kartlar.length), rakip: g.kartlar[idx ^ 1], biz, onlar, kura: g.kura.indexOf(i) > -1 });
  }
  return yol;
}

function sampiyonCiz() {
  const S = T.S, c = S.sampiyon;
  const yol = sampiyonYolu(S);
  ekran('<div class="tahta"><div class="tahta-ust">' + MARKA + '<div class="orta"></div>' +
    '<button class="btn ikincil kucuk" id="tamEkran">⛶ Tam ekran</button></div>' +
    '<section class="sampiyon"><div class="kart">' + foto(c, metin(c)) + '<div class="metin">' + no(c) + ' ' + esc(metin(c)) + '</div></div>' +
    '<div><div class="taç" aria-hidden="true">👑</div><div class="etiket" style="margin-top:8px">Akademi Uwufufu şampiyonu</div>' +
    '<h2>Akademinin en büyük çilesi belli oldu.</h2>' +
    '<ul class="yol">' + yol.map((y) => '<li>' + foto(y.rakip) + '<span class="tur">' + esc(y.tur) + '</span><span class="rakip">' + esc(metin(y.rakip)) +
      '</span><span class="skor">' + y.biz + '–' + y.onlar + (y.kura ? ' 🎲' : '') + '</span></li>').join('') + '</ul>' +
    '<div class="lobi-dugmeler"><button class="btn" id="yeni">Yeni oyun</button><button class="btn ikincil" id="kapat">Oyunu kapat</button></div></div></section></div>');
  document.getElementById('yeni').onclick = async () => { await oyunuSil(); location.replace('?tahta'); };
  document.getElementById('kapat').onclick = async () => { await oyunuSil(); location.replace('./'); };
  konfeti();
}

async function oyunuSil() {
  const kod = T.kod;
  sakla(GECICI, null);
  try {
    const q = await F.getDocs(oylarCol(kod));
    await Promise.all(q.docs.map((d) => F.deleteDoc(d.ref)));
    await F.deleteDoc(oturumRef(kod));
  } catch (e) { console.warn('[uwufufu] silme', e); }
}

function konfeti() {
  const c = document.getElementById('konfeti');
  if (!c || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  c.hidden = false;
  const W = (c.width = innerWidth), H = (c.height = innerHeight), x = c.getContext('2d');
  const renk = ['#EA580C', '#FBBF24', '#2563EB', '#DB2777', '#15803D'];
  const p = Array.from({ length: 180 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.3, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4, r: Math.random() * 7 + 4, c: renk[(Math.random() * 5) | 0], a: Math.random() * 6 }));
  let f = 0;
  (function ad() {
    x.clearRect(0, 0, W, H);
    p.forEach((q) => { q.vy += 0.35; q.x += q.vx; q.y += q.vy; q.a += 0.2; x.save(); x.translate(q.x, q.y); x.rotate(q.a); x.fillStyle = q.c; x.fillRect(-q.r / 2, -q.r / 4, q.r, q.r / 2); x.restore(); });
    if (++f < 160) requestAnimationFrame(ad); else { x.clearRect(0, 0, W, H); c.hidden = true; }
  })();
}

/* ================================================================== TELEFON */
const O = { kod: null, S: null, ben: {}, sira: 0, anahtar: null, kilit: false };

async function oyuncuBaslat(kod) {
  yukleniyor('Oyuna bağlanılıyor…');
  await firebase();
  O.kod = kod;
  const s = await F.getDoc(oturumRef(kod));
  if (!s.exists()) { girisCiz(kod + ' kodlu bir oyun bulunamadı. Kodu kontrol et.'); return; }
  const ben = await F.getDoc(oyRef(kod, F.uid));
  if (ben.exists()) O.ben = ben.data();
  else await F.setDoc(oyRef(kod, F.uid), { katildi: Date.now() });
  F.onSnapshot(oturumRef(kod), (d) => {
    if (!d.exists()) { O.S = null; telBekle('👋', 'Oyun kapandı', 'Katıldığın için teşekkürler!'); return; }
    O.S = d.data();
    O.S.gecmis = O.S.gecmis || {};
    telCiz();
  }, (e) => { console.warn('[uwufufu] oturum', e); hataEkrani('Oyuna bağlanılamadı.'); });
}

function oylarim(tur) { return O.ben['t' + tur] || {}; }
function ilkBos(m, tur, bas) {
  const s = oylarim(tur);
  for (let i = bas || 0; i < m; i++) if (s[i] == null) return i;
  return m;
}

function telBekle(simge, baslik, aciklama, ek) {
  ekran('<div class="tel"><div class="tel-ust">' + MARKA + '<span class="sayac">' + esc(O.kod || '') + '</span></div>' +
    '<div class="bekle"><div class="buyuk" aria-hidden="true">' + simge + '</div><h2>' + esc(baslik) + '</h2><p>' + esc(aciklama) + '</p>' + (ek || '') + '</div></div>');
}

function telCiz() {
  const S = O.S;
  if (!S) return;
  const anahtar = S.durum + ':' + S.tur;
  if (anahtar !== O.anahtar) {
    O.anahtar = anahtar;
    if (S.durum === 'oylama') O.sira = ilkBos(S.kartlar.length / 2, S.tur);
  }
  if (S.durum === 'lobi') return telBekle('🎉', 'Katıldın!', 'Tahtada oylama başlayınca ilk eşleşme burada açılacak.');
  if (S.durum === 'oylama') return O.sira >= S.kartlar.length / 2 ? telTurBitti() : telMac(O.sira);
  if (S.durum === 'sonuc') return telSonuc();
  if (S.durum === 'bitti') {
    const c = S.sampiyon;
    return telBekle('👑', 'Şampiyon belli oldu!', 'Tahtaya bak.',
      '<div class="sampiyon-kart">' + foto(c, metin(c)) + '<div class="metin">' + no(c) + ' ' + esc(metin(c)) + '</div></div>');
  }
}

function telMac(i) {
  const S = O.S, k = S.kartlar, m = k.length / 2, A = k[2 * i], B = k[2 * i + 1];
  const s = oylarim(S.tur), eski = s[i];
  const kart = (id, t) => '<button class="secenek ' + t + (eski === id ? ' eski' : '') + '" data-id="' + id + '" aria-label="' + esc(metin(id)) + '">' +
    foto(id) + '<div class="metin">' + no(id) + esc(metin(id)) + '</div></button>';
  ekran('<div class="tel sabit"><div class="tel-ust"><span class="tur">' + esc(turAdi(k.length)) + '</span><span class="sayac">' + (i + 1) + ' / ' + m + '</span></div>' +
    '<div class="noktalar" aria-hidden="true">' + Array.from({ length: m }, (_, j) => '<i class="' + (s[j] != null ? 'ok' : j === i ? 'simdi' : '') + '"></i>').join('') + '</div>' +
    '<div class="duello" id="duello">' + kart(A, 'A') + '<span class="vs">VS</span>' + kart(B, 'B') + '</div>' +
    '<div class="tel-alt">' + (i > 0 ? '<button class="btn ikincil kucuk" id="geri">← Önceki</button>' : '<span></span>') +
    '<span class="etiket">Birine dokun</span>' +
    (eski != null ? '<button class="btn ikincil kucuk" id="ileri">Sonraki →</button>' : '<span></span>') + '</div></div>');
  app.querySelectorAll('.secenek').forEach((b) => { b.onclick = () => oyVer(i, Number(b.dataset.id), b); });
  const g = document.getElementById('geri'); if (g) g.onclick = () => { O.sira = i - 1; telCiz(); };
  const il = document.getElementById('ileri'); if (il) il.onclick = () => { O.sira = i + 1; telCiz(); };
  /* sıradaki eşleşmenin görsellerini önceden indir */
  if (i + 1 < m) [k[2 * i + 2], k[2 * i + 3]].forEach((id) => { new Image().src = gorsel(id); });
}

function oyVer(i, id, dugme) {
  if (O.kilit) return;
  const S = O.S, tur = S.tur, m = S.kartlar.length / 2;
  O.kilit = true;
  const anahtar = 't' + tur;
  O.ben[anahtar] = Object.assign({}, O.ben[anahtar], { [i]: id });
  dugme.classList.add('secili');
  document.getElementById('duello').classList.add('secildi');
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
  F.setDoc(oyRef(O.kod, F.uid), { [anahtar]: { [i]: id }, son: Date.now() }, { merge: true }).catch((e) => {
    console.warn('[uwufufu] oy', e);
    delete O.ben[anahtar][i];
    bildir('Oyun gönderilemedi, tekrar dene');
    O.sira = i;
    if (O.S && O.S.durum === 'oylama' && O.S.tur === tur) telCiz();
  });
  setTimeout(() => {
    O.kilit = false;
    if (!O.S || O.S.durum !== 'oylama' || O.S.tur !== tur) return;
    const sonraki = ilkBos(m, tur, i + 1);
    O.sira = sonraki < m ? sonraki : ilkBos(m, tur);
    telCiz();
  }, 380);
}

function secimListesi(k, s, kazananlar) {
  const m = k.length / 2;
  let h = '<ul class="seclist">';
  for (let i = 0; i < m; i++) {
    const id = s[i];
    if (id == null) continue;
    const durum = kazananlar ? (kazananlar.indexOf(id) > -1 ? ' gecti' : ' elendi') : '';
    h += '<li class="' + durum + '">' + foto(id) + '<span>' + esc(metin(id)) + '</span>' + (kazananlar ? '<b>' + (durum === ' gecti' ? '✓' : '✗') + '</b>' : '') + '</li>';
  }
  return h + '</ul>';
}

function telTurBitti() {
  const S = O.S;
  telBekle('✅', turAdi(S.kartlar.length) + ' oyların tamam', 'Herkes bitirince tahtada tur kapanacak ve sonraki eşleşmeler açılacak.',
    '<button class="btn ikincil" id="gozden">Seçimlerimi gözden geçir</button>' + secimListesi(S.kartlar, oylarim(S.tur)));
  document.getElementById('gozden').onclick = () => { O.sira = 0; telCiz(); };
}

function telSonuc() {
  const S = O.S, g = S.gecmis['t' + S.tur];
  const s = oylarim(S.tur);
  const verilen = Object.keys(s).length;
  const gecen = Object.values(s).filter((id) => g.k.indexOf(id) > -1).length;
  telBekle('📊', turAdi(g.kartlar.length) + ' kapandı',
    verilen ? 'Seçtiklerinden ' + gecen + ' / ' + verilen + ' tanesi tur atladı. Sıradaki tur birazdan başlıyor.' : 'Bu turda oy vermedin. Sıradaki tur birazdan başlıyor.',
    secimListesi(g.kartlar, s, g.k));
}

/* ------------------------------------------------------------------ Başlat */
const kodParam = (P.get('k') || '').replace(/\D/g, '').slice(0, 4);
(async () => {
  try {
    if (P.has('tahta')) await tahtaBaslat();
    else if (kodParam.length === 4) await oyuncuBaslat(kodParam);
    else girisCiz();
  } catch (e) {
    console.warn('[uwufufu]', e);
    if (P.has('tahta') || kodParam) hataEkrani('Bağlantı kurulamadı. İnterneti ya da reklam engelleyiciyi kontrol edip tekrar dene.');
    else girisCiz();
  }
})();
