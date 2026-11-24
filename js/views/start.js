import { h, icon, datumLang, mehrzahl, toast, modal, feld, nachfragen } from '../dom.js';
import { stufe } from '../srs.js';
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

// ---------- Klassenarbeiten ----------
const tageBis = (datum) => {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${datum}T00:00:00`) - heute) / 864e5);
};
export function pensum(t) {
  const karten = store.getState().cards.filter((c) => t.deckIds.includes(c.deckId));
  const offen = karten.filter((c) => !['gefestigt', 'sicher'].includes(stufe(c.srs)));
  const tage = Math.max(1, tageBis(t.datum));
  const proTag = Math.ceil(offen.length / tage);
  const jetzt = Date.now();
  const heute = [...offen].sort((a, b) => (a.srs.due ?? 0) - (b.srs.due ?? 0)).filter((c, i) => i < proTag || (c.srs.due ?? 0) <= jetzt);
  return { karten: karten.length, sitzt: karten.length - offen.length, heute };
}

function terminDialog(ctx, t) {
  const { decks } = store.getState();
  const titel = h('input', { type: 'text', value: t?.titel || '', placeholder: 'z. B. Englisch-Arbeit Unit 1', maxlength: '60' });
  const morgen = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const datum = h('input', { type: 'date', value: t?.datum || morgen, min: new Date().toISOString().slice(0, 10) });
  const gewaehlt = new Set(t?.deckIds || []);
  const zu = modal(t ? 'Klassenarbeit bearbeiten' : 'Klassenarbeit eintragen', h('form', { onsubmit: (e) => {
    e.preventDefault();
    if (!titel.value.trim()) { titel.focus(); return; }
    if (!gewaehlt.size) { toast('Wähle mindestens einen Stapel.', 'fehler'); return; }
    store.terminSpeichern({ id: t?.id, titel: titel.value.trim(), datum: datum.value, deckIds: [...gewaehlt] });
    zu(); ctx.refresh();
  } },
    feld('Was?', titel),
    feld('Wann?', datum),
    h('fieldset', null, h('legend', null, 'Welche Stapel kommen dran?'),
      h('ul', { class: 'haken-liste' }, decks.map((d) => h('li', null, h('label', null,
        h('input', { type: 'checkbox', checked: gewaehlt.has(d.id), onchange: (e) => { if (e.target.checked) gewaehlt.add(d.id); else gewaehlt.delete(d.id); } }),
        h('span', null, d.name), h('small', null, mehrzahl(store.cardsOf(d.id).length, 'Karte', 'Karten'))))))),
    h('p', { class: 'hinweis' }, 'Die App verteilt die Karten, die noch nicht sitzen, gleichmäßig auf die Tage bis zur Arbeit.'),
    h('div', { class: 'reihe reihe-ende' },
      t && h('button', { type: 'button', class: 'knopf knopf-gefahr-leise', onclick: async () => { zu(); if (await nachfragen('Termin löschen?', `„${t.titel}“ wird entfernt.`, 'Löschen')) { store.terminLoeschen(t.id); ctx.refresh(); } } }, 'Löschen'),
      h('button', { type: 'submit', class: 'knopf knopf-haupt' }, 'Speichern'))));
}

function termineBereich(ctx) {
  const termine = store.getState().termine.filter((t) => tageBis(t.datum) >= 0);
  return h('section', null,
    h('div', { class: 'abschnitt-kopf' },
      h('h2', null, 'Klassenarbeiten'),
      h('button', { class: 'knopf knopf-leise', onclick: () => terminDialog(ctx) }, icon('plus', 18), 'Eintragen')),
    termine.length
      ? h('div', { class: 'termine' }, termine.map((t) => {
          const tage = tageBis(t.datum);
          const p = pensum(t);
          const anteil = p.karten ? Math.round((p.sitzt / p.karten) * 100) : 0;
          return h('article', { class: `termin ${tage <= 3 ? 'termin-bald' : ''}` },
            h('button', { class: 'termin-tage', onclick: () => terminDialog(ctx, t), 'aria-label': `${t.titel} bearbeiten` },
              h('span', { class: 'handschrift' }, tage === 0 ? '!' : String(tage)), h('small', null, tage === 0 ? 'heute' : tage === 1 ? 'Tag' : 'Tage')),
            h('div', { class: 'termin-inhalt' },
              h('strong', null, t.titel),
              h('small', null, `${new Date(`${t.datum}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} · ${anteil} % sitzen`),
              h('progress', { max: 100, value: anteil, 'aria-label': `${anteil} Prozent sitzen` })),
            p.heute.length
              ? h('button', { class: 'knopf knopf-haupt', onclick: () => lernenStarten(ctx, { cardIds: p.heute.map((c) => c.id), titel: t.titel }) }, `Heute ${p.heute.length}`)
              : h('span', { class: 'termin-fertig' }, icon('check', 18), 'Für heute fertig'));
        }))
      : h('button', { class: 'termin-leer', onclick: () => terminDialog(ctx) }, icon('kalender', 22), h('span', null, 'Trag deine nächste Klassenarbeit ein – dann plant die App, wie viel du jeden Tag lernen solltest.')));
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
      h('a', { class: 'schnell-knopf', href: '#spiele' }, icon('spiele', 26), h('span', null, 'Spiele')),
      h('a', { class: 'schnell-knopf', href: '#mathe' }, icon('mathe', 26), h('span', null, 'Rechner'))),

    termineBereich(ctx),

    h('section', null,
      h('div', { class: 'abschnitt-kopf' },
        h('h2', null, 'Deine Stapel'),
        h('button', { class: 'knopf knopf-leise', onclick: () => ctx.go('karten', { neuerStapel: true }) }, icon('plus', 18), 'Neuer Stapel')),
      h('div', { class: 'stapel-gitter' }, s.decks.map((d) => stapelKachel(ctx, d)))));
}
