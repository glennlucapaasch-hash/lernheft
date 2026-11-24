// Lern-Abenteuer: Jedes Fach ist eine Welt mit Levels und einem Boss. Sterne schalten Avatare frei.
import { h, icon } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { shuffle, mcOptionen } from '../exam.js';
import { checkAnswer } from '../check.js';

const WELTEN = [
  { name: 'Zauberwald', emoji: '🌲', boss: '🐺', bossName: 'Schattenwolf', farbe: '#2f8f4e' },
  { name: 'Glutwüste', emoji: '🏜️', boss: '🦂', bossName: 'Riesenskorpion', farbe: '#d4882a' },
  { name: 'Eisgipfel', emoji: '🏔️', boss: '🐻‍❄️', bossName: 'Frostbär', farbe: '#4b9cd3' },
  { name: 'Feuervulkan', emoji: '🌋', boss: '🐉', bossName: 'Lavadrache', farbe: '#c4392b' },
  { name: 'Tiefsee', emoji: '🌊', boss: '🦑', bossName: 'Krake', farbe: '#1f6fa8' },
  { name: 'Geisterburg', emoji: '🏰', boss: '👻', bossName: 'Burggespenst', farbe: '#6b4fa3' },
  { name: 'Sternenstation', emoji: '🚀', boss: '👾', bossName: 'Weltraummonster', farbe: '#2b2f6b' },
];
const LEVELS = 6; // 5 normale + Boss
const AVATARE = [['🦊', 0], ['🐱', 3], ['🐼', 8], ['🐸', 14], ['🦉', 20], ['🐯', 28], ['🦄', 36], ['🐲', 45], ['🤖', 55], ['👑', 70]];

const ui = { welt: null, spiel: null };
const zustand = () => store.getState().abenteuer;
const sterneVon = (fach, i) => zustand().sterne[`${fach}:${i}`] || 0;
const sterneGesamt = () => Object.values(zustand().sterne).reduce((a, b) => a + b, 0);

function welten() {
  const faecher = [...new Set(store.getState().cards.filter((c) => c.front && c.back).map((c) => store.getDeck(c.deckId)?.fach).filter(Boolean))];
  return faecher.filter((f) => store.getState().cards.filter((c) => store.getDeck(c.deckId)?.fach === f && c.front && c.back).length >= 4)
    .map((f, i) => ({ fach: f, ...WELTEN[Object.keys(FAECHER).indexOf(f) % WELTEN.length], nr: i }));
}

function fragen(fach, anzahl) {
  const karten = store.getState().cards.filter((c) => c.front && c.back && store.getDeck(c.deckId)?.fach === fach);
  // schwache Karten bevorzugen
  const sortiert = shuffle(karten).sort((a, b) => (a.srs?.interval || 0) - (b.srs?.interval || 0));
  const liste = [];
  for (const c of shuffle(sortiert.slice(0, Math.max(anzahl * 2, 10)))) {
    const rueck = Math.random() < 0.3;
    const richtig = rueck ? c.front : c.back;
    const opts = mcOptionen(richtig, karten.map((x) => (rueck ? x.front : x.back)));
    liste.push(opts ? { frage: rueck ? c.back : c.front, opts, antwort: richtig } : { frage: c.front, antwort: c.back });
    if (liste.length >= anzahl) break;
  }
  while (liste.length < anzahl && liste.length) liste.push(liste[liste.length % karten.length] || liste[0]);
  return liste;
}

function levelStarten(ctx, welt, i) {
  const boss = i === LEVELS - 1;
  ui.spiel = { welt, i, boss, fragen: fragen(welt.fach, boss ? 12 : 8), n: 0, richtig: 0, herzen: 3, bossHp: boss ? 8 : 0, feedback: null, ende: null };
  ctx.refresh();
}

function antworten(ctx, wahl) {
  const s = ui.spiel;
  const f = s.fragen[s.n];
  const ok = f.opts ? wahl === f.antwort : checkAnswer(wahl, f.antwort) !== 'falsch';
  s.feedback = { ok, antwort: f.antwort, wahl };
  if (ok) { s.richtig += 1; if (s.boss) s.bossHp -= 1; } else if (s.boss) s.herzen -= 1;
  if (navigator.vibrate) navigator.vibrate(ok ? 20 : [40, 40, 40]);
  ctx.refresh();
  setTimeout(() => {
    s.feedback = null;
    s.n += 1;
    if (s.boss && (s.bossHp <= 0 || s.herzen <= 0 || s.n >= s.fragen.length)) fertig(s.bossHp <= 0 ? (s.herzen === 3 ? 3 : s.herzen === 2 ? 2 : 1) : 0);
    else if (!s.boss && s.n >= s.fragen.length) { const q = s.richtig / s.fragen.length; fertig(q >= 0.9 ? 3 : q >= 0.75 ? 2 : q >= 0.6 ? 1 : 0); }
    if (location.hash === '#abenteuer') ctx.refresh();
  }, ok ? 700 : 1600);
}

function fertig(sterne) {
  const s = ui.spiel;
  const key = `${s.welt.fach}:${s.i}`;
  const vorher = zustand().sterne[key] || 0;
  const avVorher = AVATARE.filter(([, n]) => sterneGesamt() >= n).length;
  if (sterne > vorher) { zustand().sterne[key] = sterne; store.getState().bonusXp += (sterne - vorher) * 10; store.save(); }
  const neuerAvatar = AVATARE.filter(([, n]) => sterneGesamt() >= n).length > avVorher ? AVATARE.filter(([, n]) => sterneGesamt() >= n).at(-1)[0] : null;
  s.ende = { sterne, neu: sterne > vorher, xp: Math.max(0, sterne - vorher) * 10, neuerAvatar };
}

function spielAnsicht(ctx) {
  const s = ui.spiel;
  if (s.ende) {
    const e = s.ende;
    return h('div', { class: 'spiel abenteuer-ende', style: `--welt:${s.welt.farbe}` },
      h('div', { class: 'blatt spiel-ende' },
        h('p', { class: 'abenteuer-gross' }, e.sterne ? (s.boss ? '🏆' : '🎉') : '💥'),
        h('p', { class: 'handschrift ende-spruch' }, e.sterne ? (s.boss ? `${s.welt.bossName} besiegt!` : 'Level geschafft!') : (s.boss ? `${s.welt.bossName} war zu stark …` : 'Knapp daneben!')),
        h('p', { class: 'abenteuer-sterne', 'aria-label': `${e.sterne} von 3 Sternen` }, [0, 1, 2].map((k) => h('span', { class: k < e.sterne ? 'ist-an' : '', style: `animation-delay:${0.3 + k * 0.25}s` }, '★'))),
        h('p', null, `${s.richtig} von ${s.n} richtig.${e.xp ? ` +${e.xp} XP` : ''}`),
        !e.sterne && h('p', { class: 'hinweis' }, s.boss ? 'Tipp: Wiederhol die Karten dieses Fachs und versuch es nochmal.' : 'Ab 60 % richtig gibt es einen Stern.'),
        e.neuerAvatar && h('div', { class: 'abenteuer-avatar-neu' }, h('span', null, e.neuerAvatar), h('strong', null, 'Neuer Avatar freigeschaltet!')),
        h('div', { class: 'reihe' },
          h('button', { class: 'knopf knopf-haupt', onclick: () => { ui.spiel = null; ctx.refresh(); } }, 'Zur Karte'),
          h('button', { class: 'knopf', onclick: () => levelStarten(ctx, s.welt, s.i) }, 'Nochmal'))));
  }
  const f = s.fragen[s.n];
  const fb = s.feedback;
  const eingabe = !f.opts && h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Antwort', disabled: Boolean(fb) });
  return h('div', { class: `spiel abenteuer-spiel ${s.boss ? 'ist-boss' : ''}`, style: `--welt:${s.welt.farbe}` },
    h('div', { class: 'spiel-kopf' },
      h('button', { class: 'knopf knopf-leise knopf-mini', onclick: () => { ui.spiel = null; ctx.refresh(); } }, '✕ Aufgeben'),
      h('strong', null, s.boss ? `Boss: ${s.welt.bossName}` : `${s.welt.name} – Level ${s.i + 1}`),
      h('span', null, `${s.n + 1}/${s.fragen.length}`)),
    s.boss && h('div', { class: 'abenteuer-kampf' },
      h('div', { class: 'abenteuer-held' }, h('span', { class: `abenteuer-figur ${fb && !fb.ok ? 'wackelt' : ''}` }, zustand().avatar), h('span', { 'aria-label': `${s.herzen} Herzen` }, '❤️'.repeat(Math.max(0, s.herzen)) + '🖤'.repeat(3 - Math.max(0, s.herzen)))),
      h('span', { class: 'abenteuer-vs' }, fb?.ok ? '⚔️' : 'VS'),
      h('div', { class: 'abenteuer-boss' }, h('span', { class: `abenteuer-figur ${fb?.ok ? 'getroffen' : ''}` }, s.welt.boss),
        h('div', { class: 'abenteuer-hp', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '8', 'aria-valuenow': String(s.bossHp), 'aria-label': 'Leben des Bosses' }, h('div', { style: `width:${(s.bossHp / 8) * 100}%` })))),
    !s.boss && h('div', { class: 'abenteuer-fortschritt' }, s.fragen.map((_, k) => h('span', { class: k < s.n ? 'ist-fertig' : k === s.n ? 'ist-jetzt' : '' }))),
    h('div', { class: 'karteikarte gross farbe-gelb blitz-karte' }, h('div', { class: 'karte-seite' }, h('p', { class: 'karte-text' }, f.frage))),
    f.opts
      ? h('div', { class: 'ankreuzen' }, f.opts.map((o) => h('button', {
        class: `knopf knopf-option ${fb && o === fb.antwort ? 'ist-richtig' : ''} ${fb && o === fb.wahl && !fb.ok ? 'ist-falsch' : ''}`, disabled: Boolean(fb), onclick: () => antworten(ctx, o),
      }, h('span', null, o))))
      : h('form', { class: 'reihe', onsubmit: (e) => { e.preventDefault(); antworten(ctx, eingabe.value); } }, eingabe, h('button', { class: 'knopf knopf-haupt', type: 'submit', disabled: Boolean(fb) }, 'OK')),
    fb && !fb.ok && !f.opts && h('p', { class: 'hinweis' }, `Richtig wäre: ${fb.antwort}`));
}

function weltKarte(ctx, w) {
  const pfad = [];
  for (let i = 0; i < LEVELS; i++) {
    const st = sterneVon(w.fach, i);
    const offen = i === 0 || sterneVon(w.fach, i - 1) > 0;
    const boss = i === LEVELS - 1;
    const aktuell = offen && st === 0;
    pfad.push(h('li', { class: `abenteuer-level ${offen ? '' : 'ist-zu'} ${boss ? 'ist-boss' : ''} ${aktuell ? 'ist-aktuell' : ''}`, style: `--x:${[0, 1, 2, 1, 0, 1][i]}` },
      h('button', { disabled: !offen, 'aria-label': `${boss ? 'Boss' : `Level ${i + 1}`}${offen ? `, ${st} von 3 Sternen` : ', gesperrt'}`, onclick: () => levelStarten(ctx, w, i) },
        h('span', { class: 'abenteuer-level-nr' }, offen ? (boss ? w.boss : String(i + 1)) : '🔒'),
        aktuell && h('span', { class: 'abenteuer-ich', 'aria-hidden': 'true' }, zustand().avatar)),
      h('span', { class: 'abenteuer-mini-sterne', 'aria-hidden': 'true' }, offen ? '★'.repeat(st) + '☆'.repeat(3 - st) : '')));
  }
  return h('div', { class: 'abenteuer-welt', style: `--welt:${w.farbe}` },
    h('div', { class: 'reihe' }, h('button', { class: 'knopf knopf-leise knopf-mini', onclick: () => { ui.welt = null; ctx.refresh(); } }, '← Alle Welten'),
      h('strong', null, `${w.emoji} ${w.name} – ${FAECHER[w.fach].name}`)),
    h('ol', { class: 'abenteuer-pfad' }, pfad),
    h('p', { class: 'hinweis' }, 'Die Fragen kommen aus deinen eigenen Karten in diesem Fach – schwache Karten öfter. Ab 60 % gibt es einen Stern, der Boss braucht 8 Treffer, bevor deine 3 Herzen weg sind.'));
}

export function abenteuer(ctx) {
  if (ui.spiel) return spielAnsicht(ctx);
  const ws = welten();
  if (ui.welt) { const w = ws.find((x) => x.fach === ui.welt); if (w) return weltKarte(ctx, w); ui.welt = null; }
  const gesamt = sterneGesamt();
  const naechster = AVATARE.find(([, n]) => n > gesamt);
  return h('div', { class: 'abenteuer' },
    h('div', { class: 'blatt abenteuer-held-karte' },
      h('span', { class: 'abenteuer-figur gross' }, zustand().avatar),
      h('div', null, h('strong', null, `${gesamt} ★ gesammelt`), naechster && h('small', null, `Noch ${naechster[1] - gesamt} ★ bis ${naechster[0]}`)),
      h('div', { class: 'abenteuer-avatare', role: 'group', 'aria-label': 'Avatar wählen' }, AVATARE.map(([a, n]) => h('button', {
        class: `${zustand().avatar === a ? 'ist-aktiv' : ''}`, disabled: gesamt < n, 'aria-label': gesamt < n ? `Gesperrt, ab ${n} Sternen` : `Avatar ${a}`,
        onclick: () => { zustand().avatar = a; store.save(); ctx.refresh(); },
      }, gesamt < n ? '🔒' : a)))),
    ws.length === 0
      ? h('div', { class: 'blatt leer' }, h('p', null, 'Für das Abenteuer brauchst du mindestens 4 Karteikarten in einem Fach.'), h('button', { class: 'knopf knopf-haupt', onclick: () => ctx.go('scannen') }, icon('scan', 18), 'Seite scannen'))
      : h('div', { class: 'abenteuer-welten' }, ws.map((w) => {
        const st = Array.from({ length: LEVELS }, (_, i) => sterneVon(w.fach, i)).reduce((a, b) => a + b, 0);
        const besiegt = sterneVon(w.fach, LEVELS - 1) > 0;
        return h('button', { class: 'abenteuer-welt-karte', style: `--welt:${w.farbe}`, onclick: () => { ui.welt = w.fach; ctx.refresh(); } },
          h('span', { class: 'abenteuer-welt-emoji', 'aria-hidden': 'true' }, w.emoji),
          h('strong', null, w.name), h('small', null, FAECHER[w.fach].name),
          h('span', { class: 'abenteuer-welt-stand' }, `${st}/${LEVELS * 3} ★`, besiegt && ` · ${w.boss} besiegt`));
      })),
  );
}
