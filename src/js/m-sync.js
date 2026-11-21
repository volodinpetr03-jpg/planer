'use strict';
// ============================================================
//  Мои устройства: одни и те же данные на компьютере и телефоне через Яндекс Диск.
//  В папке «Планер — мои данные» лежат:
//    sync.json      — соль и проверка пароля (без самих данных);
//    data.json      — все данные Планера, зашифрованные паролем синхронизации (AES-256-GCM);
//    laws/<id>.<h>.json — тексты документов библиотеки «Право» (тоже зашифрованы).
//  Сведение трёхстороннее: base (как было после прошлого обмена) — это устройство — Диск.
//  По каждой записи и каждому полю берётся то, что изменилось; если изменили на обоих — это устройство.
// ============================================================
const PS_DIR = 'disk:/Планер — мои данные', PS_META = 'sync.json', PS_DATA = 'data.json', PS_LAW = 'laws';
const PS_LOCAL = ['share', 'sync', 'notified', 'demo', 'focusRun'];                              // у каждого устройства свои
const PS_LSET = ['zoom', 'fontSize', 'collapsed', 'closeToTray', 'tourDone', 'ydClient'];         // настройки экрана — свои
ICONS.download = '<path d="M12 4v11.5M7.5 11L12 15.5l4.5-4.5"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>';
const PS = { busy: false, again: false, dirty: false, dirtyT: null, timer: null, err: null, lastSig: '', lawPend: false, by: '' };
const psTok = () => (D && ((D.sync && D.sync.token) || (D.share && D.share.token))) || '';
const psOn = () => !!(D && D.sync && D.sync.on && D.sync.key && D.sync.fid && psTok());
const psDev = () => IS_PHONE ? 'Телефон' : 'Компьютер';
const PY = req => window.api.ydisk(Object.assign({ token: psTok() }, req));
const psP = rel => PS_DIR + (rel ? '/' + rel : '');
const PFX = {
  list: async rel => { const r = await PY({ op: 'list', path: psP(rel) }); if (r.status === 404) return null; if (r.status !== 200) throw new Error(ydErr(r)); return ((ydj(r)._embedded || {}).items || []).map(x => ({ name: x.name, mtime: Date.parse(x.modified) || 0, size: x.size || 0, md5: x.md5 || '' })); },
  read: async rel => { const r = await PY({ op: 'read', path: psP(rel) }); if (r.status === 404) return null; if (r.status !== 200) throw new Error(ydErr(r)); return r.text; },
  write: async (rel, c) => { const r = await PY({ op: 'write', path: psP(rel), body: c }); if (!(r.status >= 200 && r.status < 300)) throw new Error(ydErr(r)); return true; },
  mkdir: async rel => { const r = await PY({ op: 'mkdir', path: psP(rel) }); if (!(r.status >= 200 && r.status < 300) && r.status !== 409) throw new Error(ydErr(r)); return true; },
  del: async rel => { const r = await PY({ op: 'del', path: psP(rel) }); return r.status >= 200 && r.status < 300; }
};
const psSig = f => f ? [f.mtime, f.size, f.md5].join(':') : '';

// ---------- сведение ----------
// JSON с упорядоченными ключами: одинаковые данные дают одинаковую строку на любом устройстве
const SJ = v => v === undefined ? undefined : JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
const psObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const psIdArr = a => Array.isArray(a) && a.every(x => psObj(x) && x.id != null && x.id !== '');
function psMerge(b, l, r) {
  const jl = SJ(l), jr = SJ(r);
  if (jl === jr) return l;
  const jb = SJ(b);
  if (jl === jb) return r;          // здесь не меняли — берём с Диска
  if (jr === jb) return l;          // на Диске не меняли — оставляем своё
  if (psIdArr(l) && psIdArr(r)) return psMergeArr(psIdArr(b) ? b : [], l, r);
  if (psObj(l) && psObj(r)) {
    const bb = psObj(b) ? b : {}, o = {};
    new Set([...Object.keys(l), ...Object.keys(r)]).forEach(k => { const v = psMerge(bb[k], l[k], r[k]); if (v !== undefined) o[k] = v; });
    return o;
  }
  return l;                         // изменили и там, и здесь — побеждает это устройство
}
function psMergeArr(b, l, r) {
  const B = new Map(b.map(x => [String(x.id), x])), R = new Map(r.map(x => [String(x.id), x])), L = new Map(l.map(x => [String(x.id), x]));
  const out = [];
  const pick = id => {
    const bi = B.get(id), li = L.get(id), ri = R.get(id);
    if (li && ri) return psMerge(bi, li, ri);
    if (li) return bi && SJ(bi) === SJ(li) ? undefined : li;   // на Диске удалили, а здесь не трогали — удаляем
    if (ri) return bi && SJ(bi) === SJ(ri) ? undefined : ri;   // здесь удалили, а там не трогали — удаляем
  };
  // порядок — как на этом устройстве; новые с Диска встают после своего соседа
  const seen = new Set();
  l.forEach(x => { const id = String(x.id); if (seen.has(id)) return; seen.add(id); const v = pick(id); if (v !== undefined) out.push(v); });
  r.forEach((x, i) => {
    const id = String(x.id); if (seen.has(id)) return; seen.add(id);
    const v = pick(id); if (v === undefined) return;
    let at = out.length;
    for (let j = i - 1; j >= 0; j--) { const k = out.findIndex(y => String(y.id) === String(r[j].id)); if (k >= 0) { at = k + 1; break; } }
    if (i === 0) at = 0;
    out.splice(at, 0, v);
  });
  return out;
}
function psPart(d) {
  const o = {};
  for (const k in d) if (!PS_LOCAL.includes(k)) o[k] = d[k];
  o.settings = { ...(d.settings || {}) }; PS_LSET.forEach(k => delete o.settings[k]);
  return JSON.parse(JSON.stringify(o));
}
function psApply(m) {
  const keep = {}; PS_LOCAL.forEach(k => { if (D[k] !== undefined) keep[k] = D[k]; });
  const ls = {}; PS_LSET.forEach(k => { if (D.settings[k] !== undefined) ls[k] = D.settings[k]; });
  const nd = normalize(JSON.parse(JSON.stringify(m)));
  Object.assign(nd, keep); nd.settings = Object.assign(nd.settings, ls); nd.demo = false;
  D = nd;
  UI.syncing = true; save(); UI.syncing = false;
  applyAppearance();
  if (typeof shareDirty === 'function') shareDirty();
  if (!modalOpen() && !dragId) render(); else drawSide();
}
// пока открыта карточка задачи или идёт перетаскивание — данные не подменяем (настройки — можно)
const psBusyUi = () => !!(dragId || (modalOpen() && !$('#sbody')) || (typeof sheetOpen === 'function' && sheetOpen()) || (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && !document.activeElement.closest('#sbody')) || (document.activeElement && document.activeElement.isContentEditable));

// ---------- база (как было после прошлого обмена) — в IndexedDB, зашифрована ----------
const psDB = (() => {
  let p = null;
  const db = () => p || (p = new Promise((res, rej) => { const q = indexedDB.open('planer-sync', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
  const tx = (m, f) => db().then(d => new Promise((res, rej) => { const t = d.transaction('kv', m), q = f(t.objectStore('kv')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  return { get: k => tx('readonly', s => s.get(k)), put: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
})();
async function psBaseGet() { try { const o = await psDB.get('base'); if (!o || o.f !== D.sync.fid) return null; return await sOpen(D.sync.key, o.d); } catch (e) { return null; } }
async function psBaseSet(b) { try { await psDB.put('base', { f: D.sync.fid, d: await sSeal(D.sync.key, b) }); } catch (e) { console.warn(e); } }
function psReset() { psDB.del('base').catch(() => {}); PS.lastSig = ''; try { localStorage.removeItem('planer-sync-lh'); } catch (e) {} psDirty(); }

// ---------- тексты законов ----------
const PSH = new WeakMap();
const psArtsHash = a => { if (!PSH.has(a)) PSH.set(a, recHash(a)); return PSH.get(a); };
async function psLaws() {
  const docs = (D.law && D.law.docs) || []; PS.lawPend = false;
  if (!docs.length) return;
  await lawLoad();
  let LH = {}; try { LH = JSON.parse(localStorage.getItem('planer-sync-lh') || '{}'); } catch (e) {}
  let files = null; const rl = async () => files || (files = (await PFX.list(PS_LAW)) || []);
  const has = async nm => (await rl()).some(f => f.name === nm);
  for (const d of docs) {
    const arts = LAWC.get(d.id); let h = arts && arts.length ? psArtsHash(arts) : null;
    const prev = LH[d.id];
    if (h && prev && h !== prev) d.ah = h;                          // текст обновили на этом устройстве
    else if (d.ah && d.ah !== h) {                                  // на другом устройстве текст новее или здесь его нет
      const nm = d.id + '.' + d.ah + '.json';
      if (!(await has(nm))) { PS.lawPend = true; continue; }        // ещё не выгружен — в следующий раз
      const body = await sOpen(D.sync.key, JSON.parse(await PFX.read(PS_LAW + '/' + nm)));
      LAWC.set(d.id, body.arts || []); PSH.set(LAWC.get(d.id), d.ah);
      await lawDB.put({ id: d.id, arts: body.arts || [], raw: body.raw || '' }).catch(() => {});
      h = d.ah; PS.lawGot = true;
    } else if (h && !d.ah) d.ah = h;
    if (h && d.ah === h && !(await has(d.id + '.' + h + '.json'))) {
      await PFX.mkdir(PS_LAW);
      const rec = await lawDB.get(d.id).catch(() => null);
      await PFX.write(PS_LAW + '/' + d.id + '.' + h + '.json', JSON.stringify(await sSeal(D.sync.key, { arts: LAWC.get(d.id), raw: (rec && rec.raw) || '' })));
      files.push({ name: d.id + '.' + h + '.json', mtime: Date.now() });
    }
    if (h) LH[d.id] = h;
  }
  // старые редакции и удалённые документы (только давние файлы — свежие могли выгрузить только что)
  if (files) for (const f of files) {
    const m = /^(.+)\.([^.]+)\.json$/.exec(f.name); if (!m || Date.now() - f.mtime < 36e5) continue;
    const d = docs.find(x => x.id === m[1]);
    if (!d || (d.ah && d.ah !== m[2])) await PFX.del(PS_LAW + '/' + f.name);
  }
  try { localStorage.setItem('planer-sync-lh', JSON.stringify(LH)); } catch (e) {}
}

// ---------- обмен ----------
function psDirty() { if (!psOn()) return; PS.dirty = true; clearTimeout(PS.dirtyT); PS.dirtyT = setTimeout(() => psSync(), 4000); }
function psLater(ms) { clearTimeout(PS.dirtyT); PS.dirtyT = setTimeout(() => psSync(), ms); }
async function psSync(force) {
  if (!psOn() || UI.locked) return false;
  if (PS.busy) { PS.again = true; return false; }
  if (!force && psBusyUi()) { psLater(6000); return false; }
  PS.busy = true; const S = D.sync; let ok = false;
  try {
    for (let round = 0; round < 3; round++) {
      const files = await PFX.list('');
      if (!files) throw new Error('Папка «Планер — мои данные» пропала с Яндекс Диска. Отключите синхронизацию и включите её заново.');
      const f = files.find(x => x.name === PS_DATA), sig = psSig(f);
      if (!force && !PS.dirty && sig === PS.lastSig && !PS.lawPend) { PS.err = null; ok = true; break; }
      let remote = null;
      if (f) {
        const raw = await PFX.read(PS_DATA); let o = null; try { o = JSON.parse(raw); } catch (e) { o = null; }
        if (o && o.fid && o.fid !== S.fid) throw new Error('На Диске данные другой синхронизации. Отключите её на этом устройстве и включите заново.');
        if (o && o.data) { try { remote = await sOpen(S.key, o.data); } catch (e) { throw new Error('Данные на Диске не открываются этим паролем — его поменяли на другом устройстве. Отключите синхронизацию и включите с новым паролем.'); } PS.by = o.by || ''; }
      }
      const base = await psBaseGet();
      if (!force && psBusyUi()) { PS.dirty = true; psLater(6000); break; }
      PS.dirty = false;
      const local = psPart(D);
      if (remote) { const m = psMerge(base || {}, local, remote); if (SJ(m) !== SJ(local)) psApply(m); }
      await psLaws();
      const fin = psPart(D);
      if (!remote || SJ(fin) !== SJ(remote)) {
        const again = await PFX.list('');
        if (psSig((again || []).find(x => x.name === PS_DATA)) !== sig) { PS.dirty = true; continue; } // кто-то записал, пока мы сводили — ещё круг
        await PFX.write(PS_DATA, JSON.stringify({ v: 1, fid: S.fid, at: Date.now(), by: psDev(), data: await sSeal(S.key, fin) }));
        const now = await PFX.list(''); PS.lastSig = psSig((now || []).find(x => x.name === PS_DATA)); PS.by = psDev();
      } else PS.lastSig = sig;
      await psBaseSet(fin);
      D.sync.last = Date.now(); PS.err = null; ok = true;
      UI.syncing = true; save(); UI.syncing = false;
      if (PS.lawGot) { PS.lawGot = false; if (UI.view === 'law' && !modalOpen()) render(); }
      break;
    }
  } catch (e) {
    PS.err = String((e && e.message) || e);
  } finally {
    PS.busy = false;
    if (UI.settab === 'devices' && $('#sbody') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sbody'))) drawSettings();
    if (PS.again) { PS.again = false; psLater(1500); }
  }
  return ok;
}
function psStart() {
  clearInterval(PS.timer);
  if (!psOn()) return;
  PS.timer = setInterval(() => { if (!document.hidden) psSync(); }, IS_PHONE ? 45000 : 30000);
  setTimeout(() => psSync(true), 2500);
}
if (hasApi && window.api.on) {
  window.api.on('resume', () => { if (psOn()) setTimeout(() => psSync(), 800); });
  window.api.on('pause', () => { if (psOn() && PS.dirty) psSync(true); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && psOn() && !IS_PHONE) psSync(); });

// ---------- включение ----------
async function psConnect() {
  const pass = ($('#ps-pass') || {}).value || '', mode = ($('input[name=psm]:checked') || {}).value || 'take';
  const msg = t => { const e = $('#ps-err'); if (e) e.textContent = t; };
  if (pass.length < 6) return msg('Пароль — не короче 6 символов');
  const btn = $('#ps-go'); if (btn) btn.disabled = true; msg('Подключаю…');
  const prev = D.sync, tok = psTok(), login = (D.share && D.share.login) || '';
  try {
    D.sync = { token: tok };
    const files = await PFX.list('');
    let meta = null;
    if (files && files.some(f => f.name === PS_META)) { try { meta = JSON.parse(await PFX.read(PS_META)); } catch (e) { meta = null; } }
    let key, fid, fresh = false;
    if (meta && meta.planerSync) {
      key = await spaceKey(pass, meta.salt);
      try { if (await sOpen(key, meta.check) !== 'planer-sync-ok') throw 0; } catch (e) { D.sync = prev; if (btn) btn.disabled = false; return msg('Неверный пароль. Введите тот, что задали на первом устройстве.'); }
      fid = meta.id;
    } else {
      if (!files) await PFX.mkdir('');
      const salt = s64(crypto.getRandomValues(new Uint8Array(16)));
      key = await spaceKey(pass, salt); fid = uid();
      await PFX.write(PS_META, JSON.stringify({ planerSync: 1, id: fid, created: Date.now(), salt, check: await sSeal(key, 'planer-sync-ok') }, null, 1));
      fresh = true;
    }
    snapU();
    D.sync = { on: true, token: tok, login, key, fid, last: 0 };
    await psDB.del('base').catch(() => {});
    try { localStorage.removeItem('planer-sync-lh'); } catch (e) {}
    PS.lastSig = ''; PS.err = null;
    if (!fresh && mode === 'take' && files && files.some(f => f.name === PS_DATA)) {
      const o = JSON.parse(await PFX.read(PS_DATA)), r = await sOpen(key, o.data);
      await psBaseSet(r); psApply(r);                                     // данные этого устройства заменяются данными с Диска
    }
    save(); psStart();
    const ok = await psSync(true);
    toast(ok ? (fresh ? 'Синхронизация включена. Теперь включите её на телефоне с тем же паролем' : 'Синхронизация включена — данные получены') : 'Синхронизация включена, но обмен не удался — см. сообщение', true);
    drawSettings(); render();
  } catch (e) { D.sync = prev; if (btn) btn.disabled = false; msg('Не получилось: ' + ((e && e.message) || e)); }
}

// ---------- раздел настроек ----------
async function psTab() {
  if (!hasApi || !window.api.ydisk) return '<p class="hint">Синхронизация доступна в программе для Windows и на телефоне Android.</p>';
  const intro = `<div class="secbox">${ic('sync')}<div><b>Одни и те же данные на компьютере и телефоне</b><span>Задачи, проекты, заметки, бюджет, привычки и библиотека законов — на всех ваших устройствах. Данные лежат на вашем Яндекс Диске в папке «Планер — мои данные» и зашифрованы паролем синхронизации: Яндекс видит только набор байтов.</span></div></div>`;
  if (!psOn()) {
    if (!psTok()) return `${intro}<h3 class="shh3">1. Войдите в Яндекс</h3>${ydLoginHtml()}`;
    return `${intro}
      <div class="sline"><div class="tx"><b>Яндекс: ${esc((D.share && D.share.login) || '')}</b><span>Вход выполнен</span></div><button class="btn ghost" data-act="ydLogout">Выйти</button></div>
      <h3 class="shh3">2. Пароль синхронизации</h3>
      <label class="f"><span>Пароль</span><input class="in" type="password" id="ps-pass" autocomplete="new-password" placeholder="не короче 6 символов"></label>
      <p class="hint">На первом устройстве придумайте пароль. На остальных введите тот же самый. Пароль никуда не отправляется и не восстанавливается — запишите его.</p>
      <div class="f"><span>Если на Диске уже есть данные (вы включаете синхронизацию на втором устройстве)</span>
        <div class="ydf"><label class="ydfi on"><input type="radio" name="psm" value="take" checked>${ic('download')}<span>Взять данные с Диска</span></label>
        <label class="ydfi"><input type="radio" name="psm" value="merge">${ic('sync')}<span>Объединить с данными этого устройства</span></label></div>
        <p class="hint">«Взять данные с Диска» — то, что сейчас есть на этом устройстве (например, пример с демо-задачами), заменится вашими данными. «Объединить» — сложит одно с другим.</p></div>
      <p class="hint warn" id="ps-err">${esc(PS.err || '')}</p>
      <div><button class="btn pri" id="ps-go" data-act="psConnect">${ic('sync')} Включить синхронизацию</button></div>`;
  }
  const S = D.sync, ago = ts => { if (!ts) return 'ещё не было'; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : fmtTs(ts); };
  return `<div class="secbox on">${ic('sync')}<div><b>Синхронизация включена</b><span>Обмен: ${ago(S.last)}${PS.busy ? ' · идёт…' : ''}${PS.by ? ' · последним записал ' + esc(PS.by.toLowerCase()) : ''}</span></div><button class="btn" data-act="psNow">${ic('sync')} Синхронизировать сейчас</button></div>
    ${PS.err ? `<p class="hint warn">${esc(PS.err)}</p>` : ''}
    <div class="sline"><div class="tx"><b>Яндекс Диск</b><span>${esc(S.login || (D.share && D.share.login) || '')} · папка «Планер — мои данные»</span></div><button class="btn ghost" data-act="shExt" data-v="${esc(ydWeb(PS_DIR))}">${ic('ext')} Открыть на Диске</button></div>
    <div class="sline"><div class="tx"><b>Что синхронизируется</b><span>Всё: задачи, проекты, заметки, бюджет, привычки, даты, шаблоны, правила, теги, колонки, оформление и библиотека законов. У каждого устройства свои: масштаб, размер шрифта и подключение к «Совместной работе».</span></div></div>
    <div class="sline"><div class="tx"><b>Как добавить телефон или другой компьютер</b><span>На нём: Настройки → «Мои устройства» → войдите в тот же Яндекс → введите тот же пароль → «Взять данные с Диска».</span></div></div>
    <div class="sline"><div class="tx"><b>Отключить на этом устройстве</b><span>Данные останутся и здесь, и на Диске — просто перестанут обмениваться</span></div><button class="btn danger" data-act="psOff">Отключить</button></div>`;
}
Object.assign(ACT, {
  psConnect: () => psConnect(),
  psNow: async () => { const ok = await psSync(true); toast(ok ? 'Синхронизировано' : 'Не получилось — см. сообщение в настройках'); },
  psOff: () => { clearInterval(PS.timer); clearTimeout(PS.dirtyT); delete D.sync; psDB.del('base').catch(() => {}); PS.err = null; PS.lastSig = ''; save(); drawSettings(); toast('Синхронизация на этом устройстве отключена'); }
});
document.addEventListener('change', e => { if (e.target.name === 'psm') $$('input[name=psm]').forEach(x => x.closest('.ydfi').classList.toggle('on', x.checked)); });
