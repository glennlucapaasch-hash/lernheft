import { h, mehrzahl, datumKurz } from '../dom.js';
import * as store from '../store.js';
import { STUFEN, STUFEN_NAMEN } from '../srs.js';

function tageDiagramm() {
  const tage = store.letzteTage(14);
  const max = Math.max(...tage.map((t) => t.abfragen), 1);
  const summe = tage.reduce((s, t) => s + t.abfragen, 0);
  const tagName = (d) => d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  const tagLang = (d) => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const text = (t) => (t.abfragen ? `${tagLang(t.datum)}: ${mehrzahl(t.abfragen, 'Abfrage', 'Abfragen')}, davon ${t.richtig} gewusst` : `${tagLang(t.datum)}: nicht gelernt`);
  const ablesen = h('p', { class: 'diagramm-ablesen', 'aria-live': 'polite' }, summe ? 'Tipp auf einen Balken für die genauen Zahlen.' : 'Noch keine Abfragen in den letzten 14 Tagen.');
  const spitze = tage.reduce((a, b) => (b.abfragen > a.abfragen ? b : a), tage[0]);

  return h('section', { class: 'blatt' },
    h('h2', null, 'Abfragen in den letzten 14 Tagen'),
    h('div', { class: 'balken', role: 'list' }, tage.map((t, i) =>
      h('button', { class: `balken-spalte ${i === tage.length - 1 ? 'ist-heute' : ''}`, role: 'listitem', 'aria-label': text(t), onmouseenter: () => { ablesen.textContent = text(t); }, onfocus: () => { ablesen.textContent = text(t); }, onclick: () => { ablesen.textContent = text(t); } },
        h('span', { class: 'balken-wert' }, t.abfragen && (t === spitze || i === tage.length - 1) ? String(t.abfragen) : ''),
        h('span', { class: 'balken-bahn' }, t.abfragen > 0 && h('span', { class: 'balken-fuellung', style: { height: `${Math.max(4, (t.abfragen / max) * 100)}%` } })),
        h('span', { class: 'balken-tag' }, i === tage.length - 1 ? 'heute' : i % 2 === 1 ? tagName(t.datum) : '')))),
    ablesen,
    h('details', { class: 'tabelle-auf' },
      h('summary', null, 'Als Tabelle zeigen'),
      h('table', null,
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Tag'), h('th', { scope: 'col' }, 'Abfragen'), h('th', { scope: 'col' }, 'Gewusst'))),
        h('tbody', null, tage.slice().reverse().map((t) =>
          h('tr', null, h('th', { scope: 'row' }, t.datum.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })), h('td', null, String(t.abfragen)), h('td', null, String(t.richtig))))))));
}

function stufenDiagramm() {
  const z = store.stufenZahlen();
  const gesamt = STUFEN.reduce((s, k) => s + z[k], 0);
  if (!gesamt) return null;
  return h('section', { class: 'blatt' },
    h('h2', null, 'Wie sicher sitzen deine Karten?'),
    h('div', { class: 'stufen' },
      h('div', { class: 'stufen-balken stufen-hoch', role: 'img', 'aria-label': STUFEN.map((k) => `${STUFEN_NAMEN[k]}: ${z[k]}`).join(', ') },
        STUFEN.filter((k) => z[k]).map((k) => h('span', { class: `stufe-${k}`, title: `${STUFEN_NAMEN[k]}: ${z[k]}`, style: { flexGrow: String(z[k]) } }))),
      h('ul', { class: 'stufen-legende' }, STUFEN.map((k) =>
        h('li', null, h('span', { class: `stufen-punkt stufe-${k}` }), `${STUFEN_NAMEN[k]} `, h('b', null, String(z[k])))))),
    h('p', { class: 'hinweis' }, '„Sicher“ heißt: Du hast die Karte mehrmals gewusst und sie kommt erst in drei Wochen oder später wieder.'));
}

export function statistik() {
  const s = store.getState();
  const serie = store.streak();
  const heute = store.heute();
  const alle = Object.values(s.log).reduce((a, t) => ({ abfragen: a.abfragen + (t.abfragen || 0), richtig: a.richtig + (t.richtig || 0) }), { abfragen: 0, richtig: 0 });
  const quote = alle.abfragen ? Math.round((alle.richtig / alle.abfragen) * 100) : null;

  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Statistik')),
    h('dl', { class: 'zahlen' },
      h('div', null, h('dt', null, 'Lernserie'), h('dd', null, mehrzahl(serie, 'Tag', 'Tage'))),
      h('div', null, h('dt', null, 'Heute abgefragt'), h('dd', null, String(heute.abfragen))),
      h('div', null, h('dt', null, 'Karten insgesamt'), h('dd', null, String(s.cards.length))),
      h('div', null, h('dt', null, 'Gewusst'), h('dd', null, quote === null ? '–' : `${quote} %`))),
    tageDiagramm(),
    stufenDiagramm(),
    s.exams.length > 0 && h('section', { class: 'blatt' },
      h('h2', null, 'Probeklausuren'),
      h('table', { class: 'noten-tabelle' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Datum'), h('th', { scope: 'col' }, 'Klausur'), h('th', { scope: 'col' }, 'Punkte'), h('th', { scope: 'col' }, 'Note'))),
        h('tbody', null, s.exams.map((k) =>
          h('tr', null, h('td', null, datumKurz(k.datum)), h('td', null, k.titel), h('td', null, `${String(k.punkte).replace('.', ',')} / ${k.max}`), h('td', null, h('b', null, String(k.note)))))))));
}
