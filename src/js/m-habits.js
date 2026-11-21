'use strict';
// ============================================================
//  Этап 3. Модуль «Привычки»: отметки по дням, серии, тепловая карта, напоминания
// ============================================================
ICONS.habit = '<path d="M12 21c-4.4 0-7.5-3-7.5-7 0-3.5 2.5-5.6 4-7.5.3 2 1.3 3 2.3 3.3C10.5 6.5 12.5 4 15 3c-.5 3 1 5 2.3 6.6 1.2 1.4 2.2 2.8 2.2 4.4 0 4-3.1 7-7.5 7z"/><path d="M12 21c-1.8 0-3-1.3-3-3 0-1.8 1.6-2.8 3-4.5 1.4 1.7 3 2.7 3 4.5 0 1.7-1.2 3-3 3z"/>';
const HEMO = ['💧', '🏃', '📚', '🧘', '💪', '🥗', '😴', '🦷', '💊', '🚶', '🧹', '✍️', '🎸', '🌱', '🚭', '⭐'];
const HCOL = ['#4D8DFF', '#2FBF71', '#F5A524', '#EF5B5B', '#A66BFF', '#14B8A6', '#EC4899', '#F97316'];
const HMON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const HWD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const HF = { show: 'active' };
const HB = () => (D.habits = Array.isArray(D.habits) ? D.habits : []);
const habOf = id => HB().find(h => h.id === id);
const wkStart = d => addDays(d, -((pd(d).getDay() + 6) % 7));
const hGoal = h => Math.max(1, h.goal || 1);
const hCnt = (h, d) => (h.log && h.log[d]) || 0;
const hDone = (h, d) => hCnt(h, d) >= hGoal(h);
const hSched = (h, d) => h.freq !== 'days' || (h.days || []).includes(pd(d).getDay());
const hFirst = h => { const k = Object.keys(h.log || {}).filter(d => (h.log[d] || 0) > 0).sort()[0], s = ymd(new Date(h.created || Date.now())); return k && k < s ? k : s; };
const hWeekCnt = (h, w) => [...Array(7)].filter((_, i) => hDone(h, addDays(w, i))).length;
function hFreqTxt(h) {
  if (h.freq === 'days') { const d = [1, 2, 3, 4, 5, 6, 0].filter(x => (h.days || []).includes(x)); return d.length === 7 ? 'каждый день' : d.length === 5 && !d.includes(0) && !d.includes(6) ? 'по будням' : d.map(x => HWD[x]).join(', '); }
  if (h.freq === 'times') return `${h.n || 3} ${plural(h.n || 3, ['раз', 'раза', 'раз'])} в неделю`;
  return 'каждый день';
}
// текущая серия: дни подряд (или недели для «N раз в неделю»)
function hStreak(h) {
  const td = today(), first = hFirst(h);
  if (h.freq === 'times') {
    let s = 0, w = wkStart(td); const n = h.n || 3;
    if (hWeekCnt(h, w) >= n) s++;
    w = addDays(w, -7);
    while (w >= wkStart(first) && hWeekCnt(h, w) >= n) { s++; w = addDays(w, -7); }
    return { v: s, u: 'нед', w: true };
  }
  let s = 0, d = hDone(h, td) ? td : addDays(td, -1);
  while (d >= first) { if (hSched(h, d)) { if (hDone(h, d)) s++; else break; } d = addDays(d, -1); }
  return { v: s, u: 'дн' };
}
function hBest(h) {
  const td = today(), first = hFirst(h); let best = 0, cur = 0;
  if (h.freq === 'times') { for (let w = wkStart(first); w <= wkStart(td); w = addDays(w, 7)) { if (hWeekCnt(h, w) >= (h.n || 3)) best = Math.max(best, ++cur); else if (w < wkStart(td)) cur = 0; } return best; }
  for (let d = first; d <= td; d = addDays(d, 1)) { if (!hSched(h, d)) continue; if (hDone(h, d)) best = Math.max(best, ++cur); else if (d < td) cur = 0; }
  return best;
}
// доля выполнения за последние 30 дней (с момента начала)
function hRate(h, days = 30) {
  const td = today(), first = hFirst(h), from = addDays(td, -(days - 1)) > first ? addDays(td, -(days - 1)) : first;
  if (h.freq === 'times') {
    let need = 0, got = 0;
    for (let w = wkStart(from); w <= wkStart(td); w = addDays(w, 7)) { const cnt = Math.min(hWeekCnt(h, w), h.n || 3); if (w === wkStart(td)) { if (cnt) { need += h.n || 3; got += cnt; } } else { need += h.n || 3; got += cnt; } }
    return need ? got / need : 0;
  }
  let need = 0, got = 0;
  for (let d = from; d <= td; d = addDays(d, 1)) { if (!hSched(h, d)) continue; if (d === td && !hDone(h, d)) continue; need++; if (hDone(h, d)) got++; }
  return need ? got / need : 0;
}
const hTotal = h => Object.keys(h.log || {}).filter(d => hDone(h, d)).length;
function hToday(h) { const td = today(); if (h.freq === 'times') return hWeekCnt(h, wkStart(td)) < (h.n || 3) || hDone(h, td); return hSched(h, td); }
const habActive = () => HB().filter(h => !h.archived).sort((a, b) => (a.order || 0) - (b.order || 0));

// --- отрисовка ---
function habWeek(h) {
  const td = today();
  return `<div class="hweek">${[...Array(7)].map((_, i) => { const d = addDays(td, i - 6), c = hCnt(h, d), dn = hDone(h, d), sc = hSched(h, d) && d >= hFirst(h);
    return `<button class="hd ${dn ? 'on' : c ? 'part' : ''} ${sc ? '' : 'off'} ${d === td ? 'tod' : ''}" data-act="habDay" data-id="${h.id}" data-d="${d}" title="${dayLong(d)}${hGoal(h) > 1 ? ': ' + c + ' из ' + hGoal(h) : ''}"><span>${HWD[pd(d).getDay()]}</span><i></i></button>`; }).join('')}</div>`;
}
function habCard(h) {
  const td = today(), c = hCnt(h, td), g = hGoal(h), dn = hDone(h, td), st = hStreak(h), act = hToday(h);
  const wk = h.freq === 'times' ? ` · неделя ${Math.min(hWeekCnt(h, wkStart(td)), h.n || 3)}/${h.n || 3}` : '';
  return `<div class="hab ${dn ? 'done' : ''} ${act ? '' : 'rest'}" style="--c:${h.color || HCOL[0]}" data-hid="${h.id}">
    <button class="hchk" data-act="habTick" data-id="${h.id}" aria-label="${dn ? 'Снять отметку' : 'Отметить'}">${g > 1 && !dn ? `<b>${c}</b><small>/${g}</small>` : ic('check')}</button>
    <div class="htx" data-act="habOpen" data-id="${h.id}"><b><span class="he">${h.icon || '⭐'}</span>${esc(h.title)}</b><small>${hFreqTxt(h)}${g > 1 ? ` · ${g} ${esc(h.unit || 'раз')} в день` : ''}${wk}${act ? '' : ' · сегодня отдых'}</small></div>
    <div class="hst" title="Текущая серия">${st.v ? `<b>🔥 ${st.v}</b><small>${st.w ? plural(st.v, ['неделя', 'недели', 'недель']) : plural(st.v, PD)}</small>` : '<small>серии нет</small>'}</div>
    ${habWeek(h)}</div>`;
}
function habHeat(h) {
  const td = today(), end = addDays(wkStart(td), 6), start = addDays(end, -7 * 53 + 1), first = hFirst(h), g = hGoal(h);
  let cols = '', lastM = -1, months = '';
  for (let w = 0; w < 53; w++) {
    const ws = addDays(start, w * 7), m = pd(ws).getMonth();
    months += `<span>${m !== lastM && pd(ws).getDate() <= 7 ? HMON[m] : ''}</span>`; if (pd(ws).getDate() <= 7) lastM = m;
    cols += `<div>${[...Array(7)].map((_, i) => { const d = addDays(ws, i); if (d > td) return '<i class="fut"></i>'; const c = hCnt(h, d), lv = c ? Math.min(4, Math.ceil(c / g * 4)) : 0, miss = !c && d >= first && hSched(h, d) && h.freq !== 'times' && d < td;
      return `<i class="l${lv} ${miss ? 'miss' : ''}" data-act="habDay" data-id="${h.id}" data-d="${d}" title="${dayLong(d)}${c ? ': ' + (g > 1 ? c + ' из ' + g : 'выполнено') : ''}"></i>`; }).join('')}</div>`;
  }
  return `<div class="hheat" style="--c:${h.color || HCOL[0]}"><div class="hhm">${months}</div><div class="hhg"><div class="hhd"><span>Пн</span><span></span><span>Ср</span><span></span><span>Пт</span><span></span><span></span></div><div class="hhc">${cols}</div></div></div>`;
}
function habDetail(id) {
  const h = habOf(id); if (!h) return;
  const st = hStreak(h), best = hBest(h), r = hRate(h), tot = hTotal(h);
  modal(`<div class="mbox wide"><div class="mh"><h2><span class="he">${h.icon || '⭐'}</span>${esc(h.title)}</h2><button class="btn sm ghost" data-act="habEdit" data-id="${id}">${ic('edit')} Изменить</button><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <div class="mb">
    <p class="hint">${hFreqTxt(h)}${hGoal(h) > 1 ? ` · цель ${hGoal(h)} ${esc(h.unit || 'раз')} в день` : ''}${h.remind ? ` · напоминание в ${h.remind}` : ''} · начало ${human(hFirst(h)).toLowerCase()}</p>
    <div class="fstat hstat"><div><b>🔥 ${st.v}</b><span>текущая серия, ${st.w ? 'нед.' : 'дн.'}</span></div><div><b>${best}</b><span>лучшая серия</span></div><div><b>${Math.round(r * 100)}%</b><span>выполнено за 30 дней</span></div><div><b>${tot}</b><span>всего ${plural(tot, PD)}</span></div></div>
    <h3 class="hh3">Год по дням <small>нажмите на клетку, чтобы отметить или снять отметку</small></h3>
    ${habHeat(h)}
  </div></div>`);
  setTimeout(() => { const x = $('.hheat'); if (x) x.scrollLeft = x.scrollWidth; }, 0);
}
function habForm(id) {
  const h = habOf(id) || { id: null, title: '', icon: HEMO[0], color: HCOL[HB().length % HCOL.length], freq: 'daily', days: [1, 2, 3, 4, 5], n: 3, goal: 1, unit: '', remind: null };
  UI.hform = { icon: h.icon, color: h.color };
  modal(`<div class="mbox"><div class="mh"><h2>${h.id ? 'Привычка' : 'Новая привычка'}</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <form class="mb" id="hform" autocomplete="off">
    <label class="f"><span>Название</span><input class="in title" id="h-title" value="${esc(h.title)}" placeholder="Например: выпить воду, зарядка, читать 20 минут" maxlength="80"></label>
    <div class="f"><span>Значок</span><div class="hemo">${HEMO.map(e => `<button type="button" class="${e === h.icon ? 'on' : ''}" data-act="habEmo" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="f"><span>Цвет</span><div class="hcol">${HCOL.map(c => `<button type="button" class="${c === h.color ? 'on' : ''}" style="--c:${c}" data-act="habCol" data-v="${c}" aria-label="Цвет"></button>`).join('')}</div></div>
    <div class="row two"><label class="f"><span>Как часто</span><select class="in" id="h-freq"><option value="daily" ${h.freq === 'daily' ? 'selected' : ''}>Каждый день</option><option value="days" ${h.freq === 'days' ? 'selected' : ''}>По дням недели</option><option value="times" ${h.freq === 'times' ? 'selected' : ''}>Несколько раз в неделю</option></select></label>
      <label class="f" id="h-nw" ${h.freq === 'times' ? '' : 'hidden'}><span>Раз в неделю</span><input class="in" type="number" min="1" max="7" id="h-n" value="${h.n || 3}"></label></div>
    <div class="f" id="h-dw" ${h.freq === 'days' ? '' : 'hidden'}><span>Дни</span><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="chip ${(h.days || []).includes(d) ? 'on' : ''}" data-act="habWd" data-v="${d}">${HWD[d]}</button>`).join('')}</div></div>
    <div class="row two"><label class="f"><span>Сколько раз за день</span><input class="in" type="number" min="1" max="50" id="h-goal" value="${hGoal(h)}"></label>
      <label class="f"><span>Единица (необязательно)</span><input class="in" id="h-unit" value="${esc(h.unit || '')}" placeholder="стаканов, страниц…" maxlength="20"></label></div>
    <label class="f"><span>Напоминание (если не отмечено)</span><input class="in" type="time" id="h-rem" value="${h.remind || ''}"></label>
  </form>
  <div class="mf">${h.id ? `<button class="btn ghost danger" data-act="habDel" data-id="${h.id}">${ic('trash')} Удалить</button><button class="btn ghost" data-act="habArch" data-id="${h.id}">${h.archived ? 'Вернуть из архива' : 'В архив'}</button>` : ''}<span class="spacer"></span><button class="btn" data-act="mclose">Отмена</button><button class="btn pri" data-act="habSave" data-id="${h.id || ''}">Сохранить</button></div></div>`);
  setTimeout(() => { const i = $('#h-title'); if (i) i.focus(); }, 30);
}
document.addEventListener('change', e => { if (e.target.id === 'h-freq') { $('#h-nw').hidden = e.target.value !== 'times'; $('#h-dw').hidden = e.target.value !== 'days'; } });
function habDashCard() {
  const L = habActive().filter(hToday); if (!habActive().length) return '';
  const dn = L.filter(h => hDone(h, today())).length;
  return `<section class="pan"><div class="ph2"><h2>${ic('habit')} Привычки</h2><small>${dn} из ${L.length}</small><span class="spacer"></span><button class="btn sm ghost" data-act="go" data-v="habits">Все</button></div>
    <div class="hmini">${L.map(h => { const d = hDone(h, today()), c = hCnt(h, today()), g = hGoal(h), st = hStreak(h); return `<button class="${d ? 'on' : ''}" style="--c:${h.color || HCOL[0]}" data-act="habTick" data-id="${h.id}" title="${esc(h.title)}"><span class="he">${h.icon || '⭐'}</span><span class="hn">${esc(h.title)}</span>${g > 1 && !d ? `<small>${c}/${g}</small>` : ''}${st.v ? `<small>🔥${st.v}</small>` : ''}</button>`; }).join('') || '<div class="empty">На сегодня привычек нет — день отдыха</div>'}</div></section>`;
}
function showHabAlert(id) {
  const h = habOf(id); if (!h || $(`.al[data-hab="${id}"]`)) return;
  const el = document.createElement('div'); el.className = 'al'; el.dataset.hab = id; el.style.setProperty('--c', h.color || HCOL[0]);
  el.innerHTML = `<div class="ah">${ic('habit')} Привычка<button class="ib sm" data-act="alClose" aria-label="Закрыть">${ic('x')}</button></div><b>${h.icon || ''} ${esc(h.title)}</b><p>${hGoal(h) > 1 ? `Сегодня ${hCnt(h, today())} из ${hGoal(h)}` : 'Ещё не отмечено сегодня'}${hStreak(h).v ? ` · серия 🔥 ${hStreak(h).v}` : ''}</p><div class="ab"><button class="btn sm pri" data-act="habTick" data-id="${id}" data-close="1">Отметить</button></div>`;
  $('#alerts').appendChild(el); if (document.hasFocus() || !hasApi) beep();
}
function habSet(h, d, v) { h.log = h.log || {}; if (v > 0) h.log[d] = v; else delete h.log[d]; }
registerModule({
  id: 'habits', order: 2.5, title: 'Привычки', icon: 'habit', desc: 'Ежедневные привычки: отметки, серии дней, тепловая карта за год, напоминания',
  bar() {
    const L = habActive(), T = L.filter(hToday), dn = T.filter(h => hDone(h, today())).length, ar = HB().filter(h => h.archived).length;
    return `<h1>Привычки</h1><div class="stats"><span><b>${dn}</b> из ${T.length} сегодня</span>${L.length ? `<span>в среднем <b>${Math.round(L.reduce((a, h) => a + hRate(h), 0) / L.length * 100)}%</b> за 30 дней</span>` : ''}</div><span class="spacer"></span>
      ${ar ? `<div class="subtabs"><button class="${HF.show === 'active' ? 'on' : ''}" data-act="habShow" data-v="active">Активные</button><button class="${HF.show === 'arch' ? 'on' : ''}" data-act="habShow" data-v="arch">Архив ${ar}</button></div>` : ''}
      <button class="btn pri" data-act="habEdit">${ic('plus')} Привычка</button>`;
  },
  render() {
    const L = HF.show === 'arch' ? HB().filter(h => h.archived) : habActive();
    if (!L.length) return `<div class="scroll"><div class="hempty">${ic('habit')}<h2>${HF.show === 'arch' ? 'Архив пуст' : 'Привычек пока нет'}</h2><p>Привычка — то, что вы хотите делать регулярно: пить воду, делать зарядку, читать. Отмечайте каждый день — программа посчитает серию и покажет год на тепловой карте.</p>
      ${HF.show === 'arch' ? '' : `<div class="hsug">${[['💧', 'Выпить 8 стаканов воды', 8, 'стаканов'], ['🏃', 'Зарядка', 1, ''], ['📚', 'Читать 20 минут', 1, ''], ['🚶', '10 000 шагов', 1, ''], ['😴', 'Лечь спать до 23:00', 1, '']].map(([e, t, g, u]) => `<button class="chip" data-act="habQuick" data-e="${e}" data-t="${t}" data-g="${g}" data-u="${u}">${e} ${t}</button>`).join('')}</div>
      <button class="btn pri" data-act="habEdit">${ic('plus')} Добавить привычку</button>`}</div></div>`;
    const T = L.filter(hToday), R = L.filter(h => !hToday(h));
    return `<div class="scroll"><div class="habs">${HF.show === 'arch' ? L.map(habCard).join('') : T.map(habCard).join('') + (R.length ? `<h3 class="hh3">Сегодня отдых</h3>${R.map(habCard).join('')}` : '')}</div></div>`;
  },
  search(q) { return HB().filter(h => h.title.toLowerCase().includes(q)).slice(0, 5).map(h => ({ group: 'Привычки', title: (h.icon || '') + ' ' + h.title, sub: hFreqTxt(h), color: h.color, act: 'habOpen', id: h.id })); }
});
Object.assign(ACT, {
  habOpen: b => habDetail(b.dataset.id),
  habEdit: b => habForm(b.dataset.id),
  habShow: b => { HF.show = b.dataset.v; render(); },
  habEmo: b => { UI.hform.icon = b.dataset.v; $$('.hemo button').forEach(x => x.classList.toggle('on', x === b)); },
  habCol: b => { UI.hform.color = b.dataset.v; $$('.hcol button').forEach(x => x.classList.toggle('on', x === b)); },
  habWd: b => b.classList.toggle('on'),
  habQuick: b => { snapU(); HB().push({ id: uid(), title: b.dataset.t, icon: b.dataset.e, color: HCOL[HB().length % HCOL.length], freq: 'daily', days: [], n: 3, goal: +b.dataset.g || 1, unit: b.dataset.u || '', remind: null, created: Date.now(), order: HB().length, log: {} }); save(); render(); toast('Привычка добавлена', true); },
  habSave: b => {
    const title = $('#h-title').value.trim(); if (!title) { $('#h-title').focus(); toast('Введите название'); return; }
    const freq = $('#h-freq').value, days = $$('#h-dw .chip.on').map(x => +x.dataset.v);
    if (freq === 'days' && !days.length) { toast('Выберите хотя бы один день'); return; }
    snapU(); let h = habOf(b.dataset.id);
    if (!h) { h = { id: uid(), created: Date.now(), order: HB().length, log: {} }; HB().push(h); }
    Object.assign(h, { title, icon: UI.hform.icon, color: UI.hform.color, freq, days, n: Math.max(1, Math.min(7, +$('#h-n').value || 3)), goal: Math.max(1, Math.min(50, +$('#h-goal').value || 1)), unit: $('#h-unit').value.trim(), remind: $('#h-rem').value || null });
    save(); closeModal(); render(); toast('Сохранено', true);
  },
  habDel: b => { if (!confirm('Удалить привычку вместе с историей отметок?')) return; snapU(); D.habits = HB().filter(h => h.id !== b.dataset.id); save(); closeModal(); render(); toast('Привычка удалена', true); },
  habArch: b => { const h = habOf(b.dataset.id); if (!h) return; snapU(); h.archived = !h.archived; save(); closeModal(); render(); toast(h.archived ? 'Перенесена в архив' : 'Возвращена', true); },
  habTick: b => {
    const h = habOf(b.dataset.id); if (!h) return; const td = today(), c = hCnt(h, td), g = hGoal(h);
    const before = hStreak(h).v;
    habSet(h, td, c >= g ? 0 : c + 1); save();
    if (b.dataset.close) { const al = b.closest('.al'); if (al) al.remove(); }
    const after = hStreak(h).v;
    if (hDone(h, td) && after > before && [3, 7, 14, 21, 30, 50, 100, 200, 365].includes(after)) toast(`🔥 Серия ${after} ${hStreak(h).w ? plural(after, ['неделя', 'недели', 'недель']) : plural(after, PD)}! Так держать`);
    else if (hDone(h, td) && c < g) toast(`${h.icon || ''} ${h.title} — выполнено`, true);
    render();
  },
  habDay: b => {
    const h = habOf(b.dataset.id), d = b.dataset.d; if (!h || d > today()) return;
    habSet(h, d, hDone(h, d) ? 0 : hGoal(h)); save(); render(); if ($('.hheat')) habDetail(h.id);
  }
});
