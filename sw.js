/* Derslik 8 — çevrimdışı çalışma ve hızlı açılış (service worker)
   ---------------------------------------------------------------
   • Sayfa (index.html) önce internetten istenir, böylece hep güncel sürüm açılır.
     İnternet yoksa ya da 3 sn'de cevap gelmezse önbellekteki kopya açılır; yeni
     sürüm arkadan inince sayfaya "yeni sürüm hazır" mesajı gönderilir.
   • formlar/*.svg ilk kullanıldığında önbelleğe alınır, sonra hep oradan gelir.
   • Sürüm numaralı dış kütüphaneler (Firebase SDK, Google yazı tipi dosyaları)
     önbellekten verilir; yazı tipi CSS'i arka planda tazelenir.
   • Firebase veritabanı / giriş istekleri hiç ellenmez, her zaman ağdan gider.
   Bu dosyada bir şeyi değiştirirsen SURUM'u artır: eski önbellekler silinir. */
/* Adlar "d8-" ile başlamaz: index.html eski, çalışmayan önbellek denemesinden
   kalan "d8-…" önbelleklerini her açılışta siler. */
var SURUM = 'v2';
var SAYFA = 'derslik8-sayfa';   /* sayfa önbelleği sürümden bağımsız: güncellemede çevrimdışı kopya kaybolmasın */
var DIS = 'derslik8-dis-' + SURUM;
var KOK = new URL('./', self.location).href;
var INDEX = new URL('./index.html', self.location).href;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SAYFA).then(function (c) {
    return c.add(new Request(INDEX, { cache: 'reload' })).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (adlar) {
    return Promise.all(adlar.filter(function (a) { return a !== SAYFA && a !== DIS && a.indexOf('derslik8-') === 0; })
      .map(function (a) { return caches.delete(a); }));
  }).then(function () { return self.clients.claim(); }));
});

function sayfaIstegiMi(req, url) {
  if (req.mode === 'navigate') return url.origin === self.location.origin;
  return url.href.split('?')[0] === INDEX;
}

/* Sayfa önce internetten istenir: kullanıcı her zaman en güncel sürümü görür.
   Önbellekteki kopya yalnızca internet yoksa ya da 3 sn içinde cevap gelmezse
   verilir; o durumda yeni sürüm arkadan inince "yeni sürüm hazır" denir. */
var BEKLEME = 3000;
function sayfa(e) {
  var cevaplandi = false, onbellektenVerildi = false;
  var ag = fetch(INDEX, { cache: 'no-cache' }).then(function (yeni) {
    if (!yeni || !yeni.ok) throw new Error('ag');
    var kopya = yeni.clone();
    var kayit = caches.open(SAYFA).then(function (c) {
      return c.match(INDEX).then(function (eski) {
        var farkli = !eski ? Promise.resolve(false)
          : Promise.all([eski.clone().text(), kopya.clone().text()]).then(function (t) { return t[0] !== t[1]; });
        return farkli.then(function (f) {
          return c.put(INDEX, kopya).then(function () {
            /* Yalnızca kullanıcıya eski kopya gösterildiyse haber verilir */
            if (f && onbellektenVerildi) {
              self.clients.matchAll({ type: 'window' }).then(function (l) {
                l.forEach(function (cl) { cl.postMessage({ tip: 'd8-yeni-surum' }); });
              });
            }
          });
        });
      });
    });
    e.waitUntil(kayit.catch(function () {}));
    return yeni;
  });
  e.waitUntil(ag.catch(function () {}));

  return new Promise(function (coz) {
    function onbellektenVer() {
      if (cevaplandi) return;
      caches.open(SAYFA).then(function (c) { return c.match(INDEX); }).then(function (o) {
        if (cevaplandi) return;
        if (o) { cevaplandi = true; onbellektenVerildi = true; coz(o); }
      });
    }
    var sayac = setTimeout(onbellektenVer, BEKLEME);
    ag.then(function (r) {
      clearTimeout(sayac);
      if (!cevaplandi) { cevaplandi = true; coz(r); }
    }, function () {
      clearTimeout(sayac);
      caches.open(SAYFA).then(function (c) { return c.match(INDEX); }).then(function (o) {
        if (cevaplandi) return;
        cevaplandi = true;
        coz(o || Response.error());
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
        if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
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
        if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
        return r;
      });
      if (var_) { e.waitUntil(ag.catch(function () {})); return var_; }
      return ag;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (sayfaIstegiMi(req, url) && (url.href.split('?')[0] === KOK || url.href.split('?')[0] === INDEX)) {
    e.respondWith(sayfa(e));
    return;
  }
  if (url.origin === self.location.origin && /\/formlar\/[^/]+\.svg$/.test(url.pathname)) {
    e.respondWith(onceOnbellek(req, SAYFA));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) {
    e.respondWith(onceOnbellek(req, DIS));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') {
    e.respondWith(onceOnbellek(req, DIS));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(tazeleyerek(e, DIS));
    return;
  }
  /* Geri kalan her şey (Firestore, giriş, analiz vb.) tarayıcının normal yolundan gider */
});
