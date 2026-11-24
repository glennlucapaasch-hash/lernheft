import test from 'node:test';
import assert from 'node:assert/strict';
import { calc, compile, formatNumber, CalcError } from '../js/calc.js';
import { checkAnswer, alternativen } from '../js/check.js';
import { newSrs, schedule, isDue, stufe } from '../js/srs.js';
import { buildLocalExam, gradeLocal, note, auswerten, mcOptionen } from '../js/exam.js';
import * as store from '../js/store.js';

function speicher() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('Rechner: Grundrechenarten und Vorrang', () => {
  assert.equal(calc('1+2*3'), 7);
  assert.equal(calc('(1+2)×3'), 9);
  assert.equal(calc('10 ÷ 4'), 2.5);
  assert.equal(calc('−2^2'), -4);
  assert.equal(calc('2^3^2'), 512);
  assert.equal(calc('2^-1'), 0.5);
  assert.equal(calc('3,5 + 1,5'), 5);
});

test('Rechner: Funktionen, Konstanten, Kurzschreibweisen', () => {
  assert.equal(calc('sin(30)'), 0.5);
  assert.equal(calc('cos(60)'), 0.5);
  assert.equal(calc('sin(pi/2)', { deg: false }), 1);
  assert.equal(calc('sin(180)'), 0);
  assert.equal(calc('√16'), 4);
  assert.equal(calc('√(9+16)'), 5);
  assert.equal(calc('5!'), 120);
  assert.equal(calc('3²+4²'), 25);
  assert.equal(calc('(1+2)(3+4)'), 21);
  assert.equal(calc('2x', { x: 3 }), 6);
  assert.equal(calc('2sinx', { x: 30 }), 1);
  assert.equal(calc('200*15%'), 30);
  assert.equal(calc('Ans+1', { ans: 41 }), 42);
  assert.ok(Math.abs(calc('2π') - 6.283185307) < 1e-8);
  assert.equal(calc('log(1000)'), 3);
});

test('Rechner: verständliche Fehler statt Absturz', () => {
  for (const kaputt of ['1/0', '2+', '(1+2', '1+2)', 'abc', '', '√(-4)', '2 3', 'tan(90)']) {
    assert.throws(() => calc(kaputt), CalcError, kaputt);
  }
});

test('Rechner: Ausgabe mit Komma und ohne Rundungsreste', () => {
  assert.equal(formatNumber(calc('0,1+0,2')), '0,3');
  assert.equal(formatNumber(1 / 3), '0,333333333333');
  assert.equal(formatNumber(1234567.5), '1234567,5');
  assert.equal(formatNumber(2e15), '2 × 10^15');
  assert.equal(formatNumber(0), '0');
});

test('Plotter: undefinierte Stellen werden zu NaN', () => {
  const f = compile('1/x');
  assert.equal(f(2), 0.5);
  assert.ok(Number.isNaN(f(0)));
  assert.equal(compile('x²-4')(3), 5);
});

test('Antwortprüfung', () => {
  assert.equal(checkAnswer('der Stundenplan', 'der Stundenplan'), 'richtig');
  assert.equal(checkAnswer('  Der stundenplan ', 'der Stundenplan'), 'richtig');
  assert.equal(checkAnswer('Stundenplan', 'der Stundenplan'), 'fast');
  assert.equal(checkAnswer('der Stundenpaln', 'der Stundenplan'), 'fast');
  assert.equal(checkAnswer('die Pause', 'der Stundenplan'), 'falsch');
  assert.equal(checkAnswer('gehen', 'gehen, laufen'), 'richtig');
  assert.equal(checkAnswer('laufen, gehen', 'gehen, laufen'), 'richtig');
  assert.equal(checkAnswer('ecole', "l'école"), 'fast');
  assert.equal(checkAnswer("l'école", "l'école"), 'richtig');
  assert.equal(checkAnswer('go', 'to go'), 'fast');
  assert.equal(checkAnswer('', 'to go'), 'falsch');
  assert.equal(checkAnswer('Haus', 'das Haus (Häuser)'), 'fast');
  assert.equal(checkAnswer('das Haus', 'das Haus (Häuser)'), 'richtig');
  assert.equal(checkAnswer('cat', 'car'), 'falsch');
  assert.deepEqual(alternativen('gehen / laufen'), ['gehen / laufen', 'gehen', 'laufen']);
});

test('Wiederholungsplan', () => {
  const jetzt = new Date(2026, 10, 23, 14, 0).getTime();
  let s = newSrs();
  assert.equal(stufe(s), 'neu');
  s = schedule(s, 2, jetzt);
  assert.equal(s.interval, 1);
  assert.equal(new Date(s.due).getDate(), 24);
  assert.equal(isDue({ srs: s }, jetzt), false);
  s = schedule(s, 2, jetzt);
  assert.equal(s.interval, 3);
  s = schedule(s, 2, jetzt);
  assert.ok(s.interval >= 7);
  assert.equal(stufe(s), 'gefestigt');
  const falsch = schedule(s, 0, jetzt);
  assert.equal(falsch.interval, 0);
  assert.equal(falsch.lapses, 1);
  assert.equal(falsch.due, jetzt + 600000);
  assert.ok(falsch.ease < s.ease);
  assert.ok(schedule(newSrs(), 3, jetzt).interval > schedule(newSrs(), 2, jetzt).interval);
});

test('Speicher: Stapel, Karten, Serie, Sicherung', () => {
  store.init(speicher());
  const deck = store.addDeck('Unit 2', 'englisch');
  const karten = store.addCards(deck.id, [{ front: 'dog', back: 'der Hund' }, { front: '', back: 'leer' }, { front: 'cat', back: 'die Katze' }]);
  assert.equal(karten.length, 2);
  assert.equal(store.dueCards(deck.id).length, 2);

  const heute = new Date(2026, 10, 23, 10, 0);
  const gestern = new Date(2026, 10, 22, 10, 0);
  store.review(karten[0].id, 2, gestern.getTime());
  store.review(karten[1].id, 0, heute.getTime());
  assert.equal(store.streak(heute), 2);
  assert.equal(store.streak(new Date(2026, 10, 24, 9, 0)), 2);
  assert.equal(store.streak(new Date(2026, 10, 26, 9, 0)), 0);
  assert.equal(store.letzteTage(3, heute).map((t) => t.abfragen).join(), '0,1,1');

  store.setSettings({ apiKey: 'geheim' });
  const sicherung = store.exportData();
  assert.ok(!sicherung.includes('geheim'));
  store.resetAll();
  assert.equal(store.getState().decks.length, 0);
  store.setSettings({ apiKey: 'neu' });
  store.importData(sicherung);
  assert.equal(store.getState().cards.length, 2);
  assert.equal(store.getState().settings.apiKey, 'neu');
  assert.throws(() => store.importData('{"foo":1}'));

  store.deleteDeck(deck.id);
  assert.equal(store.getState().cards.length, 0);
});

test('Probeklausur ohne KI', () => {
  store.init(speicher());
  const en = store.beispieleLaden();
  const { decks, cards } = store.getState();
  const fragen = buildLocalExam(cards, decks, { anzahl: 12 });
  assert.equal(fragen.length, 12);
  assert.ok(fragen.some((f) => f.type === 'mc'));
  assert.ok(fragen.some((f) => f.type === 'open'));
  for (const f of fragen.filter((x) => x.type === 'mc')) {
    assert.equal(f.options.length, 4);
    assert.ok(f.options.includes(f.answer));
  }
  const mc = fragen.find((f) => f.type === 'mc');
  assert.equal(gradeLocal(mc, mc.answer).awarded, 1);
  assert.equal(gradeLocal(mc, 'Quatsch').awarded, 0);
  const text = { type: 'text', answer: 'der Stundenplan', points: 2 };
  assert.equal(gradeLocal(text, 'der Stundenplan').awarded, 2);
  assert.equal(gradeLocal(text, 'Stundenplan').awarded, 1);
  assert.equal(gradeLocal(text, 'die Pause'), null);
  assert.equal(gradeLocal(text, '  ').awarded, 0);
  assert.equal(mcOptionen('a', ['a', 'b', 'c']), null);
  assert.equal(note(100), 1);
  assert.equal(note(85), 2);
  assert.equal(note(50), 4);
  assert.equal(note(10), 6);
  const a = auswerten([{ id: 'f1', points: 2 }, { id: 'f2', points: 2 }], { f1: { awarded: 2 }, f2: { awarded: 1 } });
  assert.deepEqual(a, { punkte: 3, max: 4, prozent: 75, note: 3 });
  assert.ok(en.id);
});

test('Noten: Lesen, Gewichtung 60/40, Schnitt', async () => {
  const n = await import('../js/noten.js');
  store.init(speicher());
  assert.equal(n.noteLesen('2-'), 2.3);
  assert.equal(n.noteLesen('2+'), 1.7);
  assert.equal(n.noteLesen('2,5'), 2.5);
  assert.equal(n.noteLesen('7'), null);
  const s = store.getState();
  s.noten.push({ id: 'a', fach: 'englisch', art: 'muendlich', wert: 2, datum: '2026-10-01' });
  s.noten.push({ id: 'b', fach: 'englisch', art: 'schriftlich', wert: 4, datum: '2026-10-02' });
  s.noten.push({ id: 'c', fach: 'mathe', art: 'schriftlich', wert: 2, datum: '2026-10-02' });
  const e = n.fachStand('englisch');
  assert.equal(Math.round(e.gesamt * 100) / 100, 2.8); // 2·0,6 + 4·0,4
  const u = n.uebersicht();
  assert.equal(u.staende[0].fach, 'englisch'); // schlechtestes zuerst
  assert.equal(Math.round(u.schnitt * 100) / 100, 2.4);
  assert.ok(n.empfehlungen().some((t) => t.fach === 'englisch' && t.aktion === 'klausur'));
});
