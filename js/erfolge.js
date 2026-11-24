// Level, Abzeichen und Wochenrückblick – alles aus den vorhandenen Lerndaten berechnet.
import * as store from './store.js';
import { stufe } from './srs.js';

const tagKey = store.tagKey;

function summen(log) {
  let abfragen = 0, richtig = 0, perfekt = false;
  for (const t of Object.values(log)) {
    abfragen += t.abfragen || 0;
    richtig += t.richtig || 0;
    if (t.abfragen >= 20 && t.richtig === t.abfragen) perfekt = true;
  }
  return { abfragen, richtig, perfekt };
}

export function laengsteSerie(log) {
  const tage = Object.keys(log).filter((k) => log[k]?.abfragen).sort();
  let best = 0, akt = 0, vorher = null;
  for (const k of tage) {
    const d = new Date(`${k}T12:00:00`);
    akt = vorher && Math.round((d - vorher) / 864e5) === 1 ? akt + 1 : 1;
    best = Math.max(best, akt);
    vorher = d;
  }
  return best;
}

export function werte() {
  const s = store.getState();
  const { abfragen, richtig, perfekt } = summen(s.log);
  const sicher = s.cards.filter((c) => stufe(c.srs) === 'sicher').length;
  return {
    abfragen, richtig, perfekt, sicher,
    serie: laengsteSerie(s.log),
    karten: s.cards.length, stapel: s.decks.length,
    klausuren: s.exams.length, einser: s.exams.some((e) => e.note === 1),
    notizen: s.notizen.filter((n) => n.striche.length || n.text).length,
    blitz: s.spiele.blitz || 0, memory: s.spiele.memory || 0, duellSiege: s.spiele.duellSiege || 0, duelle: s.spiele.duelle || 0,
    termine: s.termine.length,
  };
}

export const ABZEICHEN = [
  { id: 'start', icon: '🌱', name: 'Erster Schritt', text: 'Die erste Karte abgefragt', ok: (w) => w.abfragen >= 1 },
  { id: 'a100', icon: '💯', name: 'Hunderter', text: '100 Abfragen', ok: (w) => w.abfragen >= 100 },
  { id: 'a1000', icon: '🚀', name: 'Tausender', text: '1000 Abfragen', ok: (w) => w.abfragen >= 1000 },
  { id: 's3', icon: '🔥', name: 'Am Ball', text: '3 Tage am Stück gelernt', ok: (w) => w.serie >= 3 },
  { id: 's7', icon: '📅', name: 'Eine Woche durch', text: '7 Tage am Stück gelernt', ok: (w) => w.serie >= 7 },
  { id: 's30', icon: '🏔️', name: 'Durchhalter', text: '30 Tage am Stück gelernt', ok: (w) => w.serie >= 30 },
  { id: 'sicher25', icon: '🧠', name: 'Sitzt!', text: '25 Karten auf „sicher“', ok: (w) => w.sicher >= 25 },
  { id: 'sicher200', icon: '🏛️', name: 'Wissensspeicher', text: '200 Karten auf „sicher“', ok: (w) => w.sicher >= 200 },
  { id: 'k100', icon: '🗂️', name: 'Sammler', text: '100 Karteikarten angelegt', ok: (w) => w.karten >= 100 },
  { id: 'perfekt', icon: '✨', name: 'Fehlerfrei', text: 'An einem Tag 20 Karten ohne Fehler', ok: (w) => w.perfekt },
  { id: 'klausur', icon: '📝', name: 'Prüfling', text: 'Erste Probeklausur geschrieben', ok: (w) => w.klausuren >= 1 },
  { id: 'einser', icon: '🥇', name: 'Einser-Kandidat', text: 'Eine 1 in der Probeklausur', ok: (w) => w.einser },
  { id: 'notiz', icon: '✏️', name: 'Mitschreiber', text: 'Erste Notiz geschrieben', ok: (w) => w.notizen >= 1 },
  { id: 'notiz10', icon: '📚', name: 'Heftführer', text: '10 Notizen geschrieben', ok: (w) => w.notizen >= 10 },
  { id: 'plan', icon: '🗓️', name: 'Vorausplaner', text: 'Eine Klassenarbeit eingetragen', ok: (w) => w.termine >= 1 },
  { id: 'memory', icon: '🃏', name: 'Gutes Gedächtnis', text: 'Ein Memory gelöst', ok: (w) => w.memory >= 1 },
  { id: 'blitz15', icon: '⚡', name: 'Blitzschnell', text: '15 Punkte in der Blitzrunde', ok: (w) => w.blitz >= 15 },
  { id: 'blitz30', icon: '🌩️', name: 'Gewitter im Kopf', text: '30 Punkte in der Blitzrunde', ok: (w) => w.blitz >= 30 },
  { id: 'duell', icon: '⚔️', name: 'Herausforderer', text: 'Bei einem Duell mitgespielt', ok: (w) => w.duelle >= 1 },
  { id: 'sieg', icon: '👑', name: 'Duell-Champion', text: 'Ein Duell gewonnen', ok: (w) => w.duellSiege >= 1 },
];

const TITEL = ['Neuling', 'Lernling', 'Fleißbiene', 'Wissensjäger', 'Aufsteiger', 'Kenner', 'Profi', 'Experte', 'Meister', 'Genie', 'Legende'];
export function level(w = werte()) {
  const xp = w.abfragen + w.richtig + w.klausuren * 25 + w.notizen * 10 + w.blitz * 2 + w.memory * 5 + w.duelle * 15 + w.duellSiege * 40;
  const lvl = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 30)) / 2));
  const start = 30 * lvl * (lvl - 1);
  const ziel = 30 * (lvl + 1) * lvl;
  return { xp, lvl, titel: TITEL[Math.min(lvl - 1, TITEL.length - 1)], start, ziel, anteil: (xp - start) / (ziel - start) };
}

// Gibt neu erreichte Abzeichen zurück und merkt sie sich (mit Datum).
export function neueAbzeichen() {
  const s = store.getState();
  const w = werte();
  const neu = ABZEICHEN.filter((a) => !s.abzeichen[a.id] && a.ok(w));
  if (neu.length) {
    for (const a of neu) s.abzeichen[a.id] = Date.now();
    store.save();
  }
  return neu;
}

// ---------- Wochenrückblick ----------
function woche(versatz) {
  const s = store.getState();
  let abfragen = 0, richtig = 0, aktiv = 0, bester = null;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i - versatz * 7);
    const t = s.log[tagKey(d)];
    if (t?.abfragen) { aktiv += 1; abfragen += t.abfragen; richtig += t.richtig || 0; if (!bester || t.abfragen > bester.n) bester = { n: t.abfragen, d }; }
  }
  return { abfragen, richtig, aktiv, bester };
}

export function rueckblick() {
  const s = store.getState();
  const seit = Date.now() - 7 * 864e5;
  const jetzt = woche(0);
  const vorher = woche(1);
  const klausuren = s.exams.filter((e) => e.datum >= seit);
  return {
    ...jetzt,
    quote: jetzt.abfragen ? Math.round((jetzt.richtig / jetzt.abfragen) * 100) : 0,
    vorherAbfragen: vorher.abfragen,
    neueKarten: s.cards.filter((c) => c.createdAt >= seit).length,
    sicher: s.cards.filter((c) => stufe(c.srs) === 'sicher').length,
    klausuren: klausuren.length,
    besteNote: klausuren.length ? Math.min(...klausuren.map((k) => k.note)) : null,
    notizen: s.notizen.filter((n) => n.geaendert >= seit).length,
    abzeichen: ABZEICHEN.filter((a) => s.abzeichen[a.id] >= seit),
    naechster: s.termine.find((t) => new Date(`${t.datum}T23:59:00`) > new Date()),
  };
}
