'use strict';
// ============================================================
//  Проценты на остаток (накопительный счёт, вклад): начисление каждый день.
//  Проценты за день = остаток на конец дня × ставка ÷ 100 ÷ дней в году (365 или 366).
//  Ставка задаётся с датой: когда банк её меняет — добавляется новая строка, прежние дни считаются по старой.
//  Начисленное записывается доходом «Проценты» — одной операцией за месяц (за текущий — по вчерашний день).
//  Всё пересчитывается заново из операций, поэтому задним числом добавленные операции и ставки учитываются.
// ============================================================
const INT_CAP = [['day', 'Каждый день (проценты на проценты)'], ['month', 'Раз в месяц (прибавляются 1-го числа)']];
const intOn = a => !!(a && a.int && a.int.on && (a.int.rates || []).some(r => r.from && isFinite(+r.rate)));
const yLen = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
const intRates = a => (a.int.rates || []).filter(r => r.from && isFinite(+r.rate)).slice().sort((p, q) => p.from.localeCompare(q.from));
const intRateAt = (a, d) => { let r = null; for (const x of intRates(a)) { if (x.from <= d) r = +x.rate; else break; } return r; };
const fmtRate = v => String(r2(+v)).replace('.', ',') + '%';
function intCalc(a, upto) {
  const I = a.int, R = intRates(a), start = I.start || (R[0] && R[0].from) || today();
  const months = {}; let last = null, total = 0;
  if (!R.length || start > upto) return { months, last, total };
  const deltas = new Map(), mine = 'int-' + a.id + '-'; let bal = +a.initial || 0;
  for (const x of B().tx) {
    if (x.int || String(x.id).startsWith(mine)) continue;
    let v = 0;
    if (x.type === 'income' && x.account === a.id) v = x.amount; else if (x.type === 'expense' && x.account === a.id) v = -x.amount;
    else if (x.type === 'transfer') { if (x.account === a.id) v -= x.amount; if (x.to === a.id) v += x.amount; }
    if (!v) continue;
    if (x.date < start) bal += v; else deltas.set(x.date, (deltas.get(x.date) || 0) + v);
  }
  let pend = 0, ri = 0, rate = null;
  const dt = pd(start), end = pd(upto);
  for (; dt <= end; dt.setDate(dt.getDate() + 1)) {
    const d = ymd(dt), ym = d.slice(0, 7);
    if (I.cap === 'month' && d.slice(8) === '01') { bal += pend; pend = 0; }
    bal += deltas.get(d) || 0;
    while (ri < R.length && R[ri].from <= d) rate = +R[ri++].rate;
    const v = bal > 0 && rate ? bal * rate / 100 / yLen(dt.getFullYear()) : 0;
    months[ym] = (months[ym] || 0) + v; total += v;
    if (I.cap === 'month') pend += v; else bal += v;
    last = { d, v, rate, bal };
  }
  return { months, last, total };
}
const intCat = () => (B().categories.find(c => c.type === 'income' && /процент/i.test(c.title)) || B().categories.find(c => c.type === 'income') || {}).id || null;
let intBusy = false;
function intAccrue() {
  if (!D || !D.budget || intBusy || UI.locked) return false;
  intBusy = true; let ch = false;
  try {
    const y = addDays(today(), -1), want = new Map(), cat = intCat();
    for (const a of B().accounts) {
      if (!intOn(a)) continue;
      const { months } = intCalc(a, y);
      for (const ym in months) {
        const amt = r2(months[ym]); if (amt <= 0) continue;
        const date = ym === y.slice(0, 7) ? y : ym + '-' + String(mDays(ym)).padStart(2, '0');
        const id = 'int-' + a.id + '-' + ym;
        want.set(id, { id, type: 'income', amount: amt, date, account: a.id, category: cat, note: `Проценты · ${MN[+ym.slice(5) - 1].toLowerCase()} ${ym.slice(0, 4)}`, int: a.id, created: Date.parse(date + 'T12:00:00') || 0 });
      }
    }
    const T = B().tx, seen = new Set(), live = new Set(B().accounts.filter(intOn).map(a => a.id));
    for (let i = T.length - 1; i >= 0; i--) {
      const x = T[i], w = want.get(x.id);
      if (x.int && !live.has(x.int)) { delete x.int; ch = true; continue; }   // проценты выключили — начисленное остаётся обычным доходом
      if (!x.int && !w) continue;
      if (!w || seen.has(x.id)) { T.splice(i, 1); ch = true; continue; }       // месяц без процентов (сдвинули дату начала и т.п.)
      seen.add(x.id);
      ['amount', 'date', 'account', 'note', 'int'].forEach(k => { if (x[k] !== w[k]) { x[k] = w[k]; ch = true; } });
      if (!catOf(x.category)) { x.category = w.category; ch = true; }
    }
    for (const [id, w] of want) if (!seen.has(id)) { T.push(newTx(w)); ch = true; }
  } finally { intBusy = false; }
  if (ch) { save(); if (!modalOpen() && (UI.view === 'budget' || UI.view === 'dashboard')) render(); }
  return ch;
}
// пересчёт после любых изменений (с задержкой), раз в полчаса и при запуске — чтобы новый день тоже начислился
{
  const _save = save; let t = null;
  save = function (now) { const r = _save(now); if (!intBusy) { clearTimeout(t); t = setTimeout(intAccrue, 1200); } return r; };
}
setInterval(intAccrue, 30 * 60000);
setTimeout(intAccrue, 2500);

// ---------- форма счёта ----------
function intRows(a) {
  const R = (a.int && a.int.rates) || [];
  return R.map((r, i) => `<div class="irate"><span>с</span><input type="date" class="in" data-ir="from" value="${esc(r.from || '')}"><input class="in" data-ir="rate" inputmode="decimal" value="${r.rate === '' || r.rate == null ? '' : String(r.rate).replace('.', ',')}" placeholder="16,5"><span>%</span>${R.length > 1 ? `<button type="button" class="ib sm" data-act="intRateDel" data-i="${i}" aria-label="Удалить ставку">${ic('x')}</button>` : ''}</div>`).join('');
}
function intRead() {
  const a = UI.form && UI.form.a; if (!a || !$('#a-int')) return;
  const rows = $$('#a-rates .irate').map(el => ({ from: el.querySelector('[data-ir=from]').value, rate: (v => isFinite(v) ? v : '')(parseFloat(String(el.querySelector('[data-ir=rate]').value).replace(',', '.'))) }));
  a.int = { ...(a.int || {}), on: $('#a-int').checked, start: $('#a-istart').value || today(), cap: $('#a-icap').value, rates: rows };
}
function intStats(a) {
  if (!intOn(a)) return '';
  const y = addDays(today(), -1), c = intCalc(a, y), m = r2(c.months[y.slice(0, 7)] || 0), cr = intRateAt(a, today());
  const bal = accBalance(a.id), yearly = cr ? bal * cr / 100 : 0;
  return `<p class="hint">${c.last ? `Вчера начислено <b>${money(c.last.v)}</b> по ставке ${fmtRate(c.last.rate || 0)} · ` : ''}в этом месяце <b>${money(m)}</b> · всего <b>${money(c.total)}</b>${cr ? `<br>При нынешней ставке ${fmtRate(cr)} и остатке ${money0(bal)} — примерно <b>${money(yearly / yLen(new Date().getFullYear()))}</b> в день, <b>${money0(yearly / 12)}</b> в месяц` : ''}</p>`;
}
const _openAccForm = openAccForm;
openAccForm = function (id) {
  _openAccForm(id);
  const a = UI.form.a, on = !!(a.int && a.int.on);
  if (!a.int) a.int = { on: false, start: today(), cap: 'day', rates: [{ from: today(), rate: '' }] };
  const box = document.createElement('div'); box.className = 'intbox';
  box.innerHTML = `<div class="sline"><div class="tx"><b>${ic('coin')} Проценты на остаток</b><span>Начисляются каждый день на остаток на конец дня и записываются доходом «Проценты» — одной операцией за месяц</span></div><input type="checkbox" class="tog" id="a-int" ${on ? 'checked' : ''}></div>
    <div id="a-intset" ${on ? '' : 'hidden'}>
      <div class="row two"><label class="f"><span>Начислять с</span><input type="date" class="in" id="a-istart" value="${esc(a.int.start || today())}"></label>
      <label class="f"><span>Капитализация</span><select class="in" id="a-icap">${INT_CAP.map(([k, l]) => `<option value="${k}" ${(a.int.cap || 'day') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="f"><span>Ставка, % годовых</span><div id="a-rates">${intRows(a)}</div>
        <div><button type="button" class="btn sm" data-act="intRateAdd">${ic('plus')} Ставка изменилась</button></div></div>
      <p class="hint">Когда банк меняет ставку, нажмите «Ставка изменилась» и укажите, с какого дня действует новая. Дни до этой даты останутся посчитанными по прежней ставке.</p>
      ${intStats(a)}</div>`;
  const form = $('#aform'); if (form) form.appendChild(box);
};
const _openTx = ACT.openTx, _accSave = ACT.accSave;
Object.assign(ACT, {
  openTx: b => { const x = txOf(b.dataset.id); if (x && x.int && accOf(x.int)) { closeModal(); openAccForm(x.int); toast('Проценты начисляются автоматически — ставку меняйте здесь'); return; } _openTx(b); },
  accSave: () => {
    intRead(); const a = UI.form.a;
    if (a.int && a.int.on) {
      a.int.rates = a.int.rates.filter(r => r.from && r.rate !== '');
      if (!a.int.rates.length) return toast('Укажите процентную ставку');
      if (a.int.rates.some(r => r.rate < 0 || r.rate > 100)) return toast('Ставка — от 0 до 100% годовых');
    }
    _accSave();
  },
  intRateAdd: () => { intRead(); const R = UI.form.a.int.rates, last = R[R.length - 1]; R.push({ from: today(), rate: last ? last.rate : '' }); $('#a-rates').innerHTML = intRows(UI.form.a); const ins = $$('#a-rates [data-ir=rate]'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } },
  intRateDel: b => { intRead(); UI.form.a.int.rates.splice(+b.dataset.i, 1); $('#a-rates').innerHTML = intRows(UI.form.a); }
});
document.addEventListener('change', e => {
  if (e.target.id !== 'a-int') return;
  const s = $('#a-intset'); if (s) s.hidden = !e.target.checked;
  if (e.target.checked) { const r = $('#a-rates [data-ir=rate]'); if (r && !r.value) r.focus(); }
});
// карточка счёта: ставка и начисленное за месяц
const _vAccounts = vAccounts;
vAccounts = function () {
  let h = _vAccounts();
  const y = addDays(today(), -1);
  for (const a of B().accounts) {
    if (!intOn(a)) continue;
    const r = intRateAt(a, today()), m = B().tx.find(x => x.id === 'int-' + a.id + '-' + y.slice(0, 7));
    const add = `<em class="accint">${r != null ? fmtRate(r) + ' годовых' : ''}${m ? ' · +' + money0(m.amount) + ' за месяц' : ''}</em>`;
    h = h.replace(new RegExp(`(data-act="openAcc" data-id="${a.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</small>)`), `$1${add}`);
  }
  return h;
};
