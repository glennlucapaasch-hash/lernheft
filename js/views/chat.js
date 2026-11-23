import { h, icon, toast, nachfragen } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { kiVerfuegbar, chatAntwort, bildVorbereiten } from '../ai.js';

// Verlauf bleibt für die Sitzung erhalten (Fotos werden nicht dauerhaft gespeichert).
// Der Verlauf wird im Lernheft gespeichert (mit Konto: auf dem Server, ohne Fotos).
const ui = { verlauf: null, entwurf: '', foto: null, laden: false, ki: undefined };
const merken = () => store.chatSpeichern(ui.verlauf);

const VORSCHLAEGE = [
  'Erklär mir den Unterschied zwischen Simple Past und Present Perfect',
  'Wie löse ich eine quadratische Gleichung?',
  'Hilf mir, mir schwierige Vokabeln zu merken',
  'Frag mich 5 Fragen zu meinem Stoff ab',
];

const aufraeumen = (t) => String(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/^\s*[*-]\s+/gm, '– ');

function kontext() {
  const { decks } = store.getState();
  return decks.slice(0, 15).map((d) => {
    const bsp = store.cardsOf(d.id).slice(0, 6).map((c) => `${c.front} = ${c.back}`).join('; ');
    return `${d.name} (${FAECHER[d.fach].name})${bsp ? `: ${bsp}` : ''}`;
  }).join(' | ');
}

async function senden(ctx, text) {
  const inhalt = String(text ?? ui.entwurf).trim();
  if ((!inhalt && !ui.foto) || ui.laden) return;
  let bild = null;
  if (ui.foto) {
    try { bild = await bildVorbereiten(ui.foto.datei); } catch (e) { toast(e.message, 'fehler'); return; }
    URL.revokeObjectURL(ui.foto.url);
  }
  ui.verlauf.push({ role: 'user', text: inhalt || 'Was siehst du auf dem Foto? Hilf mir damit.', bild, bildUrl: bild ? URL.createObjectURL(bild) : null });
  const antwort = { role: 'assistant', text: '', tippt: true };
  ui.verlauf.push(antwort);
  ui.entwurf = ''; ui.foto = null; ui.laden = true;
  ctx.refresh();
  try {
    const verlauf = ui.verlauf.filter((m) => m !== antwort);
    antwort.text = await chatAntwort(verlauf, {
      kontext: kontext(),
      onText: (t) => {
        antwort.text = t; antwort.tippt = false;
        const blase = document.querySelector('.blase-ki:last-of-type .blase-text');
        if (blase) { blase.textContent = aufraeumen(t); blase.closest('.blase')?.classList.remove('tippt'); scrollen(); }
      },
    });
  } catch (e) {
    ui.verlauf.pop();
    ui.verlauf.pop();
    ui.entwurf = inhalt;
    toast(e?.message || 'Das hat nicht geklappt.', 'fehler');
  }
  antwort.tippt = false;
  ui.laden = false;
  merken();
  if (location.hash === '#chat') ctx.refresh();
}

function scrollen() {
  requestAnimationFrame(() => document.querySelector('.chat-ende')?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
}

function blase(ctx, m, i) {
  const ki = m.role === 'assistant';
  return h('li', { class: `blase ${ki ? 'blase-ki' : 'blase-ich'} ${m.tippt ? 'tippt' : ''}` },
    ki && h('span', { class: 'blase-avatar', 'aria-hidden': 'true' }, icon('heft', 18)),
    h('div', { class: 'blase-koerper' },
      m.bildUrl && h('img', { src: m.bildUrl, alt: 'Dein Foto', class: 'blase-bild' }),
      m.tippt && !m.text
        ? h('span', { class: 'punkte', 'aria-label': 'Lernhelfer schreibt' }, h('i'), h('i'), h('i'))
        : h('p', { class: 'blase-text' }, ki ? aufraeumen(m.text) : m.text),
      ki && !m.tippt && m.text && h('div', { class: 'blase-aktionen' },
        h('button', { class: 'knopf knopf-leise knopf-mini', onclick: async () => {
          try { await navigator.clipboard.writeText(aufraeumen(m.text)); toast('Kopiert.'); } catch { toast('Kopieren ging nicht.', 'fehler'); }
        } }, 'Kopieren'),
        i === ui.verlauf.length - 1 && h('button', { class: 'knopf knopf-leise knopf-mini', onclick: () => {
          const frage = ui.verlauf[i - 1]; ui.verlauf.splice(i - 1, 2); senden(ctx, frage?.text);
        } }, 'Neu antworten'))));
}

export function chat(ctx) {
  if (!ui.verlauf) ui.verlauf = (store.getState().chat || []).map((m) => ({ role: m.role, text: m.text }));
  kiVerfuegbar().then((weg) => { if (weg !== ui.ki) { ui.ki = weg; if (location.hash === '#chat') ctx.refresh(); } });
  if (ctx.optionen?.frage) { ui.entwurf = ctx.optionen.frage; }

  const foto = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => {
    const d = e.target.files[0]; if (!d) return;
    if (ui.foto) URL.revokeObjectURL(ui.foto.url);
    ui.foto = { datei: d, url: URL.createObjectURL(d) }; ctx.refresh();
  } });
  const feld = h('textarea', { class: 'chat-eingabe', rows: '1', placeholder: 'Frag mich etwas …', 'aria-label': 'Deine Frage', value: ui.entwurf,
    oninput: (e) => { ui.entwurf = e.target.value; e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; },
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(ctx); } } }, ui.entwurf);

  const leer = !ui.verlauf.length;
  const seite = h('div', { class: 'seite chat' },
    h('header', { class: 'seiten-kopf' },
      h('h1', { class: 'handschrift' }, 'Lernhelfer'),
      !leer && h('button', { class: 'knopf knopf-leise', onclick: async () => {
        if (await nachfragen('Neues Gespräch?', 'Der bisherige Chat wird gelöscht.', 'Neu starten')) { ui.verlauf = []; merken(); ctx.refresh(); }
      } }, icon('plus', 18), 'Neues Gespräch')),
    ui.ki === null && h('div', { class: 'blatt meldung' },
      h('p', null, h('strong', null, 'Für den Chat braucht die App einen KI-Schlüssel.')),
      h('a', { class: 'knopf knopf-haupt', href: '#einstellungen' }, 'Schlüssel hinterlegen')),
    leer
      ? h('div', { class: 'chat-leer' },
          h('p', { class: 'einleitung' }, 'Frag mich alles rund um die Schule: Vokabeln, Grammatik, Mathe, Hausaufgaben. Du kannst auch ein Foto einer Aufgabe schicken.'),
          h('ul', { class: 'vorschlaege' }, VORSCHLAEGE.map((v) => h('li', null, h('button', { class: 'vorschlag', disabled: !ui.ki, onclick: () => senden(ctx, v) }, v)))))
      : h('ol', { class: 'chat-verlauf', 'aria-live': 'polite' }, ui.verlauf.map((m, i) => blase(ctx, m, i))),
    h('div', { class: 'chat-ende' }),
    h('form', { class: 'chat-leiste', onsubmit: (e) => { e.preventDefault(); senden(ctx); } },
      ui.foto && h('div', { class: 'chat-foto' }, h('img', { src: ui.foto.url, alt: 'Angehängtes Foto' }),
        h('button', { type: 'button', class: 'knopf-icon', 'aria-label': 'Foto entfernen', onclick: () => { URL.revokeObjectURL(ui.foto.url); ui.foto = null; ctx.refresh(); } }, icon('x', 16))),
      foto,
      h('button', { type: 'button', class: 'knopf-icon', 'aria-label': 'Foto anhängen', disabled: !ui.ki, onclick: () => foto.click() }, icon('bild')),
      feld,
      h('button', { type: 'submit', class: 'chat-senden', 'aria-label': 'Senden', disabled: ui.laden || !ui.ki }, icon('senden', 20))));
  scrollen();
  queueMicrotask(() => { if (!ui.laden) feld.focus({ preventScroll: true }); });
  return seite;
}
