// Kleine Helfer zum Bauen der Oberfläche. Texte landen immer als Text im Dokument, nie als HTML.

const DIREKT = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'htmlFor', 'type', 'open']);

export function h(tag, props, ...kinder) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (DIREKT.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  anhaengen(el, kinder);
  return el;
}

function anhaengen(el, kinder) {
  for (const k of kinder) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) anhaengen(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const ICONS = {
  heft: '<path d="M6 3.5h11a2 2 0 0 1 2 2v15H8a2 2 0 0 1-2-2z"/><path d="M10 3.5v17M13 8h3M13 11.5h3"/>',
  karten: '<rect x="3" y="8" width="14" height="11" rx="1.5"/><path d="M7 8V6.5A1.5 1.5 0 0 1 8.5 5H19.500a1.5 1.5 0 0 1 1.5 1.5V15a1.5 1.5 0 0 1-1.5 1.500H17"/>',
  scan: '<path d="M4 8.5h3.200l1.500-2.500h6.600l1.500 2.500H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.500a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.500" r="3.200"/>',
  mathe: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.500 7.500h7"/><path d="M8.500 12h.01M12 12h.01M15.500 12h.01M8.500 16h.01M12 16h.01M15.500 16h.01" stroke-width="2.400"/>',
  klausur: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 14.500l2 2 4-4.500"/>',
  statistik: '<path d="M5 20v-8M12 20V5M19 20v-5"/><path d="M3 20.500h18"/>',
  einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.500 12.500l5 5L19.500 7"/>',
  halb: '<path d="M5 12h14"/>',
  ton: '<path d="M4 9.500v5h3.500L12 18V6L7.500 9.500z"/><path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11"/>',
  stift: '<path d="M4 20l1-4.500L16.500 4l3.500 3.500L8.500 19z"/><path d="M14 6.500l3.500 3.500"/>',
  muell: '<path d="M5 7h14M10 7V4.500h4V7M7 7l1 13h8l1-13"/>',
  zurueck: '<path d="M11 5l-7 7 7 7M4 12h16"/>',
  bild: '<rect x="3.500" y="5" width="17" height="14" rx="1.500"/><path d="M4 16l4.500-4.500 4 4 2.500-2.500 5 5"/><circle cx="15.500" cy="9.500" r="1.500"/>',
  chat: '<path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.500v-3.500h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M8 10h.01M12 10h.01M16 10h.01" stroke-width="2.400"/>',
  senden: '<path d="M4 12l16-7.500-6 16-2.500-6.500z"/><path d="M11.500 14L20 4.500"/>',
  schild: '<path d="M12 3l7.500 3v5.500c0 4.500-3.200 8-7.500 9.500C7.700 19.500 4.500 16 4.500 11.500V6z"/><path d="M9 12l2 2 4-4.500"/>',
  uhr: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
};

export function icon(name, groesse = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', groesse);
  svg.setAttribute('height', groesse);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

export function toast(text, art = 'info') {
  const feld = document.getElementById('toasts');
  if (!feld) return;
  const t = h('div', { class: `toast toast-${art}`, role: art === 'fehler' ? 'alert' : 'status' }, text);
  feld.append(t);
  setTimeout(() => t.remove(), art === 'fehler' ? 7000 : 3500);
}

// Fenster über der Seite. Gibt eine Funktion zum Schließen zurück.
export function modal(titel, inhalt, { onClose } = {}) {
  const vorher = document.activeElement;
  const schliessen = () => {
    document.removeEventListener('keydown', taste);
    huelle.remove();
    onClose?.();
    if (vorher instanceof HTMLElement && document.contains(vorher)) vorher.focus();
  };
  const taste = (e) => {
    if (e.key === 'Escape') schliessen();
  };
  const fenster = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel },
    h('div', { class: 'modal-kopf' },
      h('h2', null, titel),
      h('button', { class: 'knopf-icon', 'aria-label': 'Schließen', onclick: schliessen }, icon('x'))),
    h('div', { class: 'modal-inhalt' }, inhalt),
  );
  const huelle = h('div', { class: 'modal-huelle', onmousedown: (e) => { if (e.target === huelle) schliessen(); } }, fenster);
  document.body.append(huelle);
  document.addEventListener('keydown', taste);
  const erstes = fenster.querySelector('input, textarea, select, .modal-inhalt button');
  (erstes || fenster.querySelector('button'))?.focus();
  return schliessen;
}

export function nachfragen(titel, text, jaText = 'Ja', { gefahr = false } = {}) {
  return new Promise((antwort) => {
    let ergebnis = false;
    const zu = modal(
      titel,
      [
        h('p', null, text),
        h('div', { class: 'reihe reihe-ende' },
          h('button', { class: 'knopf', onclick: () => zu() }, 'Abbrechen'),
          h('button', { class: `knopf ${gefahr ? 'knopf-gefahr' : 'knopf-haupt'}`, onclick: () => { ergebnis = true; zu(); } }, jaText)),
      ],
      { onClose: () => antwort(ergebnis) },
    );
  });
}

// Beschriftetes Eingabefeld
export function feld(label, eingabe, hinweis) {
  const id = eingabe.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  eingabe.id = id;
  return h('div', { class: 'feld' }, h('label', { for: id }, label), eingabe, hinweis && h('p', { class: 'hinweis' }, hinweis));
}

// Auswahl aus wenigen Möglichkeiten als Knopfreihe (Radio-Gruppe)
export function auswahl(name, optionen, aktuell, onChange) {
  return h(
    'div',
    { class: 'auswahl', role: 'radiogroup', 'aria-label': name },
    optionen.map((o) => {
      const id = `a-${Math.random().toString(36).slice(2, 9)}`;
      return h('div', { class: 'auswahl-punkt' },
        h('input', { type: 'radio', name, id, value: o.wert, checked: o.wert === aktuell, disabled: o.gesperrt, onchange: () => onChange(o.wert) }),
        h('label', { for: id }, h('span', { class: 'auswahl-titel' }, o.titel), o.text && h('span', { class: 'auswahl-text' }, o.text)));
    }),
  );
}

export function sprechen(text, lang) {
  try {
    const synth = globalThis.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\([^)]*\)/g, ''));
    u.lang = lang;
    u.rate = 0.9;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export const kannSprechen = () => typeof globalThis.speechSynthesis !== 'undefined';

export function datumLang(d = new Date()) {
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function datumKurz(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
