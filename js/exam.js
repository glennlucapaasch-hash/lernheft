// Probeklausuren: Aufgaben aus den eigenen Karten bauen (ohne KI) und auswerten.
import { checkAnswer } from './check.js';
import { FAECHER } from './store.js';

export const PUNKTE = { mc: 1, text: 2, open: 4 };

export function shuffle(liste, rng = Math.random) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Vier Antwortmöglichkeiten: die richtige plus drei andere aus demselben Stoff.
export function mcOptionen(richtig, pool, rng = Math.random) {
  const andere = shuffle([...new Set(pool)].filter((p) => p && p !== richtig), rng).slice(0, 3);
  if (andere.length < 3) return null;
  return shuffle([richtig, ...andere], rng);
}

export function buildLocalExam(cards, decks, { anzahl = 10 } = {}, rng = Math.random) {
  const deckVon = new Map(decks.map((d) => [d.id, d]));
  const auswahl = shuffle(cards, rng).slice(0, anzahl);
  const fragen = [];
  auswahl.forEach((card, i) => {
    const deck = deckVon.get(card.deckId);
    const fach = FAECHER[deck?.fach] || FAECHER.sonstiges;
    const id = `f${i + 1}`;
    if (deck?.fach === 'mathe') {
      fragen.push({ id, type: 'open', prompt: card.front, answer: card.back, explanation: card.note || '', points: PUNKTE.open });
      return;
    }
    const istSprache = Boolean(fach.lang);
    const art = i % 3; // abwechseln: ankreuzen, übersetzen, rückwärts übersetzen
    if (art === 0) {
      const pool = cards.filter((c) => c.deckId === card.deckId).map((c) => c.back);
      const optionen = mcOptionen(card.back, pool, rng);
      if (optionen) {
        fragen.push({
          id, type: 'mc', points: PUNKTE.mc, answer: card.back, options: optionen,
          prompt: istSprache ? `Was bedeutet „${card.front}“?` : card.front,
        });
        return;
      }
    }
    if (art === 2 && istSprache) {
      fragen.push({ id, type: 'text', points: PUNKTE.text, answer: card.front, prompt: `Übersetze ins ${fach.sprache}: ${card.back}` });
      return;
    }
    fragen.push({
      id, type: 'text', points: PUNKTE.text, answer: card.back,
      prompt: istSprache ? `Übersetze ins Deutsche: ${card.front}` : card.front,
    });
  });
  return fragen;
}

// Was sich sicher ohne KI bewerten lässt. Gibt null zurück, wenn ein Mensch oder die KI entscheiden muss.
export function gradeLocal(frage, antwort) {
  const gegeben = String(antwort ?? '').trim();
  if (!gegeben) return { awarded: 0, feedback: 'Keine Antwort.' };
  if (frage.type === 'mc') {
    return gegeben === frage.answer ? { awarded: frage.points, feedback: '' } : { awarded: 0, feedback: '' };
  }
  if (frage.type === 'text') {
    const urteil = checkAnswer(gegeben, frage.answer);
    if (urteil === 'richtig') return { awarded: frage.points, feedback: '' };
    if (urteil === 'fast') return { awarded: frage.points / 2, feedback: 'Fast – achte auf Schreibweise und Artikel.' };
    return null;
  }
  return null;
}

// Üblicher Notenschlüssel als Richtwert (Schulen dürfen abweichen).
export function note(prozent) {
  if (prozent >= 92) return 1;
  if (prozent >= 81) return 2;
  if (prozent >= 67) return 3;
  if (prozent >= 50) return 4;
  if (prozent >= 30) return 5;
  return 6;
}

export const NOTEN_NAMEN = { 1: 'sehr gut', 2: 'gut', 3: 'befriedigend', 4: 'ausreichend', 5: 'mangelhaft', 6: 'ungenügend' };
export const NOTEN_KOMMENTAR = {
  1: 'Spitze, weiter so!',
  2: 'Gut gemacht!',
  3: 'Solide. Die Fehler noch mal ansehen.',
  4: 'Das reicht – aber da geht mehr.',
  5: 'Noch mal üben, dann klappt es.',
  6: 'Kopf hoch. Fang mit den Karten an.',
};

export function auswerten(fragen, ergebnisse) {
  const max = fragen.reduce((s, f) => s + f.points, 0);
  const punkte = fragen.reduce((s, f) => s + (ergebnisse[f.id]?.awarded ?? 0), 0);
  const prozent = max ? Math.round((punkte / max) * 100) : 0;
  return { punkte, max, prozent, note: note(prozent) };
}
