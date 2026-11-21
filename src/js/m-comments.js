'use strict';
// ============================================================
//  Этап 5. Комментарии к задачам и журнал изменений (в общих проектах — у всех участников)
// ============================================================
ICONS.chat = '<path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z"/>';
ICONS.hist = '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v3.5h3.5M12 8v4.5l3 1.8"/>';
const meIdC = () => shareOn() ? SH().me.id : 'me';
const isMeC = id => id === 'me' || (shareOn() && id === SH().me.id);
const nameC = id => isMeC(id) ? (shareOn() ? SH().me.name : 'Вы') : ((memberOf(id) || {}).name || 'Участник');
const colorC = id => isMeC(id) ? (shareOn() ? SH().me.color : 'var(--acc)') : ((memberOf(id) || {}).color || 'var(--mute)');
const liveCm = t => (t.comments || []).filter(c => !c.del);
// объединение списков (комментарии, журнал) из двух копий записи: по id, удалённое и более позднее правка побеждают
function mergeList(a, b) {
  const m = new Map();
  for (const x of [...(a || []), ...(b || [])]) { if (!x || !x.id) continue; const o = m.get(x.id); if (!o || (x.del && !o.del) || (!o.del && (x.ed || x.at || 0) > (o.ed || o.at || 0))) m.set(x.id, x); }
  return [...m.values()].sort((p, q) => (p.at || 0) - (q.at || 0));
}
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
function cmItem(c) {
  return `<div class="cm" data-cid="${c.id}" style="--c:${colorC(c.by)}"><span class="who">${esc(initials(nameC(c.by)))}</span><div class="cmb"><div class="cmh"><b>${esc(nameC(c.by))}</b><small>${fmtTs(c.at)}${c.ed ? ' · изменено' : ''}</small>${isMeC(c.by) ? `<button type="button" class="ib sm" data-act="cmDel" data-id="${c.id}" title="Удалить комментарий" aria-label="Удалить комментарий">${ic('x')}</button>` : ''}</div><div class="cmt">${typeof refsHtml === 'function' ? refsHtml(c.text, c.ment, linkify) : linkify(c.text)}</div></div></div>`;
}
const HF_L = { title: 'название', date: 'срок', time: 'время', who: 'исполнитель', done: 'статус', prio: 'приоритет', colName: 'колонку', desc: 'описание', project: 'проект', dur: 'длительность' };
function histVal(f, v) {
  if (v == null || v === '') return '—';
  if (f === 'date') return human(v).toLowerCase();
  if (f === 'who') return nameC(v);
  if (f === 'done') return v ? 'выполнена' : 'в работе';
  if (f === 'prio') return PRIO[v] ? PRIO[v][0].toLowerCase() : v;
  if (f === 'project') return (projOf(v) || {}).title || '—';
  if (f === 'dur') return durTxt(v);
  if (f === 'desc') return String(v).slice(0, 60) + (String(v).length > 60 ? '…' : '');
  return String(v).slice(0, 80);
}
function histItem(h) {
  const txt = h.f === 'new' ? 'создал(а) задачу' : h.f === 'cm' ? 'оставил(а) комментарий' : h.f === 'done' ? (h.b ? 'отметил(а) выполненной' : 'вернул(а) в работу') : `изменил(а) ${HF_L[h.f] || h.f}: <s>${esc(histVal(h.f, h.a))}</s> → <b>${esc(histVal(h.f, h.b))}</b>`;
  return `<div class="hi"><i style="--c:${colorC(h.by)}"></i><span><b>${esc(nameC(h.by))}</b> ${txt}</span><small>${fmtTs(h.at)}</small></div>`;
}
function cmBlock(t) {
  const L = liveCm(t), H = (t.hist || []).slice().reverse();
  return `<div class="f cmw"><span>${ic('chat')} Комментарии ${L.length ? '· ' + L.length : ''}${isShared(projOf(t.project)) ? ' <em>— видны всем участникам проекта</em>' : ''}</span>
    <div id="cm-list">${L.map(cmItem).join('') || '<p class="hint">Пока нет комментариев.</p>'}</div>
    <div class="cmin"><textarea class="in" id="cm-in" rows="1" maxlength="2000" placeholder="Написать комментарий — Enter, новая строка — Shift+Enter"></textarea><button type="button" class="btn sm pri" data-act="cmAdd">Отправить</button></div></div>
    ${H.length ? `<details class="f histw"><summary>${ic('hist')} История изменений · ${H.length}</summary><div class="hlist">${H.slice(0, 40).map(histItem).join('')}</div></details>` : ''}`;
}
function drawCm() {
  const L = $('#cm-list'); if (!L || !UI.form) return; const t = byId(UI.form.t.id); if (!t) return;
  UI.form.t.comments = t.comments; UI.form.t.hist = t.hist;
  L.innerHTML = liveCm(t).map(cmItem).join('') || '<p class="hint">Пока нет комментариев.</p>';
  const sp = $('.cmw > span'); if (sp) sp.firstChild && (sp.innerHTML = sp.innerHTML.replace(/Комментарии( · \d+)?/, 'Комментарии' + (liveCm(t).length ? ' · ' + liveCm(t).length : '')));
  L.scrollTop = L.scrollHeight;
}
document.addEventListener('keydown', e => {
  if (e.target.id !== 'cm-in' || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault(); e.stopImmediatePropagation(); ACT.cmAdd();
}, true);
document.addEventListener('input', e => { if (e.target.id === 'cm-in') { e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; } });
Object.assign(ACT, {
  cmAdd: () => {
    const i = $('#cm-in'), v = i ? i.value.trim() : ''; if (!v || !UI.form) return;
    const t = byId(UI.form.t.id); if (!t) return;
    const c = { id: uid(), by: meIdC(), at: Date.now(), text: v };
    t.comments = [...(t.comments || []), c]; UI.form.t.comments = t.comments;
    i.value = ''; i.style.height = 'auto'; save(); drawCm(); i.focus();
  },
  cmDel: b => {
    if (!UI.form) return; const t = byId(UI.form.t.id); if (!t) return;
    t.comments = (t.comments || []).map(c => c.id === b.dataset.id ? { id: c.id, by: c.by, at: c.at, del: true, ed: Date.now(), text: '' } : c); UI.form.t.comments = t.comments;
    save(); drawCm(); toast('Комментарий удалён');
  }
});
// журнал: изменения общих задач, сделанные у меня с прошлой синхронизации
const HIST_F = ['title', 'date', 'time', 'who', 'done', 'prio', 'colName', 'desc', 'project', 'dur'];
function histStamp(base, loc, ids) {
  const me = SH().me.id, now = Date.now(); let n = 0;
  for (const id of ids) {
    const r = loc[id], t = r && r.k === 't' ? byId(id) : null; if (!t) continue;
    const b = base[id] && typeof base[id] === 'object' ? base[id] : null, add = [];
    if (!b) { if (!(t.hist || []).length) add.push({ f: 'new' }); }
    else {
      HIST_F.forEach(f => { if (f === 'colName' && r.done !== b.done) return; if (JSON.stringify(r[f] ?? null) !== JSON.stringify(b[f] ?? null)) add.push({ f, a: b[f] ?? null, b: r[f] ?? null }); });
      if ((r.comments || []).some(c => !c.del && c.by === me && !(b.comments || []).some(x => x.id === c.id))) add.push({ f: 'cm' });
    }
    if (!add.length) continue;
    t.hist = [...(t.hist || []), ...add.map(x => ({ id: uid(), at: now, by: me, ...x }))].slice(-60); n++;
  }
  return n;
}
