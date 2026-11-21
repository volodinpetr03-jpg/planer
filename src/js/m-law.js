'use strict';
// ============================================================
//  Модуль «Право»: своя библиотека законов и кодексов. Документ делится на статьи (или пункты),
//  поиск по номеру и по словам, закладки с заметками, привязка статей к задачам,
//  кнопка «Проверить актуальную редакцию» на официальном портале.
//  Тексты лежат в IndexedDB (они большие и не меняются при каждом сохранении), в данных — только
//  список документов, закладки и ссылки из задач.
// ============================================================
ICONS.scale = '<path d="M12 3.5v17M7 20.5h10M5 7h14"/><path d="M5 7l-2.8 6.2a3 3 0 0 0 5.6 0zM19 7l-2.8 6.2a3 3 0 0 0 5.6 0z"/>';
ICONS.bookmark = '<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1z"/>';
ICONS.ext = '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>';
ICONS.upload = '<path d="M12 15.5V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>';
const LAW_PORTAL = 'http://pravo.gov.ru/ips/';
const LW = () => { if (!D.law) D.law = { docs: [], marks: [] }; return D.law; };
const LF = { doc: null, art: null, tab: 'docs', q: '', open: {} };
const LAWC = new Map();                 // id документа → статьи (из IndexedDB)
let lawReady = null;

// ---------- хранилище текстов ----------
const lawDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('planer-law', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('docs', mode), s = t.objectStore('docs'); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
  return { put: o => tx('readwrite', s => s.put(o)), del: id => tx('readwrite', s => s.delete(id)), all: () => tx('readonly', s => s.getAll()) };
})();
function lawLoad() {
  if (!lawReady) lawReady = lawDB.all().then(L => { (L || []).forEach(d => LAWC.set(d.id, d.arts || [])); }).catch(e => { console.warn(e); });
  return lawReady;
}
const lawDoc = id => LW().docs.find(d => d.id === id);
const lawArts = id => LAWC.get(id) || [];
const lawArt = (doc, art) => lawArts(doc).find(a => a.id === art);
const unitOf = d => d && d.unit === 'п' ? 'п.' : 'ст.';
const artLabel = (d, a) => `${unitOf(d)} ${a.n} ${d.short || d.title}`;

// ---------- разбор текста документа ----------
const SHORTS = [[/об административных правонарушениях/i, 'КоАП РФ'], [/уголовно-процессуальный/i, 'УПК РФ'], [/гражданский процессуальный/i, 'ГПК РФ'], [/арбитражный процессуальный/i, 'АПК РФ'], [/административного судопроизводства/i, 'КАС РФ'], [/уголовно-исполнительный/i, 'УИК РФ'], [/градостроительный кодекс/i, 'ГрК РФ'], [/гражданский кодекс/i, 'ГК РФ'], [/трудовой кодекс/i, 'ТК РФ'], [/уголовный кодекс/i, 'УК РФ'], [/налоговый кодекс/i, 'НК РФ'], [/жилищный кодекс/i, 'ЖК РФ'], [/земельный кодекс/i, 'ЗК РФ'], [/семейный кодекс/i, 'СК РФ'], [/бюджетный кодекс/i, 'БК РФ'], [/лесной кодекс/i, 'ЛК РФ'], [/водный кодекс/i, 'ВК РФ'], [/воздушный кодекс/i, 'ВзК РФ'], [/конституция российской федерации/i, 'Конституция РФ']];
const RX_ART = /^\s*Статья\s+(\d+(?:[.\-]\d+)*)\s*\.?\s*(.*)$/;
const RX_CH = /^\s*(Раздел|Глава|Подраздел|Часть|§)\s*([IVXLCDM\d]+(?:\.\d+)*|первая|вторая|третья|четв[её]ртая)\s*\.?\s*(.*)$/i;
const CH_LVL = { 'часть': 0, 'раздел': 1, 'подраздел': 2, 'глава': 3, '§': 4 };
const chLevel = w => CH_LVL[String(w).toLowerCase()] ?? 3;
const chTitle = c => `${/^часть$/i.test(c[1]) ? 'Часть' : c[1] === '§' ? '§' : c[1].charAt(0).toUpperCase() + c[1].slice(1).toLowerCase()} ${/^[а-яё]+$/i.test(c[2]) ? c[2].toLowerCase() : c[2]}${c[3] ? '. ' + c[3] : ''}`;
const isHead = (c, l) => c && l.length < 220 && !/[;,:]$/.test(l) && !/(настоящ|стать[еияю]|кодекса|закона)/i.test(c[3] || '') && (!/^часть$/i.test(c[1]) || /^[а-яё]+$/i.test(c[2])) && (c[1] !== '§' || l.length < 160);
const JUNK = /^(КонсультантПлюс|Позиции высших судов|Документ предоставлен|www\.consultant\.ru|Дата сохранения|Путеводитель по|Подготовлено с использованием|Источник публикации|Примечание к документу|Перспективы и риски|Обзор изменений|См\. Путеводитель|Открыть полный текст|Текст документа)/i;
const RX_PT = /^\s*(\d{1,4}(?:\(\d+\))?(?:\.\d+)?)\.\s+(\S.*)$/;
const RX_SECT = /^\s*([IVXLCDM]+)\.\s+(\S.*)$/;
function lawNorm(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ')
    .split('\n').map(s => s.trim()).filter(s => !JUNK.test(s)).filter((s, i, a) => s || (a[i - 1] || '')).join('\n');
}
function lawMeta(lines) {
  const head = lines.slice(0, 40).join('\n');
  let title = '', short = '', rev = '';
  // редакция — самая поздняя дата «ред. от …» / «Редакция от …» в начале документа
  const revs = [...head.matchAll(/(?:\(\s*ред\.?|редакци[яи])\s*от\s*(\d{2})\.(\d{2})\.(\d{4})/gi)].map(m => `${m[3]}-${m[2]}-${m[1]}`).sort();
  if (revs.length) rev = revs[revs.length - 1];
  const fz = head.match(/[N№]\s*(\d+-ФК?З)/i); if (fz) short = fz[1].toUpperCase();
  for (const [rx, s] of SHORTS) if (rx.test(head)) { short = s; break; }
  const q = head.match(/[«"]([^»"\n]{6,200})[»"]/); // название в кавычках
  const kod = lines.slice(0, 40).find(l => /^(Кодекс|Конституция|Гражданский|Трудовой|Уголовный|Налоговый|Жилищный|Земельный|Семейный|Бюджетный|Лесной|Водный|Градостроительный|Воздушный)\b.*/i.test(l) && l.length < 160);
  title = kod || (q && q[1]) || '';
  if (!title) { const big = lines.slice(0, 15).find(l => l.length > 12 && l.length < 200 && l === l.toUpperCase() && /[А-ЯЁ]{4}/.test(l) && !/^(РОССИЙСКАЯ ФЕДЕРАЦИЯ|ФЕДЕРАЛЬНЫЙ ЗАКОН|ПРАВИТЕЛЬСТВО|ПОСТАНОВЛЕНИЕ|ПРИКАЗ|УКАЗ)/.test(l)); if (big) title = big.charAt(0) + big.slice(1).toLowerCase(); }
  if (!short) { const pn = head.match(/(Постановлени[ея]|Приказ|Указ|Распоряжени[ея])[\s\S]{0,140}?[N№]\s*([\dА-Яа-яA-Za-z/\-]+)/i); if (pn) { const k = pn[1].toLowerCase(); short = (k.startsWith('пост') ? 'Пост.' : k.startsWith('расп') ? 'Расп.' : k.startsWith('приказ') ? 'Приказ' : 'Указ') + ' N ' + pn[2]; } }
  return { title: title.replace(/\s+/g, ' ').replace(/российской федерации/gi, 'Российской Федерации').trim(), short, rev };
}
function lawParse(text) {
  const lines = lawNorm(text).split('\n');
  const meta = lawMeta(lines);
  const arts = []; let cur = null, ch = '', chs = [];
  const push = () => { if (cur) { cur.body = cur.body.join('\n').trim(); arts.push(cur); } cur = null; };
  const hasArts = lines.some(l => RX_ART.test(l));
  if (hasArts) {
    for (const l of lines) {
      const m = l.match(RX_ART), c = !m && l.match(RX_CH);
      if (m) { push(); cur = { id: 'a' + arts.length, n: m[1], t: m[2].trim(), ch, body: [] }; continue; }
      if (isHead(c, l)) { push(); const lvl = chLevel(c[1]); chs = chs.slice(0, lvl); chs[lvl] = chTitle(c); ch = chs.filter(Boolean).join(' › '); continue; }
      if (cur) { if (!l && !cur.body.length) continue; if (!cur.t && !cur.body.length && l.length < 200 && !/^\d/.test(l)) cur.t = l; else cur.body.push(l); }
    }
    push();
    return { ...meta, unit: 'ст', arts };
  }
  // нет статей — правила, положения, приказы: делим по пунктам «1.», «2.», …; разделы «I. …» — как главы
  let fresh = true; // после заголовка раздела нумерация может начаться заново
  for (const l of lines) {
    const s = l.length < 220 && l.match(RX_SECT), c = !s && l.match(RX_CH), p = l.match(RX_PT);
    if (s || isHead(c, l)) { push(); ch = s ? `${s[1]}. ${s[2]}` : chTitle(c); fresh = true; continue; }
    if (/^(УТВЕРЖДЕН|ПРАВИЛА|ПОЛОЖЕНИЕ|ПОРЯДОК|ТРЕБОВАНИЯ|ПЕРЕЧЕНЬ|РЕГЛАМЕНТ)/.test(l) && l === l.toUpperCase()) { push(); fresh = true; continue; }
    if (p && (!cur || isNextPoint(cur.n, p[1]) || (fresh && parseFloat(p[1]) === 1))) {
      if (fresh && parseFloat(p[1]) === 1 && (cur || arts.length)) { push(); arts.forEach(a => { if (!/^вв/.test(a.n)) { a.n = 'вв.' + a.n; a.ch = a.ch || 'Вводная часть'; } }); } // пункты самого постановления до утверждённых правил
      push(); cur = { id: 'a' + arts.length, n: p[1], t: '', ch, body: [p[2]] }; fresh = false; continue;
    }
    if (cur) cur.body.push(l);
  }
  push();
  arts.forEach(a => { a.t = a.body.split('\n')[0].slice(0, 140); });
  return { ...meta, unit: 'п', arts };
}
// следующий пункт: номер больше прежнего (не «1.» внутри текста пункта 25)
const ptKey = n => { const m = String(n).match(/^(\d+(?:\.\d+)?)(?:\((\d+)\))?/); return m ? parseFloat(m[1]) + (m[2] ? +m[2] / 1000 : 0) : 0; };
function isNextPoint(prev, n) { const a = ptKey(String(prev).replace(/^вв\./, '')), b = ptKey(n); return b > a && b - a < 40; }

// ---------- чтение файлов: .txt, .html, .docx, .rtf ----------
async function lawFileText(file) {
  const name = file.name.toLowerCase(), buf = new Uint8Array(await file.arrayBuffer());
  const dec = enc => new TextDecoder(enc).decode(buf);
  if (name.endsWith('.docx')) return docxText(buf);
  if (name.endsWith('.rtf') || dec('latin1').startsWith('{\\rtf')) return rtfText(dec('latin1'));
  let t = dec('utf-8'); if (t.includes('\ufffd')) t = dec('windows-1251');
  if (/\.(html?|xhtml)$/.test(name) || /^\s*<(!doctype|html)/i.test(t)) return htmlText(t);
  return t;
}
function htmlText(h) {
  const doc = new DOMParser().parseFromString(h, 'text/html'); doc.querySelectorAll('script,style,noscript,head').forEach(x => x.remove());
  const out = []; const BL = /^(P|DIV|BR|H[1-6]|LI|TR|TABLE|SECTION|ARTICLE|PRE|BLOCKQUOTE)$/;
  const walk = n => { for (const c of n.childNodes) { if (c.nodeType === 3) out.push(c.nodeValue.replace(/\s+/g, ' ')); else if (c.nodeType === 1) { if (BL.test(c.tagName)) out.push('\n'); walk(c); if (BL.test(c.tagName)) out.push('\n'); } } };
  walk(doc.body || doc.documentElement); return out.join('');
}
async function docxText(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('файл .docx повреждён');
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
  for (let k = 0; k < n; k++) {
    const meth = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), fl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + fl));
    if (fname === 'word/document.xml') {
      const lfl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), data = buf.subarray(off + 30 + lfl + lel, off + 30 + lfl + lel + csize);
      const raw = meth === 0 ? data : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      const xml = new TextDecoder().decode(raw);
      return xml.replace(/<w:tab\/>/g, ' ').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    p += 46 + fl + el + cl;
  }
  throw new Error('в файле .docx нет текста');
}
function rtfText(s) {
  const cpm = s.match(/\\ansicpg(\d+)/); let dec; try { dec = new TextDecoder('windows-' + (cpm ? cpm[1] : '1251')); } catch (e) { dec = new TextDecoder('windows-1251'); }
  const out = []; let bytes = []; const flush = () => { if (bytes.length) { out.push(dec.decode(new Uint8Array(bytes))); bytes = []; } };
  const stack = []; let skip = false, uc = 1, i = 0;
  const SKIPD = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|headerl|headerr|footerl|footerr|listtable|listoverridetable|rsidtbl|themedata|colorschememapping|latentstyles|datastore|xmlnstbl|generator|filetbl|revtbl)$/;
  while (i < s.length) {
    const c = s[i];
    if (c === '{') { stack.push(skip); i++; continue; }
    if (c === '}') { flush(); skip = stack.pop() || false; i++; continue; }
    if (c === '\\') {
      const nx = s[i + 1];
      if (nx === '\'') { if (!skip) bytes.push(parseInt(s.substr(i + 2, 2), 16)); i += 4; continue; }
      if (nx === '*') { skip = true; i += 2; continue; }
      if (nx === '\\' || nx === '{' || nx === '}') { flush(); if (!skip) out.push(nx); i += 2; continue; }
      if (nx === '~') { flush(); if (!skip) out.push(' '); i += 2; continue; }
      if (nx === '\n' || nx === '\r') { flush(); if (!skip) out.push('\n'); i += 2; continue; }
      const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(s.slice(i, i + 40));
      if (!m) { i++; continue; }
      const w = m[1], arg = m[2]; i += m[0].length;
      if (SKIPD.test(w)) { skip = true; continue; }
      if (skip) continue;
      if (w === 'par' || w === 'line' || w === 'sect' || w === 'row') { flush(); out.push('\n'); }
      else if (w === 'tab' || w === 'cell') { flush(); out.push(' '); }
      else if (w === 'uc') uc = +arg;
      else if (w === 'u') { flush(); let cp = +arg; if (cp < 0) cp += 65536; out.push(String.fromCharCode(cp)); for (let k = 0; k < uc && i < s.length; k++) { if (s[i] === '\\' && s[i + 1] === '\'') i += 4; else i++; } }
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (!skip) { flush(); out.push(c); }
    i++;
  }
  flush(); return out.join('');
}

// ---------- поиск ----------
const lnorm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
const stem = w => w.length > 5 ? w.slice(0, w.length - 2) : w;
const RX_REF = /^\s*(ст(?:атья|атьи|атье|\.)?|п(?:ункт|ункта|\.)?|§)\s*(\d+(?:[.\-]\d+)*(?:\(\d+\))?)\s*\.?\s*(.*)$/i;
function lawDocMatch(d, words) {
  const s = lnorm((d.short || '') + ' ' + d.title), ini = lnorm(d.title).split(/[^a-zа-я0-9]+/).filter(w => w.length > 2).map(w => w[0]).join('');
  return words.every(w => s.includes(w) || s.replace(/[^a-zа-я0-9]/g, '').includes(w.replace(/[^a-zа-я0-9]/g, '')) || (/^[a-zа-я]{2,6}$/.test(w) && ini.includes(w)));
}
function lawSearch(q, limit = 80) {
  q = String(q || '').trim(); if (!q) return [];
  const docs = LW().docs, out = [], seen = new Set();
  const r = q.match(RX_REF);
  if (r) {
    const n = r[2], rest = lnorm(r[3]).split(/\s+/).filter(w => w && !['рф', 'российской', 'федерации'].includes(w));
    docs.filter(d => !rest.length || lawDocMatch(d, rest)).forEach(d => {
      const a = lawArts(d.id).find(x => x.n === n); if (a) { out.push({ d, a, exact: true }); seen.add(d.id + a.id); }
    });
    if (out.length) return out;
  }
  // поиск по словам: все формы слова, точные совпадения выше, опечатки исправляются
  lawIndex();
  const fx = LF.noFix ? null : spellFix(q), T = consultTerms(fx ? fx.q : q, [], { noSyn: true });
  if (!T.groups.length) return out;
  const R = consultSearch(T, limit).filter(r => !seen.has(r.d.id + r.a.id));
  R.T = T; R.fix = fx; return R;
}
function snip(text, words) {
  const t = String(text), lt = lnorm(t); let i = -1;
  for (const w of words || []) { const k = lt.indexOf(w); if (k >= 0 && (i < 0 || k < i)) i = k; }
  const s = Math.max(0, i - 70), part = (s ? '…' : '') + t.slice(s, s + 220) + (t.length > s + 220 ? '…' : '');
  return markWords(esc(part), words);
}
function markWords(h, words) {
  if (!words || !words.length) return h;
  const rx = new RegExp('(' + words.filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]')).join('|') + ')[а-яёa-z]*', 'gi');
  return h.replace(/(<[^>]*>)|([^<]+)/g, (m0, tag, txt) => tag || txt.replace(rx, '<mark>$&</mark>'));
}

// ---------- показ статьи ----------
function artBodyHtml(d, a, words) {
  const ns = new Set(lawArts(d.id).map(x => x.n));
  return a.body.split('\n').filter(Boolean).map(p => {
    let h = esc(p);
    const own = /настоящ/i.test(p) || !/(закона|кодекса|постановлени|приказ)/i.test(p);
    h = h.replace(/(стать(?:я|и|е|ю|ей|ями|ях|ям))\s+(\d+(?:[.\-]\d+)*)/gi, (m0, w, n) => own && d.unit === 'ст' && ns.has(n) ? `${w} <button class="lnk alink" data-act="lawGo" data-doc="${d.id}" data-n="${n}">${n}</button>` : m0);
    h = markWords(h, words);
    if (LF.hl && LF.hl.art === a.id && !words) h = h.replace(/(<[^>]*>)|([^<]+)/g, (m0, tag, txt) => tag || txt.replace(/[А-Яа-яЁё]+/g, w => { const st = RU.stem(w); return LF.hl.strong && LF.hl.strong.has(st) ? `<mark>${w}</mark>` : LF.hl.soft && LF.hl.soft.has(st) ? `<mark class="soft">${w}</mark>` : w; }));
    const note = /^\((в ред\.|введен|утратил|абзац|часть|пункт|п\.|ч\.|подпункт|статья)/i.test(p) || /^\(в\s+ред/i.test(p);
    return `<p class="${note ? 'lnote' : ''}">${h}</p>`;
  }).join('');
}
const markOf = (doc, art) => LW().marks.find(m => m.doc === doc && m.art === art);
function artHtml(d, a, opts = {}) {
  const mk = markOf(d.id, a.id), ts = live().filter(t => (t.laws || []).some(l => l.doc === d.id && l.art === a.id));
  const L = lawArts(d.id), i = L.indexOf(a);
  return `<article class="lart">
    <div class="lcrumb"><button class="lnk" data-act="lawCrumb" data-doc="${d.id}" data-k="">${esc(d.short || d.title)}</button>${a.ch ? a.ch.split(' › ').map((t, i, arr) => ` › <button class="lnk" data-act="lawCrumb" data-doc="${d.id}" data-k="${esc(arr.slice(0, i + 1).join(' › '))}">${esc(t)}</button>`).join('') : ''}</div>
    <h2>${d.unit === 'п' ? 'Пункт' : 'Статья'} ${esc(a.n)}${a.t && d.unit !== 'п' ? '. ' + esc(a.t) : ''}</h2>
    <div class="lbtns"><button class="btn sm ${mk ? 'pri' : ''}" data-act="lawMark" data-doc="${d.id}" data-art="${a.id}">${ic('bookmark')} ${mk ? 'В закладках' : 'В закладки'}</button><button class="btn sm" data-act="lawTask" data-doc="${d.id}" data-art="${a.id}">${ic('link')} К задаче</button><button class="btn sm ghost" data-act="lawCopy" data-doc="${d.id}" data-art="${a.id}">${ic('copy')} Копировать</button><button class="btn sm ghost" data-act="lawCheck" data-doc="${d.id}">${ic('ext')} Актуальная редакция</button></div>
    ${mk ? `<div class="lmk"><label class="f"><span>Заметка к статье</span><textarea class="in" data-lnote="${mk.id}" rows="2" placeholder="Своими словами: когда применять, на что обратить внимание">${esc(mk.note || '')}</textarea></label></div>` : ''}
    ${ts.length ? `<div class="ltasks"><span>${ic('list')} Задачи:</span>${ts.map(t => `<button class="chip" data-act="openTask" data-id="${t.id}">${esc(t.title)}</button>`).join('')}</div>` : ''}
    <div class="lbody">${artBodyHtml(d, a, opts.words)}</div>
    ${opts.nav === false ? '' : `<div class="lnav">${i > 0 ? `<button class="btn ghost" data-act="lawOpen" data-doc="${d.id}" data-art="${L[i - 1].id}">${ic('left')} ${unitOf(d)} ${esc(L[i - 1].n)}</button>` : '<span></span>'}${i < L.length - 1 ? `<button class="btn ghost" data-act="lawOpen" data-doc="${d.id}" data-art="${L[i + 1].id}">${unitOf(d)} ${esc(L[i + 1].n)} ${ic('right')}</button>` : ''}</div>`}
    ${d.rev ? `<p class="hint">Текст в редакции от ${dayLong(d.rev).replace(/^(Сегодня|Вчера|Завтра), /, '')}. ${d.checked ? 'Проверено ' + fmtTs(d.checked).replace(/, \d\d:\d\d$/, '') + '.' : ''}</p>` : '<p class="hint">Дата редакции не указана — проверьте актуальность на официальном портале.</p>'}
  </article>`;
}
// статья поверх любого окна (из задачи, из поиска)
function lawSheet(docId, artId) {
  lawLoad().then(() => {
    const d = lawDoc(docId), a = d && lawArt(docId, artId);
    if (!a) return toast('Этой статьи нет в вашей библиотеке — добавьте документ в разделе «Право»');
    sheet(`<div class="lsheet">${artHtml(d, a, { nav: false })}<div class="shf"><button class="btn ghost" data-act="lawOpenFull" data-doc="${d.id}" data-art="${a.id}">Открыть в разделе «Право»</button><span class="spacer"></span><button class="btn pri" data-act="shClose">Закрыть</button></div></div>`);
  });
}

// ---------- раздел ----------
function lawListHtml() {
  const docs = LW().docs, mk = LW().marks;
  const tabs = `<div class="subtabs"><button class="${LF.tab === 'docs' ? 'on' : ''}" data-act="lawTab" data-v="docs">Документы <span class="n">${docs.length}</span></button><button class="${LF.tab === 'marks' ? 'on' : ''}" data-act="lawTab" data-v="marks">Закладки <span class="n">${mk.length}</span></button></div>`;
  let body;
  if (LF.tab === 'marks') body = mk.length ? mk.slice().sort((a, b) => b.at - a.at).map(m => { const d = lawDoc(m.doc), a = d && lawArt(m.doc, m.art); if (!a) return ''; return `<button class="ldoc ${LF.doc === d.id && LF.art === a.id ? 'on' : ''}" data-act="lawOpen" data-doc="${d.id}" data-art="${a.id}"><b>${esc(artLabel(d, a))}</b><small>${esc(m.note || a.t || '')}</small></button>`; }).join('') : '<div class="empty">Закладок пока нет. Откройте статью и нажмите «В закладки».</div>';
  else body = docs.length ? docs.map(d => { const old = !d.checked || Date.now() - d.checked > 30 * 864e5; return `<button class="ldoc ${LF.doc === d.id ? 'on' : ''}" data-act="lawDoc" data-doc="${d.id}"><b>${esc(d.short || d.title)}</b><small>${esc(d.short ? d.title : '')}</small><small>${d.n} ${d.unit === 'п' ? plural(d.n, ['пункт', 'пункта', 'пунктов']) : plural(d.n, ['статья', 'статьи', 'статей'])}${d.rev ? ' · ред. ' + d.rev.split('-').reverse().join('.') : ''}${old ? ' · <span class="lold">проверить редакцию</span>' : ''}</small></button>`; }).join('') : '';
  return `<aside class="llist">${tabs}<div class="lscroll">${body}${LF.tab === 'docs' ? `<button class="ldoc add" data-act="lawAdd">${ic('plus')} <b>Добавить документ</b></button>` : ''}</div></aside>`;
}
function lawEmpty() {
  return `<div class="lempty">${ic('scale')}<h2>Своя правовая база</h2><p>Добавьте законы, кодексы и правила, с которыми работаете. Планер разделит их на статьи или пункты: поиск по номеру и по словам, закладки с заметками, статьи в задачах. Всё работает без интернета.</p>
    <ol><li>Откройте документ на <b>pravo.gov.ru</b> или в <b>КонсультантПлюс</b>.</li><li>Сохраните его файлом (Word, RTF, HTML или текст) или выделите весь текст и скопируйте.</li><li>Нажмите «Добавить документ» и выберите файл или вставьте текст.</li></ol>
    <div class="fbtn"><button class="btn pri" data-act="lawAdd">${ic('plus')} Добавить документ</button><button class="btn" data-act="lawPortal">${ic('ext')} Открыть официальный портал</button></div></div>`;
}
function lawDocView(d) {
  const L = lawArts(d.id);
  if (LF.art) { const a = lawArt(d.id, LF.art); if (a) return `<div class="lview">${LF.back ? `<button class="back" data-act="lawBack">${ic('left')} ${LF.back === 'consult' ? 'К результатам консультации' : 'К результатам поиска'}</button>` : MOB() ? `<button class="back" data-act="lawBackToc">${ic('left')} Оглавление</button>` : ''}${artHtml(d, a)}</div>`; }
  const tree = lawTree(L), many = L.length > 60;
  return `<div class="lview"><div class="ldhead"><div><h2>${esc(d.short || d.title)}</h2>${d.short ? `<p>${esc(d.title)}</p>` : ''}<small>${L.length} ${d.unit === 'п' ? plural(L.length, ['пункт', 'пункта', 'пунктов']) : plural(L.length, ['статья', 'статьи', 'статей'])}${d.rev ? ' · редакция от ' + d.rev.split('-').reverse().join('.') : ''}</small></div>
    <div class="fbtn"><button class="btn sm" data-act="lawCheck" data-doc="${d.id}">${ic('ext')} Проверить актуальную редакцию</button>${d.url ? `<button class="btn sm ghost" data-act="lawOpenSite" data-id="${d.id}">${ic('ext')} На сайте</button>` : ''}<button class="btn sm ghost" data-act="lawEdit" data-doc="${d.id}">${ic('edit')} Свойства</button></div></div>
    ${tree.kids.length ? `<div class="ltbar"><button class="btn sm ghost" data-act="lawTreeAll" data-doc="${d.id}" data-v="1">Развернуть всё</button><button class="btn sm ghost" data-act="lawTreeAll" data-doc="${d.id}" data-v="0">Свернуть всё</button></div>` : ''}
    <div class="ltoc">${tree.arts.map(a => tocArt(d, a)).join('')}${tree.kids.map(k => tocNode(d, k, 0, many)).join('')}</div></div>`;
}
// оглавление деревом: Часть › Раздел › Глава › § › статьи
function lawTree(L) {
  const root = { kids: [], arts: [], map: new Map(), path: '' };
  for (const a of L) {
    let n = root;
    (a.ch ? a.ch.split(' › ') : []).forEach(t => { let k = n.map.get(t); if (!k) { k = { title: t, kids: [], arts: [], map: new Map(), path: n.path ? n.path + ' › ' + t : t }; n.map.set(t, k); n.kids.push(k); } n = k; });
    n.arts.push(a);
  }
  const cnt = n => n.n = n.arts.length + n.kids.reduce((s, k) => s + cnt(k), 0); cnt(root);
  return root;
}
const treeKey = (d, path) => d.id + '|' + path;
const tocArt = (d, a) => `<button class="ltocl" data-act="lawOpen" data-doc="${d.id}" data-art="${a.id}"><b>${unitOf(d)} ${esc(a.n)}</b><span>${esc(a.t || '')}</span>${markOf(d.id, a.id) ? ic('bookmark') : ''}</button>`;
function tocNode(d, k, lvl, many) {
  const key = treeKey(d, k.path), st = LF.open[key], open = st === undefined ? (!many || (lvl === 0 && k.kids.length > 0)) : st;
  const sc = t => t && t === t.toUpperCase() && /[А-ЯЁ]{3}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase().replace(/российской федерации/g, 'Российской Федерации') : t;
  const m = k.title.match(/^(Часть|Раздел|Подраздел|Глава|§)\s*([^.\s]+)\.?\s*(.*)$/i) || k.title.match(/^()([IVXLCDM]+\.)\s*(.*)$/);
  const lab = m ? `<em>${esc((m[1] + ' ' + m[2]).trim())}</em>${m[3] ? '<span>' + esc(sc(m[3])) + '</span>' : ''}` : `<span>${esc(sc(k.title))}</span>`;
  return `<div class="tn lv${Math.min(lvl, 3)} ${open ? 'open' : ''}" data-tk="${esc(key)}"><button class="tgh" data-act="lawGrp" data-k="${esc(key)}"><i class="tgc">${ic('caret')}</i>${lab}<small>${k.n}</small></button><div class="tgb">${k.arts.map(a => tocArt(d, a)).join('')}${k.kids.map(x => tocNode(d, x, lvl + 1, many)).join('')}</div></div>`;
}
function lawResults() {
  const R = lawSearch(LF.q), T = R.T;
  return `<div class="lview"><div class="ldhead"><div><h2>Поиск: «${esc(LF.q)}»</h2><small>${R.length ? R.length + (R.length >= 80 ? '+' : '') + ' ' + plural(R.length, ['совпадение', 'совпадения', 'совпадений']) : 'Ничего не найдено'}</small></div></div>
    ${fixBanner(R.fix, 'lawNoFix')}
    ${R.map(r => `<button class="lres" data-act="lawOpen" data-doc="${r.d.id}" data-art="${r.a.id}" data-q="1"><b>${esc(artLabel(r.d, r.a))}${r.a.t && r.d.unit !== 'п' ? ' — ' + (T ? markStems(r.a.t, T.strong) : esc(r.a.t)) : ''}${r.exact && T && T.groups.length > 1 ? ' <span class="exb">точное совпадение</span>' : ''}</b><span>${T ? (r.sents || bestSents(r.a.body, T)).map(x => markStems(x, T.strong)).join(' <span class="dots">…</span> ') : esc(r.a.body.slice(0, 220))}</span></button>`).join('') || `<div class="empty">Попробуйте другие слова или номер: «ст. 20.4 КоАП», «п. 15». Точная фраза — в кавычках: «"обязанности застрахованных лиц"»${LW().docs.length ? '' : '. Сначала добавьте документы.'}</div>`}</div>`;
}
registerModule({
  id: 'law', order: 6.5, title: 'Право', icon: 'scale', desc: 'Своя библиотека законов: статьи, поиск, закладки, ссылки из задач',
  badge: () => { const n = LW().docs.filter(d => !d.checked || Date.now() - d.checked > 30 * 864e5).length; return n ? { v: n, soft: true } : ''; },
  bar() {
    return `<h1>Право</h1><form class="lsearch" id="lawq"><label>${ic('search')}<input id="lq" type="search" value="${esc(LF.q)}" placeholder="ст. 20.4 КоАП или слова из текста" autocomplete="off" enterkeyhint="search"></label></form>${LF.q ? '<button class="btn sm ghost" data-act="lawClear">Сбросить</button>' : ''}<span class="spacer"></span><button class="btn sm" data-act="lawAdd">${ic('plus')} Документ</button>`;
  },
  render() {
    if (!LAWC.size && LW().docs.length) { lawLoad().then(() => { if (UI.view === 'law') render(); }); return '<div class="scroll"><p class="hint">Загружаю библиотеку…</p></div>'; }
    const d = LF.doc && lawDoc(LF.doc);
    const main = LF.q ? lawResults() : d ? lawDocView(d) : LW().docs.length ? `<div class="lview"><div class="lempty small">${ic('scale')}<p>Выберите документ слева или найдите статью по номеру и словам.</p><button class="btn" data-act="lawPortal">${ic('ext')} Официальный портал правовой информации</button></div></div>` : lawEmpty();
    const showList = !MOB() || (!d && !LF.q);
    return `<div class="lwrap ${MOB() ? (showList ? 'm-list' : 'm-view') : ''}">${showList ? lawListHtml() : ''}${!MOB() || !showList || !LW().docs.length ? `<div class="lmain" id="lmain">${MOB() && (d || LF.q) && !LF.art ? `<button class="back" data-act="lawHome">${ic('left')} Все документы</button>` : ''}${main}</div>` : ''}</div>`;
  },
  after() { const m = $('#lmain'); if (m && LF.scrollTop) { m.scrollTop = 0; LF.scrollTop = false; } },
  search(q) {
    if (!LAWC.size) { lawLoad(); return []; }
    return lawSearch(q, 6).map(r => ({ group: 'Право', title: artLabel(r.d, r.a) + (r.a.t && r.d.unit !== 'п' ? ' — ' + r.a.t : ''), sub: '', color: 'var(--acc)', act: 'lawFromSearch', id: r.d.id + ':' + r.a.id }));
  }
});

// ---------- добавление и свойства документа ----------
function lawAddForm(replaceId) {
  UI.form = { kind: 'lawadd', replace: replaceId || null };
  const d = replaceId && lawDoc(replaceId);
  modal(`<div class="mbox narrow"><div class="mh"><h2>${d ? 'Обновить текст: ' + esc(d.short || d.title) : 'Добавить документ'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
    <div class="mb">
      ${hasApi && window.api.netGet ? `<div class="f"><span>Ссылка на документ</span><div class="lurl"><input class="in" id="lurl" placeholder="pravo.gov.ru, consultant.ru, garant.ru…" value="${esc(d && d.url ? d.url : '')}" inputmode="url"><button class="btn pri" data-act="lawUrlGo">${ic('upload')} Загрузить</button><button class="btn ghost" id="lurlstop" data-act="lawUrlStop" hidden>Стоп</button></div><p class="hint" id="lurlst">Планер сам скачает текст и разделит его на статьи. Если на сайте каждая статья на своей странице, загрузит их по очереди.</p></div><div class="lor"><span>или</span></div>` : ''}
      <div class="ldrop" id="ldrop"><input type="file" id="lfile" accept=".txt,.htm,.html,.docx,.rtf,text/plain,text/html" hidden>${ic('upload')}<b>Выберите файл</b><span>Word (.docx), RTF, HTML или текст — сохранённые с pravo.gov.ru или из КонсультантПлюс</span><button class="btn" data-act="lawPick">Выбрать файл…</button></div>
      <label class="f"><span>или вставьте текст документа целиком</span><textarea class="in" id="ltext" rows="7" placeholder="Скопируйте весь текст закона (Ctrl+A, Ctrl+C) и вставьте сюда"></textarea></label>
      <div id="lprev"></div>
      <p class="hint">PDF не читается напрямую: откройте его, выделите весь текст и вставьте сюда.${d ? ' Закладки и ссылки из задач сохранятся там, где номер статьи остался прежним.' : ''}</p>
    </div>
    <div class="mf"><span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="lawParseGo">Разобрать</button></div></div>`);
}
function lawPreview(p) {
  UI.form.parsed = p;
  const ch = [...new Set(p.arts.map(a => a.ch).filter(Boolean))].length;
  $('#lprev').innerHTML = p.arts.length ? `<div class="lpv">
    <label class="f"><span>Название</span><input class="in" id="lp-title" value="${esc(p.title)}" placeholder="Полное название документа"></label>
    <div class="row two"><label class="f"><span>Коротко</span><input class="in" id="lp-short" value="${esc(p.short)}" placeholder="КоАП РФ, 69-ФЗ…"></label><label class="f"><span>Редакция от</span><input class="in" type="date" id="lp-rev" value="${p.rev}"></label></div>
    <label class="f"><span>Ссылка на документ на официальном портале <em>— необязательно</em></span><input class="in" id="lp-url" placeholder="http://pravo.gov.ru/…" value="${esc(UI.form.srcUrl || (UI.form.replace ? (lawDoc(UI.form.replace).url || '') : ''))}"></label>
    <p class="hint"><b>Распознано:</b> ${p.arts.length} ${p.unit === 'п' ? plural(p.arts.length, ['пункт', 'пункта', 'пунктов']) : plural(p.arts.length, ['статья', 'статьи', 'статей'])}${ch ? `, ${ch} ${plural(ch, ['глава', 'главы', 'глав'])}` : ''}. Первые: ${p.arts.slice(0, 4).map(a => (p.unit === 'п' ? 'п. ' : 'ст. ') + esc(a.n)).join(', ')}${p.arts.length > 4 ? ' … последняя ' + (p.unit === 'п' ? 'п. ' : 'ст. ') + esc(p.arts[p.arts.length - 1].n) : ''}.</p></div>`
    : '<p class="hint warn">Не нашёл в тексте ни статей («Статья 1.»), ни пунктов («1.»). Проверьте, что вставлен текст самого документа.</p>';
  const go = $('[data-act=lawParseGo]'); if (go && p.arts.length) { go.textContent = 'Сохранить в библиотеку'; go.dataset.act = 'lawSave'; }
}
async function lawSaveParsed() {
  const F = UI.form, p = F.parsed; if (!p || !p.arts.length) return;
  const title = $('#lp-title').value.trim() || p.title || 'Документ', short = $('#lp-short').value.trim(), rev = $('#lp-rev').value || '', url = $('#lp-url').value.trim();
  if (url && !/^https?:\/\//i.test(url)) return toast('Ссылка должна начинаться с http:// или https://');
  let d;
  if (F.replace) {
    d = lawDoc(F.replace);
    try { await lawApplyReplace(d, p, { title, short, rev, url }); } catch (e) { return toast('Не удалось сохранить текст: ' + ((e && e.message) || e)); }
    save(); closeModal(); LF.doc = d.id; LF.art = null; LF.q = ''; go('law'); return toast('Текст документа обновлён');
  } else {
    d = { id: uid(), title, short, rev, url, unit: p.unit, n: p.arts.length, added: Date.now(), checked: Date.now() };
    LW().docs.push(d);
  }
  try { await lawDB.put({ id: d.id, arts: p.arts }); } catch (e) { return toast('Не удалось сохранить текст: ' + ((e && e.message) || e)); }
  LAWC.set(d.id, p.arts); save(); closeModal(); LF.doc = d.id; LF.art = null; LF.q = ''; LF.tab = 'docs'; go('law');
  toast(F.replace ? 'Текст документа обновлён' : `«${short || title}» добавлен: ${p.arts.length} ${p.unit === 'п' ? 'пунктов' : 'статей'}`);
}
function lawEditForm(id) {
  const d = lawDoc(id); UI.form = { kind: 'lawedit', id };
  modal(`<div class="mbox narrow"><div class="mh"><h2>Свойства документа</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
    <div class="mb"><label class="f"><span>Название</span><input class="in" id="le-title" value="${esc(d.title)}"></label>
    <div class="row two"><label class="f"><span>Коротко</span><input class="in" id="le-short" value="${esc(d.short || '')}"></label><label class="f"><span>Редакция от</span><input class="in" type="date" id="le-rev" value="${d.rev || ''}"></label></div>
    <label class="f"><span>Ссылка на официальном портале</span><input class="in" id="le-url" value="${esc(d.url || '')}" placeholder="http://pravo.gov.ru/…"></label>
    <div class="sline"><div class="tx"><b>Вышла новая редакция?</b><span>Загрузите новый текст — закладки и ссылки из задач перенесутся по номерам статей</span></div><button class="btn" data-act="lawReplace" data-doc="${d.id}">${ic('upload')} Обновить текст</button></div>
    ${d.url && hasApi && window.api.netGet ? `<div class="sline"><div class="tx"><b>Проверить по ссылке</b><span>Скачать документ с сайта и сравнить с вашей копией</span></div><button class="btn" data-act="lawReload" data-doc="${d.id}">${ic('sync')} Проверить</button></div>` : ''}</div>
    <div class="mf"><button class="btn ghost danger" data-act="lawDel" data-doc="${d.id}">${ic('trash')} Удалить</button><span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="lawEditSave">Сохранить</button></div></div>`);
}
function openExternal(url) {
  if (IS_PHONE) { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
  else window.open(url, '_blank', 'noopener');
}
// выбор статьи для задачи — лист поверх формы задачи
function lawPicker(onPick) {
  UI.lawPick = onPick;
  lawLoad().then(() => {
    sheet(`<div class="lpick"><div class="shh"><b>Статья для задачи</b><small>Номер («ст. 20.4 КоАП») или слова из текста</small></div><input class="in" id="lpq" placeholder="Поиск по библиотеке" autocomplete="off"><div class="lpr" id="lpr">${LW().docs.length ? '' : '<p class="hint">Библиотека пуста — добавьте документы в разделе «Право».</p>'}</div></div>`);
    setTimeout(() => $('#lpq') && $('#lpq').focus(), 50);
  });
}
function lawPickDraw() {
  const q = $('#lpq').value, R = lawSearch(q, 30);
  $('#lpr').innerHTML = R.map(r => `<button class="lres" data-act="lawPicked" data-doc="${r.d.id}" data-art="${r.a.id}"><b>${esc(artLabel(r.d, r.a))}</b><span>${esc((r.a.t || r.a.body).slice(0, 120))}</span></button>`).join('') || (q.trim() ? '<p class="hint">Ничего не найдено</p>' : '');
}
// ссылки на статьи в задаче
const lawChips = (t, rm) => (t.laws || []).map((l, i) => `<span class="lchip"><button type="button" data-act="lawChip" data-doc="${l.doc}" data-art="${l.art}" title="Открыть статью">§ ${esc(l.label)}</button>${rm ? `<button type="button" class="x" data-act="lawUnlink" data-i="${i}" aria-label="Убрать">${ic('x')}</button>` : ''}</span>`).join('');
function lawLink(doc, art) { const d = lawDoc(doc), a = lawArt(doc, art); return d && a ? { doc, art, label: artLabel(d, a) } : null; }

Object.assign(ACT, {
  lawGrp: b => { const k = b.dataset.k, el = b.closest('.tn'), on = !el.classList.contains('open'); el.classList.toggle('open', on); LF.open[k] = on; },
  lawTreeAll: b => { const d = lawDoc(b.dataset.doc), on = b.dataset.v === '1'; if (!d) return; const walk = n => n.kids.forEach(k => { LF.open[treeKey(d, k.path)] = on; walk(k); }); walk(lawTree(lawArts(d.id))); render(); },
  lawCrumb: b => {
    const d = lawDoc(b.dataset.doc); if (!d) return; const path = b.dataset.k; closeSheet();
    if (path) { const parts = path.split(' › '); parts.forEach((_, i) => { LF.open[treeKey(d, parts.slice(0, i + 1).join(' › '))] = true; }); }
    LF.mode = 'lib'; LF.doc = d.id; LF.art = null; LF.q = ''; if (UI.view !== 'law') go('law'); else render();
    if (path) setTimeout(() => { const el = [...document.querySelectorAll('.tn')].find(x => x.dataset.tk === treeKey(d, path)); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300); } }, 30);
  },
  lawTab: b => { LF.tab = b.dataset.v; render(); },
  lawDoc: b => { LF.back = null; LF.hl = null; LF.doc = b.dataset.doc; LF.art = null; LF.q = ''; LF.scrollTop = true; render(); },
  lawOpen: b => {
    const from = b.dataset.from || (b.dataset.q ? 'search' : null);
    if (from === 'consult' && CS.res) LF.hl = { art: b.dataset.art, strong: CS.res.T.strong, soft: CS.res.T.soft };
    else if (from === 'search') { const T = lawSearch(LF.q).T; LF.hl = T ? { art: b.dataset.art, strong: T.strong } : null; LF.lastQ = LF.q; }
    else if (!LF.hl || LF.hl.art !== b.dataset.art) LF.hl = null;
    if (from) LF.back = from;
    LF.mode = 'lib'; LF.doc = b.dataset.doc; LF.art = b.dataset.art; LF.q = ''; LF.scrollTop = true; closeSheet(); if (UI.view !== 'law') go('law'); else render();
  },
  lawBack: () => { const f = LF.back; LF.back = null; LF.hl = null; LF.art = null; if (f === 'consult') LF.mode = 'consult'; else if (f === 'search') { LF.q = LF.lastQ || ''; } render(); },
  lawNoFix: () => { LF.noFix = true; render(); },
  lawOpenFull: b => { closeSheet(); closeModal(); LF.mode = 'lib'; LF.doc = b.dataset.doc; LF.art = b.dataset.art; LF.q = ''; go('law'); },
  lawFromSearch: b => { const [doc, art] = b.dataset.id.split(':'); LF.mode = 'lib'; LF.back = null; LF.doc = doc; LF.art = art; LF.q = ''; go('law'); },
  lawGo: b => { const a = lawArts(b.dataset.doc).find(x => x.n === b.dataset.n); if (!a) return; if (sheetOpen()) return lawSheet(b.dataset.doc, a.id); LF.doc = b.dataset.doc; LF.art = a.id; LF.scrollTop = true; render(); },
  lawHome: () => { LF.doc = null; LF.art = null; LF.q = ''; render(); },
  lawBackToc: () => { LF.art = null; render(); },
  lawClear: () => { LF.q = ''; render(); },
  lawAdd: () => lawAddForm(),
  lawPick: () => $('#lfile').click(),
  lawParseGo: () => { const t = $('#ltext').value; if (!t.trim()) return toast('Выберите файл или вставьте текст'); lawPreview(lawParse(t)); },
  lawSave: () => lawSaveParsed(),
  lawEdit: b => lawEditForm(b.dataset.doc),
  lawEditSave: () => { const d = lawDoc(UI.form.id), url = $('#le-url').value.trim(); if (url && !/^https?:\/\//i.test(url)) return toast('Ссылка должна начинаться с http:// или https://'); d.title = $('#le-title').value.trim() || d.title; d.short = $('#le-short').value.trim(); d.rev = $('#le-rev').value || ''; d.url = url; save(); closeModal(); render(); },
  lawReplace: b => lawAddForm(b.dataset.doc),
  lawDel: b => { const d = lawDoc(b.dataset.doc); if (!d) return; snapU(); LW().docs = LW().docs.filter(x => x.id !== d.id); LW().marks = LW().marks.filter(m => m.doc !== d.id); lawDB.del(d.id).catch(() => {}); LAWC.delete(d.id); LF.doc = null; LF.art = null; save(); closeModal(); render(); toast(`«${d.short || d.title}» удалён из библиотеки`); },
  lawMark: b => { const ex = markOf(b.dataset.doc, b.dataset.art); if (ex) LW().marks = LW().marks.filter(m => m !== ex); else LW().marks.push({ id: uid(), doc: b.dataset.doc, art: b.dataset.art, note: '', at: Date.now() }); save(); if (sheetOpen()) lawSheet(b.dataset.doc, b.dataset.art); else render(); },
  lawCopy: b => { const d = lawDoc(b.dataset.doc), a = lawArt(b.dataset.doc, b.dataset.art); const txt = `${d.unit === 'п' ? 'Пункт' : 'Статья'} ${a.n}${a.t && d.unit !== 'п' ? '. ' + a.t : ''}\n${a.body}\n\n(${d.short ? d.short + ', ' : ''}${d.title}${d.rev ? ', ред. от ' + d.rev.split('-').reverse().join('.') : ''})`; navigator.clipboard.writeText(txt).then(() => toast('Текст статьи скопирован')).catch(() => toast('Не удалось скопировать')); },
  lawCheck: b => {
    const d = lawDoc(b.dataset.doc); if (!d) return;
    d.checked = Date.now(); save();
    if (d.url && hasApi && window.api.netGet) { lawCheckUpdate(d); return; }
    if (d.url) { openExternal(d.url); toast('Сравните дату редакции. Вышла новая — «Свойства» → «Обновить текст»'); }
    else { navigator.clipboard.writeText(d.title).catch(() => {}); openExternal(LAW_PORTAL); toast('Название документа скопировано — вставьте его в поиск на портале', false, { act: 'lawEdit', id: d.id, label: 'Сохранить ссылку' }); }
    if (UI.view === 'law') render();
  },
  lawPortal: () => openExternal(LAW_PORTAL),
  lawTask: b => {
    const L = lawLink(b.dataset.doc, b.dataset.art); if (!L) return;
    const act = live().filter(t => !isDone(t)).sort(byOrder);
    UI.lawTaskLink = L;
    sheet(`<div class="lpick"><div class="shh"><b>Привязать ${esc(L.label)}</b><small>к задаче — ссылка появится в её карточке</small></div>
      <button class="btn pri" data-act="lawNewTask">${ic('plus')} Новая задача по этой статье</button>
      <input class="in" id="ltq" placeholder="Найти задачу" autocomplete="off"><div class="lpr" id="ltr">${act.slice(0, 40).map(t => `<button class="lres" data-act="lawToTask" data-id="${t.id}"><b>${esc(t.title)}</b><span>${t.date ? dueTxt(t) : 'без даты'}${projOf(t.project) ? ' · ' + esc(projOf(t.project).title) : ''}</span></button>`).join('')}</div></div>`);
  },
  lawToTask: b => { const t = byId(b.dataset.id), L = UI.lawTaskLink; if (!t || !L) return; t.laws = t.laws || []; if (!t.laws.some(x => x.doc === L.doc && x.art === L.art)) t.laws.push(L); save(); closeSheet(); render(); toast(`Статья привязана к задаче «${t.title}»`, false, { act: 'openTask', id: t.id, label: 'Открыть' }); },
  lawNewTask: () => { const L = UI.lawTaskLink; closeSheet(); openTaskForm(null, { ...taskPreset(), title: '', laws: [L] }); },
  lawChip: b => lawSheet(b.dataset.doc, b.dataset.art),
  lawUnlink: b => { if (!UI.form || UI.form.kind !== 'task') return; UI.form.t.laws.splice(+b.dataset.i, 1); $('#f-laws').innerHTML = lawChips(UI.form.t, true); },
  lawAddToTask: () => lawPicker(L => { if (!UI.form || UI.form.kind !== 'task') return; UI.form.t.laws = UI.form.t.laws || []; if (!UI.form.t.laws.some(x => x.doc === L.doc && x.art === L.art)) UI.form.t.laws.push(L); $('#f-laws').innerHTML = lawChips(UI.form.t, true); }),
  lawPicked: b => { const L = lawLink(b.dataset.doc, b.dataset.art); closeSheet(); if (L && UI.lawPick) UI.lawPick(L); }
});
document.addEventListener('submit', e => { if (e.target.id === 'lawq') { e.preventDefault(); e.stopImmediatePropagation(); LF.q = $('#lq').value.trim(); LF.scrollTop = true; lawLoad().then(render); } }, true);
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'lq') { LF.noFix = false; clearTimeout(LF.qt); LF.qt = setTimeout(() => { const v = t.value.trim(); if (v.length === 0 || v.length > 2) { LF.q = v; lawLoad().then(() => { render(); const i = $('#lq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); } }, 350); }
  if (t.id === 'lpq') lawPickDraw();
  if (t.id === 'ltq') { const q = lnorm(t.value); $$('#ltr .lres').forEach(x => { x.hidden = q && !lnorm(x.textContent).includes(q); }); }
  if (t.dataset && t.dataset.lnote) { const m = LW().marks.find(x => x.id === t.dataset.lnote); if (m) { m.note = t.value; save(); } }
}, true);
document.addEventListener('change', async e => {
  if (e.target.id !== 'lfile' || !e.target.files[0]) return;
  const f = e.target.files[0];
  try { const txt = await lawFileText(f); $('#ltext').value = txt.slice(0, 200000) + (txt.length > 200000 ? '\n…' : ''); UI.form.fullText = txt; lawPreview(lawParse(txt)); }
  catch (err) { toast('Не удалось прочитать файл: ' + ((err && err.message) || err)); }
}, true);
// полный текст вставки (поле показывает начало длинного файла)
const _lawParseGo = ACT.lawParseGo;
ACT.lawParseGo = () => { if (UI.form && UI.form.fullText && $('#ltext').value.endsWith('\n…')) return lawPreview(lawParse(UI.form.fullText)); _lawParseGo(); };

// ============================================================
//  Загрузка документа по ссылке: pravo.gov.ru, КонсультантПлюс, Гарант и другие сайты с текстами законов.
//  Если на странице только оглавление (у КонсультантПлюс каждая статья — отдельная страница),
//  Планер по очереди загружает страницы статей.
// ============================================================
const b64u8 = s => Uint8Array.from(atob(s || ''), c => c.charCodeAt(0));
async function netGet(url) {
  if (!hasApi || !window.api.netGet) throw new Error('загрузка по ссылке работает в программе для Windows и на телефоне');
  const r = await window.api.netGet(url);
  if (!r || r.status === 0) throw new Error('сайт не открылся: ' + ((r && r.error) || 'нет связи'));
  if (r.status === 403 || r.status === 429) throw new Error(`сайт не отдаёт страницу (код ${r.status}) — возможно, ограничение доступа. Сохраните документ файлом и добавьте его`);
  if (r.status >= 400) throw new Error(`сайт ответил ошибкой ${r.status}`);
  return { bytes: b64u8(r.b64), ct: String(r.ct || '').toLowerCase(), url: r.url || url };
}
function decodeHtml(bytes, ct) {
  let cs = (ct.match(/charset=([\w-]+)/) || [])[1];
  if (!cs) { const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096)); cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]; }
  try { if (cs) return new TextDecoder(/1251/.test(cs) ? 'windows-1251' : cs).decode(bytes); } catch (e) {}
  const t = new TextDecoder('utf-8').decode(bytes); return t.includes('�') ? new TextDecoder('windows-1251').decode(bytes) : t;
}
// официальный портал: ссылку на просмотр документа превращаем в ссылку на его текст
function lawUrlFix(url) {
  url = String(url || '').trim(); if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  try { const u = new URL(url);
    // новая версия «Законодательства России»: страница — приложение, текст отдаёт её же служба по «хэшу» документа
    if (/^ips\.pravo\.gov\.ru$/.test(u.hostname)) { const h = (u.search.match(/hash=([0-9a-f]{40,})/i) || u.pathname.match(/([0-9a-f]{40,})/i) || [])[1]; if (h && !/\/api\//.test(u.pathname)) return `http://ips.pravo.gov.ru/api/ips/legislation/document?baseid=None&hash=${h}`; return url; }
    if (/(^|\.)pravo\.gov\.ru$/.test(u.hostname) && !/^publication\./.test(u.hostname)) { const nd = u.searchParams.get('nd') || (u.search.match(/nd=(\d+)/) || [])[1]; if (nd) return `http://pravo.gov.ru/proxy/ips/?docbody=&nd=${nd}`; } } catch (e) {}
  return url;
}
// основной текст страницы: убираем меню и подвалы, спускаемся к блоку, где сосредоточен текст
const JUNK_SEL = 'script,style,noscript,iframe,svg,nav,header,footer,aside,form,button,select,[role=navigation],[aria-hidden=true]';
const JUNK_CLS = /(menu|navbar|nav-|header|footer|sidebar|banner|advert|reklam|cookie|share|social|comment|breadcrumb|popup|modal|subscribe|login|search)/i;
function mainText(doc) {
  doc.querySelectorAll(JUNK_SEL).forEach(x => x.remove());
  doc.querySelectorAll('[class],[id]').forEach(x => { const k = (x.className && x.className.baseVal === undefined ? x.className : '') + ' ' + x.id; if (JUNK_CLS.test(k) && !/(document|content|text|law|article)/i.test(k)) x.remove(); });
  const tl = el => { let t = (el.textContent || '').replace(/\s+/g, ' ').length; el.querySelectorAll('a').forEach(a => { t -= (a.textContent || '').replace(/\s+/g, ' ').length * 0.7; }); return t; };
  let el = doc.body || doc.documentElement;
  for (let k = 0; k < 30; k++) { const tot = tl(el); const kids = [...el.children].map(c => [c, tl(c)]).sort((a, b) => b[1] - a[1]); if (!kids.length || kids[0][1] < tot * 0.72) break; el = kids[0][0]; }
  return htmlText(el.outerHTML);
}
function artLinks(doc, base) {
  const out = [], seen = new Set(); let host = ''; try { host = new URL(base).hostname; } catch (e) {}
  doc.querySelectorAll('a[href]').forEach(a => {
    const t = (a.textContent || '').replace(/\s+/g, ' ').trim(); let href; try { href = new URL(a.getAttribute('href'), base); } catch (e) { return; }
    if (href.hostname !== host) return; href.hash = '';
    if (/^(Раздел|Глава|Подраздел)\s+[IVXLCDM\d]/i.test(t) && t.length < 200) { out.push({ head: t }); return; }
    if (!/^(Статья|Ст\.)\s*\d/i.test(t) || seen.has(href.href)) return;
    seen.add(href.href); out.push({ url: href.href, t });
  });
  return out;
}
const LDL = { stop: false };
async function lawFromUrl(url, onProg) {
  const src = lawUrlFix(url); onProg('Загружаю страницу…');
  let r;
  try { r = await netGet(src); } catch (e) { if (src === url) throw e; r = null; }
  if (src !== url && (!r || r.bytes.length < 300)) r = await netGet(url);
  const low = r.url.toLowerCase();
  if (/pdf/.test(r.ct) || /\.pdf($|\?)/.test(low)) throw new Error('по ссылке PDF — его Планер не читает. Откройте PDF, выделите весь текст и вставьте в поле ниже');
  if (/officedocument\.wordprocessingml|\.docx($|\?)/.test(r.ct + ' ' + low)) return docxText(r.bytes);
  if (/rtf/.test(r.ct) || /\.rtf($|\?)/.test(low)) return rtfText(new TextDecoder('latin1').decode(r.bytes));
  let html = decodeHtml(r.bytes, r.ct);
  if (/json/.test(r.ct) || /^\s*[{[]/.test(html)) html = jsonDocHtml(html);
  if (!/<(html|body|p|div|br)/i.test(html)) return html; // обычный текст
  const tm = html.match(/<title[^>]*>([^<]{5,300})<\/title>/i), dates = tm ? [...tm[1].matchAll(/от\s+(\d{2}\.\d{2}\.\d{4})/g)] : [];
  const revLine = dates.length > 1 ? `Редакция от ${dates[dates.length - 1][1]}\n` : '';
  const doc = new DOMParser().parseFromString(html, 'text/html'), links = artLinks(doc, r.url);
  const text = mainText(new DOMParser().parseFromString(html, 'text/html'));
  const parsed = lawParse(text), arts = links.filter(l => l.url);
  const filled = parsed.arts.filter(a => a.body.length > 30).length;
  if (filled >= Math.max(3, arts.length * 0.5)) return revLine + text;
  if (arts.length < 3) return revLine + text;
  // на странице только оглавление — загружаем статьи по одной
  const head = text.split('\n'); const cut = head.findIndex(l => RX_ART.test(l) || RX_CH.test(l)); const parts = [(cut > 0 ? head.slice(0, cut) : head.slice(0, 30)).join('\n')];
  LDL.stop = false; let i = 0, fails = 0;
  for (const l of links) {
    if (LDL.stop) throw new Error('загрузка остановлена');
    if (l.head) { parts.push(l.head); continue; }
    i++; onProg(`Загружаю статьи: ${i} из ${arts.length}…`, i / arts.length);
    try {
      const p = await netGet(l.url), t = mainText(new DOMParser().parseFromString(decodeHtml(p.bytes, p.ct), 'text/html'));
      const lines = t.split('\n'), s = lines.findIndex(x => RX_ART.test(x));
      parts.push(s >= 0 ? lines.slice(s).join('\n') : `${l.t}\n${t}`);
    } catch (e) { if (++fails > 5) throw new Error('сайт перестал отдавать страницы статей (' + e.message + ')'); parts.push(l.t + '\n(текст не загрузился)'); }
    await new Promise(res => setTimeout(res, 150));
  }
  return parts.join('\n');
}
// ответ службы в JSON: берём самую длинную строку — это текст документа (HTML или обычный)
function jsonDocHtml(txt) {
  let j; try { j = JSON.parse(txt); } catch (e) { return txt; }
  let best = '', title = '';
  const walk = (o, k) => { if (typeof o === 'string') { if (o.length > best.length) best = o; if (/^(title|name|caption|header)$/i.test(k || '') && o.length < 300) title = title || o; } else if (o && typeof o === 'object') for (const kk in o) walk(o[kk], kk); };
  walk(j);
  if (!/<\w+[^>]*>/.test(best)) best = best.split('\n').map(l => `<p>${esc(l)}</p>`).join('');
  return `<html><head><title>${esc(title)}</title></head><body>${best}</body></html>`;
}
function lawApplyReplace(d, p, meta) {
  const old = lawArts(d.id), byN = new Map(p.arts.map(a => [a.n, a])), remap = {};
  old.forEach(a => { const nn = byN.get(a.n); if (nn) remap[a.id] = nn.id; });
  LW().marks = LW().marks.filter(m => m.doc !== d.id || remap[m.art]); LW().marks.forEach(m => { if (m.doc === d.id) m.art = remap[m.art]; });
  D.tasks.forEach(t => (t.laws || []).forEach(l => { if (l.doc === d.id && remap[l.art]) l.art = remap[l.art]; }));
  Object.assign(d, meta || {}, { unit: p.unit, n: p.arts.length, checked: Date.now() });
  LAWC.set(d.id, p.arts); return lawDB.put({ id: d.id, arts: p.arts });
}
const artsSig = arts => { const s = arts.map(a => a.n + a.t + a.body).join('|'); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) + ':' + arts.length; };
// проверка редакции: загружаем документ по сохранённой ссылке и сравниваем с библиотекой
async function lawCheckUpdate(d) {
  toast('Проверяю редакцию на сайте…');
  try {
    await lawLoad();
    const txt = await lawFromUrl(d.url, () => {}), p = lawParse(txt);
    if (!p.arts.length) throw new Error('на странице не нашлось статей');
    d.checked = Date.now(); save();
    const same = artsSig(p.arts) === artsSig(lawArts(d.id)) && (!p.rev || p.rev === d.rev);
    if (same) { toast('Редакция актуальна' + (d.rev ? ': от ' + d.rev.split('-').reverse().join('.') : '')); if (UI.view === 'law') render(); return; }
    UI.lawUpd = { id: d.id, p };
    toast(`На сайте другая редакция${p.rev ? ' — от ' + p.rev.split('-').reverse().join('.') : ''}: ${p.arts.length} ${p.unit === 'п' ? plural(p.arts.length, ['пункт', 'пункта', 'пунктов']) : plural(p.arts.length, ['статья', 'статьи', 'статей'])}`, false, { act: 'lawUpdApply', id: d.id, label: 'Обновить' });
  } catch (e) { toast('Не удалось проверить: ' + e.message, false, { act: 'lawOpenSite', id: d.id, label: 'Открыть сайт' }); }
}
Object.assign(ACT, {
  lawUrlGo: async () => {
    const inp = $('#lurl'), url = inp && inp.value.trim(); if (!url) return toast('Вставьте ссылку на документ');
    const st = $('#lurlst'), go = $('[data-act=lawUrlGo]'); go.disabled = true; $('#lurlstop').hidden = false;
    try {
      const txt = await lawFromUrl(url, (m, f) => { st.innerHTML = esc(m) + (f != null ? `<span class="lbar"><i style="width:${Math.round(f * 100)}%"></i></span>` : ''); });
      UI.form.fullText = txt; UI.form.srcUrl = url; $('#ltext').value = txt.slice(0, 200000) + (txt.length > 200000 ? '\n…' : '');
      const p = lawParse(txt); st.textContent = p.arts.length ? 'Загружено. Проверьте название и сохраните.' : 'Страница загружена, но статей в ней не найдено. Возможно, сайт показывает текст только после входа — сохраните документ файлом.';
      lawPreview(p); if ($('#lp-url') && !$('#lp-url').value) $('#lp-url').value = url;
    } catch (e) { st.innerHTML = `<span style="color:var(--hi)">Не получилось: ${esc(e.message)}</span>`; }
    finally { go.disabled = false; if ($('#lurlstop')) $('#lurlstop').hidden = true; }
  },
  lawUrlStop: () => { LDL.stop = true; },
  lawUpdApply: b => { const u = UI.lawUpd, d = u && lawDoc(u.id); if (!d) return; lawApplyReplace(d, u.p, { rev: u.p.rev || d.rev }).then(() => { save(); render(); toast('Документ обновлён до новой редакции'); }); },
  lawOpenSite: b => { const d = lawDoc(b.dataset.id); if (d && d.url) openExternal(d.url); },
  lawReload: b => { const d = lawDoc(b.dataset.doc); if (!d || !d.url) return toast('В свойствах документа нет ссылки'); closeModal(); lawCheckUpdate(d); }
});
