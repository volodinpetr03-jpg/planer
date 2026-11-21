'use strict';
// ============================================================
//  Русский язык для поиска по законам: стеммер (алгоритм Snowball для русского),
//  индекс слов библиотеки, исправление опечаток и раскладки, подсветка всех форм слова.
// ============================================================
const RU = (() => {
  const V = 'аеиоуыэюя';
  const PERF = /(?:ив|ивши|ившись|ыв|ывши|ывшись|(?<=[ая])(?:в|вши|вшись))$/;
  const REFL = /(?:ся|сь)$/;
  const ADJ = /(?:ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
  const PART = /(?:ивш|ывш|ующ|(?<=[ая])(?:ем|нн|вш|ющ|щ))$/;
  const VERB = /(?:ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю|(?<=[ая])(?:ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно))$/;
  const NOUN = /(?:а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
  const reg = (w, s) => { for (let i = s; i < w.length - 1; i++) if (V.includes(w[i]) && !V.includes(w[i + 1])) return i + 2; return w.length; };
  const cache = new Map();
  function stem(word) {
    let w = String(word).toLowerCase().replace(/ё/g, 'е');
    if (w.length < 3 || /[^а-я]/.test(w)) return w;
    const hit = cache.get(w); if (hit) return hit;
    const vi = w.search(/[аеиоуыэюя]/); if (vi < 0) { cache.set(w, w); return w; }
    const pre = w.slice(0, vi + 1); let rv = w.slice(vi + 1);
    const r2 = reg(w, reg(w, 0));
    let t = rv.replace(PERF, '');
    if (t !== rv) rv = t;
    else {
      rv = rv.replace(REFL, '');
      t = rv.replace(ADJ, '');
      if (t !== rv) rv = t.replace(PART, '');
      else { t = rv.replace(VERB, ''); rv = t !== rv ? t : rv.replace(NOUN, ''); }
    }
    rv = rv.replace(/и$/, '');
    const d = rv.match(/ость?$/); if (d && pre.length + rv.length - d[0].length >= r2) rv = rv.slice(0, -d[0].length);
    if (/нн$/.test(rv)) rv = rv.slice(0, -1);
    else { const s = rv.replace(/ейше?$/, ''); if (s !== rv) { rv = s; if (/нн$/.test(rv)) rv = rv.slice(0, -1); } else rv = rv.replace(/ь$/, ''); }
    const out = pre + rv; if (cache.size > 200000) cache.clear(); cache.set(w, out); return out;
  }
  const words = s => String(s || '').toLowerCase().replace(/ё/g, 'е').match(/[а-яa-z0-9]+(?:-[а-я]+)?/g) || [];
  // близкие основы: одна — начало другой, разница не больше 2 букв (обяза / обязан)
  const near = (a, b) => { if (a === b) return true; const m = Math.min(a.length, b.length), d = Math.abs(a.length - b.length); return (m >= 5 ? d <= 2 : m === 4 && d <= 1) && (a.startsWith(b) || b.startsWith(a)); };
  // раскладка: набрали по-русски на английской клавиатуре
  const LAT = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`', CYR = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  const unlat = s => String(s).toLowerCase().split('').map(c => { const i = LAT.indexOf(c); return i >= 0 ? CYR[i] : c; }).join('');
  function dist(a, b, max) { // Дамерау — Левенштейн с ранним выходом
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let p2 = null, p = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const c = [i]; let lo = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        c[j] = v; if (v < lo) lo = v;
      }
      if (lo > max) return max + 1;
      p2 = p; p = c;
    }
    return p[b.length];
  }
  return { stem, words, near, unlat, dist };
})();

// ---------- индекс библиотеки (строится один раз после загрузки текстов) ----------
const LIDX = { arts: new Map(), vocab: new Map(), stems: new Map(), forms: new Map(), sig: '' };
function lawIndex() {
  const sig = LW().docs.map(d => d.id + ':' + d.n + ':' + (d.checked || 0)).join('|') + '#' + LAWC.size;
  if (LIDX.sig === sig) return LIDX;
  LIDX.arts.clear(); LIDX.vocab.clear(); LIDX.stems.clear(); LIDX.forms.clear(); FUZ.clear();
  for (const d of LW().docs) for (const a of lawArts(d.id)) {
    const tw = RU.words(a.t), bw = RU.words(a.body), ts = tw.map(RU.stem), bs = bw.map(RU.stem), pos = new Map();
    bs.forEach((s, i) => { let l = pos.get(s); if (!l) pos.set(s, l = []); l.push(i); });
    LIDX.arts.set(d.id + '/' + a.id, { d, a, ts: new Set(ts), tsa: ts, bs, pos, n: bs.length });
    tw.concat(bw).forEach((w, i) => { if (w.length > 2 && !/\d/.test(w)) { LIDX.vocab.set(w, (LIDX.vocab.get(w) || 0) + 1); const st = i < ts.length ? ts[i] : bs[i - ts.length]; let f = LIDX.forms.get(st); if (!f) LIDX.forms.set(st, f = new Map()); f.set(w, (f.get(w) || 0) + 1); } });
    for (const s of ts.concat(bs)) if (s.length > 1) LIDX.stems.set(s, (LIDX.stems.get(s) || 0) + 1);
  }
  LIDX.sig = sig; return LIDX;
}
// все основы библиотеки, близкие к основе слова из вопроса
const FUZ = new Map();
function stemGroup(s, noFuzzy) {
  const I = LIDX, g = new Set(); if (I.stems.has(s)) g.add(s);
  if (s.length >= 4) for (const k of I.stems.keys()) if (k !== s && RU.near(k, s)) g.add(k);
  if (!g.size && !noFuzzy && s.length >= 4) { // опечатка: близкие по написанию основы
    if (FUZ.has(s)) return new Set(FUZ.get(s));
    const max = s.length >= 7 ? 2 : 1;
    for (const k of I.stems.keys()) if (Math.abs(k.length - s.length) <= max && RU.dist(s, k, max) <= max) g.add(k);
    FUZ.set(s, [...g]);
  }
  return g;
}
// самая частая форма слова в библиотеке для набора основ (с тем же окончанием, если есть)
function bestForm(stems, typed) {
  let best = null, bs = -1;
  for (const st of stems) { const f = LIDX.forms.get(st); if (f) for (const [w, c] of f) { const sc = c + (typed && w.slice(-2) === typed.slice(-2) ? 1000 : 0); if (sc > bs) { bs = sc; best = w; } } }
  return best;
}
// исправление опечаток и раскладки по словарю библиотеки (+ слова из словаря понятий)
function spellFix(q) {
  const I = lawIndex(); let changed = false; const fixes = [];
  const extra = new Map(); SYN.forEach(([, legal]) => legal.forEach(p => RU.words(p).forEach(w => extra.set(w, 1))));
  const known = w => I.vocab.has(w) || extra.has(w) || stemGroup(RU.stem(w), true).size > 0;
  // вся строка набрана в английской раскладке
  if (!/[а-яё]/i.test(q) && /[a-z]/i.test(q)) {
    const c = RU.unlat(q), ws = RU.words(c).filter(w => w.length > 2 && !STOP.has(w));
    if (ws.length && ws.filter(known).length >= Math.ceil(ws.length / 2)) { const again = spellFix(c); return { q: again ? again.q : c, fixes: [[q, again ? again.q : c]] }; }
  }
  const out = String(q).replace(/[A-Za-zА-Яа-яЁё]+/g, tok => {
    const low = tok.toLowerCase().replace(/ё/g, 'е');
    if (low.length < 3 || STOP.has(low)) return tok;
    if (/^[a-z]+$/.test(low)) { const c = RU.unlat(low); if (known(c)) { changed = true; fixes.push([tok, c]); return c; } return tok; }
    if (known(low)) return tok;
    const max = low.length <= 5 ? 1 : 2; let best = null, bd = max + 1, bf = 0;
    const tryW = (w, f) => { if (Math.abs(w.length - low.length) > max) return; const dd = RU.dist(low, w, max); if (dd < bd || (dd === bd && f > bf)) { best = w; bd = dd; bf = f; } };
    for (const [w, f] of I.vocab) tryW(w, f);
    for (const w of extra.keys()) tryW(w, 1);
    if (!best || bd > max) { const g = stemGroup(RU.stem(low)); if (g.size) { const f = bestForm(g, low); if (f && f !== low) { best = f; bd = 0; } } }
    if (best && bd <= max) { changed = true; fixes.push([tok, best]); return best; }
    return tok;
  });
  return changed ? { q: out, fixes } : null;
}
// подсветка всех форм найденных слов
function markStems(text, strong, soft) {
  return esc(text).replace(/[А-Яа-яЁё]+/g, w => {
    const s = RU.stem(w);
    if (strong && strong.has(s)) return `<mark>${w}</mark>`;
    if (soft && soft.has(s)) return `<mark class="soft">${w}</mark>`;
    return w;
  });
}
