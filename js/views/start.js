import { h, icon, datumLang, mehrzahl, toast } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { lernenStarten } from './lernen.js';

export function stapelKachel(ctx, deck) {
  const fach = FAECHER[deck.fach];
  const anzahl = store.cardsOf(deck.id).length;
  const faellig = store.dueCards(deck.id).length;
  return h('button', { class: `karteikarte stapel farbe-${fach.farbe}`, onclick: () => ctx.go('karten', { deckId: deck.id }) },
    h('span', { class: 'stapel-fach' }, fach.name),
    h('span', { class: 'stapel-name' }, deck.name),
    h('span', { class: 'stapel-fuss' },
      h('span', null, mehrzahl(anzahl, 'Karte', 'Karten')),
      faellig > 0 && h('mark', null, `${faellig} fällig`)));
}

function willkommen(ctx) {
  return h('div', { class: 'seite willkommen' },
    h('h1', { class: 'handschrift' }, 'Dein Lernheft'),
    h('p', { class: 'einleitung' },
      'Fotografier eine Vokabelseite oder Mathe-Aufgaben aus deinem Schulbuch. Die App macht Karteikarten daraus, fragt dich ab und stellt dir Probeklausuren zusammen.'),
    h('div', { class: 'stapel-reihe willkommen-knoepfe' },
      h('button', { class: 'knopf knopf-haupt', onclick: () => ctx.go('scannen') }, icon('scan'), 'Erste Seite scannen'),
      h('button', { class: 'knopf', onclick: () => ctx.go('karten', { neuerStapel: true }) }, icon('plus'), 'Stapel von Hand anlegen'),
      h('button', { class: 'knopf', onclick: () => { store.beispieleLaden(); toast('Zwei Beispielstapel angelegt.'); ctx.refresh(); } }, 'Mit Beispielen ausprobieren')),
    h('ol', { class: 'ablauf' },
      h('li', null, h('strong', null, 'Scannen'), h('span', null, 'Foto von der Buchseite machen, Karten kurz prüfen, speichern.')),
      h('li', null, h('strong', null, 'Abfragen lassen'), h('span', null, 'Umdrehen, schreiben oder ankreuzen. Was du kannst, kommt seltener dran.')),
      h('li', null, h('strong', null, 'Probeklausur schreiben'), h('span', null, 'Mit Zeit und Note, damit die echte Arbeit keine Überraschung wird.'))));
}

export function start(ctx) {
  const s = store.getState();
  if (!s.decks.length) return willkommen(ctx);

  const faellig = store.dueCards();
  const heute = store.heute();
  const serie = store.streak();
  const ziel = Math.max(1, Number(s.settings.tagesziel) || 20);
  const name = s.settings.name.trim();

  const lernen = (ids, titel) => lernenStarten(ctx, { cardIds: ids, titel });

  const heuteBlock = faellig.length
    ? [
        h('p', { class: 'heute-satz' }, h('mark', null, mehrzahl(faellig.length, 'Karte', 'Karten')), faellig.length === 1 ? ' wartet heute auf dich.' : ' warten heute auf dich.'),
        h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: () => lernen(faellig.slice(0, 40).map((c) => c.id), 'Heute fällig') }, 'Jetzt lernen'),
        faellig.length > 40 && h('p', { class: 'hinweis' }, 'Eine Runde hat höchstens 40 Karten. Danach kannst du gleich die nächste starten.'),
      ]
    : [
        h('p', { class: 'heute-satz' }, 'Für heute ist alles wiederholt.'),
        s.cards.length > 0 && h('button', { class: 'knopf', onclick: () => lernen(s.cards.slice().sort(() => Math.random() - 0.5).slice(0, 20).map((c) => c.id), 'Freies Üben') }, 'Trotzdem üben'),
      ];

  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' },
      h('div', null,
        h('h1', { class: 'handschrift' }, name ? `Hallo ${name}!` : 'Hallo!'),
        h('p', { class: 'datum' }, datumLang())),
      h('div', { class: 'kopf-links' },
        h('a', { class: 'knopf-icon', href: '#statistik', 'aria-label': 'Statistik' }, icon('statistik')),
        h('a', { class: 'knopf-icon', href: '#einstellungen', 'aria-label': 'Einstellungen' }, icon('einstellungen')))),

    h('section', { class: 'blatt heute', 'aria-label': 'Heute' },
      heuteBlock,
      h('div', { class: 'heute-stand' },
        h('div', { class: 'ziel' },
          h('label', { for: 'ziel-balken' }, `Tagesziel: ${Math.min(heute.abfragen, ziel)} von ${ziel} Abfragen`),
          h('progress', { id: 'ziel-balken', max: ziel, value: Math.min(heute.abfragen, ziel) })),
        h('p', { class: 'serie' }, serie > 0 ? `${mehrzahl(serie, 'Tag', 'Tage')} in Folge gelernt` : 'Heute beginnt deine Lernserie.'))),

    h('nav', { class: 'schnell', 'aria-label': 'Schnellzugriff' },
      h('a', { class: 'schnell-knopf', href: '#scannen' }, icon('scan', 26), h('span', null, 'Seite scannen')),
      h('a', { class: 'schnell-knopf', href: '#klausur' }, icon('klausur', 26), h('span', null, 'Probeklausur')),
      h('a', { class: 'schnell-knopf', href: '#mathe' }, icon('mathe', 26), h('span', null, 'Taschenrechner'))),

    h('section', null,
      h('div', { class: 'abschnitt-kopf' },
        h('h2', null, 'Deine Stapel'),
        h('button', { class: 'knopf knopf-leise', onclick: () => ctx.go('karten', { neuerStapel: true }) }, icon('plus', 18), 'Neuer Stapel')),
      h('div', { class: 'stapel-gitter' }, s.decks.map((d) => stapelKachel(ctx, d)))));
}
