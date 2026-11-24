import { h, icon, toast, nachfragen, modal, feld, datumKurz } from '../dom.js';
import { MODELLE } from '../store.js';

const ui = { daten: null, laden: false, fehler: '' };

async function api(pfad, { method = 'GET', body } = {}) {
  const r = await fetch(pfad, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'Das hat nicht geklappt.');
  return d;
}

async function neuLaden(ctx) {
  ui.laden = true;
  try { ui.daten = await api('/api/verwaltung'); ui.fehler = ''; }
  catch (e) { ui.fehler = e.message; }
  ui.laden = false;
  if (location.hash === '#verwaltung') ctx.refresh();
}

// Zugangsdaten einmalig anzeigen, mit Kopieren-Knopf
function zugangZeigen(titel, liste) {
  const text = liste.map((k) => `${k.name}: ${k.passwort}`).join('\n');
  const vorlage = liste.map((k) => `Dein Zugang zum Lernheft:\nAdresse: ${location.origin}\nBenutzername: ${k.name}\nPasswort: ${k.passwort}`).join('\n\n');
  modal(titel, [
    h('p', null, h('strong', null, 'Jetzt notieren oder kopieren'), ' – das Passwort wird nicht noch einmal angezeigt. Du kannst aber jederzeit ein neues erzeugen.'),
    h('table', { class: 'zugang-tabelle' },
      h('thead', null, h('tr', null, h('th', null, 'Benutzername'), h('th', null, 'Passwort'))),
      h('tbody', null, liste.map((k) => h('tr', null, h('td', null, k.name), h('td', null, h('code', null, k.passwort)))))),
    h('div', { class: 'reihe reihe-ende' },
      h('button', { class: 'knopf', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Kopiert.'); } catch { toast('Kopieren ging nicht.', 'fehler'); } } }, 'Liste kopieren'),
      h('button', { class: 'knopf knopf-haupt', onclick: async () => { try { await navigator.clipboard.writeText(vorlage); toast('Nachricht kopiert – zum Verschicken einfügen.'); } catch { toast('Kopieren ging nicht.', 'fehler'); } } }, 'Als Nachricht kopieren')),
  ]);
}

function anlegenDialog(ctx) {
  const namen = h('textarea', { rows: '5', placeholder: 'anna\nben\ncarla.m', autocapitalize: 'off', spellcheck: 'false' });
  const zu = modal('Personen hinzufügen', h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const liste = namen.value.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);
    if (!liste.length) { namen.focus(); return; }
    const neu = [];
    const fehler = [];
    for (const n of liste) {
      try { neu.push(await api('/api/verwaltung/konten', { method: 'POST', body: { name: n } })); }
      catch (err) { fehler.push(`${n}: ${err.message}`); }
    }
    zu();
    if (fehler.length) toast(fehler.join(' · '), 'fehler');
    if (neu.length) zugangZeigen(neu.length === 1 ? 'Neuer Zugang' : `${neu.length} neue Zugänge`, neu);
    neuLaden(ctx);
  } },
    feld('Benutzernamen, einer pro Zeile', namen, 'Kleinbuchstaben ohne Leerzeichen, z. B. vorname oder vorname.n – Umlaute werden zu ae/oe/ue. Die App erzeugt für jede Person ein sicheres Passwort.'),
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Zugänge erstellen'))));
}

function kiBereich(ctx) {
  const e = ui.daten.einstellungen;
  const schluessel = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: e.schluessel ? `hinterlegt: ${e.schluessel}` : 'sk-ant-…' });
  const modell = h('select', null, MODELLE.map((m) => h('option', { value: m.id, selected: m.id === e.model }, m.name)));
  const limit = h('input', { type: 'number', min: '0', max: '2000', step: '10', value: e.tageslimit, inputmode: 'numeric' });
  const test = h('button', { class: 'knopf', type: 'button', onclick: async () => {
    test.disabled = true; test.textContent = 'Ich teste …';
    try { await api('/api/verwaltung/test', { method: 'POST' }); toast('Die KI funktioniert.'); }
    catch (err) { toast(err.message, 'fehler'); }
    test.disabled = false; test.textContent = 'Verbindung testen';
  } }, 'Verbindung testen');
  return h('form', { class: 'blatt', onsubmit: async (ev) => {
    ev.preventDefault();
    try {
      await api('/api/verwaltung/einstellungen', { method: 'PUT', body: { apiKey: schluessel.value.trim() || undefined, model: modell.value, tageslimit: limit.value } });
      toast('Gespeichert.');
      neuLaden(ctx);
    } catch (err) { toast(err.message, 'fehler'); }
  } },
    h('h2', null, 'KI für alle'),
    h('p', null, 'Der Schlüssel liegt nur auf dem Server. Die anderen sehen ihn nie – ihre KI-Anfragen laufen über den Server und werden gezählt.'),
    feld('API-Schlüssel', schluessel, e.schluessel ? 'Leer lassen, um den hinterlegten Schlüssel zu behalten.' : 'Aus der Claude Console unter „API Keys“.'),
    feld('Modell', modell),
    feld('KI-Anfragen pro Person und Tag', limit, 'Für dich als Admin gilt kein Limit. Ein Seiten-Scan oder eine Chat-Nachricht ist je eine Anfrage.'),
    h('div', { class: 'reihe' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern'), test));
}

function kontenBereich(ctx, ich) {
  const { konten } = ui.daten;
  const wann = (ts) => (ts ? datumKurz(ts) : 'noch nie');
  return h('section', { class: 'blatt' },
    h('div', { class: 'abschnitt-kopf' },
      h('h2', null, `Personen (${konten.length})`),
      h('button', { class: 'knopf knopf-haupt', onclick: () => anlegenDialog(ctx) }, icon('plus', 18), 'Hinzufügen')),
    h('div', { class: 'tabelle-rollen' },
      h('table', { class: 'konten-tabelle' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col' }, 'Zuletzt da'), h('th', { scope: 'col' }, 'KI heute'), h('th', { scope: 'col' }, 'KI Monat'), h('th', { scope: 'col' }, h('span', { class: 'nur-vorlesen' }, 'Aktionen')))),
        h('tbody', null, konten.map((k) => h('tr', null,
          h('th', { scope: 'row' }, k.name, k.admin && h('span', { class: 'abzeichen' }, 'Admin')),
          h('td', null, wann(k.letzterLogin)),
          h('td', null, String(k.kiHeute)),
          h('td', null, String(k.kiMonat)),
          h('td', { class: 'aktionen' },
            h('button', { class: 'knopf knopf-mini', onclick: async () => {
              if (!(await nachfragen('Neues Passwort?', `${k.name} bekommt ein neues Passwort. Das alte gilt ab sofort nicht mehr und ${k.name} wird überall abgemeldet.`, 'Neues Passwort'))) return;
              try { zugangZeigen('Neues Passwort', [await api(`/api/verwaltung/konten/${k.name}/passwort`, { method: 'POST' })]); }
              catch (err) { toast(err.message, 'fehler'); }
            } }, 'Neues Passwort'),
            k.name !== ich.name && h('button', { class: 'knopf knopf-mini knopf-gefahr-leise', onclick: async () => {
              if (!(await nachfragen(`${k.name} löschen?`, `Der Zugang und alle Karteikarten, Chats und Klausuren von ${k.name} werden gelöscht. Das lässt sich nicht rückgängig machen.`, 'Löschen', { gefahr: true }))) return;
              try { await api(`/api/verwaltung/konten/${k.name}`, { method: 'DELETE' }); toast(`${k.name} gelöscht.`); neuLaden(ctx); }
              catch (err) { toast(err.message, 'fehler'); }
            } }, 'Löschen'))))))));
}

function kontaktBereich(ctx) {
  const e = ui.daten.einstellungen;
  const name = h('input', { type: 'text', value: e.kontaktName, maxlength: '100', autocomplete: 'name' });
  const mail = h('input', { type: 'email', value: e.kontaktMail, maxlength: '120', autocomplete: 'email' });
  const ort = h('input', { type: 'text', value: e.kontaktOrt, maxlength: '200', placeholder: 'z. B. Musterstraße 1, 20095 Hamburg' });
  return h('form', { class: 'blatt', onsubmit: async (ev) => {
    ev.preventDefault();
    try { await api('/api/verwaltung/einstellungen', { method: 'PUT', body: { kontaktName: name.value, kontaktMail: mail.value, kontaktOrt: ort.value } }); toast('Gespeichert.'); neuLaden(ctx); }
    catch (err) { toast(err.message, 'fehler'); }
  } },
    h('h2', null, 'Datenschutz: Verantwortlicher'),
    h('p', null, 'Diese Angaben erscheinen in der Datenschutzerklärung. Wer andere Leute die App nutzen lässt, muss sagen, wer für die Daten verantwortlich ist und wie man ihn erreicht.'),
    feld('Name', name), feld('E-Mail', mail), feld('Anschrift (freiwillig)', ort),
    h('div', { class: 'reihe' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern'), h('a', { class: 'knopf', href: '#datenschutz' }, 'Datenschutzerklärung ansehen')));
}

function sicherungBereich() {
  return h('section', { class: 'blatt' },
    h('h2', null, 'Sicherung'),
    h('p', null, 'Der Server legt jede Nacht automatisch eine Sicherung aller Konten und Lerndaten an und hebt die letzten 14 auf (Ordner sicherungen in /opt/lernheft-daten). Falls der ganze Server ausfällt, hilft nur eine Kopie woanders – lade dir ab und zu eine herunter.'),
    h('a', { class: 'knopf', href: '/api/verwaltung/sicherung', download: '' }, 'Sicherung herunterladen'),
    h('p', { class: 'hinweis' }, 'Die heruntergeladene Datei enthält keinen API-Schlüssel, aber alle Lerndaten – gib sie nicht weiter.'));
}

export function verwaltung(ctx) {
  const ich = ctx.konto;
  if (!ich?.admin) return h('div', { class: 'seite' }, h('p', null, 'Diesen Bereich sieht nur der Admin.'));
  if (!ui.daten && !ui.laden && !ui.fehler) neuLaden(ctx);
  if (ctx.optionen?.neu && ui.daten) neuLaden(ctx);
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Verwaltung')),
    ui.fehler && h('div', { class: 'blatt meldung meldung-fehler', role: 'alert' }, h('p', null, ui.fehler)),
    !ui.daten
      ? h('div', { class: 'blatt warten', role: 'status' }, h('p', null, 'Lade …'))
      : [kontenBereich(ctx, ich), kiBereich(ctx), kontaktBereich(ctx), sicherungBereich()]);
}
