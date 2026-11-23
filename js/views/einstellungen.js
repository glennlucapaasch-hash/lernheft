import { h, feld, auswahl, nachfragen, toast, modal } from '../dom.js';
import * as store from '../store.js';
import { MODELLE } from '../store.js';
import { kiVerfuegbar, verbindungTesten, istServerModus } from '../ai.js';

function sicherungLaden(text) {
  // Erst als Datei anbieten; wo Downloads gesperrt sind, bleibt das Kopieren.
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: `lernheft-sicherung-${store.tagKey()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch { /* Kopieren bleibt als Weg */ }
}

function sicherungDialog() {
  const text = store.exportData();
  const feldText = h('textarea', { rows: '8', readonly: true, 'aria-label': 'Sicherung als Text' }, text);
  modal('Sicherung', [
    h('p', null, 'Die Sicherung enthält alle Stapel, Karten und Ergebnisse – aber nicht deinen KI-Schlüssel. Heb sie gut auf, zum Beispiel in deiner Cloud.'),
    feldText,
    h('div', { class: 'reihe reihe-ende' },
      h('button', { class: 'knopf', onclick: async () => {
        try { await navigator.clipboard.writeText(text); toast('Sicherung kopiert.'); }
        catch { feldText.select(); toast('Markiert – jetzt mit Strg+C kopieren.'); }
      } }, 'Kopieren'),
      !globalThis.claude?.use && h('button', { class: 'knopf knopf-haupt', onclick: () => sicherungLaden(text) }, 'Als Datei speichern')),
  ]);
}

function einspielenDialog(ctx) {
  const text = h('textarea', { rows: '6', placeholder: 'Sicherung hier einfügen …', 'aria-label': 'Sicherung einfügen' });
  const datei = h('input', { type: 'file', accept: '.json,application/json', onchange: async (e) => {
    const f = e.target.files[0];
    if (f) text.value = await f.text();
  } });
  const zu = modal('Sicherung einspielen', [
    h('p', null, h('strong', null, 'Achtung: '), 'Alles, was jetzt in der App steht, wird durch die Sicherung ersetzt.'),
    feld('Datei auswählen', datei),
    text,
    h('div', { class: 'reihe reihe-ende' },
      h('button', { class: 'knopf knopf-gefahr', onclick: () => {
        try {
          store.importData(text.value);
          zu();
          toast('Sicherung eingespielt.');
          ctx.themeAnwenden();
          ctx.refresh();
        } catch (e) {
          toast(e instanceof SyntaxError ? 'Das ist keine gültige Sicherung.' : e.message, 'fehler');
        }
      } }, 'Ersetzen und einspielen')),
  ]);
}

function passwortDialog() {
  const alt = h('input', { type: 'password', autocomplete: 'current-password' });
  const neu = h('input', { type: 'password', autocomplete: 'new-password', minlength: '8' });
  const zu = modal('Passwort ändern', h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (neu.value.length < 8) { toast('Das neue Passwort braucht mindestens 8 Zeichen.', 'fehler'); neu.focus(); return; }
    const r = await fetch('/api/passwort', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: JSON.stringify({ alt: alt.value, neu: neu.value }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d?.error?.message || 'Das hat nicht geklappt.', 'fehler'); return; }
    zu();
    toast('Passwort geändert. Bitte melde dich neu an.');
    setTimeout(() => location.reload(), 1500);
  } },
    feld('Bisheriges Passwort', alt),
    feld('Neues Passwort', neu, 'Mindestens 8 Zeichen. Gut merkbar und trotzdem sicher: drei Wörter mit Bindestrich und eine Zahl.'),
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Passwort ändern'))));
}

function kontoBereich(ctx) {
  const k = ctx.konto;
  return h('section', { class: 'blatt' },
    h('h2', null, 'Dein Konto'),
    h('p', null, 'Angemeldet als ', h('strong', null, k.name), k.admin ? ' (Admin)' : '', '. Deine Karten, Chats und Klausuren werden auf dem Server gespeichert – du siehst sie auf jedem Gerät, auf dem du dich anmeldest.'),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf', onclick: passwortDialog }, 'Passwort ändern'),
      k.admin && h('a', { class: 'knopf', href: '#verwaltung' }, 'Zur Verwaltung'),
      h('button', { class: 'knopf knopf-gefahr-leise', onclick: () => ctx.abmelden() }, 'Abmelden')));
}

export function einstellungen(ctx) {
  const mitKonto = istServerModus() && ctx.konto;
  const e = store.getState().settings;
  const kiStatus = h('p', { class: 'hinweis', role: 'status' });
  const zeigeStatus = () => kiVerfuegbar().then((weg) => {
    kiStatus.textContent = weg === 'schluessel' ? 'Ein Schlüssel ist hinterlegt. Er bleibt auf diesem Gerät.'
      : weg === 'claude' ? 'Du nutzt gerade die Vorschau in Claude: Die KI funktioniert hier auch ohne eigenen Schlüssel.'
      : 'Kein Schlüssel hinterlegt. Scannen, Erklären und KI-Klausuren sind aus.';
  });
  zeigeStatus();

  const schluessel = h('input', { type: 'password', value: e.apiKey, autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-…',
    onchange: (ev) => { store.setSettings({ apiKey: ev.target.value.trim() }); zeigeStatus(); } });
  const testKnopf = h('button', { class: 'knopf', type: 'button', onclick: async () => {
    store.setSettings({ apiKey: schluessel.value.trim() });
    testKnopf.disabled = true;
    testKnopf.textContent = 'Ich teste …';
    try {
      await verbindungTesten();
      toast('Die Verbindung zur KI klappt.');
    } catch (err) {
      toast(err?.message || 'Die Verbindung klappt nicht.', 'fehler');
    }
    testKnopf.disabled = false;
    testKnopf.textContent = 'Verbindung testen';
    zeigeStatus();
  } }, 'Verbindung testen');

  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Einstellungen')),

    h('section', { class: 'blatt' },
      h('h2', null, 'Über dich'),
      feld('Dein Vorname', h('input', { type: 'text', value: e.name, maxlength: '30', autocomplete: 'given-name', onchange: (ev) => store.setSettings({ name: ev.target.value.trim() }) }), 'Steht nur in der Begrüßung.'),
      feld('Tagesziel (Abfragen pro Tag)', h('input', { type: 'number', min: '5', max: '200', step: '5', value: e.tagesziel, inputmode: 'numeric', onchange: (ev) => store.setSettings({ tagesziel: Math.min(200, Math.max(5, Number(ev.target.value) || 20)) }) }))),

    h('section', { class: 'blatt' },
      h('h2', null, 'Aussehen'),
      auswahl('theme', [
        { wert: 'auto', titel: 'Automatisch', text: 'Wie dein Gerät eingestellt ist' },
        { wert: 'heft', titel: 'Heft', text: 'Hell, wie Karopapier' },
        { wert: 'tafel', titel: 'Tafel', text: 'Dunkel, wie Kreide auf der Tafel' },
      ], e.theme, (v) => { store.setSettings({ theme: v }); ctx.themeAnwenden(); })),

    mitKonto ? kontoBereich(ctx) : h('section', { class: 'blatt' },
      h('h2', null, 'KI-Schlüssel'),
      h('p', null, 'Zum Erkennen von Fotos, für Erklärungen und für neue Klausuraufgaben fragt die App Claude von Anthropic. Dafür brauchst du einen eigenen API-Schlüssel; jede Anfrage kostet ein paar Cent und wird über dein Konto bei Anthropic abgerechnet.'),
      feld('API-Schlüssel', schluessel, 'Den Schlüssel bekommst du in der Claude Console unter „API Keys“. Er wird nur in diesem Browser gespeichert und nur an Anthropic geschickt.'),
      h('p', null, h('a', { href: 'https://platform.claude.com/', target: '_blank', rel: 'noopener' }, 'Claude Console öffnen')),
      feld('Modell', h('select', { onchange: (ev) => store.setSettings({ model: ev.target.value }) }, MODELLE.map((m) => h('option', { value: m.id, selected: m.id === e.model }, m.name)))),
      h('div', { class: 'reihe' }, testKnopf),
      kiStatus),

    h('section', { class: 'blatt' },
      h('h2', null, 'Deine Daten'),
      h('p', null, mitKonto ? 'Eine Sicherung als Datei ist trotzdem nützlich, z. B. bevor du viel aufräumst.' : 'Alles liegt nur auf diesem Gerät. Wenn du den Browser-Speicher löschst oder das Gerät wechselst, sind die Karten weg – außer du hast eine Sicherung.'),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf', onclick: sicherungDialog }, 'Sicherung erstellen'),
        h('button', { class: 'knopf', onclick: () => einspielenDialog(ctx) }, 'Sicherung einspielen'),
        h('button', { class: 'knopf knopf-gefahr-leise', onclick: async () => {
          if (await nachfragen('Alles löschen?', 'Alle deine Stapel, Karten, Klausuren und Chats werden gelöscht. Das lässt sich nicht rückgängig machen.', 'Alles löschen', { gefahr: true })) {
            store.resetAll();
            ctx.themeAnwenden();
            toast('Alles gelöscht.');
            ctx.go('start');
          }
        } }, 'Alles löschen'))));
}
