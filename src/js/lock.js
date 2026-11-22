'use strict';
// ============================================================
//  Вход по паролю: экран входа, блокировка, настройки безопасности
// ============================================================
const LK = { mode: 'start', recover: false, info: null, status: { enabled: false, hint: '' }, last: Date.now(), timer: null, bio: null, bioBusy: false, bioAuto: false };
const bioName = () => IS_PHONE ? 'отпечатку' : 'Windows Hello';
const lockApi = () => hasApi && window.api.lock;
const eyeIcon = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const lockIcon = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
ICONS.lock = '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>';
ICONS.shield = '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6"/>';
ICONS.finger = '<path d="M8.2 4.6A8 8 0 0 1 20 11.5v1.5"/><path d="M4.5 8.2A8 8 0 0 0 4 11v2"/><path d="M8 20c.6-1.8 1-3.8 1-6v-2.5a3 3 0 0 1 6 0V13"/><path d="M12 11.5V14c0 3-.7 5.5-2 7.5"/><path d="M15 16.5c-.2 1.7-.6 3.3-1.3 4.7M17.6 18.5c.3-1.3.4-2.8.4-4.5v-2.5"/>';
ICONS.key = '<circle cx="8" cy="15" r="4.5"/><path d="M11.3 11.7L20 3M16.5 6.5l2.5 2.5M14 9l2 2"/>';

async function refreshLockStatus() { if (lockApi()) LK.status = await window.api.lock.status(); return LK.status; }
function showLock(mode, info) {
  LK.mode = mode; LK.info = info || {}; LK.recover = false; LK.bioAuto = true;
  const el = $('#lock'); el.classList.add('open'); drawLock();
}
function drawLock(err) {
  const info = LK.info || {}, rec = LK.recover;
  $('#lock').innerHTML = `<div class="lock-drag"></div><div class="lock-box">
    <img src="img/icon.png" alt="" class="lock-logo"><h1>Планер</h1>
    <p class="lock-sub">${rec ? 'Введите код восстановления из 20 символов' : LK.mode === 'ui' ? 'Планер заблокирован' : 'Данные защищены паролем'}</p>
    <form id="lkform" autocomplete="off">
      <div class="lk-in">${rec ? `<input id="lk-pw" class="in" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" spellcheck="false" autocomplete="off">` : `<input id="lk-pw" class="in" type="password" placeholder="Пароль" autocomplete="current-password"><button type="button" class="ib sm" data-act="lkEye" aria-label="Показать пароль" title="Показать пароль">${eyeIcon}</button>`}</div>
      <p class="lk-caps" id="lk-caps">Включён Caps Lock</p>
      <p class="lk-err" id="lk-err">${esc(err || '')}</p>
      <button class="btn pri lk-go" id="lk-go">${lockIcon}${rec ? 'Восстановить доступ' : 'Войти'}</button>
      ${!rec && LK.status.bio && lockApi() && window.api.lock.bioUnlock ? `<button type="button" class="btn lk-bio" data-act="lkBio">${ic('finger')}${IS_PHONE ? 'Войти по отпечатку' : 'Войти через Windows Hello'}</button>` : ''}
    </form>
    <div class="lk-links">${rec ? '<button class="lnk" data-act="lkBack">Вернуться к паролю</button>' : `${info.hint || LK.status.hint ? '<button class="lnk" data-act="lkHint">Подсказка</button>' : ''}<button class="lnk" data-act="lkForgot">Забыли пароль?</button>`}</div>
    <p class="lk-hint" id="lk-hintbox"></p></div>`;
  if (!(LK.status.bio && IS_PHONE)) setTimeout(() => $('#lk-pw')?.focus(), 30);
  if (info.wait > 0) lockWait(info.wait);
  // сразу предлагаем отпечаток / Windows Hello — один раз при показе экрана
  if (!rec && LK.status.bio && LK.bioAuto && !(info.wait > 0)) { LK.bioAuto = false; setTimeout(() => { if (!document.hidden && $('#lock').classList.contains('open')) lockBio(); }, IS_PHONE ? 350 : 500); }
}
async function lockBio() {
  if (LK.bioBusy || !lockApi() || !window.api.lock.bioUnlock) return;
  LK.bioBusy = true; const b = $('[data-act=lkBio]'); if (b) b.disabled = true;
  let r; try { r = await window.api.lock.bioUnlock(LK.mode === 'start' ? 'start' : 'ui'); } catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
  LK.bioBusy = false; if ($('[data-act=lkBio]')) $('[data-act=lkBio]').disabled = false;
  if (!r || !r.ok) {
    if (r && r.invalid) { LK.status.bio = false; drawLock(r.error); return; }
    if (r && !r.cancel && $('#lk-err')) $('#lk-err').textContent = r.error || '';
    $('#lk-pw')?.focus(); return;
  }
  lockDone(r);
}
function lockWait(ms) {
  const b = $('#lk-go'), until = Date.now() + ms; if (!b) return; b.disabled = true;
  const t = setInterval(() => { const left = until - Date.now(); if (left <= 0 || !$('#lk-go')) { clearInterval(t); if ($('#lk-go')) { $('#lk-go').disabled = false; $('#lk-err').textContent = ''; } return; } $('#lk-err').textContent = `Слишком много попыток. Подождите ${Math.ceil(left / 1000)} с`; }, 250);
}
async function lockSubmit() {
  const v = $('#lk-pw').value; if (!v) return;
  $('#lk-go').disabled = true;
  let r;
  if (LK.recover) r = await window.api.lock.recover(v);
  else if (LK.mode === 'start') r = await window.api.lock.unlock(v);
  else r = await window.api.lock.verify(v);
  if (!r.ok) {
    $('#lk-go').disabled = false; const box = $('.lock-box'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    $('#lk-err').textContent = r.error + (r.left > 0 && r.left < 4 ? ` · осталось попыток: ${r.left}` : ''); $('#lk-pw').select();
    if (r.wait > 0) lockWait(r.wait); return;
  }
  lockDone(r);
}
function lockDone(r) {
  $('#lock').classList.remove('open'); $('#lock').innerHTML = '';
  if (LK.mode === 'start') startApp(r.data);
  else { UI.locked = false; render(); }
  LK.last = Date.now();
  if (LK.recover) setTimeout(() => passwordModal('afterRecovery'), 400);
}
function lockNow() {
  if (!LK.status.enabled || UI.locked) return;
  UI.locked = true; closeModal(); destroyCharts();
  ['#bar', '#main', '#side', '#alerts'].forEach(s => $(s).innerHTML = '');
  if ($('#tour').classList.contains('open')) $('#tour').classList.remove('open');
  window.api.lock.lockUi(); showLock('ui');
}
// автоблокировка после простоя
['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { LK.last = Date.now(); }, { passive: true }));
setInterval(() => { if (!D || UI.locked || !LK.status.enabled) return; const m = D.settings.autoLock || 0; if (m && Date.now() - LK.last > m * 60000) lockNow(); }, 15000);

// ---------- окна: включение, смена, отключение, код ----------
const strength = p => { let s = 0; if (p.length >= 6) s++; if (p.length >= 10) s++; if (/[a-zа-яё]/.test(p) && /[A-ZА-ЯЁ]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\wа-яё]/i.test(p)) s++; return Math.min(4, s); };
const SLBL = ['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Надёжный'];
function pwField(id, label, ac) { return `<label class="f"><span>${label}</span><div class="lk-in"><input class="in" type="password" id="${id}" autocomplete="${ac || 'new-password'}"><button type="button" class="ib sm" data-act="pwEye" data-v="${id}" aria-label="Показать">${eyeIcon}</button></div></label>`; }
function passwordModal(kind) {
  UI.form = { kind: 'pw', pk: kind };
  const T = { enable: 'Включить вход по паролю', change: 'Сменить пароль', disable: 'Отключить пароль', newCode: 'Новый код восстановления', afterRecovery: 'Задайте новый пароль' }[kind];
  let body = '';
  if (kind === 'enable' || kind === 'afterRecovery') body = `${kind === 'afterRecovery' ? '<p class="hint warn">Вы вошли по коду восстановления. Задайте новый пароль — старый код после этого перестанет работать, вы получите новый.</p>' : '<p class="hint">Данные и резервные копии будут зашифрованы (AES‑256). Пароль нигде не хранится: проверить его можно, только расшифровав данные.</p>'}
    ${pwField('pw1', 'Пароль')}<div class="pw-meter"><i id="pw-bar"></i></div><p class="hint" id="pw-lbl">Минимум 4 символа, лучше — от 8, с цифрами и буквами разного регистра</p>
    ${pwField('pw2', 'Повторите пароль')}
    <label class="f"><span>Подсказка <em>— необязательно, видна на экране входа</em></span><input class="in" id="pw-hint" maxlength="80" placeholder="Не пишите сюда сам пароль"></label>`;
  else if (kind === 'change') body = `${pwField('pw0', 'Текущий пароль', 'current-password')}${pwField('pw1', 'Новый пароль')}<div class="pw-meter"><i id="pw-bar"></i></div><p class="hint" id="pw-lbl"></p>${pwField('pw2', 'Повторите новый пароль')}<label class="f"><span>Подсказка</span><input class="in" id="pw-hint" maxlength="80" value="${esc(LK.status.hint || '')}"></label>`;
  else body = `<p class="hint">${kind === 'disable' ? 'Данные и резервные копии будут расшифрованы и снова станут доступны без пароля.' : 'Старый код восстановления перестанет работать.'}</p>${pwField('pw0', 'Текущий пароль', 'current-password')}`;
  modal(`<div class="mbox narrow"><div class="mh"><h2>${ic('shield')} ${T}</h2>${kind === 'afterRecovery' ? '' : `<button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button>`}</div>
    <form class="mb" id="pwform" autocomplete="off">${body}<p class="lk-err" id="pw-err"></p></form>
    <div class="mf"><span class="spacer"></span>${kind === 'afterRecovery' ? '' : '<button class="btn" data-act="mclose">Отмена</button>'}<button class="btn ${kind === 'disable' ? 'danger' : 'pri'}" data-act="pwSave">${kind === 'disable' ? 'Отключить' : kind === 'newCode' ? 'Получить код' : 'Сохранить'}</button></div></div>`);
  setTimeout(() => $('#pwform input')?.focus(), 30);
}
async function pwSave() {
  const k = UI.form.pk, v = id => ($('#' + id) || {}).value || '', err = t => { $('#pw-err').textContent = t; };
  let r;
  if (k === 'enable' || k === 'afterRecovery' || k === 'change') {
    if (v('pw1').length < 4) return err('Пароль должен быть не короче 4 символов');
    if (v('pw1') !== v('pw2')) return err('Пароли не совпадают');
    if (v('pw-hint') && v('pw-hint').toLowerCase().includes(v('pw1').toLowerCase())) return err('Подсказка не должна содержать сам пароль');
  }
  $('[data-act=pwSave]').disabled = true;
  if (k === 'enable') { await saveNow(); r = await window.api.lock.enable({ pw: v('pw1'), hint: v('pw-hint') }); }
  else if (k === 'afterRecovery') r = await window.api.lock.setAfterRecovery({ pw: v('pw1'), hint: v('pw-hint') });
  else if (k === 'change') r = await window.api.lock.change({ old: v('pw0'), pw: v('pw1'), hint: v('pw-hint') });
  else if (k === 'newCode') r = await window.api.lock.newCode(v('pw0'));
  else if (k === 'disable') r = await window.api.lock.disable(v('pw0'));
  if (!r || !r.ok) { $('[data-act=pwSave]').disabled = false; return err((r && r.error) || 'Не получилось'); }
  LK.bio = null; await refreshLockStatus(); applyLockButton();
  if (r.code) return showCode(r.code, k);
  closeModal(); if (UI.settab !== undefined) { openSettings('security'); }
  toast(k === 'disable' ? 'Пароль отключён, данные расшифрованы' : 'Пароль изменён');
}
function showCode(code, kind) {
  UI.form = { kind: 'code' };
  modal(`<div class="mbox narrow"><div class="mh"><h2>${ic('key')} Код восстановления</h2></div>
    <div class="mb"><p>${kind === 'enable' ? 'Вход по паролю включён, данные зашифрованы.' : 'Новый код создан.'} Сохраните этот код: он нужен, если вы забудете пароль. <b>Код показывается только один раз.</b></p>
    <div class="rcode" id="rcode">${code}</div>
    <div class="dbtns"><button class="btn" data-act="codeCopy" data-v="${code}">Скопировать</button><button class="btn" data-act="codeFile" data-v="${code}">Сохранить в файл…</button></div>
    <p class="hint warn">Если потерять и пароль, и код, восстановить данные будет невозможно — даже разработчику.</p>
    <label class="sline" style="border:0;padding:0"><span class="tx"><b>Я сохранил код в надёжном месте</b></span><input type="checkbox" class="tog" id="code-ok"></label></div>
    <div class="mf"><span class="spacer"></span><button class="btn pri" data-act="codeDone" id="code-done" disabled>Готово</button></div></div>`);
}
function securityTab() {
  const st = LK.status, S = D.settings;
  if (!hasApi) return '<p class="hint">Вход по паролю работает в программе для Windows.</p>';
  if (!st.enabled) return `<div class="secbox">${ic('shield')}<div><b>Вход по паролю выключен</b><span>Любой, кто откроет программу или файл данных на этом компьютере, увидит задачи и бюджет.</span></div></div>
    <div class="sline"><div class="tx"><b>Включить вход по паролю</b><span>При запуске планер спросит пароль. Данные и резервные копии будут зашифрованы. Вы получите код восстановления на случай, если забудете пароль.</span></div><button class="btn pri" data-act="pwOpen" data-v="enable">${ic('lock')} Включить</button></div>
    <p class="hint">Напоминания при включённом пароле начинают приходить после первого входа в программу.</p>`;
  return `<div class="secbox on">${ic('shield')}<div><b>Вход по паролю включён</b><span>Данные зашифрованы${st.created ? ' с ' + fmtTs(st.created) : ''}${st.hint ? ' · есть подсказка' : ''}</span></div><button class="btn" data-act="lockNow">${ic('lock')} Заблокировать <kbd>Ctrl L</kbd></button></div>
    <div class="sline"><div class="tx"><b>Автоблокировка</b><span>Заблокировать, если планером не пользуются</span></div><div class="ctl"><select class="in" id="s-autolock" style="width:auto">${[[0, 'Никогда'], [5, 'Через 5 минут'], [15, 'Через 15 минут'], [30, 'Через 30 минут'], [60, 'Через час']].map(([v, l]) => `<option value="${v}" ${(S.autoLock || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="sline"><div class="tx"><b>${IS_PHONE ? 'Блокировать, когда Планер свёрнут' : 'Блокировать при сворачивании в трей'}</b><span>${IS_PHONE ? 'Вышли из приложения — при возвращении нужен пароль' : 'Закрыли окно крестиком — при следующем открытии нужен пароль'}</span></div><input type="checkbox" class="tog" id="s-lockhide" ${S.lockOnHide ? 'checked' : ''}></div>
    ${bioRow()}
    <div class="sline"><div class="tx"><b>Сменить пароль</b><span>Нужен текущий пароль</span></div><button class="btn" data-act="pwOpen" data-v="change">Сменить</button></div>
    <div class="sline"><div class="tx"><b>Новый код восстановления</b><span>Если старый код потерян или мог попасть к посторонним</span></div><button class="btn" data-act="pwOpen" data-v="newCode">Создать</button></div>
    <div class="sline"><div class="tx"><b>Отключить пароль</b><span>Данные будут расшифрованы</span></div><button class="btn danger" data-act="pwOpen" data-v="disable">Отключить</button></div>
    <p class="hint">Резервная копия, сохранённая в файл через «Данные», не шифруется — храните её в надёжном месте.</p>`;
}
function bioRow() {
  if (!lockApi() || !window.api.lock.bioStatus) return '';
  const B = LK.bio, t = IS_PHONE ? 'Вход по отпечатку пальца' : 'Вход через Windows Hello';
  if (!B) { setTimeout(async () => { LK.bio = await window.api.lock.bioStatus().catch(() => ({ available: false, reason: 'error' })); if (UI.settab === 'security') drawSettings(); }, 0); return `<div class="sline"><div class="tx"><b>${ic('finger')} ${t}</b><span>Проверяю, есть ли ${IS_PHONE ? 'сканер отпечатка' : 'Windows Hello'}…</span></div></div>`; }
  const why = IS_PHONE ? ({ none: 'В телефоне не добавлен ни один отпечаток: Настройки Android → Безопасность → Отпечаток пальца.', nohw: 'В этом телефоне нет подходящего сканера отпечатка.', busy: 'Сканер сейчас недоступен — попробуйте позже.', update: 'Телефону нужно обновление безопасности.' }[B.reason] || 'Сканер отпечатка недоступен.') : (B.text || 'Windows Hello недоступен.');
  const d = IS_PHONE ? 'Приложите палец вместо ввода пароля. Пароль и код восстановления продолжают работать. Если в телефоне добавят новый отпечаток, вход по отпечатку отключится сам — включите его заново.'
    : 'Отпечаток, лицо или PIN — то, что настроено в Windows. Пароль и код восстановления продолжают работать.';
  if (!B.available && !B.enabled) return `<div class="sline"><div class="tx"><b>${ic('finger')} ${t}</b><span>${esc(why)}</span></div><button class="btn ghost" data-act="bioRecheck">Проверить снова</button></div>`;
  return `<div class="sline"><div class="tx"><b>${ic('finger')} ${t}</b><span>${d}${!B.available ? ' <em class="warn">' + esc(why) + '</em>' : ''}</span></div><input type="checkbox" class="tog" id="s-bio" ${B.enabled ? 'checked' : ''}></div>`;
}
async function bioToggle(on, el) {
  el.disabled = true;
  const r = on ? await window.api.lock.bioEnable() : await window.api.lock.bioDisable();
  el.disabled = false;
  if (!r || !r.ok) { el.checked = !on; if (!(r && r.cancel)) toast((r && r.error) || 'Не получилось'); return; }
  LK.bio = null; await refreshLockStatus(); drawSettings();
  toast(on ? (IS_PHONE ? 'Вход по отпечатку включён' : 'Вход через Windows Hello включён') : 'Вход по ' + bioName() + ' отключён');
}
function applyLockButton() { const b = $('#b-lock'); if (b) b.style.display = LK.status.enabled ? '' : 'none'; }

Object.assign(ACT, {
  lkEye: () => { const i = $('#lk-pw'); i.type = i.type === 'password' ? 'text' : 'password'; i.focus(); },
  pwEye: b => { const i = $('#' + b.dataset.v); i.type = i.type === 'password' ? 'text' : 'password'; },
  lkHint: () => { $('#lk-hintbox').textContent = 'Подсказка: ' + ((LK.info && LK.info.hint) || LK.status.hint || 'не задана'); },
  lkForgot: () => { LK.recover = true; drawLock(); },
  lkBack: () => { LK.recover = false; drawLock(); },
  lockNow: () => lockNow(),
  lkBio: () => lockBio(),
  bioRecheck: () => { LK.bio = null; drawSettings(); },
  pwOpen: b => passwordModal(b.dataset.v),
  pwSave: () => pwSave(),
  codeCopy: b => navigator.clipboard.writeText(b.dataset.v).then(() => toast('Код скопирован')).catch(() => toast('Выделите код и скопируйте вручную')),
  codeFile: b => saveFile(`Планер — код восстановления\r\n\r\n${b.dataset.v}\r\n\r\nСоздан: ${fmtTs(Date.now())}\r\nНужен, если вы забудете пароль. Храните отдельно от компьютера.\r\n`, 'Планер-код-восстановления', 'txt'),
  codeDone: () => { closeModal(); openSettings('security'); toast('Готово: вход по паролю работает'); }
});
document.addEventListener('submit', e => { if (e.target.id === 'lkform') { e.preventDefault(); e.stopImmediatePropagation(); lockSubmit(); } if (e.target.id === 'pwform') { e.preventDefault(); e.stopImmediatePropagation(); pwSave(); } }, true);
document.addEventListener('keyup', e => { if (e.target.id === 'lk-pw' && e.getModifierState) { const c = $('#lk-caps'); if (c) c.classList.toggle('on', e.getModifierState('CapsLock')); } });
document.addEventListener('input', e => { if (e.target.id === 'pw1') { const n = strength(e.target.value); $('#pw-bar').style.cssText = `width:${(n + 1) * 20}%;background:${['var(--hi)', 'var(--hi)', 'var(--mid)', 'var(--ok)', 'var(--ok)'][n]}`; $('#pw-lbl').textContent = e.target.value ? 'Надёжность: ' + SLBL[n].toLowerCase() : ''; } }, true);
document.addEventListener('change', e => { if (e.target.id === 'code-ok') $('#code-done').disabled = !e.target.checked; if (e.target.id === 's-autolock') { D.settings.autoLock = +e.target.value; save(); } if (e.target.id === 's-lockhide') { D.settings.lockOnHide = e.target.checked; save(); } if (e.target.id === 's-bio') bioToggle(e.target.checked, e.target); }, true);
