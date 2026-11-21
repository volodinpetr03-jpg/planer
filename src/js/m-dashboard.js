'use strict';
// ============================================================
//  Модуль «Обзор»: сводка по задачам, деньгам и проектам, живые графики
// ============================================================
function greet() { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; }
function agenda(days) {
  const td = today(), out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(td, i), items = [];
    D.projects.filter(p => p.deadline === d && p.status !== 'archived' && p.status !== 'done').forEach(p => items.push(`<div class="lrow" data-act="openProject" data-id="${p.id}" style="--c:${p.color}"><span class="dot"></span><div class="tx"><b>Срок проекта: ${esc(p.title)}</b><small>${projStats(p).pct}% готово</small></div></div>`));
    regularOn(d).forEach(r => items.push(`<div class="lrow" data-act="openReg" data-id="${r.id}" style="--c:var(--exp)"><span class="dot"></span><div class="tx"><b>${esc(r.title)}</b><small>регулярный платёж</small></div><span class="am exp">${money0(r.amount)}</span></div>`));
    live().filter(t => t.date === d && !isDone(t)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')).forEach(t => items.push(taskLine(t, { noCol: true })));
    if (items.length && i > 0) out.push(`<div class="daygrp"><h3>${dayLong(d)}<small>${items.length}</small></h3>${items.join('')}</div>`);
  }
  return out.join('') || '<div class="empty">На ближайшие дни ничего не запланировано</div>';
}
registerModule({
  id: 'dashboard', order: 1, title: 'Обзор', icon: 'dash', desc: 'Главный экран: план на сегодня, ближайшие дни, деньги, проекты и графики',
  bar() {
    const x = new Date();
    return `<h1>${greet()}</h1><div class="stats"><span>${x.getDate()} ${MG[x.getMonth()]} ${x.getFullYear()}, ${WSL[x.getDay()]}</span></div><span class="spacer"></span>
      ${modOn('board') ? `<button class="btn" data-act="newTask">${ic('plus')} Задача</button>` : ''}${modOn('budget') ? `<button class="btn" data-act="newTx" data-v="expense">${ic('coin')} Расход</button>` : ''}`;
  },
  render() {
    const td = today(), L = live(), tod = L.filter(t => t.date === td), todD = tod.filter(isDone).length, over = L.filter(t => !isDone(t) && t.date && t.date < td);
    const k = mkey(td), exp = sumT(txMonth(k), 'expense'), inc = sumT(txMonth(k), 'income'), lim = limitsTotal(), ls = limitedSpent(k);
    const act = D.projects.filter(p => p.status === 'active'), todPays = regularOn(td).concat(B().regular.filter(r => r.active !== false && r.nextDate < td));
    const tagStats = D.tags.map(t => ({ t, n: L.filter(x => (x.tags || []).includes(t.id)).length + B().tx.filter(x => (x.tags || []).includes(t.id)).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
    const plan = over.concat(tod.filter(t => !isDone(t))).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '99').localeCompare(b.time || '99'));
    const rank = SM().scoring ? rankTasks(8) : [], fi = Math.min(UI.focusSkip || 0, Math.max(0, rank.length - 1)), F = rank[fi];
    const capL = loadOf(td), capC = capOf(td), capLeft = loadLeft(td), week = [...Array(7)].map((_, i) => addDays(td, i));
    const focusHtml = modOn('board') && SM().scoring ? `<section class="pan focus">${F ? `<div class="ph2"><h2>${ic('star')} Главная задача</h2><small>оценка ${F.s}</small><span class="spacer"></span>${rank.length > 1 ? `<button class="btn sm ghost" data-act="focusSkip" title="Показать следующую по важности">Другая</button>` : ''}</div>
        <div class="fmain" data-act="openTask" data-id="${F.t.id}"><b>${esc(F.t.title)}</b><span>${[F.t.date ? dueTxt(F.t) : 'без даты', projOf(F.t.project) ? projOf(F.t.project).title : ''].filter(Boolean).join(' · ')}</span></div>
        <div class="why">${F.why.map(w => `<i class="${w.v < 0 ? 'neg' : ''}">${w.v > 0 ? '+' : ''}${w.v} ${esc(w.label)}</i>`).join('')}</div>
        <div class="fbtn"><button class="btn pri" data-act="complete" data-id="${F.t.id}">${ic('check')} Готово</button>${D.columns.findIndex(c => c.id === F.t.col) === 0 && D.columns.some((c, i) => i > 0 && !c.done) ? `<button class="btn" data-act="focusStart" data-id="${F.t.id}">${ic('play')} Начать</button>` : ''}<button class="btn ghost" data-act="openTask" data-id="${F.t.id}">Открыть</button></div>
        ${rank.length > 1 ? `<div class="fnext"><span class="hint">Дальше по важности:</span>${rank.filter((_, i) => i !== fi).slice(0, 3).map(r => `<button class="lnk" data-act="openTask" data-id="${r.t.id}">${esc(r.t.title)} <small>${r.s}</small></button>`).join('')}</div>` : ''}`
      : '<div class="ph2"><h2>' + ic('star') + ' Главная задача</h2></div><div class="empty">Открытых задач на ближайшие две недели нет</div>'}</section>` : '';
    const capHtml = `<section class="pan capk"><div class="ph2"><h2>${ic('clock')} Загрузка</h2><span class="spacer"></span><button class="btn sm ghost" data-act="settings" data-v="smart">Ёмкость</button></div>
      <div class="capbig"><b class="${capL > capC ? 'red' : ''}">${hm(capL || 0)}</b><span>из ${durTxt(capC)} на сегодня · осталось сделать ${hm(capLeft || 0)}</span></div>${capBar(td, true)}
      ${capL > capC ? `<p class="hint warn">День перегружен на ${durTxt(capL - capC)}. Ближайший свободный день: ${(() => { const f = freeDay(td, capL - capC); return f ? human(f).toLowerCase() : 'не найден'; })()}.</p>` : ''}
      <div class="capweek">${week.map(d => { const l = loadOf(d), c = capOf(d); return `<div title="${human(d)}: ${durTxt(l || 0)} из ${durTxt(c)}"><span>${WSU[pd(d).getDay()]}</span>${capBar(d)}<small class="${l > c ? 'red' : ''}">${l ? Math.round(l / 6) / 10 : 0} ч</small></div>`; }).join('')}</div></section>`;
    return `<div class="scroll">
    ${focusHtml || capHtml ? `<div class="grid3" style="margin-bottom:1rem">${focusHtml}${capHtml}</div>` : ''}
    <div class="gridk">
      ${modOn('board') ? `<div class="kpi" data-act="dashGo" data-v="today" style="--c:var(--ok)"><span>${ic('check')} Сегодня</span><b>${todD} из ${tod.length}</b><small>${tod.length ? Math.round(todD / tod.length * 100) + '% выполнено' : 'задач на сегодня нет'}</small><div class="kbar"><i style="width:${tod.length ? todD / tod.length * 100 : 0}%"></i></div></div>
      <div class="kpi" data-act="dashGo" data-v="over"><span>${ic('clock')} Просрочено</span><b style="${over.length ? 'color:var(--hi)' : ''}">${over.length}</b><small>${over.length ? 'нажмите, чтобы разобрать' : 'всё вовремя'}</small></div>` : ''}
      ${modOn('budget') ? `<div class="kpi" data-act="btab" data-v="overview" style="--c:${lim && ls > lim ? 'var(--hi)' : 'var(--acc)'}"><span>${ic('down')} Расходы за месяц</span><b>${money0(exp)}</b><small>${lim ? 'лимиты использованы на ' + Math.round(ls / lim * 100) + '%' : 'доходы ' + money0(inc)}</small>${lim ? `<div class="kbar"><i style="width:${Math.min(100, ls / lim * 100)}%"></i></div>` : ''}</div>
      <div class="kpi" data-act="btab" data-v="accounts"><span>${ic('wallet')} На счетах</span><b>${money0(totalBalance())}</b><small>сальдо месяца ${money(inc - exp, true)}</small></div>` : ''}
      ${modOn('projects') ? `<div class="kpi" data-act="go" data-v="projects"><span>${ic('proj')} Проекты</span><b>${act.length}</b><small>${act.length ? 'в среднем ' + Math.round(act.reduce((a, p) => a + projStats(p).pct, 0) / act.length) + '% готово' : 'активных нет'}</small></div>` : ''}
    </div>
    ${givenHtml()}
    <div class="grid3" style="margin-bottom:1rem">
      <section class="pan"><div class="ph2"><h2>План на сегодня</h2><small>${plan.length} ${plural(plan.length, PT)}</small><span class="spacer"></span></div>
        ${modOn('board') ? `<form class="cadd" data-col="${firstCol().id}" data-date="${td}" style="padding:0 0 .5rem"><input placeholder="+ Задача на сегодня — Enter" aria-label="Задача на сегодня"></form>` : ''}
        ${todPays.map(r => `<div class="lrow" data-act="openReg" data-id="${r.id}" style="--c:var(--exp)"><span class="dot"></span><div class="tx"><b>${esc(r.title)}</b><small style="${r.nextDate < td ? 'color:var(--hi)' : ''}">${r.nextDate < td ? 'платёж просрочен' : 'платёж сегодня'}</small></div><span class="am exp">${money0(r.amount)}</span><button class="btn sm" data-act="payReg" data-id="${r.id}">Оплачено</button></div>`).join('')}
        ${plan.map(t => taskLine(t)).join('')}${tod.filter(isDone).map(t => taskLine(t)).join('')}
        ${!plan.length && !todPays.length && !todD ? '<div class="empty">На сегодня ничего нет. Добавьте задачу строкой выше.</div>' : ''}</section>
      <section class="pan"><div class="ph2"><h2>Ближайшие дни</h2><span class="spacer"></span>${modOn('calendar') ? `<button class="btn sm ghost" data-act="go" data-v="calendar">Календарь</button>` : ''}</div>${agenda(8)}</section>
    </div>
    <div class="grid2" style="margin-bottom:1rem">
      <section class="pan"><div class="ph2"><h2>Продуктивность</h2><small>за 14 дней</small></div><div class="chartbox"><canvas id="ch-prod"></canvas></div></section>
      ${modOn('budget') ? `<section class="pan"><div class="ph2"><h2>Деньги за 14 дней</h2><span class="spacer"></span><button class="btn sm ghost" data-act="btab" data-v="overview">Бюджет</button></div><div class="chartbox"><canvas id="ch-money"></canvas></div></section>` : ''}
    </div>
    <div class="grid2">
      ${modOn('projects') ? `<section class="pan"><div class="ph2"><h2>Проекты</h2><span class="spacer"></span><button class="btn sm ghost" data-act="newProject">${ic('plus')} Проект</button></div>${act.map(p => { const s = projStats(p); return `<div class="lim" data-act="openProject" data-id="${p.id}" style="--c:${p.color}"><span class="nm"><i></i>${esc(p.title)}</span><span class="vl"><b>${s.pct}%</b> · ${s.d}/${s.n} задач${p.budget ? ` · <span style="${s.over ? 'color:var(--hi)' : ''}">${money0(s.spent)} из ${money0(p.budget)}</span>` : s.spent ? ' · ' + money0(s.spent) : ''}</span><div class="prog"><i style="width:${s.pct}%"></i></div></div>`; }).join('') || '<div class="empty">Активных проектов нет</div>'}</section>` : ''}
      <section class="pan"><div class="ph2"><h2>Теги</h2><small>задачи и операции</small><span class="spacer"></span><button class="btn sm ghost" data-act="settings" data-v="tags">Настроить</button></div><div class="chips">${tagStats.map(x => `<button class="chip tag" style="--c:${x.t.color}" data-act="openTag" data-id="${x.t.id}">${esc(x.t.title)} <span class="n">${x.n}</span></button>`).join('') || '<p class="hint">Теги ещё не использовались</p>'}</div>
        <p class="hint" style="margin-top:.8rem">Нажмите на тег — откроются все задачи и операции с ним и сумма расходов.</p></section>
    </div></div>`;
  },
  after() {
    const td = today(), ds = [...Array(14)].map((_, i) => addDays(td, i - 13)), labels = ds.map(d => pd(d).getDate() + ' ' + MGS[pd(d).getMonth()]);
    const done = ds.map(d => D.tasks.filter(t => t.doneAt && ymd(new Date(t.doneAt)) === d).length), made = ds.map(d => D.tasks.filter(t => ymd(new Date(t.created)) === d).length);
    chart('ch-prod', { type: 'bar', data: { labels, datasets: [{ type: 'bar', label: 'Выполнено', data: done, backgroundColor: cssv('--ok'), borderRadius: 6, maxBarThickness: 22 }, { type: 'line', label: 'Создано', data: made, borderColor: cssv('--acc'), backgroundColor: cssv('--acc'), tension: .35, pointRadius: 2.5, borderWidth: 2 }] }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } } } });
    if (modOn('budget')) {
      const e = ds.map(d => sumT(B().tx.filter(x => x.date === d), 'expense')), i = ds.map(d => sumT(B().tx.filter(x => x.date === d), 'income'));
      chart('ch-money', { type: 'bar', data: { labels, datasets: [{ label: 'Расходы', data: e, backgroundColor: cssv('--exp'), borderRadius: 6, maxBarThickness: 22 }, { label: 'Доходы', data: i, backgroundColor: cssv('--inc'), borderRadius: 6, maxBarThickness: 22 }] }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: { ...axisMoney, beginAtZero: true }, x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money0(c.parsed.y) } } } } });
    }
  }
});
Object.assign(ACT, {
  dashGo: b => { TF.filter = b.dataset.v; TF.tags.clear(); TF.proj = ''; go('board'); },
  go: b => go(b.dataset.v)
});
