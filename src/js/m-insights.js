'use strict';
// ============================================================
//  Модуль «Инсайты»: статистические наблюдения по вашим данным (без советов)
// ============================================================
const WDO = [1, 2, 3, 4, 5, 6, 0], WDN = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], WDL = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = v => Math.round(v * 100) + '%';
const fx = v => (Math.round(v * 10) / 10).toLocaleString('ru-RU');

function computeInsights() {
  const td = today(), out = [], done = D.tasks.filter(t => t.doneAt), since = Date.now() - 56 * 864e5;
  const recent = done.filter(t => t.doneAt >= since);
  // 1. дни недели
  if (recent.length >= 10) {
    const c = Array(7).fill(0); recent.forEach(t => c[(new Date(t.doneAt).getDay() + 6) % 7]++);
    const avg = c.map(v => v / 8), mx = avg.indexOf(Math.max(...avg)), mn = avg.indexOf(Math.min(...avg));
    out.push({ id: 'wd', sec: 'tasks', icon: 'cal', title: 'Выполнение по дням недели', value: WDN[mx], text: `Больше всего задач вы завершаете в ${WDL[mx]}: в среднем ${fx(avg[mx])} в неделю. Меньше всего — в ${WDL[mn]}: ${fx(avg[mn])}.`, basis: `${recent.length} ${plural(recent.length, PT)} за 8 недель`, chart: { type: 'bar', labels: WDN, data: avg.map(v => Math.round(v * 10) / 10), hl: mx } });
  } else out.push(need('tasks', 'wd', 'cal', 'Выполнение по дням недели', 10, recent.length));
  // 2. часы
  if (recent.length >= 10) {
    const h = Array(24).fill(0); recent.forEach(t => h[new Date(t.doneAt).getHours()]++);
    let best = 0, bi = 0; for (let i = 0; i < 22; i++) { const s = h[i] + h[i + 1] + h[i + 2]; if (s > best) { best = s; bi = i; } }
    out.push({ id: 'hr', sec: 'tasks', icon: 'clock', title: 'Время выполнения', value: `${bi}–${bi + 3} ч`, text: `${pct(best / recent.length)} задач отмечены выполненными между ${bi}:00 и ${bi + 3}:00. Это самое плотное трёхчасовое окно.`, basis: `по времени отметки «выполнено», ${recent.length} ${plural(recent.length, PT)}`, chart: { type: 'bar', labels: [...Array(24)].map((_, i) => i), data: h.slice(), hl: -1, range: [bi, bi + 2] } });
  } else out.push(need('tasks', 'hr', 'clock', 'Время выполнения', 10, recent.length));
  // 3. точность сроков
  const dated = done.filter(t => t.date);
  if (dated.length >= 8) {
    const late = dated.filter(t => ymd(new Date(t.doneAt)) > t.date), delays = late.map(t => diff(t.date, ymd(new Date(t.doneAt))));
    out.push({ id: 'ontime', sec: 'tasks', icon: 'target', title: 'Точность сроков', value: pct(1 - late.length / dated.length), text: `${pct(1 - late.length / dated.length)} задач с датой выполнены в срок или раньше. Опоздавшие закрывались в среднем на ${fx(delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0)} ${plural(Math.round(delays.reduce((a, b) => a + b, 0) / (delays.length || 1)), PD)} позже.`, basis: `${dated.length} выполненных задач с датой`, donut: [dated.length - late.length, late.length] });
    // 4. теги и опоздания
    const base = late.length / dated.length;
    const byTag = D.tags.map(tg => { const L = dated.filter(t => (t.tags || []).includes(tg.id)); return { tg, n: L.length, r: L.length ? L.filter(t => ymd(new Date(t.doneAt)) > t.date).length / L.length : 0 }; }).filter(x => x.n >= 4).sort((a, b) => b.r - a.r);
    if (byTag.length) { const w = byTag[0], b = byTag[byTag.length - 1]; out.push({ id: 'tag', sec: 'tasks', icon: 'tag', title: 'Опоздания по тегам', value: '#' + w.tg.title, text: `Задачи с #${w.tg.title} выполняются позже срока в ${pct(w.r)} случаев при среднем ${pct(base)}.${byTag.length > 1 ? ` Реже всего опаздывают задачи с #${b.tg.title}: ${pct(b.r)}.` : ''}`, basis: byTag.map(x => `#${x.tg.title}: ${x.n}`).join(', '), bars: byTag.slice(0, 5).map(x => ({ l: '#' + x.tg.title, v: x.r, c: x.tg.color })) }); }
  } else out.push(need('tasks', 'ontime', 'target', 'Точность сроков', 8, dated.length));
  // 5. время от создания до выполнения
  if (done.length >= 8) {
    const lt = done.map(t => Math.max(0, (t.doneAt - t.created) / 864e5));
    out.push({ id: 'lead', sec: 'tasks', icon: 'repeat', title: 'От создания до выполнения', value: fx(median(lt)) + ' дн', text: `Половина задач закрывается быстрее чем за ${fx(median(lt))} ${plural(Math.round(median(lt)), PD)} после создания. ${pct(lt.filter(v => v < 1).length / lt.length)} — в тот же день.`, basis: `медиана по ${done.length} выполненным задачам`, chart: { type: 'bar', labels: ['< 1 дня', '1 день', '2–3 дня', '4–7', '8–14', '15+'], data: [lt.filter(v => v < 1).length, lt.filter(v => v >= 1 && v < 2).length, lt.filter(v => v >= 2 && v < 4).length, lt.filter(v => v >= 4 && v < 8).length, lt.filter(v => v >= 8 && v < 15).length, lt.filter(v => v >= 15).length], hl: -1, all: true } });
  }
  // 6. поток задач
  const c4 = D.tasks.filter(t => t.created >= Date.now() - 28 * 864e5).length, d4 = done.filter(t => t.doneAt >= Date.now() - 28 * 864e5).length;
  if (c4 + d4 >= 6) out.push({ id: 'flow', sec: 'tasks', icon: 'chart', title: 'Создано и выполнено за 4 недели', value: (c4 - d4 > 0 ? '+' : '') + (c4 - d4), text: `Создано ${c4} ${plural(c4, PT)}, выполнено ${d4}. ${c4 > d4 ? `Число открытых задач выросло на ${c4 - d4}.` : c4 < d4 ? `Число открытых задач сократилось на ${d4 - c4}.` : 'Число открытых задач не изменилось.'}`, basis: 'последние 28 дней', bars: [{ l: 'Создано', v: c4, c: cssv('--acc'), abs: true }, { l: 'Выполнено', v: d4, c: cssv('--ok'), abs: true }] });
  // 7. загрузка против ёмкости
  const next7 = [...Array(7)].map((_, i) => addDays(td, i)), loads = next7.map(d => loadLeft(d)), caps = next7.map(capOf), over = next7.filter((d, i) => loads[i] > caps[i]);
  out.push({ id: 'cap', sec: 'time', icon: 'clock', title: 'Загрузка на 7 дней', value: over.length ? over.length + ' ' + plural(over.length, ['день', 'дня', 'дней']) : 'без перегруза', text: `Запланировано ${hm(loads.reduce((a, b) => a + b, 0))} при ёмкости ${durTxt(caps.reduce((a, b) => a + b, 0))}.${over.length ? ' Больше ёмкости: ' + over.map(d => human(d).toLowerCase()).join(', ') + '.' : ''} Для задач без длительности берётся ${D.settings.defDur} мин.`, basis: 'ёмкость дня задаётся в настройках «Умные функции»', cap: { labels: next7.map(d => WSU[pd(d).getDay()] + ' ' + pd(d).getDate()), loads, caps } });
  // 8. фактически выполнено в день
  const d14 = [...Array(14)].map((_, i) => addDays(td, -i - 1)), doneMin = d14.map(d => done.filter(t => ymd(new Date(t.doneAt)) === d && !kids(t.id).length).reduce((a, t) => a + durOf(t), 0));
  if (doneMin.some(Boolean)) { const avg = doneMin.reduce((a, b) => a + b, 0) / 14, avgCap = d14.reduce((a, d) => a + capOf(d), 0) / 14; out.push({ id: 'real', sec: 'time', icon: 'check', title: 'Выполнено в день (по длительности)', value: durTxt(Math.round(avg)), text: `За последние 14 дней в среднем выполнялось ${durTxt(Math.round(avg))} задач в день — ${pct(avg / avgCap)} от средней ёмкости ${durTxt(Math.round(avgCap))}.`, basis: 'сумма длительностей выполненных задач', cap: { labels: [...d14].reverse().map(d => pd(d).getDate() + ' ' + MGS[pd(d).getMonth()]), loads: [...doneMin].reverse(), caps: [...d14].reverse().map(capOf), done: true } }); }
  // 9. переносы
  const act = live().filter(t => !isDone(t)), pp = act.filter(t => (t.postponed || 0) >= 2);
  if (act.length) out.push({ id: 'post', sec: 'time', icon: 'swap', title: 'Многократные переносы', value: pp.length, text: pp.length ? `${pp.length} из ${act.length} открытых задач переносились на более позднюю дату два раза и больше. Чаще всех: «${pp.sort((a, b) => b.postponed - a.postponed)[0].title}» — ${pp[0].postponed} раз.` : `Ни одна из ${act.length} открытых задач не переносилась больше одного раза.`, basis: 'учитываются переносы даты вперёд', bars: [['не переносились', x => !(x.postponed || 0)], ['1 раз', x => x.postponed === 1], ['2 раза', x => x.postponed === 2], ['3 и больше', x => (x.postponed || 0) >= 3]].map(([l, f], i) => ({ l, v: act.filter(f).length, c: i < 2 ? cssv('--ok') : i === 2 ? cssv('--mid') : cssv('--hi'), abs: true })) });
  // 10. прогноз проектов
  for (const p of D.projects.filter(p => p.status === 'active' && p.deadline)) {
    const ts = projTasks(p.id), open = ts.filter(t => !isDone(t)).length, v = ts.filter(t => t.doneAt && t.doneAt >= Date.now() - 21 * 864e5).length / 3;
    if (!ts.length) continue;
    if (!open) { out.push({ sec: 'proj', id: 'p' + p.id, icon: 'proj', title: `Прогноз: ${p.title}`, value: 'готово', text: 'Все задачи проекта выполнены.', basis: `${ts.length} задач`, color: p.color, prog: { d: ts.length, n: ts.length, dl: p.deadline, eta: null } }); continue; }
    if (v <= 0) { out.push({ sec: 'proj', id: 'p' + p.id, icon: 'proj', title: `Прогноз: ${p.title}`, value: '—', text: `За последние 3 недели в проекте не выполнено ни одной задачи. Открыто ${open}.`, basis: 'темп считается по 21 дню', color: p.color, prog: { d: ts.length - open, n: ts.length, dl: p.deadline, eta: null } }); continue; }
    const eta = addDays(td, Math.ceil(open / v * 7)), gap = diff(p.deadline, eta);
    out.push({ sec: 'proj', id: 'p' + p.id, icon: 'proj', title: `Прогноз: ${p.title}`, value: human(eta), text: `При текущем темпе ${fx(v)} ${plural(Math.round(v), PT)} в неделю оставшиеся ${open} будут выполнены к ${pd(eta).getDate()} ${MG[pd(eta).getMonth()]}. Это ${gap > 0 ? `на ${gap} ${plural(gap, PD)} позже срока` : gap < 0 ? `на ${-gap} ${plural(-gap, PD)} раньше срока` : 'точно в срок'}.`, basis: 'темп по выполненным задачам за 21 день', color: p.color, warn: gap > 0, prog: { d: ts.length - open, n: ts.length, dl: p.deadline, eta } });
  }
  // 11. деньги: рост категорий
  const k = mkey(td), dayN = +td.slice(8), md = mDays(k), prev = [1, 2, 3].map(i => mAdd(k, -i));
  const cats = B().categories.filter(c => c.type === 'expense').map(c => { const cur = catSpent(c.id, k) / dayN * md, avg = prev.reduce((a, m) => a + catSpent(c.id, m), 0) / 3; return { c, cur, avg, g: avg > 0 ? (cur - avg) / avg : 0 }; }).filter(x => x.avg >= 500 && x.cur > 0);
  if (cats.length) {
    const up = [...cats].sort((a, b) => b.g - a.g)[0], dn = [...cats].sort((a, b) => a.g - b.g)[0];
    out.push({ id: 'catg', sec: 'money', icon: 'up', title: 'Расходы по категориям', value: up.g >= 2 ? '×' + fx(1 + up.g) : (up.g > 0 ? '+' : '') + pct(up.g), text: `«${up.c.title}»: при сохранении темпа месяц закроется на ${money0(up.cur)} — это ${up.g >= 2 ? 'в ' + fx(1 + up.g) + ' раза больше' : up.g >= 0 ? 'на ' + pct(up.g) + ' больше' : 'на ' + pct(-up.g) + ' меньше'} среднего за 3 месяца (${money0(up.avg)}).${dn.c.id !== up.c.id ? ` Сильнее всего снизилась «${dn.c.title}»: ${pct(dn.g)}.` : ''}`, basis: 'текущий месяц, пересчитанный на полный, против среднего за 3 прошлых', bars: cats.sort((a, b) => b.g - a.g).slice(0, 5).map(x => ({ l: x.c.title, v: x.g, c: x.c.color, signed: true, txt: x.g >= 2 ? '×' + fx(1 + x.g) : (x.g > 0 ? '+' : '') + pct(x.g) })) });
  }
  // 12. деньги: дни недели
  const tx90 = B().tx.filter(x => x.type === 'expense' && diff(x.date, td) <= 90 && !x.project && !x.regular);
  if (tx90.length >= 15) {
    const s = Array(7).fill(0); tx90.forEach(x => s[(pd(x.date).getDay() + 6) % 7] += x.amount);
    const a = s.map(v => v / 13), mean = a.reduce((x, y) => x + y, 0) / 7, mx = a.indexOf(Math.max(...a));
    out.push({ id: 'spwd', sec: 'money', icon: 'coin', title: 'Траты по дням недели', value: WDN[mx], text: `В ${WDL[mx]} вы тратите в среднем ${money0(a[mx])} — в ${fx(a[mx] / mean)} раза больше, чем в среднем за день недели (${money0(mean)}). Без регулярных платежей и расходов по проектам.`, basis: `${tx90.length} ${plural(tx90.length, POP)} за 90 дней`, chart: { type: 'bar', labels: WDN, data: a.map(Math.round), hl: mx, money: true } });
  }
  // 13. регулярные платежи
  const regM = B().regular.filter(r => r.active !== false && r.type !== 'income').reduce((a, r) => a + (r.repeat === 'week' ? r.amount * 4.345 : r.repeat === 'quarter' ? r.amount / 3 : r.repeat === 'year' ? r.amount / 12 : r.amount), 0);
  const incAvg = prev.reduce((a, m) => a + sumT(txMonth(m), 'income'), 0) / 3;
  if (regM && incAvg) out.push({ id: 'reg', sec: 'money', icon: 'repeat', title: 'Обязательные платежи', value: pct(regM / incAvg), text: `Регулярные платежи — около ${money0(regM)} в месяц, это ${pct(regM / incAvg)} от среднего дохода за 3 месяца (${money0(incAvg)}).`, basis: `${B().regular.filter(r => r.active !== false).length} активных платежей`, donut: [regM, Math.max(0, incAvg - regM)], donutL: ['Платежи', 'Остальное'] });
  if (typeof focusInsights === 'function') out.push(...focusInsights());
  return out;
}
const need = (sec, id, icon, title, n, have) => ({ sec, id, icon, title, value: '—', text: `Мало данных: нужно хотя бы ${n}, сейчас ${have}. Наблюдение появится само.`, basis: '', empty: true });

registerModule({
  id: 'insights', order: 6, title: 'Инсайты', icon: 'bulb', desc: 'Статистические наблюдения по задачам и деньгам: когда вы продуктивнее, где опаздываете, куда растут траты',
  bar() { const n = D.tasks.filter(t => t.doneAt).length; return `<h1>Инсайты</h1><div class="stats"><span>на основе <b>${n}</b> выполненных ${plural(n, ['задачи', 'задач', 'задач'])} и <b>${B().tx.length}</b> ${plural(B().tx.length, POP)}</span></div><span class="spacer"></span><span class="hint">Только факты из ваших данных, без рекомендаций</span>`; },
  render() {
    UI.ins = computeInsights();
    const SEC = [['tasks', 'Задачи', 'list'], ['focus', 'Фокус', 'timer'], ['time', 'Время и загрузка', 'clock'], ['proj', 'Проекты', 'proj'], ['money', 'Деньги', 'coin']];
    const vis = (x, i) => {
      if (x.chart || x.donut || x.cap) return `<div class="chartbox"><canvas id="ins-${i}"></canvas></div>`;
      if (x.bars) { const mx = Math.max(...x.bars.map(z => Math.abs(z.v))) || 1; return `<div class="ins-bars">${x.bars.map(b => `<div><span title="${esc(b.l)}">${esc(b.l)}</span><i style="--c:${b.c};width:${Math.max(1, Math.abs(b.v) / mx * 100)}%"></i><em>${b.txt || (b.abs ? b.v : b.signed ? (b.v > 0 ? '+' : '') + pct(b.v) : pct(b.v))}</em></div>`).join('')}</div>`; }
      if (x.prog) { const p = x.prog, pc = p.n ? Math.round(p.d / p.n * 100) : 0; return `<div class="ins-prog"><div class="ip-top"><b>${pc}%</b><span>${p.d} из ${p.n} задач</span></div><div class="prog" style="--c:${x.color}"><i style="width:${pc}%"></i></div><div class="ip-dates"><div><small>Срок</small><b>${p.dl ? human(p.dl) : '—'}</b></div><div><small>Прогноз</small><b class="${p.eta && p.dl && p.eta > p.dl ? 'red' : ''}">${p.eta ? human(p.eta) : pc === 100 ? 'выполнен' : 'нет темпа'}</b></div></div></div>`; }
      return `<div class="ins-ph">${ic(x.icon)}<span>${x.empty ? 'Наблюдение появится, когда наберётся достаточно данных' : ''}</span></div>`;
    };
    let i = -1;
    return `<div class="scroll">${SEC.map(([k, title, icon]) => { const L = UI.ins.map((x, j) => ({ x, j })).filter(o => o.x.sec === k); return L.length ? `<section class="ins-sec"><h2>${ic(icon)} ${title}</h2><div class="ins-grid">${L.map(({ x, j }, k) => { const n = L.length, c3 = n % 3 === 1 && k === n - 1 ? 'l3-1' : n % 3 === 2 && k >= n - 2 ? 'l3-2' : '', c2 = n % 2 === 1 && k === n - 1 ? 'l2-1' : ''; return `<article class="ins ${c3} ${c2} ${x.empty ? 'empty-ins' : ''} ${x.warn ? 'warn' : ''}" style="${x.color ? '--c:' + x.color : ''}">
      <div class="ins-h">${ic(x.icon)}<span>${esc(x.title)}</span></div><b class="ins-v">${esc(String(x.value))}</b><p>${esc(x.text)}</p>
      <div class="ins-vis">${vis(x, j)}</div><small class="ins-b">${esc(x.basis || '')}</small></article>`; }).join('')}</div></section>` : ''; }).join('')}</div>`;
  },
  after() {
    (UI.ins || []).forEach((x, i) => {
      const acc = cssv('--acc'), mute = cssv('--line2');
      if (x.chart) chart('ins-' + i, { type: 'bar', data: { labels: x.chart.labels, datasets: [{ data: x.chart.data, backgroundColor: x.chart.data.map((_, j) => j === x.chart.hl || (x.chart.range && j >= x.chart.range[0] && j <= x.chart.range[1]) ? acc : mute), borderRadius: 5, maxBarThickness: 28 }] }, options: { scales: { y: { beginAtZero: true, ticks: x.chart.money ? axisMoney.ticks : { precision: 0 } }, x: { grid: { display: false }, ticks: { maxTicksLimit: x.chart.all ? 6 : 12, maxRotation: 0, autoSkip: !x.chart.all } } }, plugins: { tooltip: { callbacks: { label: c => x.chart.money ? money0(c.parsed.y) : String(c.parsed.y) } } } } });
      if (x.donut) chart('ins-' + i, { type: 'doughnut', data: { labels: x.donutL || ['В срок', 'С опозданием'], datasets: [{ data: x.donut, backgroundColor: [x.donutL ? cssv('--exp') : cssv('--ok'), mute], borderColor: cssv('--panel'), borderWidth: 3 }] }, options: { cutout: '70%', plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: c => ' ' + (x.donutL ? money0(c.parsed) : c.parsed) } } } } });
      if (x.cap) chart('ins-' + i, { type: 'bar', data: { labels: x.cap.labels, datasets: [{ label: x.cap.done ? 'Выполнено' : 'Запланировано', data: x.cap.loads.map(v => Math.round(v / 6) / 10), backgroundColor: x.cap.loads.map((v, j) => !x.cap.done && v > x.cap.caps[j] ? cssv('--hi') : x.cap.done ? cssv('--ok') : acc), borderRadius: 5, maxBarThickness: 26 }, { type: 'line', label: 'Ёмкость', data: x.cap.caps.map(v => v / 60), borderColor: cssv('--mid'), borderDash: [4, 4], pointRadius: 0, borderWidth: 2, stepped: 'middle' }] }, options: { scales: { y: { beginAtZero: true, ticks: { callback: v => v + ' ч', maxTicksLimit: 5 } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fx(c.parsed.y) + ' ч' } } } } });
    });
  }
});
