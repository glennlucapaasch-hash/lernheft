// Noten rechnen: mündlich/schriftlich gewichtet, Durchschnitte, Trend und Empfehlungen
import * as store from './store.js';
import { FAECHER } from './store.js';

export const istPunkte = () => store.getState().notenEinst.system === 'punkte';

// "2-" → 2,3 · "2+" → 1,7 · "2,5" → 2,5 · Punkte: 0–15
export function noteLesen(text) {
  const t = String(text).trim().replace(',', '.');
  if (istPunkte()) {
    const p = Number(t);
    return Number.isInteger(p) && p >= 0 && p <= 15 ? p : null;
  }
  const m = /^([1-6])\s*([+-])?$/.exec(t);
  if (m) {
    const z = Number(m[1]) + (m[2] === '-' ? 0.3 : m[2] === '+' ? -0.3 : 0);
    return z >= 0.7 && z <= 6 ? Math.round(z * 10) / 10 : null;
  }
  const z = Number(t);
  return Number.isFinite(z) && z >= 1 && z <= 6 ? z : null;
}

export const zahl = (n, stellen = 2) => (n == null ? '–' : n.toFixed(stellen).replace('.', ','));
const mittel = (l) => (l.length ? l.reduce((s, n) => s + n.wert, 0) / l.length : null);

export function gewicht(fach) {
  const e = store.getState().notenEinst;
  return Number.isFinite(e.faecher?.[fach]) ? e.faecher[fach] : e.muendlich;
}

// Note 1 = gut … 6 = schlecht; Punkte 15 = gut … 0 = schlecht. "besser" vergleicht richtig herum.
export const besser = (a, b) => (istPunkte() ? a > b : a < b);
export const schlechtGrenze = () => (istPunkte() ? 7 : 3.5); // ab hier lohnt sich gezieltes Üben

export function fachStand(fach) {
  const alle = store.getState().noten.filter((n) => n.fach === fach).sort((a, b) => a.datum.localeCompare(b.datum));
  const m = alle.filter((n) => n.art === 'muendlich');
  const s = alle.filter((n) => n.art === 'schriftlich');
  const dm = mittel(m);
  const ds = mittel(s);
  const g = gewicht(fach) / 100;
  const gesamt = dm != null && ds != null ? dm * g + ds * (1 - g) : (dm ?? ds);
  // Trend: letzte zwei Noten gegen die davor
  let trend = 0;
  if (alle.length >= 3) {
    const neu = mittel(alle.slice(-2));
    const alt = mittel(alle.slice(0, -2));
    const diff = istPunkte() ? neu - alt : alt - neu;
    trend = diff > 0.25 ? 1 : diff < -0.25 ? -1 : 0;
  }
  return { fach, alle, m, s, dm, ds, gesamt, trend, gewicht: gewicht(fach) };
}

export function uebersicht() {
  const faecher = [...new Set(store.getState().noten.map((n) => n.fach))];
  const staende = faecher.map(fachStand).filter((f) => f.gesamt != null)
    .sort((a, b) => (besser(a.gesamt, b.gesamt) ? 1 : -1)); // schlechteste zuerst
  const schnitt = staende.length ? staende.reduce((s, f) => s + f.gesamt, 0) / staende.length : null;
  return { staende, schnitt };
}

export function empfehlungen() {
  const { staende } = uebersicht();
  const s = store.getState();
  const tipps = [];
  const grenze = schlechtGrenze();
  for (const f of staende) {
    const name = FAECHER[f.fach]?.name || f.fach;
    const schwach = istPunkte() ? f.gesamt < grenze : f.gesamt > grenze;
    const termin = s.termine.find((t) => (t.fach === f.fach || s.decks.some((d) => t.deckIds?.includes(d.id) && d.fach === f.fach)) && new Date(`${t.datum}T23:59`) > new Date());
    const karten = s.cards.filter((c) => s.decks.find((d) => d.id === c.deckId)?.fach === f.fach).length;
    if (schwach) tipps.push({ fach: f.fach, wichtig: 3, text: `${name} steht bei ${zahl(f.gesamt)} – hier lohnt sich am meisten Übung.`, aktion: karten ? 'karten' : 'themen' });
    if (f.dm != null && f.ds != null) {
      const diff = istPunkte() ? f.dm - f.ds : f.ds - f.dm;
      if (diff >= 0.7) tipps.push({ fach: f.fach, wichtig: 2, text: `In ${name} sind deine schriftlichen Noten deutlich schlechter als die mündlichen. Schreib Probeklausuren unter Zeitdruck.`, aktion: 'klausur' });
      else if (diff <= -0.7) tipps.push({ fach: f.fach, wichtig: 2, text: `In ${name} bist du mündlich schwächer. Üb mit der mündlichen Abfrage und erklär Themen laut – oder frag den Lernhelfer.`, aktion: 'muendlich' });
    }
    if (f.trend < 0) tipps.push({ fach: f.fach, wichtig: 2, text: `${name}: Deine letzten Noten sind schlechter geworden. Wiederhol die letzten Themen, bevor Neues dazukommt.`, aktion: 'karten' });
    if (f.trend > 0) tipps.push({ fach: f.fach, wichtig: 0, text: `${name} wird besser – weiter so! 📈`, aktion: null });
    if (termin && schwach) tipps.push({ fach: f.fach, wichtig: 4, text: `${termin.titel} am ${new Date(`${termin.datum}T00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}: Lern jeden Tag dein Pensum auf der Startseite.`, aktion: 'start' });
    if (!karten && schwach) tipps.push({ fach: f.fach, wichtig: 1, text: `Für ${name} hast du noch keine Karteikarten. Scanne eine Buchseite oder hol dir Übungskarten aus den Themen.`, aktion: 'scannen' });
  }
  return tipps.sort((a, b) => b.wichtig - a.wichtig).slice(0, 6);
}
