'use strict';
// ============================================================
//  Мост для телефона Android (Capacitor). На компьютере window.api даёт Electron (preload.js),
//  здесь — тот же набор функций через встроенные модули Android: файлы, уведомления, «Поделиться».
//  В обычном браузере ничего не делает.
// ============================================================
(function () {
  if (window.api) return;
  const C = window.Capacitor, X = window.capacitorExports;
  if (!C || !X || !C.isNativePlatform || !C.isNativePlatform()) return;

  const reg = n => X.registerPlugin(n), Http = X.CapacitorHttp;
  const FS = reg('Filesystem'), Notif = reg('LocalNotifications'), Share = reg('Share'), AppP = reg('App'), PF = reg('PlanerFiles');
  const DIR = 'DATA', DATA_FILE = 'planer-data.json', LOCK_FILE = 'planer-lock.json', LOG_FILE = 'planer-log.txt', BK = 'backups';
  const listeners = {};
  const emit = (ch, arg) => (listeners[ch] || []).forEach(f => { try { f(arg); } catch (e) { console.error(e); } });

  // ---------- файлы ----------
  async function readText(path, directory = DIR) { try { const r = await FS.readFile({ path, directory, encoding: 'utf8' }); return typeof r.data === 'string' ? r.data : null; } catch (e) { return null; } }
  async function writeText(path, data, directory = DIR) { await FS.writeFile({ path, data, directory, encoding: 'utf8', recursive: true }); }
  async function exists(path) { try { await FS.stat({ path, directory: DIR }); return true; } catch (e) { return false; } }
  async function remove(path) { try { await FS.deleteFile({ path, directory: DIR }); } catch (e) {} }
  async function log(msg, err) {
    try {
      const line = `[${new Date().toLocaleString('ru-RU')}] ${msg}${err ? ': ' + ((err && err.message) || err) : ''}\n`;
      await FS.appendFile({ path: LOG_FILE, data: line, directory: DIR, encoding: 'utf8' }).catch(() => writeText(LOG_FILE, line));
    } catch (e) {}
  }
  // запись через временный файл: при сбое посреди записи остаётся прежний файл
  async function writeSafe(path, content) {
    const tmp = path + '.tmp';
    await writeText(tmp, content);
    try { await remove(path); await FS.rename({ from: tmp, to: path, directory: DIR, toDirectory: DIR }); }
    catch (e) { await writeText(path, content); await remove(tmp); }
    const back = await readText(path);
    if (back === null || back.length !== content.length) throw new Error('файл записан не полностью');
  }
  const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return undefined; } };
  async function loadRaw() {
    const main = parse(await readText(DATA_FILE)), tmp = parse(await readText(DATA_FILE + '.tmp'));
    if (main) return main;
    if (tmp) { log('Восстановлено из временного файла'); return tmp; }
    if (main === undefined) { // файл повреждён — последняя резервная копия
      log('Файл данных повреждён, беру резервную копию');
      try { const L = (await FS.readdir({ path: BK, directory: DIR })).files.map(f => f.name || f).filter(n => /\.json$/.test(n)).sort(); for (let i = L.length - 1; i >= 0; i--) { const b = parse(await readText(BK + '/' + L[i])); if (b) return b; } } catch (e) {}
    }
    return null;
  }
  async function dailyBackup(content) {
    try {
      const d = new Date(), name = `planer-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
      await writeText(BK + '/' + name, content);
      const L = (await FS.readdir({ path: BK, directory: DIR })).files.map(f => f.name || f).filter(n => n.startsWith('planer-')).sort();
      while (L.length > 14) await remove(BK + '/' + L.shift());
    } catch (e) {}
  }

  // ---------- пароль и шифрование (WebCrypto: PBKDF2-SHA256 + AES-256-GCM) ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u => { let s = ''; const a = new Uint8Array(u); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const ub = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  const ITER = 310000;
  let DEK = null, uiLocked = false, fails = 0, blockUntil = 0, data = null, lockCache;
  async function kek(secret, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: ub(salt), iterations: iter || ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const aes = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function seal(key, bytes) { const iv = rnd(12), out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)); return { iv: b64(iv), tag: b64(out.slice(-16)), ct: b64(out.slice(0, -16)) }; }
  async function unseal(key, o) { const ct = ub(o.ct), tag = ub(o.tag), all = new Uint8Array(ct.length + tag.length); all.set(ct); all.set(tag, ct.length); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub(o.iv) }, key, all)); }
  async function readLock() { if (lockCache === undefined) lockCache = parse(await readText(LOCK_FILE)) || null; return lockCache; }
  async function writeLock(L) { lockCache = L; if (L) await writeSafe(LOCK_FILE, JSON.stringify(L)); else await remove(LOCK_FILE); }
  const RC_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const genCode = () => { const b = rnd(20); let s = ''; for (let i = 0; i < 20; i++) s += RC_ABC[b[i] % RC_ABC.length]; return s.match(/.{5}/g).join('-'); };
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isEnc = o => o && o.planerEncrypted === 1;
  async function tryUnwrap(secret, salt, wrap, iter) { try { return await unseal(await kek(secret, salt, iter), wrap); } catch (e) { return null; } }
  async function encryptObj(o) { return { planerEncrypted: 1, ...(await seal(await aes(DEK), enc.encode(JSON.stringify(o)))) }; }
  async function decryptObj(o) { return JSON.parse(dec.decode(await unseal(await aes(DEK), o))); }
  async function resolveLoaded(raw) { if (!isEnc(raw)) return raw; if (!DEK) return null; try { return await decryptObj(raw); } catch (e) { log('Не удалось расшифровать данные', e); return null; } }
  async function recryptBackups(toEnc) {
    try {
      for (const f of (await FS.readdir({ path: BK, directory: DIR })).files.map(f => f.name || f)) {
        const p = BK + '/' + f, o = parse(await readText(p)); if (!o) continue;
        if (toEnc && !isEnc(o)) await writeText(p, JSON.stringify(await encryptObj(o)));
        else if (!toEnc && isEnc(o)) { try { await writeText(p, JSON.stringify(await decryptObj(o))); } catch (e) {} }
      }
    } catch (e) {}
  }
  function guard() { const w = blockUntil - Date.now(); return w > 0 ? { ok: false, wait: w, error: `Слишком много попыток. Подождите ${Math.ceil(w / 1000)} с` } : null; }
  function failed() { fails++; if (fails >= 5) blockUntil = Date.now() + 30000 * (fails - 4); return { ok: false, error: 'Неверный пароль', left: Math.max(0, 5 - fails), wait: Math.max(0, blockUntil - Date.now()) }; }

  // ---------- сохранение ----------
  let chain = Promise.resolve();
  function saveData(d) {
    const job = chain.then(async () => {
      data = d; let obj = d;
      if (await readLock()) { if (!DEK) throw new Error('данные заблокированы паролем'); obj = await encryptObj(d); }
      const content = JSON.stringify(obj);
      await writeSafe(DATA_FILE, content);
      await dailyBackup(content);
      scheduleSoon();
    });
    chain = job.catch(() => {});
    return job;
  }

  // ---------- напоминания: системные уведомления, приходят и при закрытом приложении ----------
  const CH = 'planer-remind', FOCUS_NID = 1999999999;
  let chReady = null, schedT = null, lastSig = '';
  function ensureChannel() {
    if (!chReady) chReady = (async () => {
      let p = await Notif.checkPermissions(); if (p.display !== 'granted') p = await Notif.requestPermissions();
      await Notif.createChannel({ id: CH, name: 'Напоминания', description: 'Задачи и платежи', importance: 5, visibility: 0, vibration: true, lights: true });
      return p.display === 'granted';
    })().catch(e => { chReady = null; console.warn(e); return false; });
    return chReady;
  }
  const dueTs = t => { const [y, m, d] = t.date.split('-').map(Number), [hh, mm] = (t.time || '09:00').split(':').map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); };
  const nid = k => { let h = 7; for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 + 1; };
  const pad2 = n => String(n).padStart(2, '0');
  const nextYearFrom = s => (+s.slice(0, 4) + 1) + s.slice(4);
  function dateNextA(x, from) {
    if (!x.date) return null; if (!x.yearly) return x.date >= from ? x.date : null;
    const [, m, d] = x.date.split('-').map(Number), y0 = +from.slice(0, 4);
    for (const y of [y0, y0 + 1]) { const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0, dd = m === 2 && d === 29 && !leap ? 28 : d, s = `${y}-${pad2(m)}-${pad2(dd)}`; if (s >= from) return s; }
    return null;
  }
  function habDue(h, dt) {
    const ds = x => `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`, goal = Math.max(1, h.goal || 1), log = h.log || {}, done = s => (log[s] || 0) >= goal;
    if (done(ds(dt))) return false;
    if (h.freq === 'days') return (h.days || []).includes(dt.getDay());
    if (h.freq === 'times') { const w = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - (dt.getDay() + 6) % 7); let c = 0; for (let i = 0; i < 7; i++) if (done(ds(new Date(w.getFullYear(), w.getMonth(), w.getDate() + i)))) c++; return c < (h.n || 3); }
    return true;
  }
  function upcoming(d) {
    if (!d || !Array.isArray(d.tasks)) return [];
    const now = Date.now(), until = now + 21 * 864e5, done = new Set((d.columns || []).filter(c => c.done).map(c => c.id)), out = [], cur = (d.settings && d.settings.currency) || '₽';
    const fmt = s => s.split('-').reverse().join('.');
    const meId = d.share && d.share.me && d.share.me.id, mineOnly = meId && d.share.remMine !== false;
    for (const t of d.tasks) {
      if (t.archived || done.has(t.col)) continue;
      if (mineOnly && t.who && t.who !== meId) continue;
      const at = [];
      if (t.date) {
        const due = dueTs(t);
        for (const m of [t.remind, t.rem2]) if (m != null) at.push(due - m * 60000);
        if (t.nag) { const iv = t.nag * 60000; let n = 0; for (let a = due; a <= due + 864e5 && a < until && n < 24; a += iv) if (a > now) { at.push(a); n++; } }
      }
      if (t.snooze) at.push(t.snooze);
      for (const a of [...new Set(at)]) if (a > now && a < until) out.push({ key: t.id + ':' + a, at: a, kind: 'task', id: t.id, title: 'Напоминание: ' + t.title, body: (t.date ? `Срок: ${fmt(t.date)} ${t.time || ''}` : '') + (t.desc ? '\n' + t.desc.slice(0, 120) : '') });
    }
    for (const r of ((d.budget && d.budget.regular) || [])) {
      if (r.active === false || r.remind == null || !r.nextDate) continue;
      const [y, m, dd] = r.nextDate.split('-').map(Number), a = new Date(y, m - 1, dd, 10).getTime() - r.remind * 864e5;
      if (a > now && a < until) out.push({ key: 'pay:' + r.id + ':' + r.nextDate, at: a, kind: 'pay', id: r.id, title: 'Платёж: ' + r.title, body: `${Number(r.amount).toLocaleString('ru-RU')} ${cur} · срок ${fmt(r.nextDate)}` });
    }
    const td0 = new Date(now), tdS = `${td0.getFullYear()}-${pad2(td0.getMonth() + 1)}-${pad2(td0.getDate())}`;
    for (const x of (Array.isArray(d.dates) ? d.dates : [])) {
      if (x.remind == null) continue;
      for (const from of [tdS, nextYearFrom(tdS)]) {
        const occ = dateNextA(x, from); if (!occ) continue;
        const [y, m, dd] = occ.split('-').map(Number), a = new Date(y, m - 1, dd, 10).getTime() - x.remind * 864e5;
        if (a > now && a < until) out.push({ key: 'date:' + x.id + ':' + occ, at: a, kind: 'date', id: x.id, title: 'Важная дата: ' + x.title, body: `${fmt(occ)}${x.remind ? ' · через ' + x.remind + ' дн.' : ' · сегодня'}` });
      }
    }
    for (const h of (Array.isArray(d.habits) ? d.habits : [])) {
      if (h.archived || !h.remind) continue; const [hh, mm] = h.remind.split(':').map(Number);
      for (let i = 0; i < 7; i++) {
        const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() + i);
        const a = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), hh, mm).getTime();
        if (a > now && a < until && habDue(h, dt)) out.push({ key: 'hab:' + h.id + ':' + `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`, at: a, kind: 'hab', id: h.id, title: 'Привычка: ' + (h.icon ? h.icon + ' ' : '') + h.title, body: 'Ещё не отмечено сегодня' });
      }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, 150);
  }
  function scheduleSoon() { clearTimeout(schedT); schedT = setTimeout(schedule, 1500); }
  // ---------- виджет «Сегодня» на главном экране ----------
  let wSig = '';
  function widgetPush(d, locked) {
    try {
      if (!d || !Array.isArray(d.tasks)) return;
      const n0 = new Date(), td = `${n0.getFullYear()}-${pad2(n0.getMonth() + 1)}-${pad2(n0.getDate())}`, done = new Set((d.columns || []).filter(c => c.done).map(c => c.id));
      const meId = d.share && d.share.me && d.share.me.id;
      const L = d.tasks.filter(t => !t.archived && t.date && (t.date === td || (t.date < td && !done.has(t.col))) && !(meId && t.who && t.who !== meId));
      const isD = t => done.has(t.col), open = L.filter(t => !isD(t)).sort((a, b) => (a.date < td ? 0 : 1) - (b.date < td ? 0 : 1) || (a.time || '99').localeCompare(b.time || '99'));
      const fin = L.filter(isD), items = open.concat(fin).slice(0, 6).map(t => ({ t: String(t.title || '').slice(0, 80), time: t.date < td ? 'просрочено' : (t.time || ''), done: isD(t), over: t.date < td && !isD(t) }));
      const MGR = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const o = locked ? { date: td, locked: true, left: open.length, title: 'Сегодня' } : { date: td, title: `Сегодня, ${n0.getDate()} ${MGR[n0.getMonth()]}`, left: open.length, done: fin.length, items, more: Math.max(0, L.length - items.length) };
      const json = JSON.stringify(o); if (json === wSig) return; wSig = json;
      PF.widgetSet({ json }).catch(() => {});
    } catch (e) { console.warn('widget', e); }
  }
  async function widgetTake() { try { const r = await PF.widgetTake(); if (r && r.newTask) setTimeout(() => emit('new-task'), 400); } catch (e) {} }
  async function schedule() {
    try {
      const locked = !!(await readLock());
      widgetPush(data, locked);
      const list = upcoming(data).map(it => locked ? { ...it, title: 'Планер: напоминание', body: 'Откройте Планер, чтобы увидеть подробности' } : it);
      const sig = JSON.stringify(list.map(i => [i.key, i.title, i.body]));
      if (sig === lastSig) return;
      if (!list.length && !lastSig) { lastSig = sig; return; }
      if (!(await ensureChannel())) return;
      const pend = await Notif.getPending();
      const old = pend.notifications.filter(n => n.id !== FOCUS_NID); if (old.length) await Notif.cancel({ notifications: old.map(n => ({ id: n.id })) });
      if (list.length) await Notif.schedule({ notifications: list.map(it => ({ id: nid(it.key), title: it.title, body: it.body, largeBody: it.body, channelId: CH, smallIcon: 'ic_stat_planer', iconColor: '#4D8DFF', schedule: { at: new Date(it.at), allowWhileIdle: true }, extra: { kind: it.kind, id: it.id } })) });
      lastSig = sig;
    } catch (e) { log('Не удалось запланировать напоминания', e); }
  }
  Notif.addListener('localNotificationActionPerformed', a => {
    const ex = (a && a.notification && a.notification.extra) || {};
    if (uiLocked) return;
    if (ex.kind !== 'focus') setTimeout(() => emit(ex.kind === 'pay' ? 'open-pay' : ex.kind === 'date' ? 'reminder-date' : ex.kind === 'hab' ? 'reminder-hab' : 'open-task', ex.id), 300);
  }).catch(() => {});
  // пока приложение открыто — окно напоминания внутри программы, как на компьютере
  let active = true;
  setInterval(() => {
    if (!active || !data || !Array.isArray(data.tasks)) return;
    const now = Date.now(), done = new Set((data.columns || []).filter(c => c.done).map(c => c.id)); data.notified = data.notified || {};
    let ch = false;
    const meId = data.share && data.share.me && data.share.me.id, mineOnly = meId && data.share.remMine !== false;
    for (const t of data.tasks) {
      if (t.archived || done.has(t.col) || (mineOnly && t.who && t.who !== meId)) continue; const f = [];
      if (t.date) {
        const due = dueTs(t);
        for (const m of [t.remind, t.rem2]) if (m != null) { const at = due - m * 60000; f.push([t.id + ':' + at, at]); }
        if (t.nag && now >= due) { const iv = t.nag * 60000, k = Math.floor((now - due) / iv); if (k * iv <= 864e5) { const at = due + k * iv; f.push([t.id + ':' + at, at]); } }
      }
      if (t.snooze) f.push([t.id + ':s' + t.snooze, t.snooze]);
      for (const [k, at] of f) if (at <= now && now - at < 12 * 3600e3 && !data.notified[k]) { data.notified[k] = now; ch = true; emit('reminder', t.id); }
    }
    for (const r of ((data.budget && data.budget.regular) || [])) {
      if (r.active === false || r.remind == null || !r.nextDate) continue;
      const [y, m, d] = r.nextDate.split('-').map(Number), at = new Date(y, m - 1, d, 10).getTime() - r.remind * 864e5, k = 'pay:' + r.id + ':' + r.nextDate;
      if (at <= now && now - at < 3 * 864e5 && !data.notified[k]) { data.notified[k] = now; ch = true; emit('reminder-pay', r.id); }
    }
    const n0 = new Date(now), tdS = `${n0.getFullYear()}-${pad2(n0.getMonth() + 1)}-${pad2(n0.getDate())}`;
    for (const h of (Array.isArray(data.habits) ? data.habits : [])) {
      if (h.archived || !h.remind || !habDue(h, n0)) continue; const [hh, mm] = h.remind.split(':').map(Number), at = new Date(n0.getFullYear(), n0.getMonth(), n0.getDate(), hh, mm).getTime(), k = 'hab:' + h.id + ':' + tdS;
      if (at <= now && now - at < 6 * 3600e3 && !data.notified[k]) { data.notified[k] = now; ch = true; emit('reminder-hab', h.id); }
    }
    for (const x of (Array.isArray(data.dates) ? data.dates : [])) {
      if (x.remind == null) continue; const occ = dateNextA(x, tdS); if (!occ) continue;
      const [y, m, d] = occ.split('-').map(Number), at = new Date(y, m - 1, d, 10).getTime() - x.remind * 864e5, k = 'date:' + x.id + ':' + occ;
      if (at <= now && now - at < 3 * 864e5 && !data.notified[k]) { data.notified[k] = now; ch = true; emit('reminder-date', x.id); }
    }
    if (ch) emit('notified', data.notified);
  }, 15000);

  // ---------- системные события: «Назад», свернули, вернулись ----------
  AppP.addListener('backButton', () => emit('back')).catch(() => {});
  AppP.addListener('appStateChange', s => { active = !!s.isActive; emit(s.isActive ? 'resume' : 'pause'); if (!s.isActive) schedule(); else { widgetTake(); wSig = ''; scheduleSoon(); } }).catch(() => {});
  setTimeout(widgetTake, 2500);

  // ---------- выбор и сохранение файлов ----------
  const pickFile = accept => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept; i.style.display = 'none';
    i.onchange = () => { const f = i.files && i.files[0]; i.remove(); if (!f) return res(null); f.text().then(res, () => res(null)); };
    document.body.appendChild(i); i.click();
  });
  async function shareText(content, name, ext) {
    const path = String(name || 'Планер').replace(/[\\/:*?"<>|]+/g, '_') + '.' + (ext || 'json');
    const w = await FS.writeFile({ path, data: content, directory: 'CACHE', encoding: 'utf8' });
    try { await Share.share({ title: path, files: [w.uri], dialogTitle: 'Сохранить или отправить' }); return path; }
    catch (e) { if (/cancel/i.test(String(e && e.message))) return null; throw e; }
  }

  window.api = {
    platform: 'android',
    load: async () => {
      const raw = await loadRaw();
      if (isEnc(raw) && !DEK) { const L = (await readLock()) || {}; return { locked: true, hint: L.hint || '', wait: Math.max(0, blockUntil - Date.now()) }; }
      data = await resolveLoaded(raw); scheduleSoon(); return data;
    },
    save: async d => {
      if (!d || !Array.isArray(d.tasks)) return { ok: false, error: 'неверные данные' };
      if (data && data.notified) d.notified = Object.assign({}, d.notified || {}, data.notified);
      try { await saveData(d); return { ok: true }; } catch (e) { log('Ошибка сохранения', e); return { ok: false, error: (e && e.message) || String(e), path: 'память приложения' }; }
    },
    saveSync: d => { window.api.save(d); return true; },
    reset: async () => { await remove(DATA_FILE); await remove(DATA_FILE + '.tmp'); data = null; return true; },
    info: async () => {
      let version = ''; try { version = (await AppP.getInfo()).version; } catch (e) {}
      return { version, dataPath: 'Память телефона, папка приложения «Планер»', logPath: '', fileExists: await exists(DATA_FILE), autostart: false, platform: 'android' };
    },
    setAutostart: async () => false,
    openFolder: async () => {},
    exportData: async o => { if (typeof o === 'string') o = { content: o, name: 'Планер-копия', ext: 'json' }; return shareText(o.content, o.name, o.ext); },
    importData: () => pickFile('application/json,.json'),
    setZoom: f => { document.body.style.zoom = f || 1; },
    titlebar: () => {},
    quit: () => AppP.exitApp(),
    minimize: () => { AppP.minimizeApp().catch(() => {}); },
    exactAlarms: async () => { try { return (await Notif.checkExactNotificationSetting()).exact_alarm === 'granted'; } catch (e) { return true; } },
    askExactAlarms: async () => { try { await Notif.changeExactNotificationSetting(); } catch (e) {} },
    notifPermission: async () => { try { return (await Notif.checkPermissions()).display === 'granted'; } catch (e) { return false; } },
    askNotif: async () => { chReady = null; return ensureChannel(); },
    lock: {
      status: async () => { const L = await readLock(); return { enabled: !!L, hint: L ? L.hint || '' : '', created: L ? L.created : null, bio: !!(L && L.bio) }; },
      // ---- вход по отпечатку: ключ данных зашифрован ключом AndroidKeyStore, доступным только по пальцу ----
      bioStatus: async () => { const L = await readLock(); let a = { available: false, reason: 'nohw' }; try { a = await PF.bioStatus(); } catch (e) {} return { ...a, enabled: !!(L && L.bio), kind: 'finger' }; },
      bioEnable: async () => {
        const L = await readLock(); if (!L || !DEK) return { ok: false, error: 'Сначала войдите по паролю' };
        try { const r = await PF.bioEnroll({ secret: b64(DEK) }); await writeLock({ ...(await readLock()), bio: { iv: r.iv, ct: r.ct } }); log('Включён вход по отпечатку'); return { ok: true }; }
        catch (e) { return { ok: false, cancel: e && e.code === 'cancel', error: (e && e.message) || 'Не получилось' }; }
      },
      bioDisable: async () => { const L = await readLock(); if (L && L.bio) { const { bio, ...rest } = L; await writeLock(rest); } try { await PF.bioClear(); } catch (e) {} return { ok: true }; },
      bioUnlock: async mode => {
        const L = await readLock(); if (!L || !L.bio) return { ok: false, error: 'Вход по отпечатку не включён' };
        let key;
        try { key = ub((await PF.bioDecrypt(L.bio)).secret); }
        catch (e) {
          if (e && e.code === 'invalid') { const { bio, ...rest } = L; await writeLock(rest); return { ok: false, invalid: true, error: 'Отпечатки в телефоне изменились — войдите по паролю и включите вход по отпечатку заново (Настройки → Безопасность)' }; }
          return { ok: false, cancel: e && e.code === 'cancel', error: e && e.code === 'lockout' ? 'Слишком много попыток — войдите по паролю' : (e && e.message) || 'Не получилось' };
        }
        if (mode === 'start') {
          const raw = await loadRaw(), prev = DEK; DEK = key;
          const d = await resolveLoaded(raw);
          if (isEnc(raw) && !d) { DEK = prev; return { ok: false, error: 'Ключ не подошёл — войдите по паролю' }; }
          fails = 0; uiLocked = false; data = d; scheduleSoon(); return { ok: true, data };
        }
        fails = 0; uiLocked = false; return { ok: true };
      },
      unlock: async pw => {
        const g = guard(); if (g) return g;
        const L = await readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
        const key = await tryUnwrap(pw, L.salt, L.wp, L.iter); if (!key) return failed();
        DEK = key; fails = 0; uiLocked = false; data = await resolveLoaded(await loadRaw()); scheduleSoon(); return { ok: true, data };
      },
      recover: async code => {
        const g = guard(); if (g) return g;
        const L = await readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
        const key = await tryUnwrap(normCode(code), L.saltR, L.wr, L.iter); if (!key) { const r = failed(); r.error = 'Неверный код восстановления'; return r; }
        DEK = key; fails = 0; uiLocked = false; data = await resolveLoaded(await loadRaw()); log('Вход по коду восстановления'); return { ok: true, data };
      },
      verify: async pw => {
        const g = guard(); if (g) return g;
        const L = await readLock(); if (!L) { uiLocked = false; return { ok: true }; }
        if (!(await tryUnwrap(pw, L.salt, L.wp, L.iter))) return failed();
        fails = 0; uiLocked = false; return { ok: true };
      },
      enable: async o => {
        try {
          if (await readLock()) return { ok: false, error: 'Пароль уже включён' };
          if (!o || String(o.pw || '').length < 4) return { ok: false, error: 'Пароль слишком короткий' };
          DEK = rnd(32);
          const salt = b64(rnd(16)), saltR = b64(rnd(16)), code = genCode();
          const L = { v: 1, kdf: 'pbkdf2', iter: ITER, salt, saltR, wp: await seal(await kek(o.pw, salt), DEK), wr: await seal(await kek(normCode(code), saltR), DEK), hint: String(o.hint || '').slice(0, 80), created: Date.now() };
          await writeLock(L);
          if (data) await saveData(data);
          await recryptBackups(true); lastSig = ''; scheduleSoon(); log('Включён вход по паролю');
          return { ok: true, code };
        } catch (e) { log('Ошибка включения пароля', e); return { ok: false, error: e.message }; }
      },
      change: async o => {
        const g = guard(); if (g) return g;
        const L = await readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
        const key = await tryUnwrap(o.old, L.salt, L.wp, L.iter); if (!key) return failed();
        if (String(o.pw || '').length < 4) return { ok: false, error: 'Новый пароль слишком короткий' };
        fails = 0; const salt = b64(rnd(16));
        await writeLock({ ...L, salt, wp: await seal(await kek(o.pw, salt, L.iter), key), hint: String(o.hint || '').slice(0, 80) }); log('Пароль изменён'); return { ok: true };
      },
      setAfterRecovery: async o => {
        const L = await readLock(); if (!L || !DEK) return { ok: false, error: 'Нет доступа' };
        if (String(o.pw || '').length < 4) return { ok: false, error: 'Пароль слишком короткий' };
        const salt = b64(rnd(16)), saltR = b64(rnd(16)), code = genCode();
        await writeLock({ ...L, iter: ITER, salt, saltR, wp: await seal(await kek(o.pw, salt), DEK), wr: await seal(await kek(normCode(code), saltR), DEK), hint: String(o.hint || '').slice(0, 80) });
        log('Новый пароль после восстановления'); return { ok: true, code };
      },
      newCode: async pw => {
        const g = guard(); if (g) return g;
        const L = await readLock(); if (!L) return { ok: false, error: 'Пароль не включён' };
        const key = await tryUnwrap(pw, L.salt, L.wp, L.iter); if (!key) return failed();
        fails = 0; const saltR = b64(rnd(16)), code = genCode();
        await writeLock({ ...L, saltR, wr: await seal(await kek(normCode(code), saltR, L.iter), key) }); return { ok: true, code };
      },
      disable: async pw => {
        const g = guard(); if (g) return g;
        const L = await readLock(); if (!L) return { ok: true };
        const key = await tryUnwrap(pw, L.salt, L.wp, L.iter); if (!key) return failed();
        fails = 0; DEK = key; await recryptBackups(false);
        await writeLock(null); try { await PF.bioClear(); } catch (e) {} if (data) await saveData(data); DEK = null; lastSig = ''; scheduleSoon(); log('Вход по паролю отключён');
        return { ok: true };
      },
      lockUi: () => { readLock().then(L => { if (L) uiLocked = true; }); }
    },
    ai: async req => {
      try {
        const r = await Http.request({ url: 'https://llm.api.cloud.yandex.net/v1/chat/completions', method: 'POST', responseType: 'text', connectTimeout: 30000, readTimeout: 120000,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + String(req.key || '').trim(), 'OpenAI-Project': String(req.folder || '').trim(), 'x-data-logging-enabled': 'false' },
          data: { model: req.model, messages: req.messages, temperature: req.temperature, max_tokens: req.maxTokens } });
        return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) };
      } catch (e) { return { status: 0, text: '', error: /timeout/i.test(String(e && e.message)) ? 'timeout' : String((e && e.message) || e) }; }
    },
    stt: async req => {
      try {
        let s = ''; const u8 = req.audio; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        const r = await Http.request({ url: 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&topic=general&format=lpcm&sampleRateHertz=16000', method: 'POST', responseType: 'text', connectTimeout: 30000, readTimeout: 60000,
          headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Api-Key ' + String(req.key || '').trim(), 'x-folder-id': String(req.folder || '').trim(), 'x-data-logging-enabled': 'false' }, data: btoa(s), dataType: 'file' });
        return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) };
      } catch (e) { return { status: 0, text: '', error: String((e && e.message) || e) }; }
    },
    focusAlarm: async o => {
      try { if (!(await ensureChannel())) return; await Notif.cancel({ notifications: [{ id: FOCUS_NID }] }).catch(() => {});
        await Notif.schedule({ notifications: [{ id: FOCUS_NID, title: String(o.title || 'Фокус'), body: String(o.body || ''), channelId: CH, smallIcon: 'ic_stat_planer', iconColor: '#4D8DFF', schedule: { at: new Date(o.at), allowWhileIdle: true }, extra: { kind: 'focus' } }] });
      } catch (e) { log('Таймер: уведомление не запланировано', e); }
    },
    focusCancel: async () => { try { await Notif.cancel({ notifications: [{ id: FOCUS_NID }] }); } catch (e) {} },
    notify: async o => {
      try { if (!(await ensureChannel())) return; await Notif.schedule({ notifications: [{ id: nid('n' + Date.now() + Math.random()), title: String(o.title || 'Планер'), body: String(o.body || ''), largeBody: String(o.body || ''), channelId: CH, smallIcon: 'ic_stat_planer', iconColor: '#4D8DFF', schedule: { at: new Date(Date.now() + 800), allowWhileIdle: true }, extra: { kind: 'task', id: o.task || '' } }] }); } catch (e) {}
    },
    netGet: async url => {
      let u; try { u = new URL(String(url)); } catch (e) { return { status: 0, error: 'неверная ссылка' }; }
      if (!/^https?:$/.test(u.protocol)) return { status: 0, error: 'такие адреса не загружаются' };
      try {
        const r = await Http.request({ url: u.href, method: 'GET', responseType: 'arraybuffer', connectTimeout: 30000, readTimeout: 60000, headers: { 'Accept-Language': 'ru-RU,ru;q=0.9', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' } });
        const h = r.headers || {}, ct = h['Content-Type'] || h['content-type'] || '';
        return { status: r.status, ct, url: r.url || u.href, b64: typeof r.data === 'string' ? r.data : '' };
      } catch (e) { return { status: 0, error: String((e && e.message) || e) }; }
    },
    docSave: async o => {
      const path = String(o.name || 'Документ').replace(/[\\/:*?"<>|]+/g, '_') + '.' + (o.ext || 'docx');
      const w = await FS.writeFile({ path, data: o.b64, directory: 'CACHE' });
      try { await Share.share({ title: path, files: [w.uri], dialogTitle: 'Сохранить или отправить' }); return path; }
      catch (e) { if (/cancel/i.test(String(e && e.message))) return null; throw e; }
    },
    // совместные проекты: Яндекс Диск (REST API) и вход в Яндекс по коду; адреса фиксированы
    ydisk: async req => {
      req = req || {};
      const ydHost = u => { try { const h = new URL(u).hostname; return /(^|\.)yandex\.(ru|net|com)$/.test(h) || /(^|\.)yastatic\.net$/.test(h); } catch (e) { return false; } };
      const call = async o => { try { const r = await Http.request(Object.assign({ connectTimeout: 30000, readTimeout: 90000, responseType: 'text' }, o)); return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) }; } catch (e) { return { status: 0, text: '', error: String((e && e.message) || e) }; } };
      const form = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
      const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
      if (req.op === 'devcode') return call({ url: 'https://oauth.yandex.ru/device/code', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: clean({ client_id: req.client, device_id: req.device, device_name: req.deviceName }) });
      if (req.op === 'devtoken') return call({ url: 'https://oauth.yandex.ru/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: clean({ grant_type: 'device_code', code: req.code, client_id: req.client, client_secret: req.secret }) });
      const token = String(req.token || '').trim(); if (!/^[A-Za-z0-9_\-.]{20,400}$/.test(token)) return { status: 401, text: '{"error":"нет токена"}' };
      const auth = { Authorization: 'OAuth ' + token, Accept: 'application/json' }, API = 'https://cloud-api.yandex.net/v1/disk';
      if (req.op === 'info') return call({ url: API + '/', headers: auth });
      const path = String(req.path || ''); if (!/^disk:\//.test(path) || /(^|\/)\.\.(\/|$)/.test(path)) return { status: 400, text: '{"error":"недопустимый путь"}' };
      const p = encodeURIComponent(path);
      if (req.op === 'list') return call({ url: `${API}/resources?path=${p}&limit=1000&fields=name,type,_embedded.items.name,_embedded.items.type,_embedded.items.modified,_embedded.items.size,_embedded.items.md5,_embedded.items.share`, headers: auth });
      if (req.op === 'mkdir') return call({ url: `${API}/resources?path=${p}`, method: 'PUT', headers: auth });
      if (req.op === 'del' && !String(req.path).startsWith('disk:/Планер — мои данные/')) return { status: 400, text: '{"error":"удалять можно только файлы синхронизации"}' };
      if (req.op === 'del') return call({ url: `${API}/resources?path=${p}&permanently=true`, method: 'DELETE', headers: auth });
      if (req.op === 'read') { const m = await call({ url: `${API}/resources/download?path=${p}`, headers: auth }); if (m.status !== 200) return m; const href = JSON.parse(m.text).href; if (!ydHost(href)) return { status: 0, error: 'неожиданный адрес' }; return call({ url: href }); }
      if (req.op === 'write') { const m = await call({ url: `${API}/resources/upload?path=${p}&overwrite=true`, headers: auth }); if (m.status !== 200) return m; const href = JSON.parse(m.text).href; if (!ydHost(href)) return { status: 0, error: 'неожиданный адрес' }; return call({ url: href, method: 'PUT', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, data: String(req.body || '') }); }
      return { status: 400, text: '{"error":"неизвестная операция"}' };
    },
    on: (ch, fn) => { (listeners[ch] = listeners[ch] || []).push(fn); }
  };
})();
