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
function checkReminders() {
  if (!data || !Array.isArray(data.tasks)) return;
  const now = Date.now(), doneCols = new Set((data.columns || []).filter(c => c.done).map(c => c.id));
  data.notified = data.notified || {};
  let changed = false;
  for (const t of data.tasks) {
    if (t.archived || doneCols.has(t.col)) continue;
    const fire = [];
    if (t.remind !== null && t.remind !== undefined && t.date) {
      const at = dueTs(t) - t.remind * 60000;
      fire.push({ key: t.id + ':' + at, at });
    }
    if (t.snooze) fire.push({ key: t.id + ':s' + t.snooze, at: t.snooze });
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
  // чистим старые отметки
  for (const k of Object.keys(data.notified)) if (now - data.notified[k] > 40 * 864e5) { delete data.notified[k]; changed = true; }
  if (changed) { saveData(data); if (win) win.webContents.send('notified', data.notified); }
}

// ---------- IPC ----------
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
