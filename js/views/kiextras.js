// Oberflächen für KI-Extras: Zusammenfassung, Lückentext, Sätze üben, Mindmap, Wortfelder
import { h, icon, toast, modal, mehrzahl, sprechen, kannSprechen } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { kiVerfuegbar, notizZusammenfassen, lueckentextErzeugen, saetzeErzeugen, mindmapErzeugen, wortfelderBilden } from '../ai.js';
import { checkAnswer } from '../check.js';

async function mitKi(text, fn) {
  if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return null; }
  const warte = modal('Einen Moment', h('div', { class: 'warten', role: 'status' }, h('p', null, h('strong', null, text))));
  try { return await fn(); } catch (e) { toast(e.message || 'Das hat nicht geklappt.', 'fehler'); return null; } finally { warte(); }
}

// ---------- Notiz: Zusammenfassung ----------
export async function zusammenfassung(ctx, n, bilder) {
  const r = await mitKi('Ich fasse deine Notiz zusammen …', () => notizZusammenfassen(bilder, n.text));
  if (!r) return;
  modal(r.titel || 'Zusammenfassung', [
    h('div', { class: 'zusammenfassung' }, r.text),
    h('div', { class: 'reihe reihe-ende' },
      kannSprechen() && h('button', { class: 'knopf', onclick: () => sprechen(r.text, 'de-DE') }, icon('ton', 18), 'Vorlesen'),
      h('button', { class: 'knopf knopf-haupt', onclick: (e) => { n.text = `${n.text ? `${n.text}\n\n` : ''}${r.text}`; n.geaendert = Date.now(); store.save(); toast('In „Getippter Text“ der Notiz eingefügt.'); e.currentTarget.disabled = true; } }, 'In die Notiz übernehmen')),
  ]);
}

// ---------- Notiz: Lückentext ----------
export async function lueckentext(ctx, n, bilder) {
  const saetze = await mitKi('Ich baue einen Lückentext …', () => lueckentextErzeugen(bilder, n.text));
  if (!saetze) return;
  if (!saetze.length) { toast('Aus der Notiz konnte ich keinen Lückentext machen.', 'fehler'); return; }
  const felder = [];
  const ergebnis = h('p', { class: 'luecken-ergebnis', role: 'status' });
  modal('Lückentext', [
    h('ol', { class: 'luecken' }, saetze.map((s) => {
      const [vor, nach] = s.satz.split('___');
      const inp = h('input', { type: 'text', class: 'luecke', 'aria-label': 'Lücke', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', style: `width:${Math.max(5, s.loesung.length + 2)}ch` });
      felder.push([inp, s.loesung]);
      return h('li', null, vor, inp, nach);
    })),
    ergebnis,
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', onclick: () => {
      let richtig = 0;
      for (const [inp, l] of felder) {
        const u = checkAnswer(inp.value, l);
        inp.classList.remove('ist-richtig', 'ist-falsch');
        inp.classList.add(u === 'falsch' ? 'ist-falsch' : 'ist-richtig');
        if (u !== 'falsch') richtig += 1; else inp.title = `Richtig: ${l}`;
        if (u === 'falsch') inp.value = `${inp.value} → ${l}`;
      }
      ergebnis.textContent = `${richtig} von ${felder.length} richtig.`;
    } }, 'Prüfen')),
  ]);
}

// ---------- Stapel: Sätze üben ----------
export async function saetzeUeben(ctx, deck) {
  const fach = FAECHER[deck.fach];
  const vok = store.cardsOf(deck.id).filter((c) => c.front && c.back).sort(() => Math.random() - 0.5).slice(0, 8);
  if (vok.length < 2) { toast('Dafür braucht der Stapel mindestens 2 Karten.', 'fehler'); return; }
  const saetze = await mitKi('Ich schreibe Beispielsätze …', () => saetzeErzeugen(vok, fach.sprache ? `${fach.sprache.replace(/e$/, '')}` : 'der Fremdsprache'));
  if (!saetze?.length) return;
  let i = 0;
  const inhalt = h('div', { class: 'saetze' });
  const zeigen = () => {
    if (i >= saetze.length) { inhalt.replaceChildren(h('p', { class: 'handschrift ende-spruch' }, 'Geschafft!'), h('p', null, `${mehrzahl(saetze.length, 'Satz', 'Sätze')} übersetzt.`)); return; }
    const s = saetze[i];
    const eingabe = h('textarea', { rows: '2', placeholder: 'Deine Übersetzung', 'aria-label': 'Deine Übersetzung' });
    const loesung = h('div', { class: 'satz-loesung', hidden: true },
      h('p', null, h('strong', null, 'Musterlösung: '), s.fremd, fach.lang && kannSprechen() && h('button', { class: 'knopf-icon', 'aria-label': 'Vorlesen', onclick: () => sprechen(s.fremd, fach.lang) }, icon('ton', 18))),
      h('p', { class: 'hinweis' }, 'Vergleich selbst – andere richtige Formulierungen zählen auch.'),
      h('button', { class: 'knopf knopf-haupt', onclick: () => { i += 1; zeigen(); } }, 'Nächster Satz'));
    inhalt.replaceChildren(
      h('p', { class: 'hinweis' }, `Satz ${i + 1} von ${saetze.length} – übersetze in die Fremdsprache:`),
      h('p', { class: 'satz-deutsch' }, s.deutsch),
      eingabe,
      h('button', { class: 'knopf', onclick: (e) => { loesung.hidden = false; e.currentTarget.hidden = true; } }, 'Lösung zeigen'),
      loesung);
    eingabe.focus();
  };
  zeigen();
  modal(`Sätze üben – ${deck.name}`, inhalt);
}

// ---------- Stapel: Wortfelder ----------
export async function wortfelder(ctx, deck) {
  const karten = store.cardsOf(deck.id).filter((c) => c.front && c.back);
  if (karten.length < 6) { toast('Dafür braucht der Stapel mindestens 6 Karten.', 'fehler'); return; }
  const gruppen = await mitKi('Ich sortiere nach Wortfeldern …', () => wortfelderBilden(karten.slice(0, 120)));
  if (!gruppen?.length) return;
  modal('Wortfelder', [
    h('ul', { class: 'wortfelder' }, gruppen.map((g) => h('li', null, h('strong', null, `${g.name} (${g.karten.length})`), h('small', null, g.karten.map((c) => c.front).join(', '))))),
    h('p', { class: 'hinweis' }, 'Als eigene kleine Stapel übernehmen? Der ursprüngliche Stapel bleibt, die Karten werden kopiert (mit frischem Lernstand).'),
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', onclick: (e) => {
      for (const g of gruppen) { const d = store.addDeck(`${deck.name}: ${g.name}`, deck.fach); store.addCards(d.id, g.karten.map(({ front, back, note }) => ({ front, back, note }))); }
      toast(`${mehrzahl(gruppen.length, 'Stapel', 'Stapel')} angelegt.`); e.currentTarget.disabled = true;
    } }, 'Als Stapel anlegen')),
  ]);
}

// ---------- Themen: Mindmap ----------
export async function mindmap(thema, kontext) {
  const m = await mitKi('Ich zeichne die Mindmap …', () => mindmapErzeugen(thema, kontext));
  if (!m?.aeste?.length) return;
  const W = 900, H = 640, cx = W / 2, cy = H / 2;
  const farben = ['#2440b3', '#c4273c', '#17784a', '#d4700a', '#7a3cc4', '#0b7a8a', '#8a5a00'];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'mindmap');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Mindmap ${m.zentrum}: ${m.aeste.map((a) => `${a.name} (${a.punkte.join(', ')})`).join('; ')}`);
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; svg.append(e); return e; };
  m.aeste.forEach((a, i) => {
    const w = (i / m.aeste.length) * Math.PI * 2 - Math.PI / 2;
    const ax = cx + Math.cos(w) * 210, ay = cy + Math.sin(w) * 170;
    const f = farben[i % farben.length];
    el('path', { d: `M${cx},${cy} Q${cx + Math.cos(w) * 100},${cy + Math.sin(w) * 60} ${ax},${ay}`, stroke: f, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', class: 'mm-ast', style: `animation-delay:${i * 0.12}s` });
    a.punkte.forEach((p, j) => {
      const w2 = w + (j - (a.punkte.length - 1) / 2) * 0.32;
      const px = cx + Math.cos(w2) * 330, py = cy + Math.sin(w2) * 255;
      el('line', { x1: ax, y1: ay, x2: px, y2: py, stroke: f, 'stroke-width': 2, opacity: 0.6, class: 'mm-ast', style: `animation-delay:${0.4 + i * 0.12}s` });
      el('text', { x: px, y: py + (Math.sin(w2) > 0.3 ? 14 : Math.sin(w2) < -0.3 ? -6 : 4), 'text-anchor': Math.cos(w2) > 0.3 ? 'start' : Math.cos(w2) < -0.3 ? 'end' : 'middle', class: 'mm-punkt', style: `animation-delay:${0.6 + i * 0.12}s` }, p);
    });
    el('rect', { x: ax - 75, y: ay - 18, width: 150, height: 36, rx: 18, fill: f, class: 'mm-knoten', style: `animation-delay:${0.2 + i * 0.12}s` });
    el('text', { x: ax, y: ay + 6, 'text-anchor': 'middle', fill: '#fff', class: 'mm-ast-text', style: `animation-delay:${0.2 + i * 0.12}s` }, a.name.length > 18 ? `${a.name.slice(0, 17)}…` : a.name);
  });
  el('ellipse', { cx, cy, rx: 110, ry: 44, fill: '#ffe14d', stroke: '#1b2a5c', 'stroke-width': 3, class: 'mm-knoten' });
  el('text', { x: cx, y: cy + 7, 'text-anchor': 'middle', class: 'mm-zentrum' }, m.zentrum.length > 22 ? `${m.zentrum.slice(0, 21)}…` : m.zentrum);
  modal(`Mindmap: ${m.zentrum}`, [h('div', { class: 'mindmap-rahmen' }, svg), h('p', { class: 'hinweis' }, 'Tipp: Mach einen Screenshot, um die Mindmap zu behalten.')]);
}
