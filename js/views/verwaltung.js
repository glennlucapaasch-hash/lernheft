import { h, icon, toast, nachfragen, modal, feld, datumKurz } from '../dom.js';
import { MODELLE, FAECHER } from '../store.js';

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
            h('button', { class: 'knopf knopf-mini', onclick: async () => {
              try {
                const { token } = await api(`/api/verwaltung/konten/${k.name}/einladung`, { method: 'POST' });
                const text = `Hallo ${k.name}! Hier ist dein Zugang zum Lernheft: ${location.origin}/#einladung-${token}\nÖffne den Link und leg dein eigenes Passwort fest. Der Link gilt 7 Tage.`;
                modal('Einladungslink', [h('p', null, `Damit legt ${k.name} das Passwort selbst fest. Der Link gilt 7 Tage und nur einmal.`), h('textarea', { rows: '4', readonly: true }, text),
                  h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Kopiert – jetzt verschicken.'); } catch { toast('Kopieren ging nicht.', 'fehler'); } } }, 'Nachricht kopieren'))]);
              } catch (err) { toast(err.message, 'fehler'); }
            } }, 'Einladungslink'),
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

async function statistikZeigen(name) {
  let s;
  try { s = await api(`/api/verwaltung/statistik/${encodeURIComponent(name)}`); } catch (e) { toast(e.message, 'fehler'); return; }
  const max = Math.max(1, ...s.tage.map((t) => t.abfragen));
  const kartenGesamt = Object.values(s.stufen).reduce((a, b) => a + b, 0) || 1;
  const kachel = (zahl, text) => h('div', { class: 'admin-kachel' }, h('strong', null, zahl), h('small', null, text));
  modal(`Statistik: ${s.name}`, [
    h('div', { class: 'admin-kacheln' },
      kachel(String(s.gesamt), 'Abfragen gesamt'), kachel(s.quoteGesamt === null ? '–' : `${s.quoteGesamt} %`, 'richtig'),
      kachel(s.serie ? `🔥 ${s.serie}` : '0', 'Tage Serie'), kachel(String(s.lerntageGesamt), 'Lerntage gesamt'),
      kachel(String(s.notizen), 'Notizen'), kachel(String(s.kiMonat), 'KI-Anfragen Monat')),
    h('h3', null, 'Abfragen der letzten 30 Tage'),
    h('div', { class: 'admin-balken', role: 'img', 'aria-label': s.tage.map((t) => `${t.tag}: ${t.abfragen}`).join(', ') }, s.tage.map((t) => h('div', { title: `${t.tag.slice(8)}.${t.tag.slice(5, 7)}.: ${t.abfragen} Abfragen, ${t.richtig} richtig` },
      h('span', { style: `height:${(t.abfragen / max) * 100}%` }, h('i', { style: `height:${t.abfragen ? (t.richtig / t.abfragen) * 100 : 0}%` }))))),
    h('p', { class: 'hinweis' }, 'Dunkler Teil = richtig beantwortet. Fahr über einen Balken für Details.'),
    h('h3', null, 'Lernstand der Karten'),
    h('div', { class: 'admin-stufen' }, Object.entries(s.stufen).map(([k, v]) => h('span', { class: `stufe-${k}`, style: `flex:${v || 0.001}`, title: `${k}: ${v}` }))),
    h('p', { class: 'hinweis' }, `Neu ${s.stufen.neu} · Lernen ${s.stufen.lernen} · Gefestigt ${s.stufen.gefestigt} · Sicher ${s.stufen.sicher} (${Math.round((s.stufen.sicher / kartenGesamt) * 100)} % sicher)`),
    s.stapel.length > 0 && [h('h3', null, 'Stapel'), h('div', { class: 'tabelle-rollen' }, h('table', { class: 'konten-tabelle' },
      h('thead', null, h('tr', null, ['Stapel', 'Fach', 'Karten', 'Fällig', 'Sicher'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, s.stapel.map((d) => h('tr', null, h('th', { scope: 'row' }, d.name), h('td', null, FAECHER[d.fach]?.name || d.fach), h('td', null, String(d.karten)), h('td', null, String(d.faellig)), h('td', null, String(d.sicher)))))))],
    s.klausuren.length > 0 && [h('h3', null, 'Probeklausuren'), h('ul', { class: 'admin-liste' }, s.klausuren.map((k) => h('li', null, `${k.titel}: ${k.prozent} %${k.note ? ` (Note ${k.note})` : ''}`)))],
    h('h3', null, 'Spiele'),
    h('p', null, `Live-Quiz: ${s.spiele.duelle || 0} gespielt, ${s.spiele.duellSiege || 0} gewonnen · Abenteuer: ${s.abenteuerSterne} ★`),
    h('p', { class: 'hinweis' }, `Konto seit ${s.angelegt ? datumKurz(s.angelegt) : '–'}, zuletzt angemeldet ${s.letzterLogin ? datumKurz(s.letzterLogin) : 'nie'}. Inhalte wie Karten-Texte, Notizen, Chats und Noten bleiben privat.`),
  ]);
}

function lernraumBereich(ctx) {
  const e = ui.daten.einstellungen;
  const url = h('input', { type: 'text', value: e.turnUrl || '', placeholder: 'turn:lernheft.app:3478', spellcheck: 'false', autocomplete: 'off' });
  const geheim = h('input', { type: 'password', placeholder: e.turnGesetzt ? 'hinterlegt' : 'Inhalt von /root/turn-secret', autocomplete: 'off', spellcheck: 'false' });
  const status = h('p', { class: 'hinweis', role: 'status' }, e.turnUrl && e.turnGesetzt ? '✅ TURN-Server eingetragen – Lernräume verbinden auch im Handynetz.' : '⚠️ Kein TURN-Server: Im Handynetz und manchen WLANs hören sich einzelne Personen nicht.');
  return h('section', { class: 'blatt' },
    h('h2', null, 'Lernraum-Verbindung (TURN)'), status,
    h('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      try {
        await api('/api/verwaltung/einstellungen', { method: 'PUT', body: { turnUrl: url.value.trim(), turnSecret: geheim.value.trim() || undefined } });
        toast('Gespeichert. Neue Lernräume nutzen den TURN-Server.');
        geheim.value = '';
        status.textContent = url.value.trim() ? '✅ TURN-Server eingetragen.' : '⚠️ Kein TURN-Server eingetragen.';
      } catch (err) { toast(err.message, 'fehler'); }
    } }, feld('Adresse', url), feld('Geheimnis', geheim), h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern')),
    h('p', { class: 'hinweis' }, 'Den TURN-Server startest du einmal auf deinem Server (Anleitung von Claude). Das Geheimnis wird nie angezeigt.'));
}

function gruppeBereich(ctx) {
  const text = h('textarea', { rows: '3', maxlength: '500', placeholder: 'z. B. Neue Vokabeln für Unit 4 sind geteilt! 🎉' });
  const ziel = h('input', { type: 'number', min: '50', max: '100000', step: '50', placeholder: '1000' });
  const tabelle = h('div', { class: 'tabelle-rollen' }, h('p', { class: 'hinweis' }, 'Lade …'));
  api('/api/verwaltung/uebersicht').then((l) => tabelle.replaceChildren(h('table', { class: 'konten-tabelle admin-statistik' },
    h('thead', null, h('tr', null, ['Name', '7 Tage', '30 Tage', 'Richtig', 'Lerntage', 'Serie', 'Karten', 'KI Monat', 'Zuletzt da'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', null, l.map((k) => h('tr', { class: 'klickbar', tabindex: '0', onclick: () => statistikZeigen(k.name), onkeydown: (e) => { if (e.key === 'Enter') statistikZeigen(k.name); } },
      h('th', { scope: 'row' }, h('button', { class: 'knopf-link' }, k.name)), h('td', null, String(k.woche)), h('td', null, String(k.monat)), h('td', null, k.quote === null ? '–' : `${k.quote} %`),
      h('td', null, `${k.lerntage}/30`), h('td', null, k.serie ? `🔥 ${k.serie}` : '0'), h('td', null, String(k.karten)), h('td', null, String(k.kiMonat)), h('td', null, k.letzterLogin ? datumKurz(k.letzterLogin) : 'nie'))))))).catch(() => {});
  return h('section', { class: 'blatt' },
    h('h2', null, 'Gruppe'),
    h('h3', null, 'Lernstatistik aller Personen'), h('p', { class: 'hinweis' }, 'Tipp auf einen Namen für Details.'), tabelle,
    h('h3', null, 'Ankündigung an alle'),
    h('form', { onsubmit: async (e) => { e.preventDefault(); try { await api('/api/verwaltung/gruppe', { method: 'PUT', body: { ankuendigung: text.value.trim() || null } }); toast(text.value.trim() ? 'Ankündigung veröffentlicht.' : 'Ankündigung entfernt.'); text.value = ''; } catch (err) { toast(err.message, 'fehler'); } } },
      text, h('div', { class: 'reihe' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Veröffentlichen'), h('span', { class: 'hinweis' }, 'Leer lassen und veröffentlichen = Ankündigung entfernen.'))),
    h('h3', null, 'Wochen-Challenge'),
    h('form', { class: 'reihe', onsubmit: async (e) => { e.preventDefault(); try { await api('/api/verwaltung/gruppe', { method: 'PUT', body: { challengeZiel: ziel.value } }); toast('Ziel gespeichert.'); } catch (err) { toast(err.message, 'fehler'); } } },
      feld('Ziel: Karten pro Woche für alle zusammen', ziel), h('button', { class: 'knopf', type: 'submit' }, 'Speichern')));
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
      : [kontenBereich(ctx, ich), gruppeBereich(ctx), kiBereich(ctx), lernraumBereich(ctx), kontaktBereich(ctx), sicherungBereich()]);
}
