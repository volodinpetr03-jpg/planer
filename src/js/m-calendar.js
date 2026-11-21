'use strict';
// ============================================================
//  Модуль «Календарь»: неделя по часам и месяц; задачи, платежи, сроки проектов, расходы
// ============================================================
const CF = { mode: 'week', ws: weekStart(today()), day: today(), month: mkey(today()), scroll: null };
const calDays = () => MOB() ? [CF.day] : [...Array(7)].map((_, i) => addDays(CF.ws, i));
const HHpx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.9;
const CT = () => D.settings.calTypes;
const calTasks = () => live().filter(t => matchQ(t));
const dayExp = d => sumT(B().tx.filter(x => x.date === d), 'expense');

function wkLayout(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  const cl = []; let cur = [], end = -1;
  for (const it of items) { if (cur.length && it.s >= end) { cl.push(cur); cur = []; end = -1; } cur.push(it); end = Math.max(end, it.e); }
  if (cur.length) cl.push(cur);
  for (const c of cl) { const lanes = []; for (const it of c) { let l = lanes.findIndex(e => e <= it.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = it.e; it.lane = l; } c.forEach(it => it.lanes = lanes.length); }
  return items;
}
function vWeek() {
  const td = today(), days = calDays(), gcols = `style="grid-template-columns:${MOB() ? '3rem' : '4rem'} repeat(${days.length},minmax(0,1fr))"`, L = CT().tasks ? calTasks() : [], H = HHpx();
  const head = `<div class="wkh" ${gcols}><div></div>${days.map(d => { const x = pd(d), n = L.filter(t => t.date === d).length, e = CT().exp ? dayExp(d) : 0; return `<div class="${d === td ? 'tod' : ''}" data-act="calNew" data-d="${d}" title="Новая задача на этот день"><span>${WSU[x.getDay()]}</span><b>${x.getDate()}</b>${SM().overload ? capBar(d) : ''}<small>${e ? `<span style="color:var(--exp)" title="Расходы за день">−${NF0.format(e)}</span>` : n ? n + ' ' + plural(n, PT) : ''}</small></div>`; }).join('')}</div>`;
  const allday = `<div class="wka" ${gcols}><div>весь<br>день</div>${days.map(d => {
    const items = L.filter(t => t.date === d && !t.time).sort(byOrder).map(t => `<div class="ad p${t.prio} ${isDone(t) ? 'done' : ''}" draggable="true" data-id="${t.id}" data-act="openTask" style="--c:${tagColor(t)}" title="${esc(t.title)}">${esc(t.title)}</div>`);
    const pays = CT().pays ? regularOn(d).map(r => `<div class="ad pay" data-act="openReg" data-id="${r.id}" title="${esc(r.title)} — ${money(r.amount)}">${ic('coin')} ${esc(r.title)} · ${money0(r.amount)}</div>`) : [];
    const dls = CT().dl ? D.projects.filter(p => p.deadline === d && p.status !== 'archived').map(p => `<div class="ad dl" data-act="openProject" data-id="${p.id}" style="--c:${p.color}">Срок: ${esc(p.title)}</div>`) : [];
    const dts = CT().dates !== false ? datesOn(d).map(x => `<div class="ad idt" data-act="dateEdit" data-id="${x.id}" title="${esc(x.title)}">${(DKIND[x.kind] || DKIND.other)[1]} ${esc(x.title)}</div>`) : [];
    return `<div data-adrop="${d}">${dts.join('')}${dls.join('')}${pays.join('')}${items.join('')}</div>`;
  }).join('')}</div>`;
  const n = new Date(), nm = n.getHours() * 60 + n.getMinutes();
  const cols = days.map(d => {
    const it = wkLayout(L.filter(t => t.date === d && t.time).map(t => { const s = toMin(t.time); return { t, s, e: Math.min(1440, s + Math.max(t.dur || 30, 15)) }; }));
    return `<div class="dcol ${d === td ? 'tod' : ''}" data-day="${d}" style="height:${24 * H}px">${it.map(({ t, s, e, lane, lanes }) => `<div class="blk p${t.prio} ${isDone(t) ? 'done' : ''}" data-id="${t.id}" style="--c:${tagColor(t)};top:${s / 60 * H + 1}px;height:${Math.max((e - s) / 60 * H - 3, 20)}px;left:calc(${lane / lanes * 100}% + 3px);width:calc(${100 / lanes}% - 6px)" title="${esc(t.title)}"><b>${esc(t.title)}</b><span>${t.time}–${fromMin(e)}</span><span class="bi">${t.remind != null ? ic('bell') : ''}${t.repeat ? ic('repeat') : ''}</span><i class="rs"></i></div>`).join('')}${d === td ? `<div class="nowl" style="top:${nm / 60 * H}px"></div>` : ''}</div>`;
  }).join('');
  const nd = live().filter(t => !t.date && !isDone(t)).sort(byOrder);
  const wpays = []; days.forEach(d => regularOn(d).forEach(r => wpays.push({ r, d })));
  return `<div class="week"><div class="wk">${head}${allday}<div class="wkb" id="wkb"><div class="wgrid" ${gcols}><div class="hours">${[...Array(24)].map((_, h) => `<div>${h ? pad(h) + ':00' : ''}</div>`).join('')}</div>${cols}</div></div></div>
    <aside class="wside"><h3>Без даты <small>${nd.length}</small></h3><p>Перетащите задачу в сетку — ей назначатся день и время</p><div class="list grow">${nd.map(t => cardHtml(t, true)).join('') || '<div class="empty">Все задачи распределены по дням</div>'}</div>
    <h3>Платежи на неделе <small>${wpays.length ? money0(wpays.reduce((a, p) => a + p.r.amount, 0)) : ''}</small></h3><div class="list">${wpays.map(p => `<div class="lrow" data-act="openReg" data-id="${p.r.id}" style="--c:var(--exp)"><span class="dot"></span><div class="tx"><b>${esc(p.r.title)}</b><small>${human(p.d)}</small></div><span class="am exp">${money0(p.r.amount)}</span></div>`).join('') || '<p class="hint" style="margin:0 .3rem">Платежей нет</p>'}</div></aside></div>`;
}
function vMonth() {
  const k = CF.month, td = today(), first = k + '-01', last = k + '-' + pad(mDays(k)), start = weekStart(first), end = addDays(weekStart(last), 6), cells = [];
  for (let s = start; s <= end; s = addDays(s, 1)) cells.push(s);
  const L = CT().tasks ? calTasks() : [];
  return `<div class="mwrap"><div class="mwd">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(w => `<div>${w}</div>`).join('')}</div>
  <div class="mgrid" style="grid-template-rows:repeat(${cells.length / 7},minmax(0,1fr))">${cells.map(s => {
    const it = L.filter(t => t.date === s).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const pays = CT().pays ? regularOn(s) : [], dls = CT().dl ? D.projects.filter(p => p.deadline === s && p.status !== 'archived') : [], e = CT().exp ? dayExp(s) : 0;
    const rows = (CT().dates !== false ? datesOn(s) : []).map(x => `<span class="mi idt">${(DKIND[x.kind] || DKIND.other)[1]} ${esc(x.title)}</span>`).concat(dls.map(p => `<span class="mi dl" style="--c:${p.color}">Срок: ${esc(p.title)}</span>`)).concat(pays.map(r => `<span class="mi pay">${esc(r.title)} · ${money0(r.amount)}</span>`)).concat(it.map(t => `<span class="mi ${isDone(t) ? 'done' : ''}" draggable="true" data-id="${t.id}" style="--c:${tagColor(t)}">${t.time ? t.time + ' ' : ''}${esc(t.title)}</span>`));
    return `<div class="mc ${mkey(s) !== k ? 'out' : ''} ${s === td ? 'tod' : ''}" data-act="calDay" data-d="${s}" data-mdrop="${s}" tabindex="0" role="button" aria-label="${dayLong(s)}"><div class="mtop"><span class="mn">${pd(s).getDate()}</span>${e ? `<span class="mexp">−${NF0.format(e)}</span>` : ''}</div>${SM().overload && loadOf(s) > capOf(s) && s >= td ? '<span class="mover">перегруз</span>' : ''}${rows.slice(0, 4).join('')}${rows.length > 4 ? `<span class="more">ещё ${rows.length - 4}</span>` : ''}</div>`;
  }).join('')}</div></div>`;
}

registerModule({
  id: 'calendar', order: 3, title: 'Календарь', icon: 'cal', desc: 'Неделя по часам и месяц: задачи, регулярные платежи, сроки проектов и расходы по дням',
  bar() {
    let title, nav;
    if (CF.mode === 'week' && MOB()) title = dayLong(CF.day);
    else if (CF.mode === 'week') { const we = addDays(CF.ws, 6), x = pd(CF.ws), y = pd(we); title = (x.getMonth() === y.getMonth() ? `${x.getDate()}–${y.getDate()} ${MG[y.getMonth()]}` : `${x.getDate()} ${MGS[x.getMonth()]} – ${y.getDate()} ${MGS[y.getMonth()]}`) + ' ' + y.getFullYear(); }
    else title = mTitle(CF.month);
    nav = `<div class="chips"><button class="ib" data-act="calPrev" aria-label="Назад" title="Назад  ←">${ic('left')}</button><button class="btn sm" data-act="calToday">Сегодня</button><button class="ib" data-act="calNext" aria-label="Вперёд" title="Вперёд  →">${ic('right')}</button></div>`;
    const T = [['tasks', 'Задачи'], ['pays', 'Платежи'], ['exp', 'Расходы'], ['dl', 'Сроки проектов'], ['dates', 'Важные даты']];
    return `<h1 style="min-width:15rem">${title}</h1>${nav}<div class="subtabs"><button class="${CF.mode === 'week' ? 'on' : ''}" data-act="calMode" data-v="week">${MOB() ? 'День' : 'Неделя'}</button><button class="${CF.mode === 'month' ? 'on' : ''}" data-act="calMode" data-v="month">Месяц</button></div><span class="sep"></span>
      <div class="chips">${T.map(([k, l]) => `<button class="chip ${CT()[k] ? 'on' : ''}" data-act="calType" data-v="${k}" aria-pressed="${CT()[k]}">${l}</button>`).join('')}</div>`;
  },
  render() { if (MOB() && CF.mode === 'week') { UI.calDate = CF.day; return vWeek(); } UI.calDate = CF.mode === 'week' ? (today() >= CF.ws && today() <= addDays(CF.ws, 6) ? today() : CF.ws) : (mkey(today()) === CF.month ? today() : CF.month + '-01'); return CF.mode === 'week' ? vWeek() : vMonth(); },
  before() { const w = $('#wkb'); if (w) CF.scroll = w.scrollTop; },
  after() { const w = $('#wkb'); if (w) { if (CF.scroll === null) { const td = today(), inW = td >= CF.ws && td <= addDays(CF.ws, 6); CF.scroll = (MOB() ? CF.day === td : inW) ? Math.max(0, (new Date().getHours() - 2) * HHpx()) : 7 * HHpx(); } w.scrollTop = CF.scroll; } },
  keys(e, k) {
    if (e.key === 'ArrowLeft') { ACT.calPrev(); return true; }
    if (e.key === 'ArrowRight') { ACT.calNext(); return true; }
    if (k === 't' || k === 'е') { ACT.calToday(); return true; }
    return false;
  }
});
Object.assign(ACT, {
  calPrev: () => { if (CF.mode === 'week' && MOB()) CF.day = addDays(CF.day, -1); else if (CF.mode === 'week') CF.ws = addDays(CF.ws, -7); else CF.month = mAdd(CF.month, -1); render(); },
  calNext: () => { if (CF.mode === 'week' && MOB()) CF.day = addDays(CF.day, 1); else if (CF.mode === 'week') CF.ws = addDays(CF.ws, 7); else CF.month = mAdd(CF.month, 1); render(); },
  calToday: () => { CF.day = today(); CF.ws = weekStart(today()); CF.month = mkey(today()); CF.scroll = null; render(); },
  calMode: b => { CF.mode = b.dataset.v; render(); },
  calType: b => { const k = b.dataset.v; CT()[k] = !CT()[k]; save(); render(); },
  calNew: b => openTaskForm(null, { date: b.dataset.d }),
  calDay: b => { CF.mode = 'week'; CF.day = b.dataset.d; CF.ws = weekStart(b.dataset.d); CF.scroll = null; render(); }
});

// ---- перемещение и растягивание блоков недели ----
let dragBlk = null;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.blk'); if (!b || e.button !== 0) return;
  const t = byId(b.dataset.id); if (!t) return;
  if (e.pointerType === 'touch') { dragBlk = { id: t.id, touch: true, x0: e.clientX, y0: e.clientY }; return; } // на телефоне блок не тащим — палец прокручивает день
  dragBlk = { id: t.id, b, resize: !!e.target.closest('.rs'), x0: e.clientX, y0: e.clientY, s0: toMin(t.time), d0: t.dur || 30, s: toMin(t.time), dur: t.dur || 30, day: t.date, moved: false };
  b.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  const g = dragBlk; if (!g) return;
  if (g.touch) { if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 10) dragBlk = null; return; }
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0, H = HHpx() * (D.settings.zoom || 1) / (D.settings.zoom || 1);
  if (!g.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
  g.moved = true; g.b.classList.add('moving');
  const snap = v => Math.round(v / 15) * 15;
  if (g.resize) { g.dur = Math.max(15, Math.min(1440 - g.s0, snap(g.d0 + dy / H * 60))); g.b.style.height = (g.dur / 60 * H - 3) + 'px'; }
  else {
    g.s = Math.max(0, Math.min(1425, g.s0 + snap(dy / H * 60)));
    const c = $$('.dcol').find(c => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; });
    if (c && c !== g.b.parentNode) c.appendChild(g.b);
    if (c) g.day = c.dataset.day;
    g.b.style.top = (g.s / 60 * H + 1) + 'px'; g.b.style.left = '3px'; g.b.style.width = 'calc(100% - 6px)';
    const wk = $('#wkb'), r = wk.getBoundingClientRect();
    if (e.clientY > r.bottom - 30) wk.scrollTop += 12; else if (e.clientY < r.top + 30) wk.scrollTop -= 12;
  }
  const sp = $('span', g.b); if (sp) sp.textContent = fromMin(g.s) + '–' + fromMin(Math.min(1440, g.s + g.dur));
});
document.addEventListener('pointercancel', () => { if (dragBlk && dragBlk.touch) dragBlk = null; });
document.addEventListener('pointerup', () => {
  const g = dragBlk; if (!g) return;
  setTimeout(() => { dragBlk = null; }, 0);
  if (g.touch) { openTaskForm(g.id); return; }
  if (!g.moved) { openTaskForm(g.id); return; }
  const t = byId(g.id); if (!t) return;
  snapU(); t.date = g.day; t.time = fromMin(g.s); t.dur = g.dur; t.snooze = null;
  save(); render(); toast(`${human(t.date)}, ${t.time}–${fromMin(Math.min(1440, g.s + g.dur))}`, true);
});
