import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 3911;
const URL_ = `http://127.0.0.1:${PORT}`;
const daten = mkdtempSync(path.join(tmpdir(), 'lernheft-'));
let proc;

function anmelden(name, passwort) {
  return fetch(`${URL_}/api/anmelden`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: JSON.stringify({ name, passwort }) });
}
const keks = (r) => r.headers.get('set-cookie').split(';')[0];
const mit = (cookie, opts = {}) => ({ ...opts, headers: { 'content-type': 'application/json', 'x-lernheft': '1', cookie, ...(opts.headers || {}) } });

test.before(async () => {
  proc = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT, DATEN: daten, COOKIE_SECURE: '0' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(URL_); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
test.after(() => { proc.kill(); rmSync(daten, { recursive: true, force: true }); });

test('Server: Konten, Daten, Rechte, Schlüssel bleibt geheim', async () => {
  const aus = execFileSync(process.execPath, ['server/benutzer.js', 'admin', 'Glenn'], { env: { ...process.env, DATEN: daten } }).toString();
  const pwGlenn = /glenn\s+(\S+)/.exec(aus)[1];
  assert.match(pwGlenn, /^[A-Za-z]+-[A-Za-z]+-[A-Za-z]+-\d\d$/);

  // Kein Neustart: der laufende Server muss das neue Konto sofort kennen

  assert.equal((await fetch(`${URL_}/api/ich`)).status, 401);
  assert.equal((await anmelden('glenn', 'falsch')).status, 401);
  const r = await anmelden('Glenn', pwGlenn);
  assert.equal(r.status, 200);
  const glenn = keks(r);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);

  // Admin legt Anna an und hinterlegt den Schlüssel
  const anna = await (await fetch(`${URL_}/api/verwaltung/konten`, mit(glenn, { method: 'POST', body: JSON.stringify({ name: 'Anna Müller' }) }))).json();
  assert.equal(anna.name, 'anna.mueller');
  await fetch(`${URL_}/api/verwaltung/einstellungen`, mit(glenn, { method: 'PUT', body: JSON.stringify({ apiKey: 'sk-ant-geheim-1234567890', tageslimit: 0 }) }));
  const verw = await (await fetch(`${URL_}/api/verwaltung`, mit(glenn))).json();
  assert.ok(!JSON.stringify(verw).includes('geheim-1234567890'));
  assert.equal(verw.konten.length, 2);

  // Anna: eigene Daten, keine Verwaltung, Limit greift
  const annaKeks = keks(await anmelden('anna.mueller', anna.passwort));
  assert.equal((await fetch(`${URL_}/api/verwaltung`, mit(annaKeks))).status, 403);
  await fetch(`${URL_}/api/daten`, mit(annaKeks, { method: 'PUT', body: JSON.stringify({ decks: [{ id: 'a', name: 'Annas Stapel' }], settings: { apiKey: 'x' } }) }));
  const annaDaten = await (await fetch(`${URL_}/api/daten`, mit(annaKeks))).json();
  assert.equal(annaDaten.decks[0].name, 'Annas Stapel');
  assert.equal(annaDaten.settings.apiKey, '');
  const glennDaten = await (await fetch(`${URL_}/api/daten`, mit(glenn))).json();
  assert.deepEqual(glennDaten, {});
  const ki = await fetch(`${URL_}/api/ki`, mit(annaKeks, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
  assert.equal(ki.status, 429);

  // Ohne Kopfzeile keine Änderungen (Schutz gegen fremde Seiten)
  assert.equal((await fetch(`${URL_}/api/daten`, { method: 'PUT', headers: { cookie: annaKeks }, body: '{}' })).status, 403);
  // Server-Code und Daten werden nie ausgeliefert
  const geheim = await (await fetch(`${URL_}/server/db.js`)).text();
  assert.ok(geheim.includes('<!DOCTYPE html>'));
  assert.ok(!(await (await fetch(`${URL_}/daten/einstellungen.json`)).text()).includes('sk-ant'));

  // Neues Passwort: alte Sitzung endet
  const neu = await (await fetch(`${URL_}/api/verwaltung/konten/anna.mueller/passwort`, mit(glenn, { method: 'POST' }))).json();
  assert.equal((await fetch(`${URL_}/api/ich`, mit(annaKeks))).status, 401);
  assert.equal((await anmelden('anna.mueller', neu.passwort)).status, 200);
  // Löschen
  assert.equal((await fetch(`${URL_}/api/verwaltung/konten/anna.mueller`, mit(glenn, { method: 'DELETE' }))).status, 200);
  assert.equal((await anmelden('anna.mueller', neu.passwort)).status, 401);
});
