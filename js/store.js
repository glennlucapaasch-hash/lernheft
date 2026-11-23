// Alle Daten liegen nur auf diesem Gerät (localStorage). Kein Server, kein Konto.
import { newSrs, schedule, isDue, stufe } from './srs.js';

const KEY = 'lernheft.v1';

export const FAECHER = {
  englisch: { name: 'Englisch', farbe: 'blau', lang: 'en-GB', sprache: 'Englische' },
  franzoesisch: { name: 'Französisch', farbe: 'rosa', lang: 'fr-FR', sprache: 'Französische' },
  spanisch: { name: 'Spanisch', farbe: 'gelb', lang: 'es-ES', sprache: 'Spanische' },
  mathe: { name: 'Mathe', farbe: 'gruen' },
  sonstiges: { name: 'Sonstiges', farbe: 'weiss' },
};

export const MODELLE = [
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5 – schnell und am günstigsten' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5 – ausgewogen (empfohlen)' },
  { id: 'claude-opus-5-5', name: 'Opus 5.5 – am genauesten, teurer' },
];

function leer() {
  return {
    version: 1,
    settings: { name: '', apiKey: '', model: 'claude-sonnet-5-5', theme: 'auto', tagesziel: 20 },
    decks: [],
    cards: [],
    log: {},
    exams: [],
    rechner: { verlauf: [], grad: true },
    chat: [],
  };
}

let state = leer();
let speicher = null;

function sichererSpeicher() {
  try {
    const s = globalThis.localStorage;
    const probe = '__lernheft_probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  }
}

function uebernehmen(daten) {
  const basis = leer();
  const d = daten && typeof daten === 'object' ? daten : {};
  state = {
    ...basis,
    settings: { ...basis.settings, ...(d.settings || {}) },
    decks: Array.isArray(d.decks) ? d.decks.filter((x) => x && x.id && x.name) : [],
    cards: Array.isArray(d.cards)
      ? d.cards.filter((c) => c && c.id && c.deckId).map((c) => ({ ...c, srs: { ...newSrs(), ...(c.srs || {}) } }))
      : [],
    log: d.log && typeof d.log === 'object' ? d.log : {},
    exams: Array.isArray(d.exams) ? d.exams : [],
    rechner: { ...basis.rechner, ...(d.rechner || {}) },
    chat: Array.isArray(d.chat) ? d.chat.filter((m) => m && typeof m.text === 'string').slice(-40) : [],
  };
  for (const dk of state.decks) if (!FAECHER[dk.fach]) dk.fach = 'sonstiges';
  const ids = new Set(state.decks.map((dk) => dk.id));
  state.cards = state.cards.filter((c) => ids.has(c.deckId));
}

export function init(storage) {
  speicher = storage || sichererSpeicher();
  try {
    uebernehmen(JSON.parse(speicher.getItem(KEY) || 'null'));
  } catch {
    state = leer();
  }
  return state;
}

// ---------- Mit Konto: Daten liegen auf dem Server ----------
let fern = null;
let fernTimer = null;
let fernStatus = 'ok'; // 'ok' | 'speichert' | 'fehler'
const fernBeobachter = new Set();
export const speicherStatus = () => fernStatus;
export const beiSpeicherStatus = (fn) => fernBeobachter.add(fn);
function statusSetzen(s) {
  fernStatus = s;
  fernBeobachter.forEach((fn) => { try { fn(s); } catch { /* egal */ } });
}

export function serverModus(daten, speichern) {
  uebernehmen(daten);
  fern = speichern;
}

async function fernSpeichern() {
  fernTimer = null;
  statusSetzen('speichert');
  try {
    await fern(JSON.stringify(state));
    statusSetzen('ok');
  } catch {
    statusSetzen('fehler');
    fernTimer = setTimeout(fernSpeichern, 5000); // später nochmal versuchen
  }
}

export function jetztSpeichern() {
  if (fern && fernTimer) { clearTimeout(fernTimer); fernSpeichern(); }
}

export function save() {
  if (fern) {
    if (fernTimer) clearTimeout(fernTimer);
    fernTimer = setTimeout(fernSpeichern, 700);
    statusSetzen('speichert');
    return;
  }
  try {
    speicher?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Speicher voll oder gesperrt: App läuft weiter, Daten bleiben bis zum Schließen. */
  }
}

export const getState = () => state;

export function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function tagKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- Einstellungen ----------
export function setSettings(patch) {
  Object.assign(state.settings, patch);
  save();
}

// ---------- Stapel ----------
export function addDeck(name, fach = 'sonstiges') {
  const deck = { id: uid(), name: String(name).trim() || 'Neuer Stapel', fach: FAECHER[fach] ? fach : 'sonstiges', createdAt: Date.now() };
  state.decks.push(deck);
  save();
  return deck;
}

export function updateDeck(id, patch) {
  const deck = getDeck(id);
  if (!deck) return;
  if (patch.name !== undefined) deck.name = String(patch.name).trim() || deck.name;
  if (patch.fach !== undefined && FAECHER[patch.fach]) deck.fach = patch.fach;
  save();
}

export function deleteDeck(id) {
  state.decks = state.decks.filter((d) => d.id !== id);
  state.cards = state.cards.filter((c) => c.deckId !== id);
  save();
}

export const getDeck = (id) => state.decks.find((d) => d.id === id);
export const cardsOf = (deckId) => state.cards.filter((c) => c.deckId === deckId);
export const dueCards = (deckId, now = Date.now()) =>
  state.cards.filter((c) => (!deckId || c.deckId === deckId) && isDue(c, now));

// ---------- Karten ----------
export function addCards(deckId, liste) {
  const neu = [];
  for (const k of liste) {
    const front = String(k.front ?? '').trim();
    const back = String(k.back ?? '').trim();
    if (!front || !back) continue;
    neu.push({ id: uid(), deckId, front, back, note: String(k.note ?? '').trim(), createdAt: Date.now(), srs: newSrs() });
  }
  state.cards.push(...neu);
  save();
  return neu;
}

export function updateCard(id, patch) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  for (const feld of ['front', 'back', 'note']) {
    if (patch[feld] !== undefined) card[feld] = String(patch[feld]).trim();
  }
  save();
}

export function deleteCard(id) {
  state.cards = state.cards.filter((c) => c.id !== id);
  save();
}

// Eine Karte wurde abgefragt: neuen Termin setzen und im Lerntagebuch zählen.
export function review(cardId, rating, now = Date.now()) {
  const card = state.cards.find((c) => c.id === cardId);
  if (!card) return;
  card.srs = schedule(card.srs, rating, now);
  const key = tagKey(new Date(now));
  const tag = (state.log[key] ||= { abfragen: 0, richtig: 0 });
  tag.abfragen += 1;
  if (rating >= 1) tag.richtig += 1;
  save();
}

// ---------- Auswertung ----------
export function streak(heute = new Date()) {
  const d = new Date(heute);
  let tage = 0;
  if (!state.log[tagKey(d)]?.abfragen) d.setDate(d.getDate() - 1);
  while (state.log[tagKey(d)]?.abfragen) {
    tage += 1;
    d.setDate(d.getDate() - 1);
  }
  return tage;
}

export function heute() {
  return state.log[tagKey()] || { abfragen: 0, richtig: 0 };
}

export function letzteTage(n = 14, bis = new Date()) {
  const tage = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(bis);
    d.setDate(d.getDate() - i);
    const eintrag = state.log[tagKey(d)] || { abfragen: 0, richtig: 0 };
    tage.push({ datum: d, key: tagKey(d), ...eintrag });
  }
  return tage;
}

export function stufenZahlen(deckId) {
  const z = { neu: 0, lernen: 0, gefestigt: 0, sicher: 0 };
  for (const c of state.cards) if (!deckId || c.deckId === deckId) z[stufe(c.srs)] += 1;
  return z;
}

// ---------- Klausuren ----------
export function saveExam(exam) {
  const i = state.exams.findIndex((e) => e.id === exam.id);
  if (i >= 0) state.exams[i] = exam;
  else state.exams.unshift(exam);
  state.exams = state.exams.slice(0, 30);
  save();
}

export function deleteExam(id) {
  state.exams = state.exams.filter((e) => e.id !== id);
  save();
}

// ---------- Rechner ----------
export function rechnerMerken(eintrag) {
  state.rechner.verlauf.unshift(eintrag);
  state.rechner.verlauf = state.rechner.verlauf.slice(0, 25);
  save();
}

export function setRechner(patch) {
  Object.assign(state.rechner, patch);
  save();
}

// ---------- Sicherung ----------
export function exportData() {
  const kopie = JSON.parse(JSON.stringify(state));
  kopie.settings.apiKey = ''; // der Schlüssel verlässt das Gerät nie
  return JSON.stringify({ app: 'lernheft', ...kopie }, null, 2);
}

export function chatSpeichern(verlauf) {
  state.chat = verlauf.filter((m) => m.text).slice(-40).map(({ role, text }) => ({ role, text }));
  save();
}

export function importData(json) {
  const daten = JSON.parse(json);
  if (!daten || daten.app !== 'lernheft' || !Array.isArray(daten.decks) || !Array.isArray(daten.cards)) {
    throw new Error('Das ist keine Lernheft-Sicherung.');
  }
  const key = state.settings.apiKey;
  uebernehmen(daten);
  state.settings.apiKey = key;
  save();
}

export function resetAll() {
  state = leer();
  save();
}

// ---------- Beispielstapel ----------
export function beispieleLaden() {
  const en = addDeck('Unit 1 – At school', 'englisch');
  addCards(en.id, [
    { front: 'timetable', back: 'der Stundenplan' },
    { front: 'break', back: 'die Pause' },
    { front: 'homework', back: 'die Hausaufgaben' },
    { front: 'to borrow', back: 'ausleihen', note: 'Can I borrow your pen?' },
    { front: 'subject', back: 'das Schulfach' },
    { front: 'to explain', back: 'erklären' },
    { front: 'pencil case', back: 'das Federmäppchen' },
    { front: 'ruler', back: 'das Lineal' },
    { front: 'to revise', back: 'wiederholen', note: 'für eine Arbeit lernen' },
    { front: 'mark', back: 'die Note' },
    { front: 'canteen', back: 'die Mensa' },
    { front: 'headteacher', back: 'der Schulleiter, die Schulleiterin' },
  ]);
  const ma = addDeck('Terme und Gleichungen', 'mathe');
  addCards(ma.id, [
    { front: 'Löse: 3x + 5 = 20', back: 'x = 5', note: '3x = 15, dann durch 3 teilen' },
    { front: 'Berechne 15 % von 80', back: '12', note: '80 · 0,15' },
    { front: 'Vereinfache: 2(x + 3) − x', back: 'x + 6', note: '2x + 6 − x' },
    { front: 'Löse: x² = 49', back: 'x = 7 oder x = −7' },
    { front: 'Berechne: 3/4 + 1/8', back: '7/8', note: '6/8 + 1/8' },
    { front: 'Flächeninhalt eines Kreises mit r = 3 cm', back: 'A ≈ 28,27 cm²', note: 'A = π · r²' },
  ]);
  return en;
}
