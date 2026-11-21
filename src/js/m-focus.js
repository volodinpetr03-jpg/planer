'use strict';
// ============================================================
//  Этап 2: фокус-таймер (помодоро), учёт времени по задачам, статистика
// ============================================================
Object.assign(ICONS, {
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5M12 2.5V5"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  skip: '<path d="M6 6l8 6-8 6zM17 6v12"/>'
});
const FOC_DEF = { work: 25, short: 5, long: 15, every: 4, autoBreak: true, autoWork: false };
const FS = () => (D.settings.focus = Object.assign({}, FOC_DEF, D.settings.focus || {}));
const FPH = { work: 'Фокус', short: 'Короткий перерыв', long: 'Длинный перерыв' };
let focT = null;
const FR = () => D.focusRun || null;
const frLeft = r => r.paused ? r.left : Math.max(0, r.end - Date.now());
const mmss = ms => { const s = Math.ceil(ms / 1000); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
const spentTxt = m => m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}` : `${m} мин`;

// напоминание о конце отрезка — системным уведомлением, даже если окно свёрнуто или телефон заблокирован
function focAlarm(r) {
  if (!hasApi || !window.api.focusAlarm) return;
  if (!r || r.paused) { window.api.focusCancel(); return; }
  const t = r.task && byId(r.task);
  window.api.focusAlarm({ at: r.end, title: r.phase === 'work' ? 'Фокус завершён — перерыв' : 'Перерыв окончен', body: r.phase === 'work' ? (t ? `«${t.title}» · ${r.min} мин` : `${r.min} мин сосредоточенной работы`) : 'Можно продолжать' });
}
function focusStart(taskId, phase = 'work', min, keepN) {
  const S = FS(), prev = FR();
  if (prev && prev.phase === 'work' && !prev.paused && phase === 'work') focusLogPart(prev);
  min = min || (phase === 'work' ? S.work : phase === 'long' ? S.long : S.short);
  const r = { phase, task: taskId || (prev && prev.task) || null, min, start: Date.now(), end: Date.now() + min * 60000, paused: false, left: 0, n: keepN != null ? keepN : prev ? prev.n || 0 : 0 };
  D.focusRun = r; save(); focAlarm(r); focTick(); focLoop();
  if (phase === 'work') toast(`Фокус ${min} мин${r.task && byId(r.task) ? ': ' + byId(r.task).title : ''}`);
}
// записываем в журнал отработанные минуты (и при досрочной остановке)
function focusLogPart(r, full) {
  const worked = full ? r.min : Math.floor((r.min * 60000 - frLeft(r)) / 60000);
  if (worked < 1) return 0;
  D.focusLog = D.focusLog || [];
  D.focusLog.push({ id: uid(), task: r.task || null, start: r.start, end: Date.now(), min: worked, full: !!full });
  if (D.focusLog.length > 3000) D.focusLog = D.focusLog.slice(-3000);
  const t = r.task && byId(r.task); if (t) t.spent = (t.spent || 0) + worked;
  return worked;
}
function focusDone() {
  const r = FR(); if (!r) return; const S = FS();
  if (r.phase === 'work') {
    focusLogPart(r, true); r.n = (r.n || 0) + 1;
    const next = r.n % S.every === 0 ? 'long' : 'short';
    beep(); focNotice(`Фокус ${r.min} мин завершён`, `Отрезков сегодня: ${focToday().n}. ${next === 'long' ? 'Заслужили длинный перерыв.' : 'Сделайте короткий перерыв.'}`, next);
    if (S.autoBreak) { D.focusRun = null; focusStart(r.task, next, null, r.n); }
    else { D.focusRun = { ...r, phase: 'wait', next, paused: true, left: 0 }; save(); focAlarm(null); }
  } else {
    beep(); focNotice('Перерыв окончен', 'Готовы продолжить?', 'work');
    if (S.autoWork) { D.focusRun = null; focusStart(r.task, 'work', null, r.n); }
    else { D.focusRun = { ...r, phase: 'wait', next: 'work', paused: true, left: 0 }; save(); focAlarm(null); }
  }
  render(); focTick();
}
function focNotice(title, body, next) {
  // окно сообщения внутри программы (системное уведомление уже пришло по будильнику)
  $$('.al.foc').forEach(x => x.remove());
  const el = document.createElement('div'); el.className = 'al foc';
  el.innerHTML = `<div class="ah">${ic('timer')} ${esc(title)}<button class="ib sm" data-act="alClose" aria-label="Закрыть">${ic('x')}</button></div><p>${esc(body)}</p><div class="ab">${next === 'work' ? `<button class="btn sm pri" data-act="focGo" data-v="work">${ic('play')} Продолжить</button>` : `<button class="btn sm pri" data-act="focGo" data-v="${next}">Перерыв</button><button class="btn sm" data-act="focGo" data-v="work">Ещё фокус</button>`}</div>`;
  $('#alerts').appendChild(el); setTimeout(() => el.remove(), 60000);
}
function focLoop() { clearInterval(focT); if (FR() && !FR().paused) focT = setInterval(focTick, 1000); }
function focTick() {
  const r = FR(); let w = $('#focusw');
  document.body.classList.toggle('hasfoc', !!r && !UI.locked);
  if (!r) { if (w) w.remove(); clearInterval(focT); document.title = 'Планер'; return; }
  if (!r.paused && Date.now() >= r.end) return focusDone();
  if (UI.locked) { if (w) w.remove(); document.title = 'Планер'; return; }
  if (!w) { w = document.createElement('div'); w.id = 'focusw'; document.body.appendChild(w); }
  const t = r.task && byId(r.task), left = frLeft(r), tot = r.min * 60000, wait = r.phase === 'wait';
  const pc = wait ? 0 : Math.max(0, Math.min(1, 1 - left / tot)), C = 2 * Math.PI * 16;
  w.className = `${r.phase} ${r.paused ? 'paused' : ''}`;
  w.innerHTML = `<button class="fring" data-act="focOpen" title="Открыть фокус-таймер"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pc)}"/></svg>${ic(r.phase === 'work' ? 'timer' : 'clock')}</button>
    <div class="ftx" data-act="focOpen"><b>${wait ? (r.next === 'work' ? 'Перерыв окончен' : 'Время перерыва') : mmss(left)}</b><small>${wait ? 'нажмите ▶' : FPH[r.phase] + (r.paused ? ' · пауза' : '')}${t ? ' · ' + esc(t.title) : ''}</small></div>
    ${wait ? `<button class="ib" data-act="focGo" data-v="${r.next}" title="Начать">${ic('play')}</button>` : `<button class="ib" data-act="focPause" title="${r.paused ? 'Продолжить' : 'Пауза'}">${ic(r.paused ? 'play' : 'pause')}</button>`}
    ${r.phase !== 'work' && !wait ? `<button class="ib" data-act="focSkip" title="Пропустить перерыв">${ic('skip')}</button>` : ''}<button class="ib" data-act="focStop" title="Остановить">${ic('stop')}</button>`;
  document.title = wait ? 'Планер' : `${mmss(left)} · ${r.phase === 'work' ? 'Фокус' : 'Перерыв'} — Планер`;
}
// --- статистика ---
function focDay(d) { const L = (D.focusLog || []).filter(x => ymd(new Date(x.end)) === d); return { m: L.reduce((a, x) => a + x.min, 0), n: L.filter(x => x.full).length }; }
const focToday = () => focDay(today());
function focPanel() {
  const r = FR(), S = FS(), td = today(), T = focToday(), wk = [...Array(7)].map((_, i) => focDay(addDays(td, -i))).reduce((a, x) => a + x.m, 0);
  const cand = live().filter(t => !isDone(t)).map(t => ({ t, s: scoreTask(t).s })).sort((a, b) => b.s - a.s).slice(0, 40).map(o => o.t);
  const cur = r ? r.task : (cand[0] && cand[0].id);
  if (cur && !cand.some(t => t.id === cur) && byId(cur)) cand.unshift(byId(cur));
  const left = r ? frLeft(r) : S.work * 60000;
  modal(`<div class="mbox"><div class="mh"><h2>${ic('timer')} Фокус-таймер</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div>
  <div class="mb fpanel">
    <div class="fbig ${r ? r.phase : 'idle'}"><b id="fbig">${r && r.phase !== 'wait' ? mmss(left) : pad(S.work) + ':00'}</b><span>${r ? (r.phase === 'wait' ? 'ожидание' : FPH[r.phase] + (r.paused ? ' · пауза' : '')) : 'готов к работе'}</span></div>
    <label class="f"><span>Над чем работаем</span><select class="in" id="fo-task"><option value="">Без задачи</option>${cand.map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.title.slice(0, 70))}${t.spent ? ` · ${spentTxt(t.spent)}` : ''}</option>`).join('')}</select></label>
    <div class="f"><span>Длительность фокуса</span><div class="chips">${[15, 25, 45, 60, 90].map(m => `<button class="chip ${S.work === m ? 'on' : ''}" data-act="focLen" data-v="${m}">${m} мин</button>`).join('')}</div></div>
    <div class="fstat"><div><b>${spentTxt(T.m)}</b><span>сегодня</span></div><div><b>${T.n}</b><span>${plural(T.n, ['отрезок', 'отрезка', 'отрезков'])}</span></div><div><b>${spentTxt(wk)}</b><span>за 7 дней</span></div></div>
    <details class="fset"><summary>Настройки таймера</summary>
      <div class="row two"><label class="f"><span>Короткий перерыв, мин</span><input class="in" type="number" min="1" max="60" id="fo-short" value="${S.short}"></label><label class="f"><span>Длинный перерыв, мин</span><input class="in" type="number" min="1" max="90" id="fo-long" value="${S.long}"></label></div>
      <label class="f"><span>Длинный перерыв после каждых … отрезков</span><input class="in" type="number" min="2" max="10" id="fo-every" value="${S.every}"></label>
      <label class="chk"><input type="checkbox" id="fo-ab" ${S.autoBreak ? 'checked' : ''}> Перерыв начинается сам</label>
      <label class="chk"><input type="checkbox" id="fo-aw" ${S.autoWork ? 'checked' : ''}> После перерыва фокус начинается сам</label>
    </details>
  </div>
  <div class="mf">${r ? `<button class="btn ghost danger" data-act="focStop">${ic('stop')} Остановить</button>` : ''}<span class="spacer"></span>
    ${r && r.phase !== 'wait' ? `<button class="btn" data-act="focPause">${ic(r.paused ? 'play' : 'pause')} ${r.paused ? 'Продолжить' : 'Пауза'}</button>` : ''}
    <button class="btn pri" data-act="focBegin">${ic('play')} ${r ? 'Начать заново' : 'Начать фокус'}</button></div></div>`);
}
function focSaveSet() {
  const S = FS(), n = (id, lo, hi, def) => { const v = Math.round(+($('#' + id) || {}).value); return v >= lo && v <= hi ? v : def; };
  if (!$('#fo-short')) return;
  S.short = n('fo-short', 1, 60, S.short); S.long = n('fo-long', 1, 90, S.long); S.every = n('fo-every', 2, 10, S.every);
  S.autoBreak = $('#fo-ab').checked; S.autoWork = $('#fo-aw').checked; save();
}
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('.fset')) focSaveSet(); if (e.target.id === 'fo-task' && FR()) { FR().task = e.target.value || null; save(); focTick(); } });
Object.assign(ACT, {
  focOpen: () => focPanel(),
  focBegin: () => { focSaveSet(); const tid = ($('#fo-task') || {}).value || null; closeModal(); focusStart(tid, 'work'); },
  focLen: b => { FS().work = +b.dataset.v; save(); focPanel(); },
  focTask: b => { closeModal(); closeSheet(); focusStart(b.dataset.id, 'work'); },
  focGo: b => { const al = b.closest('.al'); if (al) al.remove(); const r = FR(); if (r && r.phase !== 'wait' && !(r.phase === 'work' && b.dataset.v === 'work')) D.focusRun = { ...r, phase: 'wait' }; focusStart(r ? r.task : null, b.dataset.v || 'work', null, r ? r.n : 0); },
  focPause: () => {
    const r = FR(); if (!r || r.phase === 'wait') return;
    if (r.paused) { r.end = Date.now() + r.left; r.paused = false; } else { r.left = frLeft(r); r.paused = true; }
    save(); focAlarm(r); focLoop(); focTick(); if ($('.fpanel')) focPanel();
  },
  focSkip: () => { const r = FR(); if (!r) return; D.focusRun = null; focusStart(r.task, 'work', null, r.n); },
  focStop: () => {
    const r = FR(); if (!r) return;
    const m = r.phase === 'work' ? focusLogPart(r) : 0;
    D.focusRun = null; save(); focAlarm(null); focTick(); if ($('.fpanel')) closeModal(); render();
    toast(m ? `Записано ${spentTxt(m)} фокуса` : 'Таймер остановлен');
  }
});
// --- статистика в «Инсайтах» ---
function focusInsights() {
  const L = D.focusLog || []; if (!L.length) return [];
  const td = today(), ds = [...Array(14)].map((_, i) => addDays(td, i - 13)), mins = ds.map(d => focDay(d).m), tot14 = mins.reduce((a, b) => a + b, 0), days = mins.filter(Boolean).length;
  const out = [{ id: 'foc14', sec: 'focus', icon: 'timer', title: 'Время фокуса за 14 дней', value: spentTxt(tot14), text: days ? `В среднем ${spentTxt(Math.round(tot14 / days))} в день, когда вы работали с таймером (${days} ${plural(days, PD)} из 14).` : 'За две недели сессий не было.', basis: 'по журналу фокус-таймера', chart: { labels: ds.map(d => pd(d).getDate() + ' ' + MGS[pd(d).getMonth()]), data: mins, hl: 13 } }];
  const byT = {}; L.filter(x => x.task && byId(x.task)).forEach(x => byT[x.task] = (byT[x.task] || 0) + x.min);
  const top = Object.entries(byT).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length) out.push({ id: 'foctop', sec: 'focus', icon: 'star', title: 'На что ушло больше всего времени', value: byId(top[0][0]).title.slice(0, 40), text: `Всего по задачам: ${spentTxt(Object.values(byT).reduce((a, b) => a + b, 0))}.`, basis: 'сумма отрезков фокуса', bars: top.map(([id, m]) => ({ l: byId(id).title, v: m, c: tagColor(byId(id)), txt: m >= 60 ? String(Math.round(m / 6) / 10).replace('.', ',') + ' ч' : m + ' мин' })) });
  const hrs = Array(24).fill(0); L.forEach(x => { hrs[new Date(x.start).getHours()] += x.min; });
  const best = hrs.indexOf(Math.max(...hrs));
  if (L.length >= 5) out.push({ id: 'fochr', sec: 'focus', icon: 'clock', title: 'Лучшее время для фокуса', value: `${pad(best)}:00–${pad((best + 1) % 24)}:00`, text: 'В этот час вы чаще всего работали с таймером. Ставьте на него сложные задачи.', basis: `по ${L.length} ${plural(L.length, ['отрезку', 'отрезкам', 'отрезкам'])}`, chart: { labels: [...Array(24)].map((_, h) => String(h)), data: hrs, hl: best } });
  return out;
}
// при запуске продолжаем таймер, начатый до закрытия программы
function focResume() {
  const r = FR(); if (!r) return;
  if (!r.paused && Date.now() >= r.end) {
    if (Date.now() - r.end > 10 * 60000) { if (r.phase === 'work') focusLogPart(r, true); D.focusRun = null; save(); return; } // программа была закрыта долго
    focusDone(); return;
  }
  focLoop(); focTick();
}
