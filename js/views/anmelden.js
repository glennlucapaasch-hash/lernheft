import { h, icon } from '../dom.js';

// Anmeldeseite. onErfolg(konto) wird nach erfolgreicher Anmeldung aufgerufen.
export function anmeldeSeite(onErfolg) {
  const fehler = h('p', { class: 'anmelden-fehler', role: 'alert' });
  const name = h('input', { type: 'text', id: 'login-name', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', required: true });
  const pw = h('input', { type: 'password', id: 'login-pw', autocomplete: 'current-password', required: true });
  const knopf = h('button', { class: 'knopf knopf-haupt knopf-gross knopf-breit', type: 'submit' }, 'Anmelden');
  const zeigen = h('button', { type: 'button', class: 'knopf knopf-leise knopf-mini', 'aria-pressed': 'false', onclick: () => {
    const an = pw.type === 'password';
    pw.type = an ? 'text' : 'password';
    zeigen.textContent = an ? 'Verbergen' : 'Zeigen';
    zeigen.setAttribute('aria-pressed', String(an));
  } }, 'Zeigen');

  const form = h('form', { class: 'anmelden-karte karteikarte farbe-gelb', onsubmit: async (e) => {
    e.preventDefault();
    fehler.textContent = '';
    knopf.disabled = true;
    knopf.textContent = 'Einen Moment …';
    try {
      const r = await fetch('/api/anmelden', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: JSON.stringify({ name: name.value, passwort: pw.value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message || 'Anmelden hat nicht geklappt.');
      onErfolg(d);
    } catch (err) {
      fehler.textContent = err.message === 'Failed to fetch' ? 'Keine Verbindung zum Server.' : err.message;
      form.classList.remove('wackelt'); void form.offsetWidth; form.classList.add('wackelt');
      knopf.disabled = false;
      knopf.textContent = 'Anmelden';
      pw.select();
    }
  } },
    h('p', { class: 'stapel-fach' }, 'Lernheft – von Glenn'),
    h('h1', { class: 'handschrift anmelden-titel' }, 'Willkommen!'),
    h('div', { class: 'feld' }, h('label', { for: 'login-name' }, 'Benutzername'), name),
    h('div', { class: 'feld' },
      h('div', { class: 'feld-zeile' }, h('label', { for: 'login-pw' }, 'Passwort'), zeigen),
      pw),
    fehler,
    knopf,
    h('p', { class: 'hinweis' }, 'Zugang vergessen? Frag Glenn nach einem neuen Passwort.'),
    h('p', { class: 'hinweis' }, 'Mit der Anmeldung setzt die Seite ein technisch notwendiges Cookie. ', h('a', { href: '#datenschutz' }, 'Datenschutz')));

  queueMicrotask(() => name.focus());
  return h('div', { class: 'anmelden' }, h('div', { class: 'anmelden-symbol', 'aria-hidden': 'true' }, icon('heft', 40)), form);
}
