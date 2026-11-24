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

// Einladungslink: Person legt ihr Passwort selbst fest
export function einladungSeite(token) {
  const fehler = h('p', { class: 'anmelden-fehler', role: 'alert' });
  const pw = h('input', { type: 'password', id: 'neu-pw', autocomplete: 'new-password', minlength: '10', required: true });
  const pw2 = h('input', { type: 'password', id: 'neu-pw2', autocomplete: 'new-password', required: true });
  const titel = h('h1', { class: 'handschrift anmelden-titel' }, 'Willkommen!');
  const info = h('p', null, 'Ich prüfe deinen Einladungslink …');
  fetch(`/api/einladung?t=${encodeURIComponent(token)}`).then((r) => r.json().then((d) => {
    if (r.ok) { info.replaceChildren('Dein Benutzername ist ', h('strong', null, d.name), '. Leg jetzt dein eigenes Passwort fest.'); }
    else { info.textContent = d?.error?.message || 'Dieser Link funktioniert nicht.'; form.querySelector('button').disabled = true; }
  })).catch(() => { info.textContent = 'Keine Verbindung zum Server.'; });
  const form = h('form', { class: 'anmelden-karte karteikarte farbe-gelb', onsubmit: async (e) => {
    e.preventDefault();
    fehler.textContent = '';
    if (pw.value !== pw2.value) { fehler.textContent = 'Die beiden Passwörter sind nicht gleich.'; return; }
    const r = await fetch('/api/einladung', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: JSON.stringify({ token, passwort: pw.value }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { fehler.textContent = d?.error?.message || 'Das hat nicht geklappt.'; return; }
    location.replace('/');
  } },
    h('p', { class: 'stapel-fach' }, 'Lernheft – von Glenn'), titel, info,
    h('div', { class: 'feld' }, h('label', { for: 'neu-pw' }, 'Neues Passwort (mind. 10 Zeichen)'), pw),
    h('div', { class: 'feld' }, h('label', { for: 'neu-pw2' }, 'Passwort wiederholen'), pw2),
    fehler,
    h('button', { class: 'knopf knopf-haupt knopf-gross knopf-breit', type: 'submit' }, 'Passwort speichern und loslegen'),
    h('p', { class: 'hinweis' }, 'Tipp: Drei Wörter mit Bindestrich und eine Zahl sind sicher und gut zu merken.'));
  return h('div', { class: 'anmelden' }, form);
}
