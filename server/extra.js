// Zusatzfunktionen des Servers: Sicherung, geteilte Stapel, Rangliste, Erinnerungen (Web-Push).
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as db from './db.js';

let ordner = '';
const lesen = (d, s) => { try { return JSON.parse(readFileSync(path.join(ordner, d), 'utf8')); } catch { return s; } };
function schreiben(d, daten) {
  const ziel = path.join(ordner, d);
  writeFileSync(`${ziel}.tmp`, JSON.stringify(daten), { mode: 0o600 });
  renameSync(`${ziel}.tmp`, ziel);
}
export function oeffnen(pfad) {
  ordner = pfad;
  mkdirSync(path.join(ordner, 'sicherungen'), { recursive: true });
}

// ---------- Sicherung ----------
export function sicherungDaten({ mitGeheimnissen = false } = {}) {
  const nutzer = {};
  for (const k of db.kontenListe()) nutzer[k.name] = db.datenLesen(k.name);
  const einst = lesen('einstellungen.json', {});
  if (!mitGeheimnissen) delete einst.apiKey;
  return { app: 'lernheft-server', datum: new Date().toISOString(), konten: lesen('konten.json', {}), einstellungen: einst, geteilt: lesen('geteilt.json', []), nutzer };
}
export function naechtlicheSicherung() {
  const tag = new Date().toISOString().slice(0, 10);
  const dir = path.join(ordner, 'sicherungen');
  const vorhanden = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (vorhanden.includes(`${tag}.json`)) return;
  writeFileSync(path.join(dir, `${tag}.json`), JSON.stringify(sicherungDaten({ mitGeheimnissen: true })), { mode: 0o600 });
  for (const alt of vorhanden.slice(0, Math.max(0, vorhanden.length + 1 - 14))) rmSync(path.join(dir, alt), { force: true });
}

// ---------- Geteilte Stapel ----------
export const geteiltListe = () => lesen('geteilt.json', []).map(({ karten, ...rest }) => ({ ...rest, anzahl: karten.length }));
export const geteiltHolen = (id) => lesen('geteilt.json', []).find((g) => g.id === id);
export function geteiltAnlegen(von, { name, fach, karten }) {
  if (!name || !Array.isArray(karten) || !karten.length) throw Object.assign(new Error('Der Stapel ist leer.'), { status: 400 });
  const liste = lesen('geteilt.json', []);
  const eintrag = {
    id: crypto.randomUUID(), von, name: String(name).slice(0, 60), fach: String(fach || 'sonstiges').slice(0, 20), datum: Date.now(),
    karten: karten.slice(0, 500).map((k) => ({ front: String(k.front || '').slice(0, 600), back: String(k.back || '').slice(0, 1500), note: String(k.note || '').slice(0, 400), bildVorn: k.bildVorn || undefined, bildHinten: k.bildHinten || undefined })),
  };
  liste.unshift(eintrag);
  schreiben('geteilt.json', liste.slice(0, 200));
  return { id: eintrag.id };
}
export function geteiltLoeschen(id, wer, admin) {
  const liste = lesen('geteilt.json', []);
  const e = liste.find((g) => g.id === id);
  if (!e) throw Object.assign(new Error('Gibt es nicht mehr.'), { status: 404 });
  if (e.von !== wer && !admin) throw Object.assign(new Error('Nur wer geteilt hat, kann das löschen.'), { status: 403 });
  schreiben('geteilt.json', liste.filter((g) => g.id !== id));
}

// ---------- Rangliste ----------
function tagKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function rangliste() {
  const heute = new Date();
  return db.kontenListe().map((k) => {
    const d = db.datenLesen(k.name);
    const log = d.log || {};
    let woche = 0;
    for (let i = 0; i < 7; i++) { const t = new Date(heute); t.setDate(t.getDate() - i); woche += log[tagKey(t)]?.abfragen || 0; }
    let serie = 0;
    const t = new Date(heute);
    if (!log[tagKey(t)]?.abfragen) t.setDate(t.getDate() - 1);
    while (log[tagKey(t)]?.abfragen) { serie += 1; t.setDate(t.getDate() - 1); }
    return { name: k.name, woche, serie, blitz: d.spiele?.blitz || 0 };
  }).sort((a, b) => b.woche - a.woche || b.serie - a.serie);
}

// ---------- Erinnerungen (Web-Push, RFC 8291/8292, ohne Fremdbibliothek) ----------
function vapid() {
  let v = lesen('vapid.json', null);
  if (!v) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    v = { pub: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'), priv: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
    schreiben('vapid.json', v);
  }
  return v;
}
export const vapidOeffentlich = () => vapid().pub;

const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
function verschluesseln(sub, text) {
  const uaPub = Buffer.from(sub.keys.p256dh, 'base64url');
  const auth = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const ikm = hkdf(auth, ecdh.computeSecret(uaPub), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const inhalt = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const kopf = Buffer.alloc(86);
  salt.copy(kopf, 0); kopf.writeUInt32BE(4096, 16); kopf.writeUInt8(65, 20); asPub.copy(kopf, 21);
  return Buffer.concat([kopf, inhalt]);
}
export async function pushSenden(sub, nachricht) {
  const v = vapid();
  const ziel = new URL(sub.endpoint);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigniert = `${b64({ typ: 'JWT', alg: 'ES256' })}.${b64({ aud: ziel.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:hallo@lernheft.app' })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigniert), { key: v.priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { authorization: `vapid t=${unsigniert}.${sig}, k=${v.pub}`, ttl: '43200', urgency: 'normal', 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream' },
    body: verschluesseln(sub, JSON.stringify(nachricht)),
    signal: AbortSignal.timeout(15000),
  });
  return r.status;
}

export function aboSetzen(name, { sub, zeit, tz, aus }) {
  const abos = lesen('push.json', {});
  const a = abos[name] || { subs: [], zeit: '17:00', tz: 'Europe/Berlin', zuletzt: '' };
  if (aus) { delete abos[name]; schreiben('push.json', abos); return null; }
  if (sub?.endpoint && sub?.keys?.p256dh && sub?.keys?.auth && /^https:\/\//.test(sub.endpoint)) {
    a.subs = [...a.subs.filter((s) => s.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: sub.keys }].slice(-5);
  }
  if (/^\d\d:\d\d$/.test(zeit || '')) a.zeit = zeit;
  if (tz) { try { new Intl.DateTimeFormat('de', { timeZone: tz }); a.tz = tz; } catch { /* bleibt */ } }
  abos[name] = a;
  schreiben('push.json', abos);
  return { zeit: a.zeit, geraete: a.subs.length };
}
export const aboLesen = (name) => { const a = lesen('push.json', {})[name]; return a ? { zeit: a.zeit, geraete: a.subs.length } : null; };

function ortszeit(tz) {
  const t = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { tag: `${t.year}-${t.month}-${t.day}`, zeit: `${t.hour}:${t.minute}` };
}
export function nachrichtFuer(name) {
  const d = db.datenLesen(name);
  const jetzt = Date.now();
  const faellig = (d.cards || []).filter((c) => (c.srs?.due ?? 0) <= jetzt).length;
  const termin = (d.termine || []).filter((t) => new Date(t.datum).getTime() + 864e5 > jetzt).sort((a, b) => a.datum.localeCompare(b.datum))[0];
  const tage = termin ? Math.ceil((new Date(termin.datum).getTime() - jetzt) / 864e5) : null;
  if (!faellig && !(termin && tage <= 7)) return null;
  const text = [faellig ? `${faellig} ${faellig === 1 ? 'Karte wartet' : 'Karten warten'} auf dich.` : '', termin && tage <= 7 ? `${termin.titel}: ${tage <= 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`}!` : ''].filter(Boolean).join(' ');
  return { titel: 'Lernheft', text };
}
export async function erinnerungenPruefen() {
  const abos = lesen('push.json', {});
  let geaendert = false;
  for (const [name, a] of Object.entries(abos)) {
    const { tag, zeit } = ortszeit(a.tz || 'Europe/Berlin');
    if (a.zuletzt === tag || zeit < a.zeit) continue;
    a.zuletzt = tag;
    geaendert = true;
    const n = nachrichtFuer(name);
    if (!n) continue;
    for (const sub of [...a.subs]) {
      try {
        const s = await pushSenden(sub, n);
        if (s === 404 || s === 410) a.subs = a.subs.filter((x) => x !== sub);
      } catch { /* nächstes Mal */ }
    }
  }
  if (geaendert) schreiben('push.json', abos);
}

export async function testSenden(name) {
  const a = lesen('push.json', {})[name];
  let ok = 0;
  for (const sub of a?.subs || []) { try { if ((await pushSenden(sub, { titel: 'Lernheft', text: 'So sieht deine Erinnerung aus. 👋' })) < 300) ok += 1; } catch { /* egal */ } }
  return ok;
}

// ---------- Gruppen-Duell (live, im Speicher) ----------
const raeume = new Map();
const FRAGE_MS = 15000;
const AUFLOESUNG_MS = 4000;
const fehlerMit = (status, m) => Object.assign(new Error(m), { status });

function weiter(r) {
  const jetzt = Date.now();
  for (;;) {
    if (r.phase === 'frage') {
      const alle = [...r.spieler.values()].every((s) => r.i in s.antworten);
      if (alle || jetzt - r.seit >= FRAGE_MS) { r.phase = 'aufloesung'; r.seit = alle ? jetzt : r.seit + FRAGE_MS; continue; }
    } else if (r.phase === 'aufloesung' && jetzt - r.seit >= AUFLOESUNG_MS) {
      r.i += 1;
      r.seit += AUFLOESUNG_MS;
      r.phase = r.i >= r.fragen.length ? 'ende' : 'frage';
      if (r.phase === 'frage') r.seit = Math.max(r.seit, jetzt - 1000);
      continue;
    }
    return;
  }
}

function aufraeumen() {
  for (const [c, r] of raeume) if (Date.now() - r.erstellt > 2 * 3600e3) raeume.delete(c);
}

export function duellAnlegen(host, { titel, fragen }) {
  aufraeumen();
  if (!Array.isArray(fragen) || fragen.length < 3) throw fehlerMit(400, 'Für ein Duell braucht es mindestens 3 Fragen.');
  let code;
  do code = String(crypto.randomInt(1000, 10000)); while (raeume.has(code));
  const r = {
    code, host, titel: String(titel || 'Duell').slice(0, 60), erstellt: Date.now(), phase: 'lobby', i: 0, seit: Date.now(),
    fragen: fragen.slice(0, 20).map((f) => ({ frage: String(f.frage).slice(0, 300), opts: f.opts.slice(0, 4).map((o) => String(o).slice(0, 200)), antwort: String(f.antwort).slice(0, 200) })),
    spieler: new Map([[host, { punkte: 0, antworten: {} }]]),
  };
  raeume.set(code, r);
  return { code };
}

function raum(code) {
  const r = raeume.get(code);
  if (!r) throw fehlerMit(404, 'Dieses Duell gibt es nicht (mehr). Prüf den Code.');
  weiter(r);
  return r;
}

export function duellBeitreten(code, name) {
  const r = raum(code);
  if (!r.spieler.has(name)) {
    if (r.phase !== 'lobby') throw fehlerMit(400, 'Das Duell hat schon angefangen.');
    if (r.spieler.size >= 30) throw fehlerMit(400, 'Das Duell ist voll.');
    r.spieler.set(name, { punkte: 0, antworten: {} });
  }
  return duellStand(code, name);
}

export function duellStarten(code, name) {
  const r = raum(code);
  if (r.host !== name) throw fehlerMit(403, 'Nur wer das Duell erstellt hat, kann es starten.');
  if (r.phase === 'lobby') { r.phase = 'frage'; r.i = 0; r.seit = Date.now() + 3000; } // 3 s Countdown
  return duellStand(code, name);
}

export function duellAntworten(code, name, { i, wahl }) {
  const r = raum(code);
  const s = r.spieler.get(name);
  if (!s) throw fehlerMit(403, 'Du bist nicht in diesem Duell.');
  const jetzt = Date.now();
  if (r.phase === 'frage' && i === r.i && !(i in s.antworten) && jetzt >= r.seit) {
    const f = r.fragen[i];
    const richtig = wahl === f.antwort;
    const punkte = richtig ? 500 + Math.round(500 * Math.max(0, 1 - (jetzt - r.seit) / FRAGE_MS)) : 0;
    s.antworten[i] = { wahl, punkte };
    s.punkte += punkte;
    weiter(r);
  }
  return duellStand(code, name);
}

export function duellStand(code, name) {
  const r = raum(code);
  const jetzt = Date.now();
  const f = r.fragen[r.i];
  const ich = r.spieler.get(name);
  return {
    code: r.code, titel: r.titel, host: r.host, phase: r.phase, i: r.i, n: r.fragen.length, dabei: Boolean(ich),
    countdown: r.phase === 'frage' && jetzt < r.seit ? r.seit - jetzt : 0,
    rest: r.phase === 'frage' ? Math.max(0, Math.min(FRAGE_MS, r.seit + FRAGE_MS - jetzt)) : 0,
    frage: f && (r.phase === 'frage' || r.phase === 'aufloesung') ? { frage: f.frage, opts: f.opts } : null,
    antwort: r.phase === 'aufloesung' ? f.antwort : null,
    meine: ich?.antworten[r.i] || null,
    spieler: [...r.spieler.entries()].map(([n, s]) => ({ name: n, punkte: s.punkte, fertig: r.i in s.antworten, plus: r.phase === 'aufloesung' ? (s.antworten[r.i]?.punkte || 0) : 0 })).sort((a, b) => b.punkte - a.punkte),
  };
}
