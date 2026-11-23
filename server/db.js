// Speicher für Konten, Sitzungen, Einstellungen und Lerndaten – als JSON-Dateien.
// Für eine Klasse (einige Dutzend Personen) ist das schnell und einfach zu sichern.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let ordner = '';
let konten = {};      // name -> { hash, salz, admin, angelegt, letzterLogin, mussWechseln }
let sitzungen = {};   // sha256(token) -> { name, bis }
let einst = {};       // { apiKey, model, tageslimit }
let nutzung = {};     // 'YYYY-MM-DD' -> { name: anzahl }
const versuche = new Map();

const SITZUNG_TAGE = 60;
const STANDARD = { apiKey: '', model: 'claude-sonnet-5-5', tageslimit: 150 };
export const MODELLE = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'];

function lesen(datei, standard) {
  try { return JSON.parse(readFileSync(path.join(ordner, datei), 'utf8')); } catch { return standard; }
}
function schreiben(datei, daten) {
  const ziel = path.join(ordner, datei);
  const tmp = `${ziel}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(daten), { mode: 0o600 });
  renameSync(tmp, ziel);
}

export function oeffnen(pfad) {
  ordner = pfad;
  mkdirSync(path.join(ordner, 'nutzer'), { recursive: true });
  try { chmodSync(ordner, 0o700); } catch { /* egal */ }
  konten = lesen('konten.json', {});
  sitzungen = lesen('sitzungen.json', {});
  einst = { ...STANDARD, ...lesen('einstellungen.json', {}) };
  nutzung = lesen('nutzung.json', {});
}

// ---------- Passwörter ----------
const hashen = (passwort, salz) => crypto.scryptSync(String(passwort).normalize('NFC'), salz, 64).toString('hex');

export function passwortErzeugen() {
  // gut merkbar und stark: z. B. "Tiger-Wolke-Regal-47"
  const woerter = ['Apfel', 'Birne', 'Wolke', 'Tiger', 'Regal', 'Kerze', 'Sonne', 'Mond', 'Fluss', 'Insel', 'Feder', 'Ozean', 'Pinsel', 'Rakete', 'Kaktus', 'Zebra', 'Gitarre', 'Lampe', 'Brücke', 'Komet', 'Nebel', 'Palme', 'Kiwi', 'Drache', 'Leuchte', 'Muschel', 'Wiese', 'Gletscher', 'Pirat', 'Kompass', 'Anker', 'Biber'].map((w) => w.replace('ü', 'ue'));
  const w = () => woerter[crypto.randomInt(woerter.length)];
  return `${w()}-${w()}-${w()}-${crypto.randomInt(10, 100)}`;
}

export const nameOk = (name) => /^[a-z0-9._-]{2,30}$/.test(name);
export const nameNormal = (name) => String(name || '').replace(/\([^)]*\)/g, '').trim().toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, '.');

export function pruefen(name, passwort) {
  const n = nameNormal(name);
  const k = konten[n];
  if (!k || !passwort) {
    hashen(passwort || 'x', 'gleich-lange-dauer'); // keine Rückschlüsse über vorhandene Namen
    return null;
  }
  const ist = Buffer.from(hashen(passwort, k.salz), 'hex');
  if (!crypto.timingSafeEqual(ist, Buffer.from(k.hash, 'hex'))) return null;
  k.letzterLogin = Date.now();
  schreiben('konten.json', konten);
  return { name: n, admin: Boolean(k.admin) };
}

export function passwortSetzen(name, passwort, mussWechseln = false) {
  const k = konten[name];
  if (!k) throw new Error('Diesen Namen gibt es nicht.');
  k.salz = crypto.randomBytes(16).toString('hex');
  k.hash = hashen(passwort, k.salz);
  k.mussWechseln = mussWechseln;
  schreiben('konten.json', konten);
  // alte Sitzungen dieser Person beenden
  for (const [t, s] of Object.entries(sitzungen)) if (s.name === name) delete sitzungen[t];
  schreiben('sitzungen.json', sitzungen);
}

export function passwortNeu(name) {
  const pw = passwortErzeugen();
  passwortSetzen(name, pw, false);
  return pw;
}

export function kontoAnlegen(rohName, { admin = false, passwort } = {}) {
  const name = nameNormal(rohName);
  if (!nameOk(name)) throw new Error('Der Name darf nur Buchstaben, Zahlen, Punkt, Minus und Unterstrich haben (2–30 Zeichen).');
  if (konten[name]) throw new Error(`„${name}“ gibt es schon.`);
  konten[name] = { admin, angelegt: Date.now(), letzterLogin: null };
  const pw = passwort || passwortErzeugen();
  passwortSetzen(name, pw, false);
  return { name, passwort: pw, admin };
}

export function kontoLoeschen(name) {
  if (!konten[name]) throw new Error('Diesen Namen gibt es nicht.');
  delete konten[name];
  schreiben('konten.json', konten);
  for (const [t, s] of Object.entries(sitzungen)) if (s.name === name) delete sitzungen[t];
  schreiben('sitzungen.json', sitzungen);
  rmSync(path.join(ordner, 'nutzer', `${name}.json`), { force: true });
}

export function kontenListe() {
  const heute = nutzung[tag()] || {};
  return Object.entries(konten)
    .map(([name, k]) => ({ name, admin: Boolean(k.admin), angelegt: k.angelegt, letzterLogin: k.letzterLogin, kiHeute: heute[name] || 0, kiMonat: kiMonat(name) }))
    .sort((a, b) => Number(b.admin) - Number(a.admin) || a.name.localeCompare(b.name));
}

// ---------- Sitzungen ----------
const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

export function sitzungAnlegen(name) {
  const token = crypto.randomBytes(32).toString('base64url');
  const jetzt = Date.now();
  for (const [t, s] of Object.entries(sitzungen)) if (s.bis < jetzt) delete sitzungen[t];
  sitzungen[tokenHash(token)] = { name, bis: jetzt + SITZUNG_TAGE * 864e5 };
  schreiben('sitzungen.json', sitzungen);
  return token;
}

export function sitzung(token) {
  const s = sitzungen[tokenHash(token)];
  if (!s || s.bis < Date.now() || !konten[s.name]) return null;
  return { name: s.name, admin: Boolean(konten[s.name].admin), mussWechseln: Boolean(konten[s.name].mussWechseln) };
}

export function sitzungLoeschen(token) {
  delete sitzungen[tokenHash(token)];
  schreiben('sitzungen.json', sitzungen);
}

export function zuVieleVersuche(ip) {
  const v = versuche.get(ip);
  return Boolean(v && v.anzahl >= 8 && Date.now() - v.seit < 15 * 60e3);
}
export function fehlversuch(ip) {
  const v = versuche.get(ip);
  if (!v || Date.now() - v.seit > 15 * 60e3) versuche.set(ip, { anzahl: 1, seit: Date.now() });
  else v.anzahl += 1;
}

// ---------- Einstellungen ----------
export const einstellungen = () => ({ ...einst });
export function einstellungenSetzen({ apiKey, model, tageslimit }) {
  if (typeof apiKey === 'string' && apiKey.trim()) einst.apiKey = apiKey.trim();
  if (apiKey === null) einst.apiKey = '';
  if (MODELLE.includes(model)) einst.model = model;
  if (Number.isFinite(Number(tageslimit)) && tageslimit !== '' && tageslimit !== null) einst.tageslimit = Math.min(2000, Math.max(0, Math.round(Number(tageslimit))));
  schreiben('einstellungen.json', einst);
}

// ---------- KI-Nutzung ----------
function tag(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export const kiHeute = (name) => nutzung[tag()]?.[name] || 0;
export function kiZaehlen(name) {
  const t = tag();
  (nutzung[t] ||= {})[name] = (nutzung[t][name] || 0) + 1;
  // nur die letzten 62 Tage behalten
  const grenze = tag(new Date(Date.now() - 62 * 864e5));
  for (const k of Object.keys(nutzung)) if (k < grenze) delete nutzung[k];
  schreiben('nutzung.json', nutzung);
}
function kiMonat(name) {
  const monat = tag().slice(0, 7);
  return Object.entries(nutzung).filter(([t]) => t.startsWith(monat)).reduce((s, [, n]) => s + (n[name] || 0), 0);
}

// ---------- Lerndaten ----------
export function datenLesen(name) {
  return lesen(path.join('nutzer', `${name}.json`), {});
}
export function datenSchreiben(name, daten) {
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) throw Object.assign(new Error('Ungültige Daten.'), { status: 400 });
  if (daten.settings) daten.settings.apiKey = '';
  schreiben(path.join('nutzer', `${name}.json`), daten);
}

export const hatKonten = () => Object.keys(konten).length > 0;
export const vorhanden = (name) => Boolean(konten[nameNormal(name)]);
export { existsSync };
