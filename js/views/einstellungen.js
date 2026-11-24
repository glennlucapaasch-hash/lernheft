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
  const neu = h('input', { type: 'password', autocomplete: 'new-password', minlength: '10' });
  const zu = modal('Passwort ändern', h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (neu.value.length < 10) { toast('Das neue Passwort braucht mindestens 10 Zeichen.', 'fehler'); neu.focus(); return; }
    const r = await fetch('/api/passwort', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: JSON.stringify({ alt: alt.value, neu: neu.value }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d?.error?.message || 'Das hat nicht geklappt.', 'fehler'); return; }
    zu();
    toast('Passwort geändert. Bitte melde dich neu an.');
    setTimeout(() => location.reload(), 1500);
  } },
    feld('Bisheriges Passwort', alt),
    feld('Neues Passwort', neu, 'Mindestens 10 Zeichen. Gut merkbar und trotzdem sicher: drei Wörter mit Bindestrich und eine Zahl.'),
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Passwort ändern'))));
}

const b64zuBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
async function pushApi(body) {
  const r = await fetch('/api/push' + (body === 'test' ? '/test' : ''), { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: body && body !== 'test' ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'Das hat nicht geklappt.');
  return d;
}
function erinnerungBereich(ctx) {
  const status = h('p', { class: 'hinweis', role: 'status' }, 'Lade …');
  const zeit = h('input', { type: 'time', value: '17:00', step: '900' });
  const knoepfe = h('div', { class: 'reihe' });
  const kannPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iphoneOhneApp = /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
  let abo = null;
  async function laden() {
    try { const d = await pushApi(); abo = d.abo; zeichnen(d.schluessel); } catch (e) { status.textContent = e.message; }
  }
  function zeichnen(schluessel) {
    if (abo?.zeit) zeit.value = abo.zeit;
    const hier = Notification?.permission === 'granted';
    status.textContent = !kannPush
      ? (iphoneOhneApp ? 'Auf iPhone und iPad gehen Erinnerungen nur, wenn das Lernheft auf dem Home-Bildschirm liegt: Teilen-Knopf → „Zum Home-Bildschirm“, dann von dort öffnen.' : 'Dieser Browser kann keine Mitteilungen empfangen.')
      : abo?.geraete && hier ? `Eingeschaltet – täglich um ${abo.zeit} Uhr, wenn Karten fällig sind oder eine Klassenarbeit näher rückt.` : 'Ausgeschaltet.';
    knoepfe.replaceChildren(
      kannPush && h('button', { class: 'knopf knopf-haupt', onclick: async () => {
        try {
          if ((await Notification.requestPermission()) !== 'granted') { toast('Mitteilungen wurden nicht erlaubt. Du kannst das in den Einstellungen des Geräts ändern.', 'fehler'); return; }
          const reg = await navigator.serviceWorker.ready;
          const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64zuBytes(schluessel) });
          abo = (await pushApi({ sub: sub.toJSON(), zeit: zeit.value, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })).abo;
          toast('Erinnerungen eingeschaltet.');
          zeichnen(schluessel);
        } catch (e) { toast(e.message || 'Einschalten hat nicht geklappt.', 'fehler'); }
      } }, abo?.geraete ? 'Uhrzeit speichern' : 'Erinnerungen einschalten'),
      abo?.geraete && h('button', { class: 'knopf', onclick: async () => { try { await pushApi('test'); toast('Test geschickt.'); } catch (e) { toast(e.message, 'fehler'); } } }, 'Test schicken'),
      abo?.geraete && h('button', { class: 'knopf knopf-leise', onclick: async () => {
        try { const reg = await navigator.serviceWorker.ready; await (await reg.pushManager.getSubscription())?.unsubscribe(); } catch { /* egal */ }
        await pushApi({ aus: true }); abo = null; toast('Erinnerungen ausgeschaltet.'); zeichnen(schluessel);
      } }, 'Ausschalten'));
  }
  laden();
  return h('section', { class: 'blatt' },
    h('h2', null, 'Erinnerungen'),
    h('p', null, 'Einmal am Tag eine Mitteilung aufs Handy: wie viele Karten warten und wann die nächste Klassenarbeit ist.'),
    feld('Uhrzeit', zeit),
    status, knoepfe);
}

function kontoBereich(ctx) {
  const k = ctx.konto;
  return h('section', { class: 'blatt' },
    h('h2', null, 'Dein Konto'),
    h('p', null, 'Angemeldet als ', h('strong', null, k.name), k.admin ? ' (Admin)' : '', '. Deine Karten, Chats und Klausuren werden auf dem Server gespeichert – du siehst sie auf jedem Gerät, auf dem du dich anmeldest.'),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf', onclick: passwortDialog }, 'Passwort ändern'),
      k.admin && h('a', { class: 'knopf', href: '#verwaltung' }, 'Zur Verwaltung'),
      h('button', { class: 'knopf knopf-gefahr-leise', onclick: () => ctx.abmelden() }, 'Abmelden')),
    h('p', { class: 'hinweis' }, h('a', { href: '#datenschutz' }, 'Datenschutz: Was gespeichert wird')),
    !k.admin && h('details', { class: 'konto-loeschen' },
      h('summary', null, 'Konto löschen'),
      h('p', null, 'Dein Zugang und alle deine Karten, Notizen, Chats, Klausuren und geteilten Inhalte werden endgültig gelöscht. Lade vorher eine Sicherung herunter, wenn du etwas behalten willst.'),
      h('form', { class: 'reihe', onsubmit: async (e) => {
        e.preventDefault();
        const pw = e.target.querySelector('input').value;
        const r = await fetch('/api/ich', { method: 'DELETE', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: JSON.stringify({ passwort: pw }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d?.error?.message || 'Das hat nicht geklappt.', 'fehler'); return; }
        try { localStorage.clear(); sessionStorage.clear(); } catch { /* egal */ }
        location.replace('/');
      } },
        h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passwort zur Bestätigung', 'aria-label': 'Passwort zur Bestätigung', required: true }),
        h('button', { class: 'knopf knopf-gefahr', type: 'submit' }, 'Endgültig löschen'))));
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
        { wert: 'oled', titel: 'Schwarz (OLED)', text: 'Ganz schwarz – spart Akku auf dem iPhone' },
      ], e.theme, (v) => { store.setSettings({ theme: v }); ctx.themeAnwenden(); }),
      h('h3', null, 'Schriftgröße'),
      auswahl('schrift', [
        { wert: 'normal', titel: 'Normal' }, { wert: 'gross', titel: 'Groß' }, { wert: 'sehrgross', titel: 'Sehr groß' },
      ], e.schrift || 'normal', (v) => { store.setSettings({ schrift: v }); ctx.themeAnwenden(); }),
      h('h3', null, 'Lernhaustier'),
      feld('Name', h('input', { type: 'text', value: e.haustierName || 'Pixi', maxlength: '20', onchange: (ev) => store.setSettings({ haustierName: ev.target.value.trim() || 'Pixi' }) }))),

    mitKonto && erinnerungBereich(ctx),
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
        } }, 'Alles löschen'))),
    h('p', { class: 'handschrift macher' }, 'Lernheft – gemacht von Glenn'));
}
