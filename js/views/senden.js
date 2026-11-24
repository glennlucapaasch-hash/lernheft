// Etwas an alle oder an bestimmte Personen schicken
import { h, icon, toast, modal } from '../dom.js';

async function api(pfad, opts = {}) {
  const r = await fetch(pfad, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', 'x-lernheft': '1' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'Das hat nicht geklappt.');
  return d;
}

// daten: Inhalt für /api/geteilt (name, fach, karten oder typ: 'notiz' + notiz)
export async function sendenDialog({ titel, beschreibung, daten }) {
  let personen = [];
  try { personen = await api('/api/personen'); } catch (e) { toast(e.message, 'fehler'); return; }
  const wahl = new Set();
  let modus = 'personen';
  const suche = h('input', { type: 'search', placeholder: 'Name suchen', 'aria-label': 'Name suchen', oninput: () => listeZeichnen() });
  const liste = h('ul', { class: 'haken-liste personen-liste' });
  const knopf = h('button', { class: 'knopf knopf-haupt', type: 'submit' });
  function knopfText() {
    knopf.textContent = modus === 'alle' ? 'An alle schicken' : wahl.size ? `An ${wahl.size} ${wahl.size === 1 ? 'Person' : 'Personen'} schicken` : 'Personen auswählen';
    knopf.disabled = modus === 'personen' && !wahl.size;
  }
  function listeZeichnen() {
    const q = suche.value.trim().toLowerCase();
    liste.replaceChildren(...personen.filter((p) => p.includes(q)).map((p) => h('li', null, h('label', null,
      h('input', { type: 'checkbox', checked: wahl.has(p), onchange: (e) => { if (e.target.checked) wahl.add(p); else wahl.delete(p); knopfText(); } }),
      h('span', null, p)))));
    if (!liste.children.length) liste.append(h('li', { class: 'hinweis' }, personen.length ? 'Niemand gefunden.' : 'Es gibt noch keine anderen Konten.'));
  }
  const personenTeil = h('div', null, suche, liste);
  const umschalten = (m) => { modus = m; personenTeil.hidden = m === 'alle'; knopfText(); };
  const zu = modal(titel, h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api('/api/geteilt', { method: 'POST', body: JSON.stringify({ ...daten, an: modus === 'alle' ? [] : [...wahl] }) });
      zu();
      toast(modus === 'alle' ? 'An alle geschickt.' : `Geschickt an ${[...wahl].join(', ')}.`);
    } catch (err) { toast(err.message, 'fehler'); }
  } },
    h('p', null, beschreibung),
    h('div', { class: 'auswahl' },
      ...[['personen', 'Bestimmte Personen'], ['alle', 'Alle']].map(([w, t]) => {
        const id = `senden-${w}`;
        return h('div', { class: 'auswahl-punkt' }, h('input', { type: 'radio', name: 'senden-an', id, checked: w === modus, onchange: () => umschalten(w) }), h('label', { for: id }, h('span', { class: 'auswahl-titel' }, t)));
      })),
    personenTeil,
    h('div', { class: 'reihe reihe-ende' }, knopf)));
  listeZeichnen();
  knopfText();
}

export { api as sendenApi };
