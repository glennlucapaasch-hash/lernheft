// Hausaufgaben, Stundenplan, Formelsammlung
import { h, icon, modal, feld, toast, nachfragen, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { kiVerfuegbar, bildVorbereiten, stundenplanErkennen } from '../ai.js';

const fachWahl = (aktuell) => h('select', { 'aria-label': 'Fach' }, Object.entries(FAECHER).map(([id, f]) => h('option', { value: id, selected: id === aktuell }, f.name)));
const heuteIso = () => new Date().toISOString().slice(0, 10);
const tagText = (iso) => {
  const d = new Date(`${iso}T00:00:00`); const h0 = new Date(); h0.setHours(0, 0, 0, 0);
  const t = Math.round((d - h0) / 864e5);
  return t === 0 ? 'heute' : t === 1 ? 'morgen' : t === -1 ? 'gestern' : t < 0 ? `vor ${-t} Tagen` : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
};

// ---------------- Hausaufgaben ----------------
function aufgabeDialog(ctx, a) {
  const text = h('textarea', { rows: '2', maxlength: '300', placeholder: 'z. B. Workbook S. 24, Nr. 3–5' }, a?.text || '');
  const fach = fachWahl(a?.fach || 'englisch');
  const bis = h('input', { type: 'date', value: a?.bis || (() => { const d = new Date(Date.now() + 864e5); return d.toISOString().slice(0, 10); })() });
  const zu = modal(a ? 'Hausaufgabe bearbeiten' : 'Neue Hausaufgabe', h('form', { onsubmit: (e) => {
    e.preventDefault();
    if (!text.value.trim()) { text.focus(); return; }
    const s = store.getState();
    const neu = { id: a?.id || store.uid(), text: text.value.trim(), fach: fach.value, bis: bis.value, erledigt: a?.erledigt || false };
    s.hausaufgaben = a ? s.hausaufgaben.map((x) => (x.id === a.id ? neu : x)) : [...s.hausaufgaben, neu];
    store.save(); zu(); ctx.refresh();
  } }, feld('Was ist zu tun?', text), feld('Fach', fach), feld('Bis wann?', bis),
    h('div', { class: 'reihe reihe-ende' },
      a && h('button', { type: 'button', class: 'knopf knopf-gefahr-leise', onclick: () => { store.getState().hausaufgaben = store.getState().hausaufgaben.filter((x) => x.id !== a.id); store.save(); zu(); ctx.refresh(); } }, 'Löschen'),
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern'))));
  queueMicrotask(() => text.focus());
}
export function offeneHausaufgaben() {
  return store.getState().hausaufgaben.filter((a) => !a.erledigt).sort((a, b) => a.bis.localeCompare(b.bis));
}
export function hausaufgaben(ctx) {
  const s = store.getState();
  const offen = offeneHausaufgaben();
  const erledigt = s.hausaufgaben.filter((a) => a.erledigt).sort((a, b) => b.bis.localeCompare(a.bis)).slice(0, 15);
  const zeile = (a) => h('li', { class: `ha ${a.erledigt ? 'ist-erledigt' : ''} ${!a.erledigt && a.bis < heuteIso() ? 'ist-ueberfaellig' : ''}` },
    h('input', { type: 'checkbox', checked: a.erledigt, 'aria-label': `${a.text} erledigt`, onchange: (e) => { a.erledigt = e.target.checked; store.save(); if (a.erledigt) toast('✅ Erledigt!'); ctx.refresh(); } }),
    h('button', { class: 'ha-text', onclick: () => aufgabeDialog(ctx, a) },
      h('span', null, a.text),
      h('small', null, h('span', { class: `geteilt-punkt farbe-${FAECHER[a.fach]?.farbe}` }), `${FAECHER[a.fach]?.name} · bis ${tagText(a.bis)}`)));
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Hausaufgaben'),
      h('button', { class: 'knopf knopf-haupt', onclick: () => aufgabeDialog(ctx) }, icon('plus', 18), 'Neue Aufgabe')),
    offen.length ? h('ul', { class: 'ha-liste' }, offen.map(zeile)) : h('div', { class: 'blatt leer' }, h('p', null, '🎉 Alles erledigt! Neue Aufgaben trägst du mit „Neue Aufgabe“ ein – fällige erscheinen auf der Startseite und in der Erinnerung.')),
    erledigt.length > 0 && h('details', null, h('summary', null, `Erledigt (${erledigt.length})`), h('ul', { class: 'ha-liste' }, erledigt.map(zeile))));
}

// ---------------- Stundenplan ----------------
export const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
export function faecherAm(datum) {
  const t = datum.getDay();
  if (t === 0 || t === 6) return [];
  return store.getState().stundenplan.tage[t - 1] || [];
}
export function morgenDran() {
  const d = new Date();
  do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  return { datum: d, faecher: [...new Set(faecherAm(d))] };
}
const plan = { laeuft: false };
export function stundenplan(ctx) {
  const s = store.getState();
  const datei = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return; }
    plan.laeuft = true; ctx.refresh();
    try {
      const tage = await stundenplanErkennen([await bildVorbereiten(f)], Object.keys(FAECHER));
      if (await nachfragen('Stundenplan übernehmen?', tage.map((t, i) => `${WOCHENTAGE[i]}: ${t.map((x) => FAECHER[x]?.name).join(', ') || '–'}`).join('\n'), 'Übernehmen')) {
        s.stundenplan = { tage }; store.save(); toast('Stundenplan gespeichert.');
      }
    } catch (err) { toast(err.message, 'fehler'); }
    plan.laeuft = false; ctx.refresh();
  } });
  const morgen = morgenDran();
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Stundenplan'),
      h('div', { class: 'reihe' }, datei, plan.laeuft ? h('span', { class: 'pruef-laeuft' }, 'Ich lese den Plan …') : h('button', { class: 'knopf', onclick: () => datei.click() }, icon('scan', 18), 'Plan scannen'))),
    morgen.faecher.length > 0 && h('div', { class: 'blatt meldung' }, h('p', null, h('strong', null, `${morgen.datum.toLocaleDateString('de-DE', { weekday: 'long' })}: `), morgen.faecher.map((f) => FAECHER[f]?.name).join(', '))),
    h('div', { class: 'stundenplan' }, WOCHENTAGE.map((tag, i) => h('section', { class: 'sp-tag' },
      h('h2', null, tag),
      h('ol', null, (s.stundenplan.tage[i] || []).map((f, j) => h('li', { class: `sp-fach farbe-${FAECHER[f]?.farbe || 'weiss'}` },
        h('span', null, FAECHER[f]?.name || f),
        h('button', { class: 'knopf-icon', 'aria-label': `${FAECHER[f]?.name} entfernen`, onclick: () => { s.stundenplan.tage[i].splice(j, 1); store.save(); ctx.refresh(); } }, icon('x', 14))))),
      h('select', { class: 'sp-dazu', 'aria-label': `Fach am ${tag} hinzufügen`, onchange: (e) => { if (e.target.value) { s.stundenplan.tage[i].push(e.target.value); store.save(); ctx.refresh(); } } },
        h('option', { value: '' }, '+ Fach'), Object.entries(FAECHER).map(([id, f]) => h('option', { value: id }, f.name)))))),
    h('p', { class: 'hinweis' }, 'Die Startseite zeigt dir, welche Fächer morgen dran sind, und schlägt passende Wiederholungen vor.'));
}

// ---------------- Formelsammlung ----------------
const FORMELN = [
  ['Mathe', 'Flächen', 'Rechteck', 'A = a · b,  u = 2a + 2b'], ['Mathe', 'Flächen', 'Dreieck', 'A = ½ · g · h'], ['Mathe', 'Flächen', 'Trapez', 'A = ½ · (a + c) · h'],
  ['Mathe', 'Flächen', 'Kreis', 'A = π · r²,  u = 2 · π · r'], ['Mathe', 'Körper', 'Quader', 'V = a · b · c,  O = 2(ab + ac + bc)'], ['Mathe', 'Körper', 'Zylinder', 'V = π · r² · h,  M = 2 · π · r · h'],
  ['Mathe', 'Körper', 'Kegel / Pyramide', 'V = ⅓ · G · h'], ['Mathe', 'Körper', 'Kugel', 'V = 4/3 · π · r³,  O = 4 · π · r²'],
  ['Mathe', 'Algebra', 'Binomische Formeln', '(a + b)² = a² + 2ab + b²   (a − b)² = a² − 2ab + b²   (a + b)(a − b) = a² − b²'],
  ['Mathe', 'Algebra', 'pq-Formel', 'x² + px + q = 0  →  x = −p/2 ± √((p/2)² − q)'], ['Mathe', 'Algebra', 'Potenzgesetze', 'aᵐ · aⁿ = aᵐ⁺ⁿ,  aᵐ : aⁿ = aᵐ⁻ⁿ,  (aᵐ)ⁿ = aᵐⁿ,  a⁻ⁿ = 1/aⁿ'],
  ['Mathe', 'Funktionen', 'Lineare Funktion', 'y = m · x + b,  m = (y₂ − y₁) : (x₂ − x₁)'], ['Mathe', 'Funktionen', 'Scheitelpunktform', 'y = a(x − d)² + e,  Scheitel S(d|e)'],
  ['Mathe', 'Geometrie', 'Pythagoras', 'a² + b² = c²  (c = Hypotenuse)'], ['Mathe', 'Geometrie', 'Trigonometrie', 'sin α = G/H,  cos α = A/H,  tan α = G/A'],
  ['Mathe', 'Prozent', 'Prozentwert', 'W = G · p/100,  Zinseszins: Kₙ = K₀ · (1 + p/100)ⁿ'], ['Mathe', 'Analysis', 'Ableitungsregeln', '(xⁿ)′ = n·xⁿ⁻¹,  (u·v)′ = u′v + uv′,  (f(g(x)))′ = f′(g(x))·g′(x)'],
  ['Mathe', 'Stochastik', 'Binomialverteilung', 'P(X = k) = (n über k) · pᵏ · (1 − p)ⁿ⁻ᵏ,  μ = n·p,  σ = √(n·p·(1 − p))'],
  ['Physik', 'Mechanik', 'Geschwindigkeit', 'v = s : t   (1 m/s = 3,6 km/h)'], ['Physik', 'Mechanik', 'Gewichtskraft', 'F = m · g,  g ≈ 9,81 N/kg'], ['Physik', 'Mechanik', 'Dichte', 'ρ = m : V'],
  ['Physik', 'Mechanik', 'Druck', 'p = F : A'], ['Physik', 'Energie', 'Lage- und Bewegungsenergie', 'E = m · g · h,  E = ½ · m · v²'], ['Physik', 'Energie', 'Leistung', 'P = E : t = U · I'],
  ['Physik', 'Elektrik', 'Ohmsches Gesetz', 'U = R · I'], ['Physik', 'Elektrik', 'Reihen- und Parallelschaltung', 'Reihe: R = R₁ + R₂   Parallel: 1/R = 1/R₁ + 1/R₂'],
  ['Physik', 'Wellen', 'Wellengleichung', 'c = λ · f'], ['Chemie', 'Grundlagen', 'Stoffmenge', 'n = m : M'], ['Chemie', 'Grundlagen', 'Konzentration', 'c = n : V'],
  ['Chemie', 'Säuren und Basen', 'pH-Wert', 'pH = −log c(H₃O⁺);  pH < 7 sauer, 7 neutral, > 7 basisch'], ['Chemie', 'Gase', 'Molares Volumen', 'Vₘ ≈ 22,4 L/mol (0 °C, 1013 hPa)'],
];
const formelUi = { suche: '' };
export function formeln(ctx) {
  const liste = h('div', { class: 'formeln' });
  const zeigen = () => {
    const q = formelUi.suche.trim().toLowerCase();
    const tr = FORMELN.filter((f) => !q || f.join(' ').toLowerCase().includes(q));
    const gruppen = [...new Set(tr.map((f) => `${f[0]} · ${f[1]}`))];
    liste.replaceChildren(...(tr.length ? gruppen.map((g) => h('section', null, h('h2', null, g), h('ul', { class: 'formel-liste' }, tr.filter((f) => `${f[0]} · ${f[1]}` === g).map((f) => h('li', null, h('strong', null, f[2]), h('code', null, f[3])))))) : [h('p', { class: 'hinweis' }, 'Keine Formel gefunden.')]));
  };
  zeigen();
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Formelsammlung')),
    h('input', { type: 'search', class: 'suche', placeholder: 'Formel suchen, z. B. Kreis, Ohm, pH', 'aria-label': 'Formel suchen', value: formelUi.suche, oninput: (e) => { formelUi.suche = e.target.value; zeigen(); } }),
    liste);
}
