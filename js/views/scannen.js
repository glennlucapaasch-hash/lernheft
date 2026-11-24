import { h, icon, auswahl, toast, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { lernenStarten } from './lernen.js';
import { kiVerfuegbar, bildVorbereiten, vokabelnErkennen, matheErkennen, stoffErkennen } from '../ai.js';

const MAX_FOTOS = 4;
const ARTEN = {
  vokabeln: { titel: 'Vokabeln', text: 'Wortlisten aus dem Sprachbuch', fn: vokabelnErkennen },
  mathe: { titel: 'Mathe-Aufgaben', text: 'Aufgaben, Beispiele, Merksätze', fn: matheErkennen },
  stoff: { titel: 'Lernstoff', text: 'Texte und Hefteinträge als Frage und Antwort', fn: stoffErkennen },
};

const ui = neu();
function neu() {
  return { schritt: 'start', art: 'vokabeln', fotos: [], ergebnis: null, ziel: 'neu', neuName: '', neuFach: 'englisch', fehler: '', ki: undefined, lauf: 0 };
}
function zuruecksetzen() {
  ui.fotos.forEach((f) => URL.revokeObjectURL(f.url));
  Object.assign(ui, neu(), { ki: ui.ki });
}

async function erkennen(ctx) {
  const lauf = ++ui.lauf;
  ui.schritt = 'laden';
  ui.fehler = '';
  ctx.refresh();
  try {
    const bilder = [];
    for (const f of ui.fotos) bilder.push(await bildVorbereiten(f.datei));
    const ergebnis = await ARTEN[ui.art].fn(bilder);
    if (lauf !== ui.lauf) return; // inzwischen abgebrochen
    if (!ergebnis.karten.length) {
      ui.schritt = 'start';
      ui.fehler = 'Auf dem Foto habe ich nichts Passendes gefunden. Ist die Seite scharf und ganz im Bild?';
    } else {
      ui.ergebnis = ergebnis;
      ui.neuName = ergebnis.titel;
      ui.neuFach = ergebnis.fach;
      ui.schritt = 'pruefen';
    }
  } catch (e) {
    if (lauf !== ui.lauf) return;
    ui.schritt = 'start';
    ui.fehler = e?.message || 'Das hat nicht geklappt. Versuch es noch mal.';
  }
  if (location.hash === '#scannen') ctx.refresh();
  else toast(ui.schritt === 'pruefen' ? 'Die gescannten Karten sind fertig zum Prüfen.' : ui.fehler, ui.schritt === 'pruefen' ? 'info' : 'fehler');
}

function fotosDazu(ctx, dateien) {
  for (const datei of dateien) {
    if (ui.fotos.length >= MAX_FOTOS) { toast(`Höchstens ${MAX_FOTOS} Fotos auf einmal.`); break; }
    if (!datei.type.startsWith('image/')) { toast('Das ist kein Bild.', 'fehler'); continue; }
    ui.fotos.push({ datei, url: URL.createObjectURL(datei) });
  }
  ctx.refresh();
}

function startSchritt(ctx) {
  const kamera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { fotosDazu(ctx, e.target.files); } });
  const galerie = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { fotosDazu(ctx, e.target.files); } });

  kiVerfuegbar().then((weg) => {
    if (weg === ui.ki) return;
    ui.ki = weg;
    if (location.hash === '#scannen' && ui.schritt === 'start') ctx.refresh();
  });

  const erst = ctx.erstScan;
  return h('div', { class: `seite ${erst ? 'erst-scan-seite' : ''}` },
    erst
      ? h('header', { class: 'erst-kopf' },
          h('div', { class: 'erst-symbol', 'aria-hidden': 'true' }, icon('scan', 40)),
          h('h1', { class: 'handschrift' }, 'Willkommen im Lernheft!'),
          h('p', { class: 'einleitung' }, 'Bevor es losgeht: Fotografier eine Seite aus deinem Schulbuch – Vokabeln, Mathe-Aufgaben oder einen Hefteintrag. Daraus entstehen deine ersten Karteikarten.'),
          h('ol', { class: 'erst-schritte' },
            h('li', null, 'Art auswählen'), h('li', null, 'Foto machen'), h('li', null, 'Karten prüfen und loslernen')))
      : h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Seite scannen')),
    ui.ki === null && h('div', { class: 'blatt meldung' },
      h('p', null, h('strong', null, 'Zum Erkennen der Fotos braucht die App einen KI-Schlüssel.'), ' Du hinterlegst ihn einmal in den Einstellungen. Ohne Schlüssel kannst du Vokabellisten von Hand einfügen.'),
      h('div', { class: 'reihe' },
        h('a', { class: 'knopf knopf-haupt', href: '#einstellungen' }, 'Schlüssel hinterlegen'),
        h('a', { class: 'knopf', href: '#karten' }, 'Zu den Karteikarten'))),
    ui.fehler && h('div', { class: 'blatt meldung meldung-fehler', role: 'alert' }, h('p', null, ui.fehler)),

    h('section', { class: 'blatt' },
      h('h2', null, 'Was ist auf dem Foto?'),
      auswahl('art', Object.entries(ARTEN).map(([wert, a]) => ({ wert, titel: a.titel, text: a.text })), ui.art, (v) => { ui.art = v; }),

      h('h2', null, 'Fotos'),
      ui.fotos.length > 0 && h('ul', { class: 'fotos' }, ui.fotos.map((f, i) =>
        h('li', null,
          h('img', { src: f.url, alt: `Foto ${i + 1}` }),
          h('button', { class: 'knopf-icon foto-weg', 'aria-label': `Foto ${i + 1} entfernen`, onclick: () => { URL.revokeObjectURL(f.url); ui.fotos.splice(i, 1); ctx.refresh(); } }, icon('x', 18))))),
      kamera, galerie,
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf', disabled: ui.fotos.length >= MAX_FOTOS, onclick: () => kamera.click() }, icon('scan', 18), 'Foto aufnehmen'),
        h('button', { class: 'knopf', disabled: ui.fotos.length >= MAX_FOTOS, onclick: () => galerie.click() }, icon('bild', 18), 'Bilder auswählen')),
      h('p', { class: 'hinweis' }, `Buch flach hinlegen, gutes Licht, die ganze Seite im Bild. Bis zu ${MAX_FOTOS} Fotos auf einmal.`),

      h('button', { class: 'knopf knopf-haupt knopf-gross', disabled: !ui.fotos.length || !ui.ki, onclick: () => erkennen(ctx) }, 'Karten erstellen')),
    erst && h('details', { class: 'erst-alternativ' },
      h('summary', null, 'Kein Buch zur Hand?'),
      h('p', { class: 'hinweis' }, 'Du kannst auch mit einer Wortliste oder mit Beispielkarten anfangen und später scannen.'),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf', onclick: () => { const d = store.addDeck('Meine ersten Vokabeln', 'englisch'); ctx.go('karten', { deckId: d.id }); } }, 'Wörter selbst eintippen'),
        h('button', { class: 'knopf', onclick: () => { store.beispieleLaden(); toast('Zwei Beispielstapel angelegt.'); ctx.go('start'); } }, 'Mit Beispielen ausprobieren'))));
}

function ladeSchritt(ctx) {
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Seite scannen')),
    h('div', { class: 'blatt warten', role: 'status' },
      h('div', { class: 'stift-laeuft', 'aria-hidden': 'true' }),
      h('p', null, h('strong', null, ui.fotos.length > 1 ? 'Ich lese die Seiten …' : 'Ich lese die Seite …')),
      h('p', { class: 'hinweis' }, 'Das dauert meistens 10 bis 30 Sekunden. Du kannst so lange woanders weiterlernen.'),
      h('button', { class: 'knopf', onclick: () => { ui.lauf++; ui.schritt = 'start'; ctx.refresh(); } }, 'Abbrechen')));
}

function pruefSchritt(ctx) {
  const { decks } = store.getState();
  const karten = ui.ergebnis.karten;
  const istMathe = ui.art === 'mathe';
  const zaehler = h('span');
  const speicherKnopf = h('button', { class: 'knopf knopf-gross', type: 'submit', value: 'speichern' });
  const abfrageKnopf = h('button', { class: 'knopf knopf-haupt knopf-gross', type: 'submit', value: 'abfragen' }, 'Speichern und gleich abfragen');
  const zaehlen = () => {
    const n = karten.filter((k) => k.front.trim() && k.back.trim()).length;
    zaehler.textContent = `${mehrzahl(n, 'Karte', 'Karten')} erkannt.`;
    speicherKnopf.textContent = 'Nur speichern';
    speicherKnopf.disabled = !n;
    abfrageKnopf.disabled = !n;
  };

  const liste = h('ol', { class: 'pruef-liste' });
  const zeichneListe = () => {
    liste.replaceChildren(...karten.map((k, i) =>
      h('li', null,
        h('div', { class: 'pruef-felder' },
          h(istMathe ? 'textarea' : 'input', { type: istMathe ? null : 'text', rows: istMathe ? '2' : null, value: k.front, 'aria-label': `Karte ${i + 1}, Vorderseite`, oninput: (e) => { k.front = e.target.value; zaehlen(); } }, istMathe ? k.front : null),
          h(istMathe ? 'textarea' : 'input', { type: istMathe ? null : 'text', rows: istMathe ? '2' : null, value: k.back, 'aria-label': `Karte ${i + 1}, Rückseite`, oninput: (e) => { k.back = e.target.value; zaehlen(); } }, istMathe ? k.back : null),
          k.note && h('input', { type: 'text', class: 'pruef-notiz', value: k.note, 'aria-label': `Karte ${i + 1}, Hinweis`, oninput: (e) => { k.note = e.target.value; } })),
        h('button', { type: 'button', class: 'knopf-icon', 'aria-label': `Karte ${i + 1} entfernen`, onclick: () => { karten.splice(i, 1); zeichneListe(); zaehlen(); } }, icon('x', 18)))));
  };
  zeichneListe();
  zaehlen();

  if (ui.ziel !== 'neu' && !store.getDeck(ui.ziel)) ui.ziel = 'neu';
  const neuFelder = h('div', { class: 'reihe neu-stapel', hidden: ui.ziel !== 'neu' },
    h('input', { type: 'text', value: ui.neuName, maxlength: '60', 'aria-label': 'Name des neuen Stapels', oninput: (e) => { ui.neuName = e.target.value; } }),
    h('select', { 'aria-label': 'Fach', onchange: (e) => { ui.neuFach = e.target.value; } },
      Object.entries(FAECHER).map(([id, f]) => h('option', { value: id, selected: id === ui.neuFach }, f.name))));
  const zielWahl = h('select', { id: 'ziel', onchange: (e) => { ui.ziel = e.target.value; neuFelder.hidden = ui.ziel !== 'neu'; } },
    h('option', { value: 'neu', selected: ui.ziel === 'neu' }, 'Neuer Stapel'),
    decks.map((d) => h('option', { value: d.id, selected: ui.ziel === d.id }, d.name)));

  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Karten prüfen')),
    h('form', { onsubmit: (e) => {
      e.preventDefault();
      const deck = ui.ziel === 'neu' ? store.addDeck(ui.neuName || ui.ergebnis.titel, ui.neuFach) : store.getDeck(ui.ziel);
      const neu = store.addCards(deck.id, karten);
      toast(`${mehrzahl(neu.length, 'Karte', 'Karten')} in „${deck.name}“ gespeichert.`);
      const art = ui.art;
      zuruecksetzen();
      if (e.submitter?.value === 'abfragen' && neu.length) {
        lernenStarten(ctx, {
          cardIds: neu.map((c) => c.id),
          modus: art === 'vokabeln' && neu.length >= 4 ? 'ankreuzen' : 'umdrehen',
          titel: deck.name,
          danach: () => ctx.go('karten', { deckId: deck.id }),
        });
      } else ctx.go('karten', { deckId: deck.id });
    } },
      h('div', { class: 'blatt' },
        h('p', null, h('strong', null, zaehler), ' Lies einmal drüber – Fehler verbesserst du direkt in den Feldern.'),
        h('div', { class: 'pruef-kopf', 'aria-hidden': 'true' }, h('span', null, istMathe ? 'Aufgabe' : 'Vorderseite'), h('span', null, istMathe ? 'Ergebnis' : 'Rückseite')),
        liste),
      h('div', { class: 'blatt' },
        h('div', { class: 'feld' }, h('label', { for: 'ziel' }, 'Speichern in'), zielWahl),
        neuFelder,
        h('div', { class: 'reihe' },
          abfrageKnopf,
          speicherKnopf,
          h('button', { type: 'button', class: 'knopf', onclick: () => { zuruecksetzen(); ctx.refresh(); } }, 'Verwerfen')))));
}

export function scannen(ctx) {
  if (ctx.optionen?.deckId) ui.ziel = ctx.optionen.deckId;
  if (ui.schritt === 'laden') return ladeSchritt(ctx);
  if (ui.schritt === 'pruefen' && ui.ergebnis) return pruefSchritt(ctx);
  return startSchritt(ctx);
}
