// Lernraum: gemeinsam lernen mit Video, Ton, Bildschirm teilen, Whiteboard, gemeinsamer Karte und Timer.
// Bild und Ton gehen direkt von Gerät zu Gerät (WebRTC). Es wird nichts aufgezeichnet.
import { h, icon, toast, nachfragen, modal } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { shuffle } from '../exam.js';

const ui = { code: '', titel: '' };
let raum = null; // aktiver Raum (nur solange die Seite offen ist)

async function api(pfad, body, opts = {}) {
  const r = await fetch(pfad, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', keepalive: opts.keepalive, headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error?.message || 'Das hat nicht geklappt.'), { status: r.status });
  return d;
}

// ---------------------------------------------------------------- Start
function startSeite(ctx) {
  const code = h('input', { type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: '123456', class: 'duell-code-eingabe', 'aria-label': 'Raum-Code', value: ui.code, oninput: (e) => { ui.code = e.target.value.replace(/\D/g, ''); e.target.value = ui.code; } });
  const titel = h('input', { type: 'text', maxlength: '60', placeholder: 'z. B. Mathe-Klausur lernen', 'aria-label': 'Name des Lernraums' });
  return h('div', { class: 'lernraum-start' },
    h('p', { class: 'einleitung' }, 'Lernt zusammen, auch wenn ihr nicht am selben Ort seid: mit Kamera und Mikrofon, Bildschirm teilen, gemeinsamem Whiteboard, Karten zusammen abfragen und einem Fokus-Timer für alle. Bis zu 6 Personen. Es wird nichts aufgezeichnet.'),
    h('section', { class: 'blatt' },
      h('h2', null, 'Beitreten'),
      h('form', { class: 'reihe', onsubmit: (e) => { e.preventDefault(); if (ui.code.length !== 6) { code.focus(); return; } betreten(ctx, ui.code, false); } },
        code, h('button', { class: 'knopf knopf-haupt knopf-gross', type: 'submit' }, 'Beitreten'))),
    h('section', { class: 'blatt' },
      h('h2', null, 'Neuen Lernraum öffnen'),
      h('form', { class: 'reihe', onsubmit: (e) => { e.preventDefault(); betreten(ctx, null, titel.value.trim()); } },
        titel, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, icon('gruppe', 18), 'Raum öffnen'))),
    h('p', { class: 'hinweis' }, 'Beim Beitreten fragt dein Handy, ob das Lernheft Kamera und Mikrofon benutzen darf – tippe auf „Erlauben“. Tipp: Kopfhörer verhindern Echo.'));
}

// Erklärt, warum Kamera/Mikrofon nicht gehen, und wie man es erlaubt. true = trotzdem ohne beitreten
function zugriffHilfe(fehler) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /Instagram|FBAN|FBAV|WhatsApp|Snapchat|TikTok|Line\//i.test(navigator.userAgent);
  const gesperrt = fehler === 'NotAllowedError' || fehler === 'SecurityError';
  const tipps = inApp ? ['Du hast den Link in einer anderen App geöffnet (z. B. WhatsApp oder Instagram). Dort ist die Kamera gesperrt.', 'Öffne lernheft.app direkt in Safari oder Chrome.']
    : gesperrt && ios ? ['Die Kamera wurde für diese Seite blockiert (vielleicht früher einmal „Nicht erlauben“ gedrückt).', 'In Safari: links in der Adressleiste auf „aA“ (oder das Symbol) tippen → „Website-Einstellungen“ → Kamera und Mikrofon auf „Erlauben“ oder „Fragen“.', 'Oder: iPhone-Einstellungen → Apps → Safari → Kamera bzw. Mikrofon → „Fragen“.', 'Wenn du das Lernheft vom Home-Bildschirm öffnest: Einstellungen → Lernheft (bzw. Safari) → Kamera erlauben. Sonst probier es einmal direkt in Safari.', 'Danach die Seite neu laden.']
      : gesperrt ? ['Kamera und Mikrofon wurden für diese Seite blockiert.', 'Tipp links in der Adressleiste auf das Schloss- bzw. Einstellungs-Symbol → Kamera und Mikrofon erlauben → Seite neu laden.', 'Auf Android zusätzlich: Einstellungen → Apps → Chrome → Berechtigungen → Kamera und Mikrofon erlauben.']
        : fehler === 'NotFoundError' ? ['Es wurde keine Kamera und kein Mikrofon gefunden.']
          : fehler === 'NotReadableError' ? ['Kamera oder Mikrofon werden gerade von einer anderen App benutzt (z. B. FaceTime, WhatsApp-Anruf). Beende die und versuch es nochmal.']
            : [`Kamera und Mikrofon konnten nicht gestartet werden${fehler ? ` (${fehler})` : ''}.`];
  return new Promise((ok) => {
    const zu = modal('Kamera und Mikrofon', [
      h('ul', { class: 'lr-hilfe' }, tipps.map((t) => h('li', null, t))),
      h('div', { class: 'reihe reihe-ende' },
        h('button', { class: 'knopf', onclick: () => { ok(true); zu(); } }, 'Ohne Kamera beitreten'),
        h('button', { class: 'knopf knopf-haupt', onclick: () => { ok(false); zu(); location.reload(); } }, 'Seite neu laden')),
    ], { onClose: () => ok(false) });
  });
}

async function betreten(ctx, code, titel) {
  let lokal = null;
  try {
    lokal = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
  } catch (e1) {
    try { lokal = await navigator.mediaDevices.getUserMedia({ audio: true }); toast('Kamera nicht verfügbar – du bist nur mit Ton dabei.'); } catch (e2) {
      const fehler = e2?.name || e1?.name || '';
      if (!(await zugriffHilfe(fehler))) return;
    }
  }
  try {
    const stand = code ? await api(`/api/raum/${code}/beitreten`, {}) : await api('/api/raum', { titel });
    const ice = await api('/api/raum/ice').catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
    raum = neuerRaum(ctx, stand, lokal, ice);
    ctx.refresh();
  } catch (e) {
    lokal?.getTracks().forEach((t) => t.stop());
    toast(e.message, 'fehler');
  }
}

// ---------------------------------------------------------------- Raum-Logik
function neuerRaum(ctx, stand, lokal, ice) {
  const ich = ctx.konto.name;
  const R = {
    code: stand.code, titel: stand.titel, ich, lokal, ice, peers: new Map(), sig: 0, strich: 0, aus: false,
    kameraTrack: lokal?.getVideoTracks()[0] || null, bildschirmTrack: null,
    mikro: Boolean(lokal?.getAudioTracks().length), kamera: Boolean(lokal?.getVideoTracks().length), stand,
    el: {}, timerAlarm: null, tab: 'whiteboard',
  };
  R.senden = (an, typ, daten) => api(`/api/raum/${R.code}/signal`, { an, typ, daten }).catch(() => {});
  R.statusSenden = () => api(`/api/raum/${R.code}/status`, { kamera: R.kamera, mikro: R.mikro, bildschirm: Boolean(R.bildschirmTrack) }).catch(() => {});
  return R;
}

function peerAnlegen(R, name, seit) {
  const pc = new RTCPeerConnection({ iceServers: R.ice.iceServers });
  const p = { pc, name, seit, polite: R.ich > name, makingOffer: false, ignoreOffer: false, stream: new MediaStream(), kachel: null };
  // Nur eine Seite (die „unhöfliche“) legt die Spuren an und schickt das Angebot. Die andere antwortet und hängt ihre
  // eigenen Spuren an die empfangenen Spuren an. So gibt es nie zwei Angebote gleichzeitig – das führte zu Ton nur in eine Richtung.
  if (!p.polite) {
    pc.addTransceiver(R.lokal?.getAudioTracks()[0] || 'audio', { direction: 'sendrecv' });
    pc.addTransceiver(R.bildschirmTrack || R.kameraTrack || 'video', { direction: 'sendrecv' });
  }
  pc.ontrack = (e) => { if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track); const v = p.kachel?.querySelector('video'); if (v && v.srcObject !== p.stream) { v.srcObject = p.stream; } abspielen(R, v); };
  pc.onicecandidate = ({ candidate }) => { if (candidate) R.senden(name, 'ice', candidate.toJSON()); };
  pc.onnegotiationneeded = async () => {
    if (p.polite) return;
    try { p.makingOffer = true; await pc.setLocalDescription(); R.senden(name, 'offer', pc.localDescription.toJSON()); } catch { /* nächster Versuch */ } finally { p.makingOffer = false; }
  };
  pc.onconnectionstatechange = () => {
    p.kachel?.classList.toggle('verbindet', !['connected', 'completed'].includes(pc.connectionState));
    if (pc.connectionState === 'failed' && !p.polite) { try { pc.restartIce(); } catch { /* egal */ } }
  };
  R.peers.set(name, p);
  return p;
}

function peerWeg(R, name) {
  const p = R.peers.get(name);
  if (!p) return;
  try { p.pc.close(); } catch { /* egal */ }
  p.kachel?.remove();
  R.peers.delete(name);
}

async function signalVerarbeiten(R, s) {
  let p = R.peers.get(s.von);
  if (!p) return;
  const { pc } = p;
  try {
    if (s.typ === 'offer' || s.typ === 'answer') {
      const kollision = s.typ === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      p.ignoreOffer = !p.polite && kollision;
      if (p.ignoreOffer) return;
      await pc.setRemoteDescription(s.daten);
      if (s.typ === 'offer') {
        // Eigene Spuren an die angebotenen Kanäle hängen
        for (const t of pc.getTransceivers()) {
          const art = t.receiver.track?.kind;
          const spur = art === 'audio' ? R.lokal?.getAudioTracks()[0] : art === 'video' ? (R.bildschirmTrack || R.kameraTrack) : null;
          if (t.direction !== 'sendrecv') t.direction = 'sendrecv';
          if (spur && t.sender.track !== spur) await t.sender.replaceTrack(spur);
        }
        await pc.setLocalDescription(); R.senden(s.von, 'answer', pc.localDescription.toJSON()); }
    } else if (s.typ === 'ice') {
      try { await pc.addIceCandidate(s.daten); } catch (e) { if (!p.ignoreOffer) throw e; }
    }
  } catch { /* einzelnes kaputtes Signal ignorieren */ }
}

async function abfragen(ctx, R) {
  if (R.aus) return;
  try {
    const s = await api(`/api/raum/${R.code}?sig=${R.sig}&strich=${R.strich}`);
    R.stand = s;
    // Teilnehmer abgleichen
    const da = new Map(s.leute.map((l) => [l.name, l]));
    for (const [n, p] of R.peers) if (!da.has(n) || da.get(n).seit !== p.seit) peerWeg(R, n);
    for (const l of s.leute) if (l.name !== R.ich && !R.peers.has(l.name)) peerAnlegen(R, l.name, l.seit);
    for (const sig of s.signale) { R.sig = Math.max(R.sig, sig.nr); await signalVerarbeiten(R, sig); }
    // Whiteboard
    if (s.loeschen) R.wb?.leeren(false);
    for (const st of s.striche) R.wb?.strich(st);
    R.strich = s.strichNr;
    zeichneLeute(R);
    zeichneKarte(ctx, R);
    zeichneTimer(R);
  } catch (e) {
    if (e.status === 404 || e.status === 403) { toast('Der Lernraum wurde geschlossen.', 'fehler'); raumVerlassen(R); ctx.refresh(); return; }
  }
  R.takt = setTimeout(() => abfragen(ctx, R), 800);
}

function raumVerlassen(R) {
  if (R.aus) return;
  R.aus = true;
  clearTimeout(R.takt);
  clearInterval(R.uhr);
  for (const n of [...R.peers.keys()]) peerWeg(R, n);
  R.lokal?.getTracks().forEach((t) => t.stop());
  R.bildschirmTrack?.stop();
  api(`/api/raum/${R.code}/verlassen`, {}, { keepalive: true }).catch(() => {});
  if (raum === R) raum = null;
}

// iPhone & Co. spielen Ton erst nach einer Berührung ab. Wenn das blockiert wird: Knopf „Ton einschalten“ zeigen.
function abspielen(R, v) {
  if (!v) return;
  v.play().catch(() => {
    if (R.el.tonKnopf) R.el.tonKnopf.hidden = false;
  });
}

// ---------------------------------------------------------------- Video-Kacheln
function kachel(name, eigene) {
  const video = h('video', { autoplay: true, playsinline: true, muted: eigene, 'aria-label': `Video von ${name}` });
  video.muted = eigene; // muss als Eigenschaft gesetzt werden (Safari)
  video.setAttribute('playsinline', '');
  return h('div', { class: `lr-kachel ${eigene ? 'ist-ich' : 'verbindet'}`, 'data-name': name }, video,
    h('div', { class: 'lr-initiale', 'aria-hidden': 'true' }, name.slice(0, 1).toUpperCase()),
    h('span', { class: 'lr-name' }, eigene ? `${name} (du)` : name, h('span', { class: 'lr-stumm', hidden: true, 'aria-label': 'stumm' }, ' 🔇')));
}

function zeichneLeute(R) {
  const raster = R.el.raster;
  if (!raster) return;
  for (const l of R.stand.leute) {
    if (l.name === R.ich) {
      R.el.eigene.classList.toggle('ohne-video', !R.kamera && !R.bildschirmTrack);
      R.el.eigene.querySelector('.lr-stumm').hidden = R.mikro;
      continue;
    }
    const p = R.peers.get(l.name);
    if (!p) continue;
    if (!p.kachel) { p.kachel = kachel(l.name, false); const v = p.kachel.querySelector('video'); v.srcObject = p.stream; raster.append(p.kachel); abspielen(R, v); }
    p.kachel.classList.toggle('ohne-video', !l.kamera && !l.bildschirm);
    p.kachel.classList.toggle('teilt', l.bildschirm);
    p.kachel.querySelector('.lr-stumm').hidden = l.mikro;
  }
  raster.dataset.anzahl = String(raster.children.length);
}

function steuerung(ctx, R) {
  const knopf = (aktiv, an, aus, label, fn, extra = '') => h('button', { class: `lr-knopf ${aktiv ? '' : 'ist-aus'} ${extra}`, 'aria-pressed': String(aktiv), 'aria-label': label, onclick: fn }, aktiv ? an : aus);
  const neu = () => R.el.steuer.replaceChildren(...steuerung(ctx, R).children);
  return h('div', { class: 'lr-steuer' },
    knopf(R.mikro, '🎤', '🔇', R.mikro ? 'Mikrofon ausschalten' : 'Mikrofon einschalten', () => {
      const t = R.lokal?.getAudioTracks()[0];
      if (!t) { toast('Kein Mikrofon freigegeben.', 'fehler'); return; }
      R.mikro = !R.mikro; t.enabled = R.mikro; R.statusSenden(); neu(); zeichneLeute(R);
    }),
    knopf(R.kamera, '📷', '🚫', R.kamera ? 'Kamera ausschalten' : 'Kamera einschalten', () => {
      if (!R.kameraTrack) { toast('Keine Kamera freigegeben.', 'fehler'); return; }
      R.kamera = !R.kamera; R.kameraTrack.enabled = R.kamera; R.statusSenden(); neu(); zeichneLeute(R);
    }),
    navigator.mediaDevices?.getDisplayMedia && knopf(!R.bildschirmTrack, '🖥️', '⏹️', R.bildschirmTrack ? 'Bildschirm teilen beenden' : 'Bildschirm teilen', async () => {
      if (R.bildschirmTrack) { bildschirmEnde(R); neu(); return; }
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
        R.bildschirmTrack = s.getVideoTracks()[0];
        R.bildschirmTrack.onended = () => { bildschirmEnde(R); neu(); };
        for (const p of R.peers.values()) videoSenderSetzen(p, R.bildschirmTrack);
        R.el.eigene.querySelector('video').srcObject = new MediaStream([R.bildschirmTrack]);
        R.el.eigene.classList.add('teilt');
        R.statusSenden(); neu(); zeichneLeute(R);
      } catch { /* abgebrochen */ }
    }, 'ist-teilen'),
    h('button', { class: 'lr-knopf lr-auflegen', 'aria-label': 'Lernraum verlassen', onclick: () => { raumVerlassen(R); ctx.refresh(); } }, '📞'),
    h('button', { class: 'lr-knopf', 'aria-label': 'Code kopieren', title: 'Einladen', onclick: async () => {
      const text = `Komm in meinen Lernraum „${R.titel}“: ${location.origin}/#lernraum – Code ${R.code}`;
      try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Einladung kopiert.'); } } catch { /* abgebrochen */ }
    } }, '➕'));
}

function videoSenderSetzen(p, track) {
  const t = p.pc.getTransceivers().find((x) => x.receiver.track?.kind === 'video');
  t?.sender.replaceTrack(track).catch(() => {});
}

function bildschirmEnde(R) {
  R.bildschirmTrack?.stop();
  R.bildschirmTrack = null;
  for (const p of R.peers.values()) videoSenderSetzen(p, R.kameraTrack);
  R.el.eigene.querySelector('video').srcObject = R.lokal;
  R.el.eigene.classList.remove('teilt');
  R.statusSenden();
  zeichneLeute(R);
}

// ---------------------------------------------------------------- Whiteboard
const W = 1600, HOEHE = 1000;
const FARBEN = ['#1b2a5c', '#c4273c', '#2440b3', '#17784a', '#d4700a', '#7a3cc4'];
function whiteboard(R) {
  const c = h('canvas', { class: 'lr-tafel', width: W, height: HOEHE, 'aria-label': 'Gemeinsames Whiteboard' });
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const wb = { farbe: FARBEN[0], breite: 4, radierer: false };
  const zeichnen = (s) => {
    g.save();
    g.globalCompositeOperation = s.radierer ? 'destination-out' : 'source-over';
    g.strokeStyle = s.farbe; g.lineWidth = s.radierer ? s.breite * 6 : s.breite;
    g.beginPath();
    s.p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (s.p.length === 1) g.lineTo(s.p[0][0] + 0.1, s.p[0][1]);
    g.stroke(); g.restore();
  };
  R.wb = { strich: zeichnen, leeren: (senden) => { g.clearRect(0, 0, W, HOEHE); if (senden) api(`/api/raum/${R.code}/zeichnen`, { loeschen: true }).catch(() => {}); } };
  let aktuell = null;
  const pos = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * HOEHE]; };
  c.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return;
    c.setPointerCapture(e.pointerId);
    aktuell = { farbe: wb.farbe, breite: wb.breite * (e.pointerType === 'pen' ? 0.5 + (e.pressure || 0.5) : 1), radierer: wb.radierer || e.button === 5, p: [pos(e)] };
    zeichnen(aktuell);
  });
  c.addEventListener('pointermove', (e) => {
    if (!aktuell) return;
    const [x, y] = pos(e); const [lx, ly] = aktuell.p.at(-1);
    if (Math.hypot(x - lx, y - ly) < 2) return;
    g.save(); g.globalCompositeOperation = aktuell.radierer ? 'destination-out' : 'source-over'; g.strokeStyle = aktuell.farbe; g.lineWidth = aktuell.radierer ? aktuell.breite * 6 : aktuell.breite; g.lineCap = 'round';
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke(); g.restore();
    aktuell.p.push([x, y]);
  });
  const ende = () => {
    if (!aktuell) return;
    const s = aktuell; aktuell = null;
    for (let i = 0; i < s.p.length; i += 1500) api(`/api/raum/${R.code}/zeichnen`, { strich: { ...s, p: s.p.slice(Math.max(0, i - 1), i + 1500) } }).catch(() => {});
  };
  c.addEventListener('pointerup', ende);
  c.addEventListener('pointercancel', ende);
  const werkzeuge = h('div', { class: 'lr-werkzeuge' },
    FARBEN.map((f) => h('button', { class: `lr-farbe ${f === wb.farbe ? 'ist-aktiv' : ''}`, style: `background:${f}`, 'aria-label': `Farbe ${f}`, onclick: (e) => { wb.farbe = f; wb.radierer = false; werkzeuge.querySelectorAll('button').forEach((b) => b.classList.remove('ist-aktiv')); e.currentTarget.classList.add('ist-aktiv'); } })),
    h('button', { class: 'lr-werkzeug', 'aria-label': 'Radierer', onclick: (e) => { wb.radierer = true; werkzeuge.querySelectorAll('button').forEach((b) => b.classList.remove('ist-aktiv')); e.currentTarget.classList.add('ist-aktiv'); } }, '🧽'),
    h('select', { 'aria-label': 'Strichstärke', onchange: (e) => { wb.breite = Number(e.target.value); } }, [['2', 'Fein'], ['4', 'Normal'], ['9', 'Dick']].map(([v, t]) => h('option', { value: v, selected: v === '4' }, t))),
    h('button', { class: 'knopf knopf-mini', onclick: async () => { if (await nachfragen('Tafel wischen?', 'Das Whiteboard wird für alle gelöscht.', 'Wischen')) R.wb.leeren(true); } }, 'Für alle wischen'));
  return h('div', { class: 'lr-wb' }, werkzeuge, h('div', { class: 'lr-tafel-rahmen' }, c));
}

// ---------------------------------------------------------------- Gemeinsam Karten abfragen
function zeichneKarte(ctx, R) {
  const box = R.el.karte;
  if (!box) return;
  const k = R.stand.karte;
  const schluessel = JSON.stringify(k);
  if (schluessel === R.kartenStand) return;
  R.kartenStand = schluessel;
  const tab = R.el.tabs?.querySelector('[data-tab="karten"]');
  if (tab && k && R.tab !== 'karten') tab.classList.add('hat-neues');
  if (!k) {
    const decks = store.getState().decks.filter((d) => store.cardsOf(d.id).length >= 2);
    let wahl = decks[0]?.id;
    box.replaceChildren(h('div', { class: 'lr-karten-start' },
      h('p', null, 'Wählt einen Stapel – alle sehen dieselbe Karte, jeder überlegt, dann wird gemeinsam aufgedeckt.'),
      decks.length ? h('div', { class: 'reihe' },
        h('select', { 'aria-label': 'Stapel', onchange: (e) => { wahl = e.target.value; } }, decks.map((d) => h('option', { value: d.id }, `${d.name} (${FAECHER[d.fach].name}, ${store.cardsOf(d.id).length})`))),
        h('button', { class: 'knopf knopf-haupt', onclick: () => {
          const d = store.getDeck(wahl);
          api(`/api/raum/${R.code}/karte`, { neu: true, titel: d.name, karten: shuffle(store.cardsOf(d.id)).slice(0, 60).map((c) => ({ front: c.front, back: c.back })) }).catch((e) => toast(e.message, 'fehler'));
        } }, 'Zusammen abfragen'))
        : h('p', { class: 'hinweis' }, 'Du hast noch keine Stapel – jemand anderes kann einen starten.')));
    return;
  }
  const ich = k.stimmen[R.ich];
  const gewusst = Object.entries(k.stimmen).filter(([, v]) => v === 'gewusst').map(([n]) => n);
  const nicht = Object.entries(k.stimmen).filter(([, v]) => v === 'nicht').map(([n]) => n);
  box.replaceChildren(h('div', { class: 'lr-karte' },
    h('div', { class: 'reihe lr-karte-kopf' }, h('strong', null, k.titel), h('span', { class: 'hinweis' }, `Karte ${k.i + 1} von ${k.n} · von ${k.von}`),
      h('button', { class: 'knopf knopf-leise knopf-mini', onclick: () => api(`/api/raum/${R.code}/karte`, { ende: true }).catch(() => {}) }, 'Beenden')),
    h('div', { class: `karteikarte gross farbe-gelb lr-karteikarte ${k.back ? 'ist-offen' : ''}` },
      h('div', { class: 'karte-seite' }, h('p', { class: 'karte-text' }, k.front), k.back && h('p', { class: 'lr-rueckseite' }, k.back))),
    !k.back
      ? h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: () => api(`/api/raum/${R.code}/karte`, { aufdecken: true }).catch(() => {}) }, 'Für alle aufdecken')
      : h('div', { class: 'reihe lr-stimmen' },
        h('button', { class: `knopf ${ich === 'gewusst' ? 'knopf-haupt' : ''}`, onclick: () => api(`/api/raum/${R.code}/karte`, { stimme: 'gewusst' }).catch(() => {}) }, `✅ Gewusst (${gewusst.length})`),
        h('button', { class: `knopf ${ich === 'nicht' ? 'knopf-haupt' : ''}`, onclick: () => api(`/api/raum/${R.code}/karte`, { stimme: 'nicht' }).catch(() => {}) }, `❌ Nicht gewusst (${nicht.length})`),
        h('button', { class: 'knopf', onclick: () => api(`/api/raum/${R.code}/karte`, { weiter: true }).catch(() => {}) }, 'Nächste Karte')),
    (gewusst.length + nicht.length) > 0 && h('p', { class: 'hinweis' }, [gewusst.length && `Gewusst: ${gewusst.join(', ')}`, nicht.length && `Nicht gewusst: ${nicht.join(', ')}`].filter(Boolean).join(' · '))));
}

// ---------------------------------------------------------------- Timer für alle
function zeichneTimer(R) {
  const t = R.stand.timer;
  R.timerEnde = t ? Date.now() + t.rest : null;
  R.timerInfo = t;
  timerTick(R);
}

function timerTick(R) {
  const box = R.el.timer;
  if (!box) return;
  const t = R.timerInfo;
  const anzeige = R.el.timerZeit;
  const mini = R.el.timerMini;
  if (!t || !R.timerEnde) {
    if (box.dataset.zustand !== 'aus') {
      box.dataset.zustand = 'aus';
      box.replaceChildren(h('div', { class: 'lr-timer-start' }, h('p', null, 'Ein Timer für alle – alle lernen gleichzeitig konzentriert und machen zusammen Pause.'),
        h('div', { class: 'reihe' },
          h('button', { class: 'knopf knopf-haupt', onclick: () => api(`/api/raum/${R.code}/timer`, { minuten: 25 }).catch(() => {}) }, '🍅 25 Min lernen'),
          h('button', { class: 'knopf', onclick: () => api(`/api/raum/${R.code}/timer`, { minuten: 50 }).catch(() => {}) }, '50 Min'),
          h('button', { class: 'knopf', onclick: () => api(`/api/raum/${R.code}/timer`, { minuten: 5, pause: true }).catch(() => {}) }, '☕ 5 Min Pause'))));
      R.el.timerZeit = null;
    }
    if (mini) mini.hidden = true;
    return;
  }
  const rest = Math.max(0, R.timerEnde - Date.now());
  const text = `${String(Math.floor(rest / 60000)).padStart(2, '0')}:${String(Math.floor((rest % 60000) / 1000)).padStart(2, '0')}`;
  if (box.dataset.zustand !== 'an') {
    box.dataset.zustand = 'an';
    const zeit = h('p', { class: 'lr-timer-zeit', role: 'timer' }, text);
    R.el.timerZeit = zeit;
    box.replaceChildren(h('div', { class: `lr-timer ${t.pause ? 'ist-pause' : ''}` },
      h('p', null, t.pause ? '☕ Pause für alle' : '🍅 Fokuszeit für alle', h('small', null, ` – gestartet von ${t.von}`)),
      zeit, h('div', { class: 'lr-timer-balken' }, h('div')),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf knopf-mini', onclick: () => api(`/api/raum/${R.code}/timer`, { stopp: true }).catch(() => {}) }, 'Stoppen'),
        t.pause ? h('button', { class: 'knopf knopf-mini', onclick: () => api(`/api/raum/${R.code}/timer`, { minuten: 25 }).catch(() => {}) }, 'Weiterlernen')
          : h('button', { class: 'knopf knopf-mini', onclick: () => api(`/api/raum/${R.code}/timer`, { minuten: 5, pause: true }).catch(() => {}) }, 'Pause machen'))));
  }
  if (anzeige) anzeige.textContent = text;
  box.querySelector('.lr-timer-balken div')?.style.setProperty('width', `${(1 - rest / (t.minuten * 60000)) * 100}%`);
  if (mini) { mini.hidden = false; mini.textContent = `${t.pause ? '☕' : '🍅'} ${text}`; }
  if (rest === 0 && R.timerAlarm !== R.timerEnde) {
    R.timerAlarm = R.timerEnde;
    toast(t.pause ? 'Pause vorbei – weiter geht’s! 💪' : 'Fokuszeit geschafft! Zeit für eine Pause. 🎉');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try { const a = new AudioContext(); const o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.35); } catch { /* egal */ }
  }
}

// ---------------------------------------------------------------- Raum-Ansicht
function raumSeite(ctx, R) {
  const eigene = kachel(R.ich, true);
  if (R.lokal) eigene.querySelector('video').srcObject = R.bildschirmTrack ? new MediaStream([R.bildschirmTrack]) : R.lokal;
  R.el.eigene = eigene;
  R.el.raster = h('div', { class: 'lr-raster' }, eigene);
  for (const p of R.peers.values()) { if (p.kachel) R.el.raster.append(p.kachel); }
  R.el.steuer = steuerung(ctx, R);
  R.el.karte = h('div', { class: 'lr-panel', hidden: R.tab !== 'karten' });
  R.el.timer = h('div', { class: 'lr-panel', hidden: R.tab !== 'timer' });
  R.kartenStand = undefined;
  const wbPanel = h('div', { class: 'lr-panel', hidden: R.tab !== 'whiteboard' }, whiteboard(R));
  const panels = { whiteboard: wbPanel, karten: R.el.karte, timer: R.el.timer };
  R.el.timerMini = h('span', { class: 'lr-timer-mini', hidden: true });
  R.el.tabs = h('div', { class: 'reiter', role: 'tablist' }, [['whiteboard', '✏️ Whiteboard'], ['karten', '🃏 Karten'], ['timer', '⏱️ Timer']].map(([id, t]) =>
    h('button', { role: 'tab', 'data-tab': id, class: `reiter-knopf ${R.tab === id ? 'ist-aktiv' : ''}`, 'aria-selected': String(R.tab === id), onclick: (e) => {
      R.tab = id;
      for (const [k, el] of Object.entries(panels)) el.hidden = k !== id;
      R.el.tabs.querySelectorAll('.reiter-knopf').forEach((b) => { b.classList.toggle('ist-aktiv', b === e.currentTarget); b.setAttribute('aria-selected', String(b === e.currentTarget)); });
      e.currentTarget.classList.remove('hat-neues');
    } }, t)));
  clearInterval(R.uhr);
  R.uhr = setInterval(() => timerTick(R), 1000);
  if (!R.laeuft) { R.laeuft = true; abfragen(ctx, R); } else { zeichneLeute(R); zeichneKarte(ctx, R); R.el.timer.dataset.zustand = ''; zeichneTimer(R); }
  // Whiteboard-Inhalt nach Neuaufbau komplett neu laden
  R.strich = 0;
  R.el.tonKnopf = h('button', { class: 'knopf knopf-haupt lr-ton', hidden: true, onclick: (e) => {
    for (const v of R.el.raster.querySelectorAll('.lr-kachel:not(.ist-ich) video')) v.play().catch(() => {});
    e.currentTarget.hidden = true;
  } }, '🔊 Tippen, um die anderen zu hören');
  return h('div', { class: 'lernraum' },
    R.el.tonKnopf,
    h('div', { class: 'reihe lr-kopf' }, h('strong', null, R.titel), h('span', { class: 'lr-code' }, `Code ${R.code}`), R.el.timerMini),
    h('div', { class: 'lr-links' }, R.el.raster, R.el.steuer),
    h('div', { class: 'lr-rechts' }, R.el.tabs, wbPanel, R.el.karte, R.el.timer));
}

export function lernraum(ctx) {
  if (!ctx.konto) return h('div', { class: 'blatt' }, h('p', null, 'Lernräume gibt es, wenn du mit einem Konto angemeldet bist.'));
  if (!navigator.mediaDevices || !window.RTCPeerConnection) return h('div', { class: 'blatt' }, h('p', null, 'Dein Browser unterstützt keine Videoanrufe. Nimm Safari, Chrome oder Firefox in der neuesten Version.'));
  if (raum && !raum.aus) {
    const R = raum;
    ctx.onLeave(() => { if (location.hash !== '#lernraum') { raumVerlassen(R); } });
    return raumSeite(ctx, R);
  }
  return startSeite(ctx);
}

addEventListener('pagehide', () => { if (raum) raumVerlassen(raum); });
