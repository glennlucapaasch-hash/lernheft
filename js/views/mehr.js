// „Mehr“: alle Bereiche als Kacheln, globale Suche und Fokus-Timer
import { h, icon, modal, toast } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { THEMEN } from '../themen-daten.js';

export const GRUPPEN = [
  ['lernen', 'Lernen'], ['werkzeuge', 'Werkzeuge'], ['gruppe', 'Gemeinsam'], ['ich', 'Ich'],
];

// ---------- Globale Suche ----------
const klein = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function suchen(q) {
  const s = store.getState();
  const k = klein(q.trim());
  if (k.length < 2) return [];
  const treffer = [];
  for (const c of s.cards) if (klein(`${c.front} ${c.back} ${c.note}`).includes(k)) treffer.push({ art: 'Karte', titel: `${c.front} → ${c.back}`, unter: store.getDeck(c.deckId)?.name, ziel: ['karten', { deckId: c.deckId }] });
  for (const d of s.decks) if (klein(d.name).includes(k)) treffer.push({ art: 'Stapel', titel: d.name, unter: FAECHER[d.fach]?.name, ziel: ['karten', { deckId: d.id }] });
  for (const n of s.notizen) if (klein(`${n.titel} ${n.text}`).includes(k)) treffer.push({ art: 'Notiz', titel: n.titel || 'Ohne Titel', unter: FAECHER[n.fach]?.name, ziel: ['notizen', { notiz: n.id }] });
  THEMEN.forEach((t, i) => { if (klein(`${t[2]} ${t[3]}`).includes(k)) treffer.push({ art: 'Thema', titel: t[2], unter: `${FAECHER[t[0]]?.name} · Klasse ${t[1]}`, ziel: ['themen', { thema: `t${i}` }] }); });
  for (const a of s.hausaufgaben) if (klein(`${a.text}`).includes(k)) treffer.push({ art: 'Hausaufgabe', titel: a.text, unter: FAECHER[a.fach]?.name, ziel: ['hausaufgaben'] });
  for (const n of s.noten) if (klein(`${n.titel} ${FAECHER[n.fach]?.name}`).includes(k)) treffer.push({ art: 'Note', titel: `${n.text || n.wert} – ${n.titel || FAECHER[n.fach]?.name}`, unter: FAECHER[n.fach]?.name, ziel: ['noten'] });
  return treffer.slice(0, 60);
}

export function sucheOeffnen(ctx) {
  const ergebnis = h('ul', { class: 'such-ergebnis', role: 'listbox' });
  const feld = h('input', { type: 'search', class: 'such-feld', placeholder: 'Karten, Notizen, Themen, Hausaufgaben …', 'aria-label': 'Alles durchsuchen', autocomplete: 'off' });
  let zu;
  const zeigen = () => {
    const l = suchen(feld.value);
    ergebnis.replaceChildren(...(feld.value.trim().length < 2 ? [h('li', { class: 'hinweis' }, 'Tipp mindestens zwei Buchstaben.')]
      : l.length ? l.map((t) => h('li', null, h('button', { class: 'such-treffer', onclick: () => { zu(); ctx.go(t.ziel[0], t.ziel[1]); } },
          h('span', { class: 'such-art' }, t.art), h('span', { class: 'such-titel' }, t.titel), t.unter && h('small', null, t.unter))))
      : [h('li', { class: 'hinweis' }, 'Nichts gefunden.'), h('li', null, h('button', { class: 'knopf', onclick: () => { zu(); ctx.go('chat', { frage: feld.value }); } }, icon('chat', 18), 'Den Lernhelfer fragen'))]));
  };
  feld.addEventListener('input', zeigen);
  zu = modal('Suchen', [feld, ergebnis]);
  zeigen();
  feld.focus();
}

// ---------- Fokus-Timer (Pomodoro) ----------
const timer = { ende: 0, phase: 'aus', dauer: 25, pause: 5, takt: null };
export function timerOeffnen() {
  const ring = h('div', { class: 'timer-ring', role: 'timer' }, h('span', { class: 'timer-zeit' }), h('small', { class: 'timer-phase' }));
  const knoepfe = h('div', { class: 'reihe', style: 'justify-content:center' });
  const aktualisieren = () => {
    const rest = Math.max(0, timer.ende - Date.now());
    const gesamt = (timer.phase === 'pause' ? timer.pause : timer.dauer) * 60000;
    const m = timer.phase === 'aus' ? timer.dauer : Math.floor(rest / 60000);
    const sek = timer.phase === 'aus' ? 0 : Math.floor((rest % 60000) / 1000);
    ring.querySelector('.timer-zeit').textContent = `${m}:${String(sek).padStart(2, '0')}`;
    ring.querySelector('.timer-phase').textContent = timer.phase === 'lernen' ? 'Fokus' : timer.phase === 'pause' ? 'Pause ☕' : 'Bereit';
    ring.style.setProperty('--anteil', timer.phase === 'aus' ? 100 : Math.round((rest / gesamt) * 100));
    ring.classList.toggle('ist-pause', timer.phase === 'pause');
    if (timer.phase !== 'aus' && rest <= 0) {
      const warLernen = timer.phase === 'lernen';
      timer.phase = warLernen ? 'pause' : 'lernen';
      timer.ende = Date.now() + (warLernen ? timer.pause : timer.dauer) * 60000;
      toast(warLernen ? '⏰ Super! Jetzt 5 Minuten Pause.' : '⏰ Pause vorbei – weiter geht’s!');
      try { navigator.vibrate?.(300); } catch { /* egal */ }
      knoepfeZeichnen();
    }
  };
  function knoepfeZeichnen() {
    knoepfe.replaceChildren(timer.phase === 'aus'
      ? h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: () => { timer.phase = 'lernen'; timer.ende = Date.now() + timer.dauer * 60000; knoepfeZeichnen(); aktualisieren(); } }, 'Fokus starten')
      : h('button', { class: 'knopf', onclick: () => { timer.phase = 'aus'; knoepfeZeichnen(); aktualisieren(); } }, 'Stoppen'));
  }
  const dauer = h('div', { class: 'chips', style: 'justify-content:center' }, [15, 25, 45].map((m) => h('button', { class: `chip ${timer.dauer === m ? 'ist-aktiv' : ''}`, disabled: timer.phase !== 'aus', onclick: (e) => { timer.dauer = m; dauer.querySelectorAll('.chip').forEach((c) => c.classList.remove('ist-aktiv')); e.currentTarget.classList.add('ist-aktiv'); aktualisieren(); } }, `${m} Min.`)));
  knoepfeZeichnen();
  aktualisieren();
  const t = setInterval(aktualisieren, 500);
  modal('Fokus-Timer', [h('p', { class: 'hinweis', style: 'text-align:center' }, 'Konzentriert lernen, dann kurz Pause. Der Timer läuft weiter, auch wenn du das Fenster schließt.'), ring, dauer, knoepfe], { onClose: () => clearInterval(t) });
}
export const timerLaeuft = () => timer.phase !== 'aus' && timer.ende > Date.now();
export const timerRest = () => Math.max(0, timer.ende - Date.now());

// ---------- Mehr-Seite ----------
export function mehrSeite(ctx, bereiche) {
  const sichtbar = bereiche.filter((b) => !b.versteckt && b.id !== 'mehr' && (!b.nurAdmin || ctx.konto?.admin) && (!b.nurKonto || ctx.konto));
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Alles im Lernheft')),
    h('button', { class: 'such-knopf', onclick: () => sucheOeffnen(ctx) }, icon('lupe', 20), h('span', null, 'Karten, Notizen, Themen durchsuchen …')),
    h('div', { class: 'reihe' }, h('button', { class: 'knopf', onclick: timerOeffnen }, '⏱️ Fokus-Timer')),
    GRUPPEN.map(([g, name]) => {
      const l = sichtbar.filter((b) => b.gruppe === g);
      return l.length > 0 && h('section', null,
        h('h2', { class: 'mehr-titel' }, name),
        h('div', { class: 'mehr-gitter' }, l.map((b, i) => h('a', { class: 'mehr-kachel', href: `#${b.id}`, style: `animation-delay:${i * 0.03}s`, onclick: () => { ctx.optionen = { neu: true }; } },
          h('span', { class: 'mehr-icon' }, icon(b.icon, 26)), h('strong', null, b.name), b.text && h('small', null, b.text)))));
    }));
}
