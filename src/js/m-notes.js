'use strict';
// ============================================================
//  Этап 6. Модуль «Заметки»: заголовки, списки, флажки; заметка ↔ задача; связь с проектами
// ============================================================
Object.assign(ICONS, {
  note: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M14.5 3.5V7.5h4M9 11h6M9 14.5h6M9 18h4"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 16v5"/>',
  bold: '<path d="M7.5 5h5.5a3.2 3.2 0 0 1 0 6.5H7.5zM7.5 11.5h6.3a3.3 3.3 0 0 1 0 6.5H7.5z"/>',
  ul: '<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10"/><circle cx="5" cy="6.5" r="1.1"/><circle cx="5" cy="12" r="1.1"/><circle cx="5" cy="17.5" r="1.1"/>',
  ol: '<path d="M10 6.5h10M10 12h10M10 17.5h10M4.5 5l1.2-.8V9M4 14.2c.3-.6 1-.9 1.6-.6.8.4.7 1.3 0 1.9L4 17h2.4"/>',
  chk: '<rect x="4" y="4.5" width="6" height="6" rx="1.2"/><path d="m5.3 7.6 1.3 1.3 2.2-2.6M13 7.5h7M4 15.5h6v6H4zM13 18.5h7"/>',
  quote: '<path d="M6 8.5h4v4.5H6zM6 13c0 2.3 1 3.5 3 4M14 8.5h4v4.5h-4zM14 13c0 2.3 1 3.5 3 4"/>'
});
const NOF = { open: null, q: '', proj: '', edit: false };
const NT = () => (D.notes = Array.isArray(D.notes) ? D.notes : []);
const noteOf = id => NT().find(n => n.id === id);
const newNote = o => ({ id: uid(), title: '', body: '', project: null, task: null, pinned: false, created: Date.now(), upd: Date.now(), ...o });
// --- разметка: # заголовки, - списки, 1. нумерация, - [ ] флажки, > цитата, **жирный**, *курсив*, `код`
function mdInline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function mdRender(src) {
  const L = String(src || '').split('\n'), out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  L.forEach((ln, i) => {
    let m;
    if ((m = ln.match(/^\s*[-*] \[( |x|х)\] (.*)$/i))) { if (list !== 'ul class="chl"') { close(); out.push('<ul class="chl">'); list = 'ul class="chl"'; } out.push(`<li class="${m[1] !== ' ' ? 'on' : ''}"><button type="button" class="nck" data-act="noteChk" data-l="${i}" aria-label="Отметить">${m[1] !== ' ' ? ic('check') : ''}</button><span>${mdInline(m[2])}</span></li>`); return; }
    if ((m = ln.match(/^\s*[-*•] (.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${mdInline(m[1])}</li>`); return; }
    if ((m = ln.match(/^\s*\d+[.)] (.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${mdInline(m[1])}</li>`); return; }
    close();
    if ((m = ln.match(/^(#{1,3}) (.*)$/))) out.push(`<h${m[1].length + 1}>${mdInline(m[2])}</h${m[1].length + 1}>`);
    else if ((m = ln.match(/^> ?(.*)$/))) out.push(`<blockquote>${mdInline(m[1])}</blockquote>`);
    else if (/^-{3,}$/.test(ln.trim())) out.push('<hr>');
    else if (!ln.trim()) out.push('<div class="nbr"></div>');
    else out.push(`<p>${mdInline(ln)}</p>`);
  });
  close(); return out.join('');
}
const notePlain = s => String(s || '').replace(/\[\[([^\]\n]+)\]\]/g, '$1').replace(/^#{1,3} /gm, '').replace(/^> ?/gm, '').replace(/^\s*[-*] \[( |x|х)\] /gim, '').replace(/^\s*[-*•] /gm, '• ').replace(/\*\*|`/g, '');
const noteSnippet = n => notePlain(n.body).replace(/\s+/g, ' ').trim().slice(0, 110);
const noteTitle = n => n.title || notePlain(n.body).split('\n').find(x => x.trim()) || 'Без названия';
const noteChecks = n => { const all = (n.body.match(/^\s*[-*] \[( |x|х)\] /gim) || []), d = all.filter(x => /\[(x|х)\]/i.test(x)).length; return { n: all.length, d }; };
function notesList() {
  const q = NOF.q.trim().toLowerCase();
  return NT().filter(n => !n.archived && (!NOF.proj || (NOF.proj === '_' ? !n.project : n.project === NOF.proj)) && (!q || (n.title + ' ' + n.body).toLowerCase().includes(q)))
    .sort((a, b) => (b.pinned - a.pinned) || b.upd - a.upd);
}
function noteCard(n) {
  const p = projOf(n.project), c = noteChecks(n);
  return `<button class="nc ${NOF.open === n.id ? 'on' : ''}" data-act="noteOpen" data-id="${n.id}" style="--c:${p ? p.color : 'var(--line2)'}">
    <b>${n.pinned ? ic('pin') : ''}${esc(noteTitle(n))}</b><span>${esc(noteSnippet(n)) || '<i>пусто</i>'}</span>
    <small>${fmtTs(n.upd).replace(/, \d\d:\d\d$/, '')}${p ? ' · ' + esc(p.title) : ''}${c.n ? ` · ${ic('chk')}${c.d}/${c.n}` : ''}${n.task && byId(n.task) ? ' · ' + ic('board') + 'задача' : ''}</small></button>`;
}
function noteEditor(n) {
  const p = projOf(n.project), t = n.task && byId(n.task);
  const TB = [['h1', 'Заголовок', '<b>H1</b>'], ['h2', 'Подзаголовок', '<b>H2</b>'], ['ul', 'Список', ic('ul')], ['ol', 'Нумерованный список', ic('ol')], ['chk', 'Флажок', ic('chk')], ['bold', 'Жирный', ic('bold')], ['quote', 'Цитата', ic('quote')]];
  return `<div class="ned" data-id="${n.id}">
    <div class="nbar">${MOB() ? `<button class="ib" data-act="noteBack" aria-label="К списку">${ic('left')}</button>` : ''}
      <div class="ntb">${NOF.edit ? TB.map(([k, l, h]) => `<button type="button" class="ib" data-act="noteFmt" data-v="${k}" title="${l}" aria-label="${l}">${h}</button>`).join('') : `<button class="btn sm" data-act="noteEdit">${ic('edit')} Изменить</button>`}</div>
      <span class="spacer"></span>
      ${NOF.edit ? `<button class="btn sm pri" data-act="noteDone">Готово</button>` : ''}
      <button class="ib ${n.pinned ? 'on' : ''}" data-act="notePin" title="${n.pinned ? 'Открепить' : 'Закрепить сверху'}">${ic('pin')}</button>
      <button class="ib" data-act="noteMore" title="Ещё">${ic('more')}</button></div>
    <div class="nmeta"><select class="in" id="n-proj" aria-label="Проект"><option value="">Без проекта</option>${D.projects.filter(x => x.status !== 'archived').map(x => `<option value="${x.id}" ${x.id === n.project ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
      ${t ? `<button class="chip" data-act="openTask" data-id="${t.id}">${ic('board')} ${esc(t.title.slice(0, 40))}</button>` : ''}<span class="hint">изменено ${fmtTs(n.upd)}</span></div>
    <input class="ntitle" id="n-title" value="${esc(n.title)}" placeholder="Заголовок" maxlength="160">
    ${NOF.edit ? `<textarea class="nbody" id="n-body" placeholder="Текст заметки. # заголовок, - список, 1. нумерация, - [ ] флажок, > цитата, **жирный**">${esc(n.body)}</textarea>`
      : `<div class="nview" data-act="noteEdit">${n.body.trim() ? mdRender(n.body) : '<p class="hint">Пустая заметка — нажмите, чтобы написать.</p>'}</div>`}
  </div>`;
}
let noteT = null;
function noteSaveSoon() { clearTimeout(noteT); noteT = setTimeout(() => { const n = noteOf(NOF.open); if (!n) return; save(); const c = $(`.nc[data-id="${n.id}"]`); if (c) c.outerHTML = noteCard(n); }, 500); }
document.addEventListener('input', e => {
  const n = noteOf(NOF.open); if (!n) return;
  if (e.target.id === 'n-title') { n.title = e.target.value; n.upd = Date.now(); noteSaveSoon(); }
  if (e.target.id === 'n-body') { n.body = e.target.value; n.upd = Date.now(); noteSaveSoon(); }
});
document.addEventListener('change', e => { if (e.target.id === 'n-proj') { const n = noteOf(NOF.open); if (!n) return; n.project = e.target.value || null; n.upd = Date.now(); save(); render(); } if (e.target.id === 'nproj') { NOF.proj = e.target.value; render(); } });
// Enter в списке продолжает список
document.addEventListener('keydown', e => {
  const ta = e.target; if (ta.id !== 'n-body' || e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return;
  const v = ta.value, s = ta.selectionStart, ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s), m = line.match(/^(\s*)([-*•] \[[ xх]\] |[-*•] |(\d+)([.)]) )/i);
  if (!m) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (line.trim() === m[2].trim()) { ta.setRangeText('', ls, s, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); return; } // пустой пункт — конец списка
  const pre = m[1] + (m[3] ? (+m[3] + 1) + m[4] + ' ' : m[2].replace(/\[[xх]\]/i, '[ ]'));
  ta.setRangeText('\n' + pre, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true }));
}, true);
function noteFmt(k) {
  const ta = $('#n-body'); if (!ta) return; const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  if (k === 'bold') { const sel = v.slice(s, e) || 'текст'; ta.setRangeText(`**${sel}**`, s, e, 'select'); }
  else {
    const ls = v.lastIndexOf('\n', s - 1) + 1, le = v.indexOf('\n', e) < 0 ? v.length : v.indexOf('\n', e), lines = v.slice(ls, le).split('\n');
    const P = { h1: '# ', h2: '## ', ul: '- ', ol: '1. ', chk: '- [ ] ', quote: '> ' }[k];
    const strip = l => l.replace(/^(#{1,3} |\s*[-*•] \[[ xх]\] |\s*[-*•] |\s*\d+[.)] |> )/i, '');
    const has = lines.every(l => (k === 'ol' ? /^\s*\d+[.)] /.test(l) : l.startsWith(P)));
    const res = lines.map((l, i) => has ? strip(l) : (k === 'ol' ? (i + 1) + '. ' : P) + strip(l)).join('\n');
    ta.setRangeText(res, ls, le, 'end');
  }
  ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
}
// --- заметка ↔ задача ---
function noteToTask(n) {
  const L = n.body.split('\n'), cl = [], rest = [];
  L.forEach(l => { const m = l.match(/^\s*[-*] \[( |x|х)\] (.*)$/i); if (m) cl.push({ t: m[2].trim(), d: m[1] !== ' ' }); else rest.push(l); });
  const t = newTask({ title: noteTitle(n).slice(0, 200), desc: notePlain(rest.join('\n')).trim().slice(0, 4000), project: n.project, col: firstCol().id, checklist: cl });
  snapU(); addTask(t); n.task = t.id; n.upd = Date.now(); save(); render(); openTaskForm(t.id);
  toast('Задача создана из заметки' + (cl.length ? `, пунктов чек-листа: ${cl.length}` : ''), true);
}
function taskToNote(t) {
  const body = [t.desc || '', ...(t.checklist || []).map(c => `- [${c.d ? 'x' : ' '}] ${c.t}`)].filter(Boolean).join('\n');
  const n = newNote({ title: t.title, body, project: t.project, task: t.id });
  NT().push(n); save(); closeModal(); NOF.open = n.id; NOF.edit = false; go('notes'); toast('Заметка создана из задачи', true);
}
function noteMore() {
  const n = noteOf(NOF.open); if (!n) return;
  sheet(`<div class="shh"><b>${esc(noteTitle(n))}</b><small>Заметка</small></div>
    <div class="shl">
      <button class="btn ghost" data-act="noteTask">${ic('board')} Сделать задачей${noteChecks(n).n ? ' (флажки станут чек-листом)' : ''}</button>
      <button class="btn ghost" data-act="noteDup">${ic('copy')} Дублировать</button>
      <button class="btn ghost" data-act="noteCopy">${ic('copy')} Скопировать текст</button>
      <button class="btn ghost danger" data-act="noteDel">${ic('trash')} Удалить</button></div>`);
}
function projNotesHtml(p) {
  const L = NT().filter(n => n.project === p.id && !n.archived).sort((a, b) => b.upd - a.upd);
  return `<section class="pan" style="margin-bottom:1rem"><div class="ph2"><h2>${ic('note')} Заметки</h2><small>${L.length || ''}</small><span class="spacer"></span><button class="btn sm" data-act="noteNew" data-proj="${p.id}">${ic('plus')} Заметка</button></div>
    ${L.length ? `<div class="pnotes">${L.slice(0, 8).map(noteCard).join('')}</div>` : '<div class="empty">Протоколы встреч, идеи, материалы проекта — в одном месте.</div>'}</section>`;
}
registerModule({
  id: 'notes', order: 4.5, title: 'Заметки', icon: 'note', desc: 'Заметки с заголовками, списками и флажками; превращение в задачу и обратно; привязка к проектам',
  bar() {
    const all = NT().filter(n => !n.archived).length;
    return `<h1>Заметки</h1><div class="stats"><span><b>${all}</b> ${plural(all, ['заметка', 'заметки', 'заметок'])}</span></div><span class="spacer"></span>
      <div class="nsearch"><input class="in" id="nq" value="${esc(NOF.q)}" placeholder="Поиск в заметках" aria-label="Поиск в заметках"></div>
      ${D.projects.length ? `<select class="in" id="nproj" style="width:auto" aria-label="Проект"><option value="">Все проекты</option>${D.projects.filter(p => p.status !== 'archived').map(p => `<option value="${p.id}" ${NOF.proj === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}<option value="_" ${NOF.proj === '_' ? 'selected' : ''}>Без проекта</option></select>` : ''}
      <button class="btn pri" data-act="noteNew">${ic('plus')} Заметка</button>`;
  },
  render() {
    const L = notesList(); if (NOF.open && !noteOf(NOF.open)) NOF.open = null;
    if (!NOF.open && !MOB() && L.length) NOF.open = L[0].id;
    const n = noteOf(NOF.open);
    if (MOB()) return n ? `<div class="nwrap one">${noteEditor(n)}</div>` : `<div class="scroll"><div class="nlist">${L.map(noteCard).join('') || '<div class="empty">Заметок пока нет</div>'}</div></div>`;
    return `<div class="nwrap"><div class="nlist">${L.map(noteCard).join('') || `<div class="empty">${NOF.q ? 'Ничего не найдено' : 'Заметок пока нет'}</div>`}</div>
      <div class="npane">${n ? noteEditor(n) : `<div class="hempty">${ic('note')}<h2>Заметки</h2><p>Записывайте идеи, протоколы встреч, списки покупок. Заголовки, списки и флажки — кнопками на панели. Любую заметку можно превратить в задачу, а задачу — в заметку.</p><button class="btn pri" data-act="noteNew">${ic('plus')} Новая заметка</button></div>`}</div></div>`;
  },
  after() { const ta = $('#n-body'); if (ta && NOF.focus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); NOF.focus = false; } if (NOF.focusTitle) { const i = $('#n-title'); if (i) i.focus(); NOF.focusTitle = false; } },
  search(q) { return NT().filter(n => (n.title + ' ' + n.body).toLowerCase().includes(q)).slice(0, 6).map(n => ({ group: 'Заметки', title: noteTitle(n), sub: noteSnippet(n).slice(0, 60), act: 'noteOpen', id: n.id })); }
});
document.addEventListener('input', e => { if (e.target.id === 'nq') { NOF.q = e.target.value; const s = e.target.selectionStart; render(); const i = $('#nq'); if (i) { i.focus(); i.setSelectionRange(s, s); } } });
Object.assign(ACT, {
  noteNew: b => { const n = newNote({ project: (b && b.dataset.proj) || (NOF.proj && NOF.proj !== '_' ? NOF.proj : null) }); NT().push(n); save(); NOF.open = n.id; NOF.edit = true; NOF.focusTitle = true; closeModal(); if (UI.view !== 'notes') go('notes'); else render(); },
  noteOpen: b => { NOF.open = b.dataset.id; NOF.edit = false; closeModal(); if (UI.view !== 'notes') go('notes'); else render(); },
  noteBack: () => { NOF.open = null; NOF.edit = false; render(); },
  noteEdit: () => { const ev = window.event; if (ev && ev.target && ev.target.closest && ev.target.closest('a')) return; NOF.edit = true; NOF.focus = true; render(); },
  noteDone: () => { NOF.edit = false; const n = noteOf(NOF.open); if (n && !n.title.trim() && !n.body.trim()) { D.notes = NT().filter(x => x !== n); NOF.open = null; } save(); render(); },
  noteFmt: b => noteFmt(b.dataset.v),
  notePin: () => { const n = noteOf(NOF.open); if (!n) return; n.pinned = !n.pinned; save(); render(); },
  noteMore: () => noteMore(),
  noteChk: b => { const n = noteOf(NOF.open); if (!n) return; const L = n.body.split('\n'), i = +b.dataset.l; L[i] = L[i].replace(/\[( |x|х)\]/i, m => /x|х/i.test(m) ? '[ ]' : '[x]'); n.body = L.join('\n'); n.upd = Date.now(); save(); render(); },
  noteTask: () => { closeSheet(); const n = noteOf(NOF.open); if (n) noteToTask(n); },
  noteDup: () => { closeSheet(); const n = noteOf(NOF.open); if (!n) return; const c = newNote({ ...n, id: uid(), title: n.title + ' (копия)', created: Date.now(), upd: Date.now(), pinned: false }); NT().push(c); NOF.open = c.id; save(); render(); },
  noteCopy: async () => { closeSheet(); const n = noteOf(NOF.open); if (!n) return; try { await navigator.clipboard.writeText((n.title ? n.title + '\n\n' : '') + notePlain(n.body)); toast('Текст скопирован'); } catch (e) { toast('Не удалось скопировать'); } },
  noteDel: () => { closeSheet(); const n = noteOf(NOF.open); if (!n) return; snapU(); D.notes = NT().filter(x => x !== n); NOF.open = null; save(); render(); toast('Заметка удалена', true); },
  taskNote: () => { if (!UI.form) return; taskToNote(readTaskForm()); }
});
