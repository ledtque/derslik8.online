/* Derslik 8 — çevrimdışı katman kaldırıldı.
   Bu dosya, eski sürümü yüklü telefonlarda kendini siler: bütün önbellekleri
   temizler, kaydını kaldırır ve açık sayfayı bir kez güncel hâliyle yeniler.
   Birkaç hafta sonra, herkes en az bir kez siteyi açtıktan sonra bu dosya
   sunucudan silinebilir. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var k = await caches.keys();
    await Promise.all(k.map(function (a) { return caches.delete(a); }));
    await self.registration.unregister();
    var l = await self.clients.matchAll({ type: 'window' });
    l.forEach(function (c) { try { c.navigate(c.url); } catch (err) {} });
  })());
});
/* fetch dinleyicisi yok: istekler doğrudan ağa gider */
