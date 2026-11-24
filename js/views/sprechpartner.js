// KI-Sprechpartner: echtes Gespräch in der Fremdsprache – KI spricht, du antwortest per Mikrofon (oder tippst).
import { h, icon, toast, sprechen } from '../dom.js';
import * as store from '../store.js';
import { kiVerfuegbar, gespraechAntwort, gespraechFeedback } from '../ai.js';
import { hoeren, kannHoeren, stopHoeren } from '../sprache.js';

const SPRACHEN = { en: { name: 'Englisch', wort: 'Englisch', lang: 'en-GB', flagge: '🇬🇧' }, fr: { name: 'Französisch', wort: 'Französisch', lang: 'fr-FR', flagge: '🇫🇷' }, es: { name: 'Spanisch', wort: 'Spanisch', lang: 'es-ES', flagge: '🇪🇸' } };
const SZENEN = [
  { id: 'kennen', emoji: '👋', titel: 'Neue Leute kennenlernen', text: 'Du triffst einen Austauschschüler. Er stellt sich vor und fragt dich nach Hobbys, Familie und Schule.' },
  { id: 'cafe', emoji: '☕', titel: 'Im Café bestellen', text: 'Du bist Gast in einem Café, die KI ist die Bedienung.' },
  { id: 'weg', emoji: '🗺️', titel: 'Nach dem Weg fragen', text: 'Du bist Tourist in einer fremden Stadt und fragst eine Passantin nach dem Weg.' },
  { id: 'shopping', emoji: '🛍️', titel: 'Klamotten kaufen', text: 'Du bist in einem Kleidungsgeschäft, die KI ist Verkäufer.' },
  { id: 'urlaub', emoji: '🏖️', titel: 'Über Ferien reden', text: 'Ein Freund fragt dich, was du in den letzten Ferien gemacht hast und was du als Nächstes vorhast.' },
  { id: 'pruefung', emoji: '🎓', titel: 'Mündliche Prüfung', text: 'Die KI ist Prüferin in einer mündlichen Prüfung und stellt Fragen zu Alltag, Meinung und Zukunftsplänen.' },
  { id: 'frei', emoji: '💬', titel: 'Freies Gespräch', text: 'Ein lockeres Gespräch über ein Thema deiner Wahl.' },
];
const NIVEAUS = { leicht: 'Anfänger (Klasse 5–7, sehr einfache Sätze)', mittel: 'Mittelstufe (Klasse 8–10)', schwer: 'Oberstufe (Klasse 11–12, auch Meinungen begründen)' };

const ui = { sprache: 'en', szene: null, niveau: 'mittel', verlauf: [], laeuft: false, hoert: false, denkt: false, zwischen: '', feedback: null };

function standardSprache() {
  const f = new Set(store.getState().decks.map((d) => d.fach));
  return f.has('englisch') ? 'en' : f.has('franzoesisch') ? 'fr' : f.has('spanisch') ? 'es' : 'en';
}

async function kiSagt(ctx) {
  const sp = SPRACHEN[ui.sprache];
  const szene = SZENEN.find((s) => s.id === ui.szene);
  ui.denkt = true; ctx.refresh();
  try {
    const nachrichten = [{ role: 'user', text: '(Beginne jetzt das Gespräch mit dem ersten Satz deiner Rolle.)' }, ...ui.verlauf];
    const t = await gespraechAntwort(nachrichten, { sprache: sp.wort, szene: szene.text, niveau: NIVEAUS[ui.niveau] });
    ui.verlauf.push({ role: 'assistant', text: t });
    sprechen(t, sp.lang);
  } catch (e) { toast(e.message, 'fehler'); }
  ui.denkt = false; ctx.refresh();
}

async function ichSage(ctx, text) {
  if (!text.trim()) return;
  ui.verlauf.push({ role: 'user', text: text.trim() });
  await kiSagt(ctx);
}

async function zuhoeren(ctx) {
  if (ui.hoert) { stopHoeren(); return; }
  try { globalThis.speechSynthesis?.cancel(); } catch { /* egal */ }
  ui.hoert = true; ui.zwischen = ''; ctx.refresh();
  try {
    const r = await hoeren(SPRACHEN[ui.sprache].lang, { onZwischen: (t) => { ui.zwischen = t; const z = document.querySelector('.sp-zwischen'); if (z) z.textContent = t; } });
    ui.hoert = false;
    await ichSage(ctx, r.text);
  } catch (e) {
    ui.hoert = false;
    if (e.message !== 'abgebrochen') toast(e.message, 'fehler');
    ctx.refresh();
  }
}

async function beenden(ctx) {
  stopHoeren();
  try { globalThis.speechSynthesis?.cancel(); } catch { /* egal */ }
  if (ui.verlauf.filter((m) => m.role === 'user').length < 2) { ui.laeuft = false; ui.verlauf = []; ctx.refresh(); return; }
  ui.denkt = true; ctx.refresh();
  try { ui.feedback = await gespraechFeedback(ui.verlauf, SPRACHEN[ui.sprache].wort); store.getState().bonusXp += 30; store.save(); } catch (e) { toast(e.message, 'fehler'); }
  ui.denkt = false; ui.laeuft = false; ctx.refresh();
}

function auswahl(ctx) {
  return h('div', { class: 'sprechpartner' },
    h('p', { class: 'einleitung' }, 'Üb echte Gespräche: Die KI spielt eine Rolle und spricht mit dir. Du antwortest mit dem Mikrofon. Am Ende bekommst du eine Rückmeldung mit Note.'),
    h('div', { class: 'sp-sprachen', role: 'group', 'aria-label': 'Sprache' }, Object.entries(SPRACHEN).map(([id, s]) =>
      h('button', { class: `sp-sprache ${ui.sprache === id ? 'ist-aktiv' : ''}`, 'aria-pressed': String(ui.sprache === id), onclick: () => { ui.sprache = id; ctx.refresh(); } }, h('span', { 'aria-hidden': 'true' }, s.flagge), s.name))),
    h('div', { class: 'reihe' }, h('label', { for: 'sp-niveau' }, 'Niveau'),
      h('select', { id: 'sp-niveau', onchange: (e) => { ui.niveau = e.target.value; } }, Object.entries(NIVEAUS).map(([k, v]) => h('option', { value: k, selected: ui.niveau === k }, v)))),
    h('h2', null, 'Wähl eine Situation'),
    h('div', { class: 'sp-szenen' }, SZENEN.map((s) => h('button', { class: 'sp-szene', onclick: async () => {
      if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return; }
      ui.szene = s.id; ui.verlauf = []; ui.feedback = null; ui.laeuft = true; kiSagt(ctx);
    } }, h('span', { class: 'sp-emoji', 'aria-hidden': 'true' }, s.emoji), h('strong', null, s.titel), h('small', null, s.text)))),
    !kannHoeren() && h('p', { class: 'hinweis' }, 'Dein Browser kann hier keine Sprache erkennen – du kannst stattdessen tippen oder die Diktier-Taste der Tastatur nutzen.'));
}

function gespraech(ctx) {
  const sp = SPRACHEN[ui.sprache];
  const szene = SZENEN.find((s) => s.id === ui.szene);
  const tippen = h('input', { type: 'text', placeholder: `Auf ${sp.name} antworten …`, 'aria-label': 'Antwort tippen', lang: sp.lang.slice(0, 2) });
  const liste = h('div', { class: 'sp-verlauf', 'aria-live': 'polite' }, ui.verlauf.map((m) => h('div', { class: `sp-blase ${m.role === 'user' ? 'ist-ich' : ''}` },
    h('p', { lang: sp.lang.slice(0, 2) }, m.text),
    m.role === 'assistant' && h('button', { class: 'knopf-icon', 'aria-label': 'Nochmal anhören', onclick: () => sprechen(m.text, sp.lang) }, icon('ton', 16)))),
  ui.denkt && h('div', { class: 'sp-blase' }, h('span', { class: 'tippt' }, h('i'), h('i'), h('i'))));
  requestAnimationFrame(() => { liste.scrollTop = liste.scrollHeight; });
  return h('div', { class: 'sprechpartner' },
    h('div', { class: 'reihe sp-kopf' }, h('strong', null, `${szene.emoji} ${szene.titel}`), h('span', { class: 'hinweis' }, `${sp.flagge} ${sp.name}`),
      h('button', { class: 'knopf knopf-mini', onclick: () => beenden(ctx), disabled: ui.denkt }, 'Beenden & Feedback')),
    liste,
    kannHoeren() && h('button', { class: `sp-mikro ${ui.hoert ? 'hoert' : ''}`, disabled: ui.denkt, 'aria-label': ui.hoert ? 'Zuhören stoppen' : 'Sprechen', onclick: () => zuhoeren(ctx) },
      h('span', { class: 'sp-mikro-kreis' }, ui.hoert ? '■' : '🎤'), h('span', null, ui.hoert ? 'Ich höre zu …' : 'Tippen und sprechen')),
    ui.hoert && h('p', { class: 'sp-zwischen', 'aria-live': 'polite' }, ui.zwischen),
    h('form', { class: 'reihe sp-tippen', onsubmit: (e) => { e.preventDefault(); const t = tippen.value; tippen.value = ''; ichSage(ctx, t); } }, tippen, h('button', { class: 'knopf', type: 'submit', disabled: ui.denkt }, 'Senden')));
}

function feedbackZeigen(ctx) {
  const f = ui.feedback;
  return h('div', { class: 'sprechpartner' },
    h('div', { class: 'blatt sp-feedback' },
      h('p', { class: 'handschrift ende-spruch' }, `Note ${f.note}`),
      h('p', { class: 'hinweis' }, '+30 XP fürs Sprechen üben'),
      f.lob.length > 0 && [h('h3', null, '👍 Das war gut'), h('ul', null, f.lob.map((l) => h('li', null, l)))],
      f.fehler.length > 0 && [h('h3', null, '✏️ So wird’s besser'), h('ul', { class: 'sp-fehler' }, f.fehler.map((x) => h('li', null, h('s', null, x.falsch), ' → ', h('strong', null, x.richtig), x.warum && h('small', null, x.warum))))],
      f.woerter.length > 0 && [h('h3', null, '📚 Neue Ausdrücke'), h('ul', null, f.woerter.map((w) => h('li', null, h('strong', null, w.fremd), ` – ${w.deutsch}`))),
        h('button', { class: 'knopf', onclick: (e) => {
          const fach = { en: 'englisch', fr: 'franzoesisch', es: 'spanisch' }[ui.sprache];
          const d = store.getState().decks.find((x) => x.name === 'Aus Gesprächen' && x.fach === fach) || store.addDeck('Aus Gesprächen', fach);
          store.addCards(d.id, f.woerter.map((w) => ({ front: w.fremd, back: w.deutsch })));
          toast('Als Karteikarten gespeichert.'); e.currentTarget.disabled = true;
        } }, icon('karten', 18), 'Als Karteikarten speichern')],
      h('div', { class: 'reihe' }, h('button', { class: 'knopf knopf-haupt', onclick: () => { ui.feedback = null; ui.verlauf = []; ctx.refresh(); } }, 'Neues Gespräch'))),
  );
}

export function sprechpartner(ctx) {
  if (!ui.init) { ui.init = true; ui.sprache = standardSprache(); }
  ctx.onLeave(() => { stopHoeren(); try { globalThis.speechSynthesis?.cancel(); } catch { /* egal */ } });
  if (ui.feedback) return feedbackZeigen(ctx);
  if (ui.laeuft) return gespraech(ctx);
  return auswahl(ctx);
}
