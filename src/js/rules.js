'use strict';
// ============================================================
//  Правила «Если → То», шаблоны и журнал (модуль «Автоматизация»)
// ============================================================
const TRIG = [['task.created', 'Создана задача', 'task'], ['task.done', 'Задача выполнена', 'task'], ['task.moved', 'Задача перемещена в колонку', 'task'], ['task.overdue', 'Задача просрочена (проверка раз в день)', 'task'], ['tx.created', 'Добавлена операция', 'tx']];
const FIELDS = {
  task: [['title', 'Название', 'text'], ['tags', 'Теги', 'tag'], ['project', 'Проект', 'proj'], ['prio', 'Приоритет', 'prio'], ['col', 'Колонка', 'col'], ['date', 'Дата', 'date'], ['dur', 'Длительность, мин', 'num'], ['parent', 'Родительская задача', 'par']],
  tx: [['note', 'Комментарий', 'text'], ['amount', 'Сумма', 'num'], ['type', 'Тип', 'type'], ['category', 'Категория', 'cat'], ['account', 'Счёт', 'acc'], ['project', 'Проект', 'proj'], ['tags', 'Теги', 'tag']]
};
const OPS = { text: [['contains', 'содержит'], ['notcontains', 'не содержит'], ['starts', 'начинается с'], ['eq', 'равно']], tag: [['has', 'есть тег'], ['nothas', 'нет тега']], proj: [['eq', 'равен'], ['empty', 'не задан'], ['notempty', 'задан']], prio: [['eq', 'равен'], ['gte', 'не ниже']], col: [['eq', 'равна']], date: [['empty', 'не задана'], ['notempty', 'задана'], ['today', 'сегодня'], ['past', 'в прошлом'], ['weekend', 'выпадает на выходной']], num: [['gt', 'больше'], ['lt', 'меньше'], ['eq', 'равно'], ['empty', 'не задана']], type: [['eq', 'равен']], cat: [['eq', 'равна'], ['empty', 'не задана']], acc: [['eq', 'равен']], par: [['empty', 'нет (верхний уровень)'], ['notempty', 'есть (это подзадача)']] };
const NOVAL = ['empty', 'notempty', 'today', 'past', 'weekend'];
const ACTS = { task: [['addTag', 'Добавить тег'], ['setProject', 'Назначить проект'], ['setPrio', 'Поставить приоритет'], ['moveCol', 'Переместить в колонку'], ['setDate', 'Назначить дату'], ['setRemind', 'Поставить напоминание'], ['setDur', 'Задать длительность'], ['addCheck', 'Добавить пункт чек-листа'], ['addSub', 'Создать подзадачу'], ['createTask', 'Создать задачу'], ['notify', 'Показать уведомление']], tx: [['setCategory', 'Назначить категорию'], ['addTag', 'Добавить тег'], ['setProject', 'Назначить проект'], ['createTask', 'Создать задачу'], ['notify', 'Показать уведомление']] };
const PRESETS = [
  { name: 'Звонки — короткие и с напоминанием', trigger: 'task.created', cond: [{ f: 'title', op: 'starts', v: 'позвонить' }], act: [{ t: 'setDur', v: '15' }, { t: 'setRemind', v: '15' }] },
  { name: 'Встречи — чек-лист подготовки', trigger: 'task.created', cond: [{ f: 'title', op: 'contains', v: 'встреча' }], act: [{ t: 'addCheck', v: 'Подготовить повестку' }, { t: 'addCheck', v: 'Записать итоги' }] },
  { name: 'Выходные — тег «дом»', trigger: 'task.created', cond: [{ f: 'date', op: 'weekend', v: '' }], act: [{ t: 'addTag', v: 'дом' }] },
  { name: 'Аптека — тег «здоровье»', trigger: 'tx.created', cond: [{ f: 'note', op: 'contains', v: 'аптек' }], act: [{ t: 'addTag', v: 'здоровье' }] },
  { name: 'Просрочено — поднять приоритет', trigger: 'task.overdue', cond: [{ f: 'prio', op: 'eq', v: '0' }], act: [{ t: 'setPrio', v: '1' }] },
  { name: 'Работа без даты — на завтра', trigger: 'task.created', cond: [{ f: 'tags', op: 'has', v: 'работа' }, { f: 'date', op: 'empty', v: '' }], act: [{ t: 'setDate', v: '1' }] }
];
const kindOf = trig => (TRIG.find(t => t[0] === trig) || [, , 'task'])[2];
const fieldDef = (kind, f) => FIELDS[kind].find(x => x[0] === f) || FIELDS[kind][0];
const subst = (s, o) => String(s || '').replace(/\{название\}/g, o.title || o.note || '').replace(/\{заметка\}/g, o.note || o.title || '').replace(/\{сумма\}/g, o.amount != null ? money(o.amount) : '').replace(/\{проект\}/g, (projOf(o.project) || {}).title || '').replace(/\{дата\}/g, o.date ? human(o.date).toLowerCase() : '');
const tagIdByName = n => { n = String(n || '').replace(/^#/, '').toLowerCase().trim(); if (!n) return null; let t = D.tags.find(x => x.title === n); if (!t) { t = { id: uid(), title: n, color: COLORS[D.tags.length % COLORS.length] }; D.tags.push(t); } return t.id; };

function evalCond(o, c, kind) {
  const v = o[c.f], cv = String(c.v ?? '').toLowerCase(), td = today();
  switch (c.op) {
    case 'contains': return String(v || '').toLowerCase().includes(cv);
    case 'notcontains': return !String(v || '').toLowerCase().includes(cv);
    case 'starts': return String(v || '').toLowerCase().startsWith(cv);
    case 'eq': return String(v ?? '') === String(c.v ?? '') || (typeof v === 'string' && v.toLowerCase() === cv);
    case 'gte': return (+v || 0) >= +c.v;
    case 'gt': return (+v || 0) > +c.v;
    case 'lt': return (+v || 0) < +c.v;
    case 'empty': return v == null || v === '' || (Array.isArray(v) && !v.length);
    case 'notempty': return !(v == null || v === '' || (Array.isArray(v) && !v.length));
    case 'today': return v === td;
    case 'past': return !!v && v < td;
    case 'weekend': return !!v && [0, 6].includes(pd(v).getDay());
    case 'has': { const t = D.tags.find(x => x.title === cv.replace(/^#/, '')); return !!t && (v || []).includes(t.id); }
    case 'nothas': { const t = D.tags.find(x => x.title === cv.replace(/^#/, '')); return !t || !(v || []).includes(t.id); }
  }
  return false;
}
let RULE_DEPTH = 0;
function runRules(trigger, o) {
  if (!D || !SM().rules || RULE_DEPTH > 0 || !o) return [];
  const kind = kindOf(trigger), fired = [];
  RULE_DEPTH++;
  try {
    for (const r of D.rules) {
      if (!r.on || r.trigger !== trigger) continue;
      if (!(r.cond || []).every(c => evalCond(o, c, kind))) continue;
      for (const a of r.act || []) applyAction(a, o, kind, r);
      fired.push(r); D.ruleLog.push({ ts: Date.now(), rule: r.id, name: r.name, obj: o.title || o.note || money(o.amount || 0), kind });
    }
  } finally { RULE_DEPTH--; }
  if (D.ruleLog.length > 120) D.ruleLog = D.ruleLog.slice(-100);
  return fired;
}
function applyAction(a, o, kind, r) {
  const v = a.v;
  switch (a.t) {
    case 'addTag': { const id = tagIdByName(v); if (id) { o.tags = o.tags || []; if (!o.tags.includes(id)) o.tags.push(id); } break; }
    case 'setProject': if (projOf(v)) o.project = v; break;
    case 'setPrio': o.prio = +v; break;
    case 'moveCol': if (kind === 'task' && colOf(v)) { const was = isDone(o); o.col = v; o.order = tasksIn(v).length; if (!was && isDone(o)) onComplete(o); } break;
    case 'setDate': if (kind === 'task') { o.date = addDays(today(), +v || 0); } break;
    case 'setRemind': if (kind === 'task') { o.remind = +v; if (!o.date) o.date = today(); } break;
    case 'setDur': if (kind === 'task') o.dur = +v || null; break;
    case 'addCheck': if (kind === 'task' && v) { o.checklist = o.checklist || []; if (!o.checklist.some(c => c.t === v)) o.checklist.push({ t: subst(v, o), d: false }); } break;
    case 'addSub': if (kind === 'task' && v) addTask(newTask({ title: subst(v, o), parent: o.id, project: o.project, col: firstCol().id, date: o.date }), { noRules: true, quiet: true }); break;
    case 'createTask': addTask(newTask({ title: subst(v, o) || 'Новая задача', project: o.project || null, col: firstCol().id, date: today(), tags: [...(o.tags || [])] }), { noRules: true, quiet: true }); break;
    case 'setCategory': if (kind === 'tx' && catOf(v)) o.category = v; break;
    case 'notify': ruleAlert(subst(v, o) || r.name, r.name); break;
  }
}
function ruleAlert(text, rule) {
  const el = document.createElement('div'); el.className = 'al rule';
  el.innerHTML = `<div class="ah">${ic('bolt')} Правило: ${esc(rule)}<button class="ib sm" data-act="alClose" aria-label="Закрыть">${ic('x')}</button></div><b>${esc(text)}</b>`;
  $('#alerts').appendChild(el); setTimeout(() => el.remove(), 9000);
}
function dailyRules() {
  if (D.lastDayRun === today()) return;
  D.lastDayRun = today(); const td = today();
  live().filter(t => !isDone(t) && t.date && t.date < td).forEach(t => runRules('task.overdue', t));
  save();
}
const valLabel = (type, v) => {
  if (type === 'proj') return (projOf(v) || { title: '?' }).title; if (type === 'col') return (colOf(v) || { title: '?' }).title; if (type === 'cat') return (catOf(v) || { title: '?' }).title;
  if (type === 'acc') return (accOf(v) || { title: '?' }).title; if (type === 'prio') return PRIO[+v] ? PRIO[+v][0].toLowerCase() : v; if (type === 'type') return { expense: 'расход', income: 'доход', transfer: 'перевод' }[v] || v; if (type === 'tag') return '#' + v; return '«' + v + '»';
};
const actLabel = a => {
  const map = { addTag: () => `добавить тег #${a.v}`, setProject: () => `проект «${(projOf(a.v) || { title: '?' }).title}»`, setPrio: () => `приоритет «${(PRIO[+a.v] || ['?'])[0].toLowerCase()}»`, moveCol: () => `в колонку «${(colOf(a.v) || { title: '?' }).title}»`, setDate: () => `дата: ${['сегодня', 'завтра', 'послезавтра'][+a.v] || 'через ' + a.v + ' ' + plural(+a.v, PD)}`, setRemind: () => `напомнить за ${(+a.v ? durTxt(+a.v) : 'момент начала')}`, setDur: () => `длительность ${durTxt(+a.v || 0)}`, addCheck: () => `пункт «${a.v}»`, addSub: () => `подзадача «${a.v}»`, createTask: () => `создать задачу «${a.v}»`, setCategory: () => `категория «${(catOf(a.v) || { title: '?' }).title}»`, notify: () => `уведомить «${a.v}»` };
  return (map[a.t] || (() => a.t))();
};
function ruleText(r) {
  const k = kindOf(r.trigger), t = (TRIG.find(x => x[0] === r.trigger) || ['', ''])[1].toLowerCase();
  const c = (r.cond || []).map(c => { const f = fieldDef(k, c.f); return `${f[1].toLowerCase()} ${(OPS[f[2]].find(o => o[0] === c.op) || ['', c.op])[1]}${NOVAL.includes(c.op) ? '' : ' ' + valLabel(f[2], c.v)}`; });
  return `<b>Если</b> ${t}${c.length ? ' и ' + c.join(' и ') : ''} <b>→ то</b> ${(r.act || []).map(actLabel).join(', ') || '…'}`;
}

// ---------- редактор правила ----------
function valControl(type, v, attr) {
  const sel = (list) => `<select class="in" ${attr}>${list.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (type === 'proj') return sel(D.projects.map(p => [p.id, p.title]));
  if (type === 'col') return sel(D.columns.map(c => [c.id, c.title]));
  if (type === 'cat') return sel(B().categories.map(c => [c.id, (c.type === 'income' ? '↑ ' : '') + c.title]));
  if (type === 'acc') return sel(B().accounts.map(a => [a.id, a.title]));
  if (type === 'prio') return sel(PRIO.map((p, i) => [i, p[0]]));
  if (type === 'type') return sel([['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']]);
  if (type === 'tag') return `<input class="in" ${attr} value="${esc(v || '')}" placeholder="название тега" list="dl-tags">`;
  return `<input class="in" ${attr} value="${esc(v || '')}" ${type === 'num' ? 'inputmode="decimal"' : ''}>`;
}
const actType = t => ({ addTag: 'tag', setProject: 'proj', setPrio: 'prio', moveCol: 'col', setCategory: 'cat', setDate: 'reld', setRemind: 'rem', setDur: 'dur' }[t] || 'text');
function actControl(a, i) {
  const ty = actType(a.t), at = `data-av="${i}"`;
  if (ty === 'reld') return `<select class="in" ${at}>${[[0, 'Сегодня'], [1, 'Завтра'], [2, 'Послезавтра'], [7, 'Через неделю']].map(([k, l]) => `<option value="${k}" ${String(k) === String(a.v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  if (ty === 'rem') return `<select class="in" ${at}>${REM.filter(r => r[0] !== null).map(([k, l]) => `<option value="${k}" ${String(k) === String(a.v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  if (ty === 'dur') return `<select class="in" ${at}>${DURS.map(k => `<option value="${k}" ${String(k) === String(a.v) ? 'selected' : ''}>${durTxt(k)}</option>`).join('')}</select>`;
  return valControl(ty, a.v, at) + (['createTask', 'notify', 'addSub', 'addCheck'].includes(a.t) ? '' : '');
}
function openRuleForm(id, preset) {
  const src = id ? D.rules.find(r => r.id === id) : null;
  UI.form = { kind: 'rule', isNew: !src, r: src ? clone(src) : { id: uid(), name: '', on: true, trigger: 'task.created', cond: [{ f: 'title', op: 'contains', v: '' }], act: [{ t: 'addTag', v: '' }], ...(preset ? clone(preset) : {}) } };
  drawRuleForm();
}
function drawRuleForm() {
  const r = UI.form.r, k = kindOf(r.trigger);
  modal(`<div class="mbox"><div class="mh"><h2>${UI.form.isNew ? 'Новое правило' : 'Правило'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="ruleform" autocomplete="off">
    <label class="f"><span>Название правила</span><input class="in" id="rl-name" value="${esc(r.name)}" placeholder="Например: «Покупки — с тегом»" maxlength="60"></label>
    <label class="f"><span>Когда</span><select class="in" id="rl-trig">${TRIG.map(([v, l]) => `<option value="${v}" ${r.trigger === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="f"><span>Если выполнены все условия</span>${r.cond.map((c, i) => { const f = fieldDef(k, c.f), ops = OPS[f[2]]; return `<div class="rrow"><select class="in" data-cf="${i}">${FIELDS[k].map(([v, l]) => `<option value="${v}" ${c.f === v ? 'selected' : ''}>${l}</option>`).join('')}</select><select class="in" data-co="${i}">${ops.map(([v, l]) => `<option value="${v}" ${c.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${NOVAL.includes(c.op) ? '<span></span>' : valControl(f[2], c.v, `data-cv="${i}"`)}<button type="button" class="ib" data-act="rlDelC" data-i="${i}" aria-label="Удалить условие">${ic('x')}</button></div>`; }).join('') || '<p class="hint">Без условий правило срабатывает всегда</p>'}<div><button type="button" class="btn sm ghost" data-act="rlAddC">${ic('plus')} Условие</button></div></div>
    <div class="f"><span>То сделать</span>${r.act.map((a, i) => `<div class="rrow two"><select class="in" data-at="${i}">${ACTS[k].map(([v, l]) => `<option value="${v}" ${a.t === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${actControl(a, i)}<button type="button" class="ib" data-act="rlDelA" data-i="${i}" aria-label="Удалить действие">${ic('x')}</button></div>`).join('')}<div><button type="button" class="btn sm ghost" data-act="rlAddA">${ic('plus')} Действие</button></div>
      <p class="hint">В тексте можно использовать подстановки: {название}, {заметка}, {сумма}, {проект}, {дата}. Новый тег создаётся сам.</p></div>
    <div class="rsum" id="rl-sum">${ruleText(r)}</div>
    <datalist id="dl-tags">${D.tags.map(t => `<option value="${esc(t.title)}">`).join('')}</datalist>
  </form>
  <div class="mf">${UI.form.isNew ? '' : `<button class="btn ghost danger" data-act="rlDel">${ic('trash')} Удалить</button>`}<label class="hint" style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" class="tog" id="rl-on" ${r.on ? 'checked' : ''}> Включено</label><span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="rlSave">Сохранить</button></div></div>`);
}
function readRule() {
  const r = UI.form.r; r.name = $('#rl-name').value.trim(); r.on = $('#rl-on').checked;
  $$('[data-cv]').forEach(e => r.cond[+e.dataset.cv].v = e.value.trim()); $$('[data-av]').forEach(e => r.act[+e.dataset.av].v = e.value.trim());
  return r;
}

// ---------- шаблоны ----------
function openTplForm(id, kind) {
  const src = id ? D.templates.find(t => t.id === id) : null;
  const t = src ? clone(src) : { id: uid(), kind: kind || 'task', name: '', ctx: '', data: kind === 'project' ? { title: '', color: COLORS[0], tasks: [] } : kind === 'expense' ? { amount: 0, category: (B().categories.find(c => c.type === 'expense') || {}).id, note: '' } : { title: '', tags: [], dur: null, prio: 0, checklist: [] } };
  UI.form = { kind: 'tpl', isNew: !src, t };
  const d = t.data, ctxOpts = [['', 'Везде']].concat(D.tags.map(x => ['tag:' + x.id, 'Доска с тегом #' + x.title])).concat(D.projects.map(p => ['proj:' + p.id, 'Проект «' + p.title + '»'])).concat(D.folders.map(f => ['folder:' + f.id, 'Папка «' + f.title + '»'])).concat([['view:budget', 'Раздел «Бюджет»'], ['view:calendar', 'Раздел «Календарь»']]);
  modal(`<div class="mbox narrow"><div class="mh"><h2>${src ? 'Шаблон' : 'Новый шаблон'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="tplform" autocomplete="off">
    <div class="row two"><label class="f"><span>Название шаблона</span><input class="in" id="tp-name" value="${esc(t.name)}" maxlength="40"></label>
    <label class="f"><span>Подсказывать в контексте</span><select class="in" id="tp-ctx">${ctxOpts.map(([v, l]) => `<option value="${v}" ${t.ctx === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
    ${t.kind === 'task' ? `<label class="f"><span>Название задачи</span><input class="in" id="tp-title" value="${esc(d.title)}" placeholder="Можно с подстановками: {дата}, {неделя}, {месяц}, {проект}"></label>
      <div class="row"><label class="f"><span>Длительность</span><select class="in" id="tp-dur"><option value="">—</option>${DURS.map(v => `<option value="${v}" ${d.dur === v ? 'selected' : ''}>${durTxt(v)}</option>`).join('')}</select></label><label class="f"><span>Приоритет</span><select class="in" id="tp-prio">${PRIO.map((p, i) => `<option value="${i}" ${d.prio === i ? 'selected' : ''}>${p[0]}</option>`).join('')}</select></label><label class="f"><span>Теги</span><input class="in" id="tp-tags" value="${esc(tagIdsAny(d.tags).map(x => tagOf(x).title).join(', '))}" placeholder="через запятую"></label></div>
      <label class="f"><span>Чек-лист — по пункту на строку</span><textarea class="in" id="tp-cl" rows="4">${esc((d.checklist || []).join('\n'))}</textarea></label>`
    : t.kind === 'project' ? `<div class="row two"><label class="f"><span>Название проекта</span><input class="in" id="tp-title" value="${esc(d.title)}"></label><div class="f"><span>Цвет</span>${swatch(d.color, 'tpColor')}</div></div>
      <label class="f"><span>Задачи — «название | через сколько дней от старта»</span><textarea class="in" id="tp-tasks" rows="7">${esc((d.tasks || []).map(([a, b]) => a + (b != null ? ' | ' + b : '')).join('\n'))}</textarea></label>`
    : `<div class="row two"><label class="f"><span>Сумма, ${esc(cur())}</span><input class="in" id="tp-amount" value="${d.amount || ''}" inputmode="decimal"></label><label class="f"><span>Категория</span><select class="in" id="tp-cat">${B().categories.filter(c => c.type === 'expense').map(c => `<option value="${c.id}" ${c.id === d.category ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label></div>
      <label class="f"><span>Комментарий</span><input class="in" id="tp-note" value="${esc(d.note || '')}"></label>`}
  </form>
  <div class="mf">${src ? `<button class="btn ghost danger" data-act="tpDel">${ic('trash')} Удалить</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="tpSave">Сохранить</button></div></div>`);
}

// ---------- модуль ----------
const AF = { tab: 'rules' };
registerModule({
  id: 'auto', order: 7, title: 'Автоматизация', icon: 'bolt', desc: 'Правила «Если → То», шаблоны задач, проектов и расходов, журнал срабатываний',
  badge: () => { const n = D.rules.filter(r => r.on).length; return n ? { v: n, soft: true } : ''; },
  bar() {
    return `<h1>Автоматизация</h1><div class="subtabs">${[['rules', 'Правила'], ['tpl', 'Шаблоны'], ['log', 'Журнал']].map(([k, l]) => `<button class="${AF.tab === k ? 'on' : ''}" data-act="aftab" data-v="${k}">${l}</button>`).join('')}</div><span class="spacer"></span>
      ${AF.tab === 'rules' ? `<button class="btn pri" data-act="rlNew">${ic('plus')} Правило</button>` : AF.tab === 'tpl' ? `<button class="btn" data-act="tpNew" data-v="expense">${ic('plus')} Расход</button><button class="btn" data-act="tpNew" data-v="project">${ic('plus')} Проект</button><button class="btn pri" data-act="tpNew" data-v="task">${ic('plus')} Задача</button>` : ''}`;
  },
  render() {
    const cnt = id => D.ruleLog.filter(l => l.rule === id).length;
    if (AF.tab === 'rules') return `<div class="scroll"><p class="hint" style="margin:0 0 1rem;max-width:70ch">Правило срабатывает само, когда происходит событие и выполнены условия. Например: если в названии задачи есть «купить» — добавить тег #покупки. Правила не запускают друг друга по цепочке.</p>
      <div class="rlist">${D.rules.map(r => `<div class="rcard ${r.on ? '' : 'off'}"><input type="checkbox" class="tog" data-rule="${r.id}" ${r.on ? 'checked' : ''} aria-label="Включить правило"><div class="tx" data-act="rlOpen" data-id="${r.id}"><b>${esc(r.name || 'Без названия')}</b><span>${ruleText(r)}</span></div><small>${cnt(r.id) ? 'сработало ' + cnt(r.id) + ' раз' : 'ещё не срабатывало'}</small><button class="ib" data-act="rlOpen" data-id="${r.id}" aria-label="Изменить">${ic('more')}</button></div>`).join('') || '<div class="empty">Правил пока нет</div>'}</div>
      <h3 style="margin:1.4rem 0 .6rem">Готовые примеры</h3><div class="pgrid">${PRESETS.filter(p => !D.rules.some(r => r.name === p.name)).map((p, i) => `<button class="pan preset" data-act="rlPreset" data-i="${PRESETS.indexOf(p)}"><b>${esc(p.name)}</b><span class="hint">${ruleText(p).replace(/<\/?b>/g, '')}</span><span class="lnk">${ic('plus')} Добавить</span></button>`).join('') || '<p class="hint">Все примеры уже добавлены</p>'}</div></div>`;
    if (AF.tab === 'tpl') {
      const grp = (kind, title) => { const L = D.templates.filter(t => t.kind === kind); return `<section class="pan"><div class="ph2"><h2>${title}</h2><small>${L.length}</small></div>${L.map(t => `<div class="lrow" data-act="tpOpen" data-id="${t.id}" style="--c:var(--acc)"><span class="dot"></span><div class="tx"><b>${esc(t.name)}</b><small>${kind === 'task' ? esc(t.data.title) + (t.data.checklist && t.data.checklist.length ? ` · ${t.data.checklist.length} пунктов` : '') : kind === 'project' ? `${t.data.tasks.length} задач с датами` : money(t.data.amount) + ' · ' + esc((catOf(t.data.category) || { title: '' }).title)}${t.ctx ? ' · ' + esc(ctxLabel(t.ctx)) : ''}</small></div><button class="btn sm" data-act="tpUse" data-id="${t.id}">Применить</button></div>`).join('') || '<div class="empty">Нет шаблонов</div>'}</section>`; };
      return `<div class="scroll"><p class="hint" style="margin:0 0 1rem;max-width:75ch">Шаблоны подсказываются в быстром вводе (<kbd>Q</kbd>) и в новой задаче. Сначала показываются те, что подходят к текущему разделу: проекту, папке или тегу на доске. В названиях работают автоподстановки {дата}, {неделя}, {месяц}, {проект}.</p><div class="grid3" style="grid-template-columns:repeat(3,minmax(0,1fr))">${grp('task', 'Задачи')}${grp('project', 'Проекты')}${grp('expense', 'Расходы')}</div></div>`;
    }
    const L = [...D.ruleLog].reverse();
    return `<div class="scroll"><section class="pan"><div class="ph2"><h2>Журнал срабатываний</h2><small>последние ${L.length}</small><span class="spacer"></span>${L.length ? '<button class="btn sm ghost" data-act="logClear">Очистить</button>' : ''}</div>${L.map(l => `<div class="lrow" style="--c:var(--acc)"><span class="dot"></span><div class="tx"><b>${esc(l.name)}</b><small>${fmtTs(l.ts)} · ${l.kind === 'tx' ? 'операция' : 'задача'} «${esc(l.obj)}»</small></div></div>`).join('') || '<div class="empty">Правила ещё не срабатывали</div>'}</section></div>`;
  }
});
const ctxLabel = c => { const [k, id] = c.split(':'); if (k === 'tag') return '#' + ((tagOf(id) || {}).title || '?'); if (k === 'proj') return 'проект «' + ((projOf(id) || {}).title || '?') + '»'; if (k === 'folder') return 'папка «' + ((folderOf(id) || {}).title || '?') + '»'; if (k === 'view') return { budget: 'бюджет', calendar: 'календарь' }[id] || id; return c; };
Object.assign(ACT, {
  aftab: b => { AF.tab = b.dataset.v; render(); },
  rlNew: () => openRuleForm(null), rlOpen: b => openRuleForm(b.dataset.id),
  rlPreset: b => { const p = PRESETS[+b.dataset.i]; snapU(); D.rules.push({ id: uid(), on: true, ...clone(p) }); save(); render(); toast(`Правило «${p.name}» добавлено`, true); },
  rlAddC: () => { readRule(); const k = kindOf(UI.form.r.trigger); UI.form.r.cond.push({ f: FIELDS[k][0][0], op: OPS[FIELDS[k][0][2]][0][0], v: '' }); drawRuleForm(); },
  rlDelC: b => { readRule(); UI.form.r.cond.splice(+b.dataset.i, 1); drawRuleForm(); },
  rlAddA: () => { readRule(); const k = kindOf(UI.form.r.trigger); UI.form.r.act.push({ t: ACTS[k][0][0], v: '' }); drawRuleForm(); },
  rlDelA: b => { readRule(); UI.form.r.act.splice(+b.dataset.i, 1); drawRuleForm(); },
  rlSave: () => { const r = readRule(); if (!r.name) r.name = 'Правило ' + (D.rules.length + 1); if (!r.act.length) return toast('Добавьте хотя бы одно действие'); if (r.act.some(a => a.v === '' && !['setDate'].includes(a.t))) return toast('Заполните значения действий'); snapU(); if (UI.form.isNew) D.rules.push(r); else Object.assign(D.rules.find(x => x.id === r.id), r); save(); closeModal(); AF.tab = 'rules'; if (UI.view === 'auto') render(); toast('Правило сохранено', true); },
  rlDel: () => { snapU(); D.rules = D.rules.filter(x => x.id !== UI.form.r.id); save(); closeModal(); render(); toast('Правило удалено', true); },
  logClear: () => { D.ruleLog = []; save(); render(); },
  tpNew: b => openTplForm(null, b.dataset.v), tpOpen: b => openTplForm(b.dataset.id),
  tpColor: b => { UI.form.t.data.color = b.dataset.v; $$('#tplform .swb').forEach(s => s.classList.toggle('on', s === b)); },
  tpSave: () => {
    const t = UI.form.t, d = t.data; t.name = $('#tp-name').value.trim(); t.ctx = $('#tp-ctx').value;
    if (t.kind === 'task') { d.title = $('#tp-title').value.trim(); d.dur = +$('#tp-dur').value || null; d.prio = +$('#tp-prio').value; d.tags = $('#tp-tags').value.split(',').map(x => tagIdByName(x)).filter(Boolean); d.checklist = $('#tp-cl').value.split('\n').map(x => x.trim()).filter(Boolean); if (!t.name) t.name = d.title.slice(0, 40); if (!d.title) return toast('Введите название задачи'); }
    else if (t.kind === 'project') { d.title = $('#tp-title').value.trim(); d.tasks = $('#tp-tasks').value.split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [a, b] = x.split('|').map(s => s.trim()); return [a, b !== undefined && b !== '' && isFinite(+b) ? +b : null]; }); if (!t.name) t.name = d.title.slice(0, 40); if (!d.title) return toast('Введите название проекта'); }
    else { d.amount = parseMoney($('#tp-amount').value); d.category = $('#tp-cat').value; d.note = $('#tp-note').value.trim(); if (!t.name) t.name = d.note || 'Расход'; if (!(d.amount > 0)) return toast('Введите сумму'); }
    snapU(); if (UI.form.isNew) D.templates.push(t); else Object.assign(D.templates.find(x => x.id === t.id), t); save(); closeModal(); render(); toast('Шаблон сохранён', true);
  },
  tpDel: () => { snapU(); D.templates = D.templates.filter(x => x.id !== UI.form.t.id); save(); closeModal(); render(); toast('Шаблон удалён', true); },
  tpUse: b => { const tpl = D.templates.find(t => t.id === b.dataset.id); if (!tpl) return; if (tpl.kind === 'expense') return ACT.tplExp(b); QK.base = taskPreset(); sugApply({ type: 'tpl', id: tpl.id }); }
});
