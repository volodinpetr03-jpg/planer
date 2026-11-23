'use strict';
// ============================================================
//  CRM, этап 2. Сделки и воронка: доска этапов, карточка сделки, следующий шаг (задача с датой),
//  «Выиграна» → доход в Бюджет / регулярный доход / проект, «Проиграна» → причина. Несколько воронок.
// ============================================================
ICONS.deal = '<path d="M3.5 7.5h17v11h-17z"/><path d="M8 7.5V5.5h8v2M12 11v4M10 13h4"/>';
const DEF_PIPE = () => ({ id: 'sales', name: 'Продажи', stages: [
  { id: 'new', name: 'Новая заявка', color: '#868b94', prob: 10 },
  { id: 'talk', name: 'Переговоры', color: '#4d8dff', prob: 30 },
  { id: 'offer', name: 'КП отправлено', color: '#a26bfa', prob: 50 },
  { id: 'contract', name: 'Договор', color: '#f2b441', prob: 80 },
  { id: 'won', name: 'Успешно', color: '#3ecf8e', prob: 100, kind: 'won' },
  { id: 'lost', name: 'Проиграна', color: '#ff6b5e', prob: 0, kind: 'lost' }] });
const LOST_WHY = ['Дорого', 'Выбрали другого', 'Неактуально', 'Нет ответа', 'Не подошли условия'];
const DSRC = ['Сайт', 'Звонок', 'Рекомендация', 'Повторный клиент', 'Выставка', 'Соцсети', 'Тендер'];
const CRD = { pipe: 'sales', drag: null, att: false, stage: null };
const CRM = () => { if (!D.crm || typeof D.crm !== 'object') D.crm = {}; if (!Array.isArray(D.crm.pipes) || !D.crm.pipes.length) D.crm.pipes = [DEF_PIPE()]; if (!Array.isArray(D.crm.deals)) D.crm.deals = []; return D.crm; };
const DL = () => CRM().deals;
const dealOf = id => DL().find(x => x.id === id);
const pipeOf = id => CRM().pipes.find(p => p.id === id) || CRM().pipes[0];
const curPipe = () => pipeOf(CRD.pipe);
const stageOf = x => { const p = pipeOf(x.pipe); return p.stages.find(s => s.id === x.stage) || p.stages[0]; };
const openStages = p => p.stages.filter(s => !s.kind);
const wonStage = p => p.stages.find(s => s.kind === 'won');
const lostStage = p => p.stages.find(s => s.kind === 'lost');
const dealClosed = x => !!stageOf(x).kind;
const dealProb = x => x.prob != null && x.prob !== '' ? +x.prob : stageOf(x).prob || 0;
const dealAmt = x => x.amount ? money0(x.amount) + (x.period === 'month' ? ' / мес' : '') : 'сумма не указана';
const dealSub = x => [stageOf(x).name, x.amount ? dealAmt(x) : ''].filter(Boolean).join(' · ');
const newDeal = o => ({ id: uid(), pipe: CRD.pipe, stage: openStages(curPipe())[0].id, title: '', amount: null, period: 'once', contact: null, due: null, prob: null, src: '', note: '', log: [], links: [], created: Date.now(), upd: Date.now(), closedAt: null, order: Date.now(), ...o });
const dealRef = x => ({ k: 'deal', id: x.id });
const dealTasks = x => live().filter(t => (t.links || []).some(l => l.k === 'deal' && l.id === x.id));
const dealNext = x => dealTasks(x).filter(t => !isDone(t) && t.date).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0] || null;
// сделке нужно внимание: нет следующего шага или он просрочен
const dealAtt = x => { if (dealClosed(x)) return false; const n = dealNext(x); return !n || n.date < today(); };
const dealsOfContact = c => DL().filter(x => x.contact === c.id || (c.kind === 'org' && crmPeople(c.id).some(p => p.id === x.contact)));
const monthEnd = () => { const t = today(); return t.slice(0, 7) + '-' + String(mDays(t.slice(0, 7))).padStart(2, '0'); };
function dealCardHtml(x) {
  const c = crmOf(x.contact), n = dealNext(x), cl = dealClosed(x);
  const step = cl ? (x.closedAt ? (stageOf(x).kind === 'won' ? 'выиграна ' : 'проиграна ') + fmtTs(x.closedAt).replace(/ \d{4},.*/, '') : '') : n ? (n.date < today() ? `<em class="over">шаг просрочен · ${esc(human(n.date).toLowerCase())}</em>` : `<em class="${n.date === today() ? 'now' : ''}">${esc(human(n.date))}</em>`) : '<em class="over">нет следующего шага</em>';
  return `<button class="dcard ${cl ? 'cl' : ''}" draggable="${cl ? 'false' : 'true'}" data-deal="${x.id}" data-act="dealOpen" data-id="${x.id}">
    <b>${esc(x.title || 'Без названия')}</b>${c ? `<small>${esc(c.name)}${c.org && crmOf(c.org) ? ' · ' + esc(crmOf(c.org).name) : ''}</small>` : ''}
    <span class="drow"><strong>${x.amount ? dealAmt(x) : '—'}</strong>${step}</span></button>`;
}
// ---------- доска ----------
function dealsBoard() {
  const p = curPipe(), all = DL().filter(x => x.pipe === p.id), open = all.filter(x => !dealClosed(x)), wonS = wonStage(p), lostS = lostStage(p);
  const m0 = today().slice(0, 7), sum = L => L.reduce((a, x) => a + (+x.amount || 0), 0);
  const fc = open.filter(x => x.due && x.due <= monthEnd()).reduce((a, x) => a + (+x.amount || 0) * dealProb(x) / 100, 0);
  const won = all.filter(x => wonS && x.stage === wonS.id && x.closedAt && fmtYm(x.closedAt) === m0), att = open.filter(dealAtt);
  const kpis = `<div class="gridk dk">
    <div class="kpi"><span>${ic('deal')} В работе</span><b>${money0(sum(open))}</b><small>${open.length} ${plural(open.length, ['сделка', 'сделки', 'сделок'])}</small></div>
    <div class="kpi" style="--c:var(--acc)"><span>${ic('cal')} Прогноз на ${MN[+m0.slice(5) - 1].toLowerCase()}</span><b>${money0(fc)}</b><small>сделки со сроком в этом месяце × вероятность</small></div>
    <div class="kpi"><span>${ic('check')} Выиграно в ${MN[+m0.slice(5) - 1].toLowerCase().replace(/ь$/, 'е').replace(/й$/, 'е').replace(/т$/, 'те')}</span><b style="color:var(--ok)">${money0(sum(won))}</b><small>${won.length} ${plural(won.length, ['сделка', 'сделки', 'сделок'])}</small></div>
    <div class="kpi ${att.length ? 'katt' : ''}" data-act="dealAtt"><span>${ic('clock')} Требуют внимания</span><b style="${att.length ? 'color:var(--hi)' : ''}">${att.length}</b><small>${CRD.att ? 'показаны только они — нажмите ещё раз' : att.length ? 'нет следующего шага или он просрочен' : 'у всех сделок есть шаг'}</small></div></div>`;
  const vis = x => !CRD.att || dealAtt(x);
  const cols = [...openStages(p), ...(wonS ? [wonS] : [])].map(s => {
    let L = all.filter(x => x.stage === s.id && vis(x));
    if (s.kind === 'won') L = L.filter(x => !x.closedAt || Date.now() - x.closedAt < 30 * 864e5);
    L.sort((a, b) => (a.order || 0) - (b.order || 0));
    return `<section class="dcol" data-dstage="${s.id}" style="--c:${s.color}" aria-label="${esc(s.name)}">
      <div class="dch"><i></i><b>${esc(s.name)}</b><small>${L.length}</small><span class="spacer"></span><small>${s.kind ? '30 дней' : s.prob + '%'}</small></div>
      <div class="dcs">${money0(sum(L))}</div>
      ${L.map(dealCardHtml).join('')}
      ${s.kind ? '' : `<button class="dadd" data-act="dealNew" data-v="${s.id}">${ic('plus')} Сделка</button>`}</section>`;
  });
  const lostN = lostS ? all.filter(x => x.stage === lostS.id).length : 0;
  if (MOB()) {
    const S = [...openStages(p), ...(wonS ? [wonS] : [])]; if (!CRD.stage || !S.some(s => s.id === CRD.stage)) CRD.stage = S[0].id;
    const st = S.find(s => s.id === CRD.stage), L = all.filter(x => x.stage === st.id && vis(x) && (!st.kind || !x.closedAt || Date.now() - x.closedAt < 30 * 864e5)).sort((a, b) => (a.order || 0) - (b.order || 0));
    return `${kpis}<div class="chips dstabs">${S.map(s => `<button class="chip ${s.id === CRD.stage ? 'on' : ''}" data-act="dealStageTab" data-v="${s.id}" style="--c:${s.color}"><i class="dot"></i>${esc(s.name)} · ${all.filter(x => x.stage === s.id && vis(x)).length}</button>`).join('')}</div>
      <div class="dlistm">${L.map(dealCardHtml).join('') || '<div class="empty">На этом этапе сделок нет</div>'}${st.kind ? '' : `<button class="dadd" data-act="dealNew" data-v="${st.id}">${ic('plus')} Сделка</button>`}</div>
      ${lostN ? `<button class="btn ghost sm" data-act="dealLostList">Проигранные · ${lostN}</button>` : ''}`;
  }
  return `${kpis}<div class="dboard">${cols.join('')}</div>${lostN ? `<div class="dfoot"><button class="btn ghost sm" data-act="dealLostList">Проигранные · ${lostN}</button></div>` : ''}`;
}
const fmtYm = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
// ---------- карточка сделки ----------
function dealForm(id, preset) {
  const src = id ? dealOf(id) : null, x = src ? clone(src) : newDeal(preset || {});
  UI.form = { kind: 'deal', isNew: !src, d: x, stage0: x.stage };
  drawDealForm();
  if (!src) setTimeout(() => { const i = $('#dl-title'); if (i) i.focus(); }, 30);
}
function drawDealForm() {
  const F = UI.form, x = F.d, p = pipeOf(x.pipe), st = stageOf(x), cl = !!st.kind;
  const people = CR().filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const tasks = F.isNew ? [] : dealTasks(x), open = tasks.filter(t => !isDone(t)).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')), n = F.isNew ? null : dealNext(x);
  const log = (x.log || []).slice().sort((a, b) => b.at - a.at);
  const LK = { ...LOGK, stage: ['Этап', 'deal', 'var(--mid)'] };
  modal(`<div class="mbox wide dealbox"><div class="mh"><input class="in dtitle" id="dl-title" value="${esc(x.title)}" placeholder="Название сделки, например «Обслуживание АПС, 2 корпуса»" maxlength="160" aria-label="Название сделки"><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <div class="mb">
    <div class="dsteps" role="group" aria-label="Этап сделки">${p.stages.filter(s => s.kind !== 'lost').map(s => { const i = p.stages.indexOf(s), cur = p.stages.indexOf(st), past = st.kind === 'lost' ? false : i <= cur; return `<button type="button" class="${past ? 'on' : ''} ${s.id === st.id ? 'cur' : ''}" style="--c:${s.color}" data-act="dealStep" data-v="${s.id}" aria-pressed="${s.id === st.id}"><i></i><span>${esc(s.name)}</span></button>`; }).join('')}</div>
    ${st.kind === 'lost' ? `<p class="hint warn">Сделка проиграна${x.lostWhy ? ': ' + esc(x.lostWhy) : ''}. <a href="#" data-act="dealReopen">Вернуть в работу</a></p>` : st.kind === 'won' ? `<p class="hint ok">Сделка выиграна${x.closedAt ? ' ' + fmtTs(x.closedAt).replace(/,.*/, '') : ''}.${x.tx && txOf(x.tx) ? ' Доход записан в Бюджет.' : ''} <a href="#" data-act="dealReopen">Вернуть в работу</a></p>` : ''}
    <div class="dgrid">
      <label class="f"><span>Сумма, ${esc(cur())}</span><input class="in" id="dl-amt" inputmode="decimal" value="${x.amount ? String(x.amount).replace('.', ',') : ''}" placeholder="0"></label>
      <label class="f"><span>Оплата</span><select class="in" id="dl-per"><option value="once" ${x.period !== 'month' ? 'selected' : ''}>Разово</option><option value="month" ${x.period === 'month' ? 'selected' : ''}>Каждый месяц</option></select></label>
      <label class="f"><span>Ожидаемая дата</span><input type="date" class="in" id="dl-due" value="${esc(x.due || '')}"></label>
      <label class="f"><span>Вероятность</span><select class="in" id="dl-prob"><option value="">По этапу · ${st.prob || 0}%</option>${[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => `<option value="${v}" ${String(x.prob) === String(v) ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>
      <label class="f"><span>Клиент</span><select class="in" id="dl-cont"><option value="">—</option>${people.map(c => `<option value="${c.id}" ${c.id === x.contact ? 'selected' : ''}>${esc(c.name)}${c.kind === 'org' ? ' (организация)' : crmOf(c.org) ? ' · ' + esc(crmOf(c.org).name) : ''}</option>`).join('')}<option value="+new">+ Новый клиент…</option></select></label>
      <label class="f"><span>Источник</span><input class="in" id="dl-src" list="dl-srcs" value="${esc(x.src || '')}" placeholder="откуда пришёл клиент"><datalist id="dl-srcs">${DSRC.map(v => `<option value="${v}">`).join('')}</datalist></label>
      ${CRM().pipes.length > 1 ? `<label class="f"><span>Воронка</span><select class="in" id="dl-pipe">${CRM().pipes.map(q => `<option value="${q.id}" ${q.id === x.pipe ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <label class="f dnew" hidden><span>Имя нового клиента</span><input class="in" id="dl-newc" maxlength="160" placeholder="Имя или название организации"></label>
    ${F.isNew ? '' : n ? `<div class="cnext ${n.date < today() ? 'over' : ''}">${ic('clock')}<div class="tx"><b>${n.date < today() ? 'Просрочено: ' : ''}Следующий шаг · ${esc(human(n.date))}${n.time ? ', ' + n.time : ''}</b><span>${esc(n.title)}</span></div><button class="btn sm" data-act="dealStepDone" data-id="${n.id}">${ic('check')} Сделано</button><button class="btn sm ghost" data-act="dealNextAsk">Другой шаг</button></div>`
      : cl ? '' : `<div class="cnext none">${ic('clock')}<div class="tx"><b>Следующий шаг не назначен</b><span>Сделка без следующего шага легко «зависает» — назначьте, что и когда сделать</span></div><button class="btn sm" data-act="dealNextAsk">Назначить</button></div>`}
    <div class="ccols">
      <section class="pan"><div class="ph2"><h2>Лента</h2><small>${log.length || ''}</small></div>
        ${F.isNew ? '<p class="hint">Звонки, встречи и смены этапа появятся здесь после сохранения.</p>' : `<div class="clogadd"><div class="chips">${Object.entries(LOGK).map(([k, [l, i]]) => `<button type="button" class="chip ${CRF.logKind === k ? 'on' : ''}" data-act="dealLogKind" data-v="${k}">${ic(i)} ${l}</button>`).join('')}</div>
          <div class="clogin"><input class="in" id="dl-log" placeholder="Итог звонка, встречи, договорённость" maxlength="1000" autocomplete="off"><button class="btn" data-act="dealLogAdd">Записать</button></div></div>`}
        ${log.map(l => { const [lb, ii, col] = LK[l.kind] || LK.note; return `<div class="clog"><i style="--c:${col}">${ic(ii)}</i><div class="tx"><b>${lb} <small>${fmtTs(l.at)}</small></b><span>${esc(l.text)}</span></div></div>`; }).join('')}
        <label class="f" style="margin-top:.6rem"><span>Заметка</span><textarea class="in" id="dl-note" rows="3" maxlength="4000" placeholder="Условия, требования, детали">${esc(x.note || '')}</textarea></label>
      </section>
      <section class="pan"><div class="ph2"><h2>Задачи</h2><small>${open.length || ''}</small><span class="spacer"></span>${F.isNew ? '' : `<button class="btn sm" data-act="dealTask">${ic('plus')} Задача</button>`}</div>
        ${open.map(t => `<div class="lrow ctask" data-act="dealTaskOpen" data-id="${t.id}"><button class="ichk" data-act="dealTaskDone" data-id="${t.id}" aria-label="Отметить выполненной"></button><div class="tx"><b>${esc(t.title)}</b><small>${t.date ? esc(dueTxt(t)) : 'без срока'}</small></div></div>`).join('') || `<div class="empty">${F.isNew ? 'Задачи можно добавить после сохранения' : 'Открытых задач нет'}</div>`}
        ${F.isNew ? '' : linksBlock(dealRef(x), x)}
      </section>
    </div>
  </div>
  <div class="mf">${F.isNew ? '' : `<button class="btn ghost danger" data-act="dealDel">${ic('trash')}<span class="hm"> Удалить</span></button>`}${!cl ? `<button class="btn ghost" data-act="dealLostAsk">Проиграна…</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn ${cl ? 'pri' : ''}" data-act="dealSave">Сохранить</button>${!cl ? `<button class="btn dwon" data-act="dealWonAsk">${ic('check')} Выиграна</button>` : ''}</div></div>`);
}
// читает поля формы в UI.form.d; возвращает false, если что-то не так
function dealRead() {
  const x = UI.form.d, v = id => (($('#' + id) || {}).value || '').trim();
  x.title = v('dl-title'); const a = parseMoney(v('dl-amt')); x.amount = a > 0 ? a : null;
  x.period = v('dl-per') || 'once'; x.due = v('dl-due') || null; x.prob = v('dl-prob') === '' ? null : +v('dl-prob');
  x.src = v('dl-src'); x.note = ($('#dl-note') || {}).value || '';
  if ($('#dl-pipe') && v('dl-pipe') !== x.pipe) { x.pipe = v('dl-pipe'); if (!pipeOf(x.pipe).stages.some(s => s.id === x.stage)) x.stage = openStages(pipeOf(x.pipe))[0].id; }
  let c = v('dl-cont');
  if (c === '+new') { const nm = v('dl-newc'); if (nm) { const nc = newContact({ name: nm }); CR().push(nc); c = nc.id; } else c = ''; }
  x.contact = c || null;
  return true;
}
function dealCommit(silent) {
  if (!dealRead()) return null;
  const F = UI.form, x = F.d;
  if (!x.title) { const i = $('#dl-title'); if (i) i.focus(); toast('Введите название сделки'); return null; }
  snapU();
  if (F.stage0 !== x.stage) {
    const p = pipeOf(x.pipe), a = p.stages.find(s => s.id === F.stage0), b = stageOf(x);
    x.log = [...(x.log || []), { id: uid(), at: Date.now(), kind: 'stage', text: (a ? a.name : '—') + ' → ' + b.name }];
    x.closedAt = b.kind ? Date.now() : null; F.stage0 = x.stage;
  }
  x.upd = Date.now();
  if (F.isNew) { DL().push(x); F.isNew = false; } else Object.assign(dealOf(x.id), x);
  F.d = clone(dealOf(x.id));
  save(); LIX = null;
  if (!silent) toast('Сделка сохранена', true);
  return dealOf(x.id);
}
function dealMove(id, stageId) {
  const x = dealOf(id); if (!x || x.stage === stageId) return;
  const p = pipeOf(x.pipe), b = p.stages.find(s => s.id === stageId); if (!b) return;
  if (b.kind === 'won') { dealForm(id); return dealWonAsk(); }
  snapU(); const a = stageOf(x);
  x.log = [...(x.log || []), { id: uid(), at: Date.now(), kind: 'stage', text: a.name + ' → ' + b.name }];
  x.stage = stageId; x.closedAt = b.kind ? Date.now() : null; x.order = Date.now(); x.upd = Date.now();
  save(); render(); toast(`«${x.title}» → ${b.name}`, true);
}
// ---------- следующий шаг ----------
function dealNextSheet() {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  const O = [[0, 'Сегодня'], [1, 'Завтра'], [3, 'Через 3 дня'], [7, 'Через неделю'], [14, 'Через 2 недели']];
  sheet(`<div class="shh"><b>Следующий шаг по сделке</b><small>${esc(F.d.title || '')} — появится задача с датой, Планер напомнит</small></div>
    <div class="shl"><label class="f"><span>Что сделать</span><input class="in" id="dl-nx" list="dl-nxs" placeholder="например, отправить КП" maxlength="200" autocomplete="off"><datalist id="dl-nxs">${['Позвонить', 'Отправить КП', 'Назначить встречу', 'Отправить договор', 'Выставить счёт', 'Уточнить решение'].map(v => `<option value="${v}">`).join('')}</datalist></label>
    <div class="chips cnxt">${O.map(([n, l]) => `<button class="chip" data-act="dealNextGo" data-v="${n}">${l}</button>`).join('')}</div>
    <div class="row two"><label class="f"><span>Или дата</span><input type="date" class="in" id="dl-nxd" value="${addDays(today(), 1)}"></label><label class="f"><span>Время (необязательно)</span><input type="time" class="in" id="dl-nxt"></label></div>
    <button class="btn pri" data-act="dealNextGo" data-v="d">${ic('check')} Назначить</button></div>`);
  setTimeout(() => { const i = $('#dl-nx'); if (i) i.focus(); }, 60);
}
function dealNextGo(v) {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  const x = dealOf(F.d.id); if (!x) return;
  const what = (($('#dl-nx') || {}).value || '').trim() || 'Связаться', tm = ($('#dl-nxt') || {}).value || null;
  const date = v === 'd' ? ($('#dl-nxd') || {}).value || today() : addDays(today(), +v);
  const links = [dealRef(x)]; if (x.contact) links.push({ k: 'cont', id: x.contact });
  const c = crmOf(x.contact);
  const t = newTask({ title: `${what}${c ? ' — ' + c.name : ''} (${x.title})`, col: firstCol().id, date, time: tm, remind: tm ? 0 : null, links });
  snapU(); addTask(t); save(); closeSheet(); LIX = null; drawDealForm();
  toast(`Шаг назначен: ${human(date).toLowerCase()}${tm ? ' в ' + tm : ''}`, true);
}
// ---------- выиграна / проиграна ----------
function dealWonAsk() {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  if (!dealCommit(true)) return;
  const x = F.d, accs = B().accounts, cats = B().categories.filter(c => c.type === 'income');
  const defCat = (cats.find(c => /прочие доходы/i.test(c.title)) || cats.find(c => /подработ/i.test(c.title)) || cats[0] || {}).id;
  sheet(`<div class="shh"><b>Сделка выиграна</b><small>${esc(x.title)}${x.amount ? ' · ' + dealAmt(x) : ''}</small></div>
    <div class="shl">
      <label class="sline" style="border:0;padding:0"><span class="tx"><b>Записать доход в Бюджет</b><span>${x.period === 'month' ? 'Первый платёж — сейчас' : 'Одной операцией'}</span></span><input type="checkbox" class="tog" id="dw-tx" ${x.amount ? 'checked' : ''}></label>
      <div class="row two"><label class="f"><span>Сумма, ${esc(cur())}</span><input class="in" id="dw-amt" inputmode="decimal" value="${x.amount ? String(x.amount).replace('.', ',') : ''}"></label><label class="f"><span>Дата</span><input type="date" class="in" id="dw-date" value="${today()}"></label></div>
      <div class="row two"><label class="f"><span>Счёт</span><select class="in" id="dw-acc">${accs.map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</select></label><label class="f"><span>Категория</span><select class="in" id="dw-cat">${cats.map(c => `<option value="${c.id}" ${c.id === defCat ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label></div>
      ${x.period === 'month' ? `<label class="sline" style="border:0;padding:0"><span class="tx"><b>Регулярный доход каждый месяц</b><span>Появится в «Платежах» и в календаре, будет напоминать</span></span><input type="checkbox" class="tog" id="dw-reg" checked></label>` : ''}
      <label class="sline" style="border:0;padding:0"><span class="tx"><b>Создать проект «${esc(x.title.slice(0, 40))}»</b><span>Для выполнения работ: задачи, сроки, бюджет</span></span><input type="checkbox" class="tog" id="dw-proj"></label>
      <div class="shf"><button class="btn" data-act="shClose">Отмена</button><span class="spacer"></span><button class="btn dwon" data-act="dealWonGo">${ic('check')} Готово</button></div></div>`);
}
function dealWonGo() {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  const x = dealOf(F.d.id); if (!x) return;
  const p = pipeOf(x.pipe), w = wonStage(p), a = stageOf(x), out = [];
  snapU();
  if (w && x.stage !== w.id) { x.log = [...(x.log || []), { id: uid(), at: Date.now(), kind: 'stage', text: a.name + ' → ' + w.name }]; x.stage = w.id; }
  x.closedAt = Date.now(); x.upd = Date.now();
  const c = crmOf(x.contact), amt = parseMoney(($('#dw-amt') || {}).value || ''), date = ($('#dw-date') || {}).value || today(), acc = ($('#dw-acc') || {}).value, cat = ($('#dw-cat') || {}).value;
  if ($('#dw-tx') && $('#dw-tx').checked && amt > 0) {
    const t = newTx({ type: 'income', amount: amt, date, account: acc, category: cat, note: `Сделка: ${x.title}${c ? ' · ' + c.name : ''}`, deal: x.id });
    B().tx.push(t); x.tx = t.id; out.push('доход ' + money0(amt));
  }
  if ($('#dw-reg') && $('#dw-reg').checked && amt > 0) {
    const day = pd(date).getDate(), r = { id: uid(), title: `Договор: ${x.title}`, type: 'income', amount: amt, account: acc, category: cat, project: null, tags: [], repeat: 'month', nextDate: stepDate(date, 'month', day), day, remind: 1, active: true, deal: x.id };
    B().regular.push(r); x.reg = r.id; out.push('регулярный доход');
  }
  if ($('#dw-proj') && $('#dw-proj').checked) {
    const pr = newProject({ title: x.title, color: COLORS[DL().length % COLORS.length], desc: `Из сделки${c ? ' с клиентом ' + c.name : ''}`, budget: x.amount || null, links: [dealRef(x), ...(x.contact ? [{ k: 'cont', id: x.contact }] : [])] });
    D.projects.push(pr); x.project = pr.id; out.push('проект');
    if (x.reg) { const r = regOf(x.reg); if (r) r.project = pr.id; } if (x.tx) { const t = txOf(x.tx); if (t) t.project = pr.id; }
  }
  x.log = [...x.log, { id: uid(), at: Date.now(), kind: 'note', text: 'Сделка выиграна' + (out.length ? ': ' + out.join(', ') : '') }];
  save(); closeSheet(); closeModal(); LIX = null; render();
  toast(`Сделка выиграна${out.length ? ' · ' + out.join(', ') : ''}`, true, x.project ? { act: 'openProject', id: x.project, label: 'Открыть проект' } : null);
}
function dealLostAsk() {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  if (!dealCommit(true)) return;
  sheet(`<div class="shh"><b>Почему сделка проиграна?</b><small>Причины видны в отчётах — помогут понять, что менять</small></div>
    <div class="shl"><div class="chips cnxt">${LOST_WHY.map(w => `<button class="chip" data-act="dealLostPick" data-v="${esc(w)}">${esc(w)}</button>`).join('')}</div>
    <label class="f"><span>Своими словами (необязательно)</span><input class="in" id="dl-why" maxlength="200" autocomplete="off"></label>
    <div class="shf"><button class="btn" data-act="shClose">Отмена</button><span class="spacer"></span><button class="btn danger" data-act="dealLostGo">Проиграна</button></div></div>`);
}
function dealLostGo() {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  const x = dealOf(F.d.id); if (!x) return;
  const p = pipeOf(x.pipe), l = lostStage(p), a = stageOf(x), why = (($('#dl-why') || {}).value || '').trim();
  snapU();
  if (l) { x.log = [...(x.log || []), { id: uid(), at: Date.now(), kind: 'stage', text: a.name + ' → ' + l.name + (why ? ' · ' + why : '') }]; x.stage = l.id; }
  x.lostWhy = why; x.closedAt = Date.now(); x.upd = Date.now();
  // открытые задачи по сделке больше не нужны — предлагаем закрыть
  const openT = dealTasks(x).filter(t => !isDone(t));
  save(); closeSheet(); closeModal(); LIX = null; render();
  toast('Сделка отмечена проигранной' + (openT.length ? ` · открытых задач: ${openT.length}` : ''), true, openT.length ? { act: 'dealCloseTasks', id: x.id, label: 'Закрыть задачи' } : null);
}
function dealLostList() {
  const p = curPipe(), l = lostStage(p), L = DL().filter(x => x.pipe === p.id && l && x.stage === l.id).sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  const why = {}; L.forEach(x => { const k = (x.lostWhy || 'Без причины').split(':')[0]; why[k] = (why[k] || 0) + 1; });
  modal(`<div class="mbox"><div class="mh"><h2>Проигранные сделки · ${L.length}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
    <div class="mb">${Object.keys(why).length ? `<div class="chips" style="flex-wrap:wrap;margin-bottom:.8rem">${Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="chip">${esc(k)} · ${n}</span>`).join('')}</div>` : ''}
      ${L.map(x => `<div class="lrow" data-act="dealOpen" data-id="${x.id}"><div class="tx"><b>${esc(x.title)}</b><small>${esc([crmOf(x.contact) ? crmOf(x.contact).name : '', x.amount ? dealAmt(x) : '', x.lostWhy || '', x.closedAt ? fmtTs(x.closedAt).replace(/,.*/, '') : ''].filter(Boolean).join(' · '))}</small></div></div>`).join('') || '<div class="empty">Проигранных сделок нет</div>'}</div></div>`);
}
// ---------- настройка воронки ----------
function pipeForm() {
  const P = clone(CRM().pipes); UI.form = { kind: 'pipes', P, cur: CRD.pipe };
  drawPipeForm();
}
function drawPipeForm() {
  const F = UI.form, p = F.P.find(q => q.id === F.cur) || F.P[0];
  modal(`<div class="mbox"><div class="mh"><h2>Воронки сделок</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
    <div class="mb">
      <div class="chips" style="flex-wrap:wrap;margin-bottom:.8rem">${F.P.map(q => `<button class="chip ${q.id === p.id ? 'on' : ''}" data-act="pipePick" data-v="${q.id}">${esc(q.name)}</button>`).join('')}<button class="chip" data-act="pipeAdd">${ic('plus')} Воронка</button></div>
      <label class="f"><span>Название воронки</span><input class="in" id="pp-name" value="${esc(p.name)}" maxlength="60"></label>
      <div class="f"><span>Этапы — по порядку; вероятность нужна для прогноза</span>
        ${p.stages.map((s, i) => `<div class="pprow" data-i="${i}"><input type="color" value="${esc(s.color)}" data-pp="color" aria-label="Цвет этапа"><input class="in" value="${esc(s.name)}" data-pp="name" maxlength="40" aria-label="Название этапа" ${s.kind ? 'style="font-weight:600"' : ''}>${s.kind ? `<span class="hint">${s.kind === 'won' ? 'успех' : 'проигрыш'}</span>` : `<input class="in" value="${s.prob}" data-pp="prob" inputmode="numeric" aria-label="Вероятность, %" style="width:4.5rem;text-align:right"><span class="hint">%</span>
          <button type="button" class="ib sm" data-act="ppUp" data-i="${i}" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>${ic('chup')}</button><button type="button" class="ib sm" data-act="ppDel" data-i="${i}" aria-label="Удалить этап">${ic('x')}</button>`}</div>`).join('')}
        <div><button type="button" class="btn sm" data-act="ppAdd">${ic('plus')} Этап</button></div></div>
      <p class="hint">Этап удалить можно, только если на нём нет сделок. «Успешно» и «Проиграна» есть в каждой воронке всегда.</p>
    </div>
    <div class="mf">${F.P.length > 1 ? `<button class="btn ghost danger" data-act="pipeDel">${ic('trash')} Удалить воронку</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="pipeSave">Сохранить</button></div></div>`);
}
function pipeRead() {
  const F = UI.form, p = F.P.find(q => q.id === F.cur) || F.P[0]; if (!$('#pp-name')) return p;
  p.name = $('#pp-name').value.trim() || p.name;
  $$('.pprow').forEach(r => { const s = p.stages[+r.dataset.i]; if (!s) return; const g = k => r.querySelector(`[data-pp="${k}"]`); s.name = (g('name').value || '').trim() || s.name; s.color = g('color').value; if (g('prob')) { const v = parseInt(g('prob').value, 10); s.prob = isFinite(v) ? Math.max(0, Math.min(100, v)) : s.prob; } });
  return p;
}
// ---------- встраивание в раздел «Клиенты» ----------
(() => {
  const M = MODULES.find(m => m.id === 'crm'); if (!M) return;
  const bar0 = M.bar, render0 = M.render, search0 = M.search;
  if (!CRF.tab) CRF.tab = 'deals';
  const tabs = () => `<div class="seg ctabs" role="tablist">${[['deals', 'Сделки', 'deal'], ['contacts', 'Контакты', 'users'], ['report', 'Отчёты', 'chart']].map(([k, l, i]) => `<button class="${CRF.tab === k ? 'on' : ''}" data-act="crmTab" data-v="${k}" role="tab" aria-selected="${CRF.tab === k}" aria-label="${l}">${ic(i)}<span class="${CRF.tab === k ? '' : 'hm'}"> ${l}</span></button>`).join('')}</div>`;
  M.bar = function () {
    if (CRF.tab === 'report' && typeof crmRepBar === 'function') return `${MOB() ? '' : '<h1>Клиенты</h1>'}${tabs()}<span class="spacer"></span>${crmRepBar()}`;
    if (CRF.tab !== 'deals') return bar0().replace('<h1>Клиенты</h1>', (MOB() ? '' : '<h1>Клиенты</h1>') + tabs());
    const P = CRM().pipes;
    return `${MOB() ? '' : '<h1>Клиенты</h1>'}${tabs()}<span class="spacer"></span>
      ${P.length > 1 ? `<select class="in" id="dl-pipesel" style="width:auto" aria-label="Воронка">${P.map(p => `<option value="${p.id}" ${p.id === curPipe().id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
      <button class="btn ghost" data-act="pipeEdit" title="Этапы и воронки">${ic('gear')}<span class="hm"> Этапы</span></button>
      <button class="btn pri" data-act="dealNew" aria-label="Новая сделка">${ic('plus')}<span class="hm"> Сделка</span></button>`;
  };
  M.render = function () {
    if (CRF.tab === 'report' && typeof crmRepHtml === 'function') return `<div class="scroll dscroll">${crmRepHtml()}</div>`;
    if (CRF.tab !== 'deals') return render0();
    if (!DL().length && !CRD.att) return `<div class="scroll"><div class="hempty">${ic('deal')}<h2>Сделки</h2><p>Ведите заявки и сделки по этапам: заявка → переговоры → КП → договор. У каждой сделки — сумма, клиент и следующий шаг с напоминанием. Выигранная сделка сама записывает доход в Бюджет.</p><button class="btn pri" data-act="dealNew">${ic('plus')} Первая сделка</button></div></div>`;
    return `<div class="scroll dscroll">${dealsBoard()}</div>`;
  };
  M.search = function (q) { const L = lnorm(q); return [...search0(q), ...DL().filter(x => lnorm(x.title).includes(L)).slice(0, 5).map(x => ({ group: 'Сделки', title: x.title, sub: dealSub(x), act: 'dealOpen', id: x.id }))]; };
})();
// карточка клиента: его сделки
{
  const card0 = crmCard;
  crmCard = function (c) {
    const L = dealsOfContact(c).sort((a, b) => dealClosed(a) - dealClosed(b) || (b.upd || 0) - (a.upd || 0));
    const sum = L.filter(x => stageOf(x).kind === 'won').reduce((a, x) => a + (+x.amount || 0), 0);
    const block = `<section class="pan cdeals"><div class="ph2"><h2>${ic('deal')} Сделки</h2><small>${L.length || ''}${sum ? ' · выиграно ' + money0(sum) : ''}</small><span class="spacer"></span><button class="btn sm" data-act="dealNew" data-c="${c.id}">${ic('plus')} Сделка</button></div>
      ${L.map(x => { const s = stageOf(x); return `<div class="lrow cdeal" data-act="dealOpen" data-id="${x.id}"><span class="dstg" style="--c:${s.color}">${esc(s.name)}</span><div class="tx"><b>${esc(x.title)}</b><small>${esc([x.amount ? dealAmt(x) : '', x.contact !== c.id && crmOf(x.contact) ? crmOf(x.contact).name : ''].filter(Boolean).join(' · ') || ' ')}</small></div></div>`; }).join('') || '<div class="empty">Сделок с этим клиентом пока нет</div>'}</section>`;
    return card0(c).replace('<div class="ccols">', block + '<div class="ccols">');
  };
}
// удаление клиента: сделки остаются, но без клиента
{ const del0 = crmDelete; crmDelete = function (id) { DL().forEach(x => { if (x.contact === id) x.contact = null; }); return del0(id); }; }
// перетаскивание карточек между этапами (компьютер)
document.addEventListener('dragstart', e => { const el = e.target.closest && e.target.closest('[data-deal]'); if (!el || el.getAttribute('draggable') !== 'true') return; CRD.drag = el.dataset.deal; e.dataTransfer.setData('text/plain', CRD.drag); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
document.addEventListener('dragover', e => { if (!CRD.drag) return; const col = e.target.closest && e.target.closest('[data-dstage]'); if (!col) return; e.preventDefault(); $$('.dcol.dover').forEach(x => x !== col && x.classList.remove('dover')); col.classList.add('dover'); });
document.addEventListener('drop', e => { if (!CRD.drag) return; const col = e.target.closest && e.target.closest('[data-dstage]'); const id = CRD.drag; CRD.drag = null; $$('.dcol.dover').forEach(x => x.classList.remove('dover')); if (!col) return; e.preventDefault(); dealMove(id, col.dataset.dstage); });
document.addEventListener('dragend', () => { CRD.drag = null; $$('.dcol.dover').forEach(x => x.classList.remove('dover')); });
document.addEventListener('change', e => {
  if (e.target.id === 'dl-cont') { const b = $('.dnew'); if (b) { b.hidden = e.target.value !== '+new'; if (!b.hidden) $('#dl-newc').focus(); } }
  if (e.target.id === 'dl-pipesel') { CRD.pipe = e.target.value; CRD.stage = null; render(); }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'dl-log' && e.key === 'Enter') { e.preventDefault(); ACT.dealLogAdd(); }
  if (e.target.id === 'dl-nx' && e.key === 'Enter') { e.preventDefault(); dealNextGo('d'); }
});
Object.assign(ACT, {
  crmTab: b => { CRF.tab = b.dataset.v; render(); },
  dealNew: b => { closeSheet(); const pre = {}; if (b && b.dataset.v) pre.stage = b.dataset.v; if (b && b.dataset.c) pre.contact = b.dataset.c; dealForm(null, pre); },
  dealOpen: b => { if (CRD.justDragged) return; closeSheet(); dealForm(b.dataset.id); },
  dealSave: () => { if (dealCommit()) { closeModal(); render(); } },
  dealStep: b => { const F = UI.form; dealRead(); const s = pipeOf(F.d.pipe).stages.find(q => q.id === b.dataset.v); if (!s) return; if (s.kind === 'won') return dealWonAsk(); F.d.stage = s.id; F.d.closedAt = null; drawDealForm(); },
  dealReopen: () => { const ev = window.event; if (ev && ev.preventDefault) ev.preventDefault(); const F = UI.form; dealRead(); F.d.stage = openStages(pipeOf(F.d.pipe)).slice(-1)[0].id; F.d.closedAt = null; F.d.lostWhy = ''; drawDealForm(); toast('Сделка вернётся в работу после сохранения'); },
  dealNextAsk: () => { if (UI.form.isNew) { if (!dealCommit(true)) return; drawDealForm(); } dealNextSheet(); },
  dealNextGo: b => dealNextGo(b.dataset.v),
  dealStepDone: b => { dealCommit(true); toggleDone(b.dataset.id); LIX = null; drawDealForm(); CRF.logKind = 'call'; setTimeout(() => { const i = $('#dl-log'); if (i) i.focus(); }, 50); toast('Шаг выполнен. Запишите итог и назначьте следующий', false, { act: 'dealNextAsk', label: 'Следующий шаг' }); },
  dealLogKind: b => { CRF.logKind = b.dataset.v; const v = ($('#dl-log') || {}).value || ''; dealRead(); drawDealForm(); const i = $('#dl-log'); if (i) { i.value = v; i.focus(); } },
  dealLogAdd: () => { const i = $('#dl-log'), text = ((i || {}).value || '').trim(); if (!text) { if (i) i.focus(); return toast('Напишите итог'); } if (!dealRead()) return; const F = UI.form; F.d.log = [...(F.d.log || []), { id: uid(), at: Date.now(), kind: CRF.logKind, text }]; if (dealCommit(true)) { drawDealForm(); toast('Записано'); } },
  dealTask: () => { const x = dealCommit(true); if (!x) return; const links = [dealRef(x)]; if (x.contact) links.push({ k: 'cont', id: x.contact }); UI.dealBack = x.id; openTaskForm(null, { links, project: x.project || null }); },
  dealTaskOpen: b => { if (!dealCommit(true)) return; UI.dealBack = UI.form.d.id; openTaskForm(b.dataset.id); },
  dealTaskDone: b => { const ev = window.event; if (ev && ev.stopPropagation) ev.stopPropagation(); dealCommit(true); toggleDone(b.dataset.id); LIX = null; drawDealForm(); },
  dealWonAsk: () => dealWonAsk(),
  dealWonGo: () => dealWonGo(),
  dealLostAsk: () => dealLostAsk(),
  dealLostPick: b => { const i = $('#dl-why'); if (i) i.value = b.dataset.v + (i.value && !LOST_WHY.includes(i.value) ? ': ' + i.value : ''); $$('.shl .cnxt .chip').forEach(x => x.classList.toggle('on', x === b)); },
  dealLostGo: () => dealLostGo(),
  dealLostList: () => dealLostList(),
  dealCloseTasks: b => { const x = dealOf(b.dataset.id); if (!x) return; snapU(); dealTasks(x).filter(t => !isDone(t)).forEach(t => toggleDone(t.id)); save(); render(); toast('Задачи по сделке закрыты', true); },
  dealDel: () => { const x = UI.form.d; sheet(`<div class="shh"><b>Удалить сделку «${esc(x.title)}»?</b><small>Лента сделки удалится. Задачи и операции в Бюджете останутся.</small></div><div class="shl"><button class="btn danger" data-act="dealDelGo">${ic('trash')} Удалить</button><button class="btn" data-act="shClose">Отмена</button></div>`); },
  dealDelGo: () => { const id = UI.form.d.id; snapU(); CRM().deals = DL().filter(x => x.id !== id); const r = { k: 'deal', id }; [...D.tasks, ...NT(), ...D.projects, ...CR()].forEach(o => { if (o.links && o.links.some(x => rsame(x, r))) o.links = o.links.filter(x => !rsame(x, r)); }); save(); closeSheet(); closeModal(); LIX = null; render(); toast('Сделка удалена', true); },
  dealAtt: () => { CRD.att = !CRD.att; render(); },
  dealStageTab: b => { CRD.stage = b.dataset.v; render(); },
  pipeEdit: () => pipeForm(),
  pipePick: b => { pipeRead(); UI.form.cur = b.dataset.v; drawPipeForm(); },
  pipeAdd: () => { pipeRead(); const p = DEF_PIPE(); p.id = uid(); p.name = 'Новая воронка'; p.stages.forEach(s => { if (!s.kind) s.id = uid(); }); UI.form.P.push(p); UI.form.cur = p.id; drawPipeForm(); setTimeout(() => { const i = $('#pp-name'); if (i) { i.focus(); i.select(); } }, 30); },
  ppAdd: () => { const p = pipeRead(), i = p.stages.findIndex(s => s.kind); p.stages.splice(i < 0 ? p.stages.length : i, 0, { id: uid(), name: 'Новый этап', color: COLORS[p.stages.length % COLORS.length], prob: 50 }); drawPipeForm(); const r = $$('.pprow [data-pp="name"]'); const el = r[(i < 0 ? p.stages.length - 1 : i)]; if (el) { el.focus(); el.select(); } },
  ppUp: b => { const p = pipeRead(), i = +b.dataset.i; if (i < 1) return; [p.stages[i - 1], p.stages[i]] = [p.stages[i], p.stages[i - 1]]; drawPipeForm(); },
  ppDel: b => { const p = pipeRead(), s = p.stages[+b.dataset.i]; if (!s || s.kind) return; if (DL().some(x => x.pipe === p.id && x.stage === s.id)) return toast('На этом этапе есть сделки — сначала перенесите их'); if (openStages(p).length < 2) return toast('Нужен хотя бы один рабочий этап'); p.stages.splice(+b.dataset.i, 1); drawPipeForm(); },
  pipeDel: () => { const F = UI.form; pipeRead(); if (DL().some(x => x.pipe === F.cur)) return toast('В воронке есть сделки — сначала перенесите или удалите их'); F.P = F.P.filter(q => q.id !== F.cur); F.cur = F.P[0].id; drawPipeForm(); },
  pipeSave: () => { pipeRead(); snapU(); CRM().pipes = UI.form.P; if (!CRM().pipes.some(p => p.id === CRD.pipe)) CRD.pipe = CRM().pipes[0].id; else CRD.pipe = UI.form.cur; save(); closeModal(); render(); toast('Воронки сохранены', true); }
});
// после окна задачи, открытого из сделки, возвращаемся в сделку
{
  const back = () => { const id = UI.dealBack; UI.dealBack = null; if (id && dealOf(id)) setTimeout(() => dealForm(id), 30); };
  const st0 = saveTaskForm; saveTaskForm = function (keep) { const r = st0(keep); if (r !== false && !keep && UI.dealBack) back(); return r; };
  const cm0 = closeModal; closeModal = function () { const wasTask = UI.form && UI.form.kind === 'task'; cm0(); if (wasTask && UI.dealBack) back(); };
}
