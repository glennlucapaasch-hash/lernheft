// Konten auf dem Server anlegen – die Passwörter werden hier erzeugt und nur einmal angezeigt.
//
//   node server/benutzer.js admin glenn          -> Admin anlegen
//   node server/benutzer.js anlegen anna ben     -> normale Konten anlegen
//   node server/benutzer.js passwort anna        -> neues Passwort für anna
//   node server/benutzer.js liste                -> alle Konten anzeigen
//
// Im Docker-Container:  docker exec lernheft node server/benutzer.js anlegen anna ben

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
db.oeffnen(process.env.DATEN || path.join(WURZEL, 'daten'));

const [befehl, ...namen] = process.argv.slice(2);
const zeile = (a, b) => console.log(`  ${a.padEnd(22)} ${b}`);

try {
  if (befehl === 'admin' || befehl === 'anlegen') {
    if (!namen.length) throw new Error('Gib mindestens einen Namen an.');
    console.log('\nNeue Konten – Passwörter jetzt notieren, sie werden nicht noch einmal angezeigt:\n');
    zeile('BENUTZERNAME', 'PASSWORT');
    for (const n of namen) {
      try {
        const k = db.kontoAnlegen(n, { admin: befehl === 'admin' });
        zeile(k.name + (k.admin ? ' (Admin)' : ''), k.passwort);
      } catch (e) {
        zeile(n, `– ${e.message}`);
      }
    }
    console.log('');
  } else if (befehl === 'passwort') {
    for (const n of namen) zeile(db.nameNormal(n), db.passwortNeu(db.nameNormal(n)));
  } else if (befehl === 'liste') {
    for (const k of db.kontenListe()) zeile(k.name + (k.admin ? ' (Admin)' : ''), k.letzterLogin ? `zuletzt da: ${new Date(k.letzterLogin).toLocaleString('de-DE')}` : 'noch nie angemeldet');
  } else {
    console.log('Befehle: admin NAME | anlegen NAME … | passwort NAME | liste');
  }
} catch (e) {
  console.error(`Fehler: ${e.message}`);
  process.exit(1);
}
