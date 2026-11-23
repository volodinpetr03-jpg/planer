'use strict';
// ============================================================
//  CRM, этап 5. Отчёты по сделкам и клиентам; черновики писем клиенту (YandexGPT или готовые заготовки).
// ============================================================
const CRP = { per: 'quarter' };
const CRP_PER = [['month', 'Этот месяц'], ['quarter', 'Этот квартал'], ['year', 'Этот год'], ['12m', '12 месяцев'], ['all', 'Всё время']];
function crpStart() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (CRP.per === 'month') return new Date(y, m, 1);
  if (CRP.per === 'quarter') return new Date(y, m - m % 3, 1);
  if (CRP.per === 'year') return new Date(y, 0, 1);
  if (CRP.per === '12m') return new Date(y, m - 11, 1);
  return new Date(2000, 0, 1);
}
// до какого этапа дошла сделка (для воронки): выигранная — прошла все рабочие этапы; проигранная — тот, с которого проиграна
function dealReached(x) {
  const p = pipeOf(x.pipe), st = stageOf(x), idx = id => p.stages.findIndex(s => s.id === id);
  if (st.kind === 'won') return idx(st.id);
  if (st.kind === 'lost') {
    const ls = (x.log || []).filter(l => l.kind === 'stage' && l.text.includes('→ ' + st.name)).pop();
    if (ls) { const from = ls.text.split(' → ')[0].trim(), i = p.stages.findIndex(s => s.name === from && !s.kind); if (i >= 0) return i; }
    return 0;
  }
  return idx(st.id);
}
const crpBar = (v, max, c) => `<div class="rbar"><i style="width:${max ? Math.max(2, v / max * 100) : 0}%;--c:${c || 'var(--acc)'}"></i></div>`;
function crmRepBar() {
  const P = CRM().pipes;
  return `${P.length > 1 ? `<select class="in" id="dl-pipesel" style="width:auto" aria-label="Воронка">${P.map(p => `<option value="${p.id}" ${p.id === curPipe().id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
    <select class="in" id="crp-per" style="width:auto" aria-label="Период">${CRP_PER.map(([k, l]) => `<option value="${k}" ${CRP.per === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
function crmRepHtml() {
  const p = curPipe(), s0 = crpStart().getTime(), s0d = ymd(crpStart()), all = DL().filter(x => x.pipe === p.id);
  if (!all.length && !CR().length) return `<div class="hempty">${ic('chart')}<h2>Отчёты</h2><p>Когда появятся сделки и клиенты, здесь будет видно: сколько заявок доходит до договора, почему сделки проигрываются, какие клиенты и источники приносят больше денег.</p></div>`;
  const born = all.filter(x => (x.created || 0) >= s0), closed = all.filter(x => x.closedAt && x.closedAt >= s0);
  const won = closed.filter(x => stageOf(x).kind === 'won'), lost = closed.filter(x => stageOf(x).kind === 'lost');
  const sum = L => L.reduce((a, x) => a + (+x.amount || 0), 0), wonSum = sum(won);
  const conv = won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null;
  const days = won.filter(x => x.created && x.closedAt).map(x => (x.closedAt - x.created) / 864e5), avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  const perL = (CRP_PER.find(x => x[0] === CRP.per) || [])[1].toLowerCase();
  const kpi = `<div class="gridk dk">
    <div class="kpi"><span>${ic('plus')} Новых сделок</span><b>${born.length}</b><small>${born.length ? 'на ' + money0(sum(born)) : perL}</small></div>
    <div class="kpi"><span>${ic('check')} Выиграно</span><b style="color:var(--ok)">${money0(wonSum)}</b><small>${won.length} ${plural(won.length, ['сделка', 'сделки', 'сделок'])}${won.length ? ' · средний чек ' + money0(wonSum / won.length) : ''}</small></div>
    <div class="kpi"><span>${ic('target')} Конверсия</span><b>${conv == null ? '—' : conv + '%'}</b><small>${won.length + lost.length ? `выиграно ${won.length} из ${won.length + lost.length} закрытых` : 'закрытых сделок нет'}</small></div>
    <div class="kpi"><span>${ic('clock')} Средний срок сделки</span><b>${avgDays == null ? '—' : avgDays + ' ' + plural(avgDays, PD)}</b><small>от заявки до победы</small></div></div>`;
  // воронка
  const S = p.stages.filter(s => s.kind !== 'lost'), reach = born.map(dealReached);
  const fn = S.map((s, i) => { const L = born.filter((x, k) => reach[k] >= p.stages.indexOf(s) && !(s.kind === 'won' && stageOf(x).kind !== 'won')); return { s, n: L.length, sum: sum(L) }; });
  const fmax = fn[0] ? fn[0].n : 0;
  const funnel = `<section class="pan"><div class="ph2"><h2>Воронка</h2><small>сделки, созданные: ${perL}</small></div>
    ${born.length ? fn.map((f, i) => `<div class="rrow"><div class="rl"><b>${esc(f.s.name)}</b><small>${f.n} ${plural(f.n, ['сделка', 'сделки', 'сделок'])}${f.sum ? ' · ' + money0(f.sum) : ''}${i && fn[i - 1].n ? ` · <em>${Math.round(f.n / fn[i - 1].n * 100)}% от предыдущего</em>` : ''}</small></div>${crpBar(f.n, fmax, f.s.color)}</div>`).join('')
      + (() => { let worst = null; for (let i = 1; i < fn.length; i++) { if (!fn[i - 1].n) continue; const lossN = fn[i - 1].n - fn[i].n; if (lossN > 0 && (!worst || lossN > worst.n)) worst = { n: lossN, a: fn[i - 1].s.name, b: fn[i].s.name }; } return worst ? `<p class="hint">Больше всего сделок теряется между «${esc(worst.a)}» и «${esc(worst.b)}» — ${worst.n}.</p>` : ''; })()
      : '<div class="empty">За этот период новых сделок не было</div>'}</section>`;
  // причины проигрышей
  const why = {}; lost.forEach(x => { const k = (x.lostWhy || 'Без причины').split(':')[0].trim() || 'Без причины'; why[k] = why[k] || { n: 0, s: 0 }; why[k].n++; why[k].s += +x.amount || 0; });
  const W = Object.entries(why).sort((a, b) => b[1].n - a[1].n), wmax = W[0] ? W[0][1].n : 0;
  const lostHtml = `<section class="pan"><div class="ph2"><h2>Почему проигрываем</h2><small>${lost.length ? lost.length + ' · ' + money0(sum(lost)) : ''}</small></div>
    ${W.map(([k, v]) => `<div class="rrow"><div class="rl"><b>${esc(k)}</b><small>${v.n} ${plural(v.n, ['сделка', 'сделки', 'сделок'])}${v.s ? ' · ' + money0(v.s) : ''}</small></div>${crpBar(v.n, wmax, 'var(--hi)')}</div>`).join('') || '<div class="empty">Проигранных сделок за период нет</div>'}</section>`;
  // источники
  const src = {}; born.forEach(x => { const k = (x.src || '').trim() || 'Не указан'; src[k] = src[k] || { n: 0, w: 0, ws: 0 }; src[k].n++; if (stageOf(x).kind === 'won') { src[k].w++; src[k].ws += +x.amount || 0; } });
  const SR = Object.entries(src).sort((a, b) => b[1].ws - a[1].ws || b[1].n - a[1].n), smax = Math.max(0, ...SR.map(([, v]) => v.n));
  const srcHtml = `<section class="pan"><div class="ph2"><h2>Источники заявок</h2></div>
    ${SR.map(([k, v]) => `<div class="rrow"><div class="rl"><b>${esc(k)}</b><small>${v.n} ${plural(v.n, ['заявка', 'заявки', 'заявок'])} · выиграно ${v.w}${v.ws ? ' на ' + money0(v.ws) : ''}${v.n ? ` · <em>${Math.round(v.w / v.n * 100)}%</em>` : ''}</small></div>${crpBar(v.n, smax, '#14b8a6')}</div>`).join('') || '<div class="empty">За этот период заявок не было</div>'}
    ${SR.some(([k]) => k === 'Не указан') ? '<p class="hint">Заполняйте «Источник» в карточке сделки — станет видно, откуда приходят выгодные клиенты.</p>' : ''}</section>`;
  // доход по клиентам (организация собирает доход своих сотрудников)
  const inc = {}; B().tx.filter(x => x.type === 'income' && x.contact && x.date >= s0d).forEach(x => { const c = crmOf(x.contact); if (!c) return; const key = c.kind === 'person' && crmOf(c.org) ? c.org : c.id; inc[key] = (inc[key] || 0) + x.amount; });
  const CI = Object.entries(inc).sort((a, b) => b[1] - a[1]).slice(0, 10), cmax = CI[0] ? CI[0][1] : 0, ctot = Object.values(inc).reduce((a, b) => a + b, 0);
  const cliHtml = `<section class="pan"><div class="ph2"><h2>Доход по клиентам</h2><small>${ctot ? money0(ctot) : ''}</small></div>
    ${CI.map(([id, v]) => { const c = crmOf(id); return `<div class="rrow" data-act="crmOpen" data-id="${id}" style="cursor:pointer"><div class="rl"><b>${esc(c.name)}</b><small>${money0(v)}${ctot ? ` · <em>${Math.round(v / ctot * 100)}%</em>` : ''}</small></div>${crpBar(v, cmax, 'var(--ok)')}</div>`; }).join('') || '<div class="empty">Доходов с указанным клиентом за период нет. Выбирайте клиента в операциях Бюджета — доход по выигранным сделкам привязывается сам.</div>'}</section>`;
  return `${kpi}
    <section class="pan" style="margin-bottom:1rem"><div class="ph2"><h2>По месяцам</h2><small>выиграно и новые сделки за 12 месяцев</small></div><div class="chartbox"><canvas id="ch-crm"></canvas></div></section>
    <div class="grid2" style="margin-bottom:1rem">${funnel}${lostHtml}</div>
    <div class="grid2">${srcHtml}${cliHtml}</div>`;
}
function crmRepChart() {
  if (!$('#ch-crm')) return;
  const p = curPipe(), n = new Date(), ms = [...Array(12)].map((_, i) => { const d = new Date(n.getFullYear(), n.getMonth() - 11 + i, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
  const L = DL().filter(x => x.pipe === p.id);
  const won = ms.map(m => L.filter(x => stageOf(x).kind === 'won' && x.closedAt && fmtYm(x.closedAt) === m).reduce((a, x) => a + (+x.amount || 0), 0));
  const born = ms.map(m => L.filter(x => x.created && fmtYm(x.created) === m).length);
  chart('ch-crm', { type: 'bar', data: { labels: ms.map(m => MNS[+m.slice(5) - 1]), datasets: [
    { type: 'bar', label: 'Выиграно, ' + cur(), data: won, backgroundColor: cssv('--ok'), borderRadius: 6, maxBarThickness: 30, yAxisID: 'y' },
    { type: 'line', label: 'Новых сделок', data: born, borderColor: cssv('--acc'), backgroundColor: cssv('--acc'), tension: .3, pointRadius: 3, yAxisID: 'y1' }] },
    options: { plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y' ? 'Выиграно: ' + money0(c.parsed.y) : 'Новых сделок: ' + c.parsed.y } } },
      scales: { y: { ...axisMoney, beginAtZero: true, position: 'left' }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
}
{ const M = MODULES.find(m => m.id === 'crm'); if (M) { const a0 = M.after; M.after = function () { if (a0) a0.call(this); if (CRF.tab === 'report') crmRepChart(); }; } }
document.addEventListener('change', e => { if (e.target.id === 'crp-per') { CRP.per = e.target.value; render(); } });

// ---------- черновик письма клиенту ----------
const MAILK = [['offer', 'Коммерческое предложение'], ['after', 'После звонка или встречи'], ['meet', 'Предложить встречу'], ['pay', 'Напомнить об оплате'], ['thanks', 'Благодарность за сделку']];
const MAILD = { kind: 'offer', text: '', busy: false };
function mailHello(c) {
  if (!c || c.kind === 'org') return 'Добрый день!';
  const w = c.name.trim().split(/\s+/);
  return `Здравствуйте, ${w.length >= 3 ? w[1] + ' ' + w[2] : w[0]}!`;
}
// заготовка без помощника — по данным сделки
function mailTemplate(x, kind, extra) {
  const c = crmOf(x.contact), org = c && c.kind === 'person' ? crmOf(c.org) : c && c.kind === 'org' ? c : null, amt = x.amount ? dealAmt(x) : '[сумма]';
  const n = dealNext(x), add = extra ? `\n\n${extra}` : '', sign = '\n\nС уважением,\n[Ваше имя]\n[Телефон]';
  const T = {
    offer: [`Коммерческое предложение: ${x.title}`, `${mailHello(c)}\n\nБлагодарю за интерес${org ? ' со стороны ' + org.name : ''}. Направляю предложение по задаче «${x.title}».\n\nСтоимость: ${amt}.\nСроки: [сроки выполнения].\nЧто входит: [состав работ].${add}\n\nГотов ответить на вопросы и при необходимости скорректировать предложение.`],
    after: [`По итогам разговора: ${x.title}`, `${mailHello(c)}\n\nСпасибо за разговор. Коротко фиксирую, о чём договорились по «${x.title}»:\n— [договорённость 1]\n— [договорённость 2]${n ? `\n\nСледующий шаг: ${n.title.replace(/\s*\(.*\)$/, '')} — ${human(n.date).toLowerCase()}.` : ''}${add}\n\nЕсли что-то упустил — поправьте, пожалуйста.`],
    meet: [`Встреча по вопросу «${x.title}»`, `${mailHello(c)}\n\nПредлагаю встретиться, чтобы обсудить «${x.title}». Мне удобно [день и время], или назовите время, удобное вам.\n\nМесто: [адрес / онлайн].${add}`],
    pay: [`Оплата: ${x.title}`, `${mailHello(c)}\n\nНапоминаю об оплате по «${x.title}» на сумму ${amt}. Счёт [номер] от [дата].${add}\n\nЕсли оплата уже прошла — спасибо, просто сообщите, пожалуйста, дату платежа.`],
    thanks: [`Спасибо за сотрудничество`, `${mailHello(c)}\n\nБлагодарю за доверие и выбор нашего предложения по «${x.title}». Рады работать с вами${org ? ' и командой ' + org.name : ''}.${add}\n\nНа связи по любым вопросам.`]
  };
  const [subj, body] = T[kind] || T.offer;
  return `Тема: ${subj}\n\n${body}${sign}`;
}
async function mailMake() {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  const x = dealOf(F.d.id); if (!x) return;
  const extra = (($('#ml-extra') || {}).value || '').trim();
  if (!aiReady()) { MAILD.text = mailTemplate(x, MAILD.kind, extra); mailDraw(); return mailFocus(); }
  MAILD.busy = true; mailDraw();
  const c = crmOf(x.contact), org = c && c.kind === 'person' ? crmOf(c.org) : null, st = stageOf(x);
  const facts = [`Сделка: ${x.title}`, x.amount ? `Сумма: ${dealAmt(x)}` : '', `Этап: ${st.name}`, c ? `Клиент: ${c.name}${c.role ? ', ' + c.role : ''}${org ? ', ' + org.name : ''}` : '', x.note ? `Заметка: ${x.note}` : '',
    ...(x.log || []).slice(-6).map(l => `${fmtTs(l.at)} — ${(LOGK[l.kind] || ['Событие'])[0]}: ${l.text}`), dealNext(x) ? `Следующий шаг: ${dealNext(x).title} (${human(dealNext(x).date)})` : ''].filter(Boolean).join('\n');
  try {
    const r = await aiAsk([{ role: 'system', content: 'Ты помогаешь составить деловое письмо клиенту на русском языке. Пиши вежливо, коротко и по делу, без канцелярита. Не выдумывай факты, цифры, даты и обещания, которых нет в данных — вместо них оставь пометку в квадратных скобках. Формат ответа: первая строка «Тема: …», пустая строка, текст письма с обращением и подписью «С уважением,\n[Ваше имя]».' },
      { role: 'user', content: `Вид письма: ${(MAILK.find(k => k[0] === MAILD.kind) || MAILK[0])[1]}.\n${extra ? 'Что обязательно сказать: ' + extra + '\n' : ''}\nДанные:\n${facts}` }], 900, 0.4);
    MAILD.text = r.text;
  } catch (e) { MAILD.text = mailTemplate(x, MAILD.kind, extra); toast('Помощник не ответил (' + e.message + ') — показана заготовка'); }
  MAILD.busy = false; mailDraw(); mailFocus();
}
function mailSheet() {
  const F = UI.form; if (!F || F.kind !== 'deal') return;
  if (F.isNew && !dealCommit(true)) return;
  MAILD.text = ''; MAILD.busy = false; mailDraw();
}
function mailDraw() {
  const F = UI.form, x = F && dealOf(F.d.id); if (!x) return;
  const c = crmOf(x.contact), em = c && (c.emails || [])[0], extra = ($('#ml-extra') || {}).value || '';
  sheet(`<div class="shh"><b>Письмо клиенту</b><small>${esc(x.title)}${c ? ' · ' + esc(c.name) : ''}</small></div>
    <div class="shl mailsh"><div class="chips cnxt">${MAILK.map(([k, l]) => `<button class="chip ${MAILD.kind === k ? 'on' : ''}" data-act="mailKind" data-v="${k}">${l}</button>`).join('')}</div>
      <label class="f"><span>Что важно сказать (необязательно)</span><input class="in" id="ml-extra" value="${esc(extra)}" maxlength="400" placeholder="например, скидка 5% при оплате до конца месяца" autocomplete="off"></label>
      <button class="btn pri" data-act="mailMake" ${MAILD.busy ? 'disabled' : ''}>${ic('spark')} ${MAILD.busy ? 'Помощник пишет…' : MAILD.text ? 'Составить заново' : 'Составить'}</button>
      <p class="hint">${aiReady() ? 'Письмо составит помощник YandexGPT — данные сделки отправятся в Yandex AI Studio. Проверьте текст перед отправкой.' : 'Помощник не подключён — будет заготовка по данным сделки, поля в [скобках] заполните сами. Подключить помощника: Настройки → Помощник.'}</p>
      ${MAILD.text ? `<textarea class="in mailta" id="ml-text" rows="12">${esc(MAILD.text)}</textarea>
      <div class="shf"><button class="btn" data-act="mailCopy">${ic('copy')} Скопировать</button>${em ? `<button class="btn" data-act="mailSend" data-v="${esc(em)}">${ic('mail')} Открыть в почте</button>` : ''}<span class="spacer"></span><button class="btn ghost" data-act="mailLog">В ленту сделки</button></div>` : ''}</div>`);
}
const mailFocus = () => setTimeout(() => { const t = $('#ml-text'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
const mailParts = () => { const t = (($('#ml-text') || {}).value || MAILD.text || '').trim(), m = /^Тема:\s*(.*)\n+/i.exec(t); return m ? { subj: m[1].trim(), body: t.slice(m[0].length).trim() } : { subj: '', body: t }; };
// кнопка в ленте сделки
{
  const d0 = drawDealForm;
  drawDealForm = function () { d0(); const h = $('.dealbox .ccols .pan .ph2'); if (h && !UI.form.isNew) h.insertAdjacentHTML('beforeend', `<span class="spacer"></span><button class="btn sm" data-act="mailOpen">${ic('mail')}<span class="hm"> Письмо</span></button>`); };
}
Object.assign(ACT, {
  mailOpen: () => { dealRead(); mailSheet(); },
  mailKind: b => { MAILD.kind = b.dataset.v; MAILD.text = ''; mailDraw(); },
  mailMake: () => mailMake(),
  mailCopy: async () => { const p = mailParts(); try { await navigator.clipboard.writeText((p.subj ? 'Тема: ' + p.subj + '\n\n' : '') + p.body); toast('Письмо скопировано'); } catch (e) { toast('Не удалось скопировать — выделите текст вручную'); } },
  mailSend: b => { const p = mailParts(); openExternal(`mailto:${encodeURIComponent(b.dataset.v)}?subject=${encodeURIComponent(p.subj)}&body=${encodeURIComponent(p.body)}`); },
  mailLog: () => { const F = UI.form, x = F && dealOf(F.d.id); if (!x) return; const p = mailParts(); snapU(); x.log = [...(x.log || []), { id: uid(), at: Date.now(), kind: 'mail', text: p.subj || (MAILK.find(k => k[0] === MAILD.kind) || MAILK[0])[1] }]; x.upd = Date.now(); save(); closeSheet(); F.d = clone(x); drawDealForm(); toast('Записано в ленту сделки', true); }
});
