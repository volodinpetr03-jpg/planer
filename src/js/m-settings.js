'use strict';
// ============================================================
//  Настройки: внешний вид, модули, колонки, теги, бюджет, данные
// ============================================================
const STABS = [['look', 'Внешний вид', 'palette'], ['security', 'Безопасность', 'shield'], ['share', 'Совместная работа', 'users'], ['smart', 'Умные функции', 'spark'], ['modules', 'Модули', 'puzzle'], ['cols', 'Колонки', 'board'], ['tags', 'Теги', 'tag'], ['money', 'Бюджет', 'wallet'], ['general', 'Общие', 'gear'], ['data', 'Данные', 'data'], ['archive', 'Архив', 'archive'], ['keys', 'Клавиши', 'list']];
const CURRENCIES = [['₽', 'Рубль ₽'], ['$', 'Доллар $'], ['€', 'Евро €'], ['₸', 'Тенге ₸'], ['Br', 'Белорусский рубль Br'], ['₴', 'Гривна ₴'], ['¥', 'Юань ¥'], ['£', 'Фунт £'], ['₺', 'Лира ₺'], ['сум', 'Сум']];
function openSettings(tab) {
  UI.settab = tab || 'look';
  modal(`<div class="mbox wide setbox"><div class="mh"><h2>${ic('gear')} Настройки</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div><div class="setwrap"><nav class="setnav" id="stabs" aria-label="Разделы настроек"></nav><div class="mb" id="sbody"></div></div><div class="mf"><span class="hint">Изменения сохраняются сразу</span><span class="spacer"></span><button class="btn pri" data-act="mclose">Готово</button></div></div>`);
  drawSettings();
}
async function drawSettings() {
  if (!UI.settab || !$('#sbody')) return;
  const tab = UI.settab, S = D.settings;
  $('#stabs').innerHTML = STABS.filter(([k]) => !(IS_PHONE && k === 'keys')).map(([k, l, i]) => `<button class="${tab === k ? 'on' : ''}" data-act="stab" data-v="${k}" aria-current="${tab === k}">${ic(i)}<span>${l}</span></button>`).join('');
  const b = $('#sbody'), st = UI.lastSetTab === tab ? b.scrollTop : 0; UI.lastSetTab = tab;
  let h = '';
  if (tab === 'look') {
    h = `<div class="f"><span>Тема</span><div class="themes">${THEMES.map(([k, l, c]) => `<button class="th ${S.theme === k ? 'on' : ''}" data-act="setTheme" data-v="${k}" style="--pbg:${c[0]};--pside:${c[1]};--ppan:${c[2]};--pacc:${S.accent}"><div class="pv"><i></i><div><b></b><b></b><b></b></div></div><span>${l}</span></button>`).join('')}</div></div>
      <div class="f"><span>Акцентный цвет</span><div class="accs">${ACCENTS.map(([c, l]) => `<button class="${S.accent === c ? 'on' : ''}" style="--c:${c}" data-act="setAccent" data-v="${c}" title="${l}" aria-label="${l}"></button>`).join('')}</div></div>
      <div class="f"><span>Шрифт</span><div class="fontlist">${FONTS.map(([k, l, fam]) => `<button class="${S.font === k ? 'on' : ''}" data-act="setFont" data-v="${k}"><b style="font-family:${esc(fam)}">Аа Бб 123 ₽</b><small>${l}</small></button>`).join('')}</div></div>
      <div class="sline"><div class="tx"><b>Размер шрифта</b><span>Меняет размер текста и элементов, пропорции сохраняются</span></div><div class="ctl w"><div class="rng"><button class="ib sm" data-act="fsz" data-v="-1" aria-label="Меньше">A−</button><input type="range" id="s-fs" min="11" max="22" step="1" value="${S.fontSize}"><button class="ib sm" data-act="fsz" data-v="1" aria-label="Больше">A+</button><output id="o-fs">${S.fontSize} px</output></div></div></div>
      <div class="sline"><div class="tx"><b>Масштаб интерфейса</b><span>Как увеличение в браузере. Горячие клавиши: <kbd>Ctrl</kbd> <kbd>+</kbd> / <kbd>−</kbd> / <kbd>0</kbd></span></div><div class="ctl w"><div class="rng"><input type="range" id="s-zoom" min="70" max="160" step="5" value="${Math.round(S.zoom * 100)}"><output id="o-zoom">${Math.round(S.zoom * 100)}%</output></div></div></div>
      <div class="sline"><div class="tx"><b>Компактное боковое меню</b><span>Только значки — больше места для доски и календаря</span></div><input type="checkbox" class="tog" id="s-coll" ${S.collapsed ? 'checked' : ''}></div>
      <div><button class="btn ghost" data-act="lookReset">Вернуть оформление по умолчанию</button></div>`;
  } else if (tab === 'share') {
    h = await shareTab(); if (UI.settab !== 'share') return;
  } else if (tab === 'security') {
    await refreshLockStatus(); if (UI.settab !== 'security') return;
    h = securityTab();
  } else if (tab === 'smart') {
    const sm = S.smart, tg = (k, t, d) => `<div class="sline"><div class="tx"><b>${t}</b><span>${d}</span></div><input type="checkbox" class="tog" data-sm="${k}" ${sm[k] ? 'checked' : ''}></div>`;
    h = tg('parser', 'Умный разбор ввода', 'Дата, время, теги, проект, приоритет, напоминание и сумма распознаются из текста') + tg('suggest', 'Подсказки и автоподстановки', 'Похожие прошлые задачи, обычные суммы расходов и подходящие шаблоны')
      + tg('scoring', 'Главная задача', 'Автоматическая оценка важности и выбор, с чего начать') + tg('overload', 'Защита от перегрузки', 'Предупреждать, когда задач на день больше его ёмкости')
      + tg('autocat', 'Подбор категории расхода', 'По комментарию: прошлые операции и ключевые слова') + tg('rules', 'Правила «Если → То»', 'Выполнять правила из раздела «Автоматизация»')
      + `<div class="f" style="margin-top:.6rem"><span>Ёмкость дня — сколько часов вы готовы тратить на задачи</span><div class="capset">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label><span>${WSU[i]}</span><input class="in" type="number" min="0" max="16" step="0.5" data-cap="${i}" value="${S.capacity[i] / 60}"></label>`).join('')}</div></div>
      <div class="sline"><div class="tx"><b>Длительность задачи без указанного времени</b><span>Столько засчитывается в загрузку дня</span></div><div class="ctl"><select class="in" id="s-defdur" style="width:auto">${[15, 30, 45, 60, 90].map(v => `<option value="${v}" ${S.defDur === v ? 'selected' : ''}>${durTxt(v)}</option>`).join('')}</select></div></div>
      <div><button class="btn ghost" data-act="help" data-v="parser">${ic('help')} Что понимает умный ввод</button> <button class="btn ghost" data-act="help" data-v="focus">${ic('star')} Как считается важность</button></div>`;
  } else if (tab === 'modules') {
    h = `<p class="hint">Программа собрана из модулей. Отключите лишние — они исчезнут из меню, а данные сохранятся. Связи между модулями работают, когда оба включены.</p>
      ${MODULES.map(m => `<div class="modrow"><span class="mi2">${ic(m.icon)}</span><div class="tx"><b>${m.title}</b><span>${m.desc}</span></div><input type="checkbox" class="tog" data-mod="${m.id}" ${modOn(m.id) ? 'checked' : ''} aria-label="${m.title}"></div>`).join('')}
      <div class="sline"><div class="tx"><b>Стартовый экран</b><span>Что открывается при запуске программы</span></div><div class="ctl"><select class="in" id="s-start" style="width:auto">${MODULES.filter(m => modOn(m.id)).map(m => `<option value="${m.id}" ${S.startView === m.id ? 'selected' : ''}>${m.title}</option>`).join('')}</select></div></div>`;
  } else if (tab === 'cols') {
    h = `<p class="hint">Колонка, отмеченная «Готово», завершающая: задачи в ней выполнены, по ним не приходят напоминания, а повторяющиеся задачи создают следующую копию.</p>
      ${D.columns.map((c, i) => `<div class="sline"><div class="tx" style="display:grid;gap:.5rem"><input class="in" data-colt="${c.id}" value="${esc(c.title)}" maxlength="40" aria-label="Название колонки">${swatch(c.color, 'colColor', c.id)}</div>
      <label class="hint" style="display:flex;gap:.4rem;align-items:center;white-space:nowrap"><input type="radio" name="donecol" data-cold="${c.id}" ${c.done ? 'checked' : ''}> Готово</label>
      <button class="ib" data-act="colMove" data-id="${c.id}" data-v="-1" ${i ? '' : 'disabled'} aria-label="Левее">${ic('left')}</button><button class="ib" data-act="colMove" data-id="${c.id}" data-v="1" ${i < D.columns.length - 1 ? '' : 'disabled'} aria-label="Правее">${ic('right')}</button>
      <button class="ib" data-act="colDel" data-id="${c.id}" ${D.columns.length > 1 ? '' : 'disabled'} aria-label="Удалить колонку">${ic('trash')}</button></div>`).join('')}
      <div><button class="btn" data-act="addCol">${ic('plus')} Добавить колонку</button></div>`;
  } else if (tab === 'tags') {
    h = `<p class="hint">Теги общие для задач и денежных операций. По тегу видно всё сразу: например, #отпуск — и задачи по сборам, и потраченные деньги.</p>
      ${D.tags.map(t => { const n = live().filter(x => (x.tags || []).includes(t.id)).length, m = B().tx.filter(x => (x.tags || []).includes(t.id)).length; return `<div class="sline"><div class="tx" style="display:grid;gap:.5rem"><input class="in" data-tagt="${t.id}" value="${esc(t.title)}" maxlength="30" aria-label="Название тега">${swatch(t.color, 'tagColor', t.id)}</div><span class="hint" style="white-space:nowrap">${n} ${plural(n, PT)} · ${m} ${plural(m, POP)}</span><button class="ib" data-act="openTag" data-id="${t.id}" aria-label="Открыть">${ic('search')}</button><button class="ib" data-act="tagDel" data-id="${t.id}" aria-label="Удалить тег">${ic('trash')}</button></div>`; }).join('') || '<p class="hint">Тегов нет.</p>'}
      <div><button class="btn" data-act="tagAdd">${ic('plus')} Добавить тег</button></div>`;
  } else if (tab === 'money') {
    h = `<div class="sline"><div class="tx"><b>Валюта</b><span>Знак валюты во всех суммах</span></div><div class="ctl"><select class="in" id="s-cur" style="width:auto">${CURRENCIES.map(([k, l]) => `<option value="${k}" ${S.currency === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="sline"><div class="tx"><b>Счета</b><span>${B().accounts.map(a => esc(a.title)).join(', ')}</span></div><button class="btn" data-act="btab" data-v="accounts">Открыть</button></div>
      <div class="sline"><div class="tx"><b>Категории и лимиты</b><span>${B().categories.filter(c => c.type === 'expense').length} категорий расходов, ${B().categories.filter(c => c.type === 'income').length} доходов</span></div><button class="btn" data-act="btab" data-v="cats">Открыть</button></div>
      <div class="sline"><div class="tx"><b>Регулярные платежи</b><span>${B().regular.length} ${plural(B().regular.length, ['платёж', 'платежа', 'платежей'])}</span></div><button class="btn" data-act="btab" data-v="regular">Открыть</button></div>`;
  } else if (tab === 'general') {
    const info = hasApi ? await window.api.info() : { version: 'веб-версия', autostart: false };
    if (UI.settab !== 'general') return;
    const notif = IS_PHONE ? await window.api.notifPermission() : true, exact = IS_PHONE ? await window.api.exactAlarms() : true;
    if (UI.settab !== 'general') return;
    h = (IS_PHONE ? `<div class="sline"><div class="tx"><b>Уведомления</b><span>${notif ? 'Разрешены — напоминания приходят, даже когда Планер закрыт' : 'Не разрешены — напоминания не придут'}</span></div>${notif ? '' : '<button class="btn pri" data-act="askNotif">Разрешить</button>'}</div>
      <div class="sline"><div class="tx"><b>Напоминания минута в минуту</b><span>${exact ? 'Включено' : 'Android может задерживать напоминания на несколько минут. Включите «Будильники и напоминания» для Планера'}</span></div>${exact ? '' : '<button class="btn" data-act="askExact">Включить</button>'}</div>
      <div class="sline"><div class="tx"><b>Если напоминания опаздывают</b><span>Samsung и другие телефоны «экономят батарею». В настройках Android для Планера выберите «Батарея → Без ограничений».</span></div></div>`
    : `<div class="sline"><div class="tx"><b>Запускать вместе с Windows</b><span>Планер стартует свёрнутым в трей и присылает напоминания</span></div><input type="checkbox" class="tog" id="s-auto" ${info.autostart ? 'checked' : ''} ${hasApi ? '' : 'disabled'}></div>
      <div class="sline"><div class="tx"><b>Сворачивать в трей при закрытии</b><span>Крестик прячет окно, напоминания продолжают работать</span></div><input type="checkbox" class="tog" id="s-tray" ${S.closeToTray !== false ? 'checked' : ''}></div>`) + `
      <div class="sline"><div class="tx"><b>Звук напоминаний</b><span>Короткий сигнал, когда приходит напоминание</span></div><input type="checkbox" class="tog" id="s-sound" ${S.sound !== false ? 'checked' : ''}></div>
      ${MOB() ? '' : `<div class="sline"><div class="tx"><b>Интерактивное руководство</b><span>Короткая экскурсия по программе с подсветкой элементов</span></div><button class="btn" data-act="tourStart">${ic('play')} Пройти</button></div>`}
      <div class="sline"><div class="tx"><b>Планер ${esc(info.version)}</b><span>${IS_PHONE ? 'Личные данные хранятся только на этом телефоне' : 'Все данные хранятся только на этом компьютере'}</span></div>${hasApi && !IS_PHONE ? '<button class="btn" data-act="quit">Выйти из программы</button>' : ''}</div>`;
  } else if (tab === 'data') {
    const info = hasApi ? await window.api.info() : null;
    if (UI.settab !== 'data') return;
    h = `<div class="sline"><div class="tx"><b>Где лежат данные</b><span>Файл обновляется при каждом изменении. Раз в день делается резервная копия, хранятся последние 14.</span>${info ? `<div class="path">${esc(info.dataPath)}</div>` : ''}</div>${hasApi && !IS_PHONE ? '<button class="btn" data-act="folder">Открыть папку</button>' : ''}</div>
      <div class="sline"><div class="tx"><b>Резервная копия</b><span>Всё: задачи, проекты, бюджет, настройки и правовая библиотека — одним файлом</span></div><button class="btn" data-act="exportAll">Сохранить копию…</button></div>
      <div class="sline"><div class="tx"><b>Восстановить из копии</b><span>Текущие данные заменятся данными из файла. Действие можно отменить.</span></div><button class="btn" data-act="importAll">Открыть копию…</button><input type="file" id="s-file" accept=".json" hidden></div>
      <div class="sline"><div class="tx"><b>Операции в Excel</b><span>Таблица CSV со всеми доходами и расходами — открывается в Excel</span></div><button class="btn" data-act="exportCsv" data-v="tx">Выгрузить операции</button></div>
      <div class="sline"><div class="tx"><b>Задачи в Excel</b><span>Таблица CSV со всеми задачами</span></div><button class="btn" data-act="exportCsv" data-v="tasks">Выгрузить задачи</button></div>
      <div class="sline"><div class="tx"><b>Удалить пример</b><span>Убрать демонстрационные задачи, проекты, папки, операции, теги и остатки на счетах. Настройки оформления сохранятся.</span></div><button class="btn" data-act="wipeExample">Удалить пример</button></div>
      <div class="sline"><div class="tx"><b>Очистить данные</b><span>Удалить всё содержимое: задачи, проекты, папки, бюджет, теги. Останутся оформление, колонки, шаблоны и правила.</span></div><button class="btn danger" data-act="wipe">Очистить данные</button></div>
      <div class="sline"><div class="tx"><b>Полный сброс</b><span>Вернуть программу к состоянию «только что установлена», но без примера и без руководства.</span></div><button class="btn danger" data-act="wipeFull">Полный сброс</button></div>
      <div class="sline"><div class="tx"><b>Пример заполнения</b><span>Загрузить демонстрационные данные вместо текущих</span></div><button class="btn ghost" data-act="loadDemo">Загрузить пример</button></div>
      <div class="sline"><div class="tx"><b>Состояние сохранения</b><span>${UI.saveErr ? '<span style="color:var(--hi)">Последнее сохранение не удалось: ' + esc(UI.saveErr) + '</span>' : 'Последнее сохранение прошло успешно'}</span>${info && info.logPath ? `<div class="path">${esc(info.logPath)}</div>` : ''}</div>${hasApi ? '<button class="btn" data-act="saveCheck">Проверить</button>' : ''}</div>
      <p class="hint">Сейчас: ${live().length} ${plural(live().length, PT)}, ${D.projects.length} проектов, ${B().tx.length} ${plural(B().tx.length, POP)}.</p>`;
  } else if (tab === 'archive') {
    const A = D.tasks.filter(t => t.archived).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    h = A.length ? `${A.map(t => `<div class="sline"><div class="tx"><b>${esc(t.title)}</b><span>${t.doneAt ? 'Выполнена ' + fmtTs(t.doneAt) : ''}${t.project && projOf(t.project) ? ' · ' + esc(projOf(t.project).title) : ''}</span></div><button class="btn sm" data-act="unarch" data-id="${t.id}">Вернуть на доску</button><button class="ib" data-act="archDel" data-id="${t.id}" aria-label="Удалить навсегда">${ic('trash')}</button></div>`).join('')}<div><button class="btn danger" data-act="archClear">Очистить архив</button></div>` : '<p class="hint">Архив пуст. Выполненные задачи попадают сюда по кнопке в колонке «Готово».</p>';
  } else if (tab === 'keys') {
    const K = [['Q', 'Быстрый ввод'], ['F1', 'Справка'], ['Ctrl F', 'Поиск по всему'], ['N', 'Новая задача'], ['R', 'Новый расход'], ['1 … 7', 'Переключить раздел'], ['Ctrl +  /  Ctrl −', 'Масштаб интерфейса'], ['Ctrl 0', 'Масштаб 100%'], ['← →', 'Листать календарь'], ['T', 'Календарь — к сегодня'], ['Enter / Delete', 'Открыть / удалить выбранную карточку'], ['Ctrl Enter', 'Сохранить форму'], ['Ctrl Z', 'Отменить действие'], ['Esc', 'Закрыть окно или поиск']];
    h = K.map(([k, l]) => `<div class="sline"><div class="tx"><b>${l}</b></div><span>${k.split(' ').map(x => ['/', '…', '+', '−'].includes(x) ? x : x ? `<kbd>${x}</kbd>` : '').join(' ')}</span></div>`).join('') + '<p class="hint">В неделе: нажмите на пустое место сетки — создастся задача на это время. Блок можно перетащить, а за нижний край — растянуть.</p>';
  }
  b.innerHTML = h; b.scrollTop = st;
}
function setLook(k, v) { D.settings[k] = v; applyAppearance(); save(); drawSettings(); render(); }
const csvCell = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
async function saveFile(content, name, ext) {
  if (hasApi) { const p = await window.api.exportData({ content, name, ext }); if (p) toast('Файл сохранён'); }
  else { try { await navigator.clipboard.writeText(content); toast('Скопировано в буфер обмена'); } catch (e) { toast('Не удалось скопировать'); } }
}
function importText(txt) {
  try { const o = JSON.parse(txt); if (!o || !Array.isArray(o.tasks)) throw 0; if (Array.isArray(o.lawTexts)) { o.lawTexts.forEach(x => { LAWC.set(x.id, x.arts); lawDB.put(x).catch(() => {}); }); delete o.lawTexts; } snapU(); D = normalize(o); D.demo = false; save(); closeModal(); applyAppearance(); render(); toast('Данные восстановлены из копии', true); }
  catch (e) { toast('Этот файл не похож на копию планера'); }
}
Object.assign(ACT, {
  settings: b => openSettings(b.dataset.v),
  stab: b => { UI.settab = b.dataset.v; drawSettings(); },
  setTheme: b => setLook('theme', b.dataset.v), setAccent: b => setLook('accent', b.dataset.v), setFont: b => setLook('font', b.dataset.v),
  fsz: b => setLook('fontSize', Math.max(11, Math.min(22, D.settings.fontSize + +b.dataset.v))),
  lookReset: () => { ['theme', 'accent', 'font', 'fontSize', 'zoom', 'collapsed'].forEach(k => D.settings[k] = DEF_SETTINGS[k]); applyAppearance(); save(); drawSettings(); render(); },
  colColor: b => { colOf(b.dataset.id).color = b.dataset.v; save(); drawSettings(); render(); },
  colMove: b => { const i = D.columns.findIndex(c => c.id === b.dataset.id), j = i + +b.dataset.v; if (j < 0 || j >= D.columns.length) return; [D.columns[i], D.columns[j]] = [D.columns[j], D.columns[i]]; save(); drawSettings(); render(); },
  colDel: b => { if (D.columns.length < 2) return; const c = colOf(b.dataset.id); snapU(); D.columns = D.columns.filter(x => x.id !== c.id); const to = firstCol(); D.tasks.forEach(t => { if (t.col === c.id) t.col = to.id; }); reorder(to.id); save(); drawSettings(); render(); toast(`Колонка «${c.title}» удалена, задачи перенесены в «${to.title}»`, true); },
  tagColor: b => { tagOf(b.dataset.id).color = b.dataset.v; save(); drawSettings(); render(); },
  tagAdd: () => { D.tags.push({ id: uid(), title: 'новый тег', color: COLORS[D.tags.length % COLORS.length] }); save(); drawSettings(); setTimeout(() => { const i = $$('[data-tagt]').pop(); if (i) { i.focus(); i.select(); } }, 30); },
  tagDel: b => { snapU(); const id = b.dataset.id; D.tags = D.tags.filter(t => t.id !== id); D.tasks.forEach(t => t.tags = (t.tags || []).filter(x => x !== id)); B().tx.forEach(t => t.tags = (t.tags || []).filter(x => x !== id)); TF.tags.delete(id); save(); drawSettings(); render(); toast('Тег удалён', true); },
  quit: () => window.api.quit(), folder: () => window.api.openFolder(),
  askNotif: async () => { await window.api.askNotif(); drawSettings(); }, askExact: async () => { await window.api.askExactAlarms(); setTimeout(drawSettings, 1500); },
  exportAll: async () => { const d = new Date(); let o = D; if (LW().docs.length) { await lawLoad(); o = { ...D, lawTexts: LW().docs.map(x => ({ id: x.id, arts: lawArts(x.id) })) }; } saveFile(JSON.stringify(o, null, 1), `Планер-копия-${ymd(d)}`, 'json'); if (LK.status.enabled) setTimeout(() => toast('Внимание: копия в файле не зашифрована — храните её в надёжном месте'), 1500); },
  importAll: async () => { if (hasApi) { const txt = await window.api.importData(); if (txt) importText(txt); } else $('#s-file').click(); },
  exportCsv: b => {
    let rows;
    if (b.dataset.v === 'tx') rows = [['Дата', 'Тип', 'Сумма', 'Счёт', 'Куда', 'Категория', 'Проект', 'Задача', 'Теги', 'Комментарий']].concat([...B().tx].sort((a, b) => a.date.localeCompare(b.date)).map(x => [x.date.split('-').reverse().join('.'), { expense: 'Расход', income: 'Доход', transfer: 'Перевод' }[x.type], String(x.amount).replace('.', ','), (accOf(x.account) || {}).title, (accOf(x.to) || {}).title, (catOf(x.category) || {}).title, (projOf(x.project) || {}).title, x.task && byId(x.task) ? byId(x.task).title : '', tagsOf(x).map(t => t.title).join(', '), x.note]));
    else rows = [['Задача', 'Колонка', 'Проект', 'Приоритет', 'Дата', 'Время', 'Длительность, мин', 'Теги', 'Повтор', 'Выполнена', 'Описание']].concat(D.tasks.map(t => [t.title, (colOf(t.col) || {}).title, (projOf(t.project) || {}).title, PRIO[t.prio][0], t.date ? t.date.split('-').reverse().join('.') : '', t.time, t.dur, tagsOf(t).map(x => x.title).join(', '), REPS[t.repeat] || '', t.doneAt ? fmtTs(t.doneAt) : '', t.desc]));
    saveFile('﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'), b.dataset.v === 'tx' ? `Операции-${today()}` : `Задачи-${today()}`, 'csv');
  },
  loadDemo: () => { snapU(); const s = D.settings; D = demo(); D.settings = s; save(); closeModal(); render(); toast('Загружен пример', true); },
  wipe: () => { snapU(); resetData('data').then(ok => { drawSettings(); toast(ok ? 'Данные очищены и сохранены' : 'Очищено, но сохранить не удалось — см. «Состояние сохранения»', true); }); },
  wipeExample: () => { snapU(); resetData('example').then(ok => { drawSettings(); toast(ok ? 'Пример удалён и сохранён' : 'Удалено, но сохранить не удалось — см. «Состояние сохранения»', true); }); },
  wipeFull: () => { snapU(); resetData('full').then(ok => { closeModal(); toast(ok ? 'Программа сброшена' : 'Сброшено, но сохранить не удалось', true); }); },
  saveCheck: () => saveNow().then(ok => { drawSettings(); toast(ok ? 'Сохранение работает: файл записан и проверен' : 'Сохранение не работает: ' + UI.saveErr); }),
  unarch: b => { const t = byId(b.dataset.id); t.archived = false; t.order = -1; reorder(t.col); save(); drawSettings(); render(); },
  archDel: b => { snapU(); D.tasks = D.tasks.filter(t => t.id !== b.dataset.id); save(); drawSettings(); toast('Удалено навсегда', true); },
  archClear: () => { snapU(); D.tasks = D.tasks.filter(t => !t.archived); save(); drawSettings(); toast('Архив очищен', true); }
});
