// Lernheft-Server: liefert die App aus, verwaltet Konten und leitet KI-Anfragen weiter.
// Keine Abhängigkeiten – läuft mit einem nackten Node.js (ab Version 20).
//
// Umgebungsvariablen:
//   PORT          (Standard 3000)
//   DATEN         Ordner für Konten und Lerndaten (Standard ./daten)
//   COOKIE_SECURE "0" nur für lokale Tests ohne HTTPS

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const SICHER = process.env.COOKIE_SECURE !== '0';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MAX_KI_BODY = 20 * 1024 * 1024;
const MAX_DATEN_BODY = 8 * 1024 * 1024;

const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
// Nur diese Ordner/Dateien werden ausgeliefert – nie der Server-Code oder die Daten.
const OEFFENTLICH = /^\/(index\.html|sw\.js|manifest\.webmanifest|(css|js|icons)\/[\w./-]+)$/;

function senden(res, status, daten, kopf = {}) {
  const body = JSON.stringify(daten);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...kopf });
  res.end(body);
}
const fehler = (res, status, message) => senden(res, status, { error: { message } });

function koerper(req, max) {
  return new Promise((ok, nein) => {
    let groesse = 0;
    const teile = [];
    req.on('data', (t) => {
      groesse += t.length;
      if (groesse > max) { nein(Object.assign(new Error('Die Anfrage ist zu groß.'), { status: 413 })); req.destroy(); return; }
      teile.push(t);
    });
    req.on('end', () => {
      try { ok(teile.length ? JSON.parse(Buffer.concat(teile).toString('utf8')) : {}); }
      catch { nein(Object.assign(new Error('Ungültige Anfrage.'), { status: 400 })); }
    });
    req.on('error', nein);
  });
}

function cookies(req) {
  const aus = {};
  for (const teil of String(req.headers.cookie || '').split(';')) {
    const i = teil.indexOf('=');
    if (i > 0) aus[teil.slice(0, i).trim()] = decodeURIComponent(teil.slice(i + 1).trim());
  }
  return aus;
}

function sitzungsCookie(token, maxAlter) {
  return `lh_sitzung=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAlter}${SICHER ? '; Secure' : ''}`;
}

const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// ---------- Statische Dateien ----------
async function datei(req, res, pfad) {
  if (pfad === '/' || pfad === '') pfad = '/index.html';
  if (!OEFFENTLICH.test(pfad) || pfad.includes('..')) pfad = '/index.html';
  const voll = path.join(WURZEL, pfad);
  try {
    const s = await stat(voll);
    if (!s.isFile()) throw new Error();
    const inhalt = await readFile(voll);
    res.writeHead(200, {
      'content-type': TYPEN[path.extname(voll)] || 'application/octet-stream',
      'cache-control': pfad === '/index.html' || pfad === '/sw.js' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : inhalt);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden');
  }
}

// ---------- KI-Weiterleitung ----------
async function ki(req, res, konto) {
  const einst = db.einstellungen();
  if (!einst.apiKey) return fehler(res, 503, 'Die KI ist noch nicht eingerichtet. Glenn muss in der Verwaltung einen Schlüssel hinterlegen.');
  const heute = db.kiHeute(konto.name);
  if (!konto.admin && heute >= einst.tageslimit) {
    return fehler(res, 429, `Dein Tageslimit von ${einst.tageslimit} KI-Anfragen ist erreicht. Morgen geht es weiter – Karteikarten und Rechner funktionieren auch ohne KI.`);
  }
  const eingabe = await koerper(req, MAX_KI_BODY);
  if (!Array.isArray(eingabe.messages) || !eingabe.messages.length) return fehler(res, 400, 'Ungültige Anfrage.');
  const anfrage = {
    model: einst.model,
    max_tokens: Math.min(Math.max(Number(eingabe.max_tokens) || 1024, 16), 8000),
    messages: eingabe.messages,
  };
  if (typeof eingabe.system === 'string') anfrage.system = eingabe.system.slice(0, 20000);
  if (Array.isArray(eingabe.tools)) anfrage.tools = eingabe.tools.slice(0, 4);

  db.kiZaehlen(konto.name);
  let antwort;
  try {
    antwort = await fetch(ANTHROPIC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': einst.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(anfrage),
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    return fehler(res, 502, 'Der Server erreicht die KI gerade nicht. Versuch es gleich noch mal.');
  }
  const text = await antwort.text();
  if (antwort.status === 401) return fehler(res, 502, 'Der KI-Schlüssel auf dem Server funktioniert nicht. Sag Glenn Bescheid.');
  if (antwort.status === 404 || (antwort.status === 400 && /model/i.test(text))) return fehler(res, 502, 'Das eingestellte KI-Modell funktioniert nicht. Glenn kann es in der Verwaltung ändern.');
  if (/credit|balance|billing/i.test(text) && !antwort.ok) return fehler(res, 502, 'Das KI-Guthaben ist aufgebraucht. Sag Glenn Bescheid.');
  res.writeHead(antwort.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

// ---------- API ----------
async function api(req, res, pfad) {
  const methode = req.method;
  // Schutz gegen Anfragen von fremden Seiten: eigene Kopfzeile ist Pflicht bei Änderungen.
  if (methode !== 'GET' && req.headers['x-lernheft'] !== '1') return fehler(res, 403, 'Nicht erlaubt.');

  if (pfad === '/api/anmelden' && methode === 'POST') {
    const { name, passwort } = await koerper(req, 10000);
    if (db.zuVieleVersuche(ip(req))) return fehler(res, 429, 'Zu viele Versuche. Warte 15 Minuten.');
    const konto = db.pruefen(name, passwort);
    if (!konto) { db.fehlversuch(ip(req)); return fehler(res, 401, 'Benutzername oder Passwort stimmt nicht.'); }
    const token = db.sitzungAnlegen(konto.name);
    return senden(res, 200, { name: konto.name, admin: konto.admin }, { 'set-cookie': sitzungsCookie(token, 60 * 60 * 24 * 60) });
  }

  const token = cookies(req).lh_sitzung;
  const konto = token && db.sitzung(token);
  if (pfad === '/api/ich' && methode === 'GET') {
    return konto ? senden(res, 200, { name: konto.name, admin: konto.admin, mussWechseln: konto.mussWechseln }) : fehler(res, 401, 'Nicht angemeldet.');
  }
  if (!konto) return fehler(res, 401, 'Bitte melde dich an.');

  if (pfad === '/api/abmelden' && methode === 'POST') {
    db.sitzungLoeschen(token);
    return senden(res, 200, { ok: true }, { 'set-cookie': sitzungsCookie('', 0) });
  }
  if (pfad === '/api/passwort' && methode === 'POST') {
    const { alt, neu } = await koerper(req, 10000);
    if (!db.pruefen(konto.name, alt)) return fehler(res, 400, 'Das bisherige Passwort stimmt nicht.');
    if (String(neu || '').length < 8) return fehler(res, 400, 'Das neue Passwort braucht mindestens 8 Zeichen.');
    db.passwortSetzen(konto.name, neu, false);
    return senden(res, 200, { ok: true });
  }
  if (pfad === '/api/daten' && methode === 'GET') return senden(res, 200, db.datenLesen(konto.name));
  if (pfad === '/api/daten' && methode === 'PUT') {
    db.datenSchreiben(konto.name, await koerper(req, MAX_DATEN_BODY));
    return senden(res, 200, { ok: true });
  }
  if (pfad === '/api/ki' && methode === 'POST') return ki(req, res, konto);
  if (pfad === '/api/ki/stand' && methode === 'GET') {
    const e = db.einstellungen();
    return senden(res, 200, { eingerichtet: Boolean(e.apiKey), heute: db.kiHeute(konto.name), limit: konto.admin ? null : e.tageslimit });
  }

  // ----- nur für Admins -----
  if (pfad.startsWith('/api/verwaltung')) {
    if (!konto.admin) return fehler(res, 403, 'Das darf nur der Admin.');
    if (pfad === '/api/verwaltung' && methode === 'GET') {
      const e = db.einstellungen();
      return senden(res, 200, {
        einstellungen: { model: e.model, tageslimit: e.tageslimit, schluessel: e.apiKey ? `${e.apiKey.slice(0, 10)}…${e.apiKey.slice(-4)}` : '' },
        konten: db.kontenListe(),
      });
    }
    if (pfad === '/api/verwaltung/einstellungen' && methode === 'PUT') {
      const { apiKey, model, tageslimit } = await koerper(req, 10000);
      db.einstellungenSetzen({ apiKey, model, tageslimit });
      return senden(res, 200, { ok: true });
    }
    if (pfad === '/api/verwaltung/konten' && methode === 'POST') {
      const { name, admin } = await koerper(req, 10000);
      try { return senden(res, 200, db.kontoAnlegen(name, { admin: Boolean(admin) })); }
      catch (e) { return fehler(res, 400, e.message); }
    }
    const m = /^\/api\/verwaltung\/konten\/([a-z0-9._-]+)(\/passwort)?$/.exec(pfad);
    if (m && m[2] && methode === 'POST') {
      try { return senden(res, 200, { name: m[1], passwort: db.passwortNeu(m[1]) }); }
      catch (e) { return fehler(res, 404, e.message); }
    }
    if (m && !m[2] && methode === 'DELETE') {
      if (m[1] === konto.name) return fehler(res, 400, 'Du kannst dich nicht selbst löschen.');
      try { db.kontoLoeschen(m[1]); return senden(res, 200, { ok: true }); }
      catch (e) { return fehler(res, 404, e.message); }
    }
    if (pfad === '/api/verwaltung/test' && methode === 'POST') {
      const e = db.einstellungen();
      if (!e.apiKey) return fehler(res, 400, 'Es ist noch kein Schlüssel hinterlegt.');
      try {
        const a = await fetch(ANTHROPIC, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': e.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: e.model, max_tokens: 16, messages: [{ role: 'user', content: 'Antworte nur mit ok.' }] }),
          signal: AbortSignal.timeout(30000),
        });
        if (a.ok) return senden(res, 200, { ok: true });
        const t = await a.json().catch(() => null);
        return fehler(res, 400, a.status === 401 ? 'Der Schlüssel wird abgelehnt.' : `Fehler von der KI: ${t?.error?.message || a.status}`);
      } catch {
        return fehler(res, 502, 'Der Server erreicht die KI nicht.');
      }
    }
  }
  return fehler(res, 404, 'Unbekannte Adresse.');
}

const server = http.createServer(async (req, res) => {
  try {
    const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pfad.startsWith('/api/')) await api(req, res, pfad);
    else if (req.method === 'GET' || req.method === 'HEAD') await datei(req, res, pfad);
    else fehler(res, 405, 'Nicht erlaubt.');
  } catch (e) {
    if (!res.headersSent) fehler(res, e.status || 500, e.status ? e.message : 'Interner Fehler.');
    if (!e.status) console.error(e);
  }
});

db.oeffnen(process.env.DATEN || path.join(WURZEL, 'daten'));
server.listen(PORT, () => console.log(`Lernheft läuft auf Port ${PORT}`));
