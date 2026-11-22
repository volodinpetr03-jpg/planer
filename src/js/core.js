'use strict';
// ============================================================
//  Ядро «Планера»: утилиты, данные, общие связи, темы, реестр модулей
// ============================================================
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const diff = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const weekStart = s => { const d = pd(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
const clone = o => JSON.parse(JSON.stringify(o));
const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2]; };
const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MGS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MNS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WSL = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], WSU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const PT = ['задача', 'задачи', 'задач'], POP = ['операция', 'операции', 'операций'], PD = ['день', 'дня', 'дней'];
const human = s => { const k = diff(today(), s); if (k === 0) return 'Сегодня'; if (k === 1) return 'Завтра'; if (k === -1) return 'Вчера'; const x = pd(s); return WSL[x.getDay()] + ', ' + x.getDate() + ' ' + MGS[x.getMonth()] + (x.getFullYear() !== new Date().getFullYear() ? ' ' + x.getFullYear() : ''); };
const dayLong = s => { const x = pd(s), k = diff(today(), s); return (k === 0 ? 'Сегодня, ' : k === 1 ? 'Завтра, ' : k === -1 ? 'Вчера, ' : '') + x.getDate() + ' ' + MG[x.getMonth()] + (x.getFullYear() !== new Date().getFullYear() ? ' ' + x.getFullYear() : '') + ', ' + WSL[x.getDay()]; };
const hm = m => m > 0 ? durTxt(m) : '0 ч';
const durTxt = m => m < 60 ? m + ' мин' : (m % 60 ? Math.floor(m / 60) + ' ч ' + m % 60 + ' мин' : m / 60 + ' ч');
const fmtTs = ts => { if (!ts) return ''; const d = new Date(ts); return d.getDate() + ' ' + MG[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const mkey = s => s.slice(0, 7);
const mAdd = (k, n) => { const [y, m] = k.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const mTitle = k => { const [y, m] = k.split('-').map(Number); return MN[m - 1] + ' ' + y; };
const mDays = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const hasApi = !!window.api;
const IS_PHONE = !!(window.api && window.api.platform === 'android');
const MOB = () => IS_PHONE ? window.innerWidth < 900 : window.matchMedia('(max-width: 760px)').matches;
const r2 = v => Math.round(v * 100) / 100;
const NF0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF = { format: v => (Number.isInteger(r2(v)) ? NF0 : NF2).format(v) };
const cur = () => (D && D.settings.currency) || '₽';
const money = (v, sign) => (sign && v > 0 ? '+' : sign && v < 0 ? '−' : v < 0 ? '−' : '') + NF.format(Math.abs(r2(v))) + ' ' + cur();
const money0 = v => (v < 0 ? '−' : '') + NF0.format(Math.abs(v)) + ' ' + cur();
const parseMoney = s => { const v = parseFloat(String(s).replace(/\s| /g, '').replace(',', '.')); return isFinite(v) ? r2(v) : NaN; };

// ---------- значки ----------
const ICONS = {
  dash: '<rect x="3.5" y="3.5" width="7.5" height="9" rx="2"/><rect x="13" y="3.5" width="7.5" height="5.5" rx="2"/><rect x="13" y="11" width="7.5" height="9.5" rx="2"/><rect x="3.5" y="14.5" width="7.5" height="6" rx="2"/>',
  board: '<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="16.5" y="4" width="4" height="7" rx="1.5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2"/>',
  proj: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M16 13.5h4.5"/><circle cx="16.5" cy="13.5" r=".9" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.4 1.4-1 2.5 1 2.5-2.4 1.4-.6 2.7-2.7-.6L12 21.2l-1.6-2.1-2.7.6-.6-2.7-2.4-1.4 1-2.5-1-2.5 2.4-1.4.6-2.7 2.7.6z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  repeat: '<path d="M17 2.5l3 3-3 3M4 11V9.5a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3M20 13v1.5a4 4 0 0 1-4 4H4"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>', left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
  archive: '<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v10.5h14V9M10 13h4"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.3"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.9-1.5-1.4-2.5-1.4-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2.1c1.6.4 2.7 1 2.7 2.2s-1.2 2.1-2.7 2.1c-1.1 0-2.1-.5-2.6-1.4M12 6v1.8M12 16.2V18"/>',
  up: '<path d="M7 17L17 7M9 7h8v8"/>', down: '<path d="M17 7L7 17M15 17H7V9"/>', swap: '<path d="M7 4L3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 7 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10" cy="7.5" r="1.1" fill="currentColor"/><circle cx="14.5" cy="7.5" r="1.1" fill="currentColor"/>',
  puzzle: '<path d="M9 4.5a2 2 0 1 1 4 0V6h3.5a1.5 1.5 0 0 1 1.5 1.5V11h-1.5a2 2 0 1 0 0 4H18v3.5a1.5 1.5 0 0 1-1.5 1.5H13v-1.5a2 2 0 1 0-4 0V20H5.5A1.5 1.5 0 0 1 4 18.5V15h1.5a2 2 0 1 0 0-4H4V7.5A1.5 1.5 0 0 1 5.5 6H9z"/>',
  chart: '<path d="M4 20h16M7 16v-5M11 16V8M15 16v-3M19 16V5"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  bolt: '<path d="M13 2.5L4.5 13.5H11L10 21.5l8.5-11H12z"/>', folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM12 10.5v6M9 13.5h6"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 16.8v.1"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  caret: '<path d="M9 6l6 6-6 6"/>', sub: '<path d="M5 4v8a3 3 0 0 0 3 3h11M15 11l4 4-4 4"/>', data: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>', star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', play: '<path d="M7 4.5v15l12-7.5z"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const COLORS = ['#4d8dff', '#3ecf8e', '#f2b441', '#ff6b5e', '#a26bfa', '#2ec4c9', '#ff7ab6', '#f97316', '#84cc16', '#0ea5e9', '#e879f9', '#9aa3af'];

// ============================================================
//  Данные
// ============================================================
let D = null, saveT = null;
const undoStack = [];
const DEF_SETTINGS = { closeToTray: true, sound: true, theme: 'dark', accent: '#4d8dff', font: 'Inter', fontSize: 14, zoom: 1, collapsed: false, currency: '₽', startView: 'dashboard', tourDone: false, showSub: false,
  calTypes: { tasks: true, pays: true, exp: true, dl: true, dates: true, ext: true },
  modules: { dashboard: true, board: true, calendar: true, projects: true, budget: true, insights: true, auto: true },
  smart: { parser: true, scoring: true, overload: true, autocat: true, suggest: true, rules: true },
  capacity: [180, 360, 360, 360, 360, 360, 180], defDur: 30 };
const newTask = o => ({ id: uid(), title: '', desc: '', col: null, order: 0, prio: 0, tags: [], project: null, parent: null, postponed: 0, date: null, time: null, dur: null, remind: null, rem2: null, nag: null, repeat: null, checklist: [], created: Date.now(), doneAt: null, archived: false, snooze: null, ...o });
const newTx = o => ({ id: uid(), type: 'expense', amount: 0, date: today(), account: null, to: null, category: null, project: null, task: null, tags: [], note: '', created: Date.now(), ...o });
const newProject = o => ({ id: uid(), title: '', color: COLORS[0], desc: '', status: 'active', start: today(), deadline: null, budget: null, folder: null, created: Date.now(), ...o });
function defBudget() {
  const E = [['Продукты', '#3ecf8e'], ['Кафе и рестораны', '#f97316'], ['Транспорт', '#0ea5e9'], ['Жильё и ЖКХ', '#a26bfa'], ['Связь и интернет', '#2ec4c9'], ['Здоровье', '#ff6b5e'], ['Одежда', '#ff7ab6'], ['Развлечения', '#f2b441'], ['Дом и ремонт', '#84cc16'], ['Подарки', '#e879f9'], ['Образование', '#4d8dff'], ['Путешествия', '#06b6d4'], ['Прочее', '#9aa3af']];
  const I = [['Зарплата', '#3ecf8e'], ['Подработка', '#4d8dff'], ['Подарки', '#e879f9'], ['Проценты и кешбэк', '#f2b441'], ['Прочие доходы', '#9aa3af']];
  return {
    accounts: [{ id: 'card', title: 'Банковская карта', type: 'card', color: '#4d8dff', initial: 0 }, { id: 'cash', title: 'Наличные', type: 'cash', color: '#14a76c', initial: 0 }, { id: 'save', title: 'Накопления', type: 'savings', color: '#a26bfa', initial: 0 }],
    categories: E.map(([t, c], i) => ({ id: 'e' + i, title: t, color: c, type: 'expense', limit: null })).concat(I.map(([t, c], i) => ({ id: 'i' + i, title: t, color: c, type: 'income', limit: null }))),
    tx: [], regular: []
  };
}
function blank() {
  return { version: 3, demo: false, notified: {}, settings: clone(DEF_SETTINGS),
    columns: [{ id: 'todo', title: 'Сделать', color: '#4d8dff' }, { id: 'doing', title: 'В работе', color: '#f2b441' }, { id: 'done', title: 'Готово', color: '#3ecf8e', done: true }],
    tags: [{ id: 'work', title: 'работа', color: '#4d8dff' }, { id: 'home', title: 'дом', color: '#3ecf8e' }, { id: 'family', title: 'семья', color: '#ff7ab6' }, { id: 'health', title: 'здоровье', color: '#ff6b5e' }],
    projects: [], folders: [], tasks: [], budget: defBudget(), templates: defTemplates(), rules: defRules(), ruleLog: [] };
}
// встроенные шаблоны (контекстные, с автоподстановками {дата}, {месяц}, {неделя}, {проект})
function defTemplates() {
  return [
    { id: 'tpl-review', kind: 'task', name: 'Еженедельный обзор', ctx: '', data: { title: 'Обзор недели {неделя}', tags: ['work'], dur: 30, prio: 0, checklist: ['Разобрать входящие', 'Проверить просроченное', 'Наметить 3 главные задачи', 'Свериться с бюджетом'] } },
    { id: 'tpl-shop', kind: 'task', name: 'Покупка продуктов', ctx: 'tag:home', data: { title: 'Купить продукты на неделю', tags: ['home'], dur: 60, prio: 0, checklist: ['Овощи и фрукты', 'Молочные продукты', 'Крупы', 'Бытовая химия'] } },
    { id: 'tpl-meet', kind: 'task', name: 'Встреча', ctx: 'tag:work', data: { title: 'Встреча: ', tags: ['work'], dur: 60, prio: 1, remind: 15, checklist: ['Повестка', 'Материалы', 'Итоги и задачи'] } },
    { id: 'tpl-trip', kind: 'project', name: 'Поездка', ctx: '', data: { title: 'Поездка — {месяц}', color: '#14b8a6', tasks: [['Выбрать даты и направление', 0], ['Купить билеты', 3], ['Забронировать жильё', 5], ['Оформить страховку', 10], ['Собрать вещи', 20]] } },
    { id: 'tpl-repair', kind: 'project', name: 'Ремонт', ctx: '', data: { title: 'Ремонт: ', color: '#f97316', tasks: [['Составить смету', 0], ['Выбрать материалы', 3], ['Найти мастера', 5], ['Демонтаж', 10], ['Черновые работы', 15], ['Чистовая отделка', 30]] } },
    { id: 'tpl-coffee', kind: 'expense', name: 'Кофе', ctx: '', data: { amount: 250, category: 'e1', note: 'Кофе' } },
    { id: 'tpl-lunch', kind: 'expense', name: 'Обед', ctx: '', data: { amount: 450, category: 'e1', note: 'Обед' } },
    { id: 'tpl-metro', kind: 'expense', name: 'Проезд', ctx: '', data: { amount: 70, category: 'e2', note: 'Метро' } }
  ];
}
// встроенные правила «Если → То»
function defRules() {
  return [
    { id: 'rl1', name: 'Покупки — с тегом', on: true, trigger: 'task.created', cond: [{ f: 'title', op: 'contains', v: 'купить' }], act: [{ t: 'addTag', v: 'покупки' }] },
    { id: 'rl2', name: 'Крупный расход — на контроль', on: true, trigger: 'tx.created', cond: [{ f: 'amount', op: 'gt', v: '10000' }, { f: 'type', op: 'eq', v: 'expense' }], act: [{ t: 'notify', v: 'Крупный расход: {сумма}' }, { t: 'createTask', v: 'Проверить крупный расход: {заметка}' }] },
    { id: 'rl3', name: 'Срочное — на сегодня', on: true, trigger: 'task.created', cond: [{ f: 'prio', op: 'eq', v: '2' }, { f: 'date', op: 'empty', v: '' }], act: [{ t: 'setDate', v: '0' }] },
    { id: 'rl4', name: 'Выполнено в проекте — запись в журнал', on: false, trigger: 'task.done', cond: [{ f: 'project', op: 'notempty', v: '' }], act: [{ t: 'notify', v: 'Шаг проекта выполнен: {название}' }] }
  ];
}
function normalize(d) {
  const b = blank();
  if (!d.version || d.version < 2) { // перенос из версии 1: метки → теги
    d.tags = (d.labels || []).map(l => ({ id: l.id, title: String(l.title).toLowerCase(), color: l.color }));
    (d.tasks || []).forEach(t => { t.tags = t.label ? [t.label] : []; delete t.label; });
    delete d.labels; d.version = 2;
  }
  if (d.version < 3) d.version = 3;
  d.columns = Array.isArray(d.columns) && d.columns.length ? d.columns : b.columns;
  d.tags = Array.isArray(d.tags) ? d.tags : b.tags;
  d.projects = (d.projects || []).map(p => newProject(p));
  d.folders = Array.isArray(d.folders) ? d.folders : [];
  if (!Array.isArray(d.templates)) d.templates = defTemplates();
  if (!Array.isArray(d.rules)) d.rules = defRules();
  d.ruleLog = Array.isArray(d.ruleLog) ? d.ruleLog.slice(-100) : [];
  d.settings = Object.assign(clone(DEF_SETTINGS), d.settings || {});
  d.settings.modules = Object.assign(clone(DEF_SETTINGS.modules), (d.settings || {}).modules || {});
  d.settings.calTypes = Object.assign(clone(DEF_SETTINGS.calTypes), (d.settings || {}).calTypes || {});
  d.settings.smart = Object.assign(clone(DEF_SETTINGS.smart), (d.settings || {}).smart || {});
  if (!Array.isArray(d.settings.capacity) || d.settings.capacity.length !== 7) d.settings.capacity = clone(DEF_SETTINGS.capacity);
  d.notified = d.notified || {};
  d.dates = Array.isArray(d.dates) ? d.dates : [];
  d.focusLog = Array.isArray(d.focusLog) ? d.focusLog : [];
  d.habits = Array.isArray(d.habits) ? d.habits : [];
  d.notes = Array.isArray(d.notes) ? d.notes : [];
  d.contacts = Array.isArray(d.contacts) ? d.contacts : [];
  d.icals = Array.isArray(d.icals) ? d.icals : [];
  const bb = d.budget || {}; const db = defBudget();
  d.budget = { accounts: Array.isArray(bb.accounts) && bb.accounts.length ? bb.accounts : db.accounts, categories: Array.isArray(bb.categories) && bb.categories.length ? bb.categories : db.categories, tx: (bb.tx || []).map(x => newTx(x)), regular: bb.regular || [] };
  const ids = new Set(d.columns.map(c => c.id));
  d.tasks = (d.tasks || []).map(t => newTask(t)).map(t => ids.has(t.col) ? t : { ...t, col: d.columns[0].id });
  return d;
}
function save(now) {
  clearTimeout(saveT);
  if (typeof shareDirty === 'function' && !UI.syncing) shareDirty();
  if (typeof psDirty === 'function' && !UI.syncing) psDirty();
  const run = () => {
    if (!D || UI.locked) return Promise.resolve(false);
    if (!hasApi) { try { localStorage.setItem('planer-web', JSON.stringify(D)); } catch (e) {} return Promise.resolve(true); }
    return window.api.save(clone(D)).then(r => {
      const ok = r === true || (r && r.ok);
      UI.saveErr = ok ? null : (r && r.error) || 'неизвестная ошибка';
      if (!ok) toast('Не удалось сохранить данные: ' + UI.saveErr + '. Подробности — Настройки → Данные');
      return ok;
    }).catch(e => { UI.saveErr = String(e && e.message || e); toast('Не удалось сохранить данные'); return false; });
  };
  if (now) return run();
  saveT = setTimeout(run, 200); return null;
}
const saveNow = () => save(true);
window.addEventListener('beforeunload', () => { if (D && hasApi && !UI.locked) { clearTimeout(saveT); try { window.api.saveSync(clone(D)); } catch (e) {} } });
// очистка: example — только пример; data — всё, кроме настроек, колонок, шаблонов и правил; full — полный сброс
function resetData(mode) {
  const s = D.settings, cols = D.columns, tpl = D.templates, rules = D.rules, sh = D.share, sy = D.sync;
  D = blank();
  if (sy && mode !== 'full') { D.sync = sy; if (typeof psReset === 'function') psReset(); } // синхронизация остаётся: данные с Диска вернутся, на Диске ничего не удалится
  else if (sy && typeof psDB === 'object') psDB.del('base').catch(() => {});
  if (sh && mode !== 'full') D.share = { ...sh, base: {}, meta: {}, tombs: {} }; // общие проекты придут заново от участников, у них ничего не удалится
  if (mode !== 'full') D.settings = s; else D.settings.font = s.font;
  if (mode === 'data') { D.columns = cols; D.templates = tpl; D.rules = rules; }
  D.demo = false; D.settings.tourDone = true;
  try { localStorage.setItem('planer-tour-done', '1'); } catch (e) {}
  TF.tags.clear(); TF.proj = ''; TF.filter = 'all'; UI.proj = null; UI.folder = null; BF.f = { type: '', cat: '', acc: '', proj: '', tag: '' };
  applyAppearance(); render();
  return saveNow().then(ok => ok);
}
function snapU() { undoStack.push(JSON.stringify(D)); if (undoStack.length > 50) undoStack.shift(); }
function undo() { const s = undoStack.pop(); if (!s) return toast('Отменять нечего'); D = JSON.parse(s); save(); closeModal(); applyAppearance(); render(); toast('Действие отменено'); }

// ============================================================
//  Доступ к данным и сквозные связи
// ============================================================
const byId = id => D.tasks.find(t => t.id === id);
const colOf = id => D.columns.find(c => c.id === id);
const doneCol = () => D.columns.find(c => c.done);
const firstCol = () => D.columns.find(c => !c.done) || D.columns[0];
const isDone = t => !!(colOf(t.col) || {}).done;
const tagOf = id => D.tags.find(t => t.id === id);
const tagsOf = o => (o.tags || []).map(tagOf).filter(Boolean);
const projOf = id => id ? D.projects.find(p => p.id === id) : null;
const byOrder = (a, b) => a.order - b.order;
const live = () => D.tasks.filter(t => !t.archived);
const tasksIn = c => D.tasks.filter(t => t.col === c && !t.archived).sort(byOrder);
const kids = id => D.tasks.filter(t => t.parent === id && !t.archived);
const descendants = id => { const out = []; const walk = p => kids(p).forEach(k => { out.push(k); walk(k.id); }); walk(id); return out; };
const ancestors = t => { const out = []; let p = t.parent && byId(t.parent), g = 0; while (p && g++ < 50) { out.unshift(p); p = p.parent && byId(p.parent); } return out; };
const subProgress = id => { const d = descendants(id); return { n: d.length, d: d.filter(isDone).length }; };
const folderOf = id => id ? D.folders.find(f => f.id === id) : null;
const subFolders = id => D.folders.filter(f => (f.parent || null) === (id || null)).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
const folderTree = id => { const out = [id]; subFolders(id).forEach(f => out.push(...folderTree(f.id))); return out; };
const folderPath = id => { const out = []; let f = folderOf(id), g = 0; while (f && g++ < 50) { out.unshift(f); f = folderOf(f.parent); } return out; };
const reorder = col => tasksIn(col).forEach((x, i) => x.order = i);
const B = () => D.budget;
const accOf = id => B().accounts.find(a => a.id === id);
const catOf = id => B().categories.find(c => c.id === id);
const txOf = id => B().tx.find(x => x.id === id);
const regOf = id => B().regular.find(x => x.id === id);
const accBalance = id => { const a = accOf(id); let v = a ? +a.initial || 0 : 0; for (const x of B().tx) { if (x.type === 'income' && x.account === id) v += x.amount; else if (x.type === 'expense' && x.account === id) v -= x.amount; else if (x.type === 'transfer') { if (x.account === id) v -= x.amount; if (x.to === id) v += x.amount; } } return r2(v); };
const totalBalance = () => r2(B().accounts.reduce((a, x) => a + accBalance(x.id), 0));
const txMonth = k => B().tx.filter(x => x.date.startsWith(k));
const sumT = (list, type) => r2(list.filter(x => x.type === type).reduce((a, x) => a + x.amount, 0));
const catSpent = (cid, k) => sumT(txMonth(k).filter(x => x.category === cid), 'expense');
const projTx = pid => B().tx.filter(x => x.project === pid);
const taskTx = tid => B().tx.filter(x => x.task === tid);
const projTasks = pid => live().filter(t => t.project === pid);
function projStats(p) {
  const ts = projTasks(p.id), d = ts.filter(isDone).length, tx = projTx(p.id), spent = sumT(tx, 'expense'), inc = sumT(tx, 'income');
  return { ts, n: ts.length, d, pct: ts.length ? Math.round(d / ts.length * 100) : 0, spent, inc, over: p.budget ? spent > p.budget : false, left: p.deadline ? diff(today(), p.deadline) : null, next: ts.filter(t => !isDone(t)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))[0] };
}
function stepDate(s, rep, anchor) {
  const x = pd(s);
  if (rep === 'day') x.setDate(x.getDate() + 1);
  else if (rep === 'weekdays') { do x.setDate(x.getDate() + 1); while (x.getDay() === 0 || x.getDay() === 6); }
  else if (rep === 'week') x.setDate(x.getDate() + 7);
  else if (rep === 'week2') x.setDate(x.getDate() + 14);
  else if (rep === 'month' || rep === 'quarter' || rep === 'year') { const day = anchor || x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + (rep === 'month' ? 1 : rep === 'quarter' ? 3 : 12)); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); }
  return ymd(x);
}
function nextOcc(t) { const anchor = pd(t.date).getDate(); let n = stepDate(t.date, t.repeat, anchor), g = 0; const td = today(); while (n < td && g++ < 3000) n = stepDate(n, t.repeat, anchor); return n; }
function onComplete(t) {
  t.doneAt = Date.now(); t.snooze = null;
  if (t.repeat && t.date) {
    const n = nextOcc(t), c = newTask({ ...clone(t), id: uid(), col: firstCol().id, date: n, doneAt: null, created: Date.now(), order: -1, checklist: t.checklist.map(i => ({ t: i.t, d: false })) });
    t.repeat = null; D.tasks.push(c); reorder(c.col);
    return 'Следующее повторение: ' + human(n).toLowerCase();
  }
  return null;
}
function moveTask(id, col, beforeId) {
  const t = byId(id); if (!t) return;
  snapU(); const was = isDone(t); t.col = col;
  const list = tasksIn(col).filter(x => x.id !== id), i = beforeId ? list.findIndex(x => x.id === beforeId) : -1;
  list.splice(i < 0 ? list.length : i, 0, t); list.forEach((x, k) => x.order = k);
  let msg = null;
  const colChanged = t.col !== col;
  if (!was && isDone(t)) { msg = onComplete(t) || 'Задача выполнена'; if (typeof runRules === 'function') runRules('task.done', t); const p = t.parent && byId(t.parent); if (p && !isDone(p) && kids(p.id).every(isDone)) msg += `. Все подзадачи «${p.title}» выполнены`; }
  else if (was && !isDone(t)) { t.doneAt = null; msg = 'Задача возвращена в работу'; }
  if (typeof runRules === 'function') runRules('task.moved', t);
  save(); render(); if (msg) toast(msg, true);
}
function toggleDone(id) {
  const t = byId(id), dc = doneCol(); if (!t) return;
  if (!dc) return toast('Нет колонки «Готово» — отметьте её в настройках колонок');
  if (isDone(t)) moveTask(id, firstCol().id, null); else { const f = tasksIn(dc.id)[0]; moveTask(id, dc.id, f ? f.id : null); }
}
// единая точка создания задачи: правила + контроль ёмкости дня
function addTask(t, o = {}) {
  if (!t.col) t.col = firstCol().id;
  t.order = o.order != null ? o.order : tasksIn(t.col).length;
  D.tasks.push(t);
  if (typeof runRules === 'function' && !o.noRules) runRules('task.created', t);
  if (!o.quiet && typeof overloadCheck === 'function') setTimeout(() => overloadCheck(t), 50);
  return t;
}
function setTaskDate(t, date, time) {
  if (t.date && date && date > t.date) t.postponed = (t.postponed || 0) + 1;
  t.date = date; if (time !== undefined) t.time = time; t.snooze = null;
}
// регулярные платежи
function payRegular(r, date) {
  snapU();
  const x = newTx({ type: r.type || 'expense', amount: r.amount, date: date || today(), account: r.account || B().accounts[0].id, category: r.category, project: r.project || null, tags: [...(r.tags || [])], note: r.title, regular: r.id });
  B().tx.push(x);
  r.nextDate = stepDate(r.nextDate, r.repeat, r.day || pd(r.nextDate).getDate());
  save(); render(); toast(`Оплачено: ${r.title} — ${money(r.amount)}. Следующий платёж ${human(r.nextDate).toLowerCase()}`, true);
}
// занятия в выбранном дне (для календаря и обзора)
function regularOn(date) { const out = []; for (const r of B().regular) { if (r.active === false || !r.nextDate) continue; let d = r.nextDate, g = 0; const anchor = r.day || pd(r.nextDate).getDate(); while (d < date && g++ < 400) d = stepDate(d, r.repeat, anchor); if (d === date) out.push(r); } return out; }

// ============================================================
//  Интерфейс: модули, действия, окна, уведомления, графики
// ============================================================
const ACT = {};          // обработчики data-act со всех модулей
const MODULES = [];      // реестр модулей (расширений)
const UI = { view: 'dashboard' };
function registerModule(m) { MODULES.push(m); MODULES.sort((a, b) => (a.order || 99) - (b.order || 99)); }
const modOn = id => D.settings.modules[id] !== false;
function modal(h) { const m = $('#modal'); m.innerHTML = h; m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.innerHTML = ''; m.setAttribute('aria-hidden', 'true'); UI.form = null; UI.settab = null; destroyCharts('modal'); }
const modalOpen = () => $('#modal').classList.contains('open');
function toast(msg, u, extra) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${extra ? `<button data-act="${extra.act}" data-id="${extra.id || ''}" data-v="${extra.v || ''}">${esc(extra.label)}</button>` : ''}${u ? '<button data-act="undo">Отменить</button>' : ''}`;
  el.classList.add('show'); clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), extra ? 9000 : u ? 6000 : 2800);
}
const swatch = (sel, act, id) => `<div class="sw">${COLORS.map(c => `<button type="button" class="swb ${c === sel ? 'on' : ''}" style="--c:${c}" data-act="${act}" data-id="${id || ''}" data-v="${c}" aria-label="Цвет"></button>`).join('')}</div>`;
const tagPick = (sel, act) => `<div class="tagpick">${D.tags.map(t => `<button type="button" class="${sel.includes(t.id) ? 'on' : ''}" style="--c:${t.color}" data-act="${act}" data-v="${t.id}" aria-pressed="${sel.includes(t.id)}">${esc(t.title)}</button>`).join('')}<button type="button" data-act="tagNewInline" data-v="${act}" style="--c:var(--mute)">новый тег</button></div>`;
const tagsHtml = o => tagsOf(o).map(t => `<span class="tg" style="--c:${t.color}" data-act="openTag" data-id="${t.id}">#${esc(t.title)}</span>`).join('');
const projChip = p => p ? `<span class="ptag" style="--c:${p.color}" data-act="openProject" data-id="${p.id}"><i></i>${esc(p.title)}</span>` : '';
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// --- графики (Chart.js) ---
const CHARTS = [];
function destroyCharts(scope) { for (let i = CHARTS.length - 1; i >= 0; i--) if (!scope || CHARTS[i].scope === scope) { try { CHARTS[i].c.destroy(); } catch (e) {} CHARTS.splice(i, 1); } }
function chart(id, cfg, scope) {
  const el = document.getElementById(id); if (!el || !window.Chart) return null;
  const C = window.Chart; C.defaults.color = cssv('--mute'); C.defaults.borderColor = cssv('--line'); C.defaults.font.family = getComputedStyle(document.body).fontFamily; C.defaults.font.size = Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * .86);
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: {} }, cfg.options || {});
  cfg.options.plugins = Object.assign({ legend: { display: false }, tooltip: { backgroundColor: cssv('--card2'), titleColor: cssv('--ink'), bodyColor: cssv('--ink2'), borderColor: cssv('--line2'), borderWidth: 1, padding: 10, cornerRadius: 10, boxPadding: 4 } }, cfg.options.plugins);
  const c = new C(el, cfg); CHARTS.push({ c, scope: scope || 'main' }); return c;
}
const axisMoney = { ticks: { callback: v => NF0.format(v) } };

// ============================================================
//  Внешний вид: темы, акцент, шрифты, размер, масштаб
// ============================================================
const THEMES = [
  ['dark', 'Графит', ['#131417', '#1b1d21', '#23262b']], ['light', 'Светлая', ['#f3f4f7', '#ffffff', '#e3e6eb']],
  ['midnight', 'Полночь', ['#0c1222', '#131b30', '#19233d']], ['warm', 'Тёплая', ['#171412', '#211c19', '#2a2420']],
  ['contrast', 'Контрастная', ['#000000', '#0b0b0b', '#1e1e1e']], ['system', 'Как в Windows', ['#f3f4f7', '#ffffff', '#131417']]
];
const ACCENTS = [['#4d8dff', 'Синий'], ['#6c63ff', 'Индиго'], ['#a26bfa', 'Фиолетовый'], ['#ec4899', 'Розовый'], ['#ef4444', 'Красный'], ['#f97316', 'Оранжевый'], ['#eab308', 'Жёлтый'], ['#22c55e', 'Зелёный'], ['#14b8a6', 'Бирюзовый'], ['#0ea5e9', 'Голубой']];
const FONTS = [['System', 'Системный (Segoe UI)', '"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif'], ['Inter', 'Inter', '"Inter",system-ui,sans-serif'], ['Manrope', 'Manrope', '"Manrope",system-ui,sans-serif'], ['Onest', 'Onest', '"Onest",system-ui,sans-serif'], ['Roboto', 'Roboto', '"Roboto",system-ui,sans-serif'], ['Rubik', 'Rubik', '"Rubik",system-ui,sans-serif'], ['Montserrat', 'Montserrat', '"Montserrat",system-ui,sans-serif'], ['Nunito', 'Nunito', '"Nunito",system-ui,sans-serif'], ['PT Sans', 'PT Sans', '"PT Sans",system-ui,sans-serif'], ['IBM Plex Sans', 'IBM Plex Sans', '"IBM Plex Sans",system-ui,sans-serif'], ['JetBrains Mono', 'JetBrains Mono', '"JetBrains Mono",ui-monospace,monospace']];
const lum = hex => { const n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const sysDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
function applyAppearance() {
  const s = D.settings, root = document.documentElement;
  const th = s.theme === 'system' ? (sysDark() ? 'dark' : 'light') : s.theme;
  root.dataset.theme = th;
  root.style.setProperty('--acc', s.accent);
  root.style.setProperty('--acc-ink', lum(s.accent) > .45 ? '#111' : '#fff');
  const f = FONTS.find(x => x[0] === s.font) || FONTS[0];
  root.style.setProperty('--font', f[2]);
  root.style.fontSize = (s.fontSize || 14) + 'px';
  root.style.setProperty('--z', s.zoom || 1);
  document.body.classList.toggle('collapsed', !!s.collapsed);
  document.body.classList.toggle('mob', MOB());
  if (hasApi) { window.api.setZoom(s.zoom || 1); setTimeout(() => window.api.titlebar({ color: cssv('--bg'), symbol: cssv('--ink2') }), 30); }
  else document.body.style.zoom = s.zoom || 1;
}
