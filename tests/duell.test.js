import test from 'node:test';
import assert from 'node:assert/strict';
import * as ex from '../server/extra.js';

test('Duell: beitreten, starten, Punkte, Ende', async () => {
  const fragen = [1, 2, 3].map((n) => ({ frage: `F${n}`, opts: ['a', 'b', 'c', 'd'], antwort: 'a' }));
  const { code } = ex.duellAnlegen('glenn', { titel: 'Test', fragen });
  ex.duellBeitreten(code, 'anna');
  assert.equal(ex.duellStand(code, 'glenn').spieler.length, 2);
  assert.throws(() => ex.duellStarten(code, 'anna'));
  ex.duellStarten(code, 'glenn');
  await new Promise((r) => setTimeout(r, 3100));
  let s = ex.duellStand(code, 'glenn');
  assert.equal(s.phase, 'frage');
  assert.equal(s.antwort, null); // Lösung bleibt geheim
  ex.duellAntworten(code, 'glenn', { i: 0, wahl: 'a' });
  s = ex.duellAntworten(code, 'anna', { i: 0, wahl: 'b' });
  assert.equal(s.phase, 'aufloesung');
  assert.equal(s.antwort, 'a');
  assert.ok(s.spieler[0].name === 'glenn' && s.spieler[0].punkte > 900);
  assert.equal(s.spieler[1].punkte, 0);
  assert.throws(() => ex.duellBeitreten(code, 'ben'));
});
