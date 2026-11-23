'use strict';
// ============================================================
//  CRM, этап 3. Связи с остальным Планером:
//  «Обзор» — карточка сделок; календарь и «Ближайшие дни» — ожидаемые даты сделок;
//  Бюджет — поле «Клиент» у операции, деньги клиента в его карточке, доход по сделке и договору — с клиентом.
// ============================================================
const txOfContact = c => { const ids = new Set([c.id, ...(c.kind === 'org' ? crmPeople(c.id).map(p => p.id) : [])]); return B().tx.filter(x => x.contact && ids.has(x.contact)); };
// ---------- Бюджет: поле «Клиент» ----------
{
  const draw0 = drawTxForm;
  drawTxForm = function () {
    draw0();
    const F = UI.form, x = F && F.x; if (!x || x.type === 'transfer' || !modOn('crm')) return;
    const L = CR().filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!L.length && !x.contact) return;
    const note = $('#x-note'), lab = note && note.closest('label'); if (!lab) return;
    lab.insertAdjacentHTML('beforebegin', `<label class="f"><span>Клиент</span><select class="in" id="x-cont"><option value="">—</option>${L.map(c => `<option value="${c.id}" ${c.id === x.contact ? 'selected' : ''}>${esc(c.name)}${c.kind === 'person' && crmOf(c.org) ? ' · ' + esc(crmOf(c.org).name) : ''}</option>`).join('')}</select></label>`);
  };
  const read0 = readTx;
  readTx = function () { const x = read0(); const s = $('#x-cont'); if (x.type === 'transfer') x.contact = null; else if (s) x.contact = s.value || null; return x; };
  const row0 = txRow;
  txRow = function (x, o = {}) { const h = row0(x, o), c = x.contact && crmOf(x.contact); return c && !o.noCont ? h.replace('</small></div>', ` <span class="ptag" data-act="crmOpen" data-id="${c.id}" style="--c:#14b8a6">${ic('users')}${esc(c.name)}</span></small></div>`) : h; };
  // регулярный платёж по договору: оплата записывается с клиентом
  const pay0 = payRegular;
  payRegular = function (r, date) { const n = B().tx.length, res = pay0(r, date); if (r && r.contact) { let ch = false; B().tx.slice(n).forEach(t => { if (t.regular === r.id && !t.contact) { t.contact = r.contact; ch = true; } }); if (ch) save(); } return res; };
  // выигранная сделка: доход и регулярный платёж — с клиентом сделки
  const won0 = dealWonGo;
  dealWonGo = function () { const id = UI.form && UI.form.d && UI.form.d.id; won0(); const x = id && dealOf(id); if (!x || !x.contact) return; let ch = false; if (x.tx && txOf(x.tx) && !txOf(x.tx).contact) { txOf(x.tx).contact = x.contact; ch = true; } if (x.reg && regOf(x.reg) && !regOf(x.reg).contact) { regOf(x.reg).contact = x.contact; ch = true; } if (ch) save(); };
  // удаление клиента: операции остаются, но без клиента
  const del0 = crmDelete; crmDelete = function (id) { B().tx.forEach(x => { if (x.contact === id) x.contact = null; }); B().regular.forEach(r => { if (r.contact === id) r.contact = null; }); return del0(id); };
}
// ---------- карточка клиента: деньги ----------
{
  const card0 = crmCard;
  crmCard = function (c) {
    const L = txOfContact(c).sort((a, b) => b.date.localeCompare(a.date)), inc = L.filter(x => x.type === 'income').reduce((a, x) => a + x.amount, 0), exp = L.filter(x => x.type === 'expense').reduce((a, x) => a + x.amount, 0);
    const regs = B().regular.filter(r => r.contact && (r.contact === c.id || (c.kind === 'org' && crmPeople(c.id).some(p => p.id === r.contact))) && r.active !== false);
    const block = `<section class="pan cmoney"><div class="ph2"><h2>${ic('wallet')} Деньги</h2><small>${L.length ? `получено ${money0(inc)}${exp ? ' · потрачено ' + money0(exp) : ''}` : ''}</small><span class="spacer"></span><button class="btn sm" data-act="crmPay" data-id="${c.id}">${ic('plus')} Оплата</button></div>
      ${regs.map(r => `<div class="lrow" data-act="openReg" data-id="${r.id}" style="--c:var(--inc)"><span class="dot"></span><div class="tx"><b>${esc(r.title)}</b><small>регулярно · следующий ${esc(human(r.nextDate).toLowerCase())}</small></div><span class="am inc">+${money0(r.amount)}</span></div>`).join('')}
      ${L.slice(0, 5).map(x => txRow(x, { noCont: true })).join('') || (regs.length ? '' : '<div class="empty">Оплат от клиента пока нет. Выберите клиента в операции Бюджета — она появится здесь.</div>')}
      ${L.length > 5 ? `<button class="btn sm ghost" data-act="crmTxAll" data-id="${c.id}">Все операции · ${L.length}</button>` : ''}</section>`;
    return card0(c).replace('<div class="ccols">', block + '<div class="ccols">');
  };
}
// ---------- календарь и «Ближайшие дни»: ожидаемые даты сделок ----------
DKIND.deal = ['Сделка', '🤝'];
{
  const on0 = datesOn;
  datesOn = function (day) {
    const r = on0(day); if (!D || !modOn('crm') || !D.crm) return r;
    return r.concat(DL().filter(x => x.due === day && !dealClosed(x)).map(x => ({ id: 'deal:' + x.id, title: `${x.title}${x.amount ? ' · ' + dealAmt(x) : ''}`, kind: 'deal', date: day, yearly: false })));
  };
  const de0 = ACT.dateEdit;
  ACT.dateEdit = b => { const id = b && b.dataset && b.dataset.id; if (id && id.startsWith('deal:')) return dealForm(id.slice(5)); return de0(b); };
}
// ---------- «Обзор»: карточка сделок ----------
function crmDashHtml() {
  if (!modOn('crm') || !D.crm || !DL().length) return '';
  const open = DL().filter(x => !dealClosed(x)), att = open.filter(dealAtt).sort((a, b) => (+b.amount || 0) - (+a.amount || 0));
  const soon = open.filter(x => x.due && x.due >= today() && diff(today(), x.due) <= 14).sort((a, b) => a.due.localeCompare(b.due));
  const fc = open.filter(x => x.due && x.due <= monthEnd()).reduce((a, x) => a + (+x.amount || 0) * dealProb(x) / 100, 0);
  const sum = open.reduce((a, x) => a + (+x.amount || 0), 0), m0 = today().slice(0, 7);
  const won = DL().filter(x => stageOf(x).kind === 'won' && x.closedAt && fmtYm(x.closedAt) === m0).reduce((a, x) => a + (+x.amount || 0), 0);
  const row = (x, sub) => `<div class="lrow" data-act="dealOpen" data-id="${x.id}"><span class="dstg" style="--c:${stageOf(x).color}">${esc(stageOf(x).name)}</span><div class="tx"><b>${esc(x.title)}</b><small>${esc(sub)}</small></div>${x.amount ? `<span class="am">${money0(x.amount)}</span>` : ''}</div>`;
  return `<section class="pan crmdash" style="margin-bottom:1rem"><div class="ph2"><h2>${ic('deal')} Сделки</h2><small>${open.length} в работе</small><span class="spacer"></span><button class="btn sm ghost" data-act="crmGoDeals">Воронка</button></div>
    <div class="cdk"><div><span>В работе</span><b>${money0(sum)}</b></div><div><span>Прогноз на месяц</span><b>${money0(fc)}</b></div><div><span>Выиграно в этом месяце</span><b style="color:var(--ok)">${money0(won)}</b></div></div>
    <div class="grid2">
      <div><h3 class="cdh">Требуют внимания <small>${att.length || ''}</small></h3>${att.slice(0, 4).map(x => { const n = dealNext(x); return row(x, n ? 'шаг просрочен: ' + human(n.date).toLowerCase() : 'нет следующего шага'); }).join('') || '<div class="empty">У всех сделок есть следующий шаг</div>'}</div>
      <div><h3 class="cdh">Ожидаются в ближайшие 2 недели <small>${soon.length || ''}</small></h3>${soon.slice(0, 4).map(x => row(x, human(x.due) + (crmOf(x.contact) ? ' · ' + crmOf(x.contact).name : ''))).join('') || '<div class="empty">Сделок с близкой датой нет</div>'}</div>
    </div></section>`;
}
{ const g0 = givenHtml; givenHtml = function () { return g0() + (UI.view === 'dashboard' ? crmDashHtml() : ''); }; }
Object.assign(ACT, {
  crmPay: b => { const c = crmOf(b.dataset.id); if (!c) return; openTxForm(null, { type: 'income', contact: c.id, note: c.name }); },
  crmTxAll: b => { const c = crmOf(b.dataset.id); if (!c) return; const L = txOfContact(c).sort((a, b2) => b2.date.localeCompare(a.date)); modal(`<div class="mbox"><div class="mh"><h2>${ic('wallet')} ${esc(c.name)} — операции</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div><div class="mb">${L.map(x => txRow(x, { noCont: true })).join('')}</div></div>`); },
  crmGoDeals: () => { CRF.tab = 'deals'; go('crm'); }
});
