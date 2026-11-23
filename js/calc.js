// Taschenrechner ohne eval(): eigener kleiner Parser für Rechenausdrücke.
// Unterstützt + − × ÷ ^ ! % Klammern, π, e, x, Ans und Funktionen wie sin, √, ln.

export class CalcError extends Error {}

const FUNKTIONEN = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'wurzel', 'ln', 'log', 'lg', 'abs', 'exp']);
const KONSTANTEN = new Set(['pi', 'e', 'x', 'ans']);

export function tokenize(src) {
  const text = String(src)
    .replace(/[×·∙*]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '.')
    .replace(/π/g, ' pi ');
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(text.slice(i));
      if (!m) throw new CalcError('Die Zahl verstehe ich nicht.');
      tokens.push({ t: 'num', v: parseFloat(m[1]) });
      i += m[1].length;
      continue;
    }
    if (/[a-zäöü]/i.test(c)) {
      const m = /^[a-zäöü]+/i.exec(text.slice(i));
      let rest = m[0].toLowerCase();
      i += rest.length;
      // "sinx" oder "xpi" in bekannte Namen zerlegen, längster Treffer zuerst
      while (rest) {
        let treffer = '';
        for (let n = Math.min(rest.length, 6); n > 0 && !treffer; n--) {
          const teil = rest.slice(0, n);
          if (FUNKTIONEN.has(teil) || KONSTANTEN.has(teil)) treffer = teil;
        }
        if (!treffer) throw new CalcError(`„${m[0]}“ kenne ich nicht.`);
        tokens.push(FUNKTIONEN.has(treffer) ? { t: 'func', v: treffer } : { t: 'id', v: treffer });
        rest = rest.slice(treffer.length);
      }
      continue;
    }
    if (c === '√') { tokens.push({ t: 'func', v: 'sqrt' }); i++; continue; }
    if (c === '²') { tokens.push({ t: 'post', v: 2 }); i++; continue; }
    if (c === '³') { tokens.push({ t: 'post', v: 3 }); i++; continue; }
    if ('+-*/^()!%'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new CalcError(`Das Zeichen „${c}“ kann ich nicht rechnen.`);
  }
  return tokens;
}

export function parse(src) {
  const tokens = tokenize(src);
  if (!tokens.length) throw new CalcError('Gib erst eine Rechnung ein.');
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const ist = (t) => peek()?.t === t;

  function expr() {
    let links = term();
    while (ist('+') || ist('-')) {
      const op = next().t;
      links = { op, a: links, b: term() };
    }
    return links;
  }
  function term() {
    let links = unary();
    for (;;) {
      if (ist('*') || ist('/')) {
        const op = next().t;
        links = { op, a: links, b: unary() };
      } else if (ist('id') || ist('func') || ist('(')) {
        links = { op: '*', a: links, b: power() }; // 2π, 3(4+1), 2x
      } else break;
    }
    return links;
  }
  function unary() {
    if (ist('-')) { next(); return { op: 'neg', a: unary() }; }
    if (ist('+')) { next(); return unary(); }
    return power();
  }
  function power() {
    const basis = postfix();
    if (ist('^')) { next(); return { op: '^', a: basis, b: unary() }; }
    return basis;
  }
  function postfix() {
    let node = primary();
    for (;;) {
      if (ist('!')) { next(); node = { op: 'fak', a: node }; }
      else if (ist('%')) { next(); node = { op: '/', a: node, b: { num: 100 } }; }
      else if (ist('post')) { node = { op: '^', a: node, b: { num: next().v } }; }
      else break;
    }
    return node;
  }
  function primary() {
    const tok = next();
    if (!tok) throw new CalcError('Da fehlt noch etwas am Ende.');
    if (tok.t === 'num') return { num: tok.v };
    if (tok.t === 'id') return { id: tok.v };
    if (tok.t === '(') {
      const innen = expr();
      if (!ist(')')) throw new CalcError('Eine Klammer ist nicht geschlossen.');
      next();
      return innen;
    }
    if (tok.t === 'func') {
      if (ist('(')) {
        next();
        const arg = expr();
        if (!ist(')')) throw new CalcError('Eine Klammer ist nicht geschlossen.');
        next();
        return { fn: tok.v, a: arg };
      }
      return { fn: tok.v, a: power() };
    }
    if (tok.t === ')') throw new CalcError('Da ist eine Klammer zu viel.');
    throw new CalcError('Da steht ein Rechenzeichen an der falschen Stelle.');
  }

  const baum = expr();
  if (pos < tokens.length) {
    throw new CalcError(peek().t === ')' ? 'Da ist eine Klammer zu viel.' : 'Zwischen zwei Zahlen fehlt ein Rechenzeichen.');
  }
  return baum;
}

const glatt = (v) => Math.round(v * 1e14) / 1e14;

function fakultaet(n) {
  if (!Number.isInteger(n) || n < 0) throw new CalcError('Fakultät geht nur mit ganzen Zahlen ab 0.');
  if (n > 170) throw new CalcError('Die Zahl ist zu groß.');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function evaluate(node, env = {}) {
  if ('num' in node) return node.num;
  if ('id' in node) {
    if (node.id === 'pi') return Math.PI;
    if (node.id === 'e') return Math.E;
    if (node.id === 'ans') return env.ans ?? 0;
    if (env.x === undefined) throw new CalcError('x hat hier keinen Wert.');
    return env.x;
  }
  if ('fn' in node) {
    const a = evaluate(node.a, env);
    const grad = env.deg !== false;
    const rein = (v) => (grad ? (v * Math.PI) / 180 : v);
    const raus = (v) => (grad ? (v * 180) / Math.PI : v);
    switch (node.fn) {
      case 'sin': return glatt(Math.sin(rein(a)));
      case 'cos': return glatt(Math.cos(rein(a)));
      case 'tan': {
        const v = Math.tan(rein(a));
        if (Math.abs(v) > 1e14) throw new CalcError('tan ist hier nicht definiert.');
        return glatt(v);
      }
      case 'asin': case 'acos':
        if (a < -1 || a > 1) throw new CalcError('Der Wert muss zwischen −1 und 1 liegen.');
        return glatt(raus(node.fn === 'asin' ? Math.asin(a) : Math.acos(a)));
      case 'atan': return glatt(raus(Math.atan(a)));
      case 'sqrt': case 'wurzel':
        if (a < 0) throw new CalcError('Aus einer negativen Zahl kann ich keine Wurzel ziehen.');
        return Math.sqrt(a);
      case 'ln': case 'log': case 'lg':
        if (a <= 0) throw new CalcError('Der Logarithmus braucht eine Zahl größer als 0.');
        return node.fn === 'ln' ? Math.log(a) : glatt(Math.log10(a));
      case 'abs': return Math.abs(a);
      case 'exp': return Math.exp(a);
    }
  }
  if (node.op === 'neg') return -evaluate(node.a, env);
  if (node.op === 'fak') return fakultaet(evaluate(node.a, env));
  const a = evaluate(node.a, env);
  const b = evaluate(node.b, env);
  switch (node.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) throw new CalcError('Durch 0 kann man nicht teilen.');
      return a / b;
    case '^': {
      const v = Math.pow(a, b);
      if (Number.isNaN(v)) throw new CalcError('Das ist nicht definiert.');
      return v;
    }
  }
  throw new CalcError('Das kann ich nicht rechnen.');
}

export function calc(src, env = {}) {
  const wert = evaluate(parse(src), env);
  if (!Number.isFinite(wert)) throw new CalcError('Das Ergebnis ist zu groß oder nicht definiert.');
  return wert;
}

// Für den Plotter: einmal einlesen, oft ausrechnen. Gibt NaN zurück, wo f nicht definiert ist.
export function compile(src) {
  const baum = parse(src);
  return (x, env = {}) => {
    try {
      const v = evaluate(baum, { ...env, x });
      return Number.isFinite(v) ? v : NaN;
    } catch {
      return NaN;
    }
  };
}

// Deutsche Schreibweise mit Komma; Rundungsreste wie 0,30000000000000004 verschwinden.
export function formatNumber(n) {
  if (!Number.isFinite(n)) return '–';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12 || abs < 1e-6) {
    const [m, e] = n.toExponential(9).split('e');
    return `${String(parseFloat(m)).replace('.', ',')} × 10^${Number(e)}`;
  }
  return String(parseFloat(n.toPrecision(12))).replace('.', ',');
}
