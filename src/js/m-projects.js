'use strict';
// ============================================================
//  Модуль «Проекты»: задачи + деньги + сроки в одном месте
// ============================================================
const PST = { active: 'Активный', paused: 'На паузе', done: 'Завершён', archived: 'В архиве' };
const PF = { status: 'active' };

function projCard(p) {
  const s = projStats(p), bp = p.budget ? Math.min(100, s.spent / p.budget * 100) : 0;
  return `<button class="pcard" data-act="openProject" data-id="${p.id}" data-pdrag="${p.id}" draggable="true" style="--c:${p.color}">
    <span class="top"><span class="tr"><span class="tt">${esc(p.title)}</span><span class="st">${PST[p.status]}</span></span>
      <span class="tr" style="align-items:flex-end"><span class="pc">${s.pct}<small>%</small></span><span style="font-size:.9rem;opacity:.9">${s.d} из ${s.n} ${plural(s.n, ['задачи', 'задач', 'задач'])}</span></span>
      <span class="wbar"><i style="width:${s.pct}%"></i></span></span>
    <span class="bd">${p.folder && folderOf(p.folder) ? `<span class="ln"><span>Папка</span><b style="font-weight:500">${folderPath(p.folder).map(f => esc(f.title)).join(' › ')}</b></span>` : ''}
      <span class="ln"><span>Потрачено</span><b class="${s.over ? 'red' : ''}">${money0(s.spent)}${p.budget ? ' из ' + money0(p.budget) : ''}</b></span>
      ${p.budget ? `<span class="prog ${s.over ? 'over' : ''}" style="--c:${p.color}"><i style="width:${bp}%"></i></span>` : ''}
      <span class="ln"><span>Срок</span><b class="${s.left !== null && s.left < 0 && p.status !== 'done' ? 'red' : ''}">${p.deadline ? human(p.deadline) + (p.status === 'done' ? '' : s.left < 0 ? ' · просрочен' : ' · через ' + s.left + ' ' + plural(s.left, PD)) : 'не задан'}</b></span>
      <span class="ln"><span>Далее</span><b style="font-weight:500;overflow:hidden;text-overflow:ellipsis;max-width:65%">${s.next ? esc(s.next.title) : '—'}</b></span>
    </span></button>`;
}
function folderNode(f, depth) {
  const sub = subFolders(f.id), n = D.projects.filter(p => folderTree(f.id).includes(p.folder) && (PF.status === 'all' || p.status === PF.status)).length;
  return `<div class="fnode ${UI.folder === f.id ? 'on' : ''}" style="--d:${depth};--c:${f.color || 'var(--mute)'}" data-fdrop="${f.id}" data-fdrag="${f.id}" draggable="true">
    <button class="fcar ${f.open !== false ? 'open' : ''} ${sub.length ? '' : 'none'}" data-act="fToggle" data-id="${f.id}" aria-label="Развернуть">${ic('caret')}</button>
    <button class="fname" data-act="fOpen" data-id="${f.id}">${ic('folder')}<span>${esc(f.title)}</span><small>${n || ''}</small></button>
    <span class="fact"><button class="ib sm" data-act="fNew" data-id="${f.id}" title="Вложенная папка" aria-label="Вложенная папка">${ic('plus')}</button><button class="ib sm" data-act="fEdit" data-id="${f.id}" title="Изменить" aria-label="Изменить папку">${ic('more')}</button></span></div>
    ${f.open !== false ? sub.map(x => folderNode(x, depth + 1)).join('') : ''}`;
}
function vProjList() {
  const st = p => PF.status === 'all' || p.status === PF.status;
  const cur = UI.folder && UI.folder !== '_' ? folderOf(UI.folder) : null; if (UI.folder && UI.folder !== '_' && !cur) UI.folder = null;
  const L = D.projects.filter(st).filter(p => !UI.folder ? true : UI.folder === '_' ? !p.folder || !folderOf(p.folder) : p.folder === UI.folder);
  const subs = cur ? subFolders(cur.id) : (!UI.folder ? [] : []);
  const crumbs = cur ? folderPath(cur.id) : [];
  return `<div class="pl-wrap"><aside class="ftree pan" data-fdrop=""><div class="ph2"><h2>Папки</h2><span class="spacer"></span><button class="ib sm" data-act="fNew" data-id="" title="Новая папка" aria-label="Новая папка">${ic('folderPlus')}</button></div>
      <button class="fname root ${!UI.folder ? 'on' : ''}" data-act="fOpen" data-id="">${ic('proj')}<span>Все проекты</span><small>${D.projects.filter(st).length}</small></button>
      ${subFolders(null).map(f => folderNode(f, 0)).join('')}
      <button class="fname root ${UI.folder === '_' ? 'on' : ''}" data-act="fOpen" data-id="_" data-fdrop="">${ic('folder')}<span>Без папки</span><small>${D.projects.filter(st).filter(p => !p.folder || !folderOf(p.folder)).length}</small></button>
      <p class="hint" style="margin-top:.8rem">Перетаскивайте проекты и папки мышью. Вложенность не ограничена.</p></aside>
    <div class="scroll" style="padding-top:0">
      <div class="crumbs big"><button class="lnk" data-act="fOpen" data-id="">Все проекты</button>${crumbs.map(f => `<span>›</span><button class="lnk" data-act="fOpen" data-id="${f.id}">${esc(f.title)}</button>`).join('')}${UI.folder === '_' ? '<span>›</span><b>Без папки</b>' : ''}</div>
      ${cur ? `<div class="ftiles">${subs.map(f => `<button class="ftile" data-act="fOpen" data-id="${f.id}" data-fdrop="${f.id}" data-fdrag="${f.id}" draggable="true" style="--c:${f.color || 'var(--mute)'}">${ic('folder')}<b>${esc(f.title)}</b><small>${D.projects.filter(p => folderTree(f.id).includes(p.folder)).length} проектов</small></button>`).join('')}<button class="ftile new" data-act="fNew" data-id="${cur.id}">${ic('folderPlus')}<b>Вложенная папка</b></button></div>` : ''}
      <div class="pgrid">${L.map(projCard).join('')}<button class="pnew" data-act="newProject">${ic('plus')}Новый проект${cur ? ` в «${esc(cur.title)}»` : ''}</button></div>
      ${!D.projects.length ? '<p class="hint" style="margin-top:1rem">Проект объединяет задачи, расходы и сроки. Папки помогают группировать проекты: «Работа › Клиенты › …».</p>' : ''}</div></div>`;
}
function taskTree(list, depth, set) {
  return list.map(t => { const ch = kids(t.id).filter(k => set.has(k.id)).sort((a, b) => (isDone(a) - isDone(b)) || (a.date || '9999').localeCompare(b.date || '9999')); return `<div class="tnode" style="--d:${depth}">${taskLine(t, { noProj: true })}</div>${ch.length ? taskTree(ch, depth + 1, set) : ''}`; }).join('');
}
function vProject(p) {
  const s = projStats(p), tx = projTx(p.id).sort((a, b) => b.date.localeCompare(a.date)), td = today();
  const act = s.ts.filter(t => !isDone(t)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || b.prio - a.prio), dn = s.ts.filter(isDone).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const upcoming = act.filter(t => t.date && t.date >= td).slice(0, 6);
  const bp = p.budget ? s.spent / p.budget : 0;
  return `<div class="scroll">
  <section class="phero" style="--c:${p.color}"><div><div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:.6rem"><span class="st" style="font-size:.85rem;font-weight:700;background:rgba(255,255,255,.2);padding:.15rem .6rem;border-radius:99px">${PST[p.status]}</span>${p.deadline ? `<span style="opacity:.9">${s.left < 0 && p.status !== 'done' ? 'срок прошёл ' + human(p.deadline).toLowerCase() : 'срок ' + human(p.deadline).toLowerCase() + (p.status === 'done' ? '' : ' · осталось ' + s.left + ' ' + plural(s.left, PD))}</span>` : ''}</div>
    <h2>${esc(p.title)}</h2>${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
    <div class="wbar"><i style="width:${s.pct}%"></i></div>
    <div class="meta"><span>${s.d} из ${s.n} задач выполнено</span>${p.start ? `<span>начат ${human(p.start).toLowerCase()}</span>` : ''}</div>
    ${p.folder && folderOf(p.folder) ? `<div class="meta" style="margin-top:.4rem">${ic('folder')} ${folderPath(p.folder).map(f => esc(f.title)).join(' › ')}</div>` : ''}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem"><button class="btn sm" data-act="editProject" data-id="${p.id}">Изменить</button><button class="btn sm" data-act="projAsTpl" data-id="${p.id}">${ic('copy')} В шаблоны</button><button class="btn sm" data-act="newTask">${ic('plus')} Задача</button><button class="btn sm" data-act="newTx" data-v="expense">${ic('coin')} Расход</button><button class="btn sm" data-act="projBoard" data-id="${p.id}">${ic('board')} На доске</button></div></div>
    <div class="big">${s.pct}<small>%</small></div></section>
  <div class="gridk">
    <div class="kpi"><span>${ic('list')} Задачи</span><b>${s.d} / ${s.n}</b><small>${act.filter(t => t.date && t.date < td).length ? `<span style="color:var(--hi)">${act.filter(t => t.date && t.date < td).length} просрочено</span>` : 'просроченных нет'}</small></div>
    <div class="kpi" style="--c:${s.over ? 'var(--hi)' : p.color}"><span>${ic('coin')} Бюджет проекта</span><b style="${s.over ? 'color:var(--hi)' : ''}">${money0(s.spent)}</b><small>${p.budget ? (s.over ? 'перерасход ' + money0(s.spent - p.budget) : 'из ' + money0(p.budget) + ' · осталось ' + money0(p.budget - s.spent)) : 'бюджет не задан'}</small>${p.budget ? `<div class="kbar"><i style="width:${Math.min(100, bp * 100)}%"></i></div>` : ''}</div>
    <div class="kpi"><span>${ic('up')} Доходы по проекту</span><b style="color:var(--inc)">${money0(s.inc)}</b><small>${tx.length} ${plural(tx.length, POP)}</small></div>
    <div class="kpi"><span>${ic('cal')} Срок</span><b>${p.deadline ? (s.left < 0 ? '−' + (-s.left) : s.left) + ' ' + plural(Math.abs(s.left), PD) : '—'}</b><small>${p.deadline ? dayLong(p.deadline) : 'дедлайн не задан'}</small></div>
  </div>
  <div class="grid3" style="margin-bottom:1rem">
    <section class="pan"><div class="ph2"><h2>Задачи</h2><small>${act.length} в работе</small><span class="spacer"></span></div>
      <form class="cadd" data-col="${firstCol().id}" data-proj="${p.id}" style="padding:0 0 .5rem"><input placeholder="+ Задача в этот проект — Enter" aria-label="Новая задача в проект"></form>
      ${(() => { const set = new Set(act.map(t => t.id)); const roots = act.filter(t => !t.parent || !set.has(t.parent)); return roots.length ? taskTree(roots, 0, set) : '<div class="empty">Активных задач нет</div>'; })()}
      ${dn.length ? `<details style="margin-top:.6rem"><summary class="hint" style="cursor:pointer;padding:.4rem 0">Выполнено · ${dn.length}</summary>${dn.map(t => taskLine(t, { noProj: true })).join('')}</details>` : ''}</section>
    <section class="pan"><div class="ph2"><h2>Прогресс</h2><small>выполненные задачи</small></div><div class="chartbox sm"><canvas id="ch-pprog"></canvas></div>
      <div class="ph2" style="margin-top:1rem"><h2>Ближайшее</h2></div>${upcoming.map(t => `<div class="lrow" data-act="openTask" data-id="${t.id}" style="--c:${p.color}"><span class="dot"></span><div class="tx"><b>${esc(t.title)}</b><small>${dueTxt(t)}</small></div></div>`).join('') || '<p class="hint">Нет задач с датой впереди</p>'}</section>
  </div>
  ${modOn('notes') ? projNotesHtml(p) : ''}
  <div class="grid2">
    <section class="pan"><div class="ph2"><h2>Деньги проекта</h2><span class="spacer"></span><button class="btn sm" data-act="newTx" data-v="expense">${ic('plus')} Расход</button></div>${tx.length ? tx.map(x => txRow(x, { noProj: true })).join('') : '<div class="empty">Расходов по проекту нет. Привяжите покупку к проекту — и она попадёт и в бюджет, и сюда.</div>'}</section>
    <section class="pan"><div class="ph2"><h2>Расходы по категориям</h2></div>${sumT(tx, 'expense') ? '<div class="chartbox"><canvas id="ch-pcat"></canvas></div>' : '<div class="empty">Нет данных</div>'}</section>
  </div></div>`;
}

registerModule({
  id: 'projects', order: 4, title: 'Проекты', icon: 'proj', desc: 'Проекты объединяют задачи, расходы и сроки, показывают прогресс и бюджет',
  badge: () => D.projects.filter(p => p.status === 'active').length ? { v: D.projects.filter(p => p.status === 'active').length, soft: true } : '',
  bar() {
    const p = UI.proj && projOf(UI.proj);
    if (p) return `<button class="btn ghost" data-act="projBack">${ic('left')} Все проекты</button><h1 style="display:flex;align-items:center;gap:.6rem"><i style="width:.8rem;height:.8rem;border-radius:.25rem;background:${p.color};display:inline-block"></i>${esc(p.title)}</h1><span class="spacer"></span><button class="btn" data-act="editProject" data-id="${p.id}">Изменить</button>`;
    const act = D.projects.filter(x => x.status === 'active'), spent = r2(act.reduce((a, x) => a + projStats(x).spent, 0));
    const C = [['active', 'Активные'], ['paused', 'На паузе'], ['done', 'Завершённые'], ['archived', 'Архив'], ['all', 'Все']];
    return `<h1>Проекты</h1><div class="stats"><span><b>${act.length}</b> активных</span><span><b>${act.reduce((a, x) => a + projTasks(x.id).filter(t => !isDone(t)).length, 0)}</b> задач в работе</span><span><b>${money0(spent)}</b> потрачено</span></div><span class="sep"></span>
      <div class="chips">${C.map(([k, l]) => `<button class="chip ${PF.status === k ? 'on' : ''}" data-act="pfilter" data-v="${k}">${l} <span class="n">${k === 'all' ? D.projects.length : D.projects.filter(x => x.status === k).length}</span></button>`).join('')}</div><span class="spacer"></span><button class="btn" data-act="projFromTpl">${ic('copy')} Из шаблона</button><button class="btn pri" data-act="newProject">${ic('plus')} Проект</button>`;
  },
  render() { const p = UI.proj && projOf(UI.proj); if (UI.proj && !p) UI.proj = null; return p ? vProject(p) : vProjList(); },
  after() {
    const p = UI.proj && projOf(UI.proj); if (!p) return;
    const ts = projTasks(p.id), done = ts.filter(t => isDone(t) && t.doneAt).map(t => ymd(new Date(t.doneAt))).sort();
    const start = [p.start, ts.map(t => ymd(new Date(t.created))).sort()[0], done[0]].filter(Boolean).sort()[0] || today();
    const end = today(), span = Math.max(1, diff(start, end)), step = Math.max(1, Math.ceil(span / 30)), labels = [], vals = [], tot = [];
    for (let d = start; d <= end; d = addDays(d, step)) { labels.push(pd(d).getDate() + ' ' + MGS[pd(d).getMonth()]); vals.push(done.filter(x => x <= d).length); tot.push(ts.filter(t => ymd(new Date(t.created)) <= d).length); }
    if (labels.length < 2) { labels.push('сегодня'); vals.push(done.length); tot.push(ts.length); }
    chart('ch-pprog', { type: 'line', data: { labels, datasets: [{ label: 'Выполнено', data: vals, borderColor: p.color, backgroundColor: p.color + '33', fill: true, tension: .3, pointRadius: 0, borderWidth: 2.5 }, { label: 'Всего задач', data: tot, borderColor: cssv('--mute'), borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, tension: .3 }] }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } } } });
    const tx = projTx(p.id).filter(x => x.type === 'expense'), by = {};
    tx.forEach(x => by[x.category] = (by[x.category] || 0) + x.amount);
    const ks = Object.keys(by).sort((a, b) => by[b] - by[a]);
    if (ks.length) chart('ch-pcat', { type: 'doughnut', data: { labels: ks.map(k => (catOf(k) || { title: 'Без категории' }).title), datasets: [{ data: ks.map(k => r2(by[k])), backgroundColor: ks.map(k => (catOf(k) || { color: '#9aa3af' }).color), borderColor: cssv('--panel'), borderWidth: 3 }] }, options: { cutout: '62%', plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: c => ' ' + money0(c.parsed) } } } } });
  },
  search(q) { return D.projects.filter(p => (p.title + ' ' + p.desc).toLowerCase().includes(q)).map(p => ({ group: 'Проекты', title: p.title, sub: projStats(p).pct + '%', color: p.color, act: 'openProject', id: p.id })); }
});

const folderOpts = (pid, depth, sel, skip) => subFolders(pid).filter(f => f.id !== skip).map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${'\u00a0\u00a0\u00a0'.repeat(depth)}${esc(f.title)}</option>` + folderOpts(f.id, depth + 1, sel, skip)).join('');
function openProjectForm(id) {
  const src = id ? projOf(id) : null, p = src ? clone(src) : newProject({ color: COLORS[D.projects.length % COLORS.length], folder: UI.folder && UI.folder !== '_' ? UI.folder : null });
  UI.form = { kind: 'proj', isNew: !src, p };
  modal(`<div class="mbox narrow"><div class="mh"><h2>${src ? 'Проект' : 'Новый проект'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="pform" autocomplete="off">
    <label class="f"><span>Название</span><input class="in title" id="p-title" value="${esc(p.title)}" placeholder="Например, «Ремонт кухни»" maxlength="80"></label>
    <label class="f"><span>Описание</span><textarea class="in" id="p-desc" rows="2" placeholder="Цель проекта и что считать результатом">${esc(p.desc)}</textarea></label>
    <div class="f"><span>Цвет</span>${swatch(p.color, 'pColor')}</div>
    <div class="row two"><label class="f"><span>Статус</span><select class="in" id="p-status">${Object.entries(PST).map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f"><span>Бюджет, ${esc(cur())}</span><input class="in" id="p-budget" inputmode="decimal" value="${p.budget || ''}" placeholder="не задан"></label></div>
    <label class="f"><span>Папка</span><select class="in" id="p-folder"><option value="">Без папки</option>${folderOpts(null, 0, p.folder)}</select></label>
    <div class="row two"><label class="f"><span>Начало</span><input type="date" class="in" id="p-start" value="${p.start || ''}"></label><label class="f"><span>Срок</span><input type="date" class="in" id="p-dl" value="${p.deadline || ''}"></label></div>
    ${shareOn() ? `<label class="sline shtog"><div class="tx"><b>${ic('users')} Общий проект</b><span>Проект и его задачи видят и меняют все участники «${esc(SH().space.name)}». Бюджет и операции остаются личными.</span></div><input type="checkbox" class="tog" id="p-shared" ${p.shared ? 'checked' : ''}></label>` : ''}
    <p class="hint">Срок проекта появится в календаре. Расходы с этим проектом считаются в его бюджете.</p>
  </form>
  <div class="mf">${src ? `<button class="btn ghost danger" data-act="fdel">${ic('trash')} Удалить</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="fsave">Сохранить</button></div></div>`);
  setTimeout(() => $('#p-title')?.focus(), 30);
}
function saveProjectForm() {
  const F = UI.form, p = F.p;
  p.title = $('#p-title').value.trim(); p.desc = $('#p-desc').value.trim(); p.status = $('#p-status').value; const b = parseMoney($('#p-budget').value); p.budget = b > 0 ? b : null; p.start = $('#p-start').value || null; p.deadline = $('#p-dl').value || null; p.folder = $('#p-folder').value || null;
  if ($('#p-shared')) { const on = $('#p-shared').checked; if (!on && p.shared) unshareProject(p); if (on) p.shared = true; else delete p.shared; }
  if (!p.title) return toast('Введите название проекта');
  snapU(); if (F.isNew) D.projects.push(p); else { Object.assign(projOf(p.id), p); if (!p.shared) delete projOf(p.id).shared; }
  save(); closeModal(); UI.proj = p.id; go('projects'); toast('Проект сохранён', true);
}
function openFolderForm(id, parent) {
  const src = id ? folderOf(id) : null, f = src ? clone(src) : { id: uid(), title: '', parent: parent || null, color: COLORS[D.folders.length % COLORS.length], open: true };
  UI.form = { kind: 'folder', isNew: !src, f };
  const skip = src ? new Set(folderTree(src.id)) : new Set();
  const opts = (pid, dep) => subFolders(pid).filter(x => !skip.has(x.id)).map(x => `<option value="${x.id}" ${x.id === f.parent ? 'selected' : ''}>${'\u00a0\u00a0\u00a0'.repeat(dep)}${esc(x.title)}</option>` + opts(x.id, dep + 1)).join('');
  modal(`<div class="mbox narrow"><div class="mh"><h2>${src ? 'Папка' : 'Новая папка'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="fform"><label class="f"><span>Название</span><input class="in" id="fo-title" value="${esc(f.title)}" maxlength="50" placeholder="Например, «Работа» или «Дом»"></label>
  <label class="f"><span>Внутри папки</span><select class="in" id="fo-parent"><option value="">Верхний уровень</option>${opts(null, 0)}</select></label>
  <div class="f"><span>Цвет</span>${swatch(f.color, 'foColor')}</div>
  ${src ? `<p class="hint">Внутри: ${subFolders(f.id).length} папок, ${D.projects.filter(p => p.folder === f.id).length} проектов. При удалении содержимое переедет на уровень выше.</p>` : ''}</form>
  <div class="mf">${src ? `<button class="btn ghost danger" data-act="foDel">${ic('trash')} Удалить</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="foSave">Сохранить</button></div></div>`);
  setTimeout(() => $('#fo-title')?.focus(), 30);
}
function moveIntoFolder(kind, id, target) {
  target = target || null;
  if (kind === 'p') { const p = projOf(id); if (!p || p.folder === target) return; snapU(); p.folder = target; save(); render(); toast(`«${p.title}» → ${target ? folderOf(target).title : 'без папки'}`, true); }
  else { const f = folderOf(id); if (!f || f.id === target || (target && folderTree(f.id).includes(target)) || (f.parent || null) === target) return; snapU(); f.parent = target; save(); render(); toast(`Папка «${f.title}» перемещена`, true); }
}
Object.assign(ACT, {
  fOpen: b => { UI.folder = b.dataset.id || null; UI.proj = null; if (UI.view !== 'projects') go('projects'); else render(); },
  fToggle: b => { const f = folderOf(b.dataset.id); if (!f) return; f.open = f.open === false; save(); render(); },
  fNew: b => openFolderForm(null, b.dataset.id || null), fEdit: b => openFolderForm(b.dataset.id),
  foColor: b => { UI.form.f.color = b.dataset.v; $$('#fform .swb').forEach(s => s.classList.toggle('on', s === b)); },
  foSave: () => { const f = UI.form.f; f.title = $('#fo-title').value.trim(); f.parent = $('#fo-parent').value || null; if (!f.title) return toast('Введите название папки'); snapU(); if (UI.form.isNew) D.folders.push(f); else Object.assign(folderOf(f.id), f); save(); closeModal(); render(); toast('Папка сохранена', true); },
  foDel: () => { const f = UI.form.f; snapU(); D.folders.forEach(x => { if (x.parent === f.id) x.parent = f.parent || null; }); D.projects.forEach(p => { if (p.folder === f.id) p.folder = f.parent || null; }); D.templates.forEach(t => { if (t.ctx === 'folder:' + f.id) t.ctx = ''; }); D.folders = D.folders.filter(x => x.id !== f.id); if (UI.folder === f.id) UI.folder = f.parent || null; save(); closeModal(); render(); toast(`Папка «${f.title}» удалена, содержимое перенесено`, true); },
  projFromTpl: () => { const L = D.templates.filter(t => t.kind === 'project'); modal(`<div class="mbox narrow"><div class="mh"><h2>Проект из шаблона</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div><div class="mb">${L.map(t => `<div class="lrow" data-act="tpUse" data-id="${t.id}" style="--c:${t.data.color || 'var(--acc)'}"><span class="dot"></span><div class="tx"><b>${esc(t.name)}</b><small>${t.data.tasks.map(x => x[0]).slice(0, 4).join(', ')}${t.data.tasks.length > 4 ? '…' : ''}</small></div><span class="btn sm">Создать</span></div>`).join('') || '<div class="empty">Шаблонов проектов нет</div>'}<p class="hint">Задачи получат даты относительно сегодняшнего дня. Свой шаблон можно сделать из любого проекта кнопкой «В шаблоны».</p></div></div>`); },
  projAsTpl: b => { const p = projOf(b.dataset.id); if (!p) return; const st = p.start || today(); D.templates.push({ id: uid(), kind: 'project', name: p.title.slice(0, 40), ctx: p.folder ? 'folder:' + p.folder : '', data: { title: p.title, color: p.color, tasks: projTasks(p.id).filter(t => !t.parent).map(t => [t.title, t.date ? Math.max(0, diff(st, t.date)) : null]) } }); save(); toast('Проект сохранён как шаблон'); },
  openProject: b => { UI.proj = b.dataset.id; closeModal(); go('projects'); },
  newProject: () => openProjectForm(null), editProject: b => openProjectForm(b.dataset.id),
  pColor: b => { UI.form.p.color = b.dataset.v; $$('#pform .swb').forEach(s => s.classList.toggle('on', s === b)); },
  projBack: () => { UI.proj = null; render(); },
  pfilter: b => { PF.status = b.dataset.v; render(); },
  projBoard: b => { TF.proj = b.dataset.id; go('board'); },
  projDel: () => { const p = UI.form.p; snapU(); D.projects = D.projects.filter(x => x.id !== p.id); D.tasks.forEach(t => { if (t.project === p.id) t.project = null; }); B().tx.forEach(x => { if (x.project === p.id) x.project = null; }); B().regular.forEach(x => { if (x.project === p.id) x.project = null; }); UI.proj = null; save(); closeModal(); render(); toast(`Проект «${p.title}» удалён, задачи и операции сохранены`, true); }
});
