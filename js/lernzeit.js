// Lernzeit messen – NUR für das Konto „glenn“.
// Gezählt wird nur aktive Zeit: Seite sichtbar und in der letzten Minute benutzt.
import * as store from './store.js';
import { FAECHER } from './store.js';

const LERN_BEREICHE = {
  abfrage: 'Karteikarten abfragen', karten: 'Karteikarten bearbeiten', notizen: 'Notizen', themen: 'Themen lesen',
  chat: 'Lernhelfer', spiele: 'Spiele', klausur: 'Probeklausur', scannen: 'Scannen', mathe: 'Mathe-Werkzeuge',
};
export const bereichName = (k) => LERN_BEREICHE[k] || k;
export const fachName = (k) => FAECHER[k]?.name || 'Ohne Fach';

let aktiv = false;
let letzteAktion = Date.now();
let puffer = {}; // "bereich|fach" -> Sekunden
let wasGerade = () => null;

export function starten(ermitteln) {
  if (aktiv) return;
  aktiv = true;
  wasGerade = ermitteln;
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) addEventListener(ev, () => { letzteAktion = Date.now(); }, { passive: true, capture: true });
  setInterval(() => {
    if (document.visibilityState !== 'visible' || Date.now() - letzteAktion > 60000) return;
    const w = wasGerade();
    if (!w || !LERN_BEREICHE[w.bereich]) return;
    const k = `${w.bereich}|${w.fach || ''}`;
    puffer[k] = (puffer[k] || 0) + 5;
  }, 5000);
  setInterval(sichern, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sichern(); });
}
export const laeuft = () => aktiv;

export function sichern() {
  const eintraege = Object.entries(puffer);
  if (!eintraege.length) return;
  puffer = {};
  const s = store.getState();
  s.lernzeit ||= {};
  const tag = (s.lernzeit[store.tagKey()] ||= {});
  for (const [k, sek] of eintraege) tag[k] = (tag[k] || 0) + sek;
  store.save();
}

// ---------- Auswertung ----------
export function tage(n = 14) {
  const lz = store.getState().lernzeit || {};
  const liste = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const t = lz[store.tagKey(d)] || {};
    liste.push({ datum: d, sek: Object.values(t).reduce((a, b) => a + b, 0) + (i === 0 ? Object.values(puffer).reduce((a, b) => a + b, 0) : 0) });
  }
  return liste;
}
export function aufteilung(nTage = 7) {
  const lz = store.getState().lernzeit || {};
  const bereiche = {}, faecher = {};
  for (let i = 0; i < nTage; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const t = { ...(lz[store.tagKey(d)] || {}) };
    if (i === 0) for (const [k, v] of Object.entries(puffer)) t[k] = (t[k] || 0) + v;
    for (const [k, sek] of Object.entries(t)) {
      const [b, f] = k.split('|');
      bereiche[b] = (bereiche[b] || 0) + sek;
      if (f) faecher[f] = (faecher[f] || 0) + sek;
    }
  }
  const sortiert = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { bereiche: sortiert(bereiche), faecher: sortiert(faecher) };
}
export function dauer(sek) {
  const m = Math.round(sek / 60);
  if (m < 60) return `${m} Min.`;
  return `${Math.floor(m / 60)} Std. ${m % 60 ? `${m % 60} Min.` : ''}`.trim();
}
