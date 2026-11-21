'use strict';
// ============================================================
//  Сборка приложения: меню, переходы, поиск, теги, события, напоминания
// ============================================================
Object.assign(ICONS, {
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.8 14.8c2 .6 3.3 2.4 3.7 5.2"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 15.5M20 20v-4.5h-4.5"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'
});
function drawSide() {
  const mods = MODULES.filter(m => modOn(m.id));
  const act = D.projects.filter(p => p.status === 'active');
  $('#side').innerHTML = mods.map((m, i) => { const b = m.badge ? m.badge() : '', bv = typeof b === 'object' ? b : { v: b }; return `<button class="nav ${UI.view === m.id ? 'on' : ''}" data-act="go" data-v="${m.id}" title="${m.title}  (${i + 1})">${ic(m.icon)}<span>${m.title}</span>${bv.v ? `<span class="badge ${bv.soft ? 'soft' : ''}">${bv.v}</span>` : ''}</button>`; }).join('')
    + (modOn('projects') && (act.length || D.folders.length) ? `<div class="sideh"><span>Проекты</span><button class="ib sm" data-act="fNew" data-id="" title="Новая папка" aria-label="Новая папка">${ic('folderPlus')}</button></div>${act.filter(p => !p.folder || !folderOf(p.folder)).map(p => sideProj(p, 0)).join('')}${sideFolders(null, 0)}` : '')
    + (D.tags.length ? `<div class="sideh"><span>Теги</span></div>${D.tags.slice(0, 10).map(t => `<button class="sproj" data-act="openTag" data-id="${t.id}" style="--c:${t.color}" title="#${esc(t.title)}"><i style="border-radius:50%"></i><span>#${esc(t.title)}</span></button>`).join('')}` : '')
    + (MOB() ? `<div class="grow"></div><button class="nav" data-act="help">${ic('help')}<span>Справка</span></button>${LK.status.enabled ? `<button class="nav" data-act="lockNow">${ic('lock')}<span>Заблокировать</span></button>` : ''}<button class="nav" data-act="settings">${ic('gear')}<span>Настройки</span></button>`
      : `<div class="grow"></div><button class="nav" data-act="toggleSide" title="Свернуть или развернуть меню">${ic('menu')}<span>${D.settings.collapsed ? 'Развернуть' : 'Свернуть меню'}</span></button><button class="nav" data-act="settings" title="Настройки">${ic('gear')}<span>Настройки</span></button>`);
  drawTabbar(mods);
}
// ---- телефон: нижняя панель разделов и выдвижное меню «Ещё» ----
const TAB_MAIN = ['dashboard', 'board', 'calendar', 'budget', 'projects'];
function drawTabbar(mods) {
  const tb = $('#tabbar'); if (!MOB()) { tb.innerHTML = ''; return; }
  const main = TAB_MAIN.map(id => mods.find(m => m.id === id)).filter(Boolean).slice(0, 4), inMore = !main.some(m => m.id === UI.view);
  tb.innerHTML = main.map(m => { const b = m.badge ? m.badge() : '', v = typeof b === 'object' ? b.v : b; return `<button class="${UI.view === m.id ? 'on' : ''}" data-act="go" data-v="${m.id}">${ic(m.icon)}<span>${m.id === 'dashboard' ? 'Обзор' : m.title}</span>${v && !(typeof b === 'object' && b.soft) ? `<i class="tbadge">${v}</i>` : ''}</button>`; }).join('')
    + `<button class="${inMore || document.body.classList.contains('sideopen') ? 'on' : ''}" data-act="sideOpen">${ic('menu')}<span>Ещё</span></button>`;
}
function sideOpen(on) { document.body.classList.toggle('sideopen', on); drawTabbar(MODULES.filter(m => modOn(m.id))); }
// ---- нижний лист действий (телефон: долгое нажатие на карточку) ----
function sheet(h) { const el = $('#sheet'); el.innerHTML = `<div class="shbox" role="dialog">${h}</div>`; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
function closeSheet() { const el = $('#sheet'); el.classList.remove('open'); el.innerHTML = ''; el.setAttribute('aria-hidden', 'true'); }
const sheetOpen = () => $('#sheet').classList.contains('open');
function taskSheet(id) {
  const t = byId(id); if (!t) return; const dn = isDone(t), td = today();
  sheet(`<div class="shh"><b>${esc(t.title)}</b><small>${t.date ? dueTxt(t) : 'без даты'}${projOf(t.project) ? ' · ' + esc(projOf(t.project).title) : ''}</small></div>
    <div class="shg"><button data-act="shOpen" data-id="${id}">${ic('edit')}<span>Открыть</span></button><button data-act="shDone" data-id="${id}">${ic('check')}<span>${dn ? 'В работу' : 'Готово'}</span></button><button data-act="shDate" data-id="${id}" data-v="${td}">${ic('clock')}<span>Сегодня</span></button><button data-act="shDate" data-id="${id}" data-v="${addDays(td, 1)}">${ic('cal')}<span>Завтра</span></button></div>
    <div class="shl"><span>Переместить в колонку</span><div class="chips">${D.columns.map(c => `<button class="chip ${c.id === t.col ? 'on' : ''}" data-act="shCol" data-id="${id}" data-v="${c.id}">${esc(c.title)}</button>`).join('')}</div></div>
    <div class="shf"><button class="btn ghost" data-act="shDate" data-id="${id}" data-v="">Убрать дату</button><span class="spacer"></span><button class="btn ghost danger" data-act="shDel" data-id="${id}">${ic('trash')} Удалить</button></div>`);
}
function sideProj(p, dep) { return `<button class="sproj" data-act="openProject" data-id="${p.id}" style="--c:${p.color};padding-left:${dep ? .95 + dep * 1.05 : .75}rem" title="${esc(p.title)}"><i></i><span>${esc(p.title)}</span>${isShared(p) ? `<b class="shic" title="Общий проект">${ic('users')}</b>` : ''}<small>${projStats(p).pct}%</small></button>`; }
function sideFolders(pid, dep) {
  return subFolders(pid).map(f => { const ps = D.projects.filter(p => p.folder === f.id && p.status === 'active'), inner = sideFolders(f.id, dep + 1); if (!ps.length && !inner && dep > 0) return ''; return `<div class="sfold" data-fdrop="${f.id}"><button class="sproj fold" data-act="fToggle" data-id="${f.id}" style="--c:${f.color || 'var(--mute)'};padding-left:${.35 + dep * 1.05}rem;gap:.4rem" title="${esc(f.title)}"><span class="fc ${f.open !== false ? 'open' : ''}">${ic('caret')}</span>${ic('folder')}<span>${esc(f.title)}</span></button>${f.open !== false ? ps.map(p => sideProj(p, dep + 1)).join('') + inner : ''}</div>`; }).join('');
}
function render() {
  if (UI.locked || !D) return;
  const m = MODULES.find(x => x.id === UI.view && modOn(x.id)) || MODULES.find(x => modOn(x.id)) || MODULES[0];
  const same = UI.lastView === m.id;
  const sc = {}; $$('.cards').forEach(c => sc[c.dataset.drop] = c.scrollTop);
  const bs = $('#board') ? $('#board').scrollLeft : 0, ms = $('#main .scroll') ? $('#main .scroll').scrollTop : 0;
  if (m.before && same) m.before();
  UI.view = m.id;
  destroyCharts('main');
  drawSide();
  $('#bar').innerHTML = m.bar() + (D.demo ? `<span class="demo">Это пример заполнения<button class="btn sm pri" data-act="clearDemo">Очистить и начать</button><button class="btn sm ghost" data-act="keepDemo">Оставить</button></span>` : '');
  $('#main').innerHTML = m.render();
  if (same) { $$('.cards').forEach(c => { if (sc[c.dataset.drop]) c.scrollTop = sc[c.dataset.drop]; }); if ($('#board')) $('#board').scrollLeft = bs; if ($('#main .scroll')) $('#main .scroll').scrollTop = ms; }
  if (m.after) m.after();
  UI.lastView = m.id;
}
function go(v) { UI.view = v; closeSearch(); closeDD(); closeSheet(); document.body.classList.remove('sideopen', 'msearch'); if (UI.lastView !== v) UI.lastView = null; render(); }

// ---------- глобальный поиск ----------
let SR = [], srI = 0;
function searchAll(q) {
  q = q.trim().toLowerCase().replace(/^#/, ''); if (!q) return [];
  let out = D.tags.filter(t => t.title.toLowerCase().includes(q)).map(t => ({ group: 'Теги', title: '#' + t.title, sub: '', color: t.color, act: 'openTag', id: t.id }));
  for (const m of MODULES) if (m.search && modOn(m.id)) out = out.concat(m.search(q));
  return out;
}
function drawSearch() {
  const el = $('#sres'), q = $('#q').value;
  if (!q.trim()) { el.classList.remove('open'); return; }
  SR = searchAll(q); srI = Math.min(srI, Math.max(0, SR.length - 1));
  let g = '', h = '';
  SR.forEach((r, i) => { if (r.group !== g) { g = r.group; h += `<h4>${g}</h4>`; } h += `<button class="sri ${i === srI ? 'on' : ''}" data-act="sres" data-i="${i}" role="option"><span class="dot" style="--c:${r.color}"></span>${esc(r.title)}<small>${esc(r.sub || '')}</small></button>`; });
  el.innerHTML = h || '<p class="hint" style="padding:.8rem">Ничего не найдено</p>';
  el.classList.add('open');
}
function closeSearch() { $('#sres').classList.remove('open'); }
function closeDD() { $('#newdd').classList.remove('open'); }

// ---------- просмотр по тегу: всё, что связано ----------
function openTag(id) {
  const t = tagOf(id); if (!t) return;
  const ts = live().filter(x => (x.tags || []).includes(id)), tx = B().tx.filter(x => (x.tags || []).includes(id)).sort((a, b) => b.date.localeCompare(a.date));
  const act = ts.filter(x => !isDone(x)), exp = sumT(tx, 'expense'), inc = sumT(tx, 'income');
  const pr = [...new Set(ts.map(x => x.project).concat(tx.map(x => x.project)).filter(Boolean))].map(projOf).filter(Boolean);
  modal(`<div class="mbox wide"><div class="mh"><h2><span style="color:${t.color}">#</span>${esc(t.title)}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <div class="mb"><div class="gridk" style="margin:0">
    <div class="kpi"><span>${ic('list')} Задачи</span><b>${act.length}</b><small>в работе · ${ts.length - act.length} выполнено</small></div>
    <div class="kpi"><span>${ic('down')} Расходы</span><b style="color:var(--exp)">${money0(exp)}</b><small>${tx.filter(x => x.type === 'expense').length} ${plural(tx.filter(x => x.type === 'expense').length, POP)}</small></div>
    <div class="kpi"><span>${ic('up')} Доходы</span><b style="color:var(--inc)">${money0(inc)}</b><small>${tx.filter(x => x.type === 'income').length} ${plural(tx.filter(x => x.type === 'income').length, POP)}</small></div>
    <div class="kpi"><span>${ic('proj')} Проекты</span><b>${pr.length}</b><small>${pr.map(p => esc(p.title)).join(', ') || 'нет'}</small></div></div>
    ${tx.length > 1 ? '<section class="pan"><div class="ph2"><h2>Расходы по месяцам</h2></div><div class="chartbox sm"><canvas id="ch-tag"></canvas></div></section>' : ''}
    <div class="grid2"><section class="pan"><div class="ph2"><h2>Задачи</h2></div>${act.concat(ts.filter(isDone)).map(x => taskLine(x)).join('') || '<div class="empty">Задач с этим тегом нет</div>'}</section>
    <section class="pan"><div class="ph2"><h2>Операции</h2></div>${tx.slice(0, 40).map(x => txRow(x)).join('') || '<div class="empty">Операций с этим тегом нет</div>'}</section></div></div>
  <div class="mf"><button class="btn" data-act="tagOnBoard" data-id="${id}">${ic('board')} Показать на доске</button><button class="btn ghost" data-act="tagOps" data-id="${id}">${ic('wallet')} Операции в бюджете</button><span class="spacer"></span><button class="btn ghost" data-act="settings" data-v="tags">Изменить теги</button><button class="btn pri" data-act="mclose">Закрыть</button></div></div>`);
  if (tx.length > 1) {
    const ms = [...Array(6)].map((_, i) => mAdd(mkey(today()), i - 5));
    chart('ch-tag', { type: 'bar', data: { labels: ms.map(m => MNS[+m.slice(5) - 1]), datasets: [{ label: 'Расходы', data: ms.map(m => sumT(tx.filter(x => x.date.startsWith(m)), 'expense')), backgroundColor: t.color, borderRadius: 6, maxBarThickness: 30 }] }, options: { scales: { y: { ...axisMoney, beginAtZero: true }, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => money0(c.parsed.y) } } } } }, 'modal');
  }
}

// ---------- напоминания ----------
function beep() {
  if (D.settings.sound === false) return;
  try { const a = new AudioContext(); [[880, 0], [1175, .18]].forEach(([f, t0]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0, a.currentTime + t0); g.gain.linearRampToValueAtTime(.18, a.currentTime + t0 + .02); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t0 + .35); o.connect(g).connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + .4); }); } catch (e) {}
}
function showAlert(id) {
  const t = byId(id); if (!t || $(`.al[data-id="${id}"]`)) return;
  const el = document.createElement('div'); el.className = 'al'; el.dataset.id = id;
  el.innerHTML = `<div class="ah">${ic('bell')} Напоминание<button class="ib sm" data-act="alClose" aria-label="Закрыть">${ic('x')}</button></div><b>${esc(t.title)}</b><p>${t.date ? dueTxt(t) : ''}${projOf(t.project) ? ' · ' + esc(projOf(t.project).title) : ''}</p><div class="ab"><button class="btn sm pri" data-act="alDone" data-id="${id}">Готово</button><button class="btn sm" data-act="alSnooze" data-id="${id}" data-v="10">Через 10 мин</button><button class="btn sm" data-act="alSnooze" data-id="${id}" data-v="60">Через час</button><button class="btn sm ghost" data-act="alOpen" data-id="${id}">Открыть</button></div>`;
  $('#alerts').appendChild(el); if (document.hasFocus() || !hasApi) beep();
}
function showPayAlert(id) {
  const r = regOf(id); if (!r || $(`.al[data-pay="${id}"]`)) return;
  const el = document.createElement('div'); el.className = 'al pay'; el.dataset.pay = id;
  el.innerHTML = `<div class="ah">${ic('coin')} Платёж<button class="ib sm" data-act="alClose" aria-label="Закрыть">${ic('x')}</button></div><b>${esc(r.title)} — ${money(r.amount)}</b><p>Срок: ${dayLong(r.nextDate)}</p><div class="ab"><button class="btn sm pri" data-act="alPay" data-id="${id}">Оплачено</button><button class="btn sm ghost" data-act="alReg" data-id="${id}">Открыть</button></div>`;
  $('#alerts').appendChild(el); if (document.hasFocus() || !hasApi) beep();
}
function webReminders() {
  const now = Date.now(); let ch = false;
  for (const t of live()) {
    if (isDone(t)) continue; const f = [];
    if (t.remind != null && t.date) { const [y, m, d] = t.date.split('-').map(Number), [hh, mm] = (t.time || '09:00').split(':').map(Number); const at = new Date(y, m - 1, d, hh, mm).getTime() - t.remind * 60000; f.push([t.id + ':' + at, at]); }
    if (t.snooze) f.push([t.id + ':s' + t.snooze, t.snooze]);
    for (const [k, at] of f) if (at <= now && now - at < 12 * 3600e3 && !D.notified[k]) { D.notified[k] = now; ch = true; showAlert(t.id); }
  }
  for (const r of B().regular) { if (r.active === false || r.remind == null) continue; const [y, m, d] = r.nextDate.split('-').map(Number), at = new Date(y, m - 1, d, 10).getTime() - r.remind * 864e5, k = 'pay:' + r.id + ':' + r.nextDate; if (at <= now && now - at < 3 * 864e5 && !D.notified[k]) { D.notified[k] = now; ch = true; showPayAlert(r.id); } }
  if (ch) save();
}

// ---------- общие действия ----------
function zoomBy(d) { const z = Math.round(Math.max(.7, Math.min(1.6, (D.settings.zoom || 1) + d)) * 100) / 100; D.settings.zoom = z; applyAppearance(); save(); toast('Масштаб ' + Math.round(z * 100) + '%'); if (UI.settab === 'look') drawSettings(); render(); }
Object.assign(ACT, {
  undo: () => undo(), mclose: () => closeModal(),
  toggleSide: () => { D.settings.collapsed = !D.settings.collapsed; applyAppearance(); save(); drawSide(); setTimeout(render, 220); },
  newMenu: () => {
    const dd = $('#newdd'); if (dd.classList.contains('open')) return closeDD();
    const items = [['quick', 'spark', 'Быстрый ввод', 'Q'], modOn('board') && ['newTask', 'list', 'Задача', 'N'], modOn('budget') && ['newTx', 'down', 'Расход', 'R', 'expense'], modOn('budget') && ['newTx', 'up', 'Доход', '', 'income'], modOn('budget') && ['newTx', 'swap', 'Перевод', '', 'transfer'], modOn('budget') && ['newReg', 'repeat', 'Регулярный платёж'], modOn('projects') && ['newProject', 'proj', 'Проект'], modOn('projects') && ['fNew', 'folderPlus', 'Папка'], modOn('projects') && ['projFromTpl', 'copy', 'Проект из шаблона'], ['tagCreate', 'tag', 'Тег']].filter(Boolean);
    dd.innerHTML = items.map(([a, i, l, k, v]) => `<button data-act="${a}" ${v ? `data-v="${v}"` : ''} role="menuitem">${ic(i)}${l}${k ? `<kbd>${k}</kbd>` : ''}</button>`).join('');
    dd.classList.add('open');
  },
  tagCreate: () => { closeDD(); openSettings('tags'); ACT.tagAdd(); },
  sres: b => { const r = SR[+b.dataset.i]; if (!r) return; closeSearch(); $('#q').blur(); ACT[r.act]({ dataset: { id: r.id } }); },
  openTag: b => openTag(b.dataset.id),
  tagOnBoard: b => { TF.tags.clear(); TF.tags.add(b.dataset.id); TF.filter = 'all'; closeModal(); go('board'); },
  tagOps: b => { BF.f = { type: '', cat: '', acc: '', proj: '', tag: b.dataset.id }; BF.tab = 'ops'; closeModal(); go('budget'); },
  tagNewInline: b => { const inp = document.createElement('input'); inp.className = 'in'; inp.style.cssText = 'width:11rem;height:2rem;border-radius:99px'; inp.placeholder = 'название и Enter'; inp.dataset.newtag = b.dataset.v; b.replaceWith(inp); inp.focus(); },
  clearDemo: () => { if ($('#tour').classList.contains('open')) tourEnd(); snapU(); resetData('example').then(ok => toast(ok ? 'Пример удалён и сохранён — планер пуст' : 'Пример удалён, но сохранить не удалось — см. Настройки → Данные', true)); },
  keepDemo: () => { D.demo = false; save(); render(); },
  alClose: b => b.closest('.al').remove(),
  alDone: b => { b.closest('.al').remove(); const t = byId(b.dataset.id); if (t && !isDone(t)) toggleDone(t.id); },
  alSnooze: b => { b.closest('.al').remove(); const t = byId(b.dataset.id); if (!t) return; t.snooze = Date.now() + (+b.dataset.v) * 60000; save(); toast(`Напомню ${b.dataset.v === '60' ? 'через час' : 'через 10 минут'}`); },
  alOpen: b => { b.closest('.al').remove(); openTaskForm(b.dataset.id); },
  alPay: b => { b.closest('.al').remove(); const r = regOf(b.dataset.id); if (r) payRegular(r); },
  alReg: b => { b.closest('.al').remove(); openRegForm(b.dataset.id); },
  sideOpen: () => sideOpen(!document.body.classList.contains('sideopen')), sideClose: () => sideOpen(false),
  mSearch: () => { const on = !document.body.classList.contains('msearch'); document.body.classList.toggle('msearch', on); if (on) setTimeout(() => $('#q').focus(), 30); else { $('#q').blur(); closeSearch(); } },
  shClose: () => closeSheet(),
  shOpen: b => { closeSheet(); openTaskForm(b.dataset.id); },
  shDone: b => { closeSheet(); toggleDone(b.dataset.id); },
  shDate: b => { const t = byId(b.dataset.id); closeSheet(); if (!t) return; snapU(); setTaskDate(t, b.dataset.v || null, b.dataset.v ? undefined : null); save(); render(); toast(b.dataset.v ? 'Срок: ' + human(b.dataset.v).toLowerCase() : 'Дата убрана', true); },
  shCol: b => { closeSheet(); moveTask(b.dataset.id, b.dataset.v, null); },
  shDel: b => { const t = byId(b.dataset.id); closeSheet(); if (!t) return; snapU(); kids(t.id).forEach(k => k.parent = t.parent || null); D.tasks = D.tasks.filter(x => x.id !== t.id); B().tx.forEach(x => { if (x.task === t.id) x.task = null; }); save(); render(); toast('Задача удалена', true); }
});
// долгое нажатие (или правая кнопка мыши) на карточке задачи — лист быстрых действий
document.addEventListener('contextmenu', e => {
  if (UI.locked || modalOpen()) return;
  const c = e.target.closest && e.target.closest('.card[data-id],.ad[data-id],.mi[data-id],.blk[data-id]'); if (!c || !byId(c.dataset.id)) return;
  e.preventDefault(); if (dragBlk) { dragBlk = null; } taskSheet(c.dataset.id);
});

// ============================================================
//  События
// ============================================================
document.addEventListener('click', e => {
  if (UI.locked && !e.target.closest('#lock')) return;
  if (e.target.id === 'modal') { if (UI.form && (UI.form.pk === 'afterRecovery' || UI.form.kind === 'code')) return; return closeModal(); }
  if (e.target.id === 'tour') return tourEnd();
  if (e.target.id === 'sheet') return closeSheet();
  if (sheetOpen() && !e.target.closest('#sheet')) closeSheet();
  if (!e.target.closest('#gsearch')) closeSearch();
  if (!e.target.closest('.newmenu')) closeDD();
  if (e.target.classList && e.target.classList.contains('dcol') && !dragBlk) {
    const r = e.target.getBoundingClientRect(), H = HHpx(), m = Math.max(0, Math.min(1410, Math.floor((e.clientY - r.top) / H * 2) * 30));
    return openTaskForm(null, { date: e.target.dataset.day, time: fromMin(m), dur: 60 });
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const f = ACT[b.dataset.act]; if (f) { e.preventDefault(); e.stopPropagation(); f(b); }
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'tform') return saveTaskForm();
  if (f.id === 'xform') return saveTxForm();
  if (f.id === 'rform') return saveRegForm();
  if (f.id === 'pform') return saveProjectForm();
  if (f.id === 'cform') return ACT.catSave();
  if (f.id === 'aform') return ACT.accSave();
  if (f.id === 'ruleform') return ACT.rlSave();
  if (f.id === 'tplform') return ACT.tpSave();
  if (f.id === 'fform') return ACT.foSave();
  if (f.classList.contains('cadd')) {
    const i = f.querySelector('input'), v = i.value.trim(); if (!v) return;
    const pre = taskPreset(); if (f.dataset.proj) pre.project = f.dataset.proj; if (f.dataset.date) pre.date = f.dataset.date; pre.col = f.dataset.col;
    if (SM().parser) { const p = parseSmart(v); if (p.kind !== 'task' && !modOn('budget')) p.kind = 'task'; if (p.kind === 'task' && !p.title) return toast('Не хватает названия задачи'); createFromParse(p, pre); }
    else { snapU(); const t = newTask({ title: v, ...pre }); addTask(t); TF.flash = t.id; save(); render(); }
    const sel = f.dataset.proj ? `.cadd[data-proj="${f.dataset.proj}"] input` : f.dataset.date ? `.cadd[data-date] input` : `.cadd[data-col="${f.dataset.col}"] input`;
    const ni = $(sel); if (ni) ni.focus();
  }
});
let qT = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { UI.q = t.value.trim(); srI = 0; drawSearch(); clearTimeout(qT); qT = setTimeout(() => { if (['board', 'calendar'].includes(UI.view) || (UI.view === 'budget' && BF.tab === 'ops')) render(); }, 150); return; }
  if (UI.form && UI.form.kind === 'task' && t.dataset.ct !== undefined) { UI.form.t.checklist[+t.dataset.ct].t = t.value; return; }
  if (t.id === 'qk') { QK.sel = -1; quickUpd(); return; }
  if (t.id === 'hq') { drawHelp(t.value); return; }
  if (t.closest && t.closest('.cadd') && SM().parser) { const f = t.closest('.cadd'); let pv = f.querySelector('.qp'); if (!pv) { pv = document.createElement('div'); pv.className = 'qp mini'; f.appendChild(pv); } const pre = taskPreset(); if (f.dataset.date) pre.date = f.dataset.date; pv.innerHTML = t.value.trim() ? parsePreviewHtml(parseSmart(t.value), pre) : ''; return; }
  if (t.id === 'f-title' && UI.form && UI.form.isNew && SM().suggest) { UI.sugList = suggest(t.value, 'task').filter(x => x.type === 'hist'); UI.sugCb = sg => { const o = byId(sg.id); if (!o) return; t.value = o.title; $('#f-dur').value = o.dur || ''; if (o.project) $('#f-proj').value = o.project; UI.form.t.tags = [...new Set([...UI.form.t.tags, ...(o.tags || [])])]; $('#f-tags').innerHTML = tagPick(UI.form.t.tags, 'ftag'); if (o.checklist.length && !UI.form.t.checklist.length) { UI.form.t.checklist = o.checklist.map(c => ({ t: c.t, d: false })); drawCl(); } UI.form.t.prio = o.prio; $$('#f-prio button').forEach(x => x.classList.toggle('on', +x.dataset.v === o.prio)); $('#f-sug').innerHTML = ''; }; $('#f-sug').innerHTML = UI.sugList.length && t.value.trim().length > 1 ? suggHtml(UI.sugList, -1) : ''; return; }
  if (t.id === 'x-note' && UI.form && UI.form.kind === 'tx') {
    const x = UI.form.x; if (SM().autocat && !UI.form.catTouched && x.type !== 'transfer' && $('#x-cat')) { const c = guessCategory(t.value, x.type); if (c && $('#x-cat').value !== c) { $('#x-cat').value = c; $('#x-hint').textContent = `Категория «${catOf(c).title}» подобрана по комментарию`; } }
    if (SM().suggest && UI.form.isNew) { UI.sugList = suggest(t.value, 'tx').filter(s => s.type === 'txh'); UI.sugCb = sg => { const o = txOf(sg.id); if (!o) return; t.value = o.note; $('#x-amount').value = String(o.amount).replace('.', ','); if ($('#x-cat') && o.type === x.type) $('#x-cat').value = o.category; $('#x-sug').innerHTML = ''; }; $('#x-sug').innerHTML = UI.sugList.length && t.value.trim().length > 1 ? suggHtml(UI.sugList, -1) : ''; }
    return;
  }
  if (UI.form && UI.form.kind === 'rule' && (t.id === 'rl-name' || t.dataset.cv !== undefined || t.dataset.av !== undefined)) { $('#rl-sum').innerHTML = ruleText(readRule()); return; }
  if (t.dataset.colt) { colOf(t.dataset.colt).title = t.value.trim() || 'Без названия'; save(); render(); return; }
  if (t.dataset.tagt) { tagOf(t.dataset.tagt).title = t.value.trim().replace(/^#/, '').toLowerCase() || 'тег'; save(); render(); return; }
  if (t.id === 's-fs') { $('#o-fs').textContent = t.value + ' px'; D.settings.fontSize = +t.value; applyAppearance(); save(); return; }
  if (t.id === 's-zoom') { $('#o-zoom').textContent = t.value + '%'; return; }
});
document.addEventListener('change', e => {
  const t = e.target, F = UI.form;
  if (F && F.kind === 'task') {
    if (t.dataset.ci !== undefined) { F.t.checklist[+t.dataset.ci].d = t.checked; t.closest('.ci').classList.toggle('d', t.checked); return; }
    if (['f-date', 'f-time', 'f-rem', 'f-rep'].includes(t.id)) { if (t.id === 'f-time' && t.value && !$('#f-dur').value) $('#f-dur').value = '60'; if (t.id === 'f-date' && !t.value) { $('#f-rem').value = ''; $('#f-rep').value = ''; } taskHint(); return; }
  }
  if (F && F.kind === 'task' && t.id === 'f-proj' && $('#f-whow')) { $('#f-whow').hidden = !isShared(projOf(t.value)); return; }
  if (F && F.kind === 'tx' && t.id === 'x-proj') { const ct = F.catTouched; readTx(); drawTxForm(); UI.form.catTouched = ct; return; }
  if (F && F.kind === 'tx' && t.id === 'x-cat') { F.catTouched = true; $('#x-hint').textContent = ''; return; }
  if (F && F.kind === 'rule') {
    const r = readRule(), k = kindOf(r.trigger);
    if (t.id === 'rl-trig') { const nk = kindOf(t.value); r.trigger = t.value; if (nk !== k) { r.cond = [{ f: FIELDS[nk][0][0], op: OPS[FIELDS[nk][0][2]][0][0], v: '' }]; r.act = [{ t: ACTS[nk][0][0], v: '' }]; } return drawRuleForm(); }
    if (t.dataset.cf !== undefined) { const c = r.cond[+t.dataset.cf]; c.f = t.value; c.op = OPS[fieldDef(k, c.f)[2]][0][0]; c.v = ''; return drawRuleForm(); }
    if (t.dataset.co !== undefined) { r.cond[+t.dataset.co].op = t.value; return drawRuleForm(); }
    if (t.dataset.at !== undefined) { const a = r.act[+t.dataset.at]; a.t = t.value; a.v = ({ setDate: '0', setRemind: '15', setDur: '30', setPrio: '2' })[a.t] || (a.t === 'setProject' ? (D.projects[0] || {}).id || '' : a.t === 'moveCol' ? D.columns[0].id : a.t === 'setCategory' ? (B().categories[0] || {}).id : ''); return drawRuleForm(); }
    $('#rl-sum').innerHTML = ruleText(r); return;
  }
  if (t.dataset.rule) { const r = D.rules.find(x => x.id === t.dataset.rule); if (r) { r.on = t.checked; save(); render(); } return; }
  if (t.dataset.sm) { D.settings.smart[t.dataset.sm] = t.checked; save(); render(); return; }
  if (t.dataset.cap !== undefined) { D.settings.capacity[+t.dataset.cap] = Math.max(0, Math.round((parseFloat(String(t.value).replace(',', '.')) || 0) * 60)); save(); render(); return; }
  if (t.id === 's-defdur') { D.settings.defDur = +t.value; save(); render(); return; }
  if (t.id === 's-fs') { render(); return; }
  if (t.id === 's-zoom') { D.settings.zoom = +t.value / 100; applyAppearance(); save(); render(); return; }
  if (t.id === 's-coll') { D.settings.collapsed = t.checked; applyAppearance(); save(); render(); return; }
  if (t.id === 's-auto') { window.api.setAutostart(t.checked).then(v => { t.checked = v; toast(v ? 'Планер будет запускаться вместе с Windows' : 'Автозапуск выключен'); }); return; }
  if (t.id === 's-tray') { D.settings.closeToTray = t.checked; save(); return; }
  if (t.id === 's-sound') { D.settings.sound = t.checked; save(); if (t.checked) beep(); return; }
  if (t.id === 's-start') { D.settings.startView = t.value; save(); return; }
  if (t.id === 's-cur') { D.settings.currency = t.value; save(); render(); drawSettings(); return; }
  if (t.dataset.mod) { const on = MODULES.filter(m => modOn(m.id)); if (!t.checked && on.length < 2) { t.checked = true; return toast('Хотя бы один модуль должен остаться'); } D.settings.modules[t.dataset.mod] = t.checked; if (!modOn(D.settings.startView)) D.settings.startView = MODULES.find(m => modOn(m.id)).id; save(); render(); drawSettings(); return; }
  if (t.dataset.cold) { D.columns.forEach(c => { c.done = c.id === t.dataset.cold; if (!c.done) delete c.done; }); save(); render(); return; }
  if (t.id === 's-file' && t.files[0]) { t.files[0].text().then(importText); return; }
  if (t.id === 'tproj') { TF.proj = t.value; render(); return; }
  if (t.id && t.id.startsWith('of-')) { BF.f[t.id.slice(3)] = t.value; render(); return; }
});
document.addEventListener('focusout', e => {
  if (e.target.id === 'colname') { const c = colOf(TF.editingCol); if (c) { c.title = e.target.value.trim() || c.title; save(); } TF.editingCol = null; setTimeout(render, 0); }
});
document.addEventListener('keydown', e => {
  const t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName), k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if ($('#lock').classList.contains('open') || UI.locked || !D) return;
  if (mod && (k === 'l' || k === 'д')) { e.preventDefault(); return lockNow(); }
  if ($('#tour').classList.contains('open')) { if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); ACT.tourNext(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); ACT.tourPrev(); } else if (e.key === 'Escape') tourEnd(); return; }
  if (e.key === 'F1') { e.preventDefault(); return openHelp(); }
  if (t.id === 'qk') {
    if (e.key === 'ArrowDown') { e.preventDefault(); QK.sel = Math.min(QK.sug.length - 1, QK.sel + 1); quickUpd(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); QK.sel = Math.max(-1, QK.sel - 1); quickUpd(); return; }
    if (e.key === 'Tab') { e.preventDefault(); const p = parseSmart(t.value); QK.force = (QK.force || (p.kind === 'task' ? 'task' : 'tx')) === 'task' ? 'tx' : 'task'; quickUpd(); return; }
    if (e.key === 'Enter') { e.preventDefault(); return quickSubmit(); }
  }
  if (t.id === 'f-subadd' && e.key === 'Enter') {
    e.preventDefault(); const v = t.value.trim(); if (!v || !UI.form) return;
    if (!saveTaskForm(true)) return; const par = byId(UI.form.t.id);
    const p = SM().parser ? parseSmart(v) : { title: v, tags: [], parts: [], kind: 'task' }; p.kind = 'task';
    const c = newTask({ title: p.title || v, parent: par.id, project: p.project || par.project, tags: [...new Set([...(par.tags || []), ...tagIdsFromNames(p.tags || [])])], date: p.date || null, time: p.time || null, dur: p.dur || null, prio: p.prio || 0, col: firstCol().id });
    addTask(c); save(); openTaskForm(par.id); render(); setTimeout(() => $('#f-subadd')?.focus(), 40); return;
  }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); return zoomBy(.1); }
  if (mod && (e.key === '-' || e.key === '_')) { e.preventDefault(); return zoomBy(-.1); }
  if (mod && e.key === '0') { e.preventDefault(); D.settings.zoom = 1; return zoomBy(0); }
  if (t.id === 'colname') { if (e.key === 'Enter') t.blur(); if (e.key === 'Escape') { t.value = colOf(TF.editingCol).title; t.blur(); } return; }
  if (t.dataset && t.dataset.newtag && e.key === 'Enter') {
    e.preventDefault(); const v = t.value.trim().replace(/^#/, '').toLowerCase(); if (!v) return;
    let tg = D.tags.find(x => x.title === v); if (!tg) { tg = { id: uid(), title: v, color: COLORS[D.tags.length % COLORS.length] }; D.tags.push(tg); save(); }
    const act = t.dataset.newtag, arr = act === 'ftag' ? UI.form.t.tags : UI.form.x.tags; if (!arr.includes(tg.id)) arr.push(tg.id);
    t.closest('.tagpick').parentNode.innerHTML = tagPick(arr, act); return;
  }
  if (t.id === 'q') {
    if (e.key === 'ArrowDown') { e.preventDefault(); srI = Math.min(SR.length - 1, srI + 1); drawSearch(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); srI = Math.max(0, srI - 1); drawSearch(); return; }
    if (e.key === 'Enter') { e.preventDefault(); const r = SR[srI]; if (r) { closeSearch(); t.blur(); ACT[r.act]({ dataset: { id: r.id } }); } return; }
    if (e.key === 'Escape') { t.value = ''; UI.q = ''; closeSearch(); t.blur(); render(); return; }
  }
  if (UI.form && mod && e.key === 'Enter') { e.preventDefault(); const kd = UI.form.kind; if (kd === 'cat') return ACT.catSave(); if (kd === 'acc') return ACT.accSave(); return ACT.fsave(); }
  if (UI.form && UI.form.kind === 'task' && t.id === 'f-cladd' && e.key === 'Enter') { e.preventDefault(); const v = t.value.trim(); if (v) { UI.form.t.checklist.push({ t: v, d: false }); t.value = ''; drawCl(); } return; }
  if (UI.form && t.dataset.ct !== undefined && e.key === 'Enter') { e.preventDefault(); $('#f-cladd').focus(); return; }
  if (mod && (k === 'f' || k === 'а')) { e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
  if (mod && (k === 'z' || k === 'я') && !typing) { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') { if (sheetOpen()) closeSheet(); else if ($('#newdd').classList.contains('open')) closeDD(); else if (modalOpen()) closeModal(); else if (UI.q) { $('#q').value = ''; UI.q = ''; render(); } else if (typing) t.blur(); return; }
  if (typing || modalOpen() || mod || e.altKey) return;
  if ((t.classList.contains('card') || t.classList.contains('mc')) && e.key === 'Enter') { t.click(); return; }
  const m = MODULES.find(x => x.id === UI.view); if (m && m.keys && m.keys(e, k)) return;
  const mods = MODULES.filter(x => modOn(x.id)), n = parseInt(e.key, 10);
  if (n >= 1 && n <= mods.length) { go(mods[n - 1].id); return; }
  if (k === 'q' || k === 'й') { e.preventDefault(); openQuick('', taskPreset()); }
  else if ((k === 'n' || k === 'т') && modOn('board')) { e.preventDefault(); ACT.newTask(); }
  else if ((k === 'r' || k === 'к') && modOn('budget')) { e.preventDefault(); openTxForm(null, { type: 'expense' }); }
});

// ---- перетаскивание: доска, «весь день», месяц, сетка недели ----
let dragId = null, dragP = null; const phl = document.createElement('div'); phl.className = 'phl';
document.addEventListener('dragstart', e => {
  const pf = e.target.closest && e.target.closest('[data-pdrag],[data-fdrag]');
  if (pf) { dragP = pf.dataset.pdrag ? { k: 'p', id: pf.dataset.pdrag } : { k: 'f', id: pf.dataset.fdrag }; e.dataTransfer.setData('text/plain', dragP.id); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); return; }
  const el = e.target.closest && e.target.closest('[draggable="true"][data-id]'); if (!el) return;
  dragId = el.dataset.id; e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => el.classList.add('dragging'), 0);
});
function clearDrop() { $$('.drop').forEach(x => x.classList.remove('drop')); phl.remove(); const g = $('.ghost-slot'); if (g) g.remove(); }
const slotMin = (dc, y) => { const r = dc.getBoundingClientRect(); return Math.max(0, Math.min(1410, Math.floor((y - r.top) / HHpx() * 4) * 15)); };
document.addEventListener('dragover', e => {
  if (dragP) { const z = e.target.closest('[data-fdrop]'); $$('.fdrop-on').forEach(x => x !== z && x.classList.remove('fdrop-on')); if (z) { e.preventDefault(); z.classList.add('fdrop-on'); } return; }
  if (!dragId) return;
  const col = e.target.closest('.col'), dc = e.target.closest('.dcol'), ad = e.target.closest('[data-adrop],[data-mdrop]');
  if (col) {
    e.preventDefault(); const list = $('.cards', col);
    $$('.cards.drop').forEach(x => x !== list && x.classList.remove('drop')); list.classList.add('drop');
    const cards = $$('.card:not(.dragging)', list), after = cards.find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    const em = $('.empty', list); if (em) em.remove();
    if (after) list.insertBefore(phl, after); else list.appendChild(phl);
  } else if (dc) {
    e.preventDefault(); clearDrop(); dc.classList.add('drop');
    const m = slotMin(dc, e.clientY), t = byId(dragId), g = document.createElement('div'); g.className = 'ghost-slot';
    g.style.top = m / 60 * HHpx() + 'px'; g.style.height = ((t && t.dur) || 60) / 60 * HHpx() + 'px'; dc.appendChild(g);
  } else if (ad) { e.preventDefault(); clearDrop(); ad.classList.add('drop'); }
});
document.addEventListener('drop', e => {
  if (dragP) { const z = e.target.closest('[data-fdrop]'); const g = dragP; dragP = null; $$('.fdrop-on').forEach(x => x.classList.remove('fdrop-on')); if (z) { e.preventDefault(); moveIntoFolder(g.k, g.id, z.dataset.fdrop || null); } return; }
  if (!dragId) return; e.preventDefault();
  const id = dragId, col = e.target.closest('.col'), dc = e.target.closest('.dcol'), ad = e.target.closest('[data-adrop]'), md = e.target.closest('[data-mdrop]');
  if (col) { const nx = phl.nextElementSibling, before = nx && nx.classList.contains('card') ? nx.dataset.id : null; clearDrop(); dragId = null; moveTask(id, col.dataset.col, before === id ? null : before); return; }
  const t = byId(id); clearDrop(); dragId = null; if (!t) return;
  if (dc) { const m = slotMin(dc, e.clientY); snapU(); t.date = dc.dataset.day; t.time = fromMin(m); t.dur = t.dur || 60; t.snooze = null; save(); render(); toast(`${human(t.date)}, ${t.time}`, true); }
  else if (ad) { snapU(); t.date = ad.dataset.adrop; t.time = null; t.snooze = null; save(); render(); toast(human(t.date) + ', весь день', true); }
  else if (md) { snapU(); t.date = md.dataset.mdrop; t.snooze = null; save(); render(); toast('Перенесено: ' + human(t.date).toLowerCase(), true); }
});
document.addEventListener('dragend', () => { dragP = null; $$('.fdrop-on').forEach(x => x.classList.remove('fdrop-on')); dragId = null; clearDrop(); $$('.dragging').forEach(x => x.classList.remove('dragging')); });

// ============================================================
//  Запуск
// ============================================================
$('#i-search').innerHTML = ic('search'); $('#b-search').innerHTML = ic('search'); $('#b-sx').innerHTML = ic('x'); $('#b-new').innerHTML = ic('plus') + 'Создать'; $('#b-quick').innerHTML = ic('spark') + '<span>Быстрый ввод</span><kbd>Q</kbd>'; $('#b-help').innerHTML = ic('help'); $('#b-lock').innerHTML = ic('lock');
if (hasApi && !IS_PHONE) document.body.classList.add('electron');
if (IS_PHONE) document.body.classList.add('phone');
document.body.classList.toggle('mob', MOB());
let started = false;
function startApp(d) {
  if (started) return; started = true;
  const fresh = !(d && Array.isArray(d.tasks)), old = !fresh && (!d.version || d.version < 3);
  D = normalize(fresh ? demo() : d);
  if (fresh || old) save();
  UI.view = D.settings.startView || 'dashboard';
  applyAppearance(); dailyRules(); render();
  let tourSeen = false; try { tourSeen = localStorage.getItem('planer-tour-done') === '1'; } catch (e) {}
  if (!fresh) D.settings.tourDone = true;
  if (fresh && !tourSeen && !D.settings.tourDone && !MOB()) setTimeout(tourStart, 800);
  shareStart();
  if (hasApi) {
    window.api.on('open-task', id => { if (UI.locked) return; closeModal(); openTaskForm(id); });
    window.api.on('new-task', () => { if (UI.locked) return; closeModal(); openTaskForm(null, taskPreset()); });
    window.api.on('reminder', id => { if (UI.locked) return beep(); showAlert(id); });
    window.api.on('reminder-pay', id => { if (UI.locked) return beep(); showPayAlert(id); });
    window.api.on('open-pay', id => { if (UI.locked) return; closeModal(); openRegForm(id); });
    window.api.on('notified', n => { if (D) D.notified = Object.assign(D.notified || {}, n); });
    window.api.on('lock-now', () => lockNow());
    // телефон: кнопка «Назад» и сворачивание приложения
    window.api.on('back', () => {
      if (UI.locked) return window.api.minimize();
      if ($('#tour').classList.contains('open')) return tourEnd();
      if (sheetOpen()) return closeSheet();
      if ($('#newdd').classList.contains('open')) return closeDD();
      if (document.body.classList.contains('sideopen')) return sideOpen(false);
      if (document.body.classList.contains('msearch')) return ACT.mSearch();
      if (modalOpen()) { if (UI.form && (UI.form.pk === 'afterRecovery' || UI.form.kind === 'code')) return; return closeModal(); }
      if (UI.view === 'law' && LF.mode && LF.mode !== 'lib') { LF.mode = 'lib'; return render(); }
      if (UI.view === 'law' && (LF.art || LF.doc || LF.q)) { if (LF.art) LF.art = null; else { LF.doc = null; LF.q = ''; } return render(); }
      const home = D.settings.startView || 'dashboard';
      if (UI.view !== home && modOn(home)) return go(home);
      window.api.minimize();
    });
    let hiddenAt = 0;
    window.api.on('pause', () => { hiddenAt = Date.now(); if (!UI.locked) saveNow(); });
    window.api.on('resume', () => {
      const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
      if (!UI.locked && LK.status.enabled && (D.settings.lockOnHide || (D.settings.autoLock && away > D.settings.autoLock * 60000))) lockNow();
      else if (!UI.locked && !modalOpen()) render();
      if (!UI.locked) syncNow();
    });
  } else setInterval(webReminders, 15000);
  let wasMob = MOB(); window.addEventListener('resize', () => { const m = MOB(); if (m !== wasMob) { wasMob = m; document.body.classList.toggle('mob', m); document.body.classList.remove('sideopen', 'msearch'); if (!UI.locked) render(); } });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (D && D.settings.theme === 'system') { applyAppearance(); render(); } });
  setInterval(() => { if (!UI.locked && !modalOpen() && !dragId && !dragBlk && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) render(); }, 60000);
}
(async () => {
  let d = null;
  try { d = hasApi ? await window.api.load() : JSON.parse(localStorage.getItem('planer-web') || 'null'); } catch (e) {}
  try { await refreshLockStatus(); } catch (e) {}
  applyLockButton();
  if (d && d.locked) { showLock('start', d); return; }
  startApp(d);
})();
