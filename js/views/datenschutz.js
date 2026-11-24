// Datenschutzerklärung – auch ohne Anmeldung erreichbar (#datenschutz)
import { h } from '../dom.js';

let kontakt = null;
async function kontaktLaden(neu) {
  try { const r = await fetch('/api/kontakt'); kontakt = r.ok ? await r.json() : {}; } catch { kontakt = {}; }
  neu();
}

const abschnitt = (titel, ...inhalt) => h('section', { class: 'ds-abschnitt' }, h('h2', null, titel), ...inhalt);
const liste = (...punkte) => h('ul', { class: 'ds-liste' }, punkte.map((p) => h('li', null, p)));

export function datenschutzSeite(neu = () => {}) {
  if (!kontakt) kontaktLaden(neu);
  const k = kontakt || {};
  const verantwortlich = k.name
    ? [h('p', null, k.name), k.ort && h('p', null, k.ort), k.mail && h('p', null, 'E-Mail: ', h('a', { href: `mailto:${k.mail}` }, k.mail))]
    : [h('p', { class: 'hinweis' }, 'Die Kontaktangaben hat der Betreiber noch nicht eingetragen (Verwaltung → Datenschutz).')];

  return h('div', { class: 'seite datenschutz' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Datenschutz')),
    h('p', { class: 'einleitung' }, 'Kurz gesagt: Das Lernheft speichert nur, was es zum Lernen braucht. Keine Werbung, kein Tracking, keine Weitergabe an Dritte – außer an die KI, wenn du sie benutzt.'),

    abschnitt('Wer ist verantwortlich?', ...verantwortlich,
      h('p', { class: 'hinweis' }, 'Das Lernheft ist ein privates, nicht-kommerzielles Lernangebot für eine Lerngruppe.')),

    abschnitt('Was wird gespeichert?',
      liste(
        h('span', null, h('b', null, 'Dein Konto: '), 'Benutzername, Passwort (nur als sicherer Hash mit scrypt, nie im Klartext), Zeitpunkt der letzten Anmeldung.'),
        h('span', null, h('b', null, 'Deine Lerndaten: '), 'Stapel und Karteikarten (auch Bilder darauf), Lernstand, Notizen, Probeklausuren, Klassenarbeits-Termine, Spielstände, Abzeichen und der Verlauf des Lernhelfer-Chats (ohne Fotos).'),
        h('span', null, h('b', null, 'Nutzung der KI: '), 'Wie viele KI-Anfragen du pro Tag stellst – damit das Tageslimit funktioniert. Diese Zahlen werden nach 62 Tagen gelöscht.'),
        h('span', null, h('b', null, 'Geteilte Inhalte: '), 'Stapel und Notizen, die du anderen schickst, mit deinem Namen als Absender.'),
        h('span', null, h('b', null, 'Erinnerungen: '), 'Wenn du sie einschaltest: eine technische Adresse deines Geräts für Mitteilungen und die gewählte Uhrzeit.')),
      h('p', null, 'Gespeichert wird auf dem Server des Betreibers. Jede Nacht entsteht eine Sicherung, die 14 Tage aufbewahrt wird.')),

    abschnitt('Cookies und Speicher im Browser',
      liste(
        h('span', null, h('b', null, 'Ein Anmelde-Cookie '), '(„__Host-lh_sitzung“): hält dich angemeldet, läuft nach 60 Tagen ab oder wenn du dich abmeldest. Es ist technisch notwendig, nur für diese Seite gültig, nur über HTTPS und für Skripte nicht lesbar.'),
        h('span', null, h('b', null, 'Lokaler Speicher '), '(localStorage): merkt sich auf deinem Gerät Einstellungen wie das Aussehen. Beim Abmelden werden Lerndaten auf dem Gerät gelöscht.'),
        h('span', null, h('b', null, 'Offline-Speicher '), '(Service Worker): speichert die Programmdateien der App, damit sie schneller lädt – keine persönlichen Daten.')),
      h('p', null, 'Es gibt keine Werbe-, Analyse- oder Tracking-Cookies. Weil nur technisch notwendige Speicherungen genutzt werden, braucht es kein Cookie-Banner.')),

    abschnitt('Die KI (Claude von Anthropic)',
      h('p', null, 'Wenn du scannst, den Lernhelfer fragst, dir etwas erklären lässt oder eine KI-Klausur machst, schickt der Server den Text bzw. das Foto an Anthropic PBC (USA), damit die KI antworten kann. Dein Name und deine anderen Lerndaten werden dabei nicht mitgeschickt.'),
      h('p', null, 'Nach den Angaben von Anthropic werden Eingaben und Antworten über die API standardmäßig nicht zum Trainieren der KI genutzt und innerhalb von 30 Tagen gelöscht – außer bei Verstößen gegen die Nutzungsrichtlinien oder wenn ein Gesetz es verlangt. Mehr: ', h('a', { href: 'https://privacy.claude.com', target: '_blank', rel: 'noopener' }, 'privacy.claude.com'), '.'),
      h('p', { class: 'hinweis' }, 'Tipp: Fotografier keine Seiten mit Namen, Adressen oder anderen persönlichen Angaben und schreib so etwas nicht in den Chat.')),

    abschnitt('Was nicht passiert',
      liste('Keine Werbung, kein Verkauf von Daten.', 'Keine Verbindung zu Google: Die Schriften liegen auf unserem eigenen Server.', 'Andere Nutzer sehen deine Karten, Notizen und Chats nicht – nur das, was du selbst schickst, und in der Rangliste deinen Namen mit Lernzahlen der letzten 7 Tage.', 'Der Admin (Glenn) sieht in der Verwaltung deine Lernstatistik: wann du zuletzt da warst, wie viel und wie gut du lernst, deine Stapelnamen mit Kartenzahlen, Probeklausur-Ergebnisse und KI-Anfragen. Nicht sichtbar für ihn: die Texte deiner Karten, deine Notizen, Chats und Noten. Dein Passwort kennt niemand – auch der Admin nicht.')),

    abschnitt('Deine Rechte',
      h('p', null, 'Du kannst jederzeit Auskunft verlangen, deine Daten herunterladen (Einstellungen → Sicherung erstellen), sie berichtigen oder löschen lassen (Einstellungen → Konto löschen). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, in Hamburg beim Hamburgischen Beauftragten für Datenschutz und Informationsfreiheit.'),
      h('p', null, 'Wenn du unter 16 bist, sprich bitte mit deinen Eltern, bevor du das Lernheft nutzt.')),

    h('p', { class: 'hinweis' }, 'Stand: November 2026'));
}

export function datenschutz(ctx) {
  return datenschutzSeite(() => { if (location.hash === '#datenschutz') ctx.refresh(); });
}
