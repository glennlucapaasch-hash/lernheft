import { h, icon, modal, nachfragen, feld, auswahl, toast, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { stufe, STUFEN, STUFEN_NAMEN } from '../srs.js';
import { lernenStarten } from './lernen.js';
import { stapelKachel } from './start.js';

const ui = { deckId: null, suche: '' };

const fachWahl = (aktuell) =>
  h('select', null, Object.entries(FAECHER).map(([id, f]) => h('option', { value: id, selected: id === aktuell }, f.name)));

// "house = das Haus" / "house - das Haus" / mit Tab oder Semikolon getrennt
export function listeLesen(text) {
  const karten = [];
  for (const zeile of String(text).split(/\r?\n/)) {
    const m = /^(.+?)(?:\t+|\s+[=–—-]\s+|\s*[=;]\s*)(.+)$/.exec(zeile.trim());
    if (m && m[1].trim() && m[2].trim()) karten.push({ front: m[1].trim(), back: m[2].trim() });
  }
  return karten;
}

function stapelDialog(ctx, deck) {
  const name = h('input', { type: 'text', value: deck?.name || '', maxlength: '60', placeholder: 'z. B. Unit 3 – Vokabeln' });
  const fach = fachWahl(deck?.fach || 'englisch');
  const zu = modal(deck ? 'Stapel bearbeiten' : 'Neuer Stapel',
    h('form', { onsubmit: (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      if (deck) store.updateDeck(deck.id, { name: name.value, fach: fach.value });
      else ui.deckId = store.addDeck(name.value, fach.value).id;
      zu();
      ctx.refresh();
    } },
      feld('Name', name),
      feld('Fach', fach, 'Das Fach bestimmt die Kartenfarbe und die Sprache beim Vorlesen.'),
      h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, deck ? 'Speichern' : 'Stapel anlegen'))));
}

function kartenDialog(ctx, deck, karte) {
  const istMathe = deck.fach === 'mathe';
  const front = h('textarea', { rows: '2', maxlength: '600' }, karte?.front || '');
  const back = h('textarea', { rows: '2', maxlength: '1500' }, karte?.back || '');
  const note = h('input', { type: 'text', value: karte?.note || '', maxlength: '400' });
  const speichern = (weiter) => {
    if (!front.value.trim() || !back.value.trim()) { (front.value.trim() ? back : front).focus(); return; }
    if (karte) store.updateCard(karte.id, { front: front.value, back: back.value, note: note.value });
    else store.addCards(deck.id, [{ front: front.value, back: back.value, note: note.value }]);
    if (weiter) {
      front.value = ''; back.value = ''; note.value = '';
      front.focus();
      toast('Karte gespeichert.');
    } else zu();
  };
  const zu = modal(karte ? 'Karte bearbeiten' : 'Neue Karte',
    h('form', { onsubmit: (e) => { e.preventDefault(); speichern(false); } },
      feld(istMathe ? 'Vorderseite (Aufgabe)' : FAECHER[deck.fach].lang ? `Vorderseite (${FAECHER[deck.fach].name})` : 'Vorderseite (Frage)', front),
      feld(istMathe ? 'Rückseite (Ergebnis)' : FAECHER[deck.fach].lang ? 'Rückseite (Deutsch)' : 'Rückseite (Antwort)', back),
      feld(istMathe ? 'Rechenweg (freiwillig)' : 'Hinweis oder Beispielsatz (freiwillig)', note),
      h('div', { class: 'reihe reihe-ende' },
        karte && h('button', { class: 'knopf knopf-gefahr-leise', type: 'button', onclick: () => { store.deleteCard(karte.id); zu(); } }, icon('muell', 18), 'Löschen'),
        !karte && h('button', { class: 'knopf', type: 'button', onclick: () => speichern(true) }, 'Speichern und nächste'),
        h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern'))),
    { onClose: () => ctx.refresh() });
}

function listenDialog(ctx, deck) {
  const zaehler = h('p', { class: 'hinweis', role: 'status' }, 'Noch keine Karten erkannt.');
  const text = h('textarea', { rows: '9', placeholder: 'house = das Haus\nto go = gehen\nbreak - die Pause', oninput: () => {
    const n = listeLesen(text.value).length;
    zaehler.textContent = n ? `${mehrzahl(n, 'Karte', 'Karten')} erkannt.` : 'Noch keine Karten erkannt.';
  } });
  const zu = modal('Liste einfügen',
    h('form', { onsubmit: (e) => {
      e.preventDefault();
      const karten = listeLesen(text.value);
      if (!karten.length) { text.focus(); return; }
      store.addCards(deck.id, karten);
      toast(`${mehrzahl(karten.length, 'Karte', 'Karten')} hinzugefügt.`);
      zu();
      ctx.refresh();
    } },
      feld('Eine Karte pro Zeile', text, 'Trenne Vorder- und Rückseite mit = oder einem Bindestrich mit Leerzeichen. Tabellen aus Word oder Excel kannst du direkt einfügen.'),
      zaehler,
      h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Karten hinzufügen'))));
}

function lernDialog(ctx, deck) {
  const alle = store.cardsOf(deck.id);
  const faellig = store.dueCards(deck.id);
  const fach = FAECHER[deck.fach];
  const wahl = {
    modus: deck.fach === 'mathe' ? 'umdrehen' : 'schreiben',
    richtung: 'vor',
    umfang: faellig.length ? 'faellig' : 'alle',
  };
  const fremd = fach.lang ? fach.name : 'Vorderseite';
  const deutsch = fach.lang ? 'Deutsch' : 'Rückseite';
  const zu = modal(`${deck.name} lernen`, [
    h('h3', null, 'Abfrageart'),
    auswahl('modus', [
      { wert: 'umdrehen', titel: 'Karten umdrehen', text: 'Antwort im Kopf, dann selbst einschätzen' },
      { wert: 'schreiben', titel: 'Antwort schreiben', text: 'Die App prüft Schreibweise und Artikel' },
      { wert: 'ankreuzen', titel: 'Ankreuzen', text: 'Vier Möglichkeiten, eine stimmt', gesperrt: alle.length < 4 },
    ], wahl.modus, (v) => { wahl.modus = v; }),
    h('h3', null, 'Richtung'),
    auswahl('richtung', [
      { wert: 'vor', titel: `${fremd} → ${deutsch}` },
      { wert: 'rueck', titel: `${deutsch} → ${fremd}` },
    ], wahl.richtung, (v) => { wahl.richtung = v; }),
    h('h3', null, 'Umfang'),
    auswahl('umfang', [
      { wert: 'faellig', titel: `Nur fällige (${faellig.length})`, gesperrt: !faellig.length },
      { wert: 'alle', titel: `Alle Karten (${alle.length})` },
    ], wahl.umfang, (v) => { wahl.umfang = v; }),
    h('div', { class: 'reihe reihe-ende' },
      h('button', { class: 'knopf knopf-haupt', onclick: () => {
        const karten = wahl.umfang === 'faellig' ? faellig : alle;
        zu();
        lernenStarten(ctx, { cardIds: karten.map((c) => c.id), modus: wahl.modus, richtung: wahl.richtung, titel: deck.name });
      } }, 'Los geht’s')),
  ]);
}

function stufenLeiste(deckId) {
  const z = store.stufenZahlen(deckId);
  const gesamt = STUFEN.reduce((s, k) => s + z[k], 0) || 1;
  return h('div', { class: 'stufen' },
    h('div', { class: 'stufen-balken', role: 'img', 'aria-label': STUFEN.map((k) => `${STUFEN_NAMEN[k]}: ${z[k]}`).join(', ') },
      STUFEN.filter((k) => z[k]).map((k) => h('span', { class: `stufe-${k}`, style: { flexGrow: String(z[k] / gesamt) } }))),
    h('ul', { class: 'stufen-legende' }, STUFEN.map((k) =>
      h('li', null, h('span', { class: `stufen-punkt stufe-${k}` }), `${STUFEN_NAMEN[k]} `, h('b', null, String(z[k]))))));
}

function uebersicht(ctx) {
  const { decks } = store.getState();
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' },
      h('h1', { class: 'handschrift' }, 'Karteikarten'),
      h('button', { class: 'knopf knopf-haupt', onclick: () => stapelDialog(ctx) }, icon('plus', 18), 'Neuer Stapel')),
    decks.length
      ? h('div', { class: 'stapel-gitter' }, decks.map((d) => stapelKachel(ctx, d)))
      : h('div', { class: 'blatt leer' },
          h('p', null, 'Noch kein Stapel da. Scanne eine Buchseite oder leg einen Stapel von Hand an.'),
          h('div', { class: 'reihe' },
            h('button', { class: 'knopf knopf-haupt', onclick: () => ctx.go('scannen') }, icon('scan', 18), 'Seite scannen'),
            h('button', { class: 'knopf', onclick: () => { store.beispieleLaden(); ctx.refresh(); } }, 'Beispiele laden'))));
}

function detail(ctx, deck) {
  const fach = FAECHER[deck.fach];
  const alle = store.cardsOf(deck.id);
  const faellig = store.dueCards(deck.id).length;
  const liste = h('ul', { class: 'karten-liste' });

  const listeFuellen = () => {
    const q = ui.suche.trim().toLowerCase();
    const treffer = q ? alle.filter((c) => `${c.front} ${c.back}`.toLowerCase().includes(q)) : alle;
    liste.replaceChildren(...treffer.map((c) =>
      h('li', null,
        h('button', { class: 'karten-zeile', onclick: () => kartenDialog(ctx, deck, c), 'aria-label': `Karte bearbeiten: ${c.front}` },
          h('span', { class: 'kz-vorn' }, c.front),
          h('span', { class: 'kz-hinten' }, c.back),
          h('span', { class: `kz-stufe stufe-text-${stufe(c.srs)}` }, STUFEN_NAMEN[stufe(c.srs)])))));
    if (!treffer.length) liste.append(h('li', { class: 'hinweis' }, q ? 'Keine Karte passt zur Suche.' : 'Noch keine Karten in diesem Stapel.'));
  };
  listeFuellen();

  return h('div', { class: 'seite' },
    h('button', { class: 'knopf knopf-leise zurueck', onclick: () => { ui.deckId = null; ui.suche = ''; ctx.refresh(); } }, icon('zurueck', 18), 'Alle Stapel'),
    h('header', { class: `karteikarte stapel-kopf farbe-${fach.farbe}` },
      h('span', { class: 'stapel-fach' }, fach.name),
      h('h1', null, deck.name),
      h('p', null, mehrzahl(alle.length, 'Karte', 'Karten'), faellig > 0 && [', ', h('mark', null, `${faellig} fällig`)]),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf knopf-haupt', disabled: !alle.length, onclick: () => lernDialog(ctx, deck) }, 'Lernen'),
        h('button', { class: 'knopf-icon', 'aria-label': 'Stapel bearbeiten', onclick: () => stapelDialog(ctx, deck) }, icon('stift')),
        h('button', { class: 'knopf-icon', 'aria-label': 'Stapel löschen', onclick: async () => {
          const ja = await nachfragen('Stapel löschen?', `„${deck.name}“ und ${mehrzahl(alle.length, 'Karte', 'Karten')} werden gelöscht. Das lässt sich nicht rückgängig machen.`, 'Löschen', { gefahr: true });
          if (ja) { store.deleteDeck(deck.id); ui.deckId = null; toast('Stapel gelöscht.'); ctx.refresh(); }
        } }, icon('muell')))),
    alle.length > 0 && stufenLeiste(deck.id),
    h('div', { class: 'reihe werkzeuge' },
      h('button', { class: 'knopf', onclick: () => kartenDialog(ctx, deck) }, icon('plus', 18), 'Karte'),
      h('button', { class: 'knopf', onclick: () => listenDialog(ctx, deck) }, 'Liste einfügen'),
      h('button', { class: 'knopf', onclick: () => ctx.go('scannen', { deckId: deck.id }) }, icon('scan', 18), 'Seite scannen')),
    alle.length > 8 && h('input', { type: 'search', class: 'suche', placeholder: 'Karten durchsuchen', 'aria-label': 'Karten durchsuchen', value: ui.suche, oninput: (e) => { ui.suche = e.target.value; listeFuellen(); } }),
    liste);
}

export function karten(ctx) {
  const opt = ctx.optionen;
  if (opt?.neu) { ui.deckId = null; ui.suche = ''; }
  if (opt?.deckId) { ui.deckId = opt.deckId; ui.suche = ''; }
  const deck = ui.deckId && store.getDeck(ui.deckId);
  if (!deck) ui.deckId = null;
  const seite = deck ? detail(ctx, deck) : uebersicht(ctx);
  if (opt?.neuerStapel) queueMicrotask(() => stapelDialog(ctx));
  return seite;
}
