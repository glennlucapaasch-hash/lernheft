import { h, icon, modal, nachfragen, feld, auswahl, toast, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { stufe, STUFEN, STUFEN_NAMEN } from '../srs.js';
import { lernenStarten } from './lernen.js';
import { stapelKachel } from './start.js';
import { bildAlsDaten } from '../bild.js';
import { istServerModus, kiVerfuegbar, kartenPruefen } from '../ai.js';
import { sendenDialog } from './senden.js';

const serverApi = async (pfad, opts = {}) => {
  const r = await fetch(pfad, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', 'x-lernheft': '1' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'Das hat nicht geklappt.');
  return d;
};

// Bildfeld für eine Kartenseite
function bildFeld(label, wert, onChange) {
  let aktuell = wert || null;
  const vorschau = h('div', { class: 'bild-feld-vorschau' });
  const datei = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { aktuell = await bildAlsDaten(f); onChange(aktuell); zeigen(); } catch (err) { toast(err.message, 'fehler'); }
  } });
  function zeigen() {
    vorschau.replaceChildren(aktuell
      ? h('div', { class: 'bild-feld-bild' }, h('img', { src: aktuell, alt: label }),
          h('button', { type: 'button', class: 'knopf-icon foto-weg', 'aria-label': `${label} entfernen`, onclick: () => { aktuell = null; onChange(null); zeigen(); } }, icon('x', 16)))
      : h('button', { type: 'button', class: 'knopf knopf-leise knopf-mini', onclick: () => datei.click() }, icon('bild', 16), label));
  }
  zeigen();
  return h('div', { class: 'bild-feld' }, datei, vorschau);
}

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

// ---------- KI-Prüfung: meldet nur Karten, die sicher falsch sind ----------
const pruefung = { laeuft: new Set() };
export async function kartenPruefenLassen(ctx, deckId, karten, { leise = false } = {}) {
  const deck = store.getDeck(deckId);
  const offen = karten.filter((c) => c.front && c.back && !c.geprueftOk);
  if (!deck || !offen.length) return;
  if (!(await kiVerfuegbar())) { if (!leise) toast('Für die Prüfung braucht die App die KI.', 'fehler'); return; }
  pruefung.laeuft.add(deckId);
  if (location.hash === '#karten') ctx.refresh();
  let gefunden = 0;
  try {
    for (let i = 0; i < offen.length; i += 40) {
      const teil = offen.slice(i, i + 40);
      const fehler = await kartenPruefen(teil, FAECHER[deck.fach]?.name || 'Sonstiges');
      for (const f of fehler) {
        const c = teil[f.nr];
        if (store.getState().cards.some((x) => x.id === c.id)) { store.updateCard(c.id, { pruefung: { front: f.front, back: f.back, grund: f.grund } }); gefunden += 1; }
      }
    }
    if (gefunden) toast(`⚠️ ${gefunden === 1 ? 'Eine Karte' : `${gefunden} Karten`} in „${deck.name}“ ${gefunden === 1 ? 'ist' : 'sind'} sehr wahrscheinlich falsch – tippe sie an.`, 'fehler');
    else if (!leise) toast('Geprüft – die KI hat keine Fehler gefunden. ✅');
  } catch (e) {
    if (!leise) toast(e.message, 'fehler');
  }
  pruefung.laeuft.delete(deckId);
  if (location.hash === '#karten') ctx.refresh();
}

function kartenDialog(ctx, deck, karte) {
  const istMathe = deck.fach === 'mathe';
  const front = h('textarea', { rows: '2', maxlength: '600' }, karte?.front || '');
  const back = h('textarea', { rows: '2', maxlength: '1500' }, karte?.back || '');
  const note = h('input', { type: 'text', value: karte?.note || '', maxlength: '400' });
  const bilder = { bildVorn: karte?.bildVorn || null, bildHinten: karte?.bildHinten || null };
  const speichern = (weiter) => {
    if (!front.value.trim() && !bilder.bildVorn) { front.focus(); return; }
    if (!back.value.trim() && !bilder.bildHinten) { back.focus(); return; }
    let geaendert;
    if (karte) {
      const vorher = `${karte.front}|${karte.back}`;
      store.updateCard(karte.id, { front: front.value, back: back.value, note: note.value, bildVorn: bilder.bildVorn, bildHinten: bilder.bildHinten });
      geaendert = vorher !== `${karte.front}|${karte.back}` ? [karte] : [];
    } else geaendert = store.addCards(deck.id, [{ front: front.value, back: back.value, note: note.value, ...bilder }]);
    if (geaendert.length) kartenPruefenLassen(ctx, deck.id, geaendert, { leise: true });
    if (weiter) {
      front.value = ''; back.value = ''; note.value = '';
      zu(); kartenDialog(ctx, deck); return;
      front.focus();
      toast('Karte gespeichert.');
    } else zu();
  };
  const p = karte?.pruefung;
  const zu = modal(karte ? 'Karte bearbeiten' : 'Neue Karte',
    h('form', { onsubmit: (e) => { e.preventDefault(); speichern(false); } },
      p && h('div', { class: 'pruef-hinweis', role: 'alert' },
        h('strong', null, '⚠️ Die KI ist sich sicher: Hier stimmt etwas nicht.'),
        h('p', null, p.grund),
        h('p', null, 'Vorschlag: ', h('span', { class: 'pruef-vorschlag' }, `${p.front} → ${p.back}`)),
        h('div', { class: 'reihe' },
          h('button', { type: 'button', class: 'knopf knopf-haupt knopf-mini', onclick: () => { store.updateCard(karte.id, { front: p.front, back: p.back }); toast('Korrigiert.'); zu(); } }, 'Vorschlag übernehmen'),
          h('button', { type: 'button', class: 'knopf knopf-mini', onclick: () => { store.updateCard(karte.id, { pruefung: null, geprueftOk: true }); toast('Alles klar, die Karte bleibt so.'); zu(); } }, 'Ist richtig so'))),
      feld(istMathe ? 'Vorderseite (Aufgabe)' : FAECHER[deck.fach].lang ? `Vorderseite (${FAECHER[deck.fach].name})` : 'Vorderseite (Frage)', front),
      bildFeld('Bild vorne', bilder.bildVorn, (b) => { bilder.bildVorn = b; }),
      feld(istMathe ? 'Rückseite (Ergebnis)' : FAECHER[deck.fach].lang ? 'Rückseite (Deutsch)' : 'Rückseite (Antwort)', back),
      bildFeld('Bild hinten', bilder.bildHinten, (b) => { bilder.bildHinten = b; }),
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
      const neu = store.addCards(deck.id, karten);
      toast(`${mehrzahl(karten.length, 'Karte', 'Karten')} hinzugefügt.`);
      kartenPruefenLassen(ctx, deck.id, neu, { leise: true });
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
      { wert: 'sprechen', titel: 'Mündlich 🎤', text: 'Antwort laut sagen – auch zum Aussprache-Üben' },
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

const geteiltUi = { liste: null, laden: false };
function geteiltBereich(ctx) {
  if (!istServerModus()) return null;
  if (!geteiltUi.liste && !geteiltUi.laden) {
    geteiltUi.laden = true;
    serverApi('/api/geteilt').then((l) => { geteiltUi.liste = l.filter((g) => g.typ !== 'notiz'); }).catch(() => { geteiltUi.liste = []; }).finally(() => { geteiltUi.laden = false; if (location.hash === '#karten') ctx.refresh(); });
  }
  const ich = ctx.konto?.name;
  const liste = geteiltUi.liste || [];
  return h('section', { class: 'geteilt' },
    h('div', { class: 'abschnitt-kopf' }, h('h2', null, 'Geschickt und geteilt'),
      h('button', { class: 'knopf knopf-leise', onclick: () => { geteiltUi.liste = null; ctx.refresh(); } }, 'Aktualisieren')),
    !geteiltUi.liste ? h('p', { class: 'hinweis' }, 'Lade …')
      : !liste.length ? h('p', { class: 'hinweis' }, 'Noch nichts da. Öffne einen Stapel und tippe auf „Schicken“.')
      : h('ul', { class: 'geteilt-liste' }, liste.map((g) => h('li', null,
          h('span', { class: `geteilt-punkt farbe-${FAECHER[g.fach]?.farbe || 'weiss'}` }),
          h('div', { class: 'geteilt-text' }, h('strong', null, g.name), h('small', null, `${FAECHER[g.fach]?.name || 'Sonstiges'} · ${mehrzahl(g.anzahl, 'Karte', 'Karten')} · ${g.von === ich ? (g.an?.length ? `von dir an ${g.an.join(', ')}` : 'von dir an alle') : `von ${g.von}${g.an?.length ? ' an dich' : ' an alle'}`}`)),
          h('button', { class: 'knopf knopf-mini', onclick: async () => {
            try {
              const voll = await serverApi(`/api/geteilt/${g.id}`);
              const deck = store.addDeck(voll.name, voll.fach);
              const neu = store.addCards(deck.id, voll.karten);
              toast(`„${voll.name}“ ist jetzt in deinen Karten.`);
              kartenPruefenLassen(ctx, deck.id, neu, { leise: true });
              ctx.go('karten', { deckId: deck.id });
            } catch (e) { toast(e.message, 'fehler'); }
          } }, 'Übernehmen'),
          (g.von === ich || ctx.konto?.admin) && h('button', { class: 'knopf-icon', 'aria-label': `Teilen von ${g.name} beenden`, onclick: async () => {
            if (!(await nachfragen('Nicht mehr teilen?', `„${g.name}“ verschwindet aus der Liste. Wer ihn schon übernommen hat, behält ihn.`, 'Nicht mehr teilen'))) return;
            try { await serverApi(`/api/geteilt/${g.id}`, { method: 'DELETE' }); geteiltUi.liste = null; ctx.refresh(); } catch (e) { toast(e.message, 'fehler'); }
          } }, icon('muell', 18))))));
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
            h('button', { class: 'knopf', onclick: () => { store.beispieleLaden(); ctx.refresh(); } }, 'Beispiele laden'))),
    geteiltBereich(ctx));
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
          h('span', { class: 'kz-vorn' }, c.bildVorn && icon('bild', 15), c.front || '(Bild)'),
          h('span', { class: 'kz-hinten' }, c.back),
          c.pruefung ? h('span', { class: 'kz-warnung' }, '⚠️ prüfen') : h('span', { class: `kz-stufe stufe-text-${stufe(c.srs)}` }, STUFEN_NAMEN[stufe(c.srs)])))));
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
        h('button', { class: 'knopf knopf-haupt', disabled: !alle.length, onclick: () => lernenStarten(ctx, { cardIds: (faellig ? store.dueCards(deck.id) : alle).map((c) => c.id), modus: deck.fach === 'mathe' ? 'umdrehen' : 'schreiben', titel: deck.name }) }, faellig ? `${faellig} fällige abfragen` : 'Alle abfragen'),
        h('button', { class: 'knopf', disabled: !alle.length, onclick: () => lernDialog(ctx, deck) }, 'Abfrage einstellen'),
        h('button', { class: 'knopf-icon', 'aria-label': 'Stapel bearbeiten', onclick: () => stapelDialog(ctx, deck) }, icon('stift')),
        h('button', { class: 'knopf-icon', 'aria-label': 'Stapel löschen', onclick: async () => {
          const ja = await nachfragen('Stapel löschen?', `„${deck.name}“ und ${mehrzahl(alle.length, 'Karte', 'Karten')} werden gelöscht. Das lässt sich nicht rückgängig machen.`, 'Löschen', { gefahr: true });
          if (ja) { store.deleteDeck(deck.id); ui.deckId = null; toast('Stapel gelöscht.'); ctx.refresh(); }
        } }, icon('muell')))),
    alle.length > 0 && stufenLeiste(deck.id),
    alle.some((c) => c.pruefung) && h('div', { class: 'pruef-hinweis' }, h('strong', null, `⚠️ ${mehrzahl(alle.filter((c) => c.pruefung).length, 'Karte ist', 'Karten sind')} wahrscheinlich falsch.`), h('p', null, 'Sie sind unten mit „prüfen“ markiert. Tippe sie an, um den Vorschlag der KI zu sehen.')),
    h('div', { class: 'reihe werkzeuge' },
      h('button', { class: 'knopf', onclick: () => kartenDialog(ctx, deck) }, icon('plus', 18), 'Karte'),
      h('button', { class: 'knopf', onclick: () => listenDialog(ctx, deck) }, 'Liste einfügen'),
      pruefung.laeuft.has(deck.id)
        ? h('span', { class: 'pruef-laeuft', role: 'status' }, 'KI prüft die Karten …')
        : alle.length > 0 && h('button', { class: 'knopf', onclick: () => kartenPruefenLassen(ctx, deck.id, alle) }, '✓ Mit KI prüfen'),
      h('button', { class: 'knopf', onclick: () => ctx.go('scannen', { deckId: deck.id }) }, icon('scan', 18), 'Seite scannen'),
      istServerModus() && alle.length > 0 && h('button', { class: 'knopf', onclick: () => sendenDialog({
        titel: `„${deck.name}“ schicken`,
        beschreibung: `${mehrzahl(alle.length, 'Karte', 'Karten')} – die Empfänger können den Stapel in ihre Karten übernehmen. Dein Lernstand wird nicht mitgeschickt.`,
        daten: { name: deck.name, fach: deck.fach, karten: alle.map(({ front, back, note, bildVorn, bildHinten }) => ({ front, back, note, bildVorn, bildHinten })) },
      }) }, icon('teilen', 18), 'Schicken')),
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
