'use strict';
// ============================================================
//  Этап 1 (по мотивам TickTick): матрица Эйзенхауэра, несколько
//  напоминаний и «напоминать, пока не выполню», важные даты, план дня
// ============================================================
Object.assign(ICONS, {
  grid4: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8c-1.5-3-5-4-5-1.5S10 8 12 8zm0 0c1.5-3 5-4 5-1.5S14 8 12 8z"/>',
  wand: '<path d="M4 20 15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M18 14v2M10 4H8M19 19l-1-1"/><path d="m13 7 4 4"/>'
});

// ---------- 1. Напоминания: несколько и «пока не выполню» ----------
const NAG = [[null, 'Нет'], [10, 'Каждые 10 минут'], [15, 'Каждые 15 минут'], [30, 'Каждые 30 минут'], [60, 'Каждый час']];
const NAG_MAX = 864e5; // повторяем не дольше суток после срока
const dueOf = t => { const [y, m, d] = t.date.split('-').map(Number), [hh, mm] = (t.time || '09:00').split(':').map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); };
// Точки срабатывания на «сейчас»: [ключ, время]. Та же логика повторена в main.js и platform-android.js.
function remPoints(t, now) {
  const f = [];
  if (t.date) {
    const due = dueOf(t);
    for (const m of [t.remind, t.rem2]) if (m != null) { const at = due - m * 60000; f.push([t.id + ':' + at, at]); }
    if (t.nag && now >= due) { const iv = t.nag * 60000, k = Math.floor((now - due) / iv); if (k * iv <= NAG_MAX) { const at = due + k * iv; f.push([t.id + ':' + at, at]); } }
  }
  if (t.snooze) f.push([t.id + ':s' + t.snooze, t.snooze]);
  return f;
}
const remLabel = t => [t.remind, t.rem2].filter(v => v != null).sort((a, b) => b - a).map(v => REMS[v] || '').join(', ') + (t.nag ? ' · до выполнения' : '');

// ---------- 2. Матрица Эйзенхауэра ----------
const MQ = [
  { k: 1, t: 'Срочно и важно', s: 'Сделать сейчас', c: 'var(--hi)' },
  { k: 2, t: 'Важно, не срочно', s: 'Запланировать', c: 'var(--acc)' },
  { k: 3, t: 'Срочно, не важно', s: 'Сделать быстро или поручить', c: 'var(--mid)' },
  { k: 4, t: 'Не срочно и не важно', s: 'Отложить или удалить', c: 'var(--mute)' }
];
const urgentDate = t => !!t.date && t.date <= addDays(today(), 1);
const isUrgent = t => t.prio === 2 || urgentDate(t);
const isImportant = t => (t.prio || 0) >= 1;
const quadOf = t => isImportant(t) ? (isUrgent(t) ? 1 : 2) : (isUrgent(t) ? 3 : 4);
function matrixHtml() {
  const L = live().filter(t => !isDone(t)).filter(visibleTask).filter(t => D.settings.showSub || !t.parent || !byId(t.parent) || byId(t.parent).archived);
  const by = { 1: [], 2: [], 3: [], 4: [] };
  L.forEach(t => by[quadOf(t)].push(t));
  Object.values(by).forEach(a => a.sort((x, y) => scoreTask(y).s - scoreTask(x).s));
  return `<div class="mtx">${MQ.map(q => `<section class="mq" data-q="${q.k}" style="--c:${q.c}"><div class="mqh"><i>${q.k}</i><div><b>${q.t}</b><small>${q.s}</small></div><span class="cn">${by[q.k].length}</span></div>
    <div class="mqc">${by[q.k].map(t => cardHtml(t)).join('') || `<div class="empty">${q.k === 1 ? 'Пусто — отлично!' : 'Перетащите сюда задачу'}</div>`}</div>
    <form class="cadd" data-col="${firstCol().id}" data-q="${q.k}"><input placeholder="+ Задача в этот квадрант" aria-label="Новая задача: ${q.t}" maxlength="200"></form></section>`).join('')}</div>
    <p class="hint mtxh">Важность — это приоритет задачи («Важный» или «Срочный»). Срочность — срок сегодня, завтра или уже прошёл. Перетащите карточку${MOB() ? ' (или нажмите и подержите)' : ''} в другой квадрант — программа сама поменяет приоритет и при необходимости срок.</p>`;
}
// Переносит задачу в квадрант: меняет приоритет и, если нужно, срок. Возвращает текст для подсказки.
function setQuad(t, q) {
  const was = quadOf(t); if (was === q) return '';
  const td = today(), msg = [];
  const imp = q <= 2, urg = q === 1 || q === 3;
  if (imp && !isImportant(t)) { t.prio = 1; msg.push('приоритет «Важный»'); }
  if (!imp && isImportant(t)) { t.prio = 0; msg.push('приоритет «Обычный»'); }
  if (imp && !urg && t.prio === 2) { t.prio = 1; msg.push('приоритет «Важный»'); }
  if (urg && !urgentDate(t) && t.prio !== 2) { t.date = td; t.snooze = null; msg.push('срок — сегодня'); }
  if (!urg && urgentDate(t)) {
    if (q === 4) { t.date = null; t.time = null; t.remind = t.rem2 = t.nag = null; t.repeat = null; msg.push('срок снят'); }
    else { const nd = freeDay(td, durOf(t)) || addDays(td, 3); t.date = nd < addDays(td, 2) ? addDays(td, 2) : nd; msg.push('срок — ' + human(t.date).toLowerCase()); }
  }
  return msg.join(', ');
}
function dropToQuad(id, q) {
  const t = byId(id); if (!t) return; snapU();
  const m = setQuad(t, q); if (!m) return;
  save(); render(); toast(`«${MQ[q - 1].t}»: ${m}`, true);
}
// перетаскивание мышью между квадрантами (в фазе захвата — раньше общего обработчика доски)
document.addEventListener('dragover', e => {
  if (!dragId || !e.target.closest) return; const q = e.target.closest('.mq'); if (!q) return;
  e.preventDefault(); e.stopImmediatePropagation();
  $$('.mq.drop').forEach(x => x !== q && x.classList.remove('drop')); q.classList.add('drop');
}, true);
document.addEventListener('drop', e => {
  if (!dragId || !e.target.closest) return; const q = e.target.closest('.mq'); if (!q) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const id = dragId; dragId = null; $$('.mq.drop').forEach(x => x.classList.remove('drop')); clearDrop(); dropToQuad(id, +q.dataset.q);
}, true);
// добавление прямо в квадрант
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('form.cadd[data-q]'); if (!f) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const i = $('input', f), v = i.value.trim(); if (!v) return;
  const pre = taskPreset(); pre.col = f.dataset.col;
  const p = SM().parser ? parseSmart(v) : { kind: 'task', title: v }; p.kind = 'task'; if (!p.title) return toast('Не хватает названия задачи');
  const t = createFromParse(p, pre); if (!t) return;
  setQuad(t, +f.dataset.q); save(); render();
  setTimeout(() => { const n = $(`form.cadd[data-q="${f.dataset.q}"] input`); if (n) n.focus(); }, 30);
}, true);
// Доска ↔ Матрица: оборачиваем модуль «Доска»
(() => {
  const m = MODULES.find(x => x.id === 'board'); if (!m) return;
  const bar = m.bar, rend = m.render;
  m.bar = function () {
    if (TF.view == null) TF.view = D.settings.boardView || 'board';
    const sw = `<div class="subtabs"><button class="${TF.view !== 'matrix' ? 'on' : ''}" data-act="tview" data-v="board">${ic('board')} Колонки</button><button class="${TF.view === 'matrix' ? 'on' : ''}" data-act="tview" data-v="matrix">${ic('grid4')} Матрица</button></div>`;
    return bar.call(this).replace('<span class="sep"></span>', '<span class="sep"></span>' + sw + '<span class="sep"></span>');
  };
  m.render = function () { if (TF.view == null) TF.view = D.settings.boardView || 'board'; return TF.view === 'matrix' ? `<div class="scroll">${matrixHtml()}</div>` : rend.call(this); };
})();
Object.assign(ACT, {
  tview: b => { TF.view = b.dataset.v; D.settings.boardView = TF.view; save(); render(); },
  shQuad: b => { closeSheet(); dropToQuad(b.dataset.id, +b.dataset.v); }
});

// ---------- 3. Важные даты: дни рождения, годовщины, памятные даты ----------
const DKIND = { bday: ['День рождения', '🎂'], anniv: ['Годовщина', '💍'], memo: ['Памятная дата', '🕯'], other: ['Событие', '⭐'] };
const DREM = [[null, 'Не напоминать'], [0, 'В тот же день'], [1, 'За 1 день'], [3, 'За 3 дня'], [7, 'За неделю'], [14, 'За 2 недели']];
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
// ближайшее наступление (сегодня или позже); для разовой даты — она сама, даже если прошла
function dateNext(x, from = today()) {
  if (!x.yearly) return x.date;
  const [, m, d] = x.date.split('-').map(Number), y0 = +from.slice(0, 4);
  for (const y of [y0, y0 + 1]) { const dd = m === 2 && d === 29 && !leap(y) ? 28 : d, s = `${y}-${pad(m)}-${pad(dd)}`; if (s >= from) return s; }
  return null;
}
const dateYears = (x, occ) => x.yearly && (x.kind === 'bday' || x.kind === 'anniv') && x.year !== false ? +occ.slice(0, 4) - +x.date.slice(0, 4) : 0;
function datesOn(day) { return (D.dates || []).filter(x => dateNext(x, day) === day); }
function daysLeftTxt(n) { return n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} ${plural(n, PD)}`; }
function dateLine(x, occ) {
  const n = diff(today(), occ), yrs = dateYears(x, occ), [lbl, emo] = DKIND[x.kind] || DKIND.other;
  return `<div class="lrow idate ${n === 0 ? 'now' : ''}" data-act="dateEdit" data-id="${x.id}"><span class="emo">${emo}</span><div class="tx"><b>${esc(x.title)}</b><small>${lbl}${yrs > 0 ? ` · ${x.kind === 'bday' ? 'исполнится' : ''} ${yrs} ${plural(yrs, ['год', 'года', 'лет'])}` : ''} · ${pd(occ).getDate()} ${MG[pd(occ).getMonth()]}</small></div><span class="left ${n <= 3 ? 'soon' : ''}">${n < 0 ? 'прошла' : n === 0 ? 'Сегодня!' : n === 1 ? 'Завтра' : `<b>${n}</b> ${plural(n, PD)}`}</span></div>`;
}
function datesCard() {
  const list = (D.dates || []).map(x => ({ x, occ: dateNext(x) })).filter(o => o.occ && o.occ >= today()).sort((a, b) => a.occ.localeCompare(b.occ));
  const soon = list.filter(o => diff(today(), o.occ) <= 60).slice(0, 5);
  return `<section class="pan"><div class="ph2"><h2>${ic('gift')} Важные даты</h2>${list.length ? `<small>${list.length}</small>` : ''}<span class="spacer"></span>${(D.dates || []).length ? `<button class="btn sm ghost" data-act="datesAll">Все</button>` : ''}<button class="btn sm ghost" data-act="dateEdit">${ic('plus')} Дата</button></div>
    ${soon.map(o => dateLine(o.x, o.occ)).join('') || `<div class="empty">${(D.dates || []).length ? 'В ближайшие два месяца важных дат нет' : 'Добавьте дни рождения, годовщины и другие даты — программа покажет, сколько дней осталось, и напомнит заранее.'}</div>`}</section>`;
}
function datesAll() {
  const list = (D.dates || []).map(x => ({ x, occ: dateNext(x) })).sort((a, b) => (a.occ || '9').localeCompare(b.occ || '9'));
  modal(`<div class="mbox"><div class="mh"><h2>${ic('gift')} Важные даты</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
    <div class="mb">${list.map(o => dateLine(o.x, o.occ)).join('') || '<div class="empty">Пока нет дат</div>'}</div>
    <div class="mf"><span class="spacer"></span><button class="btn pri" data-act="dateEdit">${ic('plus')} Добавить дату</button></div></div>`);
}
function dateForm(id) {
  const x = (D.dates || []).find(d => d.id === id) || { id: null, title: '', date: '', kind: 'bday', yearly: true, remind: 1, year: true };
  modal(`<div class="mbox"><div class="mh"><h2>${x.id ? 'Важная дата' : 'Новая важная дата'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="dform" autocomplete="off">
    <label class="f"><span>Название</span><input class="in title" id="d-title" value="${esc(x.title)}" placeholder="Например: Мама, свадьба, день памяти" maxlength="120"></label>
    <div class="row two"><label class="f"><span>Тип</span><select class="in" id="d-kind">${Object.entries(DKIND).map(([k, [l, e]]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${e} ${l}</option>`).join('')}</select></label>
      <label class="f"><span>Дата</span><input type="date" class="in" id="d-date" value="${x.date}"></label></div>
    <div class="row two"><label class="f"><span>Напоминание (в 10:00)</span><select class="in" id="d-rem">${opt(DREM, x.remind)}</select></label>
      <div class="f"><span>&nbsp;</span><label class="chk"><input type="checkbox" id="d-year" ${x.yearly ? 'checked' : ''}> Повторять каждый год</label></div></div>
    <label class="chk"><input type="checkbox" id="d-age" ${x.year !== false ? 'checked' : ''}> Считать, сколько лет исполняется (если год в дате настоящий)</label>
  </form>
  <div class="mf">${x.id ? `<button class="btn ghost danger" data-act="dateDel" data-id="${x.id}">${ic('trash')} Удалить</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="dateSave" data-id="${x.id || ''}">Сохранить</button></div></div>`);
  setTimeout(() => { const i = $('#d-title'); if (i) i.focus(); }, 30);
}
function showDateAlert(id) {
  const x = (D.dates || []).find(d => d.id === id); if (!x || $(`.al[data-dt="${id}"]`)) return;
  const occ = dateNext(x), n = occ ? diff(today(), occ) : 0, yrs = occ ? dateYears(x, occ) : 0;
  const el = document.createElement('div'); el.className = 'al'; el.dataset.dt = id;
  el.innerHTML = `<div class="ah">${ic('gift')} ${(DKIND[x.kind] || DKIND.other)[0]}<button class="ib sm" data-act="alClose" aria-label="Закрыть">${ic('x')}</button></div><b>${esc(x.title)}</b><p>${n === 0 ? 'Сегодня' : daysLeftTxt(n)[0].toUpperCase() + daysLeftTxt(n).slice(1)}${yrs > 0 ? ` · ${yrs} ${plural(yrs, ['год', 'года', 'лет'])}` : ''}</p><div class="ab"><button class="btn sm pri" data-act="dateToTask" data-id="${id}">Задача: подготовиться</button></div>`;
  $('#alerts').appendChild(el); if (document.hasFocus() || !hasApi) beep();
}
Object.assign(ACT, {
  dateEdit: b => dateForm(b.dataset.id),
  datesAll: () => datesAll(),
  dateSave: b => {
    const title = $('#d-title').value.trim(), date = $('#d-date').value;
    if (!title) { $('#d-title').focus(); toast('Введите название'); return; }
    if (!date) { $('#d-date').focus(); toast('Укажите дату'); return; }
    snapU(); D.dates = D.dates || [];
    let x = D.dates.find(d => d.id === b.dataset.id); if (!x) { x = { id: uid() }; D.dates.push(x); }
    Object.assign(x, { title, date, kind: $('#d-kind').value, yearly: $('#d-year').checked, year: $('#d-age').checked, remind: $('#d-rem').value === '' ? null : +$('#d-rem').value });
    save(); closeModal(); render(); const o = dateNext(x); toast(o && o >= today() ? `«${title}» — ${daysLeftTxt(diff(today(), o))}` : 'Сохранено', true);
  },
  dateDel: b => { snapU(); D.dates = (D.dates || []).filter(d => d.id !== b.dataset.id); save(); closeModal(); render(); toast('Дата удалена', true); },
  dateToTask: b => {
    const x = (D.dates || []).find(d => d.id === b.dataset.id); if (!x) return;
    const occ = dateNext(x), t = newTask({ title: `${(DKIND[x.kind] || DKIND.other)[0]}: ${x.title} — подготовиться`, col: firstCol().id, date: occ && occ > today() ? addDays(occ, -1) : today(), prio: 1 });
    t.order = -Date.now(); D.tasks.push(t); save(); const al = b.closest('.al'); if (al) al.remove(); render(); openTaskForm(t.id);
  }
});

// ---------- 4. План дня одной кнопкой ----------
// Берём просроченные, без даты и ближайшие (без точного времени и повтора) задачи по оценке важности и раскладываем в свободное время сегодня.
function dayPlanPick() {
  const td = today(), free = Math.max(0, capOf(td) - loadOf(td)), picked = [];
  let used = 0;
  const pool = live().filter(t => !isDone(t) && t.date !== td && !kids(t.id).some(k => !isDone(k)) && (!t.date || t.date < td || (diff(td, t.date) <= 7 && !t.time && !t.repeat)) && !(t.who && shareOn() && t.who !== SH().me.id))
    .map(t => ({ t, ...scoreTask(t) })).sort((a, b) => b.s - a.s);
  for (const o of pool) { const d = durOf(o.t); if (used + d > free) continue; picked.push(o); used += d; if (picked.length >= 8) break; }
  return { free, used, picked };
}
function dayPlan() {
  const td = today(), P = dayPlanPick(), over = loadOf(td) > capOf(td);
  modal(`<div class="mbox"><div class="mh"><h2>${ic('wand')} План дня</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <div class="mb">
    <p class="hint">На сегодня уже запланировано ${durTxt(loadOf(td) || 0)} из ${durTxt(capOf(td))}. ${over ? 'День уже перегружен — новые задачи добавлять не стоит.' : P.free ? `Свободно ${durTxt(P.free)}. Программа подобрала задачи по важности — снимите галочки с лишних.` : ''}</p>
    ${P.picked.map(o => `<label class="dpl"><input type="checkbox" data-dp="${o.t.id}" checked><div><b>${esc(o.t.title)}</b><small>${durTxt(durOf(o.t))} · ${o.t.date ? (o.t.date < td ? 'просрочена' : dueTxt(o.t)) : 'без даты'}${o.why.length ? ' · ' + esc(o.why.slice(0, 2).map(w => w.label).join(', ')) : ''}</small></div><span class="sc">${o.s}</span></label>`).join('') || `<div class="empty">${over || !P.free ? 'Свободного времени сегодня нет.' : 'Подходящих задач нет — всё уже распределено.'}</div>`}
  </div>
  <div class="mf"><span class="hint" id="dp-sum"></span><span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button>${P.picked.length ? `<button class="btn pri" data-act="dayPlanGo">${ic('check')} Взять на сегодня</button>` : ''}</div></div>`);
  dpSum();
}
function dpSum() { const el = $('#dp-sum'); if (!el) return; const ids = $$('[data-dp]:checked').map(i => i.dataset.dp), m = ids.reduce((a, id) => a + durOf(byId(id)), 0); el.textContent = ids.length ? `${ids.length} ${plural(ids.length, PT)} · ${durTxt(m)}` : 'ничего не выбрано'; }
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-dp]')) dpSum(); });
Object.assign(ACT, {
  dayPlan: () => dayPlan(),
  dayPlanGo: () => {
    const ids = $$('[data-dp]:checked').map(i => i.dataset.dp); if (!ids.length) { closeModal(); return; }
    snapU(); const td = today();
    ids.forEach(id => { const t = byId(id); if (!t) return; if (t.date && t.date > td) t.postponed = t.postponed || 0; t.date = td; t.snooze = null; if (t.time && toMin(t.time) < new Date().getHours() * 60 + new Date().getMinutes()) t.time = null; });
    save(); closeModal(); render(); toast(`На сегодня добавлено: ${ids.length} ${plural(ids.length, PT)}`, true);
  }
});
