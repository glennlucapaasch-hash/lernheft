// Spracherkennung über den Browser (Safari/Chrome). Gibt den erkannten Text mit Alternativen zurück.
const Erkenner = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const kannHoeren = () => Boolean(Erkenner);

let aktiv = null;
export function stopHoeren() { try { aktiv?.abort(); } catch { /* egal */ } aktiv = null; }

export function hoeren(lang, { onZwischen } = {}) {
  return new Promise((ok, nein) => {
    if (!Erkenner) { nein(new Error('Dein Browser kann keine Sprache erkennen. Nutze die Diktier-Taste der Tastatur.')); return; }
    stopHoeren();
    const r = new Erkenner();
    aktiv = r;
    r.lang = lang || 'de-DE';
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    let fertig = false;
    r.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      const alts = Array.from(res).map((a) => a.transcript.trim()).filter(Boolean);
      onZwischen?.(alts[0] || '');
      if (res.isFinal && !fertig) { fertig = true; ok({ text: alts[0] || '', alternativen: alts }); }
    };
    r.onerror = (e) => {
      if (fertig) return;
      fertig = true;
      const m = { 'not-allowed': 'Das Mikrofon ist nicht erlaubt. Erlaube es in den Einstellungen des Browsers.', 'no-speech': 'Ich habe nichts gehört. Versuch es noch mal.', 'audio-capture': 'Kein Mikrofon gefunden.', aborted: 'abgebrochen' };
      nein(new Error(m[e.error] || 'Die Spracherkennung hat nicht geklappt.'));
    };
    r.onend = () => { if (!fertig) { fertig = true; nein(new Error('Ich habe nichts gehört. Versuch es noch mal.')); } aktiv = null; };
    try { r.start(); } catch (e) { nein(e); }
  });
}
