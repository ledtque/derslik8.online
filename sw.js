/* Derslik 8 — çevrimdışı çalışma (service worker)
   ---------------------------------------------------------------
   • Sayfa her zaman önce internetten istenir; kullanıcı hep güncel sürümü görür.
     İnternet yoksa ya da 3 sn'de cevap gelmezse önbellekteki kopya açılır; yeni
     sürüm arkadan inince sayfaya "yeni sürüm hazır" mesajı gönderilir.
   • Sayfa isteği tarayıcının kendi isteğiyle (e.request) yapılır. Sunucu bir
     yönlendirme yaparsa (ör. /index.html → /) bunu tarayıcı kendisi izler;
     yönlendirilmiş cevap asla sayfa olarak geri verilmez (v2'deki ERR_FAILED
     hatasının sebebi buydu).
   • Hiçbir durumda hata cevabı (Response.error) döndürülmez: bir şey ters
     giderse istek doğrudan internete bırakılır ya da sade bir "bağlantı yok"
     sayfası gösterilir.
   • formlar/*.svg ve sürüm numaralı dış dosyalar (Firebase SDK, yazı tipleri)
     ilk kullanımda önbelleğe alınır. Firebase veritabanı / giriş istekleri hiç
     ellenmez.
   Bu dosyada bir şeyi değiştirirsen SURUM'u artır. */
var SURUM = 'v3';
var SAYFA = 'derslik8-sayfa';            /* sürümden bağımsız: güncellemede çevrimdışı kopya kaybolmasın */
var DIS = 'derslik8-dis-' + SURUM;
var KOK = new URL('./', self.location).href;
var SAYFA_ANAHTAR = KOK;                  /* sayfa önbellekte kök adresle tutulur */
var BEKLEME = 3000;

self.addEventListener('install', function (e) {
  e.waitUntil(
    fetch(KOK, { cache: 'reload' }).then(function (r) {
      if (kaydedilebilirSayfa(r)) return caches.open(SAYFA).then(function (c) { return c.put(SAYFA_ANAHTAR, r); });
    }).catch(function () {}).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (adlar) {
    return Promise.all(adlar.filter(function (a) {
      return a.indexOf('derslik8-') === 0 && a !== SAYFA && a !== DIS;
    }).map(function (a) { return caches.delete(a); }));
  }).then(function () {
    /* v2 sayfayı /index.html anahtarıyla saklıyordu; yönlendirilmiş olabilir, atılır */
    return caches.open(SAYFA).then(function (c) { return c.delete(new URL('./index.html', self.location).href); });
  }).catch(function () {}).then(function () { return self.clients.claim(); }));
});

/** Yalnızca düz, başarılı, yönlendirilmemiş bir sayfa cevabı saklanır */
function kaydedilebilirSayfa(r) {
  return !!r && r.ok && r.status === 200 && r.type === 'basic' && !r.redirected;
}

function sayfaIstegiMi(req, url) {
  if (req.mode !== 'navigate' || url.origin !== self.location.origin) return false;
  var yol = url.href.split('?')[0].split('#')[0];
  return yol === KOK || yol === KOK + 'index.html';
}

function baglantiYokSayfasi() {
  var h = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Derslik 8</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FDF7EF;color:#3B2317;' +
    'font:15px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}b{display:block;font-size:19px;margin-bottom:6px}' +
    'button{margin-top:16px;font:inherit;font-weight:700;color:#fff;background:#9A3412;border:0;border-radius:12px;padding:11px 22px}</style></head>' +
    '<body><div><b>İnternet bağlantısı yok</b>Derslik 8 açılamadı. Bağlantın gelince tekrar dene.<br>' +
    '<button onclick="location.reload()">Tekrar dene</button></div></body></html>';
  return new Response(h, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function onbellektekiSayfa() {
  return caches.open(SAYFA).then(function (c) { return c.match(SAYFA_ANAHTAR); }).catch(function () { return null; });
}

function sayfa(e) {
  var cevaplandi = false, onbellektenVerildi = false;

  /* Tarayıcının kendi isteği: yönlendirmeleri tarayıcı izler */
  var ag = fetch(e.request).then(function (r) {
    if (kaydedilebilirSayfa(r)) {
      var kopya = r.clone();
      e.waitUntil(caches.open(SAYFA).then(function (c) {
        return c.match(SAYFA_ANAHTAR).then(function (eski) {
          var farkli = !eski ? Promise.resolve(false)
            : Promise.all([eski.clone().text(), kopya.clone().text()]).then(function (t) { return t[0] !== t[1]; });
          return farkli.then(function (f) {
            return c.put(SAYFA_ANAHTAR, kopya).then(function () {
              if (f && onbellektenVerildi) {
                return self.clients.matchAll({ type: 'window' }).then(function (l) {
                  l.forEach(function (cl) { cl.postMessage({ tip: 'd8-yeni-surum' }); });
                });
              }
            });
          });
        });
      }).catch(function () {}));
    }
    return r;
  });

  return new Promise(function (coz) {
    function ver(r) { if (!cevaplandi) { cevaplandi = true; coz(r); } }
    var sayac = setTimeout(function () {
      onbellektekiSayfa().then(function (o) { if (o && !cevaplandi) { onbellektenVerildi = true; ver(o); } });
    }, BEKLEME);
    ag.then(function (r) {
      clearTimeout(sayac);
      ver(r);                                   /* yönlendirme dahil, ağın cevabı olduğu gibi */
    }, function () {
      clearTimeout(sayac);
      onbellektekiSayfa().then(function (o) {
        if (o) { onbellektenVerildi = true; ver(o); } else ver(baglantiYokSayfasi());
      });
    });
  });
}

/* Önce önbellek; yoksa ağdan alıp sakla */
function onceOnbellek(req, kutu) {
  return caches.open(kutu).then(function (c) {
    return c.match(req).then(function (var_) {
      if (var_) return var_;
      return fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque') && !r.redirected) c.put(req, r.clone());
        return r;
      });
    });
  });
}

/* Önbellekten ver, arka planda tazele */
function tazeleyerek(e, kutu) {
  var req = e.request;
  return caches.open(kutu).then(function (c) {
    return c.match(req).then(function (var_) {
      var ag = fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque') && !r.redirected) c.put(req, r.clone());
        return r;
      });
      if (var_) { e.waitUntil(ag.catch(function () {})); return var_; }
      return ag;
    });
  });
}

/* Herhangi bir hata olursa isteği olduğu gibi internete bırak */
function guvenli(e, p) {
  e.respondWith(p.catch(function () { return fetch(e.request); }));
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }

  if (sayfaIstegiMi(req, url)) { guvenli(e, sayfa(e)); return; }
  if (url.origin === self.location.origin && /\/formlar\/[^/]+\.svg$/.test(url.pathname)) { guvenli(e, onceOnbellek(req, SAYFA)); return; }
  if (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) { guvenli(e, onceOnbellek(req, DIS)); return; }
  if (url.hostname === 'fonts.gstatic.com') { guvenli(e, onceOnbellek(req, DIS)); return; }
  if (url.hostname === 'fonts.googleapis.com') { guvenli(e, tazeleyerek(e, DIS)); return; }
  /* Geri kalan her şey (Firestore, giriş, analiz vb.) tarayıcının normal yolundan gider */
});
