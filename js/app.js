import { h, icon } from './dom.js';
import * as store from './store.js';
import { konfigurieren } from './ai.js';
import { start } from './views/start.js';
import { karten } from './views/karten.js';
import { scannen } from './views/scannen.js';
import { mathe } from './views/mathe.js';
import { klausur } from './views/klausur.js';
import { statistik } from './views/statistik.js';
import { einstellungen } from './views/einstellungen.js';
import { chat } from './views/chat.js';

const BEREICHE = [
  { id: 'start', name: 'Start', icon: 'heft', view: start },
  { id: 'karten', name: 'Karten', icon: 'karten', view: karten },
  { id: 'scannen', name: 'Scannen', icon: 'scan', view: scannen },
  { id: 'mathe', name: 'Mathe', icon: 'mathe', view: mathe },
  { id: 'klausur', name: 'Klausur', icon: 'klausur', view: klausur },
  { id: 'chat', name: 'Lernhelfer', icon: 'chat', view: chat, neben: true },
  { id: 'statistik', name: 'Statistik', icon: 'statistik', view: statistik, neben: true },
  { id: 'einstellungen', name: 'Einstellungen', icon: 'einstellungen', view: einstellungen, neben: true },
];

store.init();
konfigurieren(() => store.getState().settings);

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
  return BEREICHE.find((b) => b.id === id) || BEREICHE[0];
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
  inhalt.classList.add('auftritt');
  main.replaceChildren(inhalt);
  navZeichnen(aktiv.id);
  // Chat-Knopf überall, außer im Chat selbst und während einer Abfrage
  blase.hidden = aktiv.id === 'chat' || Boolean(ueberlagerung);
  document.title = `${aktiv.name} – Lernheft`;
}

function navZeichnen(aktivId) {
  nav.replaceChildren(
    h('a', { class: 'nav-marke', href: '#start', 'aria-label': 'Lernheft, zum Start' }, 'Lernheft'),
    h('ul', null, BEREICHE.map((b) =>
      h('li', { class: b.neben ? 'nav-neben' : '' },
        h('a', { href: `#${b.id}`, 'aria-current': b.id === aktivId ? 'page' : null, onclick: () => { ueberlagerung = null; ctx.optionen = { neu: true }; if (b.id === aktivId) queueMicrotask(zeichnen); } },
          b.id === 'scannen' ? h('span', { class: 'nav-scan' }, icon(b.icon, 26)) : icon(b.icon), h('span', null, b.name))))),
  );
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

addEventListener('hashchange', () => {
  ueberlagerung = null;
  zeichnen();
  main.focus({ preventScroll: true });
  scrollTo(0, 0);
});

themeAnwenden();
zeichnen();

// Offline nutzbar machen (nur auf einer echten Webadresse; in Vorschauen ist das gesperrt).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
