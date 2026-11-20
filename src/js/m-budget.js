'use strict';
// ============================================================
//  Модуль «Бюджет»: счета, категории и лимиты, операции, регулярные платежи, аналитика
// ============================================================
const BF = { month: mkey(today()), tab: 'overview', f: { type: '', cat: '', acc: '', proj: '', tag: '' }, last: { account: null, expense: null, income: null } };
const ACC_T = [['card', 'Карта'], ['cash', 'Наличные'], ['savings', 'Накопления'], ['deposit', 'Вклад'], ['credit', 'Кредитка']];
const REG_REP = [['week', 'Каждую неделю'], ['month', 'Каждый месяц'], ['quarter', 'Раз в квартал'], ['year', 'Раз в год']];
const REG_REM = [[null, 'Не напоминать'], [0, 'В день платежа'], [1, 'За 1 день'], [3, 'За 3 дня'], [7, 'За неделю']];
const typeCls = t => t === 'expense' ? 'exp' : t === 'income' ? 'inc' : 'tr';
const typeSign = t => t === 'expense' ? '−' : t === 'income' ? '+' : '';

function txTitle(x) {
  const c = catOf(x.category);
  if (x.type === 'transfer') return `Перевод: ${(accOf(x.account) || {}).title || '?'} → ${(accOf(x.to) || {}).title || '?'}`;
  return x.note || (c ? c.title : 'Без категории');
}
function txRow(x, o = {}) {
  const c = catOf(x.category), a = accOf(x.account), p = projOf(x.project), t = x.task ? byId(x.task) : null;
  const sub = [x.note && c ? c.title : '', o.noDate ? '' : human(x.date), a ? a.title : ''].filter(Boolean).join(' · ');
  return `<div class="lrow" data-act="openTx" data-id="${x.id}" style="--c:${c ? c.color : x.type === 'transfer' ? 'var(--acc)' : 'var(--mute)'}"><span class="dot"></span>
    <div class="tx"><b>${esc(txTitle(x))}</b><small>${esc(sub)} ${o.noProj ? '' : projChip(p)} ${t ? `<span class="ptag" data-act="openTask" data-id="${t.id}" style="--c:var(--mute)">${ic('list')}${esc(t.title)}</span>` : ''} ${tagsHtml(x)}</small></div>
    <span class="am ${typeCls(x.type)}">${typeSign(x.type)}${money(x.amount)}</span></div>`;
}
const cumul = (k, upto) => { const n = mDays(k), arr = Array(n).fill(0); for (const x of txMonth(k)) if (x.type === 'expense') arr[+x.date.slice(8) - 1] += x.amount; let s = 0; return arr.map((v, i) => (upto && i + 1 > upto) ? null : r2(s += v)); };
const limitedSpent = k => r2(B().categories.filter(c => c.type === 'expense' && c.limit).reduce((a, c) => a + catSpent(c.id, k), 0));
const limitsTotal = () => r2(B().categories.filter(c => c.type === 'expense' && c.limit).reduce((a, c) => a + c.limit, 0));
function nextPays(days) {
  const td = today(), end = addDays(td, days), out = [];
  for (const r of B().regular) { if (r.active === false || !r.nextDate) continue; let d = r.nextDate, g = 0; const anchor = r.day || pd(r.nextDate).getDate(); while (d <= end && g++ < 60) { out.push({ r, date: d, overdue: d < td }); if (r.repeat === 'week' && out.length > 40) break; d = stepDate(d, r.repeat, anchor); if (d === r.nextDate) break; } }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function payRow(p) {
  const r = p.r, c = catOf(r.category), first = p.date === r.nextDate;
  return `<div class="lrow" data-act="openReg" data-id="${r.id}" style="--c:${c ? c.color : 'var(--exp)'}"><span class="dot"></span><div class="tx"><b>${esc(r.title)}</b><small class="${p.overdue ? 'red' : ''}" style="${p.overdue ? 'color:var(--hi)' : ''}">${p.overdue ? 'Просрочен · ' : ''}${human(p.date)} · ${REPS[r.repeat] || ''}</small></div><span class="am ${r.type === 'income' ? 'inc' : 'exp'}">${money(r.amount)}</span>${first ? `<button class="btn sm" data-act="payReg" data-id="${r.id}">Оплачено</button>` : ''}</div>`;
}

function vOverview() {
  const k = BF.month, pk = mAdd(k, -1), L = txMonth(k), PL = txMonth(pk);
  const inc = sumT(L, 'income'), exp = sumT(L, 'expense'), pinc = sumT(PL, 'income'), pexp = sumT(PL, 'expense'), lim = limitsTotal(), ls = limitedSpent(k);
  const ch = (a, b) => b ? Math.round((a - b) / b * 100) : null;
  const ci = ch(inc, pinc), ce = ch(exp, pexp);
  const cats = B().categories.filter(c => c.type === 'expense').map(c => ({ c, v: catSpent(c.id, k) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const limited = B().categories.filter(c => c.type === 'expense' && c.limit).map(c => ({ c, v: catSpent(c.id, k) })).sort((a, b) => b.v / b.c.limit - a.v / a.c.limit);
  const isCur = k === mkey(today()), dayN = isCur ? +today().slice(8) : mDays(k), avg = exp / dayN, forecast = isCur ? r2(avg * mDays(k)) : null;
  const pays = nextPays(30);
  const qt = tplRank('expense');
  return `${qt.length ? `<div class="quickx"><span class="hint">${ic('bolt')} Быстрый расход:</span>${qt.map(t => `<button class="chip" data-act="tplExp" data-id="${t.id}">${esc(t.name)} · ${money0(t.data.amount)}</button>`).join('')}<button class="chip" data-act="go" data-v="auto" title="Шаблоны настраиваются в «Автоматизации»">${ic('plus')}</button></div>` : ''}<div class="gridk">
    <div class="kpi"><span>${ic('up')} Доходы</span><b class="num" style="color:var(--inc)">${money0(inc)}</b><small class="${ci === null ? '' : ci >= 0 ? 'up' : 'down'}">${ci === null ? 'в прошлом месяце не было' : (ci >= 0 ? '+' : '') + ci + '% к прошлому месяцу'}</small></div>
    <div class="kpi"><span>${ic('down')} Расходы</span><b class="num" style="color:var(--exp)">${money0(exp)}</b><small class="${ce === null ? '' : ce <= 0 ? 'up' : 'down'}">${ce === null ? 'в прошлом месяце не было' : (ce >= 0 ? '+' : '') + ce + '% к прошлому месяцу'}</small></div>
    <div class="kpi"><span>${ic('swap')} Сальдо месяца</span><b class="num" style="color:${inc - exp >= 0 ? 'var(--inc)' : 'var(--exp)'}">${money0(inc - exp)}</b><small>${inc ? 'отложено ' + Math.max(0, Math.round((inc - exp) / inc * 100)) + '% дохода' : 'доходов пока нет'}</small></div>
    <div class="kpi" data-act="btab" data-v="accounts"><span>${ic('wallet')} На счетах</span><b class="num">${money0(totalBalance())}</b><small>${B().accounts.length} ${plural(B().accounts.length, ['счёт', 'счёта', 'счетов'])}</small></div>
    <div class="kpi" data-act="btab" data-v="cats" style="--c:${lim && ls > lim ? 'var(--hi)' : 'var(--acc)'}"><span>${ic('target')} Лимиты</span><b class="num">${lim ? Math.round(ls / lim * 100) + '%' : '—'}</b><small>${lim ? money0(ls) + ' из ' + money0(lim) + ' по категориям с лимитом' : 'задайте лимиты в категориях'}</small>${lim ? `<div class="kbar"><i style="width:${Math.min(100, ls / lim * 100)}%"></i></div>` : ''}</div>
  </div>
  <div class="grid3" style="margin-bottom:1rem">
    <section class="pan"><div class="ph2"><h2>Расходы нарастающим итогом</h2><span class="spacer"></span><small>${isCur ? `в среднем ${money0(avg)} в день · прогноз на месяц ${money0(forecast)}` : `в среднем ${money0(avg)} в день`}</small></div><div class="chartbox tall"><canvas id="ch-cum"></canvas></div></section>
    <section class="pan"><div class="ph2"><h2>По категориям</h2><span class="spacer"></span><small>нажмите — откроются операции</small></div>${cats.length ? `<div class="chartbox sm"><canvas id="ch-cat"></canvas></div><div style="margin-top:.6rem">${cats.slice(0, 6).map(x => `<div class="lrow" data-act="opsByCat" data-id="${x.c.id}" style="--c:${x.c.color}"><span class="dot"></span><div class="tx"><b>${esc(x.c.title)}</b></div><span class="am num">${money0(x.v)}</span><small class="hint" style="width:3rem;text-align:right">${Math.round(x.v / exp * 100)}%</small></div>`).join('')}</div>` : '<div class="empty">Расходов в этом месяце пока нет</div>'}</section>
  </div>
  <div class="grid2" style="margin-bottom:1rem">
    <section class="pan"><div class="ph2"><h2>Доходы и расходы за полгода</h2><span class="spacer"></span><small>нажмите на месяц, чтобы перейти</small></div><div class="chartbox"><canvas id="ch-6m"></canvas></div></section>
    <section class="pan"><div class="ph2"><h2>Лимиты по категориям</h2><span class="spacer"></span><button class="btn sm ghost" data-act="btab" data-v="cats">Настроить</button></div>${limited.length ? limited.map(x => limRow(x.c, x.v)).join('') : '<div class="empty">Лимиты не заданы. Откройте вкладку «Категории» и укажите, сколько готовы тратить в месяц.</div>'}</section>
  </div>
  <div class="grid2">
    <section class="pan"><div class="ph2"><h2>Ближайшие платежи</h2><small>30 дней</small><span class="spacer"></span><button class="btn sm ghost" data-act="btab" data-v="regular">Все</button></div>${pays.length ? pays.slice(0, 7).map(payRow).join('') : '<div class="empty">Регулярных платежей нет. Добавьте квартплату, связь, подписки — они появятся в календаре и напомнят о себе.</div>'}</section>
    <section class="pan"><div class="ph2"><h2>Последние операции</h2><span class="spacer"></span><button class="btn sm ghost" data-act="btab" data-v="ops">Все операции</button></div>${L.length ? [...L].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created).slice(0, 7).map(x => txRow(x)).join('') : '<div class="empty">В этом месяце операций нет</div>'}</section>
  </div>`;
}
function limRow(c, v, act = 'opsByCat') { const p = c.limit ? v / c.limit : 0; return `<div class="lim" data-act="${act}" data-id="${c.id}" style="--c:${c.color}"><span class="nm"><i></i>${esc(c.title)}</span><span class="vl"><b class="${p > 1 ? 'red' : ''}">${money0(v)}</b> из ${money0(c.limit)}${p > 1 ? ` · перерасход ${money0(v - c.limit)}` : ` · осталось ${money0(c.limit - v)}`}</span><div class="prog ${p > 1 ? 'over' : ''}" style="--c:${p > .85 ? 'var(--mid)' : c.color}"><i style="width:${Math.min(100, p * 100)}%"></i></div></div>`; }

function filteredOps() {
  const f = BF.f, q = (UI.q || '').toLowerCase();
  return txMonth(BF.month).filter(x => (!f.type || x.type === f.type) && (!f.cat || x.category === f.cat) && (!f.acc || x.account === f.acc || x.to === f.acc) && (!f.proj || (f.proj === '_' ? !x.project : x.project === f.proj)) && (!f.tag || (x.tags || []).includes(f.tag)) && (!q || (txTitle(x) + ' ' + x.note).toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}
function vOps() {
  const f = BF.f, L = filteredOps(), days = [...new Set(L.map(x => x.date))];
  const sel = (id, v, list, ph) => `<select class="in" id="${id}"><option value="">${ph}</option>${list.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="pan"><div class="opfil">
    ${sel('of-type', f.type, [['expense', 'Расходы'], ['income', 'Доходы'], ['transfer', 'Переводы']], 'Все типы')}
    ${sel('of-cat', f.cat, B().categories.map(c => [c.id, (c.type === 'income' ? '↑ ' : '') + c.title]), 'Все категории')}
    ${sel('of-acc', f.acc, B().accounts.map(a => [a.id, a.title]), 'Все счета')}
    ${D.projects.length ? sel('of-proj', f.proj, D.projects.map(p => [p.id, p.title]).concat([['_', 'Без проекта']]), 'Все проекты') : ''}
    ${D.tags.length ? sel('of-tag', f.tag, D.tags.map(t => [t.id, '#' + t.title]), 'Все теги') : ''}
    ${Object.values(f).some(Boolean) ? '<button class="btn ghost" data-act="ofReset">Сбросить</button>' : ''}
  </div>
  <div class="stats" style="margin:.4rem 0 .2rem"><span><b>${L.length}</b> ${plural(L.length, POP)}</span><span class="g"><b>${money(sumT(L, 'income'))}</b> доходы</span><span><b style="color:var(--exp)">${money(sumT(L, 'expense'))}</b> расходы</span></div>
  ${days.length ? days.map(d => { const ds = L.filter(x => x.date === d); const e = sumT(ds, 'expense'), i = sumT(ds, 'income'); return `<div class="daygrp"><h3>${dayLong(d)}<small>${i ? '+' + money(i) + '  ' : ''}${e ? '−' + money(e) : ''}</small></h3>${ds.map(x => txRow(x, { noDate: true })).join('')}</div>`; }).join('') : '<div class="empty" style="margin-top:.8rem">Операций не найдено. Добавьте первую кнопкой «Расход» или «Доход» сверху.</div>'}</div>`;
}
function vCats() {
  const k = BF.month, E = B().categories.filter(c => c.type === 'expense'), I = B().categories.filter(c => c.type === 'income');
  const row = c => { const v = c.type === 'expense' ? catSpent(c.id, k) : sumT(txMonth(k).filter(x => x.category === c.id), 'income'); return c.limit ? limRow(c, v, 'openCat') : `<div class="lim" data-act="openCat" data-id="${c.id}" style="--c:${c.color}"><span class="nm"><i></i>${esc(c.title)}</span><span class="vl"><b>${money0(v)}</b>${c.type === 'expense' ? ' · без лимита' : ''}</span></div>`; };
  return `<div class="grid3"><section class="pan"><div class="ph2"><h2>Категории расходов</h2><small>${mTitle(k).toLowerCase()}</small><span class="spacer"></span><button class="btn sm" data-act="newCat" data-v="expense">${ic('plus')} Категория</button></div>
    <div class="chartbox" style="margin-bottom:.8rem"><canvas id="ch-catbar"></canvas></div>${E.map(row).join('')}</section>
    <section class="pan"><div class="ph2"><h2>Категории доходов</h2><span class="spacer"></span><button class="btn sm" data-act="newCat" data-v="income">${ic('plus')} Категория</button></div>${I.map(row).join('')}<p class="hint" style="margin-top:.8rem">Нажмите на категорию, чтобы изменить название, цвет или месячный лимит.</p></section></div>`;
}
function vAccounts() {
  const tr = B().tx.filter(x => x.type === 'transfer').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return `<div class="ph2"><h2 style="font-size:1.07rem;margin:0">Счета · всего ${money(totalBalance())}</h2><span class="spacer"></span><button class="btn" data-act="newTx" data-v="transfer">${ic('swap')} Перевод</button><button class="btn" data-act="newAcc">${ic('plus')} Счёт</button></div>
    <div class="acc-grid" style="margin-bottom:1rem">${B().accounts.map(a => { const v = accBalance(a.id), n = B().tx.filter(x => x.account === a.id || x.to === a.id).length; return `<button class="acc" data-act="openAcc" data-id="${a.id}" style="--c:${a.color}"><span>${ic(a.type === 'cash' ? 'coin' : 'wallet')}${esc(a.title)}</span><b>${money(v)}</b><small>${(ACC_T.find(t => t[0] === a.type) || ['', 'Счёт'])[1]} · ${n} ${plural(n, POP)}</small></button>`; }).join('')}</div>
    <div class="grid2"><section class="pan"><div class="ph2"><h2>Остаток на счетах</h2><small>на конец месяца</small></div><div class="chartbox"><canvas id="ch-bal"></canvas></div></section>
    <section class="pan"><div class="ph2"><h2>Последние переводы</h2></div>${tr.length ? tr.map(x => txRow(x)).join('') : '<div class="empty">Переводов между счетами не было</div>'}</section></div>`;
}
function vRegular() {
  const R = B().regular, mon = r2(R.filter(r => r.active !== false && r.type !== 'income').reduce((a, r) => a + (r.repeat === 'week' ? r.amount * 4.345 : r.repeat === 'quarter' ? r.amount / 3 : r.repeat === 'year' ? r.amount / 12 : r.amount), 0));
  return `<div class="grid3"><section class="pan"><div class="ph2"><h2>Регулярные платежи</h2><small>≈ ${money0(mon)} в месяц</small><span class="spacer"></span><button class="btn sm pri" data-act="newReg">${ic('plus')} Платёж</button></div>
    ${R.length ? [...R].sort((a, b) => (a.nextDate || '9').localeCompare(b.nextDate || '9')).map(r => { const c = catOf(r.category), od = r.nextDate < today(); return `<div class="lrow" data-act="openReg" data-id="${r.id}" style="--c:${c ? c.color : 'var(--exp)'};${r.active === false ? 'opacity:.5' : ''}"><span class="dot"></span><div class="tx"><b>${esc(r.title)}</b><small style="${od ? 'color:var(--hi)' : ''}">${r.active === false ? 'на паузе' : (od ? 'просрочен · ' : 'следующий ') + human(r.nextDate).toLowerCase()} · ${(REG_REP.find(x => x[0] === r.repeat) || ['', ''])[1].toLowerCase()}${r.remind != null ? ' · напомню' : ''}</small></div><span class="am ${r.type === 'income' ? 'inc' : 'exp'}">${money(r.amount)}</span>${r.active !== false ? `<button class="btn sm" data-act="payReg" data-id="${r.id}">${r.type === 'income' ? 'Получено' : 'Оплачено'}</button><button class="btn sm ghost" data-act="skipReg" data-id="${r.id}" title="Пропустить этот раз">Пропустить</button>` : ''}</div>`; }).join('') : '<div class="empty">Добавьте платежи, которые повторяются: квартплата, связь, кредит, подписки. Они появятся в календаре, напомнят о себе, а кнопка «Оплачено» сама запишет расход.</div>'}</section>
    <section class="pan"><div class="ph2"><h2>Календарь платежей</h2><small>60 дней</small></div>${nextPays(60).map(payRow).join('') || '<div class="empty">Нет платежей</div>'}</section></div>`;
}

registerModule({
  id: 'budget', order: 5, title: 'Бюджет', icon: 'wallet', desc: 'Счета, доходы и расходы, категории с лимитами, регулярные платежи и аналитика',
  badge: () => B().regular.filter(r => r.active !== false && r.nextDate && r.nextDate <= today()).length || '',
  bar() {
    const T = [['overview', 'Обзор'], ['ops', 'Операции'], ['cats', 'Категории'], ['accounts', 'Счета'], ['regular', 'Платежи']];
    return `<h1>Бюджет</h1><div class="chips"><button class="ib" data-act="bprev" aria-label="Прошлый месяц">${ic('left')}</button><b style="min-width:9.5rem;text-align:center;font-size:1.05rem">${mTitle(BF.month)}</b><button class="ib" data-act="bnext" aria-label="Следующий месяц">${ic('right')}</button>${BF.month !== mkey(today()) ? '<button class="btn sm ghost" data-act="bcur">Текущий</button>' : ''}</div>
      <div class="subtabs">${T.map(([k, l]) => `<button class="${BF.tab === k ? 'on' : ''}" data-act="btab" data-v="${k}">${l}</button>`).join('')}</div><span class="spacer"></span>
      <button class="btn" data-act="newTx" data-v="income" style="color:var(--inc)">${ic('plus')} Доход</button><button class="btn pri" data-act="newTx" data-v="expense">${ic('plus')} Расход</button>`;
  },
  render: () => `<div class="scroll">${({ overview: vOverview, ops: vOps, cats: vCats, accounts: vAccounts, regular: vRegular }[BF.tab] || vOverview)()}</div>`,
  after() {
    const k = BF.month, inc = cssv('--inc'), exp = cssv('--exp'), acc = cssv('--acc'), mute = cssv('--mute');
    if (BF.tab === 'overview') {
      const isCur = k === mkey(today()), upto = isCur ? +today().slice(8) : 0, n = mDays(k);
      const ds = [{ label: mTitle(k), data: cumul(k, upto), borderColor: exp, backgroundColor: c => { const g = c.chart.ctx.createLinearGradient(0, 0, 0, c.chart.height); g.addColorStop(0, exp + '55'); g.addColorStop(1, exp + '00'); return g; }, fill: true, tension: .3, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5 },
        { label: mTitle(mAdd(k, -1)), data: cumul(mAdd(k, -1)).slice(0, n), borderColor: mute, borderDash: [5, 5], pointRadius: 0, tension: .3, borderWidth: 1.5, fill: false }];
      chart('ch-cum', { type: 'line', data: { labels: [...Array(n)].map((_, i) => i + 1), datasets: ds }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: { ...axisMoney, beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { title: i => i[0].label + ' ' + MG[+k.slice(5) - 1], label: c => c.dataset.label + ': ' + money0(c.parsed.y) } } } } });
      const cats = B().categories.filter(c => c.type === 'expense').map(c => ({ c, v: catSpent(c.id, k) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
      if (cats.length) chart('ch-cat', { type: 'doughnut', data: { labels: cats.map(x => x.c.title), datasets: [{ data: cats.map(x => x.v), backgroundColor: cats.map(x => x.c.color), borderColor: cssv('--panel'), borderWidth: 3, hoverOffset: 8 }] }, options: { cutout: '66%', onClick: (e, el) => { if (el[0]) ACT.opsByCat({ dataset: { id: cats[el[0].index].c.id } }); }, plugins: { tooltip: { callbacks: { label: c => ' ' + money0(c.parsed) } } } } });
      const ms = [...Array(6)].map((_, i) => mAdd(k, i - 5));
      chart('ch-6m', { type: 'bar', data: { labels: ms.map(m => MNS[+m.slice(5) - 1]), datasets: [{ label: 'Доходы', data: ms.map(m => sumT(txMonth(m), 'income')), backgroundColor: inc, borderRadius: 6, maxBarThickness: 26 }, { label: 'Расходы', data: ms.map(m => sumT(txMonth(m), 'expense')), backgroundColor: exp, borderRadius: 6, maxBarThickness: 26 }] }, options: { onClick: (e, el) => { if (el[0]) { BF.month = ms[el[0].index]; render(); } }, scales: { y: { ...axisMoney, beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { title: i => mTitle(ms[i[0].dataIndex]), label: c => c.dataset.label + ': ' + money0(c.parsed.y) } } } } });
    } else if (BF.tab === 'cats') {
      const E = B().categories.filter(c => c.type === 'expense').map(c => ({ c, v: catSpent(c.id, k) })).filter(x => x.v > 0 || x.c.limit).sort((a, b) => b.v - a.v);
      chart('ch-catbar', { type: 'bar', data: { labels: E.map(x => x.c.title), datasets: [{ label: 'Потрачено', data: E.map(x => x.v), backgroundColor: E.map(x => x.c.limit && x.v > x.c.limit ? cssv('--hi') : x.c.color), borderRadius: 6, maxBarThickness: 18 }, { label: 'Лимит', data: E.map(x => x.c.limit || null), backgroundColor: cssv('--line2'), borderRadius: 6, maxBarThickness: 18 }] }, options: { indexAxis: 'y', onClick: (e, el) => { if (el[0]) ACT.opsByCat({ dataset: { id: E[el[0].index].c.id } }); }, scales: { x: { ...axisMoney, beginAtZero: true }, y: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money0(c.parsed.x) } } } } });
    } else if (BF.tab === 'accounts') {
      const ms = [...Array(6)].map((_, i) => mAdd(k, i - 5));
      const balAt = (aid, m) => { const end = m + '-' + pad(mDays(m)); const a = accOf(aid); let v = +a.initial || 0; for (const x of B().tx) { if (x.date > end) continue; if (x.type === 'income' && x.account === aid) v += x.amount; else if (x.type === 'expense' && x.account === aid) v -= x.amount; else if (x.type === 'transfer') { if (x.account === aid) v -= x.amount; if (x.to === aid) v += x.amount; } } return r2(v); };
      chart('ch-bal', { type: 'line', data: { labels: ms.map(m => MNS[+m.slice(5) - 1]), datasets: B().accounts.map(a => ({ label: a.title, data: ms.map(m => balAt(a.id, m)), borderColor: a.color, backgroundColor: a.color, tension: .3, pointRadius: 3, borderWidth: 2.2 })) }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: axisMoney, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money0(c.parsed.y) } } } } });
    }
  },
  search(q) {
    const out = B().tx.filter(x => (txTitle(x) + ' ' + x.note + ' ' + String(x.amount)).toLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(x => ({ group: 'Операции', title: txTitle(x), sub: typeSign(x.type) + money(x.amount) + ' · ' + human(x.date), color: (catOf(x.category) || { color: '#7d8590' }).color, act: 'openTx', id: x.id }));
    return out.concat(B().regular.filter(r => r.title.toLowerCase().includes(q)).map(r => ({ group: 'Платежи', title: r.title, sub: money(r.amount), color: 'var(--exp)', act: 'openReg', id: r.id })));
  }
});

// ---------- форма операции ----------
function openTxForm(id, preset) {
  const src = id ? txOf(id) : null; if (id && !src) return;
  const p = preset || {}, type = src ? src.type : (p.type || 'expense');
  const x = src ? clone(src) : newTx({ type, account: BF.last.account || B().accounts[0].id, category: type === 'transfer' ? null : (BF.last[type] || (B().categories.find(c => c.type === type) || {}).id), date: (UI.view === 'calendar' && UI.calDate) || today(), ...p });
  delete x.back;
  UI.form = { kind: 'tx', isNew: !src, x, back: p.back || null, catTouched: !!src || !!p.category };
  drawTxForm();
}
function drawTxForm() {
  const F = UI.form, x = F.x, t = x.type;
  const cats = B().categories.filter(c => c.type === t);
  const tasks = live().filter(k => (!x.project || k.project === x.project) && (!isDone(k) || k.id === x.task)).slice(0, 300);
  modal(`<div class="mbox narrow"><div class="mh"><h2>${F.isNew ? 'Новая операция' : 'Операция'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="xform" autocomplete="off">
    <div class="pseg type" role="group" aria-label="Тип">${[['expense', 'Расход', 'exp'], ['income', 'Доход', 'inc'], ['transfer', 'Перевод', 'tr']].map(([k, l, c]) => `<button type="button" class="${c} ${t === k ? 'on' : ''}" data-act="xtype" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="f"><span>Сумма, ${esc(cur())}</span><input class="in money" id="x-amount" inputmode="decimal" value="${x.amount ? String(x.amount).replace('.', ',') : ''}" placeholder="0"></label>
    <div class="row two"><label class="f"><span>Дата</span><input type="date" class="in" id="x-date" value="${x.date}"></label>
      <label class="f"><span>${t === 'transfer' ? 'Со счёта' : 'Счёт'}</span><select class="in" id="x-acc">${B().accounts.map(a => `<option value="${a.id}" ${a.id === x.account ? 'selected' : ''}>${esc(a.title)} · ${money0(accBalance(a.id))}</option>`).join('')}</select></label></div>
    ${t === 'transfer' ? `<label class="f"><span>На счёт</span><select class="in" id="x-to">${B().accounts.map(a => `<option value="${a.id}" ${a.id === (x.to || B().accounts.find(z => z.id !== x.account)?.id) ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></label>`
    : `<label class="f"><span>Категория</span><select class="in" id="x-cat">${cats.map(c => `<option value="${c.id}" ${c.id === x.category ? 'selected' : ''}>${esc(c.title)}${c.limit ? ' · осталось ' + money0(c.limit - catSpent(c.id, mkey(x.date))) : ''}</option>`).join('')}</select></label>
      <div class="row two"><label class="f"><span>Проект</span><select class="in" id="x-proj"><option value="">Без проекта</option>${D.projects.map(p => `<option value="${p.id}" ${p.id === x.project ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label>
      <label class="f"><span>Задача</span><select class="in" id="x-task"><option value="">Не привязана</option>${tasks.map(k => `<option value="${k.id}" ${k.id === x.task ? 'selected' : ''}>${esc(k.title.slice(0, 60))}</option>`).join('')}</select></label></div>
      <div class="f"><span>Теги</span><div id="x-tags">${tagPick(x.tags, 'xtag')}</div></div>`}
    <label class="f"><span>Комментарий</span><input class="in" id="x-note" value="${esc(x.note)}" placeholder="Например: продукты на неделю" maxlength="200"></label>
    <div class="qsug" id="x-sug"></div><p class="hint" id="x-hint"></p>
  </form>
  <div class="mf">${F.isNew ? '' : `<button class="btn ghost danger" data-act="fdel">${ic('trash')} Удалить</button><button class="btn ghost" data-act="fdup">Повторить</button>`}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="fsave">Сохранить</button></div></div>`);
  setTimeout(() => { const i = $('#x-amount'); if (i) { i.focus(); i.select(); } }, 30);
}
function readTx() {
  const x = UI.form.x; x.amount = parseMoney($('#x-amount').value); x.date = $('#x-date').value || today(); x.account = $('#x-acc').value; x.note = $('#x-note').value.trim();
  if (x.type === 'transfer') { x.to = $('#x-to').value; x.category = null; x.project = null; x.task = null; }
  else { x.to = null; x.category = $('#x-cat') ? $('#x-cat').value || null : null; x.project = $('#x-proj').value || null; x.task = $('#x-task').value || null; }
  return x;
}
function saveTxForm() {
  const F = UI.form, x = readTx();
  if (!(x.amount > 0)) { $('#x-amount').focus(); $('#x-amount').style.borderColor = 'var(--hi)'; return toast('Введите сумму больше нуля'); }
  if (x.type === 'transfer' && x.to === x.account) return toast('Выберите разные счета для перевода');
  snapU();
  if (F.isNew) { B().tx.push(x); if (typeof runRules === 'function') runRules('tx.created', x); } else Object.assign(txOf(x.id), x);
  BF.last.account = x.account; if (x.type !== 'transfer') BF.last[x.type] = x.category;
  save();
  const c = x.category && catOf(x.category), back = F.back;
  let note = '';
  if (c && c.limit && x.type === 'expense') { const s = catSpent(c.id, mkey(x.date)); if (s > c.limit) note = ` Лимит «${c.title}» превышен на ${money0(s - c.limit)}.`; else if (s > c.limit * .85) note = ` По «${c.title}» осталось ${money0(c.limit - s)}.`; }
  closeModal();
  if (back && back.kind === 'task') openTaskForm(back.id);
  render(); toast((F.isNew ? (x.type === 'income' ? 'Доход' : x.type === 'transfer' ? 'Перевод' : 'Расход') + ' записан.' : 'Операция изменена.') + note, true);
}
function openRegForm(id, preset) {
  const src = id ? regOf(id) : null;
  const r = src ? clone(src) : { id: uid(), title: '', type: 'expense', amount: 0, account: B().accounts[0].id, category: (B().categories.find(c => c.type === 'expense') || {}).id, project: null, tags: [], repeat: 'month', nextDate: today(), remind: 1, active: true, ...(preset || {}) };
  UI.form = { kind: 'reg', isNew: !src, r };
  modal(`<div class="mbox narrow"><div class="mh"><h2>${src ? 'Регулярный платёж' : 'Новый регулярный платёж'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="rform" autocomplete="off">
    <label class="f"><span>Название</span><input class="in title" id="r-title" value="${esc(r.title)}" placeholder="Квартплата, интернет, подписка…" maxlength="80"></label>
    <div class="row two"><label class="f"><span>Сумма, ${esc(cur())}</span><input class="in" id="r-amount" inputmode="decimal" value="${r.amount ? String(r.amount).replace('.', ',') : ''}"></label>
      <label class="f"><span>Тип</span><select class="in" id="r-type"><option value="expense" ${r.type !== 'income' ? 'selected' : ''}>Расход</option><option value="income" ${r.type === 'income' ? 'selected' : ''}>Доход</option></select></label></div>
    <div class="row two"><label class="f"><span>Периодичность</span><select class="in" id="r-rep">${REG_REP.map(([k, l]) => `<option value="${k}" ${r.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f"><span>Ближайшая дата</span><input type="date" class="in" id="r-date" value="${r.nextDate}"></label></div>
    <div class="row two"><label class="f"><span>Счёт</span><select class="in" id="r-acc">${B().accounts.map(a => `<option value="${a.id}" ${a.id === r.account ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></label>
      <label class="f"><span>Категория</span><select class="in" id="r-cat">${B().categories.map(c => `<option value="${c.id}" ${c.id === r.category ? 'selected' : ''}>${c.type === 'income' ? '↑ ' : ''}${esc(c.title)}</option>`).join('')}</select></label></div>
    <div class="row two"><label class="f"><span>Напоминание</span><select class="in" id="r-rem">${REG_REM.map(([k, l]) => `<option value="${k === null ? '' : k}" ${String(k) === String(r.remind) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f"><span>Проект</span><select class="in" id="r-proj"><option value="">Без проекта</option>${D.projects.map(p => `<option value="${p.id}" ${p.id === r.project ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label></div>
    <label class="sline" style="border:0;padding:0"><span class="tx"><b>Активен</b><span>Платёж на паузе не показывается в календаре и не напоминает</span></span><input type="checkbox" class="tog" id="r-active" ${r.active !== false ? 'checked' : ''}></label>
    <p class="hint">Платёж появится в календаре. Кнопка «Оплачено» запишет расход и перенесёт дату на следующий период.</p>
  </form>
  <div class="mf">${src ? `<button class="btn ghost danger" data-act="fdel">${ic('trash')} Удалить</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="fsave">Сохранить</button></div></div>`);
  setTimeout(() => $('#r-title')?.focus(), 30);
}
function saveRegForm() {
  const F = UI.form, r = F.r;
  r.title = $('#r-title').value.trim(); r.amount = parseMoney($('#r-amount').value); r.type = $('#r-type').value; r.repeat = $('#r-rep').value; r.nextDate = $('#r-date').value || today(); r.day = pd(r.nextDate).getDate();
  r.account = $('#r-acc').value; r.category = $('#r-cat').value; r.remind = $('#r-rem').value === '' ? null : +$('#r-rem').value; r.project = $('#r-proj').value || null; r.active = $('#r-active').checked;
  if (!r.title) return toast('Введите название платежа');
  if (!(r.amount > 0)) return toast('Введите сумму больше нуля');
  snapU(); if (F.isNew) B().regular.push(r); else Object.assign(regOf(r.id), r);
  save(); closeModal(); render(); toast('Платёж сохранён', true);
}
function openCatForm(id, type) {
  const src = id ? catOf(id) : null, c = src ? clone(src) : { id: uid(), title: '', color: COLORS[B().categories.length % COLORS.length], type: type || 'expense', limit: null };
  UI.form = { kind: 'cat', isNew: !src, c };
  const used = src ? B().tx.filter(x => x.category === src.id).length : 0;
  modal(`<div class="mbox narrow"><div class="mh"><h2>${src ? 'Категория' : 'Новая категория'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="cform"><label class="f"><span>Название</span><input class="in" id="c-title" value="${esc(c.title)}" maxlength="40"></label>
    <div class="f"><span>Цвет</span>${swatch(c.color, 'cColor')}</div>
    <div class="row two"><label class="f"><span>Тип</span><select class="in" id="c-type"><option value="expense" ${c.type === 'expense' ? 'selected' : ''}>Расходы</option><option value="income" ${c.type === 'income' ? 'selected' : ''}>Доходы</option></select></label>
    <label class="f"><span>Лимит в месяц, ${esc(cur())}</span><input class="in" id="c-limit" inputmode="decimal" value="${c.limit || ''}" placeholder="без лимита"></label></div>
    ${src ? `<p class="hint">Операций в категории: ${used}.</p>` : ''}</form>
  <div class="mf">${src ? `<button class="btn ghost danger" data-act="catDel">${ic('trash')} Удалить</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="catSave">Сохранить</button></div></div>`);
  setTimeout(() => $('#c-title')?.focus(), 30);
}
function openAccForm(id) {
  const src = id ? accOf(id) : null, a = src ? clone(src) : { id: uid(), title: '', type: 'card', color: COLORS[B().accounts.length % COLORS.length], initial: 0 };
  UI.form = { kind: 'acc', isNew: !src, a };
  modal(`<div class="mbox narrow"><div class="mh"><h2>${src ? 'Счёт' : 'Новый счёт'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="aform"><label class="f"><span>Название</span><input class="in" id="a-title" value="${esc(a.title)}" maxlength="40" placeholder="Например, «Карта Сбербанка»"></label>
    <div class="row two"><label class="f"><span>Тип</span><select class="in" id="a-type">${ACC_T.map(([k, l]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f"><span>Начальный остаток, ${esc(cur())}</span><input class="in" id="a-init" inputmode="decimal" value="${a.initial || 0}"></label></div>
    <div class="f"><span>Цвет</span>${swatch(a.color, 'aColor')}</div>
    ${src ? `<p class="hint">Текущий остаток: <b>${money(accBalance(a.id))}</b>. Он считается так: начальный остаток + доходы − расходы ± переводы.</p>` : ''}</form>
  <div class="mf">${src ? `<button class="btn ghost danger" data-act="accDel">${ic('trash')} Удалить</button><button class="btn ghost" data-act="accOps" data-id="${a.id}">Операции по счёту</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="accSave">Сохранить</button></div></div>`);
  setTimeout(() => $('#a-title')?.focus(), 30);
}

Object.assign(ACT, {
  bprev: () => { BF.month = mAdd(BF.month, -1); render(); }, bnext: () => { BF.month = mAdd(BF.month, 1); render(); }, bcur: () => { BF.month = mkey(today()); render(); },
  btab: b => { BF.tab = b.dataset.v; if (UI.view !== 'budget') go('budget'); else render(); },
  newTx: b => openTxForm(null, { type: b.dataset.v || 'expense', ...(UI.view === 'projects' && UI.proj ? { project: UI.proj } : {}) }),
  openTx: b => openTxForm(b.dataset.id),
  xtype: b => { readTx(); const x = UI.form.x; x.type = b.dataset.v; const c = catOf(x.category); if (x.type !== 'transfer' && (!c || c.type !== x.type)) x.category = BF.last[x.type] || (B().categories.find(c => c.type === x.type) || {}).id; drawTxForm(); },
  xtag: b => { const a = UI.form.x.tags, v = b.dataset.v, i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); b.classList.toggle('on', i < 0); },
  opsByCat: b => { BF.f = { type: '', cat: b.dataset.id, acc: '', proj: '', tag: '' }; BF.tab = 'ops'; go('budget'); },
  accOps: b => { BF.f = { type: '', cat: '', acc: b.dataset.id, proj: '', tag: '' }; BF.tab = 'ops'; closeModal(); go('budget'); },
  ofReset: () => { BF.f = { type: '', cat: '', acc: '', proj: '', tag: '' }; render(); },
  newReg: () => openRegForm(null), openReg: b => openRegForm(b.dataset.id),
  payReg: b => { const r = regOf(b.dataset.id); if (r) payRegular(r); },
  skipReg: b => { const r = regOf(b.dataset.id); if (!r) return; snapU(); r.nextDate = stepDate(r.nextDate, r.repeat, r.day || pd(r.nextDate).getDate()); save(); render(); toast('Платёж пропущен, следующий ' + human(r.nextDate).toLowerCase(), true); },
  newCat: b => openCatForm(null, b.dataset.v), openCat: b => openCatForm(b.dataset.id),
  cColor: b => { UI.form.c.color = b.dataset.v; $$('#cform .swb').forEach(s => s.classList.toggle('on', s === b)); },
  catSave: () => { const c = UI.form.c; c.title = $('#c-title').value.trim(); c.type = $('#c-type').value; const l = parseMoney($('#c-limit').value); c.limit = l > 0 ? l : null; if (!c.title) return toast('Введите название'); snapU(); if (UI.form.isNew) B().categories.push(c); else Object.assign(catOf(c.id), c); save(); closeModal(); render(); toast('Категория сохранена', true); },
  catDel: () => { const c = UI.form.c, same = B().categories.filter(x => x.type === c.type && x.id !== c.id); if (!same.length) return toast('Нужна хотя бы одна категория этого типа'); snapU(); const to = same[same.length - 1]; B().tx.forEach(x => { if (x.category === c.id) x.category = to.id; }); B().regular.forEach(x => { if (x.category === c.id) x.category = to.id; }); B().categories = B().categories.filter(x => x.id !== c.id); save(); closeModal(); render(); toast(`Категория удалена, операции перенесены в «${to.title}»`, true); },
  newAcc: () => openAccForm(null), openAcc: b => openAccForm(b.dataset.id),
  aColor: b => { UI.form.a.color = b.dataset.v; $$('#aform .swb').forEach(s => s.classList.toggle('on', s === b)); },
  accSave: () => { const a = UI.form.a; a.title = $('#a-title').value.trim(); a.type = $('#a-type').value; const v = parseMoney($('#a-init').value); a.initial = isFinite(v) ? v : 0; if (!a.title) return toast('Введите название счёта'); snapU(); if (UI.form.isNew) B().accounts.push(a); else Object.assign(accOf(a.id), a); save(); closeModal(); render(); toast('Счёт сохранён', true); },
  accDel: () => { const a = UI.form.a; if (B().accounts.length < 2) return toast('Нужен хотя бы один счёт'); if (B().tx.some(x => x.account === a.id || x.to === a.id)) return toast('По счёту есть операции — сначала удалите или перенесите их'); snapU(); B().accounts = B().accounts.filter(x => x.id !== a.id); save(); closeModal(); render(); toast('Счёт удалён', true); },
  fdelOther: () => {
    const F = UI.form;
    if (F.kind === 'tx') { snapU(); B().tx = B().tx.filter(x => x.id !== F.x.id); save(); closeModal(); render(); toast('Операция удалена', true); }
    else if (F.kind === 'reg') { snapU(); B().regular = B().regular.filter(x => x.id !== F.r.id); save(); closeModal(); render(); toast('Платёж удалён', true); }
    else if (F.kind === 'proj') ACT.projDel();
  },
  tplExp: b => { const tpl = D.templates.find(t => t.id === b.dataset.id); if (!tpl) return; snapU(); const x = applyTemplate(tpl); B().tx.push(x); if (typeof runRules === 'function') runRules('tx.created', x); save(); render(); toast(`Записано: ${x.note} — ${money(x.amount)}`, true, { act: 'openTx', id: x.id, label: 'Изменить' }); },
  fdupOther: () => { const F = UI.form; if (F.kind !== 'tx') return; const o = txOf(F.x.id); if (!o) return; openTxForm(null, { ...clone(o), id: uid(), date: today(), created: Date.now() }); }
});
