// Macht die App offline nutzbar: Die App-Dateien werden auf dem Gerät zwischengespeichert.
// Anfragen an die KI gehen immer direkt ins Netz und werden nie gespeichert.
const VERSION = 'lernheft-11';
const DATEIEN = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/dom.js', 'js/store.js', 'js/srs.js', 'js/check.js', 'js/calc.js', 'js/exam.js', 'js/ai.js',
  'js/views/start.js', 'js/views/karten.js', 'js/views/lernen.js', 'js/views/scannen.js',
  'js/views/mathe.js', 'js/views/klausur.js', 'js/views/statistik.js', 'js/views/einstellungen.js', 'js/views/chat.js', 'js/views/notizen.js', 'js/views/spiele.js', 'js/views/duell.js', 'js/views/themen.js', 'js/views/erfolge.js', 'js/themen-daten.js', 'js/erfolge.js', 'js/bild.js', 'js/views/anmelden.js', 'js/views/verwaltung.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const schrift = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || (url.origin !== self.location.origin && !schrift)) return;
  // Erst das Netz (damit Updates ankommen), ohne Netz die gespeicherte Fassung.
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        if (antwort.ok || antwort.type === 'opaque') {
          const kopie = antwort.clone();
          caches.open(VERSION).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((treffer) => treffer || Response.error())),
  );
});

// ---------- Erinnerungen ----------
self.addEventListener('push', (e) => {
  let d = { titel: 'Lernheft', text: 'Deine Karten warten auf dich.' };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch { /* Standardtext */ }
  e.waitUntil(self.registration.showNotification(d.titel, { body: d.text, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'lernheft-erinnerung' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
    const offen = fenster.find((f) => 'focus' in f);
    return offen ? offen.focus() : self.clients.openWindow('./');
  }));
});
