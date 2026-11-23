// Wiederholungsplan: Karten, die du gut kannst, kommen seltener dran.
// Bewertung: 0 = Nochmal, 1 = Schwer, 2 = Gut, 3 = Einfach.

export function newSrs() {
  return { due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, seen: false };
}

function inTagen(now, tage) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + tage);
  return d.getTime();
}

export function schedule(srs, rating, now = Date.now()) {
  const s = { ...newSrs(), ...srs, seen: true };
  if (rating <= 0) {
    s.reps = 0;
    s.interval = 0;
    s.lapses += 1;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = now + 10 * 60 * 1000;
    return s;
  }
  let tage;
  if (rating === 1) {
    tage = s.reps === 0 ? 1 : Math.max(1, Math.round(s.interval * 1.2));
    s.ease = Math.max(1.3, s.ease - 0.15);
  } else if (rating === 2) {
    tage = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
  } else {
    const gut = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
    tage = s.reps === 0 ? 3 : Math.max(gut + 2, Math.round(s.interval * s.ease * 1.3));
    s.ease = Math.min(3, s.ease + 0.15);
  }
  s.reps += 1;
  s.interval = Math.min(tage, 365);
  s.due = inTagen(now, s.interval);
  return s;
}

export function isDue(card, now = Date.now()) {
  return (card.srs?.due ?? 0) <= now;
}

// Text für die Bewertungsknöpfe: wann kommt die Karte wieder?
export function intervalText(srs, rating) {
  if (rating <= 0) return 'gleich nochmal';
  const tage = schedule(srs, rating).interval;
  if (tage === 1) return 'morgen';
  if (tage < 30) return `in ${tage} Tagen`;
  const monate = Math.round(tage / 30);
  return monate === 1 ? 'in 1 Monat' : `in ${monate} Monaten`;
}

export const STUFEN = ['neu', 'lernen', 'gefestigt', 'sicher'];
export const STUFEN_NAMEN = { neu: 'Neu', lernen: 'Am Lernen', gefestigt: 'Gefestigt', sicher: 'Sicher' };

export function stufe(srs) {
  if (!srs?.seen) return 'neu';
  if (srs.interval < 7) return 'lernen';
  if (srs.interval < 21) return 'gefestigt';
  return 'sicher';
}
