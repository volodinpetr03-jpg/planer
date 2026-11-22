'use strict';
// ============================================================
//  Связи: задача ↔ заметка ↔ статья/пункт закона ↔ проект.
//  1) блок «Связи» (+ Связь) у задачи, заметки, проекта и у пункта закона;
//  2) ссылки в тексте: [[…]] с подсказкой и автоматическое распознавание «п. 2 Пост. 2188», «ст. 80 323-ФЗ».
//  Связи двусторонние; из «Ссылаются сюда» можно перейти прямо к ссылающемуся фрагменту.
// ============================================================
ICONS.lnk = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';
const RKI = { task: ['✓', 'var(--ok)'], note: ['✎', 'var(--mid)'], proj: ['▣', '#EC4899'], law: ['§', 'var(--acc)'], cont: ['☺', '#14b8a6'] };
const rkey = r => !r ? '' : r.k === 'law' ? `law:${r.doc}/${r.art}` : `${r.k}:${r.id}`;
const rparse = k => { const m = String(k || '').match(/^(task|note|proj|law|cont):(.+)$/); if (!m) return null; if (m[1] === 'law') { const [doc, art] = m[2].split('/'); return { k: 'law', doc, art }; } return { k: m[1], id: m[2] }; };
const rsame = (a, b) => rkey(a) === rkey(b);
// что это за объект
function rinfo(r) {
  if (!r) return null;
  if (r.k === 'task') { const t = byId(r.id); return t && !t.archived ? { title: t.title, label: 'задача: ' + t.title, sub: isDone(t) ? 'выполнена' : t.date ? dueTxt(t) : 'без даты', done: isDone(t) } : null; }
  if (r.k === 'note') { const n = typeof noteOf === 'function' && noteOf(r.id); return n ? { title: noteTitle(n), label: 'заметка: ' + noteTitle(n), sub: 'заметка' } : null; }
  if (r.k === 'proj') { const p = projOf(r.id); return p ? { title: p.title, label: 'проект: ' + p.title, sub: 'проект' } : null; }
  if (r.k === 'cont') { const c = typeof crmOf === 'function' && crmOf(r.id); return c ? { title: c.name, label: 'клиент: ' + c.name, sub: crmSub(c) || (c.kind === 'org' ? 'организация' : 'контакт') } : null; }
  if (r.k === 'law') { const d = lawDoc(r.doc), a = d && lawArt(r.doc, r.art); return a ? { title: artLabel(d, a), label: artLabel(d, a), sub: a.k === 'x' ? d.title : (a.t || d.title) } : d ? { title: d.short || d.title, label: d.short || d.title, sub: 'статья не найдена в текущей редакции' } : null; }
  return null;
}
function ropen(r) {
  if (!r) return;
  if (r.k === 'task') { closeSheet(); openTaskForm(r.id); }
  else if (r.k === 'note') { closeSheet(); ACT.noteOpen({ dataset: { id: r.id } }); }
  else if (r.k === 'proj') { closeSheet(); ACT.openProject({ dataset: { id: r.id } }); }
  else if (r.k === 'cont') { closeSheet(); ACT.crmOpen({ dataset: { id: r.id } }); }
  else if (r.k === 'law') lawLoad().then(() => { closeSheet(); closeModal(); if (!lawArt(r.doc, r.art)) return toast('Этого пункта нет в вашей библиотеке'); LF.back = null; LF.hl = null; ACT.lawOpen({ dataset: { doc: r.doc, art: r.art } }); });
}
// --- явные связи объекта (хранятся у задачи, заметки или проекта) ---
const srcObj = s => s.k === 'task' ? (UI.form && UI.form.kind === 'task' && UI.form.t.id === s.id ? UI.form.t : byId(s.id)) : s.k === 'note' ? noteOf(s.id) : s.k === 'proj' ? projOf(s.id) : s.k === 'cont' && typeof crmOf === 'function' ? crmOf(s.id) : null;
function srcRefs(s, o) {
  o = o || srcObj(s); if (!o) return [];
  const out = [];
  if (s.k === 'task') (o.laws || []).forEach(l => out.push({ k: 'law', doc: l.doc, art: l.art }));
  if (s.k === 'note' && o.task) out.push({ k: 'task', id: o.task });
  (o.links || []).forEach(r => { if (!out.some(x => rsame(x, r))) out.push(r); });
  return out;
}
function linkAdd(s, r, o) {
  o = o || srcObj(s); if (!o || rsame(s, r)) return false;
  if (srcRefs(s, o).some(x => rsame(x, r))) return false;
  if (s.k === 'task' && r.k === 'law') { const L = lawLink(r.doc, r.art); o.laws = [...(o.laws || []), L || { doc: r.doc, art: r.art, label: '' }]; }
  else o.links = [...(o.links || []), r.k === 'law' ? { k: 'law', doc: r.doc, art: r.art } : { k: r.k, id: r.id }];
  return true;
}
function linkDel(s, r, o) {
  o = o || srcObj(s); if (!o) return;
  if (s.k === 'task' && r.k === 'law') o.laws = (o.laws || []).filter(l => !(l.doc === r.doc && l.art === r.art));
  if (s.k === 'note' && r.k === 'task' && o.task === r.id) o.task = null;
  o.links = (o.links || []).filter(x => !rsame(x, r));
}
// --- ссылки в тексте ---
const RX_TOK = /\[\[([^\]\n]{1,200})\]\]/g;
let AUTO = null, AUTOsig = '';
function autoRx() {
  const docs = LW().docs, sig = docs.map(d => d.id + d.short + d.unit).join('|') + LAWC.size;
  if (AUTO && sig === AUTOsig) return AUTO;
  AUTOsig = sig;
  const U = '(?:(?:пп\\.|подп\\.|подпункт[а-яё]*)\\s*[«"]?([а-яё]|\\d{1,2})[»"]?\\)?\\s*)?(ст\\.|стать[а-яё]*|п\\.|пункт[а-яё]*)\\s*(\\d{1,4}(?:[.\\-]\\d{1,4})*(?:\\(\\d+\\))?)';
  const esr = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  AUTO = docs.map(d => {
    const sh = String(d.short || ''), alts = [];
    const num = sh.match(/(?:N|№)\s*([\dА-Яа-яA-Za-z/\-]+)$/); const fz = sh.match(/^(\d+-ФК?З)$/i);
    if (num) alts.push(`(?:(?:Пост\\.?|постановлени[а-яё]*|приказ[а-яё]*|указ[а-яё]*|распоряжени[а-яё]*|ПП(?:\\s*РФ)?)[^\\n\\d]{0,70}?(?:от\\s*[\\d.]+(?:\\s*г\\.)?\\s*)?)?(?:N|№)?\\s*${esr(num[1])}(?![\\dА-Яа-я])`);
    else if (fz) alts.push(`(?:(?:Федеральн[а-яё]*\\s+закон[а-яё]*)[^\\n\\d]{0,60}?)?(?:N|№)?\\s*${esr(fz[1])}(?![\\dА-Яа-я])`);
    else if (sh) alts.push(esr(sh.replace(/\s*РФ$/i, '')) + '(?:\\s*РФ)?(?![А-Яа-яЁё])');
    return alts.length ? { d, rx: new RegExp(U + '\\s*(?:' + alts.join('|') + ')', 'gi') } : null;
  }).filter(Boolean);
  return AUTO;
}
function lawFind(d, unitW, n, sub) {
  const L = lawArts(d.id), isArt = /^ст/i.test(unitW);
  if (isArt && d.unit !== 'ст') return null; if (!isArt && d.unit === 'ст') return null;
  const pts = L.filter(a => !a.k && a.n === n); if (!pts.length) return null;
  let a = pts[0];
  if (sub && d.unit === 'п') { const s = L.find(x => x.k === 's' && pts.some(p => p.id === x.par) && x.sub === sub); if (s) a = s; }
  return { k: 'law', doc: d.id, art: a.id };
}
function autoRefs(text) {
  const out = []; if (!text || !LAWC.size) return out;
  for (const { d, rx } of autoRx()) { rx.lastIndex = 0; let m; while ((m = rx.exec(text))) { const r = lawFind(d, m[2], m[3], m[1] ? m[1].toLowerCase() : null); if (r) out.push({ s: m.index, e: m.index + m[0].length, label: m[0], ref: r, auto: true }); if (m[0].length === 0) rx.lastIndex++; } }
  return out;
}
function resolveLabel(label) {
  const l = label.trim(), low = lnorm(l), pre = (p, list, get) => { if (!low.startsWith(p)) return null; const q = low.slice(p.length).trim(); const o = list.find(x => lnorm(get(x)) === q) || list.find(x => lnorm(get(x)).startsWith(q)); return o; };
  let o;
  if ((o = pre('задача:', live(), t => t.title))) return { k: 'task', id: o.id };
  if ((o = pre('заметка:', NT(), n => noteTitle(n)))) return { k: 'note', id: o.id };
  if ((o = pre('проект:', D.projects, p => p.title))) return { k: 'proj', id: o.id };
  if ((o = pre('клиент:', D.contacts || [], c => c.name))) return { k: 'cont', id: o.id };
  const a = autoRefs(l); if (a.length) return a[0].ref;
  // точная подпись пункта закона, как её вставляет подсказка
  for (const d of LW().docs) for (const x of lawArts(d.id)) if (lnorm(artLabel(d, x)) === low) return { k: 'law', doc: d.id, art: x.id };
  return null;
}
// все ссылки в тексте по порядку
function scanRefs(text, ment) {
  text = String(text || ''); const out = []; let m; RX_TOK.lastIndex = 0;
  while ((m = RX_TOK.exec(text))) { const lab = m[1]; out.push({ s: m.index, e: m.index + m[0].length, label: lab, ref: (ment && ment[lab]) || resolveLabel(lab), auto: false }); }
  autoRefs(text).forEach(a => { if (!out.some(t => a.s < t.e && a.e > t.s)) out.push(a); });
  return out.sort((a, b) => a.s - b.s);
}
// текст → html с кликабельными ссылками (fmt — исходное оформление: заметка, комментарий)
function refsHtml(raw, ment, fmt) {
  const items = scanRefs(raw, ment); if (!items.length) return fmt(raw);
  let s = '', p = 0; items.forEach((it, i) => { s += raw.slice(p, it.s) + '' + i + ''; p = it.e; }); s += raw.slice(p);
  return fmt(s).replace(/(\d+)/g, (m0, i) => { const it = items[+i], inf = it.ref && rinfo(it.ref); return `<a class="mref ${it.auto ? 'auto' : ''} ${inf ? '' : 'bad'} k-${it.ref ? it.ref.k : 'x'}" data-act="refGo" data-rk="${esc(rkey(it.ref))}" data-mi="${i}" title="${esc(inf ? inf.label + (inf.sub ? ' — ' + inf.sub : '') : 'Не найдено')}">${esc(it.label)}</a>`; });
}
// --- индекс связей: кто на что ссылается ---
let LIX = null, LIXt = 0;
function linkIndex() {
  if (LIX && Date.now() - LIXt < 400) return LIX;
  const E = [];
  const add = (from, to, f, mi, lab) => { if (to) E.push({ from, to, f, mi, lab }); };
  live().forEach(t => {
    const s = { k: 'task', id: t.id };
    srcRefs(s, t).forEach(r => add(s, r, 'link'));
    if (t.desc) scanRefs(t.desc, t.ment).forEach((it, i) => add(s, it.ref, 'desc', i, it.label));
    (t.comments || []).filter(c => !c.del).forEach(c => scanRefs(c.text, c.ment).forEach((it, i) => add(s, it.ref, 'cm:' + c.id, i, it.label)));
  });
  NT().forEach(n => { const s = { k: 'note', id: n.id }; srcRefs(s, n).forEach(r => add(s, r, 'link')); if (n.body) scanRefs(n.body, n.ment).forEach((it, i) => add(s, it.ref, 'body', i, it.label)); });
  D.projects.forEach(p => { const s = { k: 'proj', id: p.id }; (p.links || []).forEach(r => add(s, r, 'link')); });
  (D.contacts || []).forEach(c => { const s = { k: 'cont', id: c.id }; (c.links || []).forEach(r => add(s, r, 'link')); });
  LIX = E; LIXt = Date.now(); return E;
}
const backOf = r => { const k = rkey(r); return linkIndex().filter(e => rkey(e.to) === k && rkey(e.from) !== k && rinfo(e.from)); };
const outOf = s => { const k = rkey(s); return linkIndex().filter(e => rkey(e.from) === k); };
const fWhere = e => e.f === 'link' ? 'связь' : e.f === 'desc' ? 'в описании' : e.f === 'body' ? 'в тексте заметки' : e.f.startsWith('cm:') ? 'в комментарии' : '';
const eAttr = e => `data-act="edgeGo" data-src="${esc(rkey(e.from))}" data-to="${esc(rkey(e.to))}" data-f="${esc(e.f)}" data-mi="${e.mi == null ? '' : e.mi}"`;
const rIcon = r => `<i class="lki" style="--c:${(RKI[r.k] || RKI.task)[1]}">${(RKI[r.k] || RKI.task)[0]}</i>`;
// --- блок «Связи» ---
function linksBlock(s, o) {
  const refs = srcRefs(s, o), back = s.k === 'task' && UI.form && UI.form.isNew ? [] : backOf(s).filter(e => !(s.k === 'cont' && e.from.k === 'task')); // у клиента задачи и так видны в карточке
  const txt = s.k === 'task' ? scanRefs(o.desc || '', o.ment) : [];
  const backU = []; back.forEach(e => { if (!backU.some(x => rsame(x.from, e.from) && x.f === e.f && x.mi === e.mi)) backU.push(e); });
  const row = (r, rm) => { const inf = rinfo(r); return `<div class="lkrow ${inf ? '' : 'bad'} ${inf && inf.done ? 'dn' : ''}" data-rk="${esc(rkey(r))}">${rIcon(r)}<button type="button" class="tx" data-act="refGo" data-rk="${esc(rkey(r))}"><b>${esc(inf ? inf.label : 'Объект удалён')}</b><small>${esc(inf ? inf.sub || '' : '')}</small></button>${rm ? `<button type="button" class="ib sm" data-act="lnkDel" data-src="${esc(rkey(s))}" data-rk="${esc(rkey(r))}" title="Убрать связь" aria-label="Убрать связь">${ic('x')}</button>` : ''}</div>`; };
  return `<div class="f lkw" id="lkbox" data-src="${esc(rkey(s))}"><span>${ic('lnk')} Связи${refs.length ? ' · ' + refs.length : ''} <em>— с задачами, заметками, клиентами, законами и проектами</em></span>
    ${refs.map(r => row(r, true)).join('')}
    <button type="button" class="lkadd" data-act="lnkAdd" data-src="${esc(rkey(s))}">${ic('plus')} Связь</button> <span class="hint lkhint">или наберите <b>[[</b> в тексте</span>
    ${txt.length ? `<div class="lksub"><span>В описании:</span>${txt.map(it => `<button type="button" class="chip ${it.ref ? '' : 'bad'}" data-act="refGo" data-rk="${esc(rkey(it.ref))}">${it.ref ? rIcon(it.ref) : ''}${esc(it.label)}</button>`).join('')}</div>` : ''}
    ${backU.length ? `<div class="lkback"><span>Ссылаются сюда · ${backU.length}</span>${backU.map(e => { const inf = rinfo(e.from); return `<div class="lkrow back">${rIcon(e.from)}<button type="button" class="tx" ${eAttr(e)} title="Перейти к месту ссылки"><b>${esc(inf.label)}</b><small>${fWhere(e)}${e.lab ? ': «' + esc(e.lab.slice(0, 60)) + '»' : ''}</small></button><span class="lkgo">${ic('right')}</span></div>`; }).join('')}</div>` : ''}
  </div>`;
}
const lkBox = () => $('#modal.open #lkbox') || $('#lkbox');
function drawLk() { const b = lkBox(); if (!b) return; const s = rparse(b.dataset.src), o = srcObj(s); if (o) b.outerHTML = linksBlock(s, o); }
// --- окно выбора «+ Связь» ---
const LKP = { tab: 'all', q: '', on: null, kinds: null, ex: null };
function refSearch(q, kinds, limit = 30) {
  const L = lnorm(q.trim()), out = [], has = k => !kinds || kinds.includes(k);
  if (has('law') && L) {
    const ws = L.split(/\s+/).filter(Boolean), byLab = [];
    LW().docs.forEach(d => lawArts(d.id).forEach(a => { if (a.k === 'x' || byLab.length > 40) return; const lab = lnorm(artLabel(d, a)); if (ws.every(w => lab.includes(w))) byLab.push({ k: 'law', doc: d.id, art: a.id }); }));
    const isRef = RX_REF.test(q.trim());
    if (!isRef) byLab.slice(0, 10).forEach(r => out.push(r));
    if (isRef || byLab.length < 4) lawSearch(q, 12).forEach(r => { out.push({ k: 'law', doc: r.d.id, art: r.a.id }); if (r.exact && r.a.k !== 's') lawArts(r.d.id).filter(x => x.k === 's' && x.par === r.a.id).slice(0, 8).forEach(x => out.push({ k: 'law', doc: r.d.id, art: x.id })); });
    if (isRef) byLab.slice(0, 6).forEach(r => out.push(r));
  }
  if (has('task')) live().filter(t => !L || lnorm(t.title).includes(L)).sort((a, b) => isDone(a) - isDone(b) || (b.created || 0) - (a.created || 0)).slice(0, L ? 12 : 8).forEach(t => out.push({ k: 'task', id: t.id }));
  if (has('note')) NT().filter(n => !L || lnorm(n.title + ' ' + n.body).includes(L)).sort((a, b) => b.upd - a.upd).slice(0, L ? 10 : 5).forEach(n => out.push({ k: 'note', id: n.id }));
  if (has('cont')) (D.contacts || []).filter(c => !c.archived && (!L || lnorm(c.name + ' ' + (c.role || '') + ' ' + (c.phones || []).join(' ')).includes(L))).slice(0, L ? 10 : 5).forEach(c => out.push({ k: 'cont', id: c.id }));
  if (has('proj')) D.projects.filter(p => p.status !== 'archived' && (!L || lnorm(p.title).includes(L))).slice(0, 6).forEach(p => out.push({ k: 'proj', id: p.id }));
  const sc = r => r.k === 'law' ? 0 : 1;
  const seen = new Set(); return out.filter(r => { const k = rkey(r); if (seen.has(k)) return false; seen.add(k); return true; }).filter(r => !LKP.ex || !LKP.ex.includes(rkey(r))).sort((a, b) => L && a.k === 'law' && b.k !== 'law' ? -1 : 0).slice(0, limit);
}
function lnkPick(onPick, opts = {}) {
  Object.assign(LKP, { tab: 'all', q: '', on: onPick, kinds: opts.kinds || null, ex: opts.ex || null });
  lawLoad();
  const T = [['all', 'Всё'], ['task', 'Задачи'], ['note', 'Заметки'], ['cont', 'Клиенты'], ['law', 'Законы'], ['proj', 'Проекты']].filter(([k]) => k === 'all' || !LKP.kinds || LKP.kinds.includes(k));
  sheet(`<div class="lpick"><div class="shh"><b>${esc(opts.title || 'Связать с…')}</b><small>${esc(opts.sub || 'задача, заметка, статья или пункт закона, проект')}</small></div>
    <input class="in" id="lkq" placeholder="Название задачи или заметки, «п. 5 2188», «ст. 80 323-ФЗ»…" autocomplete="off">
    <div class="chips lktabs">${T.map(([k, l]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-act="lnkTab" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="lpr" id="lkr"></div></div>`);
  lnkDraw(); setTimeout(() => { const i = $('#lkq'); if (i) i.focus(); }, 60);
}
function lnkDraw() {
  const el = $('#lkr'); if (!el) return;
  const kinds = LKP.tab === 'all' ? LKP.kinds : [LKP.tab];
  const R = refSearch(LKP.q, kinds);
  el.innerHTML = R.map(r => { const inf = rinfo(r); return inf ? `<button class="lres lkres" data-act="lnkPicked" data-rk="${esc(rkey(r))}">${rIcon(r)}<span><b>${esc(inf.label)}</b><small>${esc(inf.sub || '')}</small></span></button>` : ''; }).join('') || `<p class="hint" style="padding:.6rem">${LKP.q ? 'Ничего не найдено' : 'Начните вводить название'}</p>`;
}
document.addEventListener('input', e => { if (e.target.id === 'lkq') { LKP.q = e.target.value; lawLoad().then(lnkDraw); } });
// --- подсказка [[ в полях текста ---
const MTA = ['n-body', 'f-desc', 'cm-in'];
const MD = { el: null, ta: null, items: [], sel: 0, from: 0 };
function mddClose() { if (MD.el) MD.el.remove(); MD.el = null; MD.ta = null; }
function mddShow(ta, q, from) {
  lawLoad();
  MD.ta = ta; MD.from = from; MD.items = refSearch(q, null, 8).filter(r => rinfo(r)); MD.sel = 0;
  if (!MD.el) { MD.el = document.createElement('div'); MD.el.className = 'mdd'; document.body.appendChild(MD.el); }
  const r = ta.getBoundingClientRect(), below = window.innerHeight - r.bottom > 240;
  Object.assign(MD.el.style, { left: Math.max(8, Math.min(r.left, window.innerWidth - 380)) + 'px', width: Math.min(380, r.width) + 'px', top: below ? (r.bottom + 4) + 'px' : '', bottom: below ? '' : (window.innerHeight - r.top + 4) + 'px' });
  MD.el.innerHTML = `<div class="mddh">Ссылка: ${q ? '«' + esc(q) + '»' : 'начните вводить'} · ↑↓ Enter</div>` + (MD.items.map((x, i) => { const inf = rinfo(x); return `<button type="button" class="${i === MD.sel ? 'on' : ''}" data-mdi="${i}">${rIcon(x)}<span><b>${esc(inf.label)}</b><small>${esc(inf.sub || '')}</small></span></button>`; }).join('') || '<p class="hint">Ничего не найдено</p>');
}
function mddPick(i) {
  const ta = MD.ta, r = MD.items[i]; if (!ta || !r) return mddClose();
  const inf = rinfo(r), lab = inf.label.replace(/[\[\]\n]/g, ' ').slice(0, 180), pos = ta.selectionStart;
  ta.setRangeText(`[[${lab}]]`, MD.from, pos, 'end');
  // запоминаем, на что именно указывает подпись
  if (ta.id === 'n-body') { const n = noteOf(NOF.open); if (n) n.ment = { ...(n.ment || {}), [lab]: r }; }
  if (ta.id === 'f-desc' && UI.form && UI.form.t) UI.form.t.ment = { ...(UI.form.t.ment || {}), [lab]: r };
  if (ta.id === 'cm-in') UI.cmMent = { ...(UI.cmMent || {}), [lab]: r };
  mddClose(); ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
}
document.addEventListener('input', e => {
  const ta = e.target; if (!MTA.includes(ta.id)) return;
  const pos = ta.selectionStart, before = ta.value.slice(Math.max(0, pos - 80), pos), m = before.match(/\[\[([^\]\n]{0,60})$/);
  if (m) mddShow(ta, m[1], pos - m[0].length); else if (MD.ta === ta) mddClose();
  if (ta.id === 'f-desc') drawDescRefs();
});
window.addEventListener('keydown', e => {
  if (!MD.el || e.target !== MD.ta) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); MD.sel = (MD.sel + (e.key === 'ArrowDown' ? 1 : -1) + MD.items.length) % Math.max(1, MD.items.length); $$('.mdd button').forEach((b, i) => b.classList.toggle('on', i === MD.sel)); return; }
  if (e.key === 'Enter' || e.key === 'Tab') { if (!MD.items.length) return; e.preventDefault(); e.stopImmediatePropagation(); mddPick(MD.sel); return; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); mddClose(); }
}, true);
document.addEventListener('mousedown', e => { if (!MD.el) return; const b = e.target.closest && e.target.closest('.mdd button'); if (b) { e.preventDefault(); mddPick(+b.dataset.mdi); } else if (!e.target.closest || !e.target.closest('.mdd')) mddClose(); }, true);
function drawDescRefs() {
  const b = lkBox(); if (!b || !UI.form || UI.form.kind !== 'task') return;
  UI.form.t.desc = ($('#f-desc') || {}).value || ''; clearTimeout(MD.dt); MD.dt = setTimeout(drawLk, 350);
}
// --- переход к месту ссылки ---
function flashEl(el) { if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('lkflash'); setTimeout(() => el.classList.remove('lkflash'), 1800); }
function edgeGo(src, toKey, f, mi) {
  const s = rparse(src); if (!s) return; closeSheet();
  const after = fn => setTimeout(fn, 120);
  if (s.k === 'task') {
    openTaskForm(s.id);
    after(() => {
      if (f === 'desc') { const ta = $('#f-desc'), it = ta && scanRefs(ta.value, (UI.form.t || {}).ment)[mi]; if (ta && it) { ta.focus(); ta.setSelectionRange(it.s, it.e); ta.scrollIntoView({ block: 'center' }); ta.classList.add('lkflash'); setTimeout(() => ta.classList.remove('lkflash'), 1800); } return; }
      if (f.startsWith('cm:')) { const el = $(`.cm[data-cid="${f.slice(3)}"]`); if (el) { flashEl(el); const m = el.querySelectorAll('.mref')[mi]; if (m) m.classList.add('lkflash'); } return; }
      flashEl((lkBox() || document).querySelector(`.lkrow[data-rk="${CSS.escape(toKey)}"]`));
    });
  } else if (s.k === 'note') {
    NOF.open = s.id; NOF.edit = false; closeModal(); if (UI.view !== 'notes') go('notes'); else render();
    after(() => { if (f === 'body') { const m = $$('.nview .mref')[mi]; flashEl(m); } else flashEl((lkBox() || document).querySelector(`.lkrow[data-rk="${CSS.escape(toKey)}"]`)); });
  } else if (s.k === 'proj') {
    closeModal(); ACT.openProject({ dataset: { id: s.id } });
    after(() => flashEl((lkBox() || document).querySelector(`.lkrow[data-rk="${CSS.escape(toKey)}"]`)));
  } else if (s.k === 'cont') {
    closeModal(); ACT.crmOpen({ dataset: { id: s.id } });
    after(() => flashEl((lkBox() || document).querySelector(`.lkrow[data-rk="${CSS.escape(toKey)}"]`)));
  }
}
Object.assign(ACT, {
  refGo: b => { const ev = window.event; if (ev && ev.stopPropagation) ev.stopPropagation(); const r = rparse(b.dataset.rk); if (!r) return toast('Ссылка ни на что не указывает — проверьте подпись'); if (!rinfo(r)) return toast('Объект не найден — возможно, удалён'); if (r.k !== 'law' && UI.form && UI.form.kind === 'task' && r.k === 'task' && r.id === UI.form.t.id) return; if (UI.form && UI.form.kind === 'task' && !UI.form.isNew) saveTaskForm(true); ropen(r); },
  edgeGo: b => { if (UI.form && UI.form.kind === 'task' && !UI.form.isNew) saveTaskForm(true); edgeGo(b.dataset.src, b.dataset.to, b.dataset.f, +b.dataset.mi || 0); },
  lnkAdd: b => {
    const s = rparse(b.dataset.src), o = srcObj(s); if (!o) return;
    lnkPick(r => { if (linkAdd(s, r, o)) { if (s.k === 'task' && o !== byId(s.id) && byId(s.id)) linkAdd(s, r, byId(s.id)); save(); LIX = null; toast('Связь добавлена'); } else toast('Такая связь уже есть'); drawLk(); }, { ex: [rkey(s), ...srcRefs(s, o).map(rkey)] });
  },
  lnkDel: b => { const s = rparse(b.dataset.src), r = rparse(b.dataset.rk), o = srcObj(s); if (!o) return; linkDel(s, r, o); if (s.k === 'task' && o !== byId(s.id) && byId(s.id)) linkDel(s, r, byId(s.id)); save(); LIX = null; drawLk(); },
  lnkTab: b => { LKP.tab = b.dataset.v; $$('.lktabs .chip').forEach(x => x.classList.toggle('on', x === b)); lnkDraw(); },
  lnkPicked: b => { const r = rparse(b.dataset.rk), f = LKP.on; closeSheet(); if (f && r) f(r); },
  // «+ Связь» у пункта закона: связь хранится у выбранной задачи, заметки или проекта
  lnkLaw: b => {
    const r = { k: 'law', doc: b.dataset.doc, art: b.dataset.art }, inf = rinfo(r);
    lnkPick(t => { const s = t, o = srcObj(s); if (!o) return; if (linkAdd(s, r, o)) { save(); LIX = null; toast('Связь добавлена: ' + (rinfo(s) || {}).label); render(); } else toast('Такая связь уже есть'); }, { kinds: ['task', 'note', 'proj'], title: 'Связать ' + (inf ? inf.label : 'пункт'), sub: 'с задачей, заметкой или проектом' });
  }
});
// --- встраивание: задача ---
// блок «Правовая основа» в окне задачи заменяется общим блоком «Связи»
(() => {
  const o = openTaskForm;
  openTaskForm = function (...a) {
    const r = o.apply(this, a);
    const F = UI.form; if (!F || F.kind !== 'task') return r;
    const lw = $('#f-laws'), host = lw ? lw.closest('.f') : null, html = linksBlock({ k: 'task', id: F.t.id }, F.t);
    if (host) host.outerHTML = html; else { const d = $('#f-desc'); const lab = d && d.closest('label'); if (lab) lab.insertAdjacentHTML('afterend', html); }
    return r;
  };
})();
// комментарий запоминает, на что указывают его [[ссылки]]
(() => { const add = ACT.cmAdd; ACT.cmAdd = () => { const before = UI.form && byId(UI.form.t.id) ? (byId(UI.form.t.id).comments || []).length : 0; add(); const t = UI.form && byId(UI.form.t.id); if (t && UI.cmMent && (t.comments || []).length > before) { t.comments[t.comments.length - 1].ment = UI.cmMent; save(); } UI.cmMent = null; LIX = null; drawLk(); }; })();
// --- заметка ---
(() => {
  const md = mdRender, ed = noteEditor;
  let cur = null;
  mdRender = function (src) { return refsHtml(src, cur && cur.ment, md); };
  noteEditor = function (n) { cur = n; const h = ed(n); cur = null; return h.replace(/<\/div>\s*$/, `<div class="nlinks">${linksBlock({ k: 'note', id: n.id }, n)}</div></div>`); };
})();
// --- проект ---
(() => { if (typeof projNotesHtml !== 'function') return; const o = projNotesHtml; projNotesHtml = function (p) { return o(p) + `<section class="pan plinks" style="margin-bottom:1rem">${linksBlock({ k: 'proj', id: p.id }, p)}</section>`; }; })();
// библиотеку законов загружаем заранее — чтобы ссылки в тексте узнавались сразу
setTimeout(() => { if (typeof D !== 'undefined' && D && LW().docs.length) lawLoad().then(() => { LIX = null; AUTO = null; }); }, 2500);
