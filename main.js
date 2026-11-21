// Планер — основной процесс Electron
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('local.d.planer');
app.commandLine.appendSwitch('lang', 'ru'); // русский формат дат и времени в полях ввода

let win = null, tray = null, data = null, quitting = false;
const startHidden = process.argv.includes('--hidden');
const userDir = () => app.getPath('userData');
const DATA_FILE = () => path.join(userDir(), 'planer-data.json');
const BACKUP_DIR = () => path.join(userDir(), 'backups');
const ICON = path.join(__dirname, 'build', 'icon.png');

// ---------- Пароль и шифрование ----------
// Данные шифруются ключом DEK (AES-256-GCM). DEK хранится зашифрованным двумя способами:
// ключом из пароля и ключом из кода восстановления (оба — scrypt). Сам пароль нигде не хранится.
const LOCK_FILE = () => path.join(userDir(), 'planer-lock.json');
const KDF = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const b64 = b => Buffer.from(b).toString('base64'), ub = s => Buffer.from(s, 'base64');
let DEK = null, uiLocked = false, fails = 0, blockUntil = 0;
const kek = (secret, salt) => crypto.scryptSync(String(secret).normalize('NFKC'), ub(salt), 32, KDF);
function seal(key, buf) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(buf), c.final()]); return { iv: b64(iv), tag: b64(c.getAuthTag()), ct: b64(ct) }; }
function unseal(key, o) { const d = crypto.createDecipheriv('aes-256-gcm', key, ub(o.iv)); d.setAuthTag(ub(o.tag)); return Buffer.concat([d.update(ub(o.ct)), d.final()]); }
function readLock() { try { return JSON.parse(fs.readFileSync(LOCK_FILE(), 'utf8')); } catch (e) { return null; } }
const lockOn = () => !!readLock();
const RC_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => { const b = crypto.randomBytes(20); let s = ''; for (let i = 0; i < 20; i++) s += RC_ABC[b[i] % RC_ABC.length]; return s.match(/.{5}/g).join('-'); };
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isEnc = o => o && o.planerEncrypted === 1;
const encryptObj = o => ({ planerEncrypted: 1, ...seal(DEK, Buffer.from(JSON.stringify(o))) });
const decryptObj = o => JSON.parse(unseal(DEK, o).toString('utf8'));
function tryUnwrap(secret, salt, wrap) { try { return unseal(kek(secret, salt), wrap); } catch (e) { return null; } }
function recryptBackups(toEncrypted) {
  try {
    for (const f of fs.readdirSync(BACKUP_DIR())) {
      const p = path.join(BACKUP_DIR(), f); let o; try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
      if (toEncrypted && !isEnc(o)) fs.writeFileSync(p, JSON.stringify(encryptObj(o)));
      else if (!toEncrypted && isEnc(o)) { try { fs.writeFileSync(p, JSON.stringify(decryptObj(o))); } catch (e) {} }
    }
    for (const f of fs.readdirSync(userDir())) if (/^planer-data\.json\.broken-/.test(f)) { const p = path.join(userDir(), f); if (toEncrypted) fs.unlinkSync(p); }
  } catch (e) {}
}

// ---------- Хранение данных ----------
function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function latestBackup() {
  try {
    const files = fs.readdirSync(BACKUP_DIR()).filter(f => f.endsWith('.json')).sort();
    return files.length ? path.join(BACKUP_DIR(), files[files.length - 1]) : null;
  } catch (e) { return null; }
}
function loadData() {
  try { // временный файл новее основного — значит прошлая подмена не прошла
    const t = DATA_FILE() + '.tmp';
    if (fs.existsSync(t) && (!fs.existsSync(DATA_FILE()) || fs.statSync(t).mtimeMs > fs.statSync(DATA_FILE()).mtimeMs)) { const d = readJson(t); log('Взяты данные из более нового временного файла'); return d; }
  } catch (e) {}
  try { if (fs.existsSync(DATA_FILE())) return readJson(DATA_FILE()); }
  catch (e) {
    log('Файл данных повреждён, беру резервную копию', e);
    // файл повреждён — берём последнюю резервную копию, а повреждённый сохраняем рядом
    try { fs.copyFileSync(DATA_FILE(), DATA_FILE() + '.broken-' + Date.now()); } catch (e2) {}
    const b = latestBackup();
    if (b) { try { return readJson(b); } catch (e3) {} }
  }
  // остался только временный файл — значит последняя подмена не прошла
  try { if (fs.existsSync(DATA_FILE() + '.tmp')) { const d = readJson(DATA_FILE() + '.tmp'); log('Восстановлено из временного файла'); return d; } } catch (e) {}
  return null;
}
function dailyBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR(), { recursive: true });
    const d = new Date(), name = `planer-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    fs.copyFileSync(DATA_FILE(), path.join(BACKUP_DIR(), name));
    const files = fs.readdirSync(BACKUP_DIR()).filter(f => f.startsWith('planer-')).sort();
    while (files.length > 14) fs.unlinkSync(path.join(BACKUP_DIR(), files.shift()));
  } catch (e) {}
}
const LOG_FILE = () => path.join(userDir(), 'planer-log.txt');
function log(msg, err) {
  try { fs.mkdirSync(userDir(), { recursive: true }); fs.appendFileSync(LOG_FILE(), `[${new Date().toLocaleString('ru-RU')}] ${msg}${err ? ': ' + (err.code || '') + ' ' + err.message : ''}\r\n`); } catch (e) {}
}
const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) {} };
// надёжная запись: временный файл → подмена; если Windows/антивирус держит файл — повтор, затем прямая запись
let directMode = false;
function writeSafe(f, content) {
  if (directMode) { fs.writeFileSync(f, content); return 'direct'; }
  const tmp = f + '.tmp';
  try { fs.writeFileSync(tmp, content); } catch (e) { log('Не удалось записать временный файл', e); fs.writeFileSync(f, content); return 'direct'; }
  let last = null;
  for (let i = 0; i < 3; i++) { try { fs.renameSync(tmp, f); return 'atomic'; } catch (e) { last = e; sleep(30 * (i + 1)); } }
  log('Подмена файла заблокирована (вероятно, антивирус) — дальше пишу напрямую', last);
  directMode = true;
  fs.writeFileSync(f, content); try { fs.unlinkSync(tmp); } catch (e) {}
  return 'direct';
}
function saveData(d) {
  data = d;
  const f = DATA_FILE();
  fs.mkdirSync(userDir(), { recursive: true });
  let obj = d;
  if (lockOn()) { if (!DEK) throw new Error('данные заблокированы паролем'); obj = encryptObj(d); }
  const content = JSON.stringify(obj);
  writeSafe(f, content);
  // проверка: файл действительно записан
  const back = fs.readFileSync(f, 'utf8');
  if (back.length !== content.length) throw new Error('файл записан не полностью');
  dailyBackup();
}
const settings = () => (data && data.settings) || {};

// ---------- Окно ----------
const THEME_BG = { dark: '#131417', light: '#f3f4f7', midnight: '#0c1222', warm: '#171412', contrast: '#000000' };
function startBg() { const t = (data && data.settings && data.settings.theme) || 'dark'; return THEME_BG[t === 'system' ? 'dark' : t] || THEME_BG.dark; }
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 920, minHeight: 600,
    show: false, backgroundColor: startBg(), icon: ICON,
    title: 'Планер',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: startBg(), symbolColor: '#9aa0a8', height: 48 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => {
    if (!quitting && settings().closeToTray !== false) {
      e.preventDefault();
      win.hide();
      if (lockOn() && settings().lockOnHide) { uiLocked = true; win.webContents.send('lock-now'); }
      if (data && !data.settings.trayHintShown) {
        data.settings.trayHintShown = true; saveData(data);
        notify('Планер работает в трее', 'Напоминания продолжат приходить. Выйти можно из меню значка в трее.');
      }
    }
  });
}
function showWindow() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Планер');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть планер', click: showWindow },
    { label: 'Новая задача', click: () => { showWindow(); win.webContents.send('new-task'); } },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWindow);
}

// ---------- Напоминания ----------
function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON, silent: settings().sound === false });
  if (onClick) n.on('click', onClick);
  n.show();
}
function dueTs(t) {
  if (!t.date) return null;
  const [y, m, d] = t.date.split('-').map(Number);
  const [hh, mm] = (t.time || '09:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}
// точки напоминаний: основное, второе, «пока не выполню» (та же логика — в src/js/m-plan.js)
function remPoints(t, now) {
  const f = [];
  if (t.date) {
    const due = dueTs(t);
    for (const m of [t.remind, t.rem2]) if (m !== null && m !== undefined) { const at = due - m * 60000; f.push([t.id + ':' + at, at]); }
    if (t.nag && now >= due) { const iv = t.nag * 60000, k = Math.floor((now - due) / iv); if (k * iv <= 864e5) { const at = due + k * iv; f.push([t.id + ':' + at, at]); } }
  }
  if (t.snooze) f.push([t.id + ':s' + t.snooze, t.snooze]);
  return f;
}
function dateNextM(x, from) {
  if (!x.date) return null; if (!x.yearly) return x.date;
  const [, m, d] = x.date.split('-').map(Number), y0 = +from.slice(0, 4), p2 = n => String(n).padStart(2, '0');
  for (const y of [y0, y0 + 1]) { const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0, dd = m === 2 && d === 29 && !leap ? 28 : d, s = `${y}-${p2(m)}-${p2(dd)}`; if (s >= from) return s; }
  return null;
}
function checkReminders() {
  if (!data || !Array.isArray(data.tasks)) return;
  const now = Date.now(), doneCols = new Set((data.columns || []).filter(c => c.done).map(c => c.id)), meId = data.share && data.share.me && data.share.me.id;
  data.notified = data.notified || {};
  let changed = false;
  for (const t of data.tasks) {
    if (t.archived || doneCols.has(t.col)) continue;
    if (meId && data.share.remMine !== false && t.who && t.who !== meId) continue; // общая задача другого исполнителя
    const fire = remPoints(t, now).map(([key, at]) => ({ key, at }));
    for (const f of fire) {
      if (f.at <= now && now - f.at < 12 * 3600000 && !data.notified[f.key]) {
        data.notified[f.key] = now; changed = true;
        const when = t.time ? `${t.time}` : 'сегодня';
        if (uiLocked) notify('Напоминание', 'Откройте планер и введите пароль, чтобы увидеть подробности', () => showWindow()); else
        notify('Напоминание: ' + t.title, (t.date ? `Срок: ${t.date.split('-').reverse().join('.')} ${when}` : '') + (t.desc ? '\n' + t.desc.slice(0, 120) : ''), () => { showWindow(); win.webContents.send('open-task', t.id); });
        if (win) win.webContents.send('reminder', t.id);
      }
    }
  }
  const R = (data.budget && data.budget.regular) || [];
  for (const r of R) {
    if (r.active === false || r.remind === null || r.remind === undefined || !r.nextDate) continue;
    const [y, m, d] = r.nextDate.split('-').map(Number), at = new Date(y, m - 1, d, 10, 0).getTime() - r.remind * 864e5, key = 'pay:' + r.id + ':' + r.nextDate;
    if (at <= now && now - at < 3 * 864e5 && !data.notified[key]) {
      data.notified[key] = now; changed = true;
      const cur = (data.settings && data.settings.currency) || '₽';
      if (uiLocked) notify('Платёж', 'Откройте планер и введите пароль, чтобы увидеть подробности', () => showWindow()); else
      notify('Платёж: ' + r.title, `${Number(r.amount).toLocaleString('ru-RU')} ${cur} · срок ${r.nextDate.split('-').reverse().join('.')}`, () => { showWindow(); win.webContents.send('open-pay', r.id); });
      if (win) win.webContents.send('reminder-pay', r.id);
    }
  }
  const nd = new Date(), tdS = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
  for (const x of (Array.isArray(data.dates) ? data.dates : [])) {
    if (x.remind === null || x.remind === undefined) continue;
    const occ = dateNextM(x, tdS); if (!occ) continue;
    const [y, m, d] = occ.split('-').map(Number), at = new Date(y, m - 1, d, 10, 0).getTime() - x.remind * 864e5, key = 'date:' + x.id + ':' + occ;
    if (at <= now && now - at < 3 * 864e5 && !data.notified[key]) {
      data.notified[key] = now; changed = true;
      const left = Math.round((new Date(y, m - 1, d) - new Date(nd.getFullYear(), nd.getMonth(), nd.getDate())) / 864e5);
      if (uiLocked) notify('Важная дата', 'Откройте планер и введите пароль, чтобы увидеть подробности', () => showWindow()); else
      notify('Важная дата: ' + x.title, left <= 0 ? 'Сегодня' : `Через ${left} дн. — ${occ.split('-').reverse().join('.')}`, () => { showWindow(); win.webContents.send('reminder-date', x.id); });
      if (win) win.webContents.send('reminder-date', x.id);
    }
  }
  // чистим старые отметки
  for (const k of Object.keys(data.notified)) if (now - data.notified[k] > 40 * 864e5) { delete data.notified[k]; changed = true; }
  if (changed) { saveData(data); if (win) win.webContents.send('notified', data.notified); }
}

// ---------- IPC ----------
let focusTimer = null;
ipcMain.on('focus:alarm', (e, o) => {
  clearTimeout(focusTimer); focusTimer = null; if (!o || !o.at) return;
  const ms = Math.max(0, Math.min(6 * 3600e3, Number(o.at) - Date.now()));
  focusTimer = setTimeout(() => { focusTimer = null; if (uiLocked) notify('Планер', 'Отрезок таймера завершён', () => showWindow()); else notify(String(o.title || 'Фокус').slice(0, 120), String(o.body || '').slice(0, 300), () => showWindow()); }, ms);
});
ipcMain.on('focus:cancel', () => { clearTimeout(focusTimer); focusTimer = null; });
ipcMain.on('notify', (e, o) => { if (!o) return; notify(String(o.title || 'Планер').slice(0, 120), String(o.body || '').slice(0, 300), () => { showWindow(); if (o.task) win.webContents.send('open-task', String(o.task)); }); });
function resolveLoaded(raw) {
  if (!isEnc(raw)) return raw;
  if (!DEK) return null;
  try { return decryptObj(raw); } catch (e) { log('Не удалось расшифровать данные', e); return null; }
}
ipcMain.handle('data:load', () => {
  const raw = loadData();
  if (isEnc(raw) && !DEK) { const L = readLock() || {}; return { locked: true, hint: L.hint || '', wait: Math.max(0, blockUntil - Date.now()) }; }
  data = resolveLoaded(raw); return data;
});
// ---- вход по паролю ----
function guard() { const w = blockUntil - Date.now(); return w > 0 ? { ok: false, wait: w, error: `Слишком много попыток. Подождите ${Math.ceil(w / 1000)} с` } : null; }
function failed() { fails++; if (fails >= 5) blockUntil = Date.now() + 30000 * (fails - 4); return { ok: false, error: 'Неверный пароль', left: Math.max(0, 5 - fails), wait: Math.max(0, blockUntil - Date.now()) }; }
ipcMain.handle('lock:status', () => { const L = readLock(); return { enabled: !!L, hint: L ? L.hint || '' : '', created: L ? L.created : null }; });
ipcMain.handle('lock:unlock', (e, pw) => {
  const g = guard(); if (g) return g;
  const L = readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
  const key = tryUnwrap(pw, L.salt, L.wp); if (!key) return failed();
  DEK = key; fails = 0; uiLocked = false;
  data = resolveLoaded(loadData()); return { ok: true, data };
});
ipcMain.handle('lock:recover', (e, code) => {
  const g = guard(); if (g) return g;
  const L = readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
  const key = tryUnwrap(normCode(code), L.saltR, L.wr); if (!key) { const r = failed(); r.error = 'Неверный код восстановления'; return r; }
  DEK = key; fails = 0; uiLocked = false; data = resolveLoaded(loadData()); log('Вход по коду восстановления');
  return { ok: true, data };
});
ipcMain.handle('lock:verify', (e, pw) => {
  const g = guard(); if (g) return g;
  const L = readLock(); if (!L) { uiLocked = false; return { ok: true }; }
  if (!tryUnwrap(pw, L.salt, L.wp)) return failed();
  fails = 0; uiLocked = false; return { ok: true };
});
ipcMain.handle('lock:enable', (e, o) => {
  try {
    if (lockOn()) return { ok: false, error: 'Пароль уже включён' };
    if (!o || String(o.pw || '').length < 4) return { ok: false, error: 'Пароль слишком короткий' };
    DEK = crypto.randomBytes(32);
    const salt = b64(crypto.randomBytes(16)), saltR = b64(crypto.randomBytes(16)), code = genCode();
    const L = { v: 1, kdf: 'scrypt', salt, saltR, wp: seal(kek(o.pw, salt), DEK), wr: seal(kek(normCode(code), saltR), DEK), hint: String(o.hint || '').slice(0, 80), created: Date.now() };
    fs.mkdirSync(userDir(), { recursive: true });
    writeSafe(LOCK_FILE(), JSON.stringify(L));
    if (data) saveData(data);
    recryptBackups(true); log('Включён вход по паролю');
    return { ok: true, code };
  } catch (err) { log('Ошибка включения пароля', err); return { ok: false, error: err.message }; }
});
ipcMain.handle('lock:change', (e, o) => {
  const g = guard(); if (g) return g;
  const L = readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
  const key = tryUnwrap(o.old, L.salt, L.wp); if (!key) return failed();
  if (String(o.pw || '').length < 4) return { ok: false, error: 'Новый пароль слишком короткий' };
  fails = 0; const salt = b64(crypto.randomBytes(16)); L.salt = salt; L.wp = seal(kek(o.pw, salt), key); L.hint = String(o.hint || '').slice(0, 80);
  writeSafe(LOCK_FILE(), JSON.stringify(L)); log('Пароль изменён'); return { ok: true };
});
ipcMain.handle('lock:setAfterRecovery', (e, o) => {
  const L = readLock(); if (!L || !DEK) return { ok: false, error: 'Нет доступа' };
  if (String(o.pw || '').length < 4) return { ok: false, error: 'Пароль слишком короткий' };
  const salt = b64(crypto.randomBytes(16)), saltR = b64(crypto.randomBytes(16)), code = genCode();
  Object.assign(L, { salt, saltR, wp: seal(kek(o.pw, salt), DEK), wr: seal(kek(normCode(code), saltR), DEK), hint: String(o.hint || '').slice(0, 80) });
  writeSafe(LOCK_FILE(), JSON.stringify(L)); log('Новый пароль после восстановления'); return { ok: true, code };
});
ipcMain.handle('lock:newCode', (e, pw) => {
  const g = guard(); if (g) return g;
  const L = readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
  const key = tryUnwrap(pw, L.salt, L.wp); if (!key) return failed();
  fails = 0; const saltR = b64(crypto.randomBytes(16)), code = genCode(); L.saltR = saltR; L.wr = seal(kek(normCode(code), saltR), key);
  writeSafe(LOCK_FILE(), JSON.stringify(L)); return { ok: true, code };
});
ipcMain.handle('lock:disable', (e, pw) => {
  const g = guard(); if (g) return g;
  const L = readLock(); if (!L) return { ok: true };
  const key = tryUnwrap(pw, L.salt, L.wp); if (!key) return failed();
  fails = 0; DEK = key; recryptBackups(false);
  fs.unlinkSync(LOCK_FILE()); if (data) saveData(data); DEK = null; log('Вход по паролю отключён');
  return { ok: true };
});
ipcMain.on('lock:ui', () => { if (lockOn()) uiLocked = true; });
ipcMain.handle('data:save', (e, d) => {
  if (!d || !Array.isArray(d.tasks)) return { ok: false, error: 'неверные данные' };
  if (data && data.notified) d.notified = Object.assign({}, d.notified || {}, data.notified);
  try { saveData(d); return { ok: true }; } catch (err) { log('Ошибка сохранения', err); return { ok: false, error: (err.code ? err.code + ': ' : '') + err.message, path: DATA_FILE() }; }
});
ipcMain.on('data:saveSync', (e, d) => {
  try { if (d && Array.isArray(d.tasks)) { if (data && data.notified) d.notified = Object.assign({}, d.notified || {}, data.notified); saveData(d); } e.returnValue = true; } catch (err) { log('Ошибка сохранения при выходе', err); e.returnValue = false; }
});
ipcMain.handle('data:reset', () => { try { [DATA_FILE(), DATA_FILE() + '.tmp'].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} }); data = null; return true; } catch (e) { log('Ошибка сброса', e); return false; } });
ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataPath: DATA_FILE(), logPath: LOG_FILE(), fileExists: fs.existsSync(DATA_FILE()), autostart: app.getLoginItemSettings().openAtLogin }));
ipcMain.handle('app:autostart', (e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); return app.getLoginItemSettings().openAtLogin; });
ipcMain.handle('data:folder', () => shell.openPath(userDir()));
ipcMain.handle('data:export', async (e, o) => {
  if (typeof o === 'string') o = { content: o, name: 'Планер-копия', ext: 'json' };
  const ext = o.ext || 'json', names = { json: 'Копия планера', csv: 'Таблица CSV (Excel)' };
  const r = await dialog.showSaveDialog(win, { title: 'Сохранить файл', defaultPath: path.join(app.getPath('documents'), (o.name || 'Планер') + '.' + ext), filters: [{ name: names[ext] || ext, extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, o.content); return r.filePath;
});
ipcMain.handle('data:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Открыть резервную копию', properties: ['openFile'], filters: [{ name: 'Копия планера', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});
ipcMain.on('app:titlebar', (e, o) => { try { if (win && win.setTitleBarOverlay) win.setTitleBarOverlay({ color: o.color, symbolColor: o.symbol, height: Math.round(48 * (o.zoom || 1)) }); if (win) win.setBackgroundColor(o.color); } catch (err) {} });
ipcMain.on('app:quit', () => { quitting = true; app.quit(); });

// ---------- Помощник: YandexGPT (Yandex AI Studio, OpenAI-совместимый API). Адрес фиксирован ----------
const AI_URL = 'https://llm.api.cloud.yandex.net/v1/chat/completions';
ipcMain.handle('ai-chat', async (event, req) => {
  const key = String((req && req.key) || '').trim(), folder = String((req && req.folder) || '').trim(), model = String((req && req.model) || '');
  const messages = Array.isArray(req && req.messages) ? req.messages : [];
  if (!/^[A-Za-z0-9_\-.]{20,300}$/.test(key) || !/^[a-z0-9]{10,40}$/.test(folder)) return { status: 401, text: '{"error":{"message":"нет ключа или каталога"}}' };
  if (!/^gpt:\/\/[a-z0-9]{10,40}\/[a-z0-9][a-z0-9.\-_/@]{1,80}$/i.test(model)) return { status: 400, text: '{"error":{"message":"неверное название модели"}}' };
  if (!messages.length || messages.length > 20 || messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) return { status: 400, text: '{"error":{"message":"неверный запрос"}}' };
  if (messages.reduce((s, m) => s + m.content.length, 0) > 120000) return { status: 400, text: '{"error":{"message":"слишком длинный запрос"}}' };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(AI_URL, { method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, 'OpenAI-Project': folder, 'x-data-logging-enabled': 'false', 'User-Agent': `Planer/${app.getVersion()}` },
      body: JSON.stringify({ model, messages, temperature: Math.min(1, Math.max(0, Number(req.temperature) || 0.2)), max_tokens: Math.min(4000, Math.max(50, Number(req.maxTokens) || 1500)) }) });
    return { status: res.status, text: (await res.text()).slice(0, 200000) };
  } catch (e) { return { status: 0, text: '', error: e.name === 'AbortError' ? 'timeout' : (e.cause && e.cause.code) || e.message }; }
  finally { clearTimeout(timer); }
});
// загрузка закона по ссылке (только http/https, без адресов локальной сети)
ipcMain.handle('net-get', async (event, url) => {
  let u; try { u = new URL(String(url)); } catch (e) { return { status: 0, error: 'неверная ссылка' }; }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(u.hostname)) return { status: 0, error: 'такие адреса не загружаются' };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(u.href, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'ru-RU,ru;q=0.9', 'Referer': u.origin + '/' } });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) return { status: 0, error: 'файл слишком большой' };
    return { status: res.status, ct: res.headers.get('content-type') || '', url: res.url, b64: buf.toString('base64') };
  } catch (e) { return { status: 0, error: e.name === 'AbortError' ? 'сайт долго не отвечает' : (e.cause && e.cause.code) || e.message }; }
  finally { clearTimeout(timer); }
});
// печать документа (Windows: «Microsoft Print to PDF» сохраняет в PDF)
ipcMain.handle('doc-pdf', async (event, o) => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(o && o.html || '')));
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: false, margins: { marginType: 'none' } });
    const r = await dialog.showSaveDialog(win, { title: 'Сохранить PDF', defaultPath: path.join(app.getPath('documents'), String(o.name || 'Документ').replace(/[\\/:*?"<>|]+/g, '_') + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, pdf); return r.filePath;
  } finally { w.destroy(); }
});
ipcMain.handle('doc-save', async (event, o) => {
  const ext = String(o.ext || 'docx'), r = await dialog.showSaveDialog(win, { title: 'Сохранить документ', defaultPath: path.join(app.getPath('documents'), String(o.name || 'Документ').replace(/[\\/:*?"<>|]+/g, '_') + '.' + ext), filters: [{ name: ext === 'docx' ? 'Документ Word' : ext, extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(o.b64, 'base64')); return r.filePath;
});

// ---------- Общая папка для совместных проектов (Google Диск для компьютера) ----------
let shareRoot = null;
const inRoot = p => { if (!shareRoot) return false; const r = path.resolve(shareRoot), x = path.resolve(p); return x === r || x.startsWith(r + path.sep); };
ipcMain.handle('files:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Общая папка для совместных проектов', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null; shareRoot = r.filePaths[0]; return shareRoot;
});
ipcMain.handle('files:setRoot', (e, p) => { try { if (p && fs.statSync(p).isDirectory()) { shareRoot = p; return true; } } catch (err) {} return false; });
ipcMain.handle('files:list', (e, dir) => {
  if (!inRoot(dir)) return null;
  try { return fs.readdirSync(dir).map(name => { try { const st = fs.statSync(path.join(dir, name)); return { name, mtime: st.mtimeMs, size: st.size, type: st.isDirectory() ? 'directory' : 'file' }; } catch (err) { return null; } }).filter(Boolean); } catch (err) { return null; }
});
ipcMain.handle('files:read', (e, f) => { if (!inRoot(f)) return null; try { return fs.readFileSync(f, 'utf8'); } catch (err) { return null; } });
ipcMain.handle('files:write', (e, f, content) => {
  if (!inRoot(f)) throw new Error('путь вне общей папки');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = path.join(path.dirname(f), '.~' + path.basename(f) + '.tmp');
  try { fs.writeFileSync(tmp, content); fs.renameSync(tmp, f); } catch (err) { try { fs.unlinkSync(tmp); } catch (e2) {} fs.writeFileSync(f, content); }
  return true;
});
ipcMain.handle('files:mkdir', (e, d) => { if (!inRoot(d)) return false; fs.mkdirSync(d, { recursive: true }); return true; });

// ---------- Жизненный цикл ----------
app.on('second-instance', showWindow);
app.whenReady().then(() => {
  data = loadData(); if (isEnc(data)) data = null;
  createWindow();
  createTray();
  setInterval(checkReminders, 15000);
  setTimeout(checkReminders, 4000);
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && quitting) app.quit(); });
