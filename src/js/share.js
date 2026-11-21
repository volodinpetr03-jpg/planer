'use strict';
// ============================================================
//  Совместная работа: общие проекты через общую папку на Яндекс Диске (REST API, вход по коду —
//  одинаково на компьютере и телефоне). Каждый участник пишет только свой файл members/<id>.json,
//  читает файлы остальных и сводит изменения по каждой записи: побеждает более поздняя правка.
//  Всё содержимое файлов зашифровано паролем пространства (AES-256-GCM, ключ из PBKDF2).
// ============================================================
const SH = () => D.share || null;
const shareOn = () => !!(D && D.share && D.share.prov === 'yd' && D.share.token && D.share.folder && D.share.key && D.share.space);
const isShared = p => !!(p && p.shared && shareOn());
const memberOf = id => { const s = SH(); if (!s || !id) return null; if (id === s.me.id) return s.me; return (s.members || {})[id] || null; };
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const whoChip = id => { const m = memberOf(id); return m ? `<span class="who" style="--c:${m.color}" title="Исполнитель: ${esc(m.name)}">${esc(initials(m.name))}</span>` : ''; };
const SPACE_FILE = 'planer-space.json', MDIR = 'members';
const SHS = { busy: false, dirtyT: null, timer: null, lastSig: '', err: null, last: 0 };

// ---------- файлы общей папки на Яндекс Диске ----------
const YD_CLIENT = 'ee36a7c4544743438cf0aa387398a28e'; // ClientID приложения «Планер» на oauth.yandex.ru (вшивается в сборку; пока нет — вводится в настройках)
const ydClient = () => YD_CLIENT || (D.settings.ydClient || '').trim();
const ydj = r => { try { return JSON.parse((r && r.text) || '{}'); } catch (e) { return {}; } };
function ydErr(r) {
  const j = ydj(r), d = j.description || j.message || j.error_description || j.error || (r && r.error) || '';
  if (!r || r.status === 0) return 'Нет связи с Яндекс Диском' + (d ? ' (' + d + ')' : '') + '. Проверьте интернет.';
  if (r.status === 401) return 'Яндекс не принял вход — войдите в Яндекс заново (Настройки → Совместная работа).';
  if (r.status === 403) return 'Яндекс Диск запретил доступ: у приложения нет прав на Диск или папка не открыта вам.';
  if (r.status === 404) return 'Папка не найдена на Яндекс Диске — возможно, её переименовали или закрыли доступ.';
  if (r.status === 507) return 'На Яндекс Диске закончилось место (место общее с Яндекс Почтой).';
  if (r.status === 429) return 'Слишком много запросов к Яндекс Диску — подождите минуту.';
  return 'Яндекс Диск: ошибка ' + r.status + (d ? ': ' + String(d).slice(0, 140) : '');
}
const YD = req => window.api.ydisk(Object.assign({ token: SH().token }, req));
const FX = {
  join: rel => SH().folder.replace(/\/+$/, '') + (rel ? '/' + rel : ''),
  list: async rel => { const r = await YD({ op: 'list', path: FX.join(rel) }); if (r.status === 404) return null; if (r.status !== 200) throw new Error(ydErr(r)); return ((ydj(r)._embedded || {}).items || []).map(x => ({ name: x.name, mtime: Date.parse(x.modified) || 0, size: x.size || 0, type: x.type })); },
  read: async rel => { const r = await YD({ op: 'read', path: FX.join(rel) }); if (r.status === 404) return null; if (r.status !== 200) throw new Error(ydErr(r)); return r.text; },
  write: async (rel, c) => { const r = await YD({ op: 'write', path: FX.join(rel), body: c }); if (!(r.status >= 200 && r.status < 300)) throw new Error(ydErr(r)); return true; },
  mkdir: async rel => { const r = await YD({ op: 'mkdir', path: FX.join(rel) }); if (!(r.status >= 200 && r.status < 300) && r.status !== 409) throw new Error(ydErr(r)); return true; }
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
const T_KEYS = ['title', 'desc', 'order', 'prio', 'project', 'parent', 'postponed', 'date', 'time', 'dur', 'remind', 'rem2', 'nag', 'repeat', 'checklist', 'created', 'doneAt', 'archived', 'who', 'asg', 'laws', 'spent', 'comments', 'hist', 'links', 'ment'];
const P_KEYS = ['title', 'color', 'desc', 'status', 'start', 'deadline', 'budget', 'created', 'links'];
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
    SHS.err = String((e && e.message) || e);
    return false;
  } finally {
    SHS.busy = false; UI.syncing = false;
    if (UI.settab === 'share' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sbody'))) drawSettings();
  }
}
function shareStart() {
  clearInterval(SHS.timer);
  if (!shareOn()) return;
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

// ---------- вход в Яндекс: код на странице ya.ru/device (или токен вручную) ----------
const YDL = { code: null, timer: null, err: '', folders: null, pick: '', manual: false };
const devId = () => { let v = ''; try { v = localStorage.getItem('planer-dev-id') || ''; if (!v) { v = uid() + uid(); localStorage.setItem('planer-dev-id', v); } } catch (e) { v = 'planer-' + (IS_PHONE ? 'phone' : 'pc'); } return v; };
async function ydLoginStart() {
  const client = ydClient(); if (!client) { YDL.err = 'Сначала укажите ClientID приложения (см. шаг ниже).'; return drawSettings(); }
  YDL.err = ''; const r = await window.api.ydisk({ op: 'devcode', client, device: devId(), deviceName: IS_PHONE ? 'Планер — телефон' : 'Планер — компьютер' });
  const j = ydj(r);
  if (r.status !== 200 || !j.device_code) { YDL.manual = true; YDL.err = j.error === 'invalid_client' ? 'Яндекс не нашёл приложение с таким ClientID — проверьте его.' : 'Вход по коду не сработал (' + (j.error_description || j.error || ydErr(r)) + '). Получите токен на странице Яндекса — кнопка ниже.'; return drawSettings(); }
  YDL.code = { user: j.user_code, url: j.verification_url || 'https://ya.ru/device', dc: j.device_code, until: Date.now() + (j.expires_in || 300) * 1000, iv: Math.max(3, j.interval || 5) };
  drawSettings(); openExternal(YDL.code.url); ydPoll();
}
function ydPoll() {
  clearTimeout(YDL.timer); const c = YDL.code; if (!c) return;
  if (Date.now() > c.until) { YDL.code = null; YDL.err = 'Время на ввод кода вышло — нажмите «Войти через Яндекс» ещё раз.'; return drawSettings(); }
  YDL.timer = setTimeout(async () => {
    const r = await window.api.ydisk({ op: 'devtoken', client: ydClient(), code: c.dc }), j = ydj(r);
    if (r.status === 200 && j.access_token) { YDL.code = null; return ydGotToken(j.access_token); }
    if (j.error && j.error !== 'authorization_pending') { YDL.code = null; YDL.err = j.error === 'invalid_grant' ? 'Код устарел — попробуйте ещё раз.' : 'Яндекс: ' + (j.error_description || j.error); return drawSettings(); }
    ydPoll();
  }, c.iv * 1000);
}
async function ydGotToken(token) {
  const r = await window.api.ydisk({ op: 'info', token }), j = ydj(r);
  if (r.status !== 200) { YDL.err = ydErr(r); return drawSettings(); }
  const prev = D.share || {};
  D.share = { ...(prev.prov === 'yd' ? prev : { me: prev.me }), prov: 'yd', token, login: (j.user && (j.user.display_name || j.user.login)) || 'Яндекс', space: prev.prov === 'yd' ? prev.space : null };
  if (prev.prov !== 'yd') { delete D.share.folder; delete D.share.key; }
  YDL.err = ''; YDL.folders = null; save(); toast('Вход в Яндекс выполнен'); drawSettings(); ydFolders();
}
async function ydFolders() {
  const r = await YD({ op: 'list', path: 'disk:/' });
  if (r.status !== 200) { YDL.err = ydErr(r); YDL.folders = []; return drawSettings(); }
  YDL.folders = ((ydj(r)._embedded || {}).items || []).filter(x => x.type === 'dir').map(x => ({ name: x.name, shared: !!x.share, own: x.share ? x.share.is_owned !== false : true }))
    .sort((a, b) => (b.shared - a.shared) || (/план/i.test(b.name) - /план/i.test(a.name)) || a.name.localeCompare(b.name, 'ru'));
  if (!YDL.pick) { const f = YDL.folders.find(x => /план/i.test(x.name)) || YDL.folders.find(x => x.shared); YDL.pick = f ? f.name : '+new'; }
  drawSettings();
}
// ---------- подключение к пространству ----------
async function shareConnect() {
  const name = $('#sh-name').value.trim(), pass = $('#sh-pass').value, newName = ($('#sh-new') || {}).value || '';
  const pick = YDL.pick === '+new' ? newName.trim().replace(/[\\/:*?"<>|]+/g, ' ').trim() : YDL.pick;
  const msg = t => { $('#sh-err').textContent = t; };
  if (!name) return msg('Введите своё имя — так вас увидят другие участники');
  if (!pick) return msg(YDL.pick === '+new' ? 'Введите название новой папки' : 'Выберите папку на Яндекс Диске');
  if (pass.length < 6) return msg('Пароль пространства — не короче 6 символов');
  msg('Подключаю…'); $('#sh-go').disabled = true;
  const prev = D.share;
  try {
    const folder = 'disk:/' + pick;
    D.share = { ...prev, folder };
    if (YDL.pick === '+new') await FX.mkdir('').catch(() => {});
    let sp = null; try { sp = JSON.parse((await FX.read(SPACE_FILE)) || 'null'); } catch (e) { if (/Нет связи|не принял|запретил|место/.test(e.message)) throw e; sp = null; }
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
    D.share = { prov: 'yd', token: prev.token, login: prev.login, folder, key, space: { id: sp.id, name: sp.name }, me, members: {}, base: {}, meta: {}, tombs: {}, last: 0, remMine: prev.remMine };
    save(); shareStart(); await syncNow(true);
    toast('Подключено. Отметьте проект как «Общий» — он появится у остальных участников');
    drawSettings(); render();
  } catch (e) { D.share = prev; $('#sh-go').disabled = false; msg('Не получилось: ' + ((e && e.message) || e)); }
}
const ydWeb = f => 'https://disk.yandex.ru/client/disk/' + encodeURIComponent(String(f || '').replace(/^disk:\//, ''));
// ---------- раздел настроек ----------
async function shareTab() {
  const S = SH();
  if (!hasApi || !window.api.ydisk) return '<p class="hint">Совместная работа доступна в программе для Windows и на телефоне Android.</p>';
  const intro = `<div class="secbox">${ic('users')}<div><b>Общие проекты через Яндекс Диск</b><span>Выбранные проекты видят и меняют все участники. Личные задачи, бюджет и остальное остаются только у вас. Всё, что лежит на Диске, зашифровано паролем пространства — Яндекс видит только набор байтов.</span></div></div>`;
  const old = S && S.folder && S.prov !== 'yd' ? `<p class="hint warn">Прежний способ (папка Google Диска и FolderSync) больше не используется. Подключитесь через Яндекс Диск — ваши общие проекты сохранятся и выгрузятся в новую папку.</p>` : '';
  if (!shareOn()) {
    if (!S || S.prov !== 'yd' || !S.token) {
      // шаг 1: вход
      const c = YDL.code;
      return `${intro}${old}
      <h3 class="shh3">1. Войдите в Яндекс</h3>
      ${YD_CLIENT ? '' : `<details class="shcid" ${ydClient() ? '' : 'open'}><summary>ClientID приложения ${ydClient() ? '· указан' : '— нужен один раз'}</summary>
        <ol class="shsteps"><li>Откройте <a href="https://oauth.yandex.ru/client/new" data-act="shExt" data-v="https://oauth.yandex.ru/client/new">oauth.yandex.ru → «Создать приложение»</a> и войдите своим Яндекс ID.</li>
        <li>Название — «Планер». Платформа — <b>«Веб-сервисы»</b>, Redirect URI — <code>https://oauth.yandex.ru/verification_code</code>.</li>
        <li>В «Доступ к данным» → <b>Яндекс Диск REST API</b> отметьте: «Чтение всего Диска», «Запись в любом месте на Диске», «Доступ к информации о Диске».</li>
        <li>Создайте приложение и скопируйте <b>ClientID</b> сюда.</li></ol>
        <label class="f"><span>ClientID</span><input class="in" id="yd-cid" value="${esc(D.settings.ydClient || '')}" placeholder="32 символа" autocomplete="off"></label></details>`}
      ${c ? `<div class="ydcode"><span>Откройте <b>${esc(c.url.replace(/^https?:\/\//, ''))}</b> и введите код:</span><b class="code">${esc(c.user)}</b>
          <div class="fbtn"><button class="btn pri" data-act="shExt" data-v="${esc(c.url)}">${ic('ext')} Открыть страницу Яндекса</button><button class="btn" data-act="shCopy" data-v="${esc(c.user)}">${ic('copy')} Скопировать код</button><button class="btn ghost" data-act="ydCancel">Отмена</button></div>
          <p class="hint">Жду подтверждения… Можно ввести код на любом устройстве — компьютере или телефоне.</p></div>`
        : `<div><button class="btn pri" data-act="ydLogin">${ic('users')} Войти через Яндекс</button></div>
          <p class="hint">Планер покажет короткий код — его нужно ввести на странице Яндекса и нажать «Разрешить». Вход сохраняется примерно на год.</p>`}
      <details class="shcid" ${YDL.manual ? 'open' : ''}><summary>Другой способ: вставить токен</summary>
        <p class="hint">Откройте страницу Яндекса, нажмите «Разрешить» и скопируйте показанный токен.</p>
        <div class="fbtn"><button class="btn" data-act="ydTokenPage">${ic('ext')} Получить токен</button></div>
        <label class="f"><span>Токен</span><input class="in" id="yd-token" type="password" autocomplete="off" placeholder="y0_…"></label>
        <div><button class="btn" data-act="ydTokenGo">Войти с токеном</button></div></details>
      <p class="hint warn" id="sh-err">${esc(YDL.err)}</p>`;
    }
    // шаг 2: папка, имя, пароль
    if (!YDL.folders) setTimeout(ydFolders, 0);
    const F = YDL.folders || [];
    return `${intro}${old}
      <div class="sline"><div class="tx"><b>Яндекс: ${esc(S.login || '')}</b><span>Вход выполнен</span></div><button class="btn ghost" data-act="ydLogout">Выйти</button></div>
      <h3 class="shh3">2. Общая папка на Яндекс Диске</h3>
      <p class="hint">Создатель пространства делает новую папку (кнопка ниже), затем открывает доступ на Яндекс Диске: папка → «Поделиться» → «Пригласить» по адресу Яндекс Почты участника с правом редактирования. Участник принимает приглашение — папка появляется у него на Диске, и он выбирает её здесь.</p>
      <div class="ydf">${YDL.folders ? F.map(f => `<label class="ydfi ${YDL.pick === f.name ? 'on' : ''}"><input type="radio" name="ydf" value="${esc(f.name)}" ${YDL.pick === f.name ? 'checked' : ''}>${ic('folder')}<span>${esc(f.name)}</span>${f.shared ? `<em>${f.own ? 'общая · моя' : 'общая'}</em>` : ''}</label>`).join('') : '<p class="hint">Загружаю список папок…</p>'}
        <label class="ydfi ${YDL.pick === '+new' ? 'on' : ''}"><input type="radio" name="ydf" value="+new" ${YDL.pick === '+new' ? 'checked' : ''}>${ic('plus')}<span>Новая папка:</span><input class="in" id="sh-new" value="Планер — общие проекты" maxlength="80"></label></div>
      <button class="btn sm ghost" data-act="ydReload">${ic('sync')} Обновить список</button>
      <h3 class="shh3">3. Имя и пароль пространства</h3>
      <label class="f"><span>Ваше имя для других участников</span><input class="in" id="sh-name" maxlength="30" value="${esc((S.me && S.me.name) || '')}" placeholder="Например, Дмитрий"></label>
      <label class="f"><span>Пароль пространства</span><input class="in" type="password" id="sh-pass" autocomplete="new-password" placeholder="не короче 6 символов"></label>
      <p class="hint">Если папка новая — придумайте пароль и сообщите его участникам. Если папку создал другой участник — введите его пароль.</p>
      <p class="hint warn" id="sh-err">${esc(YDL.err)}</p>
      <div><button class="btn pri" id="sh-go" data-act="shConnect">${ic('users')} Подключить</button></div>`;
  }
  const mem = [S.me, ...Object.values(S.members || {})], shp = D.projects.filter(p => p.shared);
  const ago = ts => { if (!ts) return 'ещё не было'; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : fmtTs(ts); };
  return `<div class="secbox on">${ic('users')}<div><b>Подключено: ${esc(S.space.name)}</b><span>Синхронизация: ${ago(S.last)}${SHS.busy ? ' · идёт обмен…' : ''}</span></div><button class="btn" data-act="shSync">${ic('sync')} Обменяться сейчас</button></div>
    ${SHS.err ? `<p class="hint warn">${esc(SHS.err)}</p>` : ''}
    <div class="sline"><div class="tx"><b>Яндекс Диск</b><span>${esc(S.login || '')} · папка «${esc(S.folder.replace(/^disk:\//, ''))}»</span></div><button class="btn ghost" data-act="shExt" data-v="${esc(ydWeb(S.folder))}">${ic('ext')} Открыть на Диске</button></div>
    <div class="sline"><div class="tx"><b>Участники</b><span>Появляются после первого обмена на их устройстве. Пригласить нового: откройте папку на Диске → «Поделиться» → «Пригласить», затем сообщите ему пароль пространства.</span><div class="mems">${mem.map(m => `<span class="mem">${whoChip(m.id)}${esc(m.name)}${m.id === S.me.id ? ' (я)' : ''}</span>`).join('')}</div></div></div>
    <div class="sline"><div class="tx"><b>Общие проекты</b><span>${shp.length ? shp.map(p => esc(p.title)).join(', ') : 'Пока нет. Откройте проект → «Изменить» → включите «Общий проект»'}</span></div></div>
    <div class="sline"><div class="tx"><b>Напоминания по общим задачам — только исполнителю</b><span>Задача с исполнителем напоминает только ему. Без исполнителя — всем.</span></div><input type="checkbox" class="tog" id="sh-remmine" ${S.remMine !== false ? 'checked' : ''}></div>
    <div class="sline"><div class="tx"><b>Моё имя</b></div><div class="ctl"><input class="in" id="sh-rename" value="${esc(S.me.name)}" maxlength="30" style="width:12rem"></div></div>
    <div class="sline"><div class="tx"><b>Отключиться</b><span>Общие проекты останутся у вас как личные копии и перестанут обновляться</span></div><button class="btn danger" data-act="shOff">Отключиться</button></div>`;
}
Object.assign(ACT, {
  ydLogin: () => ydLoginStart(),
  ydCancel: () => { clearTimeout(YDL.timer); YDL.code = null; drawSettings(); },
  ydTokenPage: () => { const c = ydClient(); if (!c) { YDL.err = 'Сначала укажите ClientID приложения.'; return drawSettings(); } openExternal('https://oauth.yandex.ru/authorize?response_type=token&client_id=' + encodeURIComponent(c)); },
  ydTokenGo: () => { const t = ($('#yd-token').value || '').trim(); if (t.length < 20) { YDL.err = 'Вставьте токен целиком'; return drawSettings(); } ydGotToken(t); },
  ydLogout: () => { const me = D.share && D.share.me; D.share = me ? { me } : null; YDL.folders = null; YDL.pick = ''; save(); drawSettings(); },
  ydReload: () => { YDL.folders = null; drawSettings(); },
  shExt: b => openExternal(b.dataset.v),
  shCopy: b => { navigator.clipboard.writeText(b.dataset.v).then(() => toast('Код скопирован'), () => toast(b.dataset.v)); },
  shConnect: () => shareConnect(),
  shGiven: b => { b.closest && b.closest('.al') && b.closest('.al').remove(); TF.filter = b.dataset.v; go('board'); },
  shSync: async () => { const ok = await syncNow(true); toast(ok ? 'Синхронизировано' : 'Не получилось — см. сообщение в настройках'); },
  shOff: () => { if (!shareOn()) return; clearInterval(SHS.timer); D.projects.forEach(p => { delete p.shared; }); const S = D.share; D.share = { prov: 'yd', token: S.token, login: S.login, me: { ...S.me } }; YDL.folders = null; save(); drawSettings(); render(); toast('Совместная работа отключена'); }
});
document.addEventListener('change', e => {
  if (e.target.name === 'ydf') { YDL.pick = e.target.value; $$('.ydfi').forEach(x => x.classList.toggle('on', x.contains(e.target))); }
  if (e.target.id === 'yd-cid') { D.settings.ydClient = e.target.value.trim(); save(); }
  if (e.target.id === 'sh-remmine' && shareOn()) { D.share.remMine = e.target.checked; save(); return; }
  if (e.target.id === 'sh-rename' && shareOn()) { const v = e.target.value.trim(); if (v) { D.share.me.name = v; save(); shareDirty(); toast('Имя изменено'); } }
});
document.addEventListener('focusin', e => { if (e.target.id === 'sh-new') { YDL.pick = '+new'; const r = e.target.closest('.ydfi'); if (r) { r.querySelector('input[type=radio]').checked = true; $$('.ydfi').forEach(x => x.classList.toggle('on', x === r)); } } });
// проект стал личным — забываем его записи, чтобы у других он не удалился
function unshareProject(p) {
  const S = SH(); if (!S || !S.base) return;
  const ids = [p.id, ...D.tasks.filter(t => t.project === p.id).map(t => t.id)];
  ids.forEach(id => { delete S.base[id]; delete S.meta[id]; delete S.tombs[id]; });
}
