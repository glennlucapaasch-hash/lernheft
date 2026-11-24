// Kleine Lern-Extras: Karte des Tages, Fehler-Training, Mini-Aufgaben, Lernhaustier
import * as store from './store.js';
import { level } from './erfolge.js';

function zufallAusDatum(seed) {
  let x = 0;
  for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
}

export function karteDesTages() {
  const karten = store.getState().cards.filter((c) => c.front && c.back);
  if (!karten.length) return null;
  const r = zufallAusDatum(store.tagKey());
  return karten[Math.floor(r() * karten.length)];
}

// Die schwersten Karten: oft vergessen, niedrige Leichtigkeit
export function fehlerKarten(max = 25) {
  return store.getState().cards
    .filter((c) => (c.srs?.lapses || 0) > 0 || (c.srs?.seen && (c.srs?.ease ?? 2.5) < 2.2))
    .sort((a, b) => (b.srs.lapses || 0) - (a.srs.lapses || 0) || (a.srs.ease ?? 2.5) - (b.srs.ease ?? 2.5))
    .slice(0, max);
}

// ---------- Tägliche Mini-Aufgaben ----------
const VORLAGEN = [
  { id: 'abfragen10', text: '10 Karten abfragen', ziel: 10, wert: (s, t) => s.log[t]?.abfragen || 0, xp: 20 },
  { id: 'abfragen25', text: '25 Karten abfragen', ziel: 25, wert: (s, t) => s.log[t]?.abfragen || 0, xp: 40 },
  { id: 'richtig15', text: '15 Karten richtig wissen', ziel: 15, wert: (s, t) => s.log[t]?.richtig || 0, xp: 30 },
  { id: 'spiel', text: 'Ein Spiel spielen', ziel: 1, wert: (s, t) => (s.spieleHeute?.[t] || 0), xp: 15 },
  { id: 'notiz', text: 'Eine Notiz schreiben oder ergänzen', ziel: 1, wert: (s) => s.notizen.filter((n) => n.geaendert && store.tagKey(new Date(n.geaendert)) === store.tagKey()).length, xp: 15 },
  { id: 'karte', text: 'Eine neue Karte anlegen', ziel: 1, wert: (s) => s.cards.filter((c) => c.createdAt && store.tagKey(new Date(c.createdAt)) === store.tagKey()).length, xp: 10 },
];
export function miniAufgaben() {
  const s = store.getState();
  const t = store.tagKey();
  const r = zufallAusDatum(`aufgaben-${t}`);
  const pool = [...VORLAGEN];
  const wahl = [];
  while (wahl.length < 3 && pool.length) wahl.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return wahl.map((a) => {
    const wert = Math.min(a.ziel, a.wert(s, t));
    return { ...a, stand: wert, fertig: wert >= a.ziel, belohnt: Boolean(s.aufgabenErledigt[`${t}:${a.id}`]) };
  });
}
// Für erledigte Aufgaben Bonus-Punkte gutschreiben (einmal pro Aufgabe und Tag)
export function aufgabenBelohnen() {
  const s = store.getState();
  const t = store.tagKey();
  const neu = miniAufgaben().filter((a) => a.fertig && !a.belohnt);
  for (const a of neu) { s.aufgabenErledigt[`${t}:${a.id}`] = true; s.bonusXp = (s.bonusXp || 0) + a.xp; }
  // alte Einträge aufräumen
  for (const k of Object.keys(s.aufgabenErledigt)) if (k.slice(0, 10) < store.tagKey(new Date(Date.now() - 14 * 864e5))) delete s.aufgabenErledigt[k];
  if (neu.length) store.save();
  return neu;
}
export function spielGespielt() {
  const s = store.getState();
  s.spieleHeute = { [store.tagKey()]: (s.spieleHeute?.[store.tagKey()] || 0) + 1 };
  store.save();
}

// ---------- Lernhaustier: wächst mit dem Level, Laune hängt an der Serie ----------
const STUFEN = [['🥚', 'Ei'], ['🐣', 'Küken'], ['🐥', 'Kleiner Vogel'], ['🐦', 'Vogel'], ['🦉', 'Weise Eule'], ['🦅', 'Adler']];
export function haustier() {
  const s = store.getState();
  const l = level();
  const st = STUFEN[Math.min(STUFEN.length - 1, Math.floor((l.lvl - 1) / 2))];
  const heute = s.log[store.tagKey()]?.abfragen || 0;
  const serie = store.streak();
  const laune = heute >= 10 ? ['glücklich', '🥰', 'Ich bin satt und glücklich!'] : heute > 0 ? ['zufrieden', '🙂', 'Noch ein paar Karten, dann bin ich satt.'] : serie > 0 ? ['hungrig', '😋', 'Ich hab Hunger – lern ein paar Karten mit mir!'] : ['traurig', '🥺', 'Ich vermisse dich. Lass uns zusammen lernen!'];
  return { icon: st[0], name: s.settings.haustierName || 'Pixi', art: st[1], laune: laune[0], gesicht: laune[1], spruch: laune[2], futter: Math.min(1, heute / 10) };
}
