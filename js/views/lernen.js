// Die Abfrage: Karteikarten umdrehen, Antwort schreiben oder ankreuzen.
import { h, icon, sprechen, kannSprechen, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { intervalText } from '../srs.js';
import { checkAnswer } from '../check.js';
import { shuffle, mcOptionen } from '../exam.js';
import { hoeren, stopHoeren, kannHoeren } from '../sprache.js';

const SONDERZEICHEN = {
  franzoesisch: ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'ù', 'û', 'œ'],
  spanisch: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'],
};

let sitzung = null;

// modus: 'umdrehen' | 'schreiben' | 'ankreuzen'; richtung: 'vor' (Vorderseite fragen) | 'rueck'
export function lernenStarten(ctx, { cardIds, modus = 'umdrehen', richtung = 'vor', titel = 'Abfrage', danach }) {
  sitzung = {
    reihe: shuffle(cardIds),
    modus, richtung, titel, danach,
    gesamt: cardIds.length,
    erledigt: 0, richtig: 0,
    nochmal: new Map(),
    phase: 'frage', // 'frage' | 'antwort' | 'ende'
    urteil: null, eingabe: '', optionen: null,
  };
  ctx.open(lernen);
}

function aktuelleKarte() {
  while (sitzung.reihe.length) {
    const karte = store.getState().cards.find((c) => c.id === sitzung.reihe[0]);
    if (karte) return karte;
    sitzung.reihe.shift();
  }
  return null;
}

function seiten(karte) {
  return sitzung.richtung === 'vor'
    ? { frage: karte.front, antwort: karte.back, bildF: karte.bildVorn, bildA: karte.bildHinten }
    : { frage: karte.back, antwort: karte.front, bildF: karte.bildHinten, bildA: karte.bildVorn };
}

const inhalt = (text, bild) => [bild && h('img', { class: 'karte-bild', src: bild, alt: '' }), text && h('p', { class: 'karte-text' }, text)];

function bewerten(ctx, karte, rating) {
  store.review(karte.id, rating);
  sitzung.reihe.shift();
  const schon = sitzung.nochmal.get(karte.id) || 0;
  if (rating === 0 && schon < 2) {
    sitzung.nochmal.set(karte.id, schon + 1);
    sitzung.reihe.push(karte.id); // kommt am Ende der Runde noch einmal
  } else {
    sitzung.erledigt += 1;
    if (rating > 0 && schon === 0) sitzung.richtig += 1;
  }
  Object.assign(sitzung, { phase: 'frage', urteil: null, eingabe: '', optionen: null, gesprochen: false });
  ctx.refresh();
}

function beenden(ctx) {
  const danach = sitzung?.danach;
  sitzung = null;
  if (danach) danach();
  else ctx.close();
}

function lernen(ctx) {
  if (!sitzung) { ctx.close(); return h('div'); }
  const karte = aktuelleKarte();
  if (!karte) return ende(ctx);

  const deck = store.getDeck(karte.deckId);
  const fach = FAECHER[deck?.fach] || FAECHER.sonstiges;
  const { frage, antwort, bildF, bildA } = seiten(karte);
  let modus = sitzung.modus;
  if (!antwort && modus !== 'umdrehen') modus = 'umdrehen'; // Bild als Antwort: nur zum Umdrehen

  if (modus === 'ankreuzen' && !sitzung.optionen) {
    const pool = store.cardsOf(karte.deckId).map((c) => seiten(c).antwort);
    sitzung.optionen = mcOptionen(antwort, pool) || 'keine';
  }
  if (modus === 'ankreuzen' && sitzung.optionen === 'keine') modus = 'umdrehen'; // zu wenige Karten für vier Möglichkeiten

  const offen = sitzung.phase === 'antwort';
  const fremdVorn = sitzung.richtung === 'vor';
  const tonKnopf = (text) =>
    fach.lang && kannSprechen() &&
    h('button', { class: 'knopf-icon karte-ton', 'aria-label': 'Aussprache anhören', onclick: (e) => { e.stopPropagation(); sprechen(text, fach.lang); } }, icon('ton'));

  const neuKarte = sitzung.letzte !== karte.id + sitzung.modus + sitzung.erledigt;
  sitzung.letzte = karte.id + sitzung.modus + sitzung.erledigt;
  const kopf = h('div', { class: `lernen-kopf ${neuKarte ? 'karte-kommt' : ''}` },
    h('button', { class: 'knopf knopf-leise', onclick: () => beenden(ctx) }, icon('x', 18), 'Beenden'),
    h('div', { class: 'lernen-stand' },
      h('span', null, `${Math.min(sitzung.erledigt + 1, sitzung.gesamt)} von ${sitzung.gesamt}`),
      h('progress', { max: sitzung.gesamt, value: sitzung.erledigt, 'aria-label': 'Fortschritt' })));

  const hinweisZeile = offen && karte.note && h('p', { class: 'karte-notiz' }, karte.note);

  // ---------- Karteikarte umdrehen ----------
  if (modus === 'umdrehen') {
    let gedreht = offen;
    const umdrehen = () => {
      if (gedreht) return;
      gedreht = true;
      sitzung.phase = 'antwort';
      kartenEl.classList.add('ist-offen');
      kartenEl.removeAttribute('role'); kartenEl.removeAttribute('tabindex'); kartenEl.removeAttribute('aria-label');
      unten.replaceChildren(bewertungEl());
      unten.querySelector('button')?.focus({ preventScroll: true });
    };
    const taste = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!gedreht && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); umdrehen(); }
      else if (gedreht && ['1', '2', '3', '4'].includes(e.key)) bewerten(ctx, karte, Number(e.key) - 1);
    };
    document.addEventListener('keydown', taste);
    ctx.onLeave(() => document.removeEventListener('keydown', taste));

    const stufen = [
      { r: 0, name: 'Nochmal', art: 'rot' },
      { r: 1, name: 'Schwer', art: '' },
      { r: 2, name: 'Gut', art: '' },
      { r: 3, name: 'Einfach', art: 'gruen' },
    ];
    const bewertungEl = () => h('div', { class: 'bewertung' },
      h('p', { class: 'hinweis' }, 'Wie gut wusstest du es? (Tasten 1–4)'),
      h('div', { class: 'bewertung-knoepfe' }, stufen.map((s) =>
        h('button', { class: `knopf knopf-stufe ${s.art}`, onclick: () => bewerten(ctx, karte, s.r) },
          h('span', null, s.name), h('small', null, intervalText(karte.srs, s.r))))));
    const kartenEl = h('div', { class: `flip ${offen ? 'ist-offen' : ''}`, role: offen ? null : 'button', tabindex: offen ? null : '0', 'aria-label': offen ? null : 'Karte umdrehen', onclick: umdrehen },
      h('div', { class: 'flip-innen' },
        h('div', { class: `karteikarte gross flip-vorn farbe-${fach.farbe}` },
          h('div', { class: 'karte-seite' }, inhalt(frage, bildF), fremdVorn && tonKnopf(karte.front)),
          h('p', { class: 'karte-tipp' }, 'Tippen zum Umdrehen')),
        h('div', { class: `karteikarte gross flip-hinten farbe-${fach.farbe}` },
          h('div', { class: 'karte-seite' },
            frage && h('p', { class: 'karte-frage-klein' }, frage),
            inhalt(antwort, bildA),
            !fremdVorn && tonKnopf(karte.front),
            karte.note && h('p', { class: 'karte-notiz' }, karte.note)))));
    const unten = h('div', { class: 'lernen-unten' },
      offen ? bewertungEl() : h('button', { class: 'knopf knopf-haupt knopf-breit', onclick: umdrehen }, 'Umdrehen'));
    return h('div', { class: 'lernen' }, kopf,
      h('p', { class: 'lernen-stapel' }, deck?.name || ''),
      kartenEl, unten);
  }

  // ---------- Antwort schreiben ----------
  if (modus === 'schreiben' || modus === 'sprechen') {
    const sprechModus = modus === 'sprechen';
    const zeichen = !fremdVorn ? SONDERZEICHEN[deck?.fach] : null;
    const eingabe = h('input', {
      type: 'text', class: 'eingabe-gross', value: sitzung.eingabe, disabled: offen,
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Deine Antwort',
      lang: !fremdVorn && fach.lang ? fach.lang.slice(0, 2) : 'de',
      oninput: (e) => { sitzung.eingabe = e.target.value; },
    });
    const pruefen = (e) => {
      e?.preventDefault();
      if (offen) return;
      sitzung.urteil = checkAnswer(sitzung.eingabe, antwort);
      sitzung.phase = 'antwort';
      ctx.refresh();
    };
    const weiter = () => bewerten(ctx, karte, sitzung.urteil === 'richtig' ? 2 : sitzung.urteil === 'fast' ? 1 : 0);
    // Mündlich: sprechen, beste der erkannten Varianten werten
    const antwortSprache = !fremdVorn && fach.lang ? fach.lang : 'de-DE';
    const mikroText = h('p', { class: 'mikro-text', 'aria-live': 'polite' }, kannHoeren() ? 'Tippe aufs Mikrofon und sprich deine Antwort.' : 'Tipp ins Feld und nutze die Diktier-Taste 🎤 deiner Tastatur.');
    const mikro = sprechModus && !offen && kannHoeren() && h('button', { type: 'button', class: 'mikro', 'aria-label': 'Antwort sprechen', onclick: async () => {
      if (mikro.classList.contains('hoert')) { stopHoeren(); return; }
      mikro.classList.add('hoert');
      mikroText.textContent = 'Ich höre zu …';
      try {
        const r = await hoeren(antwortSprache, { onZwischen: (t) => { mikroText.textContent = t || 'Ich höre zu …'; } });
        const reihenfolge = { richtig: 0, fast: 1, falsch: 2 };
        let beste = { text: r.text, u: checkAnswer(r.text, antwort) };
        for (const a of r.alternativen) { const u = checkAnswer(a, antwort); if (reihenfolge[u] < reihenfolge[beste.u]) beste = { text: a, u }; }
        sitzung.eingabe = beste.text;
        sitzung.urteil = beste.u;
        sitzung.gesprochen = true;
        sitzung.phase = 'antwort';
        ctx.refresh();
      } catch (e) {
        mikro.classList.remove('hoert');
        if (e.message !== 'abgebrochen') mikroText.textContent = e.message;
      }
    } }, icon('mikro', 34));
    ctx.onLeave(stopHoeren);
    const urteilText = { richtig: 'Richtig!', fast: 'Fast richtig – schau auf Schreibweise und Artikel.', falsch: 'Noch nicht.' };
    const urteilIcon = { richtig: 'check', fast: 'halb', falsch: 'x' };

    const seite = h('div', { class: 'lernen' }, kopf,
      h('p', { class: 'lernen-stapel' }, deck?.name || ''),
      h('div', { class: `karteikarte gross farbe-${fach.farbe}` },
        h('div', { class: 'karte-seite' }, inhalt(frage, bildF), fremdVorn && tonKnopf(karte.front))),
      h('form', { class: 'schreiben', onsubmit: offen ? (e) => { e.preventDefault(); weiter(); } : pruefen },
        sprechModus && !offen && h('div', { class: 'mikro-feld' }, mikro, mikroText),
        sprechModus && offen && sitzung.gesprochen && h('p', { class: 'mikro-text' }, 'Verstanden: „', h('b', null, sitzung.eingabe), '“'),
        (!sprechModus || !kannHoeren() || offen) && eingabe,
        zeichen && !offen && h('div', { class: 'sonderzeichen', 'aria-label': 'Sonderzeichen einfügen' }, zeichen.map((z) =>
          h('button', { type: 'button', class: 'knopf knopf-zeichen', onclick: () => {
            const a = eingabe.selectionStart ?? eingabe.value.length;
            const b = eingabe.selectionEnd ?? a;
            eingabe.value = eingabe.value.slice(0, a) + z + eingabe.value.slice(b);
            sitzung.eingabe = eingabe.value;
            eingabe.focus();
            eingabe.setSelectionRange(a + 1, a + 1);
          } }, z))),
        offen
          ? [
              h('div', { class: `urteil urteil-${sitzung.urteil}`, role: 'status' },
                icon(urteilIcon[sitzung.urteil], 20),
                h('div', null,
                  h('strong', null, urteilText[sitzung.urteil]),
                  sitzung.urteil !== 'richtig' && h('p', null, 'Richtig ist: ', h('b', null, antwort)),
                  !fremdVorn && tonKnopf(karte.front),
                  hinweisZeile)),
              h('button', { class: 'knopf knopf-haupt knopf-breit', type: 'submit' }, 'Weiter'),
            ]
          : h('button', { class: 'knopf knopf-haupt knopf-breit', type: 'submit' }, 'Prüfen')));
    queueMicrotask(() => (offen ? seite.querySelector('button[type=submit]') : sprechModus && kannHoeren() ? null : eingabe)?.focus());
    return seite;
  }

  // ---------- Ankreuzen ----------
  const waehlen = (o) => {
    if (offen) return;
    sitzung.eingabe = o;
    sitzung.urteil = o === antwort ? 'richtig' : 'falsch';
    sitzung.phase = 'antwort';
    ctx.refresh();
  };
  const seite = h('div', { class: 'lernen' }, kopf,
    h('p', { class: 'lernen-stapel' }, deck?.name || ''),
    h('div', { class: `karteikarte gross farbe-${fach.farbe}` },
      h('div', { class: 'karte-seite' }, inhalt(frage, bildF), fremdVorn && tonKnopf(karte.front))),
    h('div', { class: 'ankreuzen' }, sitzung.optionen.map((o) => {
      const istRichtig = offen && o === antwort;
      const istFalsch = offen && o === sitzung.eingabe && o !== antwort;
      return h('button', { class: `knopf knopf-option ${istRichtig ? 'ist-richtig' : ''} ${istFalsch ? 'ist-falsch' : ''}`, disabled: offen && !istRichtig && !istFalsch, 'aria-disabled': offen ? 'true' : null, onclick: () => waehlen(o) },
        istRichtig && icon('check', 18), istFalsch && icon('x', 18), h('span', null, o));
    })),
    offen && hinweisZeile,
    offen && h('button', { class: 'knopf knopf-haupt knopf-breit', id: 'weiter', onclick: () => bewerten(ctx, karte, sitzung.urteil === 'richtig' ? 2 : 0) }, 'Weiter'));
  if (offen) queueMicrotask(() => seite.querySelector('#weiter')?.focus());
  return seite;
}

function ende(ctx) {
  const { richtig, gesamt } = sitzung;
  const serie = store.streak();
  const anteil = gesamt ? richtig / gesamt : 0;
  const spruch = anteil >= 0.9 ? 'Stark!' : anteil >= 0.6 ? 'Geschafft!' : 'Dranbleiben!';
  return h('div', { class: 'lernen lernen-ende' },
    anteil >= 0.6 && konfetti(),
    h('p', { class: 'handschrift ende-spruch' }, spruch),
    h('p', { class: 'ende-zahl' }, `${richtig} von ${mehrzahl(gesamt, 'Karte', 'Karten')} auf Anhieb gewusst.`),
    richtig < gesamt && h('p', { class: 'hinweis' }, 'Die anderen kommen morgen früher wieder dran.'),
    serie > 0 && h('p', { class: 'ende-serie' }, h('mark', null, serie === 1 ? 'Erster Tag deiner Lernserie' : `${serie} Tage in Folge gelernt`)),
    h('button', { class: 'knopf knopf-haupt knopf-breit', onclick: () => beenden(ctx) }, 'Fertig'));
}

function konfetti() {
  const farben = ['var(--marker)', 'var(--koenigsblau)', 'var(--rotstift)', 'var(--gruen)'];
  return h('div', { class: 'konfetti', 'aria-hidden': 'true' }, Array.from({ length: 36 }, (_, i) =>
    h('i', { style: { left: `${(i * 37) % 100}%`, background: farben[i % 4], animationDelay: `${(i % 9) * 0.07}s`, animationDuration: `${1.4 + (i % 5) * 0.25}s`, transform: `rotate(${i * 23}deg)` } })));
}
