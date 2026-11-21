'use strict';
// ============================================================
//  Этап 8. Подписка на внешние календари (iCal / .ics по ссылке): Google, Яндекс, Outlook, расписания.
//  События только для просмотра; любое можно превратить в задачу.
// ============================================================
ICONS.rss = '<path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.6"/>';
const ICS_COL = ['#7C8CF8', '#22C3A6', '#F59E0B', '#EC4899', '#60A5FA', '#A3A3A3'];
const ICS_WIN = [-90, 400]; // какие дни держим развёрнутыми: от 90 дней назад до 400 вперёд
const IC = () => (D.icals = Array.isArray(D.icals) ? D.icals : []);
const WINTZ = { 'Russian Standard Time': 'Europe/Moscow', 'Ekaterinburg Standard Time': 'Asia/Yekaterinburg', 'N. Central Asia Standard Time': 'Asia/Novosibirsk', 'North Asia Standard Time': 'Asia/Krasnoyarsk', 'Kaliningrad Standard Time': 'Europe/Kaliningrad', 'Volgograd Standard Time': 'Europe/Volgograd', 'Russia Time Zone 3': 'Europe/Samara', 'Omsk Standard Time': 'Asia/Omsk', 'North Asia East Standard Time': 'Asia/Irkutsk', 'Yakutsk Standard Time': 'Asia/Yakutsk', 'Vladivostok Standard Time': 'Asia/Vladivostok', 'UTC': 'UTC', 'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest', 'FLE Standard Time': 'Europe/Kiev', 'Belarus Standard Time': 'Europe/Minsk', 'Pacific Standard Time': 'America/Los_Angeles', 'Eastern Standard Time': 'America/New_York' };
// --- разбор .ics ---
function icsLines(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/), evs = []; let cur = null, depth = 0;
  for (const ln of lines) {
    if (ln === 'BEGIN:VEVENT') { cur = {}; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/.test(ln)) { depth++; continue; } // VALARM и т. п. внутри события
    if (/^END:/.test(ln)) { if (ln === 'END:VEVENT' && !depth) { evs.push(cur); cur = null; } else depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const i = ln.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/); if (i < 0) continue;
    const [name, ...ps] = ln.slice(0, i).split(';'), P = {}; ps.forEach(p => { const k = p.indexOf('='); if (k > 0) P[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); });
    const N = name.toUpperCase(), o = { v: ln.slice(i + 1), P };
    if (N === 'EXDATE') (cur.EXDATE = cur.EXDATE || []).push(...o.v.split(',').map(v => ({ v, P })));
    else cur[N] = o;
  }
  return evs;
}
const icsText = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
function tzOff(ms, tz) {
  try { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms; }
  catch (e) { return null; }
}
function zoned(Y, M, Dd, h, mi, s, tz) {
  tz = WINTZ[tz] || tz; const g = Date.UTC(Y, M - 1, Dd, h, mi, s), o1 = tzOff(g, tz);
  if (o1 == null) return new Date(Y, M - 1, Dd, h, mi, s).getTime();
  const o2 = tzOff(g - o1, tz); return g - (o2 == null ? o1 : o2);
}
// → { all: true, d } для «весь день» или { all: false, ms }
function icsWhen(o) {
  if (!o) return null; const v = o.v.trim();
  if (o.P.VALUE === 'DATE' || /^\d{8}$/.test(v)) return { all: true, d: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/); if (!m) return null;
  const [Y, Mo, Dd, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || 0].map(Number);
  return { all: false, ms: m[7] ? Date.UTC(Y, Mo - 1, Dd, h, mi, s) : o.P.TZID ? zoned(Y, Mo, Dd, h, mi, s, o.P.TZID) : new Date(Y, Mo - 1, Dd, h, mi, s).getTime() };
}
function icsDur(v) { const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/); if (!m) return 0; return ((+m[2] || 0) * 7 * 864e5 + (+m[3] || 0) * 864e5 + (+m[4] || 0) * 36e5 + (+m[5] || 0) * 6e4 + (+m[6] || 0) * 1e3) * (m[1] === '-' ? -1 : 1); }
const WDI = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const keyOf = w => w.all ? w.d : String(w.ms);
// повторения: DAILY / WEEKLY (BYDAY) / MONTHLY (BYMONTHDAY, BYDAY с номером) / YEARLY; COUNT, UNTIL, INTERVAL
function icsRepeat(start, rule, from, to) {
  const R = {}; String(rule).split(';').forEach(p => { const [k, v] = p.split('='); if (k) R[k.toUpperCase()] = v; });
  const iv = Math.max(1, +R.INTERVAL || 1), count = +R.COUNT || 0, until = R.UNTIL ? icsWhen({ v: R.UNTIL, P: {} }) : null;
  const untilMs = until ? (until.all ? pd(until.d).getTime() + 864e5 - 1 : until.ms) : Infinity;
  const base = start.all ? pd(start.d) : new Date(start.ms), out = [];
  const mk = dt => start.all ? { all: true, d: ymd(dt) } : { all: false, ms: dt.getTime() };
  const at = (y, m, d) => { const x = new Date(base); x.setFullYear(y, m, d); return x; };
  const byday = (R.BYDAY || '').split(',').filter(Boolean).map(s => { const m = s.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); return m ? { n: m[1] ? +m[1] : 0, w: WDI[m[2]] } : null; }).filter(Boolean);
  const bymd = (R.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
  let n = 0, guard = 0;
  const push = dt => { const t = dt.getTime(); if (t < base.getTime()) return true; if (t > untilMs || (count && n >= count)) return false; n++; const w = mk(dt), ms = start.all ? pd(w.d).getTime() : w.ms; if (ms >= from && ms <= to) out.push(w); return ms <= to; };
  if (R.FREQ === 'DAILY') { for (let x = new Date(base); guard++ < 6000; x.setDate(x.getDate() + iv)) if (!push(new Date(x))) break; }
  else if (R.FREQ === 'WEEKLY') {
    const days = byday.length ? byday.map(b => b.w) : [base.getDay()], ws = new Date(base); ws.setDate(ws.getDate() - (ws.getDay() + 6) % 7);
    outer: for (let w = new Date(ws); guard++ < 3000; w.setDate(w.getDate() + 7 * iv)) for (const wd of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) { const x = new Date(w); x.setDate(w.getDate() + (wd + 6) % 7); if (!push(x)) break outer; }
  } else if (R.FREQ === 'MONTHLY') {
    outer: for (let k = 0; guard++ < 1500; k += iv) {
      const y = base.getFullYear(), m = base.getMonth() + k, ym = new Date(y, m, 1), dim = new Date(ym.getFullYear(), ym.getMonth() + 1, 0).getDate(), c = [];
      if (byday.length) byday.forEach(b => { const all = []; for (let d = 1; d <= dim; d++) if (new Date(ym.getFullYear(), ym.getMonth(), d).getDay() === b.w) all.push(d); const pick = b.n > 0 ? [all[b.n - 1]] : b.n < 0 ? [all[all.length + b.n]] : all; pick.filter(Boolean).forEach(d => c.push(d)); });
      else if (bymd.length) bymd.forEach(d => { const dd = d < 0 ? dim + d + 1 : d; if (dd >= 1 && dd <= dim) c.push(dd); });
      else if (base.getDate() <= dim) c.push(base.getDate());
      for (const d of c.sort((a, b) => a - b)) if (!push(at(ym.getFullYear(), ym.getMonth(), d))) break outer;
    }
  } else if (R.FREQ === 'YEARLY') { for (let k = 0; guard++ < 200; k += iv) { const x = at(base.getFullYear() + k, base.getMonth(), base.getDate()); if (x.getMonth() !== base.getMonth()) continue; if (!push(x)) break; } }
  else out.push(start);
  return out;
}
function icsEvents(text) {
  const raw = icsLines(text), now = Date.now(), from = now + ICS_WIN[0] * 864e5, to = now + ICS_WIN[1] * 864e5, out = [];
  const over = {}; raw.forEach(e => { if (e['RECURRENCE-ID'] && e.UID) { const w = icsWhen(e['RECURRENCE-ID']); if (w) (over[e.UID.v] = over[e.UID.v] || new Set()).add(keyOf(w)); } });
  for (const e of raw) {
    if (e.STATUS && /CANCELLED/i.test(e.STATUS.v)) continue;
    const s = icsWhen(e.DTSTART); if (!s) continue;
    const en = icsWhen(e.DTEND), dur = en ? (s.all ? Math.max(1, diff(s.d, en.all ? en.d : ymd(new Date(en.ms)))) : Math.max(0, en.ms - s.ms)) : e.DURATION ? (s.all ? Math.max(1, Math.round(icsDur(e.DURATION.v) / 864e5)) : icsDur(e.DURATION.v)) : (s.all ? 1 : 0);
    const ex = new Set((e.EXDATE || []).map(x => icsWhen(x)).filter(Boolean).map(keyOf)), ov = (!e['RECURRENCE-ID'] && e.UID && over[e.UID.v]) || new Set();
    const occ = e.RRULE && !e['RECURRENCE-ID'] ? icsRepeat(s, e.RRULE.v, from, to) : [s];
    for (const w of occ) {
      if (ex.has(keyOf(w)) || ov.has(keyOf(w))) continue;
      const base = { u: (e.UID ? e.UID.v : '') + '@' + keyOf(w), t: icsText(e.SUMMARY && e.SUMMARY.v) || 'Без названия', loc: icsText(e.LOCATION && e.LOCATION.v).slice(0, 200), desc: icsText(e.DESCRIPTION && e.DESCRIPTION.v).slice(0, 600) };
      if (w.all) { if (pd(w.d).getTime() + dur * 864e5 < from || pd(w.d).getTime() > to) continue; out.push({ ...base, d: w.d, de: addDays(w.d, dur - 1) }); }
      else { if (w.ms + dur < from || w.ms > to) continue; const a = new Date(w.ms), b = new Date(w.ms + dur); out.push({ ...base, d: ymd(a), de: ymd(new Date(w.ms + Math.max(0, dur - 1))), st: pad(a.getHours()) + ':' + pad(a.getMinutes()), et: pad(b.getHours()) + ':' + pad(b.getMinutes()) }); }
      if (out.length > 3000) break;
    }
  }
  return out.sort((a, b) => a.d.localeCompare(b.d) || (a.st || '').localeCompare(b.st || ''));
}
// --- загрузка ---
const icsUrl = u => String(u || '').trim().replace(/^webcal:\/\//i, 'https://');
async function icalFetch(c) {
  if (!hasApi || !window.api.netGet) throw new Error('загрузка по ссылке работает в программе на компьютере и телефоне');
  const r = await window.api.netGet(icsUrl(c.url));
  if (!r || r.status !== 200) throw new Error(r && r.error ? r.error : 'сервер ответил ' + (r ? r.status : 'ошибкой'));
  const bin = atob(r.b64 || ''), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const text = new TextDecoder('utf-8').decode(u8);
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('по ссылке не календарь iCal — нужна ссылка на .ics');
  const name = (text.match(/^X-WR-CALNAME:(.*)$/m) || [])[1];
  return { ev: icsEvents(text), name: name ? icsText(name) : '' };
}
async function icalSync(c, quiet) {
  c.busy = true; if (!quiet) render();
  try { const r = await icalFetch(c); c.ev = r.ev; if (!c.name && r.name) c.name = r.name; c.last = Date.now(); c.err = null; }
  catch (e) { c.err = String((e && e.message) || e).slice(0, 200); }
  finally { c.busy = false; }
  save(); if (UI.view === 'calendar' || $('#icbox')) { if ($('#icbox')) icalPanel(); else render(); }
  return !c.err;
}
let icalT = null;
function icalAuto() { clearTimeout(icalT); IC().filter(c => c.on !== false && (!c.last || Date.now() - c.last > 6 * 36e5)).forEach(c => icalSync(c, true)); icalT = setTimeout(icalAuto, 30 * 60000); }
// события на день (многодневные — на каждый день)
function extOn(d) {
  if (CT().ext === false) return [];
  const out = []; IC().forEach(c => { if (c.on === false) return; (c.ev || []).forEach(x => { if (x.d <= d && (x.de || x.d) >= d) out.push({ ...x, c }); }); });
  return out.sort((a, b) => (a.st || '').localeCompare(b.st || ''));
}
const extTime = x => x.st ? `${x.st}${x.et && x.et !== x.st ? '–' + x.et : ''}` : 'весь день';
function extDetail(cid, u) {
  const c = IC().find(x => x.id === cid), x = c && (c.ev || []).find(e => e.u === u); if (!x) return;
  modal(`<div class="mbox"><div class="mh"><h2><span class="exdot" style="--c:${c.color}"></span>${esc(x.t)}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <div class="mb"><p><b>${x.de && x.de !== x.d ? `${human(x.d)} — ${human(x.de).toLowerCase()}` : dayLong(x.d)}</b>, ${extTime(x)}</p>
    ${x.loc ? `<p>${ic('pin')} ${esc(x.loc)}</p>` : ''}${x.desc ? `<p class="exdesc">${linkify(x.desc)}</p>` : ''}
    <p class="hint">Календарь «${esc(c.name || 'Подписка')}» — только для просмотра. Изменения делайте там, откуда он подключён.</p></div>
  <div class="mf"><span class="spacer"></span><button class="btn pri" data-act="extTask" data-c="${cid}" data-u="${esc(u)}">${ic('board')} Сделать задачей</button></div></div>`);
}
function icalPanel() {
  const L = IC();
  modal(`<div class="mbox" id="icbox"><div class="mh"><h2>${ic('rss')} Внешние календари</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <div class="mb">
    ${L.map(c => `<div class="icrow" style="--c:${c.color}"><input type="checkbox" class="tog" data-icon="${c.id}" ${c.on !== false ? 'checked' : ''} aria-label="Показывать"><div class="tx"><b><span class="exdot"></span>${esc(c.name || 'Календарь')}</b><small>${c.busy ? 'загружается…' : c.err ? `<span class="red">Ошибка: ${esc(c.err)}</span>` : c.last ? `${(c.ev || []).length} ${plural((c.ev || []).length, ['событие', 'события', 'событий'])} · обновлено ${fmtTs(c.last)}` : 'ещё не загружен'}</small><small class="icu">${esc(c.url)}</small></div>
      <button class="ib" data-act="icRef" data-id="${c.id}" title="Обновить">${ic('sync')}</button><button class="ib" data-act="icDel" data-id="${c.id}" title="Отписаться">${ic('trash')}</button></div>`).join('') || '<p class="hint">Подписок пока нет.</p>'}
    <h3 class="hh3">Добавить календарь</h3>
    <label class="f"><span>Ссылка на календарь (iCal, .ics)</span><input class="in" id="ic-url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autocomplete="off"></label>
    <div class="row two"><label class="f"><span>Название (необязательно)</span><input class="in" id="ic-name" placeholder="Рабочий, Праздники…" maxlength="40"></label>
      <div class="f"><span>Цвет</span><div class="hcol">${ICS_COL.map((c, i) => `<button type="button" class="${i === L.length % ICS_COL.length ? 'on' : ''}" style="--c:${c}" data-act="icCol" data-v="${c}" aria-label="Цвет"></button>`).join('')}</div></div></div>
    <button class="btn pri" data-act="icAdd">${ic('plus')} Подписаться</button>
    <details class="ichelp"><summary>Где взять ссылку</summary><ul>
      <li><b>Google Календарь</b>: настройки календаря → «Интеграция календаря» → «Секретный адрес в формате iCal».</li>
      <li><b>Яндекс Календарь</b>: настройки календаря → «Экспорт» → ссылка «iCal».</li>
      <li><b>Outlook</b>: Параметры → Календарь → Общие календари → «Опубликовать календарь» → ссылка ICS.</li>
      <li>Праздники, расписания, спортивные события — любая ссылка, оканчивающаяся на .ics.</li></ul>
      <p class="hint">Календари обновляются сами раз в 6 часов. События только для просмотра; любое можно превратить в задачу.</p></details>
  </div></div>`);
  UI.icCol = ICS_COL[L.length % ICS_COL.length];
}
document.addEventListener('change', e => { const id = e.target.dataset && e.target.dataset.icon; if (!id) return; const c = IC().find(x => x.id === id); if (!c) return; c.on = e.target.checked; save(); if (c.on && !c.last) icalSync(c); });
Object.assign(ACT, {
  icPanel: () => icalPanel(),
  icCol: b => { UI.icCol = b.dataset.v; $$('#icbox .hcol button').forEach(x => x.classList.toggle('on', x === b)); },
  icAdd: async () => {
    const url = icsUrl($('#ic-url').value); if (!/^https?:\/\/\S+$/i.test(url)) { $('#ic-url').focus(); toast('Вставьте ссылку на календарь'); return; }
    if (IC().some(c => icsUrl(c.url) === url)) { toast('Этот календарь уже подключён'); return; }
    const c = { id: uid(), url, name: $('#ic-name').value.trim(), color: UI.icCol || ICS_COL[0], on: true, ev: [], last: 0 };
    IC().push(c); save(); icalPanel();
    const ok = await icalSync(c); toast(ok ? `Календарь «${c.name || 'подписка'}»: ${(c.ev || []).length} ${plural((c.ev || []).length, ['событие', 'события', 'событий'])}` : 'Не удалось загрузить календарь: ' + c.err);
  },
  icRef: b => { const c = IC().find(x => x.id === b.dataset.id); if (c) icalSync(c); },
  icDel: b => { const c = IC().find(x => x.id === b.dataset.id); if (!c) return; D.icals = IC().filter(x => x !== c); save(); icalPanel(); render(); toast('Подписка удалена'); },
  extOpen: b => extDetail(b.dataset.c, b.dataset.u),
  extTask: b => {
    const c = IC().find(x => x.id === b.dataset.c), x = c && (c.ev || []).find(e => e.u === b.dataset.u); if (!x) return;
    const t = newTask({ title: x.t.slice(0, 200), desc: [x.loc, x.desc].filter(Boolean).join('\n').slice(0, 2000), date: x.d, time: x.st || null, dur: x.st && x.et && x.et > x.st ? toMin(x.et) - toMin(x.st) : null, col: firstCol().id });
    snapU(); addTask(t); save(); closeModal(); render(); toast('Задача создана из события', true, { act: 'openTask', id: t.id, label: 'Открыть' });
  }
});
const extAttr = (x, noStyle) => `data-act="extOpen" data-c="${x.c.id}" data-u="${esc(x.u)}" ${noStyle ? '' : `style="--c:${x.c.color}"`} title="${esc(x.t)} · ${extTime(x)} · ${esc(x.c.name || '')}"`;
setTimeout(() => { if (typeof D !== 'undefined' && D) icalAuto(); else setTimeout(icalAuto, 5000); }, 6000);
