import { h, icon, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { ABZEICHEN, level, werte, rueckblick } from '../erfolge.js';

const ui = { tab: 'abzeichen' };

function abzeichenSeite() {
  const w = werte();
  const l = level(w);
  const s = store.getState();
  const erreicht = ABZEICHEN.filter((a) => s.abzeichen[a.id]).length;
  return [
    h('section', { class: 'blatt level' },
      h('div', { class: 'level-ring', style: `--anteil:${Math.round(l.anteil * 100)}`, role: 'img', 'aria-label': `Level ${l.lvl}` },
        h('span', { class: 'handschrift' }, String(l.lvl))),
      h('div', { class: 'level-text' },
        h('p', { class: 'level-titel' }, `Level ${l.lvl} – ${l.titel}`),
        h('progress', { max: l.ziel - l.start, value: l.xp - l.start, 'aria-label': 'Fortschritt zum nächsten Level' }),
        h('p', { class: 'hinweis' }, `${l.xp} Punkte · noch ${l.ziel - l.xp} bis Level ${l.lvl + 1}`),
        h('p', { class: 'hinweis' }, 'Punkte gibt es für jede Abfrage (doppelt, wenn richtig), Probeklausuren, Notizen und Spiele.'))),
    h('h2', null, `Abzeichen (${erreicht} von ${ABZEICHEN.length})`),
    h('ul', { class: 'abzeichen-gitter' }, ABZEICHEN.map((a) => {
      const da = s.abzeichen[a.id];
      return h('li', { class: `abzeichen ${da ? 'ist-da' : ''}` },
        h('span', { class: 'abzeichen-icon', 'aria-hidden': 'true' }, a.icon),
        h('strong', null, a.name),
        h('small', null, a.text),
        da ? h('small', { class: 'abzeichen-datum' }, new Date(da).toLocaleDateString('de-DE')) : h('small', { class: 'abzeichen-datum' }, 'noch offen'));
    })),
    h('p', { class: 'hinweis' }, `Längste Serie: ${mehrzahl(w.serie, 'Tag', 'Tage')} · ${w.sicher} Karten sicher`),
  ];
}

function rueckblickSeite() {
  const r = rueckblick();
  const diff = r.abfragen - r.vorherAbfragen;
  const wochentag = (d) => d.toLocaleDateString('de-DE', { weekday: 'long' });
  const karten = [
    h('div', { class: 'rb-karte rb-blau' },
      h('small', null, 'Deine letzten 7 Tage'),
      h('p', { class: 'rb-zahl handschrift' }, String(r.abfragen)),
      h('p', null, r.abfragen === 1 ? 'Karte abgefragt' : 'Karten abgefragt'),
      r.vorherAbfragen || r.abfragen ? h('p', { class: 'rb-klein' }, diff > 0 ? `${diff} mehr als in der Woche davor 📈` : diff < 0 ? `${-diff} weniger als in der Woche davor` : 'Genauso viele wie in der Woche davor') : null),
    h('div', { class: 'rb-karte rb-gelb' },
      h('small', null, 'Trefferquote'),
      h('p', { class: 'rb-zahl handschrift' }, `${r.quote} %`),
      h('p', null, `an ${mehrzahl(r.aktiv, 'Tag', 'Tagen')} gelernt`),
      r.bester && h('p', { class: 'rb-klein' }, `Stärkster Tag: ${wochentag(r.bester.d)} mit ${r.bester.n}`)),
    h('div', { class: 'rb-karte rb-gruen' },
      h('small', null, 'Gewachsen'),
      h('p', { class: 'rb-zahl handschrift' }, String(r.neueKarten)),
      h('p', null, r.neueKarten === 1 ? 'neue Karte' : 'neue Karten'),
      h('p', { class: 'rb-klein' }, `Insgesamt sitzen jetzt ${r.sicher} Karten sicher.`)),
    (r.klausuren || r.notizen) && h('div', { class: 'rb-karte rb-rosa' },
      h('small', null, 'Geschafft'),
      r.klausuren ? h('p', null, h('b', { class: 'rb-mittel' }, String(r.klausuren)), ` ${r.klausuren === 1 ? 'Probeklausur' : 'Probeklausuren'}`, r.besteNote ? ` – beste Note: ${r.besteNote}` : '') : null,
      r.notizen ? h('p', null, h('b', { class: 'rb-mittel' }, String(r.notizen)), ` ${r.notizen === 1 ? 'Notiz' : 'Notizen'} geschrieben`) : null),
    r.abzeichen.length > 0 && h('div', { class: 'rb-karte rb-lila' },
      h('small', null, 'Neue Abzeichen'),
      h('p', { class: 'rb-icons' }, r.abzeichen.map((a) => a.icon).join(' ')),
      h('p', null, r.abzeichen.map((a) => a.name).join(', '))),
    h('div', { class: 'rb-karte rb-weiss' },
      h('small', null, 'Nächste Woche'),
      r.naechster
        ? h('p', null, h('b', null, r.naechster.titel), ` am ${new Date(`${r.naechster.datum}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}.`)
        : h('p', null, 'Keine Klassenarbeit eingetragen.'),
      h('p', { class: 'handschrift rb-spruch' }, r.aktiv >= 5 ? 'Starke Woche – weiter so!' : r.aktiv >= 2 ? 'Guter Anfang. Schaffst du 5 Tage?' : 'Neue Woche, neue Chance!')),
  ].filter(Boolean);
  return [h('div', { class: 'rueckblick', role: 'list' }, karten.map((k, i) => { k.setAttribute('role', 'listitem'); k.style.animationDelay = `${i * 0.08}s`; return k; })),
    h('p', { class: 'hinweis' }, 'Wisch zur Seite für alle Karten.')];
}

export function erfolge(ctx) {
  if (ctx.optionen?.tab) ui.tab = ctx.optionen.tab;
  const tabs = [['abzeichen', 'Level & Abzeichen'], ['rueckblick', 'Wochenrückblick']];
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Erfolge')),
    h('div', { class: 'reiter', role: 'tablist' }, tabs.map(([id, name]) =>
      h('button', { role: 'tab', class: 'reiter-knopf', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; ctx.refresh(); } }, name))),
    h('div', { role: 'tabpanel', class: 'erfolge-inhalt' }, ui.tab === 'abzeichen' ? abzeichenSeite() : rueckblickSeite()));
}
