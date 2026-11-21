'use strict';
// ============================================================
//  Модуль «Доска»: канбан, карточки, форма задачи
// ============================================================
const PRIO = [['Обычный', 'var(--mute)'], ['Важный', 'var(--mid)'], ['Срочный', 'var(--hi)']];
const REM = [[null, 'Не напоминать'], [0, 'В момент начала'], [5, 'За 5 минут'], [15, 'За 15 минут'], [30, 'За 30 минут'], [60, 'За 1 час'], [120, 'За 2 часа'], [1440, 'За 1 день']];
const REMS = { 0: 'в срок', 5: 'за 5 мин', 15: 'за 15 мин', 30: 'за 30 мин', 60: 'за 1 ч', 120: 'за 2 ч', 1440: 'за день' };
const REP = [[null, 'Не повторять'], ['day', 'Каждый день'], ['weekdays', 'По будням (пн–пт)'], ['week', 'Каждую неделю'], ['week2', 'Раз в 2 недели'], ['month', 'Каждый месяц'], ['year', 'Каждый год']];
const REPS = { day: 'каждый день', weekdays: 'по будням', week: 'еженедельно', week2: 'раз в 2 нед.', month: 'ежемесячно', quarter: 'ежекварт.', year: 'ежегодно' };
const DURS = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const TF = { filter: 'all', tags: new Set(), proj: '', editingCol: null, flash: null, sort: 'manual' };

function matchQ(t) { const q = (UI.q || '').toLowerCase(); if (!q) return true; return (t.title + ' ' + t.desc + ' ' + t.checklist.map(i => i.t).join(' ') + ' ' + tagsOf(t).map(x => x.title).join(' ')).toLowerCase().includes(q.replace(/^#/, '')); }
function matchF(t, f = TF.filter) {
  const td = today(), dn = isDone(t);
  if (f === 'today') return !!t.date && (dn ? t.date === td : t.date <= td);
  if (f === 'week') { const w = weekStart(td); return !!t.date && t.date >= w && t.date <= addDays(w, 6); }
  if (f === 'over') return !dn && !!t.date && t.date < td;
  if (f === 'nodate') return !t.date;
  if (f === 'mine') return shareOn() && t.who === SH().me.id;
  if (f === 'given') return shareOn() && t.asg === SH().me.id && !!t.who && t.who !== SH().me.id;
  return true;
}
const matchT = t => !TF.tags.size || (t.tags || []).some(x => TF.tags.has(x)) || (TF.tags.has('_') && !(t.tags || []).length);
const matchP = t => !TF.proj || (TF.proj === '_' ? !t.project : t.project === TF.proj);
const visibleTask = t => !t.archived && matchQ(t) && matchT(t) && matchP(t) && matchF(t);
function dueTxt(t) { let s = human(t.date); if (t.time) { s += ' ' + t.time; if (t.dur) s += '–' + fromMin(Math.min(1440, toMin(t.time) + t.dur)); } return s; }
const tagColor = t => { const p = projOf(t.project); if (p) return p.color; const g = tagsOf(t)[0]; return g ? g.color : '#7d8590'; };

function cardHtml(t, mini) {
  const dn = isDone(t), td = today(), n = t.checklist.length, cd = t.checklist.filter(i => i.d).length, p = projOf(t.project), spent = sumT(taskTx(t.id), 'expense');
  const due = t.date ? `<span class="m ${!dn && t.date < td ? 'over' : !dn && t.date === td ? 'tod' : ''}">${ic('clock')}${!dn && t.date < td ? 'Просрочено · ' : ''}${dueTxt(t)}</span>` : '';
  const meta = due + ((t.remind != null || t.nag) && t.date && !dn ? `<span class="m" title="Напоминание">${ic('bell')}${remLabel(t)}</span>` : '') + (t.repeat ? `<span class="m" title="Повтор">${ic('repeat')}${REPS[t.repeat]}</span>` : '') + (t.spent ? `<span class="m" title="Время в фокусе">${ic('timer')}${spentTxt(t.spent)}</span>` : '') + (liveCm(t).length ? `<span class="m" title="Комментарии">${ic('chat')}${liveCm(t).length}</span>` : '') + (n ? `<span class="m ${cd === n ? 'okc' : ''}">${ic('list')}${cd}/${n}</span>` : '') + (spent ? `<span class="m mon" title="Расходы по задаче">${ic('coin')}${money0(spent)}</span>` : '') + ((t.laws || []).length ? `<span class="m law" data-act="lawChip" data-doc="${t.laws[0].doc}" data-art="${t.laws[0].art}" title="Открыть статью">§ ${esc(t.laws[0].label)}${t.laws.length > 1 ? ' +' + (t.laws.length - 1) : ''}</span>` : '');
  const sp = subProgress(t.id), par = t.parent && byId(t.parent);
  const top = (t.who && isShared(p) ? whoChip(t.who) : '') + (p ? projChip(p) : '') + tagsHtml(t) + (t.prio === 2 && !dn ? '<span class="pri-t">Срочно</span>' : '');
  const metaSub = sp.n ? `<span class="m ${sp.d === sp.n ? 'okc' : ''}" title="Подзадачи">${ic('sub')}${sp.d}/${sp.n} подзадач</span>` : '';
  return `<article class="card p${t.prio} ${dn ? 'done' : ''} ${TF.flash === t.id ? 'flash' : ''}" draggable="true" data-id="${t.id}" data-act="openTask" tabindex="0" aria-label="${esc(t.title)}">
    ${mini ? '' : `<button class="cchk" data-act="complete" data-id="${t.id}" aria-label="${dn ? 'Вернуть в работу' : 'Отметить выполненной'}" title="${dn ? 'Вернуть в работу' : 'Выполнено'}">${ic('check')}</button>`}
    ${top ? `<div class="ctop">${top}</div>` : ''}
    ${par && D.settings.showSub ? `<div class="cpar" data-act="openTask" data-id="${par.id}">↳ ${esc(par.title)}</div>` : ''}
    <div class="ct">${esc(t.title)}</div>
    ${t.desc && !mini ? `<div class="cdesc">${esc(t.desc)}</div>` : ''}
    ${n && !dn && !mini ? `<div class="cbar"><i style="width:${Math.round(cd / n * 100)}%"></i></div>` : ''}
    ${meta || metaSub ? `<div class="cmeta">${meta}${metaSub}</div>` : ''}
  </article>`;
}
function colHtml(c) {
  const all = tasksIn(c.id), fil = UI.q || TF.filter !== 'all' || TF.tags.size || TF.proj;
  let items = all.filter(visibleTask).filter(t => D.settings.showSub || !t.parent || !byId(t.parent) || byId(t.parent).archived);
  if (TF.sort === 'score' && !c.done) items = items.map(t => ({ t, s: scoreTask(t).s })).sort((a, b) => b.s - a.s).map(x => x.t);
  return `<section class="col" data-col="${c.id}" style="--c:${c.color}">
    <div class="colh"><span class="cd"></span>${TF.editingCol === c.id ? `<input id="colname" value="${esc(c.title)}" aria-label="Название колонки" maxlength="40">` : `<h2 data-act="renameCol" data-id="${c.id}" title="Нажмите, чтобы переименовать">${esc(c.title)}</h2>`}
    <span class="cn">${fil ? items.length + ' из ' + all.length : all.length}</span>
    ${c.done && all.length ? `<button class="ib sm" data-act="archiveDone" title="Убрать выполненные в архив" aria-label="Убрать выполненные в архив">${ic('archive')}</button>` : ''}
    <button class="ib sm" data-act="settings" data-v="cols" title="Настроить колонки" aria-label="Настроить колонки">${ic('more')}</button></div>
    <div class="cards" data-drop="${c.id}">${items.map(t => cardHtml(t)).join('') || `<div class="empty">${fil ? 'Нет задач по фильтру' : c.done ? 'Перетащите сюда выполненную задачу' : 'Пусто. Добавьте задачу ниже или перетащите сюда'}</div>`}</div>
    ${c.done ? '' : `<form class="cadd" data-col="${c.id}"><input placeholder="+ Добавить задачу" aria-label="Новая задача в колонку ${esc(c.title)}" maxlength="200"></form>`}
  </section>`;
}
function taskPreset() {
  const td = today(), p = {};
  if (UI.view === 'calendar') p.date = UI.calDate || td;
  else if (TF.filter === 'today' || TF.filter === 'week') p.date = td;
  if (UI.view === 'projects' && UI.proj) p.project = UI.proj; else if (UI.view === 'board' && TF.proj && TF.proj !== '_') p.project = TF.proj;
  if (UI.view === 'board' && TF.tags.size === 1 && !TF.tags.has('_')) p.tags = [...TF.tags];
  return p;
}
function tagFilterChips(set, act) {
  return `<div class="chips">${D.tags.map(t => `<button class="chip tag ${set.has(t.id) ? 'on' : ''}" data-act="${act}" data-v="${t.id}" style="--c:${t.color}" aria-pressed="${set.has(t.id)}">${esc(t.title)}</button>`).join('')}</div>`;
}

registerModule({
  id: 'board', order: 2, title: 'Доска', icon: 'board', desc: 'Канбан-доска задач: колонки, перетаскивание, чек-листы, повторы и напоминания',
  badge: () => live().filter(t => !isDone(t) && t.date && t.date < today()).length || '',
  bar() {
    const L = live(), td = today(), act = L.filter(t => !isDone(t)), over = act.filter(t => t.date && t.date < td).length, tod = act.filter(t => t.date === td).length;
    const F = [['all', 'Все'], ['today', 'На сегодня'], ['week', 'Неделя'], ['over', 'Просрочено'], ['nodate', 'Без даты']].concat(shareOn() ? [['mine', 'Мои'], ['given', 'Поручено мной']] : []);
    const cnt = f => L.filter(t => matchF(t, f) && (f === 'all' || f === 'nodate' ? !isDone(t) : true)).length;
    return `<h1>Доска</h1><div class="stats"><span><b>${act.length}</b> в работе</span><span><b>${tod}</b> на сегодня</span><span class="${over ? 'red' : ''}"><b>${over}</b> просрочено</span></div><span class="sep"></span>
      <div class="chips">${F.map(([k, l]) => `<button class="chip ${TF.filter === k ? 'on' : ''}" data-act="tfilter" data-v="${k}">${l} <span class="n">${cnt(k)}</span></button>`).join('')}</div>
      ${D.projects.length ? `<select class="in" style="width:auto;height:2.1rem;border-radius:99px" id="tproj" aria-label="Проект"><option value="">Все проекты</option>${D.projects.map(p => `<option value="${p.id}" ${TF.proj === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}<option value="_" ${TF.proj === '_' ? 'selected' : ''}>Без проекта</option></select>` : ''}
      <span class="sep"></span>${tagFilterChips(TF.tags, 'ttag')}<span class="spacer"></span>
      <button class="chip ${D.settings.showSub ? 'on' : ''}" data-act="toggleSub" title="Показывать подзадачи отдельными карточками">${ic('sub')} Подзадачи</button>
      <button class="chip ${TF.sort === 'score' ? 'on' : ''}" data-act="toggleSort" title="Сортировать карточки по автоматической оценке важности">${ic('star')} По важности</button>`;
  },
  render: () => `<div class="board" id="board">${D.columns.map(colHtml).join('')}<button class="newcol" data-act="addCol">${ic('plus')} Колонка</button></div>`,
  after() {
    const ci = $('#colname'); if (ci) { ci.focus(); ci.select(); }
    if (TF.flash) { const el = $(`.card[data-id="${TF.flash}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); TF.flash = null; }
  },
  keys(e, k) {
    const t = e.target;
    if (t.classList.contains('card') && e.key === 'Delete') { snapU(); D.tasks = D.tasks.filter(x => x.id !== t.dataset.id); save(); render(); toast('Задача удалена', true); return true; }
    return false;
  },
  search(q) { return live().filter(t => (t.title + ' ' + t.desc).toLowerCase().includes(q)).slice(0, 8).map(t => ({ group: 'Задачи', title: t.title, sub: t.date ? human(t.date) : (isDone(t) ? 'выполнена' : 'без даты'), color: tagColor(t), act: 'openTask', id: t.id })); }
});

// ---------- форма задачи ----------
const opt = (list, sel) => list.map(([v, l]) => `<option value="${v === null ? '' : v}" ${String(v) === String(sel) ? 'selected' : ''}>${l}</option>`).join('');
function openTaskForm(id, preset) {
  const src = id ? byId(id) : null; if (id && !src) return;
  const F = UI.form = { kind: 'task', isNew: !src, t: src ? clone(src) : newTask({ col: firstCol().id, ...(preset || {}) }) };
  const t = F.t, tx = src ? taskTx(src.id) : [];
  const anc = ancestors(t), sc = !F.isNew && !isDone(t) && SM().scoring ? scoreTask(t) : null, kidsL = src ? kids(src.id) : [];
  const forbidden = new Set(src ? [src.id, ...descendants(src.id).map(x => x.id)] : []);
  const parents = live().filter(x => !forbidden.has(x.id) && !isDone(x) && (!t.project || x.project === t.project || x.id === t.parent)).slice(0, 400);
  modal(`<div class="mbox"><div class="mh"><h2>${F.isNew ? (t.parent ? 'Новая подзадача' : 'Новая задача') : 'Задача'}</h2>${src ? `<button class="btn sm ghost" data-act="saveAsTpl" title="Сохранить как шаблон">${ic('copy')} В шаблоны</button>` : ''}<button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="tform" autocomplete="off">
    ${anc.length ? `<div class="crumbs">${anc.map(a => `<button type="button" class="lnk" data-act="openTask" data-id="${a.id}">${esc(a.title)}</button>`).join('<span>›</span>')}<span>›</span><b>${esc(t.title || 'новая')}</b></div>` : ''}
    ${F.isNew && D.templates.some(x => x.kind === 'task') ? `<div class="tplrow"><span class="hint">Шаблоны:</span>${tplRank('task').slice(0, 6).map(x => `<button type="button" class="chip ${x.match ? 'on' : ''}" data-act="tplFill" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    <label class="f"><span>Название</span><input class="in title" id="f-title" value="${esc(t.title)}" placeholder="Что нужно сделать?" maxlength="200"></label>
    <div class="qsug" id="f-sug"></div>
    ${sc ? `<div class="scorebox"><b>${ic('star')} Оценка важности: ${sc.s}</b><span>${sc.why.map(w => `<i class="${w.v < 0 ? 'neg' : ''}">${w.v > 0 ? '+' : ''}${w.v} ${esc(w.label)}</i>`).join('')}</span></div>` : ''}
    <label class="f"><span>Описание <em>— необязательно</em></span><textarea class="in" id="f-desc" rows="3" placeholder="Подробности, ссылки, контакты">${esc(t.desc)}</textarea></label>
    <div class="row">
      <label class="f"><span>Колонка</span><select class="in" id="f-col">${D.columns.map(c => `<option value="${c.id}" ${c.id === t.col ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>
      <label class="f"><span>Проект</span><select class="in" id="f-proj"><option value="">Без проекта</option>${D.projects.filter(p => p.status !== 'archived' || p.id === t.project).map(p => `<option value="${p.id}" ${p.id === t.project ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label>
      <div class="f"><span>Приоритет</span><div class="pseg" id="f-prio" role="group" aria-label="Приоритет">${PRIO.map(([l, c], i) => `<button type="button" class="${t.prio === i ? 'on' : ''}" data-act="fprio" data-v="${i}" style="--pc:${c}" aria-pressed="${t.prio === i}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="row two"><div class="f"><span>Теги</span><div id="f-tags">${tagPick(t.tags, 'ftag')}</div></div>
      ${shareOn() ? `<label class="f" id="f-whow" ${isShared(projOf(t.project)) ? '' : 'hidden'}><span>Исполнитель</span><select class="in" id="f-who"><option value="">Не назначен</option>${[SH().me, ...Object.values(SH().members || {})].map(m => `<option value="${m.id}" ${t.who === m.id ? 'selected' : ''}>${esc(m.name)}${m.id === SH().me.id ? ' (я)' : ''}</option>`).join('')}</select></label>` : ''}
      <label class="f"><span>Вложена в задачу</span><select class="in" id="f-parent"><option value="">Верхний уровень</option>${parents.map(x => `<option value="${x.id}" ${x.id === t.parent ? 'selected' : ''}>${'— '.repeat(ancestors(x).length)}${esc(x.title.slice(0, 60))}</option>`).join('')}</select></label></div>
    ${modOn('law') && (LW().docs.length || (t.laws || []).length) ? `<div class="f"><span>Правовая основа</span><div class="lchips"><span id="f-laws">${lawChips(t, true)}</span><button type="button" class="btn sm ghost" data-act="lawAddToTask">${ic('plus')} Статья</button></div></div>` : ''}
    <div class="row">
      <label class="f"><span>Дата</span><input type="date" class="in" id="f-date" value="${t.date || ''}"></label>
      <label class="f"><span>Время</span><input type="time" class="in" id="f-time" value="${t.time || ''}"></label>
      <label class="f"><span>Длительность</span><select class="in" id="f-dur"><option value="">Не указана</option>${DURS.map(v => `<option value="${v}" ${t.dur === v ? 'selected' : ''}>${durTxt(v)}</option>`).join('')}</select></label>
    </div>
    <div class="row two">
      <label class="f"><span>Напоминание</span><select class="in" id="f-rem">${opt(REM, t.remind)}</select></label>
      <label class="f"><span>Ещё напоминание</span><select class="in" id="f-rem2">${opt(REM, t.rem2)}</select></label>
    </div>
    <div class="row two">
      <label class="f"><span>Напоминать, пока не выполню</span><select class="in" id="f-nag">${opt(NAG, t.nag)}</select></label>
      <label class="f"><span>Повтор задачи</span><select class="in" id="f-rep">${opt(REP, t.repeat)}</select></label>
    </div>
    <p class="hint" id="f-hint"></p>
    <div class="f"><span>Подзадачи ${kidsL.length ? `· ${subProgress(t.id).d} из ${subProgress(t.id).n}` : ''} <em>— полноценные задачи со своими сроками</em></span>${kidsL.map(k => taskLine(k, { noProj: true, noCol: false })).join('')}<input class="in" id="f-subadd" placeholder="+ Подзадача — Enter (понимает «завтра», «в 15:00», «#тег»)" maxlength="200"></div>
    <div class="f"><span>Чек-лист <em>— простые пункты без сроков</em></span><div class="chk-l" id="f-cl"></div><input class="in" id="f-cladd" placeholder="+ Новый пункт — Enter, чтобы добавить" maxlength="200"></div>
    ${F.isNew ? '' : `<div class="f"><span>Расходы по задаче ${tx.length ? '· ' + money(sumT(tx, 'expense')) : ''}</span>${tx.map(x => txRow(x)).join('') || '<p class="hint">Пока нет. Расход, привязанный к задаче, учитывается и в бюджете, и в проекте.</p>'}<div><button type="button" class="btn sm" data-act="txForTask">${ic('coin')} Добавить расход</button></div></div>
      ${cmBlock(t)}
      <p class="hint">Создана ${fmtTs(t.created)}${t.doneAt ? ' · выполнена ' + fmtTs(t.doneAt) : ''}</p>`}
  </form>
  <div class="mf">${F.isNew ? '' : `<button class="btn ghost danger" data-act="fdel">${ic('trash')} Удалить</button><button class="btn ghost" data-act="fdup">Дублировать</button><button class="btn ghost" data-act="focTask" data-id="${t.id}" title="Запустить фокус-таймер по этой задаче">${ic('timer')} Фокус${t.spent ? ' · ' + spentTxt(t.spent) : ''}</button>`}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="fsave" title="Ctrl + Enter">Сохранить</button></div></div>`);
  drawCl(); taskHint();
  setTimeout(() => { const i = $('#f-title'); if (i) { i.focus(); if (!F.isNew) i.setSelectionRange(i.value.length, i.value.length); } }, 30);
}
function drawCl() {
  const el = $('#f-cl'); if (!el || !UI.form) return;
  el.innerHTML = UI.form.t.checklist.map((c, i) => `<div class="ci ${c.d ? 'd' : ''}"><input type="checkbox" data-ci="${i}" ${c.d ? 'checked' : ''} aria-label="Выполнено"><input class="in" data-ct="${i}" value="${esc(c.t)}" aria-label="Пункт чек-листа"><button type="button" class="ib sm" data-act="fcldel" data-i="${i}" aria-label="Удалить пункт">${ic('x')}</button></div>`).join('');
}
function taskHint() {
  const d = $('#f-date').value, tm = $('#f-time').value, rem = $('#f-rem'), rem2 = $('#f-rem2'), nag = $('#f-nag'), rep = $('#f-rep'), h = $('#f-hint');
  rem.disabled = rem2.disabled = nag.disabled = rep.disabled = !d;
  if (!d) { h.textContent = 'Напоминание и повтор включаются, когда указана дата.'; return; }
  const parts = [];
  const [y, m, dd] = d.split('-').map(Number), [hh, mm] = (tm || '09:00').split(':').map(Number), due = new Date(y, m - 1, dd, hh, mm).getTime();
  const rs = [...new Set([rem.value, rem2.value].filter(v => v !== '').map(Number))].sort((a, b) => b - a);
  if (rs.length) parts.push('Напомню ' + rs.map(v => { const at = new Date(due - v * 60000); return `${human(ymd(at)).toLowerCase()} в ${pad(at.getHours())}:${pad(at.getMinutes())}`; }).join(' и ') + (tm ? '' : ' (время не указано — считаю от 9:00)') + '.');
  if (nag.value) parts.push(`После срока буду напоминать каждые ${durTxt(+nag.value)}, пока задача не выполнена (не дольше суток).`);
  if (rep.value) parts.push('После выполнения задача сама появится на следующую дату.');
  if (SM().overload) { const id = UI.form && UI.form.t.id, l = loadOf(d, id) + (+$('#f-dur').value || D.settings.defDur), c = capOf(d); parts.push(`Загрузка дня с этой задачей: ${durTxt(l)} из ${durTxt(c)}${l > c ? ' — день перегружен.' : '.'}`); h.classList.toggle('warn', l > c); }
  h.textContent = parts.join(' ');
}
function readTaskForm() {
  const t = UI.form.t;
  t.title = $('#f-title').value.trim(); t.desc = $('#f-desc').value.trim(); t.col = $('#f-col').value; t.project = $('#f-proj').value || null; t.parent = $('#f-parent').value || null;
  if ($('#f-who')) { const prev = (byId(t.id) || {}).who || null; t.who = isShared(projOf(t.project)) ? ($('#f-who').value || null) : (t.who || null); if (t.who !== prev) t.asg = t.who ? SH().me.id : null; }
  const nd = $('#f-date').value || null; if (!UI.form.isNew) { const o = byId(t.id); if (o && o.date && nd && nd > o.date) t.postponed = (o.postponed || 0) + 1; }
  t.date = nd; t.time = t.date ? ($('#f-time').value || null) : null; t.dur = +$('#f-dur').value || null;
  t.remind = t.date && $('#f-rem').value !== '' ? Number($('#f-rem').value) : null; t.rem2 = t.date && $('#f-rem2').value !== '' ? Number($('#f-rem2').value) : null; t.nag = t.date && $('#f-nag').value ? Number($('#f-nag').value) : null;
  if (t.rem2 === t.remind) t.rem2 = null; if (t.remind == null && t.rem2 != null) { t.remind = t.rem2; t.rem2 = null; } t.repeat = t.date ? ($('#f-rep').value || null) : null;
  const ad = $('#f-cladd').value.trim(); if (ad) { t.checklist.push({ t: ad, d: false }); $('#f-cladd').value = ''; }
  t.checklist = t.checklist.filter(c => c.t.trim());
  return t;
}
function saveTaskForm(keepOpen) {
  const F = UI.form, t = readTaskForm();
  if (!t.title) { $('#f-title').focus(); $('#f-title').style.borderColor = 'var(--hi)'; toast('Введите название задачи'); return false; }
  snapU(); let msg = null;
  let dateCh = F.isNew;
  if (F.isNew) { addTask(t, { quiet: true }); if (isDone(t)) msg = onComplete(t); F.isNew = false; }
  else {
    const o = byId(t.id); if (!o) { closeModal(); return false; }
    const was = isDone(o), colCh = o.col !== t.col, timeCh = o.date !== t.date || o.time !== t.time; dateCh = o.date !== t.date || o.dur !== t.dur;
    Object.assign(o, clone(t)); if (timeCh) o.snooze = null; if (colCh) o.order = tasksIn(o.col).length + 1;
    if (!was && isDone(o)) msg = onComplete(o); else if (was && !isDone(o)) o.doneAt = null; reorder(o.col);
  }
  TF.flash = t.id; save();
  if (keepOpen) return true;
  closeModal(); render(); toast(msg || 'Сохранено', true); if (dateCh) setTimeout(() => overloadCheck(byId(t.id)), 60); return true;
}

Object.assign(ACT, {
  openTask: b => openTaskForm(b.dataset.id),
  newTask: () => openTaskForm(null, taskPreset()),
  complete: b => toggleDone(b.dataset.id),
  tfilter: b => { TF.filter = b.dataset.v; render(); },
  ttag: b => { const v = b.dataset.v; TF.tags.has(v) ? TF.tags.delete(v) : TF.tags.add(v); render(); },
  renameCol: b => { TF.editingCol = b.dataset.id; render(); },
  addCol: () => { snapU(); const c = { id: uid(), title: 'Новая колонка', color: COLORS[D.columns.length % COLORS.length] }; const di = D.columns.findIndex(x => x.done); D.columns.splice(di < 0 ? D.columns.length : di, 0, c); save(); if (modalOpen()) drawSettings(); else TF.editingCol = c.id; render(); },
  archiveDone: () => { const dc = doneCol(); if (!dc) return; const L = tasksIn(dc.id); if (!L.length) return; snapU(); L.forEach(t => t.archived = true); save(); render(); toast(`В архив: ${L.length} ${plural(L.length, PT)}`, true); },
  fprio: b => { UI.form.t.prio = +b.dataset.v; $$('#f-prio button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); },
  ftag: b => { const a = UI.form.t.tags, v = b.dataset.v, i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', i < 0); },
  fcldel: b => { UI.form.t.checklist.splice(+b.dataset.i, 1); drawCl(); },
  fsave: () => { if (UI.form.kind === 'task') saveTaskForm(); else if (UI.form.kind === 'tx') saveTxForm(); else if (UI.form.kind === 'proj') saveProjectForm(); else if (UI.form.kind === 'reg') saveRegForm(); },
  fdel: () => { const F = UI.form; if (F.kind !== 'task') return ACT.fdelOther(); const t = byId(F.t.id); if (!t) return; snapU(); kids(t.id).forEach(k => k.parent = t.parent || null); D.tasks = D.tasks.filter(x => x.id !== t.id); B().tx.forEach(x => { if (x.task === t.id) x.task = null; }); save(); closeModal(); render(); toast('Задача удалена', true); },
  fdup: () => { const F = UI.form; if (F.kind !== 'task') return ACT.fdupOther(); const o = byId(F.t.id); if (!o) return; snapU(); const c = newTask({ ...clone(o), id: uid(), title: o.title + ' (копия)', created: Date.now(), doneAt: null, col: isDone(o) ? firstCol().id : o.col, order: o.order + .5 }); D.tasks.push(c); reorder(c.col); TF.flash = c.id; save(); closeModal(); render(); toast('Создана копия', true); },
  toggleSub: () => { D.settings.showSub = !D.settings.showSub; save(); render(); },
  toggleSort: () => { TF.sort = TF.sort === 'score' ? 'manual' : 'score'; render(); },
  tplFill: b => { const tpl = D.templates.find(x => x.id === b.dataset.id); if (!tpl) return; const keep = UI.form.t, t = applyTemplate(tpl, { date: keep.date, parent: keep.parent, project: keep.project }); openTaskForm(null, { ...t, id: keep.id, col: keep.col, date: keep.date || t.date, project: keep.project || t.project, parent: keep.parent }); },
  saveAsTpl: () => { const t = readTaskForm(); D.templates.push({ id: uid(), kind: 'task', name: t.title.slice(0, 40), ctx: t.project ? 'proj:' + t.project : (t.tags[0] ? 'tag:' + t.tags[0] : ''), data: { title: t.title, desc: t.desc, tags: [...t.tags], dur: t.dur, prio: t.prio, remind: t.remind, checklist: t.checklist.map(c => c.t) } }); save(); toast('Шаблон сохранён — он появится в быстром вводе и в новых задачах'); },
  txForTask: () => { if (!saveTaskForm(true)) return; const t = byId(UI.form.t.id); openTxForm(null, { task: t.id, project: t.project, tags: [...t.tags], note: t.title, back: { kind: 'task', id: t.id } }); }
});

// строка задачи для списков (проекты, обзор, теги)
function taskLine(t, o = {}) {
  const dn = isDone(t), c = colOf(t.col), td = today(), over = !dn && t.date && t.date < td;
  return `<div class="lrow" data-act="openTask" data-id="${t.id}" style="--c:${c ? c.color : 'var(--mute)'}"><button class="ichk ${dn ? 'on' : ''}" data-act="complete" data-id="${t.id}" aria-label="${dn ? 'Вернуть в работу' : 'Отметить выполненной'}">${ic('check')}</button>
    <div class="tx"><b style="${dn ? 'text-decoration:line-through;color:var(--mute)' : ''}">${esc(t.title)}</b><small>${[o.noCol ? '' : c ? c.title : '', t.date ? `<span style="${over ? 'color:var(--hi);font-weight:600' : ''}">${over ? 'просрочено · ' : ''}${dueTxt(t)}</span>` : ''].filter(Boolean).join(' · ')} ${o.noProj ? '' : projChip(projOf(t.project))} ${tagsHtml(t)}</small></div>
    ${t.prio === 2 && !dn ? '<span class="pri-t">Срочно</span>' : t.prio === 1 && !dn ? '<span class="pri-t" style="color:var(--mid)">Важно</span>' : ''}</div>`;
}
