import { h, icon, toast, nachfragen } from './dom.js';
import * as store from './store.js';
import { konfigurieren, serverModus } from './ai.js';
import { anmeldeSeite } from './views/anmelden.js';
import { datenschutz, datenschutzSeite } from './views/datenschutz.js';
import { verwaltung } from './views/verwaltung.js';
import { start } from './views/start.js';
import { karten } from './views/karten.js';
import { scannen } from './views/scannen.js';
import { mathe } from './views/mathe.js';
import { klausur } from './views/klausur.js';
import { statistik } from './views/statistik.js';
import { einstellungen } from './views/einstellungen.js';
import { chat } from './views/chat.js';
import { notizen } from './views/notizen.js';
import { spiele } from './views/spiele.js';
import { themen } from './views/themen.js';
import { erfolge } from './views/erfolge.js';
import { neueAbzeichen } from './erfolge.js';

const BEREICHE = [
  { id: 'start', name: 'Start', icon: 'heft', view: start },
  { id: 'karten', name: 'Karten', icon: 'karten', view: karten },
  { id: 'notizen', name: 'Notizen', icon: 'stift', view: notizen },
  { id: 'scannen', name: 'Scannen', icon: 'scan', view: scannen },
  { id: 'mathe', name: 'Mathe', icon: 'mathe', view: mathe },
  { id: 'klausur', name: 'Klausur', icon: 'klausur', view: klausur },
  { id: 'themen', name: 'Themen', icon: 'buch', view: themen, neben: true },
  { id: 'erfolge', name: 'Erfolge', icon: 'pokal', view: erfolge, neben: true },
  { id: 'spiele', name: 'Spiele', icon: 'spiele', view: spiele, neben: true },
  { id: 'chat', name: 'Lernhelfer', icon: 'chat', view: chat, neben: true },
  { id: 'verwaltung', name: 'Verwaltung', icon: 'schild', view: verwaltung, neben: true, nurAdmin: true },
  { id: 'datenschutz', name: 'Datenschutz', icon: 'schild', view: datenschutz, versteckt: true },
  { id: 'statistik', name: 'Statistik', icon: 'statistik', view: statistik, neben: true },
  { id: 'einstellungen', name: 'Einstellungen', icon: 'einstellungen', view: einstellungen, neben: true },
];

store.init();
konfigurieren(() => store.getState().settings);

// ---------- Konto: Läuft die App auf dem eigenen Server mit Anmeldung? ----------
const api = (pfad, opts = {}) => fetch(pfad, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', 'x-lernheft': '1', ...(opts.headers || {}) } });
async function kontoPruefen() {
  try {
    const r = await api('/api/ich');
    if (!(r.headers.get('content-type') || '').includes('json')) return null; // reine Webseite ohne Server-Teil
    if (r.status === 401) return 'abgemeldet';
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
const konto = await kontoPruefen();
if (konto === 'abgemeldet') {
  document.getElementById('nav').hidden = true;
  const zeigeLogin = () => {
    const main = document.getElementById('inhalt');
    if (location.hash === '#datenschutz') {
      const seite = datenschutzSeite(zeigeLogin);
      seite.prepend(h('a', { class: 'knopf knopf-leise zurueck', href: '#' }, icon('zurueck', 18), 'Zur Anmeldung'));
      main.replaceChildren(seite);
    } else main.replaceChildren(anmeldeSeite(() => location.reload()));
  };
  addEventListener('hashchange', zeigeLogin);
  zeigeLogin();
  document.documentElement.dataset.theme = matchMedia?.('(prefers-color-scheme: dark)').matches ? 'tafel' : 'heft';
  throw new Error('Anmeldung nötig'); // Rest der App erst nach dem Anmelden laden
}
if (konto) {
  serverModus();
  const lokal = store.getState();
  let daten = {};
  try {
    const r = await api('/api/daten');
    daten = r.ok ? await r.json() : {};
  } catch { /* leer starten */ }
  const lokaleKarten = lokal.cards.length;
  store.serverModus(daten, async (json) => {
    const r = await api('/api/daten', { method: 'PUT', body: json, keepalive: json.length < 60000 });
    if (r.status === 401) location.reload();
    if (!r.ok) throw new Error('Speichern fehlgeschlagen');
  });
  // Erste Anmeldung auf einem Gerät, auf dem schon ohne Konto gelernt wurde: Karten übernehmen?
  if (!store.getState().decks.length && lokaleKarten && konto.admin) {
    queueMicrotask(async () => {
      if (await nachfragen('Karten übernehmen?', `Auf diesem Gerät liegen noch ${lokaleKarten} Karten von vorher. Sollen sie in dein Konto?`, 'Übernehmen')) {
        store.importData(JSON.stringify({ app: 'lernheft', ...lokal, settings: { ...lokal.settings, apiKey: '' } }));
        toast('Karten übernommen.');
        zeichnen();
      }
    });
  }
  let gemeldet = false;
  store.beiSpeicherStatus((s) => {
    if (s === 'fehler' && !gemeldet) { gemeldet = true; toast('Speichern klappt gerade nicht – ich versuche es weiter.', 'fehler'); }
    if (s === 'ok') gemeldet = false;
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.jetztSpeichern(); });
}

const main = document.getElementById('inhalt');
const blase = document.createElement('a');
blase.href = '#chat';
blase.className = 'chat-blase';
blase.setAttribute('aria-label', 'Lernhelfer fragen');
blase.append(icon('chat', 26));
document.body.append(blase);
const nav = document.getElementById('nav');
let aufraeumen = [];
let ueberlagerung = null; // z. B. eine laufende Abfrage, die über dem Bereich liegt

function bereich() {
  const id = location.hash.replace('#', '');
  return BEREICHE.find((b) => b.id === id && (!b.nurAdmin || konto?.admin)) || BEREICHE[0];
}

const ctx = {
  // Zu einem Bereich wechseln; optionen landen bei der Ansicht (z. B. welcher Stapel).
  go(id, optionen) {
    ueberlagerung = null;
    ctx.optionen = optionen || null;
    if (bereich().id === id) zeichnen();
    else location.hash = id;
  },
  refresh: () => zeichnen(),
  // Eine Ansicht über den aktuellen Bereich legen (Abfrage läuft, bis sie geschlossen wird).
  open(viewFn) {
    ueberlagerung = viewFn;
    zeichnen();
  },
  close() {
    ueberlagerung = null;
    zeichnen();
  },
  // Wird vor dem nächsten Zeichnen aufgerufen (Timer stoppen, Tasten abmelden).
  onLeave: (fn) => aufraeumen.push(fn),
  optionen: null,
  konto: konto || null,
  async abmelden() {
    store.jetztSpeichern();
    await new Promise((r) => setTimeout(r, 300));
    try { await api('/api/abmelden', { method: 'POST' }); } catch { /* egal */ }
    // Auf gemeinsam genutzten Geräten nichts zurücklassen
    try { localStorage.removeItem('lernheft.v1'); sessionStorage.clear(); } catch { /* egal */ }
    try { const n = await caches.keys(); await Promise.all(n.map((k) => caches.delete(k))); } catch { /* egal */ }
    location.replace('/');
  },
};

function zeichnen() {
  for (const fn of aufraeumen.splice(0)) {
    try { fn(); } catch { /* egal */ }
  }
  const aktiv = bereich();
  let inhalt;
  try {
    inhalt = (ueberlagerung || aktiv.view)(ctx);
  } catch (e) {
    console.error(e);
    inhalt = h('div', { class: 'blatt' },
      h('h1', null, 'Da ist etwas schiefgegangen'),
      h('p', null, 'Diese Seite konnte nicht angezeigt werden. Deine Karten sind nicht verloren.'),
      h('button', { class: 'knopf knopf-haupt', onclick: () => ctx.go('start') }, 'Zurück zum Start'));
  }
  ctx.optionen = null;
  if (!document.startViewTransition) inhalt.classList.add('auftritt');
  main.replaceChildren(inhalt);
  effekte(main);
  // Neue Abzeichen feiern
  try {
    for (const a of neueAbzeichen()) toast(`${a.icon} Neues Abzeichen: ${a.name}!`);
  } catch { /* egal */ }
  navZeichnen(aktiv.id);
  // Chat-Knopf überall, außer im Chat selbst und während einer Abfrage
  blase.hidden = aktiv.id === 'chat' || Boolean(ueberlagerung);
  document.title = `${aktiv.name} – Lernheft`;
}

function navZeichnen(aktivId) {
  nav.replaceChildren(
    h('a', { class: 'nav-marke', href: '#start', 'aria-label': 'Lernheft von Glenn, zum Start' }, 'Lernheft', h('small', null, 'von Glenn')),
    h('ul', null, BEREICHE.filter((b) => (!b.nurAdmin || konto?.admin) && !b.versteckt).map((b) =>
      h('li', { class: b.neben ? 'nav-neben' : '' },
        h('a', { href: `#${b.id}`, 'aria-current': b.id === aktivId ? 'page' : null, onclick: () => { ueberlagerung = null; ctx.optionen = { neu: true }; if (b.id === aktivId) queueMicrotask(zeichnen); } },
          b.id === 'scannen' ? h('span', { class: 'nav-scan' }, icon(b.icon, 26)) : icon(b.icon), h('span', null, b.name))))),
  );
}

// ---------- Kleine Effekte: Zahlen zählen hoch, Karten neigen sich ----------
function effekte(wurzel) {
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of wurzel.querySelectorAll('.zahlen dd, .rb-zahl, .ende-zahl-gross')) {
    const m = /^(\d+)(.*)$/.exec(el.textContent.trim());
    if (!m || Number(m[1]) < 2 || el.dataset.gezaehlt) continue;
    el.dataset.gezaehlt = '1';
    const ziel = Number(m[1]);
    const start = performance.now();
    const dauer = Math.min(900, 300 + ziel * 8);
    const schritt = (t) => {
      const p = Math.min(1, (t - start) / dauer);
      el.textContent = `${Math.round(ziel * (1 - (1 - p) ** 3))}${m[2]}`;
      if (p < 1) requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  }
  for (const el of wurzel.querySelectorAll('.stapel, .spiel-kachel, .notiz-kachel-blatt')) {
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-3px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
}

// ---------- Aussehen: Heft (hell) oder Tafel (dunkel) ----------
const dunkel = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
export function themeAnwenden() {
  const wahl = store.getState().settings.theme;
  const tafel = wahl === 'tafel' || (wahl === 'auto' && dunkel?.matches);
  document.documentElement.dataset.theme = tafel ? 'tafel' : 'heft';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tafel ? '#1d2b27' : '#2440b3');
}
dunkel?.addEventListener?.('change', () => { themeAnwenden(); zeichnen(); });
ctx.themeAnwenden = themeAnwenden;

const ruhig = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
addEventListener('hashchange', () => {
  ueberlagerung = null;
  // Weicher Übergang zwischen den Bereichen (wo der Browser es kann)
  if (document.startViewTransition && !ruhig?.matches) document.startViewTransition(() => zeichnen());
  else zeichnen();
  main.focus({ preventScroll: true });
  scrollTo(0, 0);
});

themeAnwenden();
zeichnen();

// Offline nutzbar machen (nur auf einer echten Webadresse; in Vorschauen ist das gesperrt).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
