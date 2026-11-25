// Lernräume: Video-Anruf (WebRTC, Signale über Abfragen), gemeinsames Whiteboard, gemeinsame Karte, gemeinsamer Timer.
// Alles nur im Arbeitsspeicher – nichts wird gespeichert oder aufgezeichnet.
import crypto from 'node:crypto';
import * as db from './db.js';

const raeume = new Map();
const MAX = 6;
const fehler = (status, m) => Object.assign(new Error(m), { status });

function aufraeumen() {
  const jetzt = Date.now();
  for (const [code, r] of raeume) {
    for (const [n, t] of r.leute) if (jetzt - t.gesehen > 15000) { r.leute.delete(n); r.ereignis += 1; }
    if (!r.leute.size && jetzt - r.erstellt > 60000) raeume.delete(code);
    if (jetzt - r.erstellt > 6 * 3600e3) raeume.delete(code);
  }
}
setInterval(aufraeumen, 5000).unref();

function raum(code, name) {
  const r = raeume.get(code);
  if (!r) throw fehler(404, 'Diesen Lernraum gibt es nicht (mehr). Prüf den Code.');
  if (name && !r.leute.has(name)) throw fehler(403, 'Du bist nicht in diesem Lernraum.');
  return r;
}

export function anlegen(host, titel) {
  aufraeumen();
  let code;
  do code = String(crypto.randomInt(100000, 1000000)); while (raeume.has(code));
  raeume.set(code, { code, host, titel: String(titel || `Lernraum von ${host}`).slice(0, 60), erstellt: Date.now(), leute: new Map(), signale: [], striche: [], strichNr: 0, karte: null, timer: null, ereignis: 0, sigNr: 0 });
  return beitreten(code, host);
}

export function beitreten(code, name) {
  const r = raum(code);
  if (!r.leute.has(name) && r.leute.size >= MAX) throw fehler(400, `Der Lernraum ist voll (höchstens ${MAX} Personen).`);
  // Bei erneutem Beitritt (z. B. Seite neu geladen) alte Signale an diese Person verwerfen
  r.signale = r.signale.filter((s) => s.an !== name && s.von !== name);
  r.leute.set(name, { gesehen: Date.now(), seit: Date.now(), kamera: true, mikro: true, bildschirm: false });
  r.ereignis += 1;
  return stand(code, name, 0, 0);
}

export function verlassen(code, name) {
  const r = raeume.get(code);
  if (r?.leute.delete(name)) { r.ereignis += 1; r.signale = r.signale.filter((s) => s.an !== name && s.von !== name); }
  return { ok: true };
}

export function signal(code, von, { an, typ, daten }) {
  const r = raum(code, von);
  if (!r.leute.has(an)) return { ok: true };
  if (!['offer', 'answer', 'ice', 'neu'].includes(typ)) throw fehler(400, 'Unbekanntes Signal.');
  const json = JSON.stringify(daten ?? null);
  if (json.length > 20000) throw fehler(413, 'Signal zu groß.');
  r.sigNr += 1;
  r.signale.push({ nr: r.sigNr, von, an, typ, daten: JSON.parse(json), t: Date.now() });
  r.signale = r.signale.filter((s) => Date.now() - s.t < 60000).slice(-500);
  return { ok: true };
}

export function status(code, name, { kamera, mikro, bildschirm }) {
  const r = raum(code, name);
  Object.assign(r.leute.get(name), { kamera: Boolean(kamera), mikro: Boolean(mikro), bildschirm: Boolean(bildschirm) });
  r.ereignis += 1;
  return { ok: true };
}

export function zeichnen(code, name, { strich, loeschen }) {
  const r = raum(code, name);
  if (loeschen) { r.striche = []; r.strichNr += 1; r.geloescht = r.strichNr; return { ok: true }; }
  if (!strich || !Array.isArray(strich.p) || strich.p.length > 2000) throw fehler(400, 'Ungültiger Strich.');
  r.strichNr += 1;
  r.striche.push({ nr: r.strichNr, von: name, farbe: /^#[0-9a-f]{6}$/i.test(strich.farbe) ? strich.farbe : '#1b2a5c', breite: Math.min(160, Math.max(1, Number(strich.breite) || 3)), radierer: Boolean(strich.radierer), p: strich.p.map(([x, y]) => [Math.round(Number(x) * 10) / 10 || 0, Math.round(Number(y) * 10) / 10 || 0]) });
  if (r.striche.length > 3000) r.striche = r.striche.slice(-3000);
  return { ok: true };
}

export function karte(code, name, d) {
  const r = raum(code, name);
  if (d === null || d?.ende) { r.karte = null; r.ereignis += 1; return { ok: true }; }
  const k = r.karte;
  if (d.neu) {
    const karten = (Array.isArray(d.karten) ? d.karten : []).slice(0, 60).map((c) => ({ front: String(c.front || '').slice(0, 300), back: String(c.back || '').slice(0, 300) })).filter((c) => c.front && c.back);
    if (!karten.length) throw fehler(400, 'Keine Karten.');
    r.karte = { titel: String(d.titel || '').slice(0, 60), von: name, karten, i: 0, aufgedeckt: false, stimmen: {}, bereit: {}, weiterUm: null, ergebnis: { gewusst: 0, nicht: 0 } };
  } else if (k) {
    if (d.bereit && !k.aufgedeckt) k.bereit[name] = true;
    if (d.aufdecken) k.aufgedeckt = true;
    if (d.stimme && ['gewusst', 'nicht'].includes(d.stimme) && k.aufgedeckt) k.stimmen[name] = d.stimme;
    if (d.weiter) naechsteKarte(k);
    abstimmungPruefen(r);
  }
  r.ereignis += 1;
  return { ok: true };
}

function naechsteKarte(k) {
  for (const v of Object.values(k.stimmen)) k.ergebnis[v] += 1;
  k.i = (k.i + 1) % k.karten.length; k.aufgedeckt = false; k.stimmen = {}; k.bereit = {}; k.weiterUm = null;
}

// Abstimmung: Sind alle bereit, wird aufgedeckt. Haben alle abgestimmt, kommt nach kurzer Pause die nächste Karte.
function abstimmungPruefen(r) {
  const k = r.karte;
  if (!k) return;
  const alle = [...r.leute.keys()];
  if (!k.aufgedeckt && alle.length && alle.every((n) => k.bereit[n])) { k.aufgedeckt = true; r.ereignis += 1; }
  if (k.aufgedeckt && !k.weiterUm && alle.length && alle.every((n) => k.stimmen[n])) { k.weiterUm = Date.now() + 2500; r.ereignis += 1; }
  if (k.weiterUm && Date.now() >= k.weiterUm) { naechsteKarte(k); r.ereignis += 1; }
}

export function timer(code, name, d) {
  const r = raum(code, name);
  if (d?.stopp) r.timer = null;
  else {
    const min = Math.min(90, Math.max(1, Number(d?.minuten) || 25));
    r.timer = { ende: Date.now() + min * 60000, minuten: min, pause: Boolean(d?.pause), von: name };
  }
  r.ereignis += 1;
  return { ok: true };
}

export function stand(code, name, sigSeit, strichSeit) {
  const r = raum(code, name);
  r.leute.get(name).gesehen = Date.now();
  abstimmungPruefen(r);
  const neuGeloescht = r.geloescht && r.geloescht > strichSeit;
  return {
    code: r.code, titel: r.titel, host: r.host, ereignis: r.ereignis,
    leute: [...r.leute.entries()].map(([n, t]) => ({ name: n, kamera: t.kamera, mikro: t.mikro, bildschirm: t.bildschirm, seit: t.seit })),
    signale: r.signale.filter((s) => s.an === name && s.nr > sigSeit).map(({ nr, von, typ, daten }) => ({ nr, von, typ, daten })),
    loeschen: Boolean(neuGeloescht),
    striche: r.striche.filter((s) => s.nr > strichSeit && s.von !== name),
    strichNr: r.strichNr,
    karte: r.karte && { titel: r.karte.titel, von: r.karte.von, i: r.karte.i, n: r.karte.karten.length, front: r.karte.karten[r.karte.i].front, back: r.karte.aufgedeckt ? r.karte.karten[r.karte.i].back : null, stimmen: r.karte.stimmen, bereit: Object.keys(r.karte.bereit), weiterIn: r.karte.weiterUm ? 1 : null, ergebnis: r.karte.ergebnis },
    timer: r.timer && { rest: Math.max(0, r.timer.ende - Date.now()), minuten: r.timer.minuten, pause: r.timer.pause, von: r.timer.von },
  };
}

// ICE-Server: eigener TURN (coturn mit use-auth-secret) falls eingerichtet, sonst öffentlicher STUN
export function ice(name) {
  // TURN aus der Verwaltung, sonst aus Umgebungsvariablen (z. B. turn:lernheft.app:3478)
  const e = db.einstellungen();
  const url = e.turnUrl || process.env.TURN_URL;
  const secret = e.turnSecret || process.env.TURN_SECRET;
  if (url && secret) {
    const user = `${Math.floor(Date.now() / 1000) + 12 * 3600}:${name}`;
    const credential = crypto.createHmac('sha1', secret).update(user).digest('base64');
    const host = url.replace(/^turns?:/, '').split('?')[0];
    return { iceServers: [{ urls: `stun:${host}` }, { urls: [url, `${url}?transport=tcp`], username: user, credential }], turn: true };
  }
  return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], turn: false };
}
