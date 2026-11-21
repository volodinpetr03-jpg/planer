'use strict';
// ============================================================
//  Умные функции: разбор ввода, скоринг, ёмкость дня, автоподстановки
// ============================================================
const SM = () => D.settings.smart;

// ---------- 1. Умный разбор ввода (регулярные выражения) ----------
const RX = {
  money: /(?:^|\s)([+-]?\d{1,3}(?:[  ]?\d{3})*(?:[.,]\d{1,2})?|[+-]?\d+(?:[.,]\d{1,2})?)\s?(?:₽|р\.?|руб(?:лей|ля|ль)?\.?|rub|\$|€)(?=\s|$)/i,
  prio2: /\s(?:!{2,}|срочно)(?=\s)/i, prio1: /\s(?:!|важно)(?=\s)/i,
  tag: /\s#([\p{L}\d_-]+)/u, proj: /\s[@+]([\p{L}\d_-]+)/u,
  remind: /\sнапомн(?:и|ить)(?:\s+за\s+(\d+)?\s*(полчаса|мин\S*|м|ч\S*|час\S*|д\S*|недел\S*))?(?=\s)/i,
  repWd: /\sкажд(?:ый|ую|ое)\s(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?=\s)/i,
  rep: [[/\s(?:каждый день|ежедневно)(?=\s)/i, 'day'], [/\s(?:по будням)(?=\s)/i, 'weekdays'], [/\s(?:каждые две недели|раз в две недели)(?=\s)/i, 'week2'], [/\s(?:каждую неделю|еженедельно)(?=\s)/i, 'week'], [/\s(?:каждый месяц|ежемесячно)(?=\s)/i, 'month'], [/\s(?:каждый год|ежегодно)(?=\s)/i, 'year']],
  durHM: /\s(\d+)\s?ч\s?(\d+)\s?м(?:ин)?(?=\s)/i,
  dur: /\s(?:на\s)?\(?(\d+(?:[.,]\d+)?)\s?(мин(?:ут[ауы]?)?|м|ч(?:ас(?:а|ов)?)?)\)?(?=\s)/i,
  timeHM: /\s(?:(?:в|к|до)\s)?([01]?\d|2[0-3])[:]([0-5]\d)(?=\s)/i, timeDot: /\s(?:в|к)\s([01]?\d|2[0-3])\.([0-5]\d)(?=\s)/i,
  timeH: /\s(?:в|к)\s([01]?\d|2[0-3])(?:\s?ч(?:ас(?:а|ов)?)?)?(?:\s(утра|дня|вечера|ночи))?(?=\s)/i,
  timeWord: [[/\sв\sполдень(?=\s)/i, '12:00'], [/\sутром(?=\s)/i, '09:00'], [/\sднём|\sднем(?=\s)/i, '14:00'], [/\sвечером(?=\s)/i, '19:00']],
  rel: /\sчерез\s(\d+|неделю|месяц|год|пару дней)\s?(дн(?:я|ей)|день|недел[июь]|месяц(?:а|ев)?|год(?:а)?|лет)?(?=\s)/i,
  dmy: /\s(?:к\s|до\s)?(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=\s)/,
  wd: [['понедельник|пн', 1], ['вторник|вт', 2], ['сред[ауы]|ср', 3], ['четверг|чт', 4], ['пятниц[ауы]|пт', 5], ['суббот[ауы]|сб', 6], ['воскресенье|вс', 0]]
};
const CAT_KEYS = [[/продукт|пят[её]рочк|магнит|перекр[её]ст|ашан|лент[аы]|вкусвилл|супермаркет|хлеб|молок|овощ/i, 'Продукты'], [/кафе|кофе|ресторан|обед|ужин|пицц|бургер|шаурм|доставк/i, 'Кафе'], [/такси|метро|автобус|бензин|топлив|парковк|проезд|электричк|азс/i, 'Транспорт'], [/квартплат|жкх|аренд|коммунал|электроэнерг/i, 'Жильё'], [/интернет|связь|телефон|мобильн/i, 'Связь'], [/аптек|врач|стоматолог|анализ|лекарств|клиник/i, 'Здоровье'], [/одежд|обув|куртк|джинс/i, 'Одежда'], [/кино|концерт|театр|подписк|музе|игр/i, 'Развлечения'], [/ремонт|строй|леруа|обои|плитк|краск|мебел|икеа|гарнитур/i, 'Дом'], [/подар/i, 'Подарки'], [/курс|книг|обучен|школ/i, 'Образование'], [/билет|отел|гостиниц|тур|авиа/i, 'Путешеств']];
const INC_KEYS = [[/зарплат|аванс|оклад/i, 'Зарплата'], [/подработ|фриланс|заказ/i, 'Подработка'], [/кешб|кэшб|процент/i, 'Проценты']];
const wdNext = (wd, strict) => { const t = today(); let k = (wd - pd(t).getDay() + 7) % 7; if (k === 0 && strict) k = 7; return addDays(t, k); };

function parseSmart(txt) {
  let s = ' ' + String(txt || '').replace(/\s+/g, ' ') + ' ';
  const r = { tags: [], parts: [] }, t = today(); let m;
  const cut = (mm, k, label) => { s = s.replace(mm[0], ' '); if (label) r.parts.push({ k, label }); };
  // деньги → операция
  if (m = s.match(RX.money)) { const raw = m[1].replace(/[\s ]/g, '').replace(',', '.'); r.amount = Math.abs(parseFloat(raw)); r.sign = raw.startsWith('+') ? 1 : raw.startsWith('-') ? -1 : 0; cut(m, 'amount', money(r.amount)); }
  // приоритет
  if (m = s.match(RX.prio2)) { r.prio = 2; cut(m, 'prio', 'Срочно'); } else if (m = s.match(RX.prio1)) { r.prio = 1; cut(m, 'prio', 'Важно'); }
  // теги
  let g = 0; while ((m = s.match(RX.tag)) && g++ < 10) { r.tags.push(m[1].toLowerCase()); cut(m, 'tag', '#' + m[1].toLowerCase()); }
  // проект
  if (m = s.match(RX.proj)) { const q = m[1].toLowerCase(), p = D.projects.find(p => p.title.toLowerCase().startsWith(q)) || D.projects.find(p => p.title.toLowerCase().split(/[\s:,.—-]+/).some(w => w.startsWith(q))); if (p) { r.project = p.id; cut(m, 'proj', p.title); } }
  // напоминание
  if (m = s.match(RX.remind)) { const n = m[1] ? +m[1] : 1, u = (m[2] || '').toLowerCase(); r.remind = !m[2] ? 0 : u.startsWith('пол') ? 30 : u.startsWith('м') ? n : u.startsWith('ч') ? n * 60 : u.startsWith('нед') ? n * 10080 : n * 1440; cut(m, 'remind', r.remind ? 'Напомнить за ' + durTxt(r.remind) : 'Напомнить'); }
  // повтор
  if (m = s.match(RX.repWd)) { const w = RX.wd.find(([re]) => new RegExp('^(' + re + ')', 'i').test(m[1])); r.repeat = 'week'; r.date = wdNext(w[1], false); cut(m, 'repeat', 'Каждый ' + m[1].toLowerCase()); }
  else for (const [re, v] of RX.rep) if (m = s.match(re)) { r.repeat = v; cut(m, 'repeat', REPS[v]); break; }
  // длительность
  if (m = s.match(RX.durHM)) { r.dur = +m[1] * 60 + +m[2]; cut(m, 'dur', durTxt(r.dur)); }
  else if ((m = s.match(RX.dur)) && (/\sна\s|\(/.test(m[0]) || /ч/i.test(m[2]) && !/[:]/.test(m[0]))) { const v = parseFloat(m[1].replace(',', '.')); r.dur = Math.round(/^м/i.test(m[2]) ? v : v * 60); cut(m, 'dur', durTxt(r.dur)); }
  // время
  if (m = s.match(RX.timeHM) || s.match(RX.timeDot)) { r.time = pad(+m[1]) + ':' + m[2]; cut(m, 'time', r.time); }
  else if (m = s.match(RX.timeH)) { let h = +m[1]; const p = (m[2] || '').toLowerCase(); if ((p === 'вечера' || p === 'дня') && h < 12) h += 12; if (p === 'ночи' && h === 12) h = 0; r.time = pad(h) + ':00'; cut(m, 'time', r.time); }
  else for (const [re, v] of RX.timeWord) if (m = s.match(re)) { r.time = v; cut(m, 'time', v); break; }
  // дата
  if (!r.date) {
    if (m = s.match(/\sпослезавтра(?=\s)/i)) { r.date = addDays(t, 2); cut(m); }
    else if (m = s.match(/\sзавтра(?=\s)/i)) { r.date = addDays(t, 1); cut(m); }
    else if (m = s.match(/\sсегодня(?=\s)/i)) { r.date = t; cut(m); }
    else if (m = s.match(RX.rel)) { const n = /^\d/.test(m[1]) ? +m[1] : m[1].startsWith('пар') ? 2 : 1, u = (m[2] || m[1]).toLowerCase(), x = pd(t); r.date = u.startsWith('нед') ? addDays(t, 7 * n) : u.startsWith('мес') ? ymd(new Date(x.getFullYear(), x.getMonth() + n, x.getDate())) : (u.startsWith('год') || u === 'лет') ? ymd(new Date(x.getFullYear() + n, x.getMonth(), x.getDate())) : addDays(t, n); cut(m); }
    else if (m = s.match(/\sна выходных(?=\s)/i)) { r.date = pd(t).getDay() === 6 || pd(t).getDay() === 0 ? t : wdNext(6); cut(m); }
    else if (m = s.match(/\sв конце недели(?=\s)/i)) { r.date = wdNext(5); cut(m); }
    else if (m = s.match(/\sв конце месяца(?=\s)/i)) { const x = pd(t); r.date = ymd(new Date(x.getFullYear(), x.getMonth() + 1, 0)); cut(m); }
    else if (m = s.match(/\s(?:на\s)?следующ(?:ей|ую)\sнедел[еию](?=\s)/i)) { r.date = addDays(weekStart(t), 7); cut(m); }
    else if (m = s.match(RX.dmy)) { const dd = +m[1], mm = +m[2]; if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) { let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000; let c = ymd(new Date(y, mm - 1, dd)); if (!m[3] && c < t) c = ymd(new Date(y + 1, mm - 1, dd)); r.date = c; cut(m); } }
    else if (m = s.match(new RegExp('\\s(?:к\\s|до\\s)?(\\d{1,2})\\s(' + MG.join('|') + ')(?:\\s(\\d{4}))?(?=\\s)', 'i'))) { const mm = MG.indexOf(m[2].toLowerCase()); let y = m[3] ? +m[3] : new Date().getFullYear(), c = ymd(new Date(y, mm, +m[1])); if (!m[3] && c < t) c = ymd(new Date(y + 1, mm, +m[1])); r.date = c; cut(m); }
    else { for (const [re, wd] of RX.wd) { const rr = new RegExp('\\s(?:(?:в|во)\\s)?(?:следующ(?:ий|ую|ее)\\s)?(?:' + re + ')(?=\\s)', 'i'); if (m = s.match(rr)) { r.date = wdNext(wd, true); if (/следующ/i.test(m[0]) && r.date < addDays(weekStart(t), 7)) r.date = addDays(r.date, 7); cut(m); break; } } }
  }
  if (r.date) r.parts.push({ k: 'date', label: human(r.date) });
  r.title = s.replace(/\s+/g, ' ').trim().replace(/^[-—:,]\s*/, '').replace(/\s(?:в|на|к|до)$/i, '');
  // тип записи
  if (r.amount) {
    r.kind = r.sign > 0 || INC_KEYS.some(([re]) => re.test(txt)) ? 'income' : 'expense';
    r.category = guessCategory(r.title, r.kind);
  } else r.kind = 'task';
  return r;
}
// подбор категории: сначала история операций, затем ключевые слова
function guessCategory(note, type) {
  const n = String(note || '').toLowerCase().trim(); if (!n) return null;
  const word = n.split(/\s+/)[0];
  const hist = B().tx.filter(x => x.type === type && x.category && x.note).sort((a, b) => b.date.localeCompare(a.date));
  let h = hist.find(x => x.note.toLowerCase() === n) || hist.find(x => x.note.toLowerCase().split(/\s+/)[0] === word && word.length > 3);
  if (h && catOf(h.category)) return h.category;
  for (const [re, name] of (type === 'income' ? INC_KEYS : CAT_KEYS)) if (re.test(n)) { const c = B().categories.find(c => c.type === type && c.title.toLowerCase().startsWith(name.toLowerCase().slice(0, 5))); if (c) return c.id; }
  return null;
}
function tagIdsFromNames(names) {
  return names.map(n => { let t = D.tags.find(x => x.title === n); if (!t) { t = { id: uid(), title: n, color: COLORS[D.tags.length % COLORS.length] }; D.tags.push(t); } return t.id; });
}
function parsePreviewHtml(p, base = {}) {
  if (!p.title && !p.parts.length) return '';
  const chips = [`<span class="pv-k ${p.kind === 'task' ? '' : p.kind}">${p.kind === 'task' ? 'Задача' : p.kind === 'income' ? 'Доход' : 'Расход'}</span>`, `<span class="pv-t">${esc(p.title || '…')}</span>`];
  p.parts.forEach(x => chips.push(`<span class="pv-c">${esc(x.label)}</span>`));
  if (!p.date && base.date && p.kind === 'task') chips.push(`<span class="pv-c soft">${esc(human(base.date))}</span>`);
  if (p.kind !== 'task') { const c = catOf(p.category); chips.push(`<span class="pv-c">${c ? esc(c.title) : 'категория не определена'}</span>`); }
  if (p.kind === 'task' && SM().overload) { const d = p.date || base.date; if (d) { const l = loadOf(d) + (p.dur || D.settings.defDur), c = capOf(d); if (l > c) chips.push(`<span class="pv-c warn">день перегружен: ${durTxt(l)} из ${durTxt(c)}</span>`); } }
  return chips.join('');
}
// создать задачу или операцию из разобранного текста
function createFromParse(p, base = {}) {
  if (p.kind !== 'task' && base.forceTask !== true) {
    snapU();
    const x = newTx({ type: p.kind, amount: r2(p.amount), date: p.date || today(), note: p.title, category: p.category || (B().categories.find(c => c.type === p.kind && /^проч/i.test(c.title)) || B().categories.find(c => c.type === p.kind) || {}).id, account: BF.last.account || B().accounts[0].id, project: p.project || base.project || null, tags: tagIdsFromNames(p.tags) });
    B().tx.push(x); if (typeof runRules === 'function') runRules('tx.created', x); save(); render();
    toast(`${p.kind === 'income' ? 'Доход' : 'Расход'} ${money(x.amount)} · ${(catOf(x.category) || { title: 'без категории' }).title}`, true, { act: 'openTx', id: x.id, label: 'Изменить' });
    return x;
  }
  if (!p.title) return null;
  snapU();
  const t = newTask({ title: p.title, col: base.col || firstCol().id, date: p.date || base.date || null, time: p.time || null, dur: p.dur || (p.time ? 60 : null), prio: p.prio != null ? p.prio : (base.prio || 0), tags: [...new Set([...(base.tags || []), ...tagIdsFromNames(p.tags)])], project: p.project || base.project || null, parent: base.parent || null, remind: p.remind != null ? p.remind : null, repeat: p.repeat || null });
  if (!t.date && (t.time || t.repeat || t.remind != null)) { t.date = today(); if (t.time && !t.repeat) { const n = new Date(); if (toMin(t.time) < n.getHours() * 60 + n.getMinutes()) t.date = addDays(today(), 1); } }
  if (!t.date) { t.remind = null; t.repeat = null; }
  addTask(t); TF.flash = t.id; save(); render();
  if (!toastBusy()) toast(`Задача добавлена${t.date ? ': ' + human(t.date).toLowerCase() + (t.time ? ' в ' + t.time : '') : ' во «Входящие»'}`, true);
  return t;
}
const toastBusy = () => $('#toast').classList.contains('show') && /перегружен/.test($('#toast').textContent);

// ---------- 2. Автоматический скоринг: главная задача ----------
function scoreTask(t) {
  const td = today(), why = []; let s = 0;
  const add = (v, label) => { if (v) { s += v; why.push({ v, label }); } };
  add([0, 15, 30][t.prio || 0], t.prio === 2 ? 'срочная' : t.prio === 1 ? 'важная' : '');
  if (t.date) { const k = diff(td, t.date); if (k < 0) add(Math.min(60, 40 + 3 * -k), `просрочена на ${-k} ${plural(-k, PD)}`); else if (k === 0) add(30, 'срок сегодня'); else if (k === 1) add(20, 'срок завтра'); else if (k <= 3) add(12, `срок через ${k} ${plural(k, PD)}`); else if (k <= 7) add(6, 'срок на этой неделе'); }
  if (t.date === td && t.time) { const n = new Date(), m = toMin(t.time) - (n.getHours() * 60 + n.getMinutes()); if (m >= 0 && m <= 120) add(10, `начало через ${durTxt(Math.max(1, m))}`); }
  const p = projOf(t.project); if (p && p.deadline && p.status === 'active') { const k = diff(td, p.deadline); if (k < 0) add(15, 'проект просрочен'); else if (k <= 14) add(14 - k, `до срока проекта ${k} ${plural(k, PD)}`); }
  const age = Math.floor((Date.now() - t.created) / 864e5); if (age >= 6) add(Math.min(10, Math.floor(age / 3)), `ждёт ${age} ${plural(age, PD)}`);
  if (t.postponed) add(Math.min(12, t.postponed * 3), `переносилась ${t.postponed} раз`);
  const c = D.columns.findIndex(x => x.id === t.col); if (c > 0 && !isDone(t)) add(8, 'уже в работе');
  if ((t.dur || 999) <= 15) add(5, 'быстрая (до 15 мин)');
  const open = kids(t.id).filter(k => !isDone(k)).length; if (open) add(-10, `сначала подзадачи (${open})`);
  const par = t.parent && byId(t.parent); if (par && (par.prio === 2 || (par.date && par.date <= td))) add(6, 'нужна для срочной задачи');
  return { s, why };
}
function rankTasks(limit) {
  return live().filter(t => !isDone(t) && (!t.date || diff(today(), t.date) <= 14)).map(t => ({ t, ...scoreTask(t) })).sort((a, b) => b.s - a.s).slice(0, limit || 999);
}

// ---------- 3. Защита от перегрузки: ёмкость дня ----------
const capOf = d => D.settings.capacity[pd(d).getDay()];
const durOf = t => t.dur || D.settings.defDur;
const loadOf = (d, ex) => live().filter(t => t.date === d && t.id !== ex && !kids(t.id).length).reduce((a, t) => a + durOf(t), 0);
const loadLeft = d => live().filter(t => t.date === d && !isDone(t) && !kids(t.id).length).reduce((a, t) => a + durOf(t), 0);
function freeDay(from, need) { for (let i = 1; i <= 30; i++) { const d = addDays(from, i); if (loadOf(d) + need <= capOf(d)) return d; } return null; }
function capBar(d, big) {
  const l = loadOf(d), c = capOf(d), p = c ? l / c : (l ? 2 : 0), cls = p > 1 ? 'over' : p > .85 ? 'warn' : '';
  return `<span class="cap ${cls} ${big ? 'big' : ''}" title="Загрузка: ${hm(l || 0)} из ${c ? durTxt(c) : '0'}"><i style="width:${Math.min(100, p * 100)}%"></i></span>`;
}
function overloadCheck(t) {
  if (!SM().overload || !t || !t.date || isDone(t) || t.date < today()) return;
  const l = loadOf(t.date), c = capOf(t.date); if (l <= c) return;
  const f = freeDay(t.date, durOf(t));
  toast(`${human(t.date)} перегружен: ${durTxt(l)} при ёмкости ${durTxt(c)}`, false, f ? { act: 'moveToFree', id: t.id, v: f, label: 'Перенести на ' + human(f).toLowerCase() } : null);
}

// ---------- 4. Автоподстановки и шаблоны ----------
const tplVars = (s, ctx = {}) => String(s || '').replace(/\{дата\}/g, human(today()).toLowerCase()).replace(/\{месяц\}/g, MN[new Date().getMonth()].toLowerCase()).replace(/\{неделя\}/g, isoWeekN(today())).replace(/\{проект\}/g, ctx.project ? (projOf(ctx.project) || {}).title || '' : '');
const isoWeekN = s => { const d = pd(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7); };
function ctxNow() { const c = []; if (UI.view === 'projects' && UI.proj) { const p = projOf(UI.proj); c.push('proj:' + UI.proj); if (p && p.folder) folderPath(p.folder).forEach(f => c.push('folder:' + f.id)); } if (UI.view === 'board') TF.tags.forEach(t => c.push('tag:' + t)); c.push('view:' + UI.view); return c; }
function tplRank(kind) { const ctx = ctxNow(); return D.templates.filter(t => !kind || t.kind === kind).map(t => ({ t, m: t.ctx && ctx.includes(t.ctx) ? 1 : 0 })).sort((a, b) => b.m - a.m || a.t.name.localeCompare(b.t.name, 'ru')).map(x => ({ ...x.t, match: !!x.m })); }
function tagIdsAny(list) { return (list || []).map(v => tagOf(v) ? v : (D.tags.find(t => t.title === v) || {}).id).filter(Boolean); }
function applyTemplate(tpl, base = {}) {
  const d = tpl.data, ctx = { project: base.project || (UI.view === 'projects' ? UI.proj : null) };
  if (tpl.kind === 'task') {
    const t = newTask({ title: tplVars(d.title, ctx), desc: tplVars(d.desc || '', ctx), tags: tagIdsAny(d.tags), dur: d.dur || null, prio: d.prio || 0, remind: d.remind != null ? d.remind : null, checklist: (d.checklist || []).map(x => ({ t: tplVars(x, ctx), d: false })), project: ctx.project || null, date: base.date || null, parent: base.parent || null });
    if (!t.date) t.remind = null;
    return t;
  }
  if (tpl.kind === 'project') {
    snapU();
    const p = newProject({ title: tplVars(d.title, ctx), color: d.color || COLORS[D.projects.length % COLORS.length], folder: base.folder || null, start: today(), deadline: d.tasks && d.tasks.length ? addDays(today(), Math.max(...d.tasks.map(x => x[1] || 0)) + 7) : null });
    D.projects.push(p);
    (d.tasks || []).forEach(([title, off]) => addTask(newTask({ title: tplVars(title, { project: p.id }), project: p.id, date: off != null ? addDays(today(), off) : null }), { quiet: true }));
    save(); return p;
  }
  if (tpl.kind === 'expense') return newTx({ type: 'expense', amount: d.amount, category: catOf(d.category) ? d.category : guessCategory(d.note, 'expense'), note: d.note, account: d.account || BF.last.account || B().accounts[0].id, date: today() });
}
// подсказки по истории и шаблонам
function suggest(q, kind) {
  q = String(q || '').trim().toLowerCase(); const out = [];
  if (!SM().suggest) return out;
  const first = q.replace(/[#@!].*$/, '').trim();
  tplRank(kind === 'tx' ? 'expense' : null).filter(t => !first || t.name.toLowerCase().includes(first) || tplVars(t.data.title || t.data.note || '').toLowerCase().includes(first)).slice(0, first ? 4 : 6)
    .forEach(t => out.push({ type: 'tpl', label: t.name, sub: t.kind === 'task' ? 'шаблон задачи' + (t.data.checklist && t.data.checklist.length ? ` · ${t.data.checklist.length} пунктов` : '') : t.kind === 'project' ? `шаблон проекта · ${t.data.tasks.length} задач` : `шаблон расхода · ${money(t.data.amount)}`, id: t.id, match: t.match }));
  if (first.length >= 2) {
    const seen = new Map();
    for (const t of D.tasks) { const k = t.title.toLowerCase(); if (k.includes(first) && k !== first) { const e = seen.get(k); if (!e || e.t.created < t.created) seen.set(k, { t, n: (e ? e.n : 0) + 1 }); else e.n++; } }
    [...seen.values()].sort((a, b) => b.n - a.n || b.t.created - a.t.created).slice(0, 5).forEach(({ t, n }) => out.push({ type: 'hist', label: t.title, sub: [n > 1 ? `было ${n} раз` : 'было раньше', projOf(t.project) ? projOf(t.project).title : '', tagsOf(t).map(x => '#' + x.title).join(' '), t.dur ? durTxt(t.dur) : ''].filter(Boolean).join(' · '), id: t.id }));
    const notes = new Map(); for (const x of B().tx) { const k = (x.note || '').toLowerCase(); if (k && k.includes(first) && k !== first) { const e = notes.get(k) || { x, n: 0, sum: 0 }; e.n++; e.sum += x.amount; if (x.date > e.x.date) e.x = x; notes.set(k, e); } }
    [...notes.values()].sort((a, b) => b.n - a.n).slice(0, 3).forEach(({ x, n, sum }) => out.push({ type: 'txh', label: x.note, sub: `расход · обычно ${money0(sum / n)} · ${(catOf(x.category) || { title: '' }).title}`, id: x.id }));
  }
  return out;
}
function suggHtml(list, sel) {
  return list.map((s, i) => `<button class="sg ${i === sel ? 'on' : ''}" data-act="sugPick" data-i="${i}"><span class="sg-i ${s.type}">${ic(s.type === 'tpl' ? 'copy' : s.type === 'txh' ? 'coin' : 'repeat')}</span><span class="sg-t"><b>${esc(s.label)}</b><small>${esc(s.sub)}${s.match ? ' · подходит к текущему разделу' : ''}</small></span></button>`).join('');
}

// ---------- быстрый ввод (окно) ----------
const QK = { sug: [], sel: -1, force: null, base: {} };
function openQuick(prefill, base) {
  QK.base = base || taskPreset(); QK.sel = -1; QK.force = null;
  UI.form = { kind: 'quick' };
  modal(`<div class="mbox qbox"><div class="qhead">${MOB() ? `<button class="ib" data-act="mclose" aria-label="Закрыть">${ic('left')}</button>` : ic('spark')}<input id="qk" placeholder="${MOB() ? 'Позвонить маме завтра в 19 или кофе 250₽' : 'Например: «Позвонить маме завтра в 19:00 #семья» или «кофе 250₽»'}" autocomplete="off" enterkeyhint="done" value="${esc(prefill || '')}">${MOB() ? `<button class="btn pri sm" data-act="quickGo">Создать</button>` : ''}</div>
    <div class="qp" id="qkp"></div><div class="qsug" id="qks"></div>
    <div class="qfoot"><span class="hint mobhide"><kbd>Enter</kbd> создать · <kbd>↑</kbd><kbd>↓</kbd> подсказки · <kbd>Tab</kbd> задача/расход</span><span class="spacer"></span><button class="btn sm ghost" data-act="help" data-v="parser">Что понимает строка</button></div></div>`);
  setTimeout(() => { const i = $('#qk'); if (!i) return; i.focus(); i.setSelectionRange(i.value.length, i.value.length); quickUpd(); }, 20);
}
function quickUpd() {
  const v = $('#qk').value, p = parseSmart(v);
  if (QK.force) p.kind = QK.force === 'task' ? 'task' : (p.amount ? p.kind : 'task');
  $('#qkp').innerHTML = v.trim() ? parsePreviewHtml(p, QK.base) : '';
  QK.sug = suggest(v, p.kind === 'task' ? 'task' : 'tx');
  $('#qks').innerHTML = QK.sug.length ? `<div class="hint" style="padding:.2rem .5rem">${v.trim() ? 'Подсказки' : 'Шаблоны'}</div>` + suggHtml(QK.sug, QK.sel) : '';
}
function sugApply(s, fromQuick) {
  if (!s) return;
  if (s.type === 'tpl') {
    const tpl = D.templates.find(t => t.id === s.id); closeModal();
    if (tpl.kind === 'task') { const t = applyTemplate(tpl, QK.base); openTaskForm(null, t); }
    else if (tpl.kind === 'project') { const p = applyTemplate(tpl, { folder: UI.folder || null }); UI.proj = p.id; go('projects'); toast(`Проект «${p.title}» создан по шаблону`, true); }
    else { const x = applyTemplate(tpl); openTxForm(null, x); }
  } else if (s.type === 'hist') {
    const o = byId(s.id); if (!o) return;
    const inp = $('#qk'); if (fromQuick && inp) { inp.value = o.title + (tagsOf(o).length ? ' ' + tagsOf(o).map(t => '#' + t.title).join(' ') : '') + (projOf(o.project) ? ' @' + projOf(o.project).title.split(' ')[0] : '') + (o.dur ? ` на ${o.dur} мин` : '') + ' '; QK.sel = -1; inp.focus(); quickUpd(); }
  } else if (s.type === 'txh') {
    const x = txOf(s.id); const inp = $('#qk'); if (inp && x) { inp.value = x.note + ' ' + String(x.amount).replace('.', ',') + '₽ '; QK.sel = -1; inp.focus(); quickUpd(); }
  }
}
function quickSubmit() {
  if (QK.sel >= 0 && QK.sug[QK.sel]) return sugApply(QK.sug[QK.sel], true);
  const v = $('#qk').value.trim(); if (!v) return;
  if (typeof lawSearch === 'function' && RX_REF.test(v) && LAWC.size) { const h = lawSearch(v, 1); if (h[0] && h[0].exact) { closeModal(); LF.doc = h[0].d.id; LF.art = h[0].a.id; LF.q = ''; return go('law'); } }
  const p = parseSmart(v); if (QK.force === 'task') p.kind = 'task';
  if (p.kind === 'task' && !p.title) return toast('Не хватает названия задачи');
  closeModal(); createFromParse(p, { ...QK.base, forceTask: QK.force === 'task' });
}
Object.assign(ACT, {
  quick: b => openQuick('', taskPreset()), quickGo: () => quickSubmit(),
  sugPick: b => { const s = (UI.form && UI.form.kind === 'quick' ? QK.sug : (UI.sugList || []))[+b.dataset.i]; if (UI.form && UI.form.kind === 'quick') sugApply(s, true); else if (UI.sugCb) UI.sugCb(s); },
  moveToFree: b => { const t = byId(b.dataset.id); if (!t) return; snapU(); setTaskDate(t, b.dataset.v); save(); render(); toast('Перенесено на ' + human(b.dataset.v).toLowerCase(), true); },
  focusStart: b => { const t = byId(b.dataset.id), c = D.columns.find((c, i) => i > 0 && !c.done); if (t && c) moveTask(t.id, c.id, null); },
  focusSkip: () => { UI.focusSkip = (UI.focusSkip || 0) + 1; render(); }
});
