// Themen-Verzeichnis nach Jahrgängen mit Erklärungen
import { h, icon, toast, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { THEMEN, STUFEN, QUELLE } from '../themen-daten.js';
import { kiVerfuegbar, themaKarten } from '../ai.js';
import { mindmap } from './kiextras.js';
import { sprechen, kannSprechen } from '../dom.js';

const FACH_REIHE = ['mathe', 'deutsch', 'englisch', 'franzoesisch', 'spanisch', 'biologie', 'chemie', 'physik', 'geschichte', 'pgw', 'geografie', 'latein', 'informatik'];
const ui = { suche: '', fach: 'alle', stufe: 'alle', offen: null, laden: false };
const liste = THEMEN.map(([fach, stufe, titel, text, beispiel, merke], i) => ({ id: `t${i}`, fach, stufe, titel, text, beispiel, merke }));

const ohneAkzent = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function detail(ctx, t) {
  const f = FAECHER[t.fach];
  return h('article', { class: `thema-detail karteikarte farbe-${f.farbe}` },
    h('div', { class: 'thema-kopfzeile' },
      h('span', { class: 'stapel-fach' }, `${f.name} · Klasse ${t.stufe}`),
      h('button', { class: 'knopf-icon', 'aria-label': 'Schließen', onclick: () => { ui.offen = null; ctx.refresh(); } }, icon('x'))),
    h('h2', { class: 'thema-titel' }, t.titel),
    h('p', { class: 'thema-text' }, t.text),
    h('div', { class: 'thema-beispiel' }, h('strong', null, 'Beispiel'), h('p', null, t.beispiel)),
    h('p', { class: 'thema-merke' }, h('mark', null, 'Merke:'), ' ', t.merke),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf knopf-haupt', disabled: ui.laden, onclick: async () => {
        if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return; }
        ui.laden = true; ctx.refresh();
        try {
          const karten = await themaKarten(t.titel, f.name, t.stufe, `${t.text}\n${t.beispiel}\n${t.merke}`);
          const deck = store.addDeck(t.titel, t.fach);
          store.addCards(deck.id, karten);
          toast(`${mehrzahl(karten.length, 'Übungskarte', 'Übungskarten')} erstellt.`);
          ui.laden = false;
          ctx.go('karten', { deckId: deck.id });
        } catch (e) { ui.laden = false; toast(e.message, 'fehler'); ctx.refresh(); }
      } }, icon('karten', 18), ui.laden ? 'Ich erstelle Übungen …' : 'Übungskarten dazu erstellen'),
      h('button', { class: 'knopf', onclick: () => mindmap(t.titel, `${t.text}\n${t.beispiel}`) }, '🧠 Mindmap'),
      kannSprechen() && h('button', { class: 'knopf', onclick: () => sprechen(`${t.titel}. ${t.text} Beispiel: ${t.beispiel}. Merke: ${t.merke}`, t.fach === 'englisch' && t.stufe === '11/12' ? 'en-GB' : 'de-DE') }, icon('ton', 18), 'Vorlesen'),
      h('a', { class: 'knopf', href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t.titel} ${FAECHER[t.fach].name} erklärt`)}`, target: '_blank', rel: 'noopener' }, '▶️ Erklärvideos'),
      h('button', { class: 'knopf', onclick: () => ctx.go('chat', { frage: `Erklär mir bitte das Thema „${t.titel}“ (${f.name}, Klasse ${t.stufe}) noch einmal ausführlicher, mit einem Beispiel und einer Aufgabe zum Selbermachen.` }) }, icon('chat', 18), 'Lernhelfer fragen')));
}

export function themen(ctx) {
  if (ctx.optionen?.thema) ui.offen = ctx.optionen.thema;
  const q = ohneAkzent(ui.suche.trim());
  const treffer = liste.filter((t) =>
    (ui.fach === 'alle' || t.fach === ui.fach) && (ui.stufe === 'alle' || t.stufe === ui.stufe) &&
    (!q || ohneAkzent(`${t.titel} ${t.text} ${t.beispiel} ${FAECHER[t.fach].name}`).includes(q)));
  const offen = ui.offen && liste.find((t) => t.id === ui.offen);

  const ergebnis = h('div', { class: 'themen-liste' });
  function listeZeichnen() {
    const q2 = ohneAkzent(ui.suche.trim());
    const tr = liste.filter((t) => (ui.fach === 'alle' || t.fach === ui.fach) && (ui.stufe === 'alle' || t.stufe === ui.stufe) && (!q2 || ohneAkzent(`${t.titel} ${t.text} ${t.beispiel} ${FAECHER[t.fach].name}`).includes(q2)));
    const gruppen = FACH_REIHE.map((fach) => [fach, STUFEN.map((st) => [st, tr.filter((t) => t.fach === fach && t.stufe === st)]).filter(([, l]) => l.length)]).filter(([, g]) => g.length);
    ergebnis.replaceChildren(...(gruppen.length ? gruppen.map(([fach, stufen]) =>
      h('section', { class: 'themen-fach' },
        h('h2', null, h('span', { class: `geteilt-punkt farbe-${FAECHER[fach].farbe}` }), FAECHER[fach].name),
        stufen.map(([st, l]) => h('div', { class: 'themen-stufe' },
          h('h3', null, st === '11/12' ? 'Oberstufe (11/12)' : `Klasse ${st}`),
          h('ul', null, l.map((t) => h('li', null, h('button', { class: `themen-zeile ${ui.offen === t.id ? 'ist-offen' : ''}`, onclick: () => { ui.offen = t.id; ctx.refresh(); scrollTo({ top: 0, behavior: 'smooth' }); } },
            h('span', null, t.titel), icon('zurueck', 16))))))))) : [h('div', { class: 'blatt' },
        h('p', null, `Zu „${ui.suche}“ habe ich kein Thema im Verzeichnis.`),
        h('button', { class: 'knopf knopf-haupt', onclick: () => ctx.go('chat', { frage: `Erklär mir bitte das Thema „${ui.suche}“ verständlich, mit Beispiel.` }) }, icon('chat', 18), 'Den Lernhelfer fragen'))]));
  }
  listeZeichnen();

  const chip = (gruppe, wert, text) => h('button', { class: `chip ${ui[gruppe] === wert ? 'ist-aktiv' : ''}`, 'aria-pressed': String(ui[gruppe] === wert), onclick: () => { ui[gruppe] = wert; ctx.refresh(); } }, text);

  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Themen')),
    h('p', { class: 'einleitung' }, `${liste.length} Themen von Klasse 5 bis 12 – mit Erklärung, Beispiel und Merksatz. Aus jedem Thema macht die KI dir Übungskarten.`),
    offen && detail(ctx, offen),
    h('input', { type: 'search', class: 'suche', placeholder: 'Thema suchen, z. B. Pythagoras, if-clauses, Komma', 'aria-label': 'Thema suchen', value: ui.suche, oninput: (e) => { ui.suche = e.target.value; listeZeichnen(); } }),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Fach' }, chip('fach', 'alle', 'Alle Fächer'), FACH_REIHE.map((f) => chip('fach', f, FAECHER[f].name))),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Klasse' }, chip('stufe', 'alle', 'Alle Klassen'), STUFEN.map((s) => chip('stufe', s, s === '11/12' ? 'Oberstufe' : `Klasse ${s}`))),
    treffer && ergebnis,
    h('p', { class: 'hinweis' }, QUELLE));
}
