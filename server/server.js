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
import * as extra from './extra.js';
import * as schriften from './schriften.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const SICHER = process.env.COOKIE_SECURE !== '0';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MAX_KI_BODY = 20 * 1024 * 1024;
const MAX_DATEN_BODY = 30 * 1024 * 1024;

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

// __Host-: Das Cookie gilt nur für genau diese Domain, nur über HTTPS und lässt sich nicht von Subdomains überschreiben.
const KEKS = SICHER ? '__Host-lh_sitzung' : 'lh_sitzung';
function sitzungsCookie(token, maxAlter) {
  return `${KEKS}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAlter}${SICHER ? '; Secure' : ''}`;
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

  if (pfad === '/api/einladung' && methode === 'GET') {
    const name = extra.einladungPruefen(new URL(req.url, 'http://x').searchParams.get('t'));
    return name ? senden(res, 200, { name }) : fehler(res, 404, 'Dieser Einladungslink ist abgelaufen oder schon benutzt.');
  }
  if (pfad === '/api/einladung' && methode === 'POST') {
    if (db.zuVieleVersuche(ip(req))) return fehler(res, 429, 'Zu viele Versuche. Warte 15 Minuten.');
    const { token, passwort } = await koerper(req, 10000);
    try {
      const name = extra.einladungEinloesen(token, passwort);
      const t = db.sitzungAnlegen(name);
      return senden(res, 200, { name }, { 'set-cookie': sitzungsCookie(t, 60 * 60 * 24 * 60) });
    } catch (e) { db.fehlversuch(ip(req)); throw e; }
  }
  if (pfad === '/api/kontakt' && methode === 'GET') { const e = db.einstellungen(); return senden(res, 200, { name: e.kontaktName || '', mail: e.kontaktMail || '', ort: e.kontaktOrt || '' }); }
  const token = cookies(req)[KEKS];
  const konto = token && db.sitzung(token);
  if (pfad === '/api/ich' && methode === 'GET') {
    return konto ? senden(res, 200, { name: konto.name, admin: konto.admin, mussWechseln: konto.mussWechseln }) : fehler(res, 401, 'Nicht angemeldet.');
  }
  if (!konto) return fehler(res, 401, 'Bitte melde dich an.');

  if (pfad === '/api/abmelden' && methode === 'POST') {
    db.sitzungLoeschen(token);
    return senden(res, 200, { ok: true }, { 'set-cookie': sitzungsCookie('', 0) });
  }
  if (pfad === '/api/ich' && methode === 'DELETE') {
    if (konto.admin) return fehler(res, 400, 'Der Admin kann sein Konto nicht selbst löschen.');
    const { passwort } = await koerper(req, 10000);
    if (!db.pruefen(konto.name, passwort)) return fehler(res, 400, 'Das Passwort stimmt nicht.');
    db.kontoLoeschen(konto.name);
    extra.allesVon(konto.name);
    return senden(res, 200, { ok: true }, { 'set-cookie': sitzungsCookie('', 0) });
  }
  if (pfad === '/api/passwort' && methode === 'POST') {
    const { alt, neu } = await koerper(req, 10000);
    if (!db.pruefen(konto.name, alt)) return fehler(res, 400, 'Das bisherige Passwort stimmt nicht.');
    if (String(neu || '').length < 10) return fehler(res, 400, 'Das neue Passwort braucht mindestens 10 Zeichen.');
    if (String(neu).toLowerCase().includes(konto.name)) return fehler(res, 400, 'Das Passwort darf deinen Benutzernamen nicht enthalten.');
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

  // ----- Teilen, Rangliste, Erinnerungen -----
  if (pfad === '/api/geteilt' && methode === 'GET') return senden(res, 200, extra.geteiltListe(konto.name));
  if (pfad === '/api/personen' && methode === 'GET') return senden(res, 200, db.kontenListe().map((k) => k.name).filter((n) => n !== konto.name));
  if (pfad === '/api/geteilt' && methode === 'POST') return senden(res, 200, extra.geteiltAnlegen(konto.name, await koerper(req, MAX_DATEN_BODY)));
  const gm = /^\/api\/geteilt\/([\w-]+)$/.exec(pfad);
  if (gm && methode === 'GET') { const g = extra.geteiltHolen(gm[1], konto.name); return g ? senden(res, 200, g) : fehler(res, 404, 'Gibt es nicht mehr.'); }
  if (gm && methode === 'DELETE') { extra.geteiltLoeschen(gm[1], konto.name, konto.admin); return senden(res, 200, { ok: true }); }
  if (pfad === '/api/duell' && methode === 'POST') return senden(res, 200, extra.duellAnlegen(konto.name, await koerper(req, 200000)));
  const dm = /^\/api\/duell\/(\d{4})(\/(beitreten|start|antwort|reaktion))?$/.exec(pfad);
  if (dm && dm[3] === 'reaktion' && methode === 'POST') return senden(res, 200, extra.duellReaktion(dm[1], konto.name, await koerper(req, 1000)));
  if (dm && methode === 'GET') return senden(res, 200, extra.duellStand(dm[1], konto.name));
  if (dm && dm[3] === 'beitreten' && methode === 'POST') return senden(res, 200, extra.duellBeitreten(dm[1], konto.name));
  if (dm && dm[3] === 'start' && methode === 'POST') return senden(res, 200, extra.duellStarten(dm[1], konto.name));
  if (dm && dm[3] === 'antwort' && methode === 'POST') return senden(res, 200, extra.duellAntworten(dm[1], konto.name, await koerper(req, 5000)));
  if (pfad === '/api/gruppe' && methode === 'GET') return senden(res, 200, { ankuendigung: extra.gruppeLesen().ankuendigung, challenge: extra.challenge() });
  if (pfad === '/api/gruppenchat' && methode === 'GET') return senden(res, 200, extra.chatLesen(Number(new URL(req.url, 'http://x').searchParams.get('seit')) || 0));
  if (pfad === '/api/gruppenchat' && methode === 'POST') return senden(res, 200, extra.chatSchreiben(konto.name, (await koerper(req, 5000)).text));
  const cm = /^\/api\/gruppenchat\/([\w-]+)$/.exec(pfad);
  if (cm && methode === 'DELETE') { extra.chatLoeschen(cm[1], konto.name, konto.admin); return senden(res, 200, { ok: true }); }
  if (pfad === '/api/gemeinsam' && methode === 'GET') return senden(res, 200, extra.gsAlle(konto.name, konto.admin));
  if (pfad === '/api/gemeinsam' && methode === 'POST') return senden(res, 200, extra.gsAnlegen(konto.name, await koerper(req, 20000)));
  const gsm = /^\/api\/gemeinsam\/([\w-]+)(\/karten(\/([\w-]+))?)?$/.exec(pfad);
  if (gsm && !gsm[2] && methode === 'GET') return senden(res, 200, extra.gsHolen(gsm[1], konto.name, konto.admin));
  if (gsm && !gsm[2] && methode === 'DELETE') { extra.gsLoeschen(gsm[1], konto.name, konto.admin); return senden(res, 200, { ok: true }); }
  if (gsm && gsm[2] && !gsm[4] && methode === 'POST') return senden(res, 200, extra.gsKarteDazu(gsm[1], konto.name, konto.admin, await koerper(req, 20000)));
  if (gsm && gsm[4] && methode === 'DELETE') return senden(res, 200, extra.gsKarteWeg(gsm[1], gsm[4], konto.name, konto.admin));
  if (pfad === '/api/rangliste' && methode === 'GET') return senden(res, 200, extra.rangliste());
  if (pfad === '/api/push' && methode === 'GET') return senden(res, 200, { schluessel: extra.vapidOeffentlich(), abo: extra.aboLesen(konto.name) });
  if (pfad === '/api/push' && methode === 'POST') return senden(res, 200, { abo: extra.aboSetzen(konto.name, await koerper(req, 20000)) });
  if (pfad === '/api/push/test' && methode === 'POST') {
    const ok = await extra.testSenden(konto.name);
    return ok ? senden(res, 200, { ok }) : fehler(res, 400, 'Die Mitteilung kam nicht an. Sind Erinnerungen auf diesem Gerät eingeschaltet?');
  }

  // ----- nur für Admins -----
  if (pfad.startsWith('/api/verwaltung')) {
    if (!konto.admin) return fehler(res, 403, 'Das darf nur der Admin.');
    if (pfad === '/api/verwaltung' && methode === 'GET') {
      const e = db.einstellungen();
      return senden(res, 200, {
        einstellungen: { model: e.model, tageslimit: e.tageslimit, kontaktName: e.kontaktName || '', kontaktMail: e.kontaktMail || '', kontaktOrt: e.kontaktOrt || '', schluessel: e.apiKey ? `${e.apiKey.slice(0, 10)}…${e.apiKey.slice(-4)}` : '' },
        konten: db.kontenListe(),
      });
    }
    if (pfad === '/api/verwaltung/einstellungen' && methode === 'PUT') {
      const { apiKey, model, tageslimit, kontaktName, kontaktMail, kontaktOrt } = await koerper(req, 10000);
      db.einstellungenSetzen({ apiKey, model, tageslimit, kontaktName, kontaktMail, kontaktOrt });
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
      try { db.kontoLoeschen(m[1]); extra.allesVon(m[1]); return senden(res, 200, { ok: true }); }
      catch (e) { return fehler(res, 404, e.message); }
    }
    if (pfad === '/api/verwaltung/gruppe' && methode === 'PUT') return senden(res, 200, extra.gruppeSetzen(await koerper(req, 10000)));
    if (pfad === '/api/verwaltung/uebersicht' && methode === 'GET') return senden(res, 200, extra.adminUebersicht());
    const em = /^\/api\/verwaltung\/konten\/([a-z0-9._-]+)\/einladung$/.exec(pfad);
    if (em && methode === 'POST') {
      if (!db.vorhanden(em[1])) return fehler(res, 404, 'Diesen Namen gibt es nicht.');
      return senden(res, 200, { name: em[1], token: extra.einladungAnlegen(em[1]) });
    }
    if (pfad === '/api/verwaltung/sicherung' && methode === 'GET') {
      return senden(res, 200, extra.sicherungDaten(), { 'content-disposition': `attachment; filename="lernheft-sicherung-${new Date().toISOString().slice(0, 10)}.json"` });
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

// Sicherheits-Header für jede Antwort
const SICHERHEIT = {
  'content-security-policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self'", "connect-src 'self'", "media-src 'self' blob:", "worker-src 'self'", "manifest-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  ...(SICHER ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
};

// Anfrage-Bremse: höchstens 240 API-Anfragen pro Minute und Adresse
const anfragen = new Map();
function zuViele(adresse) {
  const jetzt = Date.now();
  const e = anfragen.get(adresse);
  if (!e || jetzt - e.seit > 60e3) { anfragen.set(adresse, { seit: jetzt, n: 1 }); return false; }
  e.n += 1;
  return e.n > 240;
}
setInterval(() => { const g = Date.now() - 120e3; for (const [k, v] of anfragen) if (v.seit < g) anfragen.delete(k); }, 300e3).unref();

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SICHERHEIT)) res.setHeader(k, v);
  try {
    const roh = new URL(req.url, 'http://x').pathname;
    if (roh === '/schriften/schriften.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=86400' });
      res.end(await schriften.css());
      return;
    }
    if (roh.startsWith('/schriften/')) {
      const f = schriften.datei(roh.slice(11));
      if (!f) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable' });
      res.end(f);
      return;
    }
    if (roh.startsWith('/api/') && zuViele(ip(req))) { fehler(res, 429, 'Zu viele Anfragen. Warte eine Minute.'); return; }
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
extra.oeffnen(process.env.DATEN || path.join(WURZEL, 'daten'));
schriften.oeffnen(process.env.DATEN || path.join(WURZEL, 'daten'));
const jedeMinute = () => { extra.erinnerungenPruefen().catch((e) => console.error('Erinnerungen:', e.message)); };
const jedeStunde = () => { try { extra.naechtlicheSicherung(); } catch (e) { console.error('Sicherung:', e.message); } };
setInterval(jedeMinute, 60e3).unref();
setInterval(jedeStunde, 3600e3).unref();
setTimeout(jedeStunde, 5000).unref();
server.listen(PORT, () => console.log(`Lernheft läuft auf Port ${PORT}`));
