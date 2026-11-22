'use strict';
// ============================================================
//  CRM, этап 1. Раздел «Клиенты»: люди и организации, история общения,
//  «связаться…» (задача с датой — работают обычные напоминания), день рождения → «Важные даты»,
//  связи с задачами, заметками и проектами.
// ============================================================
Object.assign(ICONS, {
  phone: '<path d="M6.5 3.5h3l1.5 4.5-2 1.3a11 11 0 0 0 5.7 5.7l1.3-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  org: '<path d="M4.5 20.5V5.5l7-2v17M11.5 8.5h8v12M7.5 8h1M7.5 11.5h1M7.5 15h1M14.5 12h2M14.5 15.5h2M3 20.5h18"/>',
  meet: '<circle cx="8" cy="8.5" r="3"/><circle cx="16.5" cy="8.5" r="3"/><path d="M2.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5M11 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5"/>'
});
const CRF = { open: null, q: '', f: 'all', logKind: 'call' };
const CR = () => (D.contacts = Array.isArray(D.contacts) ? D.contacts : []);
const crmOf = id => CR().find(c => c.id === id);
const newContact = o => ({ id: uid(), kind: 'person', name: '', org: null, role: '', phones: [], emails: [], addr: '', bday: '', note: '', tags: [], log: [], links: [], created: Date.now(), upd: Date.now(), ...o });
const crmOrgs = () => CR().filter(c => c.kind === 'org' && !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
const crmPeople = orgId => CR().filter(c => c.kind === 'person' && c.org === orgId && !c.archived);
const crmSub = c => c.kind === 'org' ? (crmPeople(c.id).length ? `организация · ${crmPeople(c.id).length} ${plural(crmPeople(c.id).length, ['контакт', 'контакта', 'контактов'])}` : 'организация') : [c.role, (crmOf(c.org) || {}).name].filter(Boolean).join(' · ');
const crmIni = n => String(n || '?').replace(/[«»"()]/g, '').trim().split(/\s+/).filter(w => !/^(ООО|ОАО|ЗАО|ПАО|АО|ИП|МБОУ|МКУ|ГБУ)$/i.test(w)).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const crmColor = c => { let h = 0; for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const crmAva = (c, big) => `<span class="cava ${big ? 'big' : ''} ${c.kind === 'org' ? 'org' : ''}" style="--c:${crmColor(c)}" aria-hidden="true">${c.kind === 'org' ? ic('org') : esc(crmIni(c.name))}</span>`;
const LOGK = { call: ['Звонок', 'phone', 'var(--acc)'], meet: ['Встреча', 'meet', 'var(--ok)'], mail: ['Письмо', 'mail', '#a26bfa'], note: ['Заметка', 'note', 'var(--mute)'] };
// всё, что ссылается на клиента (задачи, заметки, проекты) + его собственные связи
const crmRef = c => ({ k: 'cont', id: c.id });
const crmTT = (c, t) => t.title.replace(new RegExp('^Связаться: ' + c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(—\\s*)?'), 'Связаться — ').replace(/^Связаться — $/, 'Связаться');
function crmTasks(c) { return live().filter(t => (t.links || []).some(l => l.k === 'cont' && l.id === c.id)); }
// ближайший запланированный контакт: открытая задача клиента с самой ранней датой
function crmNext(c) {
  return crmTasks(c).filter(t => !isDone(t) && t.date).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0] || null;
}
const crmDue = c => { const t = crmNext(c); return t ? diff(today(), t.date) : null; };
function crmList() {
  const q = lnorm(CRF.q.trim());
  return CR().filter(c => !c.archived)
    .filter(c => CRF.f === 'org' ? c.kind === 'org' : CRF.f === 'due' ? (crmDue(c) !== null && crmDue(c) <= 0) : true)
    .filter(c => !q || lnorm([c.name, c.role, (crmOf(c.org) || {}).name, c.note, ...(c.phones || []), ...(c.emails || [])].join(' ')).includes(q) || crmPhoneHit(c, CRF.q))
    .sort((a, b) => { const da = crmDue(a), db = crmDue(b); return (da === null ? 9999 : da) - (db === null ? 9999 : db) || a.name.localeCompare(b.name, 'ru'); });
}
function crmDueTag(c) {
  const n = crmDue(c); if (n === null) return '';
  return `<span class="cdue ${n < 0 ? 'over' : n === 0 ? 'now' : ''}">${n < 0 ? 'просрочено' : n === 0 ? 'сегодня' : n === 1 ? 'завтра' : (d => d.getDate() + ' ' + MGS[d.getMonth()])(pd(crmNext(c).date))}</span>`;
}
// поиск по номеру в любом написании: 8 900…, +7 (900)…, 900 000…
function crmPhoneHit(c, q) { const d = digitsOf(q); if (d.length < 3) return false; const alt = d[0] === '8' && d.length >= 4 ? '7' + d.slice(1) : null; return (c.phones || []).some(p => { const x = digitsOf(phoneFmt(p)); return x.includes(d) || (alt && x.startsWith(alt)) || (d.length >= 10 && x.endsWith(d.slice(-10))); }); }
const crmRow = c => `<button class="crow ${CRF.open === c.id ? 'on' : ''}" data-act="crmOpen" data-id="${c.id}">${crmAva(c)}<span class="tx"><b>${esc(c.name || 'Без имени')}</b><small>${esc(crmSub(c) || phoneFmt((c.phones || [])[0] || ''))}</small></span>${crmDueTag(c)}</button>`;
// ---------- карточка ----------
function crmCard(c) {
  const org = crmOf(c.org), nx = crmNext(c), ph = (c.phones || []).filter(Boolean), em = (c.emails || []).filter(Boolean);
  const tasks = crmTasks(c), open = tasks.filter(t => !isDone(t)).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')), done = tasks.filter(isDone).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 5);
  const people = c.kind === 'org' ? crmPeople(c.id) : [];
  const bd = c.bday ? (o => o ? `${pd(o).getDate()} ${MG[pd(o).getMonth()]}${diff(today(), o) <= 14 ? ' · ' + daysLeftTxt(diff(today(), o)) : ''}` : '')(dateNext({ date: c.bday, yearly: true })) : '';
  const field = (l, v, act) => v ? `<div class="cfld"><span>${l}</span><b>${act || esc(v)}</b></div>` : '';
  const log = (c.log || []).slice().sort((a, b) => b.at - a.at);
  return `<div class="ccard" data-id="${c.id}">
    <div class="chead">${MOB() ? `<button class="ib" data-act="crmBack" aria-label="К списку">${ic('left')}</button>` : ''}${crmAva(c, true)}
      <div class="tx"><h2>${esc(c.name || 'Без имени')}</h2><span>${c.kind === 'org' ? 'Организация' : esc(c.role || 'Контакт')}${org ? ` · <a href="#" data-act="crmOpen" data-id="${org.id}">${esc(org.name)}</a>` : ''}</span></div>
      <div class="cacts">${ph.length ? `<button class="btn" data-act="crmCall" data-v="${esc(ph[0])}" aria-label="Позвонить">${ic('phone')} <span>Позвонить</span></button>` : ''}${em.length ? `<button class="btn" data-act="crmMail" data-v="${esc(em[0])}" aria-label="Написать">${ic('mail')} <span>Написать</span></button>` : ''}
        <button class="btn pri" data-act="crmNext" data-id="${c.id}" aria-label="Связаться…">${ic('clock')} <span>Связаться…</span></button>
        <button class="ib" data-act="crmMore" data-id="${c.id}" title="Ещё" aria-label="Ещё">${ic('more')}</button></div></div>
    <div class="cgrid">${ph.map((p, i) => field(i ? 'Ещё телефон' : 'Телефон', p, `<a href="#" data-act="crmCall" data-v="${esc(p)}">${esc(phoneFmt(p))}</a>`)).join('')}${em.map(e => field('Почта', e, `<a href="#" data-act="crmMail" data-v="${esc(e)}">${esc(e)}</a>`)).join('')}${field('Адрес', c.addr)}${field('День рождения', bd)}${(c.tags || []).length ? `<div class="cfld"><span>Теги</span><b>${tagsHtml(c)}</b></div>` : ''}</div>
    ${c.note ? `<div class="cnote">${esc(c.note)}</div>` : ''}
    ${nx ? `<div class="cnext ${diff(today(), nx.date) < 0 ? 'over' : ''}">${ic('clock')}<div class="tx"><b>${diff(today(), nx.date) < 0 ? 'Просрочено: ' : ''}${esc(human(nx.date))}${nx.time ? ', ' + nx.time : ''}</b><span>${esc(nx.title.replace(/^Связаться: [^—]+—\s*/, ''))}</span></div><button class="btn sm" data-act="crmNextDone" data-id="${nx.id}">${ic('check')} Сделано</button><button class="btn sm ghost" data-act="openTask" data-id="${nx.id}">Перенести</button></div>`
      : `<div class="cnext none">${ic('clock')}<div class="tx"><b>Следующий контакт не назначен</b><span>Назначьте, когда связаться, — Планер напомнит</span></div><button class="btn sm" data-act="crmNext" data-id="${c.id}">Назначить</button></div>`}
    <div class="ccols">
      <section class="pan"><div class="ph2"><h2>История общения</h2><small>${log.length || ''}</small></div>
        <div class="clogadd"><div class="chips">${Object.entries(LOGK).map(([k, [l, i]]) => `<button type="button" class="chip ${CRF.logKind === k ? 'on' : ''}" data-act="crmLogKind" data-v="${k}">${ic(i)} ${l}</button>`).join('')}</div>
          <div class="clogin"><input class="in" id="cr-log" placeholder="${{ call: 'О чём договорились по телефону', meet: 'Итог встречи', mail: 'Что отправили или получили', note: 'Заметка о клиенте' }[CRF.logKind]}" maxlength="1000" autocomplete="off"><button class="btn" data-act="crmLogAdd" data-id="${c.id}">Записать</button></div></div>
        ${log.map(l => { const [lb, ii, col] = LOGK[l.kind] || LOGK.note; return `<div class="clog"><i style="--c:${col}">${ic(ii)}</i><div class="tx"><b>${lb} <small>${fmtTs(l.at)}</small></b><span>${esc(l.text)}</span></div><button class="ib sm" data-act="crmLogDel" data-id="${c.id}" data-v="${l.id}" aria-label="Удалить запись" title="Удалить">${ic('x')}</button></div>`; }).join('') || '<div class="empty">Записывайте звонки, встречи и договорённости — через месяц не придётся вспоминать, о чём шла речь.</div>'}
      </section>
      <section class="pan"><div class="ph2"><h2>Задачи</h2><small>${open.length || ''}</small><span class="spacer"></span><button class="btn sm" data-act="crmTask" data-id="${c.id}">${ic('plus')} Задача</button></div>
        ${open.map(t => `<div class="lrow ctask" data-act="openTask" data-id="${t.id}"><button class="ichk" data-act="complete" data-id="${t.id}" aria-label="Отметить выполненной"></button><div class="tx"><b>${esc(crmTT(c, t))}</b><small>${t.date ? esc(dueTxt(t)) : 'без срока'}</small></div></div>`).join('') || '<div class="empty">Открытых задач нет</div>'}
        ${done.length ? `<div class="cdone">${done.map(t => `<div class="lrow ctask dn" data-act="openTask" data-id="${t.id}"><span class="ichk on" aria-hidden="true">${ic('check')}</span><div class="tx"><b>${esc(crmTT(c, t))}</b><small>выполнено${t.doneAt ? ' ' + fmtTs(t.doneAt).replace(/ \d{4},.*/, '') : ''}</small></div></div>`).join('')}</div>` : ''}
        ${people.length ? `<div class="ph2" style="margin-top:.8rem"><h2>Сотрудники</h2><small>${people.length}</small></div>${people.map(crmRow).join('')}` : ''}
        ${c.kind === 'org' ? `<button class="btn sm ghost" data-act="crmNew" data-org="${c.id}">${ic('plus')} Сотрудник</button>` : ''}
        ${linksBlock(crmRef(c), c)}
      </section>
    </div></div>`;
}
// ---------- форма ----------
function crmForm(id, preset) {
  const src = id ? crmOf(id) : null, c = src ? clone(src) : newContact(preset || {});
  UI.form = { kind: 'crm', isNew: !src, c };
  const orgs = crmOrgs().filter(o => o.id !== c.id);
  modal(`<div class="mbox"><div class="mh"><h2>${src ? (c.kind === 'org' ? 'Организация' : 'Контакт') : 'Новый контакт'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="crform" autocomplete="off">
    <div class="seg" role="radiogroup" aria-label="Тип"><button type="button" class="${c.kind === 'person' ? 'on' : ''}" data-act="crmKind" data-v="person" role="radio" aria-checked="${c.kind === 'person'}">${ic('users')} Человек</button><button type="button" class="${c.kind === 'org' ? 'on' : ''}" data-act="crmKind" data-v="org" role="radio" aria-checked="${c.kind === 'org'}">${ic('org')} Организация</button></div>
    <label class="f"><span id="cr-namel">${c.kind === 'org' ? 'Название организации' : 'Имя и фамилия'}</span><input class="in title" id="cr-name" value="${esc(c.name)}" maxlength="160" placeholder="${c.kind === 'org' ? 'Например, ООО «Северный дом»' : 'Например, Ирина Смирнова'}"></label>
    <div class="row two crp" ${c.kind === 'org' ? 'hidden' : ''}>
      <label class="f"><span>Организация</span><select class="in" id="cr-org"><option value="">—</option>${orgs.map(o => `<option value="${o.id}" ${o.id === c.org ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}<option value="+new">+ Новая организация…</option></select></label>
      <label class="f"><span>Должность</span><input class="in" id="cr-role" value="${esc(c.role)}" maxlength="80" placeholder="директор, снабжение…"></label></div>
    <label class="f crneworg" hidden><span>Название новой организации</span><input class="in" id="cr-orgnew" maxlength="160"></label>
    <div class="row two"><label class="f"><span>Телефон</span><input class="in" id="cr-ph1" type="tel" inputmode="tel" data-phone value="${esc(phoneFmt((c.phones || [])[0] || ''))}" placeholder="+7 (900) 123-45-67" maxlength="40"></label>
      <label class="f"><span>Ещё телефон</span><input class="in" id="cr-ph2" type="tel" inputmode="tel" data-phone value="${esc(phoneFmt((c.phones || [])[1] || ''))}" placeholder="+7 (900) 123-45-67" maxlength="40"></label></div>
    <div class="row two"><label class="f"><span>Почта</span><input class="in" id="cr-em" type="email" inputmode="email" value="${esc((c.emails || [])[0] || '')}"></label>
      <label class="f crp" ${c.kind === 'org' ? 'hidden' : ''}><span>День рождения</span><input class="in" id="cr-bday" type="date" value="${esc(c.bday || '')}"></label></div>
    <label class="f"><span>Адрес</span><input class="in" id="cr-addr" value="${esc(c.addr || '')}" maxlength="200"></label>
    <div class="f"><span>Теги</span>${tagPick(c.tags || [], 'crmTag')}</div>
    <label class="f"><span>Заметка</span><textarea class="in" id="cr-note" rows="3" maxlength="4000" placeholder="Как познакомились, что важно помнить">${esc(c.note || '')}</textarea></label>
    ${c.kind === 'person' ? '<p class="hint">День рождения появится в «Важных датах» с напоминанием за день.</p>' : ''}
  </form>
  <div class="mf">${src ? `<button class="btn ghost danger" data-act="crmDel" data-id="${c.id}">${ic('trash')} Удалить</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="crmSave">Сохранить</button></div></div>`);
  setTimeout(() => { const i = $('#cr-name'); if (i) i.focus(); }, 30);
}
function crmSave() {
  const F = UI.form, c = F.c, v = id => (($('#' + id) || {}).value || '').trim();
  c.name = v('cr-name'); if (!c.name) { $('#cr-name').focus(); return toast(c.kind === 'org' ? 'Введите название организации' : 'Введите имя'); }
  const ph = ['cr-ph1', 'cr-ph2'].map(id => { const x = v(id); return digitsOf(x).length <= 1 && /^\+7?\s*\(?$/.test(x) ? '' : phoneFmt(x); });
  const bad = ph.findIndex(x => x && !phoneDone(x)); if (bad >= 0) { const el = $('#cr-ph' + (bad + 1)); el.focus(); return toast('Номер введён не полностью: нужно 10 цифр после +7'); }
  c.phones = ph.filter(Boolean); c.emails = [v('cr-em')].filter(Boolean);
  c.addr = v('cr-addr'); c.note = ($('#cr-note') || {}).value || ''; c.upd = Date.now();
  snapU();
  if (c.kind === 'person') {
    c.role = v('cr-role'); c.bday = v('cr-bday');
    let og = v('cr-org');
    if (og === '+new') { const nm = v('cr-orgnew'); if (nm) { const o = newContact({ kind: 'org', name: nm }); CR().push(o); og = o.id; } else og = ''; }
    c.org = og || null;
  } else { c.org = null; c.role = ''; c.bday = ''; }
  if (F.isNew) CR().push(c); else Object.assign(crmOf(c.id), c);
  crmBday(crmOf(c.id));
  save(); closeModal(); CRF.open = c.id; LIX = null;
  if (UI.view !== 'crm') go('crm'); else render();
  toast(F.isNew ? 'Контакт добавлен' : 'Сохранено', true);
}
// день рождения → «Важные даты» (одна запись на контакт)
function crmBday(c) {
  if (!c) return;
  D.dates = D.dates || []; const id = 'ct-' + c.id, x = D.dates.find(d => d.id === id);
  if (!c.bday || c.kind !== 'person' || c.archived) { if (x) D.dates = D.dates.filter(d => d !== x); return; }
  if (x) Object.assign(x, { title: c.name, date: c.bday });
  else D.dates.push({ id, title: c.name, date: c.bday, kind: 'bday', yearly: true, remind: 1, year: true, contact: c.id });
}
function crmDelete(id) {
  const c = crmOf(id); if (!c) return;
  snapU();
  D.contacts = CR().filter(x => x.id !== id);
  CR().forEach(x => { if (x.org === id) x.org = null; });
  const r = { k: 'cont', id };
  [...D.tasks, ...NT(), ...D.projects, ...CR()].forEach(o => { if (o.links && o.links.some(x => rsame(x, r))) o.links = o.links.filter(x => !rsame(x, r)); });
  D.dates = (D.dates || []).filter(d => d.id !== 'ct-' + id);
  if (CRF.open === id) CRF.open = null; LIX = null;
  save(); closeModal(); closeSheet(); render(); toast('Контакт удалён', true);
}
// «Связаться…» — задача с датой, привязанная к клиенту
function crmNextSheet(id) {
  const c = crmOf(id); if (!c) return;
  const O = [[0, 'Сегодня'], [1, 'Завтра'], [3, 'Через 3 дня'], [7, 'Через неделю'], [14, 'Через 2 недели'], [30, 'Через месяц']];
  sheet(`<div class="shh"><b>Связаться: ${esc(c.name)}</b><small>Появится задача с датой — Планер напомнит</small></div>
    <div class="shl"><label class="f"><span>О чём</span><input class="in" id="cr-nxt" placeholder="например, уточнить, подписан ли договор" maxlength="200" autocomplete="off"></label>
    <div class="chips cnxt">${O.map(([n, l]) => `<button class="chip" data-act="crmNextGo" data-id="${id}" data-v="${n}">${l}</button>`).join('')}</div>
    <div class="row two"><label class="f"><span>Или дата</span><input type="date" class="in" id="cr-nxd" value="${addDays(today(), 1)}"></label><label class="f"><span>Время (необязательно)</span><input type="time" class="in" id="cr-nxt2"></label></div>
    <button class="btn pri" data-act="crmNextGo" data-id="${id}" data-v="d">${ic('check')} Назначить</button></div>`);
  setTimeout(() => { const i = $('#cr-nxt'); if (i) i.focus(); }, 60);
}
function crmNextGo(id, v) {
  const c = crmOf(id); if (!c) return;
  const about = (($('#cr-nxt') || {}).value || '').trim(), tm = ($('#cr-nxt2') || {}).value || null;
  const date = v === 'd' ? ($('#cr-nxd') || {}).value || today() : addDays(today(), +v);
  const t = newTask({ title: `Связаться: ${c.name}${about ? ' — ' + about : ''}`, col: firstCol().id, date, time: tm, remind: tm ? 0 : null, links: [crmRef(c)] });
  snapU(); addTask(t); save(); closeSheet(); LIX = null; render();
  toast(`Напомню ${human(date).toLowerCase()}${tm ? ' в ' + tm : ''}`, true);
}
function crmMore(id) {
  const c = crmOf(id); if (!c) return;
  sheet(`<div class="shh"><b>${esc(c.name)}</b><small>${c.kind === 'org' ? 'Организация' : 'Контакт'}</small></div>
    <div class="shl"><button class="btn ghost" data-act="crmEdit" data-id="${id}">${ic('edit')} Изменить</button>
      <button class="btn ghost" data-act="crmCopy" data-id="${id}">${ic('copy')} Скопировать контакты</button>
      <button class="btn ghost" data-act="crmNote" data-id="${id}">${ic('note')} Заметка о клиенте</button>
      <button class="btn ghost danger" data-act="crmDelAsk" data-id="${id}">${ic('trash')} Удалить</button></div>`);
}

// ---------- маска телефона: +7 (900) 123-45-67 ----------
// 8… и 9… превращаются в +7…; номер с другим кодом страны (+375…, +998…) и короткий городской остаются как ввели
const digitsOf = v => String(v || '').replace(/\D/g, '');
function phoneFmt(v) {
  const s = String(v || '').trim(); if (!s) return '';
  const plus = s.startsWith('+'); let d = digitsOf(s);
  if (!d) return plus ? '+' : '';
  if (plus && d[0] !== '7') return s;
  if (!plus) { if (d[0] === '8' && d.length > 1) d = '7' + d.slice(1); else if (d[0] === '8') d = '7'; else if (d[0] === '9') d = '7' + d; else if (d[0] !== '7') return s; }
  const p = d.slice(1, 11); let out = '+7';
  if (p.length) out += ' (' + p.slice(0, 3);
  if (p.length >= 3) out += ')';
  if (p.length > 3) out += ' ' + p.slice(3, 6);
  if (p.length > 6) out += '-' + p.slice(6, 8);
  if (p.length > 8) out += '-' + p.slice(8, 10);
  return out;
}
const phoneRu = v => /^\+7/.test(phoneFmt(v));
const phoneDone = v => !phoneRu(v) || digitsOf(phoneFmt(v)).length === 11;
document.addEventListener('focusin', e => { const i = e.target; if (i.matches && i.matches('input[data-phone]') && !i.value) { i.value = '+7 ('; i.dataset.prev = i.value; i.dataset.ate = ''; setTimeout(() => i.setSelectionRange(i.value.length, i.value.length), 0); } });
document.addEventListener('focusout', e => { const i = e.target; if (i.matches && i.matches('input[data-phone]') && digitsOf(i.value).length <= 1 && /^\+7?\s*\(?$/.test(i.value.trim())) i.value = ''; });
document.addEventListener('input', e => {
  const i = e.target; if (!i.matches || !i.matches('input[data-phone]')) return;
  const prev = i.dataset.prev || '', v = i.value, bare = x => /^\+?7?\s*\(?$/.test(String(x).trim());
  if (e.data === '+' && bare(prev)) { i.value = '+'; i.dataset.prev = '+'; return; }   // «+» — начать номер заново (в т. ч. иностранный)
  const pos = i.selectionStart == null ? v.length : i.selectionStart, plus = v.trim().startsWith('+');
  let before = digitsOf(v.slice(0, pos)).length, all = digitsOf(v);
  if (e.inputType === 'deleteContentBackward' && all === digitsOf(prev) && before > 0) { all = all.slice(0, before - 1) + all.slice(before); before--; } // стёрли скобку/пробел/дефис — стираем цифру перед ними
  if (plus && all[0] === '7' && (all[1] === '7' || all[1] === '8') && ((bare(prev) && i.dataset.ate !== '1') || all.length > 11)) { all = '7' + all.slice(2); before = Math.max(1, before - 1); if (all.length === 1) i.dataset.ate = '1'; } // набрали «+7…»/«8…» поверх «+7 (» (один раз) или вставили номер целиком
  if (e.inputType && e.inputType.startsWith('delete') && plus && all.length <= 1) { i.value = ''; i.dataset.prev = ''; i.dataset.ate = ''; return; }
  if (all.length > 1) i.dataset.ate = i.dataset.ate === '1' && all.length === 2 ? '1' : i.dataset.ate;
  const f = all === '7' && plus ? '+7 (' : phoneFmt((plus ? '+' : '') + all);
  if (!/^\+7/.test(f)) { i.dataset.prev = v; return; }   // иностранный или короткий номер — без маски
  if (!plus && all[0] === '9') before++;
  i.value = f; i.dataset.prev = f;
  let c = f.length;
  if (before <= 0) c = 0; else { let k = 0; for (let j = 0; j < f.length; j++) if (/\d/.test(f[j]) && ++k === before) { c = j + 1; break; } }
  try { i.setSelectionRange(c, c); } catch (er) {}
});
// ---------- раздел ----------
registerModule({
  id: 'crm', order: 4.6, title: 'Клиенты', icon: 'users', desc: 'Контакты и организации, история общения, напоминания «связаться», дни рождения',
  bar() {
    const L = CR().filter(c => !c.archived), due = L.filter(c => crmDue(c) !== null && crmDue(c) <= 0).length;
    return `<h1>Клиенты</h1><div class="stats"><span><b>${L.filter(c => c.kind === 'person').length}</b> ${plural(L.filter(c => c.kind === 'person').length, ['контакт', 'контакта', 'контактов'])}</span>${crmOrgs().length ? `<span><b>${crmOrgs().length}</b> ${plural(crmOrgs().length, ['организация', 'организации', 'организаций'])}</span>` : ''}${due ? `<span class="warn"><b>${due}</b> пора связаться</span>` : ''}</div><span class="spacer"></span>
      ${MOB() ? '' : `<div class="nsearch"><input class="in" id="crq" value="${esc(CRF.q)}" placeholder="Имя, телефон, организация" aria-label="Поиск по клиентам"></div>`}
      <button class="btn pri" data-act="crmNew" aria-label="Новый контакт">${ic('plus')}<span class="hm"> Контакт</span></button>`;
  },
  render() {
    const L = crmList(); if (CRF.open && !crmOf(CRF.open)) CRF.open = null;
    if (!CRF.open && !MOB() && L.length) CRF.open = L[0].id;
    const c = crmOf(CRF.open), all = CR().filter(x => !x.archived), due = all.filter(x => crmDue(x) !== null && crmDue(x) <= 0).length;
    const chips = `<div class="chips cflt">${[['all', 'Все'], ['due', 'Пора связаться' + (due ? ' · ' + due : '')], ['org', 'Организации']].map(([k, l]) => `<button class="chip ${CRF.f === k ? 'on' : ''}" data-act="crmF" data-v="${k}">${l}</button>`).join('')}</div>`;
    const list = `<div class="clist">${MOB() && all.length ? `<input class="in csearch" id="crq" value="${esc(CRF.q)}" placeholder="Поиск: имя, телефон, организация" aria-label="Поиск по клиентам">` : ''}${chips}${L.map(crmRow).join('') || `<div class="empty">${all.length ? 'Ничего не найдено' : 'Контактов пока нет'}</div>`}</div>`;
    const empty = `<div class="hempty">${ic('users')}<h2>Клиенты</h2><p>Храните контакты клиентов и организаций, записывайте звонки и встречи, назначайте, когда связаться, — Планер напомнит. Дни рождения попадут в «Важные даты».</p><button class="btn pri" data-act="crmNew">${ic('plus')} Первый контакт</button></div>`;
    if (MOB()) return c ? `<div class="scroll"><div class="cwrap one">${crmCard(c)}</div></div>` : `<div class="scroll">${all.length ? list : empty}</div>`;
    if (!all.length) return `<div class="scroll">${empty}</div>`;
    return `<div class="cwrap">${list}<div class="cpane">${c ? crmCard(c) : '<div class="empty">Выберите контакт</div>'}</div></div>`;
  },
  after() { if (CRF.focusLog) { const i = $('#cr-log'); if (i) i.focus(); CRF.focusLog = false; } },
  search(q) { return CR().filter(c => !c.archived && (lnorm([c.name, c.role, ...(c.phones || []), ...(c.emails || [])].join(' ')).includes(lnorm(q)) || crmPhoneHit(c, q))).slice(0, 6).map(c => ({ group: 'Клиенты', title: c.name, sub: crmSub(c) || phoneFmt((c.phones || [])[0] || ''), act: 'crmOpen', id: c.id })); }
});
document.addEventListener('input', e => { if (e.target.id === 'crq') { CRF.q = e.target.value; const s = e.target.selectionStart; render(); const i = $('#crq'); if (i) { i.focus(); i.setSelectionRange(s, s); } } });
document.addEventListener('change', e => { if (e.target.id === 'cr-org') { const b = $('.crneworg'); if (b) { b.hidden = e.target.value !== '+new'; if (!b.hidden) $('#cr-orgnew').focus(); } } });
document.addEventListener('keydown', e => { if (e.target.id === 'cr-log' && e.key === 'Enter') { e.preventDefault(); ACT.crmLogAdd({ dataset: { id: CRF.open } }); } if (e.target.id === 'cr-nxt' && e.key === 'Enter') { e.preventDefault(); const b = $('[data-act=crmNextGo][data-v="d"]'); if (b) b.click(); } });
Object.assign(ACT, {
  crmNew: b => { closeSheet(); crmForm(null, b && b.dataset.org ? { org: b.dataset.org } : null); },
  crmEdit: b => { closeSheet(); crmForm(b.dataset.id); },
  crmSave: () => crmSave(),
  crmKind: b => { const c = UI.form.c; c.kind = b.dataset.v; $$('#crform .seg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); $$('#crform .crp').forEach(x => x.hidden = c.kind === 'org'); $('#cr-namel').textContent = c.kind === 'org' ? 'Название организации' : 'Имя и фамилия'; $('#cr-name').placeholder = c.kind === 'org' ? 'Например, ООО «Северный дом»' : 'Например, Ирина Смирнова'; },
  crmTag: b => { const a = UI.form.c.tags, v = b.dataset.v, i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); b.classList.toggle('on', i < 0); },
  crmOpen: b => { const ev = window.event; if (ev && ev.preventDefault && ev.target && ev.target.closest && ev.target.closest('a')) ev.preventDefault(); CRF.open = b.dataset.id; closeModal(); closeSheet(); if (UI.view !== 'crm') go('crm'); else render(); const p = $('.cpane'); if (p) p.scrollTop = 0; },
  crmBack: () => { CRF.open = null; render(); },
  crmF: b => { CRF.f = b.dataset.v; render(); },
  crmCall: b => { const ev = window.event; if (ev && ev.preventDefault) ev.preventDefault(); openExternal('tel:' + String(b.dataset.v).replace(/[^\d+]/g, '')); if (CRF.open) setTimeout(() => { CRF.logKind = 'call'; CRF.focusLog = true; if (UI.view === 'crm') render(); toast('После разговора запишите, о чём договорились'); }, 600); },
  crmMail: b => { const ev = window.event; if (ev && ev.preventDefault) ev.preventDefault(); openExternal('mailto:' + b.dataset.v); },
  crmNext: b => crmNextSheet(b.dataset.id),
  crmNextGo: b => crmNextGo(b.dataset.id, b.dataset.v),
  crmNextDone: b => { const t = byId(b.dataset.id); if (!t) return; toggleDone(t.id); const c = crmOf(CRF.open); if (c) { CRF.logKind = 'call'; CRF.focusLog = true; } render(); toast('Отмечено. Запишите итог и назначьте следующий контакт', false, c ? { act: 'crmNext', id: c.id, label: 'Связаться…' } : null); },
  crmTask: b => { const c = crmOf(b.dataset.id); if (!c) return; openTaskForm(null, { links: [crmRef(c)], title: '' }); },
  crmLogKind: b => { CRF.logKind = b.dataset.v; const v = ($('#cr-log') || {}).value || ''; render(); const i = $('#cr-log'); if (i) { i.value = v; i.focus(); } },
  crmLogAdd: b => {
    const c = crmOf(b.dataset.id), i = $('#cr-log'), text = ((i || {}).value || '').trim(); if (!c) return;
    if (!text) { if (i) i.focus(); return toast('Напишите, о чём был разговор'); }
    c.log = [...(c.log || []), { id: uid(), at: Date.now(), kind: CRF.logKind, text }]; c.upd = Date.now();
    save(); render();
    if (!crmNext(c)) toast('Записано', false, { act: 'crmNext', id: c.id, label: 'Когда связаться снова?' }); else toast('Записано');
  },
  crmLogDel: b => { const c = crmOf(b.dataset.id); if (!c) return; snapU(); c.log = (c.log || []).filter(l => l.id !== b.dataset.v); save(); render(); toast('Запись удалена', true); },
  crmMore: b => crmMore(b.dataset.id),
  crmCopy: async b => { closeSheet(); const c = crmOf(b.dataset.id); if (!c) return; const t = [c.name, crmSub(c), ...(c.phones || []), ...(c.emails || []), c.addr].filter(Boolean).join('\n'); try { await navigator.clipboard.writeText(t); toast('Контакты скопированы'); } catch (e) { toast('Не удалось скопировать'); } },
  crmNote: b => { closeSheet(); const c = crmOf(b.dataset.id); if (!c) return; const n = newNote({ title: c.name, links: [crmRef(c)] }); NT().push(n); save(); NOF.open = n.id; NOF.edit = true; NOF.focus = true; go('notes'); },
  crmDelAsk: b => { const c = crmOf(b.dataset.id); if (!c) return; sheet(`<div class="shh"><b>Удалить «${esc(c.name)}»?</b><small>История общения удалится. Задачи и заметки останутся, но без связи с клиентом.${c.kind === 'org' && crmPeople(c.id).length ? ' Сотрудники останутся без организации.' : ''}</small></div><div class="shl"><button class="btn danger" data-act="crmDel" data-id="${c.id}">${ic('trash')} Удалить</button><button class="btn" data-act="shClose">Отмена</button></div>`); },
  crmDel: b => crmDelete(b.dataset.id)
});
// задача клиента: в окне задачи сверху видно, к какому клиенту она относится (через блок «Связи»)
