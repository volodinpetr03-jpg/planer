'use strict';
// ============================================================
//  Совместная работа: общие проекты через общую папку (Google Диск на компьютере,
//  FolderSync на телефоне). Каждый участник пишет только свой файл members/<id>.json,
//  читает файлы остальных и сводит изменения по каждой записи: побеждает более поздняя правка.
//  Всё содержимое файлов зашифровано паролем пространства (AES-256-GCM, ключ из PBKDF2).
// ============================================================
const SH = () => D.share || null;
const shareOn = () => !!(D && D.share && D.share.folder && D.share.key && D.share.space);
const isShared = p => !!(p && p.shared && shareOn());
const memberOf = id => { const s = SH(); if (!s || !id) return null; if (id === s.me.id) return s.me; return (s.members || {})[id] || null; };
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const whoChip = id => { const m = memberOf(id); return m ? `<span class="who" style="--c:${m.color}" title="Исполнитель: ${esc(m.name)}">${esc(initials(m.name))}</span>` : ''; };
const SPACE_FILE = 'planer-space.json', MDIR = 'members';
const SHS = { busy: false, dirtyT: null, timer: null, lastSig: '', err: null, last: 0 };

// ---------- файлы общей папки (компьютер — через Electron, телефон — через Android) ----------
const FX = {
  join: rel => SH().folder.replace(/[\\/]+$/, '') + '/' + rel,
  list: rel => window.api.files.list(FX.join(rel)),
  read: rel => window.api.files.read(FX.join(rel)),
  write: (rel, c) => window.api.files.write(FX.join(rel), c),
  mkdir: rel => window.api.files.mkdir(FX.join(rel))
};

// ---------- шифрование ----------
const sEnc = new TextEncoder(), sDec = new TextDecoder();
const s64 = u => { let s = ''; const a = new Uint8Array(u); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const su64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function spaceKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', sEnc.encode(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return s64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: su64(salt), iterations: 210000 }, base, 256));
}
const aesKey = k => crypto.subtle.importKey('raw', su64(k), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function sSeal(k, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: s64(iv), ct: s64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(k), sEnc.encode(JSON.stringify(obj)))) }; }
async function sOpen(k, o) { return JSON.parse(sDec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: su64(o.iv) }, await aesKey(k), su64(o.ct)))); }

// ---------- записи: что уходит другим участникам ----------
// колонки и теги у каждого свои, поэтому передаются названиями; папка проекта — личная
const T_KEYS = ['title', 'desc', 'order', 'prio', 'project', 'parent', 'postponed', 'date', 'time', 'dur', 'remind', 'rem2', 'nag', 'repeat', 'checklist', 'created', 'doneAt', 'archived', 'who', 'asg', 'laws', 'spent', 'comments', 'hist'];
const P_KEYS = ['title', 'color', 'desc', 'status', 'start', 'deadline', 'budget', 'created'];
function recOfTask(t) { const r = { k: 't', id: t.id }; T_KEYS.forEach(k => r[k] = t[k] === undefined ? null : t[k]); const c = colOf(t.col); r.colName = c ? c.title : ''; r.done = isDone(t); r.tagNames = (t.tags || []).map(id => tagOf(id)).filter(Boolean).map(x => x.title).sort(); return r; }
function recOfProj(p) { const r = { k: 'p', id: p.id }; P_KEYS.forEach(k => r[k] = p[k] === undefined ? null : p[k]); return r; }
function collectShared() {
  const out = {}, ids = new Set(D.projects.filter(p => p.shared).map(p => p.id));
  D.projects.filter(p => p.shared).forEach(p => out[p.id] = recOfProj(p));
  D.tasks.filter(t => t.project && ids.has(t.project)).forEach(t => out[t.id] = recOfTask(t));
  return out;
}
const recHash = r => { const s = JSON.stringify(r); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); };
function applyRec(r) {
  if (r.k === 'p') {
    let p = projOf(r.id);
    if (!p) { p = newProject({ id: r.id }); D.projects.push(p); }
    P_KEYS.forEach(k => p[k] = r[k]); p.shared = true; return;
  }
  let t = byId(r.id); const isNew = !t;
  if (isNew) { t = newTask({ id: r.id }); D.tasks.push(t); }
  T_KEYS.forEach(k => t[k] = k === 'checklist' ? (r[k] || []) : r[k]);
  const dc = doneCol(), byName = D.columns.find(c => !c.done && c.title.trim().toLowerCase() === String(r.colName || '').trim().toLowerCase());
  if (r.done && dc) t.col = dc.id; else if (byName) t.col = byName.id; else if (isNew || isDone(t)) t.col = firstCol().id;
  t.tags = tagIdsFromNames(r.tagNames || []);
}
function removeRec(id) {
  if (projOf(id)) { D.projects = D.projects.filter(p => p.id !== id); D.tasks.forEach(t => { if (t.project === id) t.project = null; }); B().tx.forEach(x => { if (x.project === id) x.project = null; }); return; }
  if (byId(id)) { kids(id).forEach(k => k.parent = null); D.tasks = D.tasks.filter(t => t.id !== id); B().tx.forEach(x => { if (x.task === id) x.task = null; }); }
}

// ---------- синхронизация ----------
function shareDirty() { if (!shareOn()) return; SHS.dirty = true; clearTimeout(SHS.dirtyT); SHS.dirtyT = setTimeout(() => syncNow(), 3500); }
async function syncNow(force) {
  if (!shareOn() || UI.locked || SHS.busy) return false;
  SHS.busy = true; const S = SH();
  try {
    const list = (await FX.list(MDIR)) || [];
    const files = list.filter(f => /\.json$/.test(f.name) && f.name !== S.me.id + '.json');
    const sig = files.map(f => f.name + ':' + f.mtime + ':' + f.size).sort().join('|');
    if (!force && !SHS.dirty && sig === SHS.lastSig) { SHS.err = null; return true; }
    // файлы других участников
    const others = [];
    for (const f of files) {
      const raw = await FX.read(MDIR + '/' + f.name); let o; try { o = JSON.parse(raw); } catch (e) { continue; } // файл ещё докачивается — в следующий раз
      if (!o || o.space !== S.space.id || !o.member || !o.data) continue;
      try { const body = await sOpen(S.key, o.data); others.push({ m: o.member, at: o.at, ...body }); }
      catch (e) { SHS.err = `Файл участника «${o.member.name}» не открывается: другой пароль пространства`; }
    }
    S.members = S.members || {};
    others.forEach(x => { S.members[x.m.id] = { id: x.m.id, name: x.m.name, color: x.m.color, at: x.at }; });
    // что изменилось у меня с прошлого раза (base — общие записи в том виде, как я их записал в прошлый раз)
    S.base = S.base || {}; S.meta = S.meta || {}; S.tombs = S.tombs || {};
    const now = Date.now(), J = JSON.stringify; let loc = collectShared();
    const changedLocal = new Set(Object.keys(loc).filter(id => !S.base[id] || typeof S.base[id] !== 'object' || J(S.base[id]) !== J(loc[id])));
    const deletedLocal = new Set(Object.keys(S.base).filter(id => !loc[id] && !S.tombs[id]));
    if (typeof histStamp === 'function' && histStamp(S.base, loc, changedLocal)) loc = collectShared(); // журнал изменений
    // у других участников: по каждой записи — самая поздняя версия (или удаление)
    const best = {};
    const offer = (id, c) => { const b = best[id]; if (!b || c.upd > b.upd) best[id] = c; };
    for (const x of others) {
      (x.records || []).forEach(r => offer(r.id, { rec: r, upd: r.upd || 0, by: r.by }));
      Object.entries(x.tombs || {}).forEach(([id, ts]) => offer(id, { tomb: true, upd: ts }));
    }
    let changed = false; const events = [], me = S.me.id;
    UI.syncing = true;
    const order = Object.keys(best).sort((a, b) => (best[a].rec && best[a].rec.k === 'p' ? 0 : 1) - (best[b].rec && best[b].rec.k === 'p' ? 0 : 1));
    for (const id of order) {
      const c = best[id], seen = (S.meta[id] || {}).upd || S.tombs[id] || 0;
      if (c.upd <= seen) continue;                       // эту версию я уже учёл
      if (c.tomb) {
        if (changedLocal.has(id)) continue;              // удалили у них, но я правил позже — моя правка вернёт запись
        if (projOf(id) || byId(id)) { removeRec(id); changed = true; }
        S.tombs[id] = c.upd; delete S.meta[id]; delete S.base[id]; continue;
      }
      if (deletedLocal.has(id)) continue;                // я удалил позже их правки
      const r = c.rec;
      if (r.k === 'p') { const lp = projOf(r.id); if (lp && !lp.shared) continue; } // этот проект я сделал личным — его больше не принимаю
      else { const pp = projOf(r.project); if (pp && !pp.shared) continue; if (!pp && !best[r.project] && !loc[r.project]) continue; }
      const { upd, by, ...body } = r;
      let next = body;
      if (changedLocal.has(id) && loc[id]) { // правили и я, и они: по каждому полю берём изменённое, при споре — моё (оно новее)
        const bs = (S.base[id] && typeof S.base[id] === 'object') ? S.base[id] : {}; next = {};
        new Set([...Object.keys(body), ...Object.keys(loc[id])]).forEach(k => { next[k] = J(loc[id][k]) !== J(bs[k]) ? loc[id][k] : body[k]; });
      }
      if (next.k === 't' && loc[id] && typeof mergeList === 'function') { next = { ...next, comments: mergeList(loc[id].comments, body.comments), hist: mergeList(loc[id].hist, body.hist).slice(-60) }; } // комментарии и журнал — объединяем
      if (!loc[id] || J(loc[id]) !== J(next)) {
        const old = next.k === 't' ? byId(id) : null, oldWho = old ? old.who : null, oldDone = old ? isDone(old) : false, oldCm = new Set(((old && old.comments) || []).map(c => c.id));
        applyRec(next); changed = true;
        if (next.k === 't') { const t = byId(id); if (t && t.who === me && oldWho !== me && !isDone(t)) events.push({ k: 'asg', t, by }); if (t && t.asg === me && t.who && t.who !== me && isDone(t) && old && !oldDone) events.push({ k: 'done', t });
          const nc = t ? (t.comments || []).filter(c => !c.del && c.by !== me && !oldCm.has(c.id)) : [];
          if (nc.length && S.last && (t.who === me || t.asg === me || (t.comments || []).some(c => c.by === me))) events.push({ k: 'cm', t, c: nc[nc.length - 1], n: nc.length }); }
      }
      S.meta[id] = { upd, by }; delete S.tombs[id];
    }
    for (const id of changedLocal) S.meta[id] = { upd: now, by: S.me.id };
    for (const id of deletedLocal) { S.tombs[id] = now; delete S.meta[id]; }
    // старые отметки об удалении больше не нужны
    for (const id in S.tombs) if (now - S.tombs[id] > 120 * 864e5) delete S.tombs[id];
    // мой файл: всё общее, как оно выглядит у меня после сведения
    const cur = collectShared(), records = Object.values(cur).map(r => ({ ...r, upd: (S.meta[r.id] || {}).upd || now, by: (S.meta[r.id] || {}).by || S.me.id }));
    const file = { v: 1, space: S.space.id, member: { id: S.me.id, name: S.me.name, color: S.me.color }, at: now, data: await sSeal(S.key, { records, tombs: S.tombs }) };
    await FX.mkdir(MDIR);
    await FX.write(MDIR + '/' + S.me.id + '.json', JSON.stringify(file));
    S.base = cur;
    if (events.length) shareNotify(events, !S.last);
    S.last = now; SHS.dirty = false; SHS.lastSig = sig; if (!SHS.err || !/пароль/.test(SHS.err)) SHS.err = null;
    UI.syncing = false;
    save();
    if (changed && !modalOpen() && !dragId) render(); else if (changed) { drawSide(); if (UI.form && UI.form.t && typeof drawCm === 'function') drawCm(); }
    return true;
  } catch (e) {
    SHS.err = 'Нет доступа к общей папке: ' + ((e && e.message) || e);
    return false;
  } finally {
    SHS.busy = false; UI.syncing = false;
    if (UI.settab === 'share' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sbody'))) drawSettings();
  }
}
function shareStart() {
  clearInterval(SHS.timer);
  if (!shareOn()) return;
  if (window.api.files.setRoot) window.api.files.setRoot(SH().folder);
  SHS.timer = setInterval(() => { if (!document.hidden) syncNow(); }, IS_PHONE ? 30000 : 20000);
  setTimeout(() => syncNow(true), 1500);
}

// ---------- уведомления: вам назначили задачу / ваше поручение выполнено ----------
function shareNotify(events, first) {
  const name = id => (memberOf(id) || {}).name || 'Участник';
  const asg = events.filter(e => e.k === 'asg'), done = events.filter(e => e.k === 'done');
  const send = (title, body, task) => { shareAlert(title, body, task); if (hasApi && window.api.notify) window.api.notify({ title, body, task }); };
  if (asg.length > 3 || (first && asg.length > 1)) send('Вам назначено задач: ' + asg.length, asg.slice(0, 4).map(e => '• ' + e.t.title).join('\n'), null);
  else asg.forEach(e => send('Вам назначена задача', `${e.t.title}${e.t.date ? ' · ' + dueTxt(e.t) : ''}${projOf(e.t.project) ? ' · ' + projOf(e.t.project).title : ''}${e.by && e.by !== SH().me.id ? '\nНазначил(а): ' + name(e.by) : ''}`, e.t.id));
  const cms = events.filter(e => e.k === 'cm');
  if (cms.length > 3) send('Новые комментарии: ' + cms.length, cms.slice(0, 4).map(e => '• ' + e.t.title + ' — ' + name(e.c.by)).join('\n'), null);
  else cms.forEach(e => send('Комментарий: ' + e.t.title, `${name(e.c.by)}: ${e.c.text.slice(0, 160)}${e.n > 1 ? `\n(и ещё ${e.n - 1})` : ''}`, e.t.id));
  if (done.length > 3) send('Выполнено поручений: ' + done.length, done.slice(0, 4).map(e => '• ' + e.t.title + ' — ' + name(e.t.who)).join('\n'), null);
  else done.forEach(e => send('Поручение выполнено', `${name(e.t.who)}: ${e.t.title}`, e.t.id));
  if (D.settings.sound !== false) beep();
}
function shareAlert(title, body, task) {
  const el = document.createElement('div'); el.className = 'al share';
  el.innerHTML = `<div class="ah">${ic('users')} ${esc(title)}<button class="ib sm" data-act="alClose" aria-label="Закрыть">${ic('x')}</button></div><p style="white-space:pre-line">${esc(body)}</p><div class="ab">${task ? `<button class="btn sm pri" data-act="alOpen" data-id="${task}">Открыть</button>` : `<button class="btn sm pri" data-act="shGiven" data-v="mine">Мои задачи</button>`}</div>`;
  $('#alerts').appendChild(el);
}
// карточка «Поручено мной» на обзоре: что раздали и кто что выполнил
function givenHtml() {
  if (!shareOn()) return '';
  const me = SH().me.id, G = live().filter(t => t.asg === me && t.who && t.who !== me && (!isDone(t) || (t.doneAt && Date.now() - t.doneAt < 14 * 864e5)));
  if (!G.length) return '';
  const by = new Map(); G.forEach(t => { if (!by.has(t.who)) by.set(t.who, []); by.get(t.who).push(t); });
  return `<section class="pan given"><div class="ph2"><h2>${ic('users')} Поручено мной</h2><small>${G.filter(t => !isDone(t)).length} в работе · ${G.filter(isDone).length} выполнено за 2 недели</small><span class="spacer"></span><button class="btn sm ghost" data-act="shGiven" data-v="given">На доске</button></div>
    ${[...by].map(([w, L]) => `<div class="gv"><div class="gvh">${whoChip(w)}<b>${esc((memberOf(w) || {}).name || 'Участник')}</b><small>${L.filter(t => !isDone(t)).length} в работе · ${L.filter(isDone).length} выполнено</small></div>
      ${L.sort((a, b) => (isDone(a) ? 1 : 0) - (isDone(b) ? 1 : 0) || (a.date || '9').localeCompare(b.date || '9')).map(t => `<div class="lrow gvr ${isDone(t) ? 'dn' : ''}" data-act="openTask" data-id="${t.id}"><span class="gvs">${isDone(t) ? ic('check') : ''}</span><div class="tx"><b>${esc(t.title)}</b><small>${isDone(t) ? 'выполнено' + (t.doneAt ? ' ' + fmtTs(t.doneAt) : '') : (t.date ? (t.date < today() ? 'просрочено · ' : '') + dueTxt(t) : 'без срока')} · ${esc((colOf(t.col) || {}).title || '')}</small></div></div>`).join('')}</div>`).join('')}</section>`;
}

// ---------- подключение к пространству ----------
const SHARE_DEF_PHONE = 'Планер-общий';
async function shareConnect() {
  const name = $('#sh-name').value.trim(), pass = $('#sh-pass').value, folder = (IS_PHONE ? $('#sh-folder').value.trim().replace(/^\/+|\/+$/g, '') : UI.shFolder) || '';
  const msg = t => { $('#sh-err').textContent = t; };
  if (!name) return msg('Введите своё имя — так вас увидят другие участники');
  if (!folder) return msg(IS_PHONE ? 'Укажите папку' : 'Выберите общую папку');
  if (pass.length < 6) return msg('Пароль пространства — не короче 6 символов');
  if (IS_PHONE && !(await window.api.files.hasAccess())) return msg('Сначала разрешите доступ к файлам — кнопка выше');
  msg('Подключаю…'); $('#sh-go').disabled = true;
  try {
    D.share = D.share && D.share.me ? D.share : {};
    const tmp = { folder }; const prev = D.share; D.share = { ...prev, folder };
    if (window.api.files.setRoot) await window.api.files.setRoot(folder);
    let sp = null; try { sp = JSON.parse((await FX.read(SPACE_FILE)) || 'null'); } catch (e) { sp = null; }
    let key;
    if (sp && sp.planerSpace) {
      key = await spaceKey(pass, sp.salt);
      try { const ok = await sOpen(key, sp.check); if (ok !== 'planer-ok') throw 0; } catch (e) { D.share = prev; $('#sh-go').disabled = false; return msg('Неверный пароль пространства. Его задал тот, кто создал общую папку'); }
    } else {
      const salt = s64(crypto.getRandomValues(new Uint8Array(16)));
      key = await spaceKey(pass, salt);
      sp = { planerSpace: 1, id: uid(), name: 'Общие проекты', created: Date.now(), salt, check: await sSeal(key, 'planer-ok') };
      await FX.write(SPACE_FILE, JSON.stringify(sp, null, 1));
    }
    const me = (prev && prev.me) || { id: uid(), color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    me.name = name;
    D.share = { folder, key, space: { id: sp.id, name: sp.name }, me, members: {}, base: {}, meta: {}, tombs: {}, last: 0 };
    void tmp;
    save(); shareStart(); await syncNow(true);
    toast('Подключено. Отметьте проект как «Общий» — он появится у остальных участников');
    drawSettings(); render();
  } catch (e) { $('#sh-go').disabled = false; msg('Не получилось: ' + ((e && e.message) || e)); }
}

// ---------- раздел настроек ----------
async function shareTab() {
  const S = SH();
  if (!hasApi || !window.api.files) return '<p class="hint">Совместная работа доступна в программе для Windows и на телефоне Android.</p>';
  if (!shareOn()) {
    const acc = IS_PHONE ? await window.api.files.hasAccess() : true;
    return `<div class="secbox">${ic('users')}<div><b>Общие проекты через Google Диск</b><span>Выбранные проекты видят и меняют все участники. Личные задачи, бюджет и остальные проекты остаются только у вас.</span></div></div>
      <ol class="shsteps">${IS_PHONE ? `<li>Установите из Google Play приложение <b>FolderSync</b>, войдите в нём в свой Google-аккаунт и создайте синхронизацию: папка Google Диска с общими файлами ↔ папка <b>${SHARE_DEF_PHONE}</b> в памяти телефона, режим «В обе стороны», каждые 15 минут.</li><li>Разрешите Планеру доступ к файлам, укажите ту же папку и введите пароль пространства.</li>`
      : '<li>Установите «Google Диск для компьютера» и войдите в аккаунт.</li><li>Создайте на Google Диске папку, например «Планер-общий», и откройте к ней доступ участникам (правая кнопка → «Поделиться»).</li><li>Нажмите «Выбрать папку» и укажите её — она находится на диске G: или в «Google Диск» в Проводнике.</li>'}<li>Придумайте пароль пространства (если папка новая) или введите пароль, который вам сообщил создатель. Им шифруются все общие данные — Google видит только зашифрованные файлы.</li></ol>
      ${IS_PHONE ? `<div class="sline"><div class="tx"><b>Доступ к файлам</b><span>${acc ? 'Разрешён' : 'Нужен, чтобы Планер видел папку, которую синхронизирует FolderSync'}</span></div>${acc ? `<span class="okmark">${ic('check')}</span>` : '<button class="btn pri" data-act="shAccess">Разрешить</button>'}</div>` : ''}
      <label class="f"><span>Ваше имя для других участников</span><input class="in" id="sh-name" maxlength="30" value="${esc((S && S.me && S.me.name) || '')}" placeholder="Например, Дмитрий"></label>
      ${IS_PHONE ? `<label class="f"><span>Папка в памяти телефона</span><input class="in" id="sh-folder" value="${esc((S && S.folder) || SHARE_DEF_PHONE)}"></label>`
        : `<div class="f"><span>Общая папка</span><div class="shpick"><div class="path" id="sh-path">${esc(UI.shFolder || 'не выбрана')}</div><button class="btn" data-act="shPick">${ic('folder')} Выбрать папку…</button></div></div>`}
      <label class="f"><span>Пароль пространства</span><input class="in" type="password" id="sh-pass" autocomplete="new-password" placeholder="не короче 6 символов"></label>
      <p class="hint warn" id="sh-err"></p>
      <div><button class="btn pri" id="sh-go" data-act="shConnect">${ic('users')} Подключить</button></div>`;
  }
  const mem = [S.me, ...Object.values(S.members || {})], shp = D.projects.filter(p => p.shared);
  const ago = ts => { if (!ts) return 'ещё не было'; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : fmtTs(ts); };
  return `<div class="secbox on">${ic('users')}<div><b>Подключено: ${esc(S.space.name)}</b><span>Синхронизация: ${ago(S.last)}${SHS.busy ? ' · идёт обмен…' : ''}</span></div><button class="btn" data-act="shSync">${ic('sync')} Сейчас</button></div>
    ${SHS.err ? `<p class="hint warn">${esc(SHS.err)}</p>` : ''}
    <div class="sline"><div class="tx"><b>Общая папка</b><div class="path">${esc(S.folder)}</div></div></div>
    <div class="sline"><div class="tx"><b>Участники</b><span>Появляются после первого обмена на их устройстве</span><div class="mems">${mem.map(m => `<span class="mem">${whoChip(m.id)}${esc(m.name)}${m.id === S.me.id ? ' <small>— вы</small>' : m.at ? ` <small>${ago(m.at)}</small>` : ''}</span>`).join('')}</div></div></div>
    <div class="sline"><div class="tx"><b>Общие проекты</b><span>${shp.length ? shp.map(p => esc(p.title)).join(', ') : 'Пока нет. Откройте проект → «Изменить» → включите «Общий проект»'}</span></div></div>
    <div class="sline"><div class="tx"><b>Напоминания по общим задачам — только исполнителю</b><span>Задача с исполнителем напоминает только ему. Без исполнителя — всем участникам</span></div><input type="checkbox" class="tog" id="sh-remmine" ${S.remMine !== false ? 'checked' : ''}></div>
    <div class="sline"><div class="tx"><b>Моё имя</b></div><div class="ctl"><input class="in" id="sh-rename" value="${esc(S.me.name)}" maxlength="30" style="width:12rem"></div></div>
    <div class="sline"><div class="tx"><b>Отключиться</b><span>Общие проекты останутся у вас как личные копии и перестанут обновляться</span></div><button class="btn danger" data-act="shOff">Отключить</button></div>`;
}
Object.assign(ACT, {
  shPick: async () => { const p = await window.api.files.pick(); if (p) { UI.shFolder = p; $('#sh-path').textContent = p; } },
  shAccess: async () => { await window.api.files.askAccess(); toast('Включите «Разрешить доступ ко всем файлам» и вернитесь в Планер'); const t = setInterval(async () => { if (await window.api.files.hasAccess()) { clearInterval(t); if (UI.settab === 'share') drawSettings(); } }, 1500); setTimeout(() => clearInterval(t), 120000); },
  shConnect: () => shareConnect(),
  shGiven: b => { b.closest && b.closest('.al') && b.closest('.al').remove(); TF.filter = b.dataset.v; go('board'); },
  shSync: async () => { const ok = await syncNow(true); toast(ok ? 'Синхронизировано' : 'Не получилось — см. сообщение в настройках'); },
  shOff: () => { if (!shareOn()) return; clearInterval(SHS.timer); D.projects.forEach(p => { delete p.shared; }); const me = D.share.me; D.share = { me: { ...me } }; save(); drawSettings(); render(); toast('Совместная работа отключена'); }
});
document.addEventListener('change', e => { if (e.target.id === 'sh-remmine' && shareOn()) { D.share.remMine = e.target.checked; save(); return; } if (e.target.id === 'sh-rename' && shareOn()) { const v = e.target.value.trim(); if (v) { D.share.me.name = v; shareDirty(); save(); toast('Имя изменено'); } } }, true);
// проект стал личным — забываем его записи, чтобы у других он не удалился
function unshareProject(p) {
  const S = SH(); if (!S || !S.base) return;
  const ids = [p.id, ...D.tasks.filter(t => t.project === p.id).map(t => t.id)];
  ids.forEach(id => { delete S.base[id]; delete S.meta[id]; delete S.tombs[id]; });
}
