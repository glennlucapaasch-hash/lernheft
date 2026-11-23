import { h, icon, auswahl, nachfragen, toast, mehrzahl, datumKurz } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { buildLocalExam, gradeLocal, auswerten, shuffle, NOTEN_NAMEN, NOTEN_KOMMENTAR } from '../exam.js';
import { kiVerfuegbar, klausurErzeugen, antwortenBewerten } from '../ai.js';

const ui = {
  phase: 'liste', // 'liste' | 'erstellen' | 'laeuft' | 'bewerten' | 'selbst' | 'ergebnis'
  wahl: { decks: null, anzahl: 10, minuten: 20, quelle: 'ki' },
  klausur: null,
  ki: undefined,
  fehler: '',
  lauf: 0,
};

const punkteText = (p) => `${String(p).replace('.', ',')} ${p === 1 ? 'Punkt' : 'Punkte'}`;
const zeitText = (sek) => `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`;

// ---------- Erstellen ----------
async function erstellen(ctx) {
  const { decks, cards } = store.getState();
  const gewaehlt = decks.filter((d) => ui.wahl.decks.includes(d.id));
  const stoff = cards.filter((c) => ui.wahl.decks.includes(c.deckId));
  const mitKi = ui.wahl.quelle === 'ki' && ui.ki;
  const lauf = ++ui.lauf;
  ui.fehler = '';

  let titel = gewaehlt.length === 1 ? gewaehlt[0].name : 'Gemischte Probeklausur';
  let fragen;
  if (mitKi) {
    ui.phase = 'erstellen';
    ctx.refresh();
    try {
      const material = shuffle(stoff).slice(0, 60).map((c) => ({ fach: FAECHER[store.getDeck(c.deckId).fach].name, front: c.front, back: c.back, note: c.note }));
      const ergebnis = await klausurErzeugen(material, { anzahl: ui.wahl.anzahl, faecher: [...new Set(gewaehlt.map((d) => FAECHER[d.fach].name))] });
      if (lauf !== ui.lauf) return;
      fragen = ergebnis.fragen;
      titel = ergebnis.titel;
    } catch (e) {
      if (lauf !== ui.lauf) return;
      ui.phase = 'liste';
      ui.fehler = `${e?.message || 'Die KI konnte keine Klausur erstellen.'} Du kannst stattdessen „Aus meinen Karten“ wählen.`;
      if (location.hash === '#klausur') ctx.refresh(); else toast(ui.fehler, 'fehler');
      return;
    }
  } else {
    fragen = buildLocalExam(stoff, gewaehlt, { anzahl: ui.wahl.anzahl });
  }

  ui.klausur = {
    id: store.uid(), titel, datum: Date.now(), quelle: mitKi ? 'ki' : 'karten',
    fragen, antworten: {}, ergebnisse: {},
    start: Date.now(), ende: ui.wahl.minuten ? Date.now() + ui.wahl.minuten * 60000 : null,
  };
  ui.phase = 'laeuft';
  if (location.hash === '#klausur') ctx.refresh(); else toast('Deine Probeklausur ist fertig.');
}

// ---------- Abgeben und bewerten ----------
async function abgeben(ctx, { ohneFrage = false } = {}) {
  const k = ui.klausur;
  const leer = k.fragen.filter((f) => !String(k.antworten[f.id] ?? '').trim()).length;
  if (!ohneFrage && leer > 0) {
    const ja = await nachfragen('Jetzt abgeben?', `${leer === 1 ? 'Eine Aufgabe ist' : `${leer} Aufgaben sind`} noch leer.`, 'Trotzdem abgeben');
    if (!ja) return;
  }
  k.dauerSek = Math.round((Date.now() - k.start) / 1000);
  const offen = [];
  for (const f of k.fragen) {
    const r = gradeLocal(f, k.antworten[f.id]);
    if (r) k.ergebnisse[f.id] = r;
    else offen.push(f);
  }
  if (offen.length && ui.ki) {
    ui.phase = 'bewerten';
    ctx.refresh();
    try {
      const urteile = await antwortenBewerten(offen.map((f) => ({ id: f.id, prompt: f.prompt, answer: f.answer, given: k.antworten[f.id], points: f.points })));
      for (const f of offen) if (urteile[f.id]) k.ergebnisse[f.id] = urteile[f.id];
    } catch (e) {
      toast(`${e?.message || 'Die KI konnte nicht bewerten.'} Bewerte die offenen Aufgaben selbst.`, 'fehler');
    }
  }
  fertigOderSelbst(ctx);
}

function fertigOderSelbst(ctx) {
  const k = ui.klausur;
  if (k.fragen.some((f) => !k.ergebnisse[f.id])) {
    ui.phase = 'selbst';
  } else {
    Object.assign(k, auswerten(k.fragen, k.ergebnisse));
    delete k.start; delete k.ende;
    store.saveExam(k);
    ui.phase = 'ergebnis';
  }
  if (location.hash === '#klausur') ctx.refresh();
  scrollTo(0, 0);
}

// ---------- Ansichten ----------
function liste(ctx) {
  const { decks, exams } = store.getState();
  const mitKarten = decks.filter((d) => store.cardsOf(d.id).length > 0);
  const w = ui.wahl;
  if (!w.decks) w.decks = mitKarten.map((d) => d.id);
  w.decks = w.decks.filter((id) => mitKarten.some((d) => d.id === id));

  kiVerfuegbar().then((weg) => {
    if (weg === ui.ki) return;
    ui.ki = weg;
    if (location.hash === '#klausur' && ui.phase === 'liste') ctx.refresh();
  });
  if (!ui.ki && ui.ki !== undefined) w.quelle = 'karten';

  const kartenZahl = () => store.getState().cards.filter((c) => w.decks.includes(c.deckId)).length;
  const startKnopf = h('button', { class: 'knopf knopf-haupt knopf-gross', type: 'submit' }, 'Klausur starten');
  const hinweis = h('p', { class: 'hinweis', role: 'status' });
  const pruefen = () => {
    const n = kartenZahl();
    startKnopf.disabled = n === 0;
    hinweis.textContent = n === 0 ? 'Wähle mindestens einen Stapel mit Karten.'
      : w.quelle === 'karten' && n < w.anzahl ? `In der Auswahl sind nur ${mehrzahl(n, 'Karte', 'Karten')} – die Klausur wird entsprechend kürzer.` : '';
  };
  pruefen();

  const neu = mitKarten.length
    ? h('form', { class: 'blatt', onsubmit: (e) => { e.preventDefault(); erstellen(ctx); } },
        h('h2', null, 'Neue Probeklausur'),
        h('fieldset', null,
          h('legend', null, 'Stoff'),
          h('ul', { class: 'haken-liste' }, mitKarten.map((d) =>
            h('li', null, h('label', null,
              h('input', { type: 'checkbox', checked: w.decks.includes(d.id), onchange: (e) => { w.decks = e.target.checked ? [...w.decks, d.id] : w.decks.filter((x) => x !== d.id); pruefen(); } }),
              h('span', null, d.name), h('small', null, `${FAECHER[d.fach].name}, ${mehrzahl(store.cardsOf(d.id).length, 'Karte', 'Karten')}`)))))),
        h('fieldset', null,
          h('legend', null, 'Aufgaben'),
          auswahl('anzahl', [5, 10, 15, 20].map((n) => ({ wert: n, titel: String(n) })), w.anzahl, (v) => { w.anzahl = Number(v); pruefen(); })),
        h('fieldset', null,
          h('legend', null, 'Zeit'),
          auswahl('minuten', [{ wert: 0, titel: 'Ohne Uhr' }, { wert: 10, titel: '10 Min.' }, { wert: 20, titel: '20 Min.' }, { wert: 45, titel: '45 Min.' }], w.minuten, (v) => { w.minuten = Number(v); })),
        h('fieldset', null,
          h('legend', null, 'Aufgaben kommen von'),
          auswahl('quelle', [
            { wert: 'ki', titel: 'KI', text: ui.ki ? 'Neue Aufgaben zu deinem Stoff: Lückensätze, Rechenaufgaben mit anderen Zahlen' : 'Braucht einen KI-Schlüssel in den Einstellungen', gesperrt: !ui.ki },
            { wert: 'karten', titel: 'Aus meinen Karten', text: 'Übersetzen, ankreuzen und rechnen mit genau deinen Karten' },
          ], w.quelle, (v) => { w.quelle = v; pruefen(); })),
        hinweis,
        startKnopf)
    : h('div', { class: 'blatt leer' },
        h('p', null, 'Für eine Probeklausur brauchst du zuerst Karten. Scanne eine Buchseite oder leg einen Stapel an.'),
        h('div', { class: 'reihe' },
          h('a', { class: 'knopf knopf-haupt', href: '#scannen' }, icon('scan', 18), 'Seite scannen'),
          h('a', { class: 'knopf', href: '#karten' }, 'Zu den Karteikarten')));

  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Probeklausur')),
    ui.fehler && h('div', { class: 'blatt meldung meldung-fehler', role: 'alert' }, h('p', null, ui.fehler)),
    neu,
    exams.length > 0 && h('section', null,
      h('h2', null, 'Bisherige Klausuren'),
      h('ul', { class: 'klausur-liste' }, exams.map((k) =>
        h('li', null, h('button', { class: 'klausur-zeile', onclick: () => { ui.klausur = k; ui.phase = 'ergebnis'; ctx.refresh(); scrollTo(0, 0); } },
          h('span', { class: 'note-klein handschrift', 'aria-label': `Note ${k.note}` }, String(k.note)),
          h('span', { class: 'kl-titel' }, k.titel),
          h('span', { class: 'kl-info' }, `${datumKurz(k.datum)}, ${String(k.punkte).replace('.', ',')} von ${k.max} Punkten`)))))));
}

function wartet(ctx, text, abbrechbar) {
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Probeklausur')),
    h('div', { class: 'blatt warten', role: 'status' },
      h('div', { class: 'stift-laeuft', 'aria-hidden': 'true' }),
      h('p', null, h('strong', null, text)),
      h('p', { class: 'hinweis' }, 'Das dauert meistens unter einer halben Minute.'),
      abbrechbar && h('button', { class: 'knopf', onclick: () => { ui.lauf++; ui.phase = 'liste'; ctx.refresh(); } }, 'Abbrechen')));
}

function laeuft(ctx) {
  const k = ui.klausur;
  const uhr = h('span', { class: 'uhr', role: 'timer' });
  if (k.ende) {
    const tick = () => {
      const rest = Math.max(0, Math.round((k.ende - Date.now()) / 1000));
      uhr.textContent = zeitText(rest);
      uhr.classList.toggle('uhr-knapp', rest <= 120);
      if (rest <= 0) { clearInterval(takt); toast('Die Zeit ist um – deine Klausur wurde abgegeben.'); queueMicrotask(() => abgeben(ctx, { ohneFrage: true })); }
    };
    const takt = setInterval(tick, 1000);
    ctx.onLeave(() => clearInterval(takt));
    tick();
  }
  const max = k.fragen.reduce((s, f) => s + f.points, 0);

  return h('div', { class: 'seite klausur-blatt' },
    h('div', { class: 'klausur-leiste' },
      h('strong', null, k.titel),
      k.ende && h('span', { class: 'uhr-box' }, icon('uhr', 18), uhr),
      h('button', { class: 'knopf knopf-haupt', onclick: () => abgeben(ctx) }, 'Abgeben')),
    h('p', { class: 'hinweis' }, `${mehrzahl(k.fragen.length, 'Aufgabe', 'Aufgaben')}, ${max} Punkte. Viel Erfolg!`),
    h('ol', { class: 'aufgaben' }, k.fragen.map((f, i) => {
      const name = `frage-${f.id}`;
      let eingabe;
      if (f.type === 'mc') {
        eingabe = h('div', { class: 'mc', role: 'radiogroup', 'aria-labelledby': `${name}-t` }, f.options.map((o, j) =>
          h('label', { class: 'mc-zeile' },
            h('input', { type: 'radio', name, value: o, checked: k.antworten[f.id] === o, onchange: () => { k.antworten[f.id] = o; } }),
            h('span', null, o))));
      } else if (f.type === 'text') {
        eingabe = h('input', { type: 'text', class: 'antwort-zeile', value: k.antworten[f.id] || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-labelledby': `${name}-t`, oninput: (e) => { k.antworten[f.id] = e.target.value; } });
      } else {
        eingabe = h('textarea', { class: 'antwort-feld', rows: '4', 'aria-labelledby': `${name}-t`, placeholder: 'Rechenweg und Ergebnis', oninput: (e) => { k.antworten[f.id] = e.target.value; } }, k.antworten[f.id] || '');
      }
      return h('li', null,
        h('div', { class: 'aufgabe-kopf' },
          h('p', { id: `${name}-t`, class: 'aufgabe-text' }, f.prompt),
          h('span', { class: 'aufgabe-punkte' }, `${f.points} P.`)),
        eingabe);
    })),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: () => abgeben(ctx) }, 'Abgeben'),
      h('button', { class: 'knopf knopf-leise', onclick: async () => {
        if (await nachfragen('Klausur verwerfen?', 'Deine Antworten werden nicht gespeichert.', 'Verwerfen', { gefahr: true })) { ui.klausur = null; ui.phase = 'liste'; ctx.refresh(); }
      } }, 'Klausur verwerfen')));
}

function selbst(ctx) {
  const k = ui.klausur;
  const offen = k.fragen.filter((f) => !k.ergebnisse[f.id]);
  const wahl = {};
  const fertig = h('button', { class: 'knopf knopf-haupt knopf-gross', disabled: true, onclick: () => {
    for (const f of offen) k.ergebnisse[f.id] = { awarded: wahl[f.id], feedback: 'Selbst bewertet.' };
    fertigOderSelbst(ctx);
  } }, 'Note anzeigen');
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Selbst bewerten')),
    h('p', { class: 'einleitung' }, 'Diese Antworten kann die App ohne KI nicht sicher prüfen. Vergleiche mit der Lösung und sei ehrlich zu dir.'),
    h('ol', { class: 'aufgaben' }, offen.map((f) =>
      h('li', null,
        h('p', { class: 'aufgabe-text' }, f.prompt),
        h('p', null, h('span', { class: 'etikett' }, 'Deine Antwort'), h('span', { class: 'vor-zeilen' }, k.antworten[f.id])),
        h('p', null, h('span', { class: 'etikett' }, 'Lösung'), h('span', { class: 'vor-zeilen' }, f.answer)),
        f.explanation && h('p', { class: 'hinweis' }, f.explanation),
        auswahl(`selbst-${f.id}`, [
          { wert: 0, titel: 'Falsch', text: '0 Punkte' },
          { wert: f.points / 2, titel: 'Teilweise', text: punkteText(f.points / 2) },
          { wert: f.points, titel: 'Richtig', text: punkteText(f.points) },
        ], undefined, (v) => { wahl[f.id] = Number(v); fertig.disabled = offen.some((x) => wahl[x.id] === undefined); })))),
    fertig);
}

function ergebnis(ctx) {
  const k = ui.klausur;
  const falsche = k.fragen.filter((f) => (k.ergebnisse[f.id]?.awarded ?? 0) < f.points);
  return h('div', { class: 'seite' },
    h('button', { class: 'knopf knopf-leise zurueck', onclick: () => { ui.klausur = null; ui.phase = 'liste'; ctx.refresh(); } }, icon('zurueck', 18), 'Alle Klausuren'),
    h('section', { class: 'blatt zeugnis' },
      h('div', { class: 'note-gross', role: 'img', 'aria-label': `Note ${k.note}, ${NOTEN_NAMEN[k.note]}` },
        h('span', { class: 'handschrift' }, String(k.note))),
      h('div', null,
        h('h1', null, k.titel),
        h('p', { class: 'zeugnis-punkte' }, `${String(k.punkte).replace('.', ',')} von ${k.max} Punkten (${k.prozent} %) – ${NOTEN_NAMEN[k.note]}`),
        h('p', { class: 'handschrift lehrer-kommentar' }, NOTEN_KOMMENTAR[k.note]),
        h('p', { class: 'hinweis' }, `${datumKurz(k.datum)}${k.dauerSek ? `, ${Math.max(1, Math.round(k.dauerSek / 60))} Min` : ''}. Der Notenschlüssel ist ein Richtwert, deine Schule kann anders benoten.`))),
    h('div', { class: 'reihe' },
      falsche.length > 0 && h('button', { class: 'knopf knopf-haupt', onclick: () => {
        const deck = store.getState().decks.find((d) => d.name === 'Fehlerkartei') || store.addDeck('Fehlerkartei', 'sonstiges');
        const schon = new Set(store.cardsOf(deck.id).map((c) => c.front));
        const neu = store.addCards(deck.id, falsche.filter((f) => !schon.has(f.prompt)).map((f) => ({ front: f.prompt, back: f.answer, note: f.explanation })));
        toast(neu.length ? `${mehrzahl(neu.length, 'Karte', 'Karten')} in die Fehlerkartei gelegt.` : 'Diese Aufgaben liegen schon in der Fehlerkartei.');
      } }, icon('karten', 18), 'Fehler als Karten üben'),
      h('button', { class: 'knopf', onclick: () => { ui.klausur = null; ui.phase = 'liste'; ctx.refresh(); } }, 'Neue Probeklausur'),
      h('button', { class: 'knopf knopf-leise', onclick: async () => {
        if (await nachfragen('Klausur löschen?', 'Das Ergebnis verschwindet aus deiner Liste.', 'Löschen', { gefahr: true })) { store.deleteExam(k.id); ui.klausur = null; ui.phase = 'liste'; ctx.refresh(); }
      } }, 'Löschen')),
    h('h2', null, 'Deine Antworten'),
    h('ol', { class: 'aufgaben korrektur' }, k.fragen.map((f) => {
      const r = k.ergebnisse[f.id] || { awarded: 0, feedback: '' };
      const art = r.awarded >= f.points ? 'richtig' : r.awarded > 0 ? 'fast' : 'falsch';
      const zeichen = { richtig: 'check', fast: 'halb', falsch: 'x' }[art];
      const wort = { richtig: 'Richtig', fast: 'Teilweise richtig', falsch: 'Falsch' }[art];
      const gegeben = String(k.antworten[f.id] ?? '').trim();
      return h('li', { class: `korr-${art}` },
        h('div', { class: 'aufgabe-kopf' },
          h('p', { class: 'aufgabe-text' }, f.prompt),
          h('span', { class: `aufgabe-punkte urteil-marke urteil-${art}` }, icon(zeichen, 16), h('span', { class: 'nur-vorlesen' }, `${wort}: `), `${String(r.awarded).replace('.', ',')} / ${f.points}`)),
        h('p', null, h('span', { class: 'etikett' }, 'Deine Antwort'), h('span', { class: 'vor-zeilen' }, gegeben || '–')),
        art !== 'richtig' && h('p', null, h('span', { class: 'etikett' }, 'Lösung'), h('span', { class: 'vor-zeilen' }, f.answer)),
        r.feedback && h('p', { class: 'handschrift korr-kommentar' }, r.feedback),
        art !== 'richtig' && f.explanation && h('p', { class: 'hinweis' }, f.explanation));
    })));
}

export function klausur(ctx) {
  if (ctx.optionen?.neu && (ui.phase === 'ergebnis' || ui.phase === 'liste')) { ui.klausur = null; ui.phase = 'liste'; }
  if (ui.phase === 'erstellen') return wartet(ctx, 'Ich stelle deine Klausur zusammen …', true);
  if (ui.phase === 'bewerten') return wartet(ctx, 'Ich korrigiere deine Antworten …', false);
  if (ui.klausur && ui.phase === 'laeuft') return laeuft(ctx);
  if (ui.klausur && ui.phase === 'selbst') return selbst(ctx);
  if (ui.klausur && ui.phase === 'ergebnis') return ergebnis(ctx);
  ui.phase = 'liste';
  return liste(ctx);
}
