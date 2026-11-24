// Lernspiele: Memory mit den eigenen Karten, Blitzrunde gegen die Uhr, Rangliste der Gruppe.
import { h, icon, toast, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { shuffle, mcOptionen } from '../exam.js';
import { istServerModus } from '../ai.js';
import { duell } from './duell.js';
import { wortregen, buchstabensalat, galgenmaennchen } from './wortspiele.js';

const ui = { tab: null, deckId: '', memory: null, blitz: null, rang: null, rangLaden: false };

const spielbar = (min) => store.getState().decks.filter((d) => store.cardsOf(d.id).filter((c) => c.front && c.back).length >= min);

function stapelWahl(min, onChange) {
  const decks = spielbar(min);
  if (!decks.some((d) => d.id === ui.deckId)) ui.deckId = decks[0]?.id || '';
  return h('select', { 'aria-label': 'Stapel', class: 'spiel-stapel', onchange: (e) => { ui.deckId = e.target.value; onChange(); } },
    h('option', { value: 'alle', selected: ui.deckId === 'alle' }, 'Alle Stapel gemischt'),
    decks.map((d) => h('option', { value: d.id, selected: d.id === ui.deckId }, `${d.name} (${FAECHER[d.fach].name})`)));
}
const kartenFuer = () => store.getState().cards.filter((c) => c.front && c.back && (ui.deckId === 'alle' || c.deckId === ui.deckId));

// ---------- Memory ----------
function memoryNeu() {
  const paare = shuffle(kartenFuer()).slice(0, 6);
  ui.memory = {
    teile: shuffle(paare.flatMap((c) => [{ id: c.id, text: c.front, s: 'v' }, { id: c.id, text: c.back, s: 'h' }])).map((t, i) => ({ ...t, n: i })),
    offen: [], gefunden: new Set(), zuege: 0, start: null, ende: null, sperre: false,
  };
}
function memory(ctx) {
  if (spielbar(3).length === 0) return h('p', { class: 'blatt' }, 'Für Memory brauchst du einen Stapel mit mindestens 3 Karten.');
  const auswahl = stapelWahl(3, () => { memoryNeu(); ctx.refresh(); });
  if (!ui.memory) memoryNeu();
  const m = ui.memory;
  const fertig = m.gefunden.size * 2 === m.teile.length;
  const zeit = m.start ? Math.round(((m.ende || Date.now()) - m.start) / 1000) : 0;

  const tippen = (t) => {
    if (m.sperre || m.offen.includes(t.n) || m.gefunden.has(t.id)) return;
    m.start ||= Date.now();
    m.offen.push(t.n);
    if (m.offen.length === 2) {
      m.zuege += 1;
      const [a, b] = m.offen.map((n) => m.teile[n]);
      if (a.id === b.id) {
        m.gefunden.add(a.id);
        m.offen = [];
        if (m.gefunden.size * 2 === m.teile.length) { m.ende = Date.now(); store.getState().spiele.memory = (store.getState().spiele.memory || 0) + 1; store.save(); }
      } else {
        m.sperre = true;
        setTimeout(() => { m.offen = []; m.sperre = false; if (location.hash === '#spiele') ctx.refresh(); }, 1000);
      }
    }
    ctx.refresh();
  };

  return h('div', { class: 'spiel' },
    h('div', { class: 'spiel-kopf' }, auswahl,
      h('span', { class: 'spiel-stand' }, `${mehrzahl(m.zuege, 'Zug', 'Züge')} · ${m.gefunden.size} von ${m.teile.length / 2} Paaren`),
      h('button', { class: 'knopf knopf-mini', onclick: () => { memoryNeu(); ctx.refresh(); } }, 'Neu mischen')),
    fertig && h('div', { class: 'blatt spiel-ende' },
      h('p', { class: 'handschrift ende-spruch' }, m.zuege <= m.teile.length / 2 + 2 ? 'Gedächtnis-Profi!' : 'Alle gefunden!'),
      h('p', null, `${mehrzahl(m.zuege, 'Zug', 'Züge')} in ${zeit} Sekunden.`),
      h('button', { class: 'knopf knopf-haupt', onclick: () => { memoryNeu(); ctx.refresh(); } }, 'Nochmal')),
    h('div', { class: 'memory', role: 'grid', 'aria-label': 'Memory-Karten' }, m.teile.map((t) => {
      const auf = m.offen.includes(t.n) || m.gefunden.has(t.id);
      const falsch = m.sperre && m.offen.includes(t.n);
      return h('button', {
        class: `memory-karte ${auf ? 'ist-auf' : ''} ${m.gefunden.has(t.id) ? 'ist-gefunden' : ''} ${falsch ? 'ist-falsch' : ''}`,
        'aria-label': auf ? t.text : 'Verdeckte Karte', onclick: () => tippen(t),
      }, h('span', { class: 'memory-innen' },
        h('span', { class: 'memory-rueck', 'aria-hidden': 'true' }, icon('heft', 26)),
        h('span', { class: `memory-vorn ${t.s === 'v' ? 'seite-v' : 'seite-h'}` }, t.text)));
    })));
}

// ---------- Blitzrunde ----------
function blitzFrage() {
  const karten = kartenFuer();
  for (let i = 0; i < 20; i++) {
    const c = karten[Math.floor(Math.random() * karten.length)];
    const pool = karten.filter((x) => x.deckId === c.deckId).map((x) => x.back);
    const opts = mcOptionen(c.back, pool) || mcOptionen(c.back, karten.map((x) => x.back));
    if (opts) return { frage: c.front, antwort: c.back, opts };
  }
  return null;
}
function blitz(ctx) {
  if (store.getState().cards.filter((c) => c.front && c.back).length < 4) return h('p', { class: 'blatt' }, 'Für die Blitzrunde brauchst du mindestens 4 Karten.');
  const rekord = store.getState().spiele.blitz || 0;
  const b = ui.blitz;
  if (!b || b.phase === 'start') {
    return h('div', { class: 'spiel' },
      h('div', { class: 'spiel-kopf' }, stapelWahl(4, () => ctx.refresh())),
      h('div', { class: 'blatt blitz-start' },
        h('p', { class: 'handschrift blitz-titel' }, '60 Sekunden'),
        h('p', null, 'So viele Karten wie möglich richtig ankreuzen. Jede richtige gibt einen Punkt, jede falsche kostet 2 Sekunden.'),
        rekord > 0 && h('p', null, 'Dein Rekord: ', h('mark', null, mehrzahl(rekord, 'Punkt', 'Punkte'))),
        h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: () => {
          if (kartenFuer().length < 4) ui.deckId = 'alle';
          ui.blitz = { phase: 'laeuft', punkte: 0, ende: Date.now() + 60000, frage: blitzFrage(), rueck: null };
          ctx.refresh();
        } }, 'Los!')));
  }
  if (b.phase === 'ende') {
    const neu = b.punkte > (b.alterRekord || 0);
    return h('div', { class: 'spiel' }, h('div', { class: 'blatt spiel-ende' },
      h('p', { class: 'handschrift ende-spruch' }, neu ? 'Neuer Rekord!' : 'Zeit um!'),
      h('p', { class: 'blitz-punkte' }, mehrzahl(b.punkte, 'Punkt', 'Punkte')),
      h('button', { class: 'knopf knopf-haupt', onclick: () => { ui.blitz = null; ctx.refresh(); } }, 'Nochmal')));
  }
  const uhr = h('span', { class: 'blitz-uhr', role: 'timer' });
  const takt = setInterval(() => {
    const rest = Math.max(0, Math.ceil((b.ende - Date.now()) / 1000));
    uhr.textContent = `${rest} s`;
    uhr.classList.toggle('uhr-knapp', rest <= 10);
    if (rest <= 0) {
      clearInterval(takt);
      b.phase = 'ende';
      b.alterRekord = store.getState().spiele.blitz || 0;
      if (b.punkte > b.alterRekord) { store.getState().spiele.blitz = b.punkte; store.save(); }
      ctx.refresh();
    }
  }, 200);
  ctx.onLeave(() => clearInterval(takt));
  uhr.textContent = `${Math.max(0, Math.ceil((b.ende - Date.now()) / 1000))} s`;
  const f = b.frage;
  return h('div', { class: 'spiel' },
    h('div', { class: 'spiel-kopf' }, h('strong', { class: 'blitz-stand' }, mehrzahl(b.punkte, 'Punkt', 'Punkte')), uhr),
    h('div', { class: 'karteikarte gross farbe-gelb blitz-karte', key: f.frage }, h('div', { class: 'karte-seite' }, h('p', { class: 'karte-text' }, f.frage))),
    h('div', { class: 'ankreuzen' }, f.opts.map((o) => h('button', {
      class: `knopf knopf-option ${b.rueck && o === f.antwort ? 'ist-richtig' : ''} ${b.rueck === o && o !== f.antwort ? 'ist-falsch' : ''}`,
      onclick: () => {
        if (b.rueck) return;
        b.rueck = o;
        if (o === f.antwort) b.punkte += 1; else b.ende -= 2000;
        setTimeout(() => { b.rueck = null; b.frage = blitzFrage(); if (location.hash === '#spiele' && b.phase === 'laeuft') ctx.refresh(); }, o === f.antwort ? 250 : 700);
        ctx.refresh();
      },
    }, h('span', null, o)))));
}

// ---------- Rangliste ----------
function rangliste(ctx) {
  if (!istServerModus()) return h('div', { class: 'blatt' }, h('p', null, 'Die Rangliste gibt es, wenn du mit einem Konto angemeldet bist.'));
  if (!ui.rang && !ui.rangLaden) {
    ui.rangLaden = true;
    fetch('/api/rangliste', { credentials: 'same-origin' }).then((r) => r.json()).then((l) => { ui.rang = Array.isArray(l) ? l : []; })
      .catch(() => { toast('Die Rangliste konnte nicht geladen werden.', 'fehler'); ui.rang = []; })
      .finally(() => { ui.rangLaden = false; if (location.hash === '#spiele') ctx.refresh(); });
    return h('p', { class: 'hinweis' }, 'Lade …');
  }
  const ich = ctx.konto?.name;
  const medaille = ['🥇', '🥈', '🥉'];
  return h('div', { class: 'spiel' },
    h('div', { class: 'spiel-kopf' }, h('p', { class: 'hinweis' }, 'Wer hat in den letzten 7 Tagen am meisten Karten abgefragt?'),
      h('button', { class: 'knopf knopf-mini', onclick: () => { ui.rang = null; ctx.refresh(); } }, 'Aktualisieren')),
    h('ol', { class: 'rangliste' }, (ui.rang || []).map((r, i) => h('li', { class: r.name === ich ? 'ist-ich' : '' },
      h('span', { class: 'rang-platz' }, medaille[i] || `${i + 1}.`),
      h('span', { class: 'rang-name' }, r.name, r.name === ich && h('small', null, ' (du)')),
      h('span', { class: 'rang-zahl' }, h('b', null, String(r.woche)), h('small', null, 'Abfragen')),
      h('span', { class: 'rang-zahl' }, h('b', null, `${r.serie}`), h('small', null, r.serie === 1 ? 'Tag Serie' : 'Tage Serie')),
      h('span', { class: 'rang-zahl' }, h('b', null, String(r.blitz)), h('small', null, 'Blitz-Rekord'))))));
}

const SPIELE = [
  { id: 'memory', name: 'Memory', icon: '🃏', text: 'Paare aus Wort und Übersetzung finden', farbe: 'blau', view: memory, stapel: true },
  { id: 'regen', name: 'Wortregen', icon: '🌧️', text: 'Übersetzung tippen, bevor das Wort aufschlägt', farbe: 'himmel', view: (ctx) => wortregen(ctx, ui.deckId || 'alle'), stapel: true },
  { id: 'salat', name: 'Buchstabensalat', icon: '🔤', text: 'Durcheinandergewürfelte Buchstaben ordnen', farbe: 'gelb', view: (ctx) => buchstabensalat(ctx, ui.deckId || 'alle'), stapel: true },
  { id: 'galgen', name: 'Galgenmännchen', icon: '🪢', text: 'Das Wort Buchstabe für Buchstabe erraten', farbe: 'rosa', view: (ctx) => galgenmaennchen(ctx, ui.deckId || 'alle'), stapel: true },
  { id: 'blitz', name: 'Blitzrunde', icon: '⚡', text: '60 Sekunden, so viele Treffer wie möglich', farbe: 'orange', view: blitz },
  { id: 'duell', name: 'Duell', icon: '⚔️', text: 'Live gegen deine Freunde – mit Code', farbe: 'koralle', view: duell },
  { id: 'rang', name: 'Rangliste', icon: '🏆', text: 'Wer hat diese Woche am meisten gelernt?', farbe: 'mint', view: rangliste },
];

export function spiele(ctx) {
  if (ctx.optionen?.neu) { ui.tab = null; ui.rang = null; }
  const aktiv = SPIELE.find((t) => t.id === ui.tab);
  if (!aktiv) {
    return h('div', { class: 'seite' },
      h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Spiele'), h('span', { class: 'spiel-pokal', 'aria-hidden': 'true' }, icon('pokal', 30))),
      !store.getState().cards.length && h('p', { class: 'blatt' }, 'Die meisten Spiele brauchen Karteikarten. Duell und Rangliste gehen auch ohne.'),
      h('div', { class: 'spiele-gitter' }, SPIELE.map((sp, i) => h('button', { class: `spiel-kachel farbe-${sp.farbe}`, style: `animation-delay:${i * 0.05}s`, onclick: () => { ui.tab = sp.id; if (sp.id === 'blitz') ui.blitz = null; ctx.refresh(); scrollTo(0, 0); } },
        h('span', { class: 'spiel-kachel-icon', 'aria-hidden': 'true' }, sp.icon),
        h('strong', null, sp.name),
        h('small', null, sp.text)))));
  }
  return h('div', { class: 'seite' },
    h('div', { class: 'spiel-zurueck' },
      h('button', { class: 'knopf knopf-leise', onclick: () => { ui.tab = null; ctx.refresh(); } }, icon('zurueck', 18), 'Alle Spiele'),
      h('h1', { class: 'spiel-titel' }, `${aktiv.icon} ${aktiv.name}`)),
    aktiv.stapel && aktiv.id !== 'memory' && h('div', { class: 'spiel-kopf' }, stapelWahl(3, () => { ctx.refresh(); })),
    aktiv.view(ctx));
}
