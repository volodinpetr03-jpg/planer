'use strict';
// ============================================================
//  Этап 4. Календарь: год (тепловая карта), список (повестка), лента проектов (диаграмма Ганта)
// ============================================================
Object.assign(CF, { year: +today().slice(0, 4), heat: 'tasks', agFrom: today(), agDays: 30, gFrom: mkey(today()), gSpan: 3, gOpen: {} });


// ---------- Год ----------
function yearStats() {
  const m = {}, add = (d, k, v = 1) => { (m[d] = m[d] || { t: 0, d: 0, e: 0 })[k] += v; };
  live().forEach(t => { if (t.date) add(t.date, 't'); if (t.doneAt) add(ymd(new Date(t.doneAt)), 'd'); });
  B().tx.forEach(x => { if (x.type === 'expense') add(x.date, 'e', x.amount); });
  return m;
}
function vYear() {
  const Y = CF.year, S = yearStats(), td = today(), key = CF.heat === 'done' ? 'd' : CF.heat === 'exp' ? 'e' : 't';
  const vals = Object.entries(S).filter(([d]) => d.startsWith(Y + '-')).map(([, v]) => v[key]).filter(Boolean).sort((a, b) => a - b);
  const q = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 1, th = [q(.25), q(.5), q(.75)];
  const lvl = v => !v ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : 4;
  const dl = new Set(D.projects.filter(p => p.deadline && p.status !== 'archived').map(p => p.deadline));
  const months = [...Array(12)].map((_, mi) => {
    const k = `${Y}-${pad(mi + 1)}`, first = pd(k + '-01'), off = (first.getDay() + 6) % 7, nd = new Date(Y, mi + 1, 0).getDate();
    let cells = '<i class="e"></i>'.repeat(off), sum = 0;
    for (let d = 1; d <= nd; d++) {
      const s = `${k}-${pad(d)}`, v = (S[s] || {})[key] || 0, dts = datesOn(s), mark = dl.has(s) || dts.length; sum += v;
      const tip = `${dayLong(s)}${v ? ': ' + (key === 'e' ? money0(v) : v + ' ' + plural(v, PT)) : ''}${dts.length ? ' · ' + dts.map(x => x.title).join(', ') : ''}${dl.has(s) ? ' · срок проекта' : ''}`;
      cells += `<i class="l${lvl(v)} ${s === td ? 'tod' : ''} ${mark ? 'mk' : ''}" data-act="calDay" data-d="${s}" title="${esc(tip)}">${d}</i>`;
    }
    return `<div class="ym ${k === mkey(td) ? 'cur' : ''}"><div class="ymh" data-act="yMonth" data-v="${k}"><b>${MN[mi]}</b><small>${sum ? (key === 'e' ? money0(sum) : sum) : ''}</small></div><div class="ymw">${['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map(w => `<span>${w}</span>`).join('')}</div><div class="ymg">${cells}</div></div>`;
  }).join('');
  const tot = vals.reduce((a, b) => a + b, 0);
  return `<div class="scroll"><div class="yhead"><div class="chips">${[['tasks', 'Задачи по срокам'], ['done', 'Выполнено'], ['exp', 'Расходы']].map(([k, l]) => `<button class="chip ${CF.heat === k ? 'on' : ''}" data-act="yHeat" data-v="${k}">${l}</button>`).join('')}</div>
    <span class="hint">${CF.heat === 'exp' ? 'Всего за год: ' + money0(tot) : `Всего за год: ${tot} ${plural(tot, PT)}`} · <span class="ylg">меньше <i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> больше</span> · <span class="ymk"></span> важная дата или срок проекта</span></div>
    <div class="ygrid">${months}</div></div>`;
}

// ---------- Список (повестка) ----------
function vAgenda() {
  const from = CF.agFrom, td = today(), n = CF.agDays, out = [];
  if (from <= td) {
    const over = live().filter(t => !isDone(t) && t.date && t.date < td).sort((a, b) => a.date.localeCompare(b.date));
    if (over.length) out.push(`<div class="daygrp over"><h3>Просрочено<small>${over.length}</small></h3>${over.map(t => taskLine(t, { noCol: true })).join('')}</div>`);
  }
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i), items = [];
    if (CT().dates !== false) datesOn(d).forEach(x => { const y = dateYears(x, d); items.push(`<div class="lrow" data-act="dateEdit" data-id="${x.id}"><span class="emo">${(DKIND[x.kind] || DKIND.other)[1]}</span><div class="tx"><b>${esc(x.title)}</b><small>${(DKIND[x.kind] || DKIND.other)[0].toLowerCase()}${y > 0 ? ' · ' + y + ' ' + plural(y, ['год', 'года', 'лет']) : ''}</small></div></div>`); });
    if (CT().dl) D.projects.filter(p => p.deadline === d && p.status !== 'archived').forEach(p => items.push(`<div class="lrow" data-act="openProject" data-id="${p.id}" style="--c:${p.color}"><span class="dot"></span><div class="tx"><b>Срок проекта: ${esc(p.title)}</b><small>готово ${projStats(p).pct}%</small></div></div>`));
    if (CT().pays) regularOn(d).forEach(r => items.push(`<div class="lrow" data-act="openReg" data-id="${r.id}" style="--c:var(--exp)"><span class="dot"></span><div class="tx"><b>${esc(r.title)}</b><small>регулярный платёж</small></div><span class="am exp">${money0(r.amount)}</span></div>`));
    if (CT().tasks) live().filter(t => t.date === d && matchQ(t)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || isDone(a) - isDone(b)).forEach(t => items.push(taskLine(t, { noCol: true })));
    if (items.length) out.push(`<div class="daygrp ${d === td ? 'tod' : ''}"><h3>${dayLong(d)}<small>${items.length}</small><button class="ib sm" data-act="calNew" data-d="${d}" title="Новая задача на этот день">${ic('plus')}</button></h3>${items.join('')}</div>`);
  }
  return `<div class="scroll"><div class="agl">${out.join('') || '<div class="empty">В этом периоде ничего не запланировано</div>'}
    <div class="agmore"><button class="btn" data-act="agMore">Показать ещё 30 дней</button></div></div></div>`;
}

// ---------- Лента проектов (Гант) ----------
function ganttRange() { const a = CF.gFrom + '-01', b = addDays(mAdd(CF.gFrom, CF.gSpan) + '-01', -1); return { a, b, n: diff(a, b) + 1 }; }
function projSpan(p) {
  const ts = projTasks(p.id).filter(t => t.date), dates = ts.map(t => t.date).sort();
  const s = p.start || ymd(new Date(p.created)), e = p.deadline || (dates.length ? dates[dates.length - 1] : addDays(s, 30));
  return { s: s < e ? s : e, e: e > s ? e : s, auto: !p.deadline };
}
function vGantt() {
  const R = ganttRange(), td = today(), P = D.projects.filter(p => p.status !== 'archived').sort((a, b) => projSpan(a).s.localeCompare(projSpan(b).s));
  const x = d => diff(R.a, d);
  let mh = '', dh = '';
  for (let i = 0; i < CF.gSpan; i++) { const k = mAdd(CF.gFrom, i), nd = new Date(+k.slice(0, 4), +k.slice(5), 0).getDate(); mh += `<div style="grid-column:span ${nd}"><span>${MN[+k.slice(5) - 1]} ${k.slice(0, 4)}</span></div>`; }
  for (let i = 0; i < R.n; i++) { const d = addDays(R.a, i), w = pd(d).getDay(); dh += `<div class="${w === 0 || w === 6 ? 'we' : ''} ${d === td ? 'tod' : ''}">${pd(d).getDate()}</div>`; }
  const rows = P.map(p => {
    const sp = projSpan(p), st = projStats(p), a = Math.max(0, x(sp.s)), b = Math.min(R.n - 1, x(sp.e)), vis = x(sp.e) >= 0 && x(sp.s) < R.n, open = CF.gOpen[p.id];
    const late = p.deadline && p.deadline < td && p.status !== 'done' && st.pct < 100;
    const bar = vis ? `<div class="gb ${late ? 'late' : ''} ${sp.auto ? 'auto' : ''} ${p.status === 'done' ? 'dn' : ''}" ${MOB() ? `data-act="openProject" data-id="${p.id}"` : ''} style="--c:${p.color};left:calc(${a} * var(--dw));width:calc(${b - a + 1} * var(--dw))" data-gp="${p.id}" title="${esc(p.title)}: ${human(sp.s)} — ${human(sp.e)}${sp.auto ? ' (срок не задан)' : ''} · готово ${st.pct}%"><i style="width:${st.pct}%"></i><span>${esc(p.title)} · ${st.pct}%</span>${p.deadline ? '<b class="rs" title="Потяните, чтобы изменить срок"></b>' : ''}</div>` : `<div class="gout">${x(sp.e) < 0 ? '← ' + human(sp.e) : human(sp.s) + ' →'}</div>`;
    const ts = open ? projTasks(p.id).filter(t => t.date && x(t.date) >= 0 && x(t.date) < R.n).sort((q, w) => q.date.localeCompare(w.date)) : [];
    return `<div class="gr"><div class="gn" style="--c:${p.color}"><button class="ib sm ${open ? 'open' : ''}" data-act="gTog" data-id="${p.id}" aria-label="Задачи проекта">${ic('caret')}</button><span data-act="openProject" data-id="${p.id}">${esc(p.title)}</span><small>${st.d}/${st.n}</small></div><div class="gt">${bar}</div></div>`
      + ts.map(t => `<div class="gr sub"><div class="gn"><span data-act="openTask" data-id="${t.id}" class="${isDone(t) ? 'dn' : ''}">${esc(t.title)}</span></div><div class="gt"><div class="gm ${isDone(t) ? 'dn' : t.date < td ? 'over' : ''}" style="--c:${p.color};left:calc(${x(t.date)} * var(--dw))" data-act="openTask" data-id="${t.id}" title="${esc(t.title)} — ${human(t.date)}"></div></div></div>`).join('');
  }).join('');
  const tdx = x(td);
  return `<div class="scroll gwrap"><div class="gantt" style="--n:${R.n}">
    <div class="gr gh"><div class="gn">Проект</div><div class="gt"><div class="gmh">${mh}</div><div class="gdh">${dh}</div></div></div>
    ${rows || `<div class="empty" style="padding:2rem">Нет активных проектов. Создайте проект и укажите дату начала и срок — он появится на ленте.</div>`}
    ${tdx >= 0 && tdx < R.n ? `<div class="gtoday" style="left:calc(var(--gnw) + ${tdx + .5} * var(--dw))"></div>` : ''}
  </div><p class="hint" style="padding:0 1.3rem 1rem">Полоса — от даты начала до срока проекта, заливка — доля выполненных задач. ${MOB() ? '' : 'Перетащите полосу, чтобы сдвинуть проект, или её правый край, чтобы изменить срок. '}Стрелка слева от названия показывает задачи проекта с датами. Пунктир — срок не задан, конец взят по последней задаче.</p></div>`;
}
// перетаскивание полос проекта (только мышью)
let gDrag = null;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('.gb[data-gp]'); if (!b || e.button !== 0 || e.pointerType === 'touch') return;
  const p = projOf(b.dataset.gp); if (!p) return; const sp = projSpan(p);
  gDrag = { p, b, x0: e.clientX, rs: !!e.target.closest('.rs'), s: sp.s, e: sp.e, auto: sp.auto, dw: parseFloat(getComputedStyle(b).width) / (diff(sp.s, sp.e) + 1) || 20, k: 0, moved: false };
  b.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  const g = gDrag; if (!g) return; const dw = parseFloat(getComputedStyle(document.querySelector('.gantt')).getPropertyValue('--dw')) * parseFloat(getComputedStyle(document.documentElement).fontSize) || g.dw;
  const k = Math.round((e.clientX - g.x0) / dw); if (k === g.k) return; g.k = k; g.moved = true;
  const R = ganttRange(), s = g.rs ? g.s : addDays(g.s, k), en = addDays(g.e, k); if (g.rs && en < g.s) return;
  g.b.style.left = `calc(${Math.max(0, diff(R.a, s))} * var(--dw))`; g.b.style.width = `calc(${Math.max(1, Math.min(R.n - 1, diff(R.a, en)) - Math.max(0, diff(R.a, s)) + 1)} * var(--dw))`;
  g.b.title = `${human(s)} — ${human(en)}`; const lb = $('span', g.b); if (lb) lb.textContent = `${human(s)} — ${human(en).toLowerCase()}`;
});
document.addEventListener('pointerup', () => {
  const g = gDrag; gDrag = null; if (!g) return;
  if (!g.moved || !g.k) { if (!g.moved) ACT.openProject({ dataset: { id: g.p.id } }); return; }
  snapU(); if (!g.rs) g.p.start = addDays(g.s, g.k); if (!g.auto || g.rs) g.p.deadline = addDays(g.e, g.k);
  save(); render(); toast(`«${g.p.title}»: ${human(g.p.start).toLowerCase()} — ${g.p.deadline ? human(g.p.deadline).toLowerCase() : 'без срока'}`, true);
});

// ---------- встраиваем в модуль «Календарь» ----------
(() => {
  const m = MODULES.find(x => x.id === 'calendar'); if (!m) return;
  const bar = m.bar, rend = m.render, after = m.after, before = m.before;
  m.before = function () { const w = $('.gwrap'); if (w) CF.gLeft = w.scrollLeft; if (before) before.call(this); };
  const NEW = ['year', 'agenda', 'gantt'];
  m.bar = function () {
    let h = bar.call(this);
    h = h.replace(/(data-act="calMode" data-v="month">Месяц<\/button>)/, `$1<button class="${CF.mode === 'year' ? 'on' : ''}" data-act="calMode" data-v="year">Год</button><button class="${CF.mode === 'agenda' ? 'on' : ''}" data-act="calMode" data-v="agenda">Список</button><button class="${CF.mode === 'gantt' ? 'on' : ''}" data-act="calMode" data-v="gantt">Проекты</button>`);
    if (NEW.includes(CF.mode)) {
      const R = ganttRange(), t = CF.mode === 'year' ? String(CF.year) : CF.mode === 'agenda' ? `${human(CF.agFrom)} — ${human(addDays(CF.agFrom, CF.agDays - 1)).toLowerCase()}` : `${MNS[+R.a.slice(5, 7) - 1]} – ${MNS[+R.b.slice(5, 7) - 1]} ${R.b.slice(0, 4)}`;
      h = h.replace(/<h1 style="min-width:15rem">[\s\S]*?<\/h1>/, `<h1 style="min-width:15rem">${t}</h1>`);
      if (CF.mode === 'gantt') h = h.replace(/<div class="chips">(?![\s\S]*data-act="calPrev")[\s\S]*$/, `<div class="chips">${[1, 3, 6, 12].map(n => `<button class="chip ${CF.gSpan === n ? 'on' : ''}" data-act="gSpan" data-v="${n}">${n === 12 ? 'Год' : n + ' мес.'}</button>`).join('')}</div>`);
      if (CF.mode === 'year') h = h.replace(/<div class="chips">(?![\s\S]*data-act="calPrev")[\s\S]*$/, '');
    }
    return h;
  };
  m.render = function () {
    if (CF.mode === 'year') { UI.calDate = today(); return vYear(); }
    if (CF.mode === 'agenda') { UI.calDate = CF.agFrom; return vAgenda(); }
    if (CF.mode === 'gantt') { UI.calDate = today(); return vGantt(); }
    return rend.call(this);
  };
  m.after = function () {
    if (CF.mode === 'gantt') { const w = $('.gwrap'), t = $('.gtoday'); if (w) w.style.setProperty('--vw', w.clientWidth + 'px'); if (w && t && CF.gScroll !== false) { w.scrollLeft = Math.max(0, t.offsetLeft - w.clientWidth / 3); CF.gScroll = false; } else if (w && CF.gLeft != null) w.scrollLeft = CF.gLeft; return; }
    if (CF.mode === 'year' && CF.yScroll !== CF.year) { CF.yScroll = CF.year; const c = $('.ym.cur'), sc = $('#main .scroll'); if (c && sc && MOB()) sc.scrollTop = c.offsetTop - sc.offsetTop - 8; return; }
    if (!NEW.includes(CF.mode) && after) return after.call(this);
  };
  const prev = ACT.calPrev, next = ACT.calNext, tod = ACT.calToday, mode = ACT.calMode;
  const step = k => { if (CF.mode === 'year') CF.year += k; else if (CF.mode === 'agenda') { CF.agFrom = addDays(CF.agFrom, 30 * k); CF.agDays = 30; } else { CF.gFrom = mAdd(CF.gFrom, k * Math.max(1, Math.floor(CF.gSpan / 2) || 1)); CF.gScroll = true; } render(); };
  ACT.calPrev = () => NEW.includes(CF.mode) ? step(-1) : prev();
  ACT.calNext = () => NEW.includes(CF.mode) ? step(1) : next();
  ACT.calToday = () => { CF.year = +today().slice(0, 4); CF.agFrom = today(); CF.agDays = 30; CF.gFrom = mAdd(mkey(today()), CF.gSpan >= 3 ? -1 : 0); CF.gScroll = true; tod(); };
  ACT.calMode = b => { if (b.dataset.v === 'gantt') { CF.gFrom = mAdd(mkey(today()), CF.gSpan >= 3 ? -1 : 0); CF.gScroll = true; } mode(b); };
})();
Object.assign(ACT, {
  yHeat: b => { CF.heat = b.dataset.v; render(); },
  yMonth: b => { CF.mode = 'month'; CF.month = b.dataset.v; render(); },
  agMore: () => { CF.agDays += 30; render(); },
  gSpan: b => { CF.gSpan = +b.dataset.v; CF.gFrom = mAdd(mkey(today()), CF.gSpan >= 3 ? -1 : 0); if (CF.gSpan === 12) CF.gFrom = today().slice(0, 4) + '-01'; CF.gScroll = true; render(); },
  gTog: b => { CF.gOpen[b.dataset.id] = !CF.gOpen[b.dataset.id]; render(); }
});
