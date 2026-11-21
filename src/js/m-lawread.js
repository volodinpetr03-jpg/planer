'use strict';
// ============================================================
//  «Право»: чтение документа как на официальном портале — слева оглавление-дерево
//  (Постановление › пункт › подпункт; Программа › разделы; приложения), справа весь текст одной лентой.
// ============================================================
ICONS.toc = '<path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11"/>';
ICONS.chup = '<path d="M6 15l6-6 6 6"/>';
ICONS.chdn = '<path d="M6 9l6 6 6-6"/>';
const LR = { doc: null, from: 0, to: 0, words: null, hits: [], hi: -1, q: '', toc: false, lastArt: undefined, anchor: null, io: null, spyT: 0 };
const lawFs = () => D.settings.lawFs || 1;
const lrL = () => lawArts(LR.doc);
const lrIdx = id => lrL().findIndex(a => a.id === id);
const tkOf = (d, path) => d.id + '|' + path;
// --- оглавление ---
function lrItemLab(d, a) {
  if (a.k === 's') return `подпункт ${subLab(a)}`;
  if (d.unit === 'п') return `пункт ${a.n}`;
  return `<b>ст. ${esc(a.n)}</b> ${esc(a.t || '')}`;
}
function lrNodeLab(t) {
  const m = t.match(/^(Часть|Раздел|Подраздел|Глава|§)\s*([^.\s]+)\.?\s*(.*)$/i) || t.match(/^()([IVXLCDM]+\.)\s*(.*)$/);
  return m ? `<em>${esc((m[1] + ' ' + m[2]).trim())}</em> ${esc(sentCase(m[3] || ''))}` : esc(sentCase(t));
}
function lrTocHtml(d) {
  const L = lawArts(d.id), tree = lawTree(L), many = L.length > 80, subs = new Map(), lc = new Map();
  if (typeof linkIndex === 'function') { const seen = new Set(); linkIndex().forEach(e => { if (e.to.k === 'law' && e.to.doc === d.id && rinfo(e.from)) { const k = e.to.art + '|' + rkey(e.from); if (!seen.has(k)) { seen.add(k); lc.set(e.to.art, (lc.get(e.to.art) || 0) + 1); } } }); }
  const lb = id => lc.get(id) ? `<small class="rlb" title="Связей: ${lc.get(id)}">${ic('lnk')}${lc.get(id)}</small>` : '';
  L.forEach(a => { if (a.k === 's' && a.par) { if (!subs.has(a.par)) subs.set(a.par, []); subs.get(a.par).push(a); } });
  const first = path => { const a = L.find(x => x.ch === path || (x.ch || '').startsWith(path + ' › ')); return a ? a.id : ''; };
  const item = a => {
    const ss = subs.get(a.id) || [], k = d.id + '#' + a.id, open = LF.open[k] === undefined ? !many : !!LF.open[k];
    return `<div class="ri ${ss.length ? 'has' : ''} ${open ? 'open' : ''}" data-ra="${a.id}" data-tk="${esc(k)}"><div class="rih">${ss.length ? `<button class="rnc" data-act="lrTog" data-k="${esc(k)}" aria-label="Подпункты">${ic('caret')}</button>` : '<i class="rnc0"></i>'}<button class="rnl" data-act="lrGo" data-art="${a.id}">${lrItemLab(d, a)}</button>${lb(a.id)}${markOf(d.id, a.id) ? ic('bookmark') : ''}</div>
      ${ss.length ? `<div class="rnb">${ss.map(x => `<div class="ri" data-ra="${x.id}"><div class="rih"><i class="rnc0"></i><button class="rnl" data-act="lrGo" data-art="${x.id}">${lrItemLab(d, x)}</button>${lb(x.id)}${markOf(d.id, x.id) ? ic('bookmark') : ''}</div></div>`).join('')}</div>` : ''}</div>`;
  };
  const node = (n, lvl) => {
    const k = tkOf(d, n.path), st = LF.open[k], open = st === undefined ? (!many || (lvl === 0 && tree.kids.length === 1)) : st;
    const items = n.arts.filter(a => !a.k), empty = !items.length && !n.kids.length;
    return `<div class="rn lv${Math.min(lvl, 3)} ${open ? 'open' : ''}" data-tk="${esc(k)}" data-path="${esc(n.path)}"><div class="rnh">${empty ? '<i class="rnc0"></i>' : `<button class="rnc" data-act="lrTog" data-k="${esc(k)}" aria-label="Развернуть">${ic('caret')}</button>`}<button class="rnl" data-act="lrGo" data-art="${first(n.path)}">${lrNodeLab(n.title)}</button></div>
      <div class="rnb">${items.map(item).join('')}${n.kids.map(x => node(x, lvl + 1)).join('')}</div></div>`;
  };
  return tree.arts.filter(a => !a.k).map(item).join('') + tree.kids.map(k => node(k, 0)).join('');
}
// --- текст ---
function lrBlock(d, a, words) {
  const mk = markOf(d.id, a.id), back = typeof backOf === 'function' ? backOf({ k: 'law', doc: d.id, art: a.id }) : [], bu = [];
  back.forEach(e => { if (!bu.some(x => rkey(x.from) === rkey(e.from))) bu.push(e); });
  let body = artBodyHtml(d, a, words);
  if (!a.k && d.unit === 'п') body = body.replace(/^<p class="([^"]*)">/, `<p class="$1"><b class="pn">${esc(a.n)}.</b> `);
  if (a.k === 'x' && !a.st) body = body.replace(/<p class="([^"]*)">([\s\S]*?)<\/p>/g, (m0, cl, h) => { const t = h.replace(/<[^>]+>/g, ''); return (isCaps(t) && t.length < 400) || /^от\s+\d{1,2}\s/.test(t) || /^[N№]\s*\d/.test(t) ? `<p class="${cl} c">${h}</p>` : m0; });
  if (a.k === 's') body = body.replace(/^<p class="([^"]*)">((?:<mark[^>]*>)?)([а-яё]|\d{1,2})\)/, '<p class="$1">$2<b class="pn">$3)</b>');
  const head = !a.k && d.unit !== 'п' ? `<h4 class="rah">Статья ${esc(a.n)}.${a.t ? ' ' + markWords(esc(a.t), words) : ''}</h4>` : '';
  const tools = a.k === 'x' ? '' : `<div class="rbt"><button class="ib sm ${mk ? 'on' : ''}" data-act="lawMark" data-doc="${d.id}" data-art="${a.id}" title="${mk ? 'Убрать из закладок' : 'В закладки'}">${ic('bookmark')}</button><button class="ib sm" data-act="lnkLaw" data-doc="${d.id}" data-art="${a.id}" title="Связать с задачей, заметкой или проектом">${ic('link')}</button><button class="ib sm" data-act="lawCopy" data-doc="${d.id}" data-art="${a.id}" title="Копировать с указанием документа">${ic('copy')}</button></div>`;
  return `<section class="rb k${a.k || 'a'} ${a.st ? 'stamp' : ''} ${LF.art === a.id ? 'tgt' : ''} ${mk ? 'marked' : ''}" id="ra-${a.id}" data-ra="${a.id}">${tools}${head}${body}
    ${mk ? `<div class="lmk"><textarea class="in" data-lnote="${mk.id}" rows="2" placeholder="Заметка к закладке: когда применять, на что обратить внимание">${esc(mk.note || '')}</textarea></div>` : ''}
    ${bu.length ? `<div class="rlinks"><span class="rlc" title="Связи">${ic('lnk')} ${bu.length}</span>${bu.map(e => { const inf = rinfo(e.from); return `<button class="chip lkc k-${e.from.k}" ${eAttr(e)} title="${esc(inf.label)} — ${fWhere(e)}. Перейти к месту ссылки">${rIcon(e.from)}${esc(inf.title.slice(0, 60))}</button>`; }).join('')}<button class="chip" data-act="lnkLaw" data-doc="${d.id}" data-art="${a.id}">${ic('plus')} Связь</button></div>` : ''}</section>`;
}
function lrBlocks(d, from, to) {
  const L = lawArts(d.id), out = [];
  let prev = from > 0 ? (L[from - 1].ch || '') : null;
  for (let i = from; i < to; i++) {
    const a = L[i], ch = a.ch || '';
    if (ch !== prev) {
      const A = prev == null ? [] : prev.split(' › ').filter(Boolean), B = ch.split(' › ').filter(Boolean);
      let k = 0; while (k < A.length && k < B.length && A[k] === B[k]) k++;
      for (let lv = k; lv < B.length; lv++) out.push(`<div class="rh h${Math.min(lv, 3)}" data-path="${esc(B.slice(0, lv + 1).join(' › '))}">${esc(sentCase(B[lv]))}</div>`);
      prev = ch;
    }
    out.push(lrBlock(d, a, LR.words));
  }
  return out.join('');
}
function lrWin(idx) {
  const L = lrL(), N = L.length; let from = Math.max(0, idx - 12);
  // начинаем с начала раздела, если он близко — тогда виден его заголовок
  const ch = (L[idx] || {}).ch; for (let i = idx; i >= Math.max(0, idx - 40); i--) { if (L[i].ch !== ch) break; from = i; }
  return [from, Math.min(N, Math.max(idx + 1, from) + 140)];
}
// --- вид документа (заменяет прежнее оглавление-список) ---
lawDocView = function (d) {
  const L = lawArts(d.id); document.body.classList.toggle('lawwide', !!D.settings.lawWide && !MOB());
  if (LR.doc !== d.id) { Object.assign(LR, { doc: d.id, words: null, hits: [], hi: -1, q: '', anchor: null, lastArt: undefined, toc: false }); }
  let target = 0, jump = false;
  if (LF.art && LF.art !== LR.lastArt) { const i = lrIdx(LF.art); if (i >= 0) { target = i; jump = true; } }
  else if (LR.anchor) { const i = lrIdx(LR.anchor.id); if (i >= 0) target = i; }
  LR.lastArt = LF.art; LR.jump = jump ? L[target].id : null;
  [LR.from, LR.to] = lrWin(target);
  const old = d.unit === 'п' && !d.v, many = L.length > 80;
  const cnt = unitsN(L), nm = d.unit === 'п' ? plural(cnt, ['пункт', 'пункта', 'пунктов']) : plural(cnt, ['статья', 'статьи', 'статей']);
  return `<div class="lread">
    <div class="lrhead">
      ${LF.back ? `<button class="back" data-act="lawBack">${ic('left')} ${LF.back === 'consult' ? 'К результатам консультации' : 'К результатам поиска'}</button>` : MOB() && LF.art ? `<button class="back" data-act="lawHome">${ic('left')} Все документы</button>` : ''}
      <div class="lrtitle"><h2>${esc(d.short || d.title)}</h2>${d.short ? `<p>${esc(d.title)}</p>` : ''}<small>${cnt} ${nm}${L.some(a => a.k === 's') ? ` · ${L.filter(a => a.k === 's').length} подпунктов` : ''}${d.rev ? ' · редакция от ' + d.rev.split('-').reverse().join('.') : ''}${d.checked ? ' · проверено ' + fmtTs(d.checked).replace(/, \d\d:\d\d$/, '') : ''}</small></div>
      <div class="lrtools">
        <button class="btn sm lrtocb" data-act="lrToc">${ic('toc')} Оглавление</button>
        ${MOB() ? '' : `<button class="ib sm" data-act="lrWide" title="${document.body.classList.contains('lawwide') ? 'Показать список документов' : 'Скрыть список документов — больше места для текста'}">${ic(document.body.classList.contains('lawwide') ? 'right' : 'left')}</button>`}
        <form class="lrfind" id="lrfind"><input class="in" id="lrq" value="${esc(LR.q)}" placeholder="Найти в документе" autocomplete="off" enterkeyhint="search"><span id="lrhits">${LR.hits.length ? `${LR.hi + 1} из ${LR.hits.length}` : LR.q ? 'нет' : ''}</span><button type="button" class="ib sm" data-act="lrHit" data-v="-1" title="Предыдущее" aria-label="Предыдущее">${ic('chup')}</button><button type="button" class="ib sm" data-act="lrHit" data-v="1" title="Следующее" aria-label="Следующее">${ic('chdn')}</button></form>
        <div class="lrfs"><button class="ib sm" data-act="lrFs" data-v="-1" title="Мельче">A−</button><button class="ib sm" data-act="lrFs" data-v="1" title="Крупнее">A+</button></div>
        <button class="btn sm" data-act="lawCheck" data-doc="${d.id}">${ic('ext')} Проверить редакцию</button>
        ${d.url ? `<button class="btn sm ghost" data-act="lawOpenSite" data-id="${d.id}">${ic('ext')} На сайте</button>` : ''}
        <button class="btn sm ghost" data-act="lawEdit" data-doc="${d.id}">${ic('edit')} Свойства</button>
      </div>
      ${old ? `<div class="lrold">${ic('bulb')}<span>Документ разобран прежним способом: подпункты не выделены, а текст без номеров пунктов мог не сохраниться. Загрузите его заново — структура станет как на портале.</span><button class="btn sm pri" data-act="lrReparse" data-doc="${d.id}">${ic('sync')} Загрузить заново</button></div>` : ''}
    </div>
    <div class="lrd ${LR.toc ? 'tocopen' : ''}">
      <aside class="lrtoc"><div class="lrtoch"><input class="in" id="lrtq" placeholder="Поиск по оглавлению" autocomplete="off"><div><button class="lnk" data-act="lrAll" data-v="1">Развернуть всё</button><button class="lnk" data-act="lrAll" data-v="0">Свернуть всё</button>${MOB() ? `<button class="ib sm" data-act="lrToc" aria-label="Закрыть">${ic('x')}</button>` : ''}</div></div>
        <div class="lrtocb2" id="lrtoc">${lrTocHtml(d)}</div></aside>
      <div class="lrtxt" id="lrtxt" style="--lfs:${lawFs()}"><div class="lrs" data-s="-1"></div><div class="rdoc" id="rdoc">${lrBlocks(d, LR.from, LR.to)}</div><div class="lrs" data-s="1"></div>
        ${LR.to >= L.length ? `<p class="hint lrend">${d.rev ? 'Текст в редакции от ' + d.rev.split('-').reverse().join('.') + '. ' : ''}Конец документа.</p>` : ''}</div>
    </div></div>`;
};
// --- после показа: прокрутка к месту, подгрузка соседних частей, подсветка в оглавлении ---
function lrAfter() {
  const box = $('#lrtxt'); if (!box) { if (LR.io) { LR.io.disconnect(); LR.io = null; } return; }
  const go = LR.jump || (LR.anchor && LR.anchor.id);
  if (go) { const el = $('#ra-' + go); if (el) { box.scrollTop = el.offsetTop - box.offsetTop - (LR.jump ? 12 : (LR.anchor.off || 0)); if (LR.jump) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); } } }
  LR.jump = null;
  if (LR.io) LR.io.disconnect();
  LR.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) lrMore(+e.target.dataset.s); }), { root: box, rootMargin: '900px 0px' });
  $$('.lrs', box).forEach(s => LR.io.observe(s));
  box.onscroll = () => { if (!LR.spyT) LR.spyT = requestAnimationFrame(() => { LR.spyT = 0; lrSpy(); }); };
  lrSpy(true);
}
function lrMore(dir) {
  const d = lawDoc(LR.doc), box = $('#lrtxt'), docEl = $('#rdoc'); if (!d || !box || !docEl) return;
  const N = lrL().length;
  if (dir > 0 && LR.to < N) { const to = Math.min(N, LR.to + 120); docEl.insertAdjacentHTML('beforeend', lrBlocks(d, LR.to, to)); LR.to = to; if (to >= N) box.insertAdjacentHTML('beforeend', `<p class="hint lrend">Конец документа.</p>`); }
  if (dir < 0 && LR.from > 0) {
    const from = Math.max(0, LR.from - 80), h0 = box.scrollHeight, t0 = box.scrollTop;
    docEl.insertAdjacentHTML('afterbegin', lrBlocks(d, from, LR.from));
    LR.from = from; box.scrollTop = t0 + (box.scrollHeight - h0);
  }
}
function lrTop() {
  const box = $('#lrtxt'); if (!box) return null; const r = box.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + Math.min(120, r.width / 3), r.top + 30), b = el && el.closest && el.closest('.rb');
  if (b) return b;
  const all = $$('.rb', box); return all.find(x => x.getBoundingClientRect().bottom > r.top + 30) || null;
}
function lrSpy(first) {
  const b = lrTop(), box = $('#lrtxt'); if (!b || !box) return;
  const id = b.dataset.ra; LR.anchor = { id, off: b.getBoundingClientRect().top - box.getBoundingClientRect().top };
  const toc = $('#lrtoc'); if (!toc) return;
  const a = lawArt(LR.doc, id); if (!a) return;
  const target = a.k === 'x' ? null : (a.k === 's' ? id : id);
  let el = target && toc.querySelector(`.ri[data-ra="${target}"]`);
  if (!el && a.ch) el = toc.querySelector(`.rn[data-path="${CSS.escape(a.ch)}"]`);
  const cur = toc.querySelector('.cur'); if (cur === el) return; if (cur) cur.classList.remove('cur');
  if (!el) return; el.classList.add('cur');
  for (let p = el.parentElement; p && p !== toc; p = p.parentElement) if ((p.classList.contains('rn') || p.classList.contains('ri')) && p !== el && !p.classList.contains('open')) { p.classList.add('open'); if (p.dataset.tk) LF.open[p.dataset.tk] = true; }
  if (!toc.matches(':hover')) { const rh = el.querySelector('.rih,.rnh') || el, tr = toc.getBoundingClientRect(), er = rh.getBoundingClientRect(); if (er.top < tr.top + 4 || er.bottom > tr.bottom - 4) toc.scrollTop += er.top - tr.top - tr.height / 3; }
}
function lrJump(id) {
  const d = lawDoc(LR.doc); if (!d || !id) return; const i = lrIdx(id); if (i < 0) return;
  const box = $('#lrtxt');
  if (i < LR.from || i >= LR.to || !$('#ra-' + id)) { [LR.from, LR.to] = lrWin(i); $('#rdoc').innerHTML = lrBlocks(d, LR.from, LR.to); $$('.lrend', box).forEach(x => x.remove()); if (LR.to >= lrL().length) box.insertAdjacentHTML('beforeend', '<p class="hint lrend">Конец документа.</p>'); }
  const el = $('#ra-' + id); if (!el) return;
  // если это первый блок раздела — показываем и заголовок раздела
  let top = el; for (let p = el.previousElementSibling; p && p.classList.contains('rh'); p = p.previousElementSibling) top = p;
  box.scrollTop = top.offsetTop - box.offsetTop - 8;
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
  if (LR.toc && MOB()) { LR.toc = false; $('.lrd').classList.remove('tocopen'); }
  lrSpy();
}
// --- поиск в документе ---
function lrFind(q) {
  LR.q = q; const ws = lnorm(q).split(/[^a-zа-я0-9]+/).filter(w => w.length > 1).map(w => w.length > 5 ? w.slice(0, w.length - 2) : w);
  LR.words = ws.length ? ws : null; LR.hits = []; LR.hi = -1;
  if (LR.words) lrL().forEach((a, i) => { const s = lnorm(a.n + ' ' + a.t + ' ' + a.body); if (ws.every(w => s.includes(w))) LR.hits.push(i); });
  const d = lawDoc(LR.doc), box = $('#lrtxt'), anchorIdx = LR.anchor ? lrIdx(LR.anchor.id) : 0;
  if (LR.hits.length) { LR.hi = Math.max(0, LR.hits.findIndex(i => i >= anchorIdx)); }
  $('#lrhits').textContent = LR.hits.length ? `${LR.hi + 1} из ${LR.hits.length}` : LR.q ? 'нет' : '';
  if (LR.hits.length) { $('#rdoc').innerHTML = ''; LR.from = LR.to = -1; lrJump(lrL()[LR.hits[LR.hi]].id); }
  else if (d && box) { $('#rdoc').innerHTML = lrBlocks(d, LR.from, LR.to); }
}
document.addEventListener('submit', e => { if (e.target.id === 'lrfind') { e.preventDefault(); e.stopImmediatePropagation(); const v = $('#lrq').value.trim(); if (v === LR.q && LR.hits.length) ACT.lrHit({ dataset: { v: '1' } }); else lrFind(v); } }, true);
document.addEventListener('input', e => {
  if (e.target.id === 'lrq' && !e.target.value.trim() && LR.q) lrFind('');
  if (e.target.id === 'lrtq') {
    const q = lnorm(e.target.value.trim()), toc = $('#lrtoc'); if (!toc) return;
    toc.classList.toggle('filtering', !!q);
    $$('.ri,.rn', toc).forEach(x => { x.classList.remove('hit', 'hitp'); });
    if (!q) return;
    $$('.ri', toc).forEach(x => { const lab = x.querySelector('.rnl'); if (lab && lnorm(lab.textContent).includes(q)) { x.classList.add('hit'); for (let p = x.parentElement; p && p !== toc; p = p.parentElement) if (p.classList.contains('rn') || p.classList.contains('ri')) p.classList.add('hitp'); } });
    $$('.rn', toc).forEach(x => { const lab = x.querySelector(':scope > .rnh .rnl'); if (lab && lnorm(lab.textContent).includes(q)) { x.classList.add('hit'); for (let p = x.parentElement; p && p !== toc; p = p.parentElement) if (p.classList.contains('rn')) p.classList.add('hitp'); } });
  }
});
Object.assign(ACT, {
  lrGo: b => lrJump(b.dataset.art),
  lrTog: b => { const el = b.closest('.ri,.rn'), on = !el.classList.contains('open'); el.classList.toggle('open', on); LF.open[b.dataset.k] = on; },
  lrAll: b => { const on = b.dataset.v === '1'; $$('#lrtoc .rn, #lrtoc .ri.has').forEach(x => { x.classList.toggle('open', on); if (x.dataset.tk) LF.open[x.dataset.tk] = on; }); },
  lrWide: () => { const on = !document.body.classList.contains('lawwide'); document.body.classList.toggle('lawwide', on); D.settings.lawWide = on; save(); render(); },
  lrToc: () => { LR.toc = !LR.toc; const el = $('.lrd'); if (el) el.classList.toggle('tocopen', LR.toc); },
  lrFs: b => { D.settings.lawFs = Math.round(Math.min(1.6, Math.max(0.8, lawFs() + 0.1 * +b.dataset.v)) * 10) / 10; save(); const box = $('#lrtxt'); if (box) box.style.setProperty('--lfs', lawFs()); },
  lrHit: b => { if (!LR.hits.length) { const v = $('#lrq') && $('#lrq').value.trim(); if (v) lrFind(v); return; } LR.hi = (LR.hi + +b.dataset.v + LR.hits.length) % LR.hits.length; $('#lrhits').textContent = `${LR.hi + 1} из ${LR.hits.length}`; lrJump(lrL()[LR.hits[LR.hi]].id); },
  lrReparse: async b => {
    const d = lawDoc(b.dataset.doc); if (!d) return;
    const done = async (txt, how) => { const p = lawParse(txt); if (!p.arts.length) throw new Error('в тексте не нашлось пунктов'); await lawApplyReplace(d, p, { rev: p.rev || d.rev }); LR.doc = null; save(); render(); toast(`Документ перестроен${how}: ${unitsN(p.arts)} ${d.unit === 'п' ? plural(unitsN(p.arts), ['пункт', 'пункта', 'пунктов']) : plural(unitsN(p.arts), ['статья', 'статьи', 'статей'])}${p.arts.some(a => a.k === 's') ? ', подпункты выделены' : ''}`); };
    try {
      const rec = await lawDB.get(d.id).catch(() => null);
      if (rec && rec.raw && rec.raw.length > 200) return await done(rec.raw, '');
      if (d.url && hasApi && window.api.netGet) { toast('Загружаю документ с сайта…'); return await done(await lawFromUrl(d.url, () => {}), ' по ссылке'); }
      toast('Исходного текста нет — выберите файл или вставьте текст заново'); lawAddForm(d.id);
    } catch (e) { toast('Не получилось: ' + ((e && e.message) || e)); }
  }
});
// подключаем к модулю: запоминаем место перед перерисовкой и восстанавливаем после
(() => {
  const m = MODULES.find(x => x.id === 'law'); if (!m) return;
  const after = m.after, before = m.before;
  m.before = function () { if ($('#lrtxt')) { lrSpy(); LR.tocTop = ($('#lrtoc') || {}).scrollTop; } if (before) before.call(this); };
  m.after = function () { if (after) after.call(this); lrAfter(); const t = $('#lrtoc'); if (t && LR.tocTop) t.scrollTop = LR.tocTop; };
})();
// закладка из ленты — перерисовываем только этот блок
const _lawMark = ACT.lawMark;
ACT.lawMark = b => {
  const el = b.closest && b.closest('.rb');
  if (!el || sheetOpen()) return _lawMark(b);
  const ex = markOf(b.dataset.doc, b.dataset.art); if (ex) LW().marks = LW().marks.filter(m => m !== ex); else LW().marks.push({ id: uid(), doc: b.dataset.doc, art: b.dataset.art, note: '', at: Date.now() });
  save(); const d = lawDoc(b.dataset.doc), a = lawArt(b.dataset.doc, b.dataset.art); el.outerHTML = lrBlock(d, a, LR.words);
  const ti = $(`#lrtoc .ri[data-ra="${a.id}"] .rih`); if (ti) { ti.querySelectorAll(':scope > svg').forEach(x => x.remove()); if (!ex) ti.insertAdjacentHTML('beforeend', ic('bookmark')); }
  toast(ex ? 'Убрано из закладок' : 'Добавлено в закладки');
};
