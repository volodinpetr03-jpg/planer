'use strict';
// ============================================================
//  CRM, этап 4. Импорт клиентов: Excel (.xlsx), CSV, vCard (.vcf), контакты телефона.
//  Выгрузка клиентов в файл для Excel. Дубликаты — по телефону, почте или имени.
// ============================================================
// ---------- чтение файлов ----------
async function unzipXlsx(buf) {
  const dv = new DataView(buf); let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('файл повреждён или это не Excel (.xlsx)');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const E = {};
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    E[new TextDecoder().decode(new Uint8Array(buf, p + 46, nl))] = { method, csize, lo };
    p += 46 + nl + el + cl;
  }
  const get = async name => {
    const e = E[name]; if (!e) return null;
    const off = e.lo + 30 + dv.getUint16(e.lo + 26, true) + dv.getUint16(e.lo + 28, true), data = new Uint8Array(buf, off, e.csize);
    if (e.method === 0) return new TextDecoder().decode(data);
    if (typeof DecompressionStream === 'undefined') throw new Error('эта версия системы не умеет распаковывать Excel — сохраните таблицу как CSV');
    return new TextDecoder().decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };
  return { names: Object.keys(E), get };
}
async function readXlsx(buf) {
  const z = await unzipXlsx(buf), X = s => new DOMParser().parseFromString(s, 'application/xml');
  const ss = []; const sst = await z.get('xl/sharedStrings.xml');
  if (sst) X(sst).querySelectorAll('si').forEach(si => ss.push([...si.getElementsByTagName('t')].map(t => t.textContent).join('')));
  // первый лист по порядку книги
  let sheet = 'xl/worksheets/sheet1.xml';
  try {
    const wb = X(await z.get('xl/workbook.xml')), rels = X(await z.get('xl/_rels/workbook.xml.rels'));
    const first = wb.getElementsByTagName('sheet')[0], rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = rid && [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target').replace(/^\/?(xl\/)?/, ''); sheet = 'xl/' + t; }
  } catch (e) {}
  if (!z.names.includes(sheet)) sheet = z.names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheet) throw new Error('в книге не найден лист с данными');
  const doc = X(await z.get(sheet)), rows = [];
  const colN = r => { const m = /^([A-Z]+)/.exec(r || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  [...doc.getElementsByTagName('row')].forEach(row => {
    const out = []; let next = 0;
    [...row.getElementsByTagName('c')].forEach(c => {
      let i = colN(c.getAttribute('r')); if (i < 0) i = next; next = i + 1;
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = ss[+(v && v.textContent)] || '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (t === 'b') val = v && v.textContent === '1' ? 'да' : '';
      else val = v ? v.textContent : '';
      out[i] = val;
    });
    rows.push([...out].map(x => x == null ? '' : String(x)));
  });
  return rows;
}
function decodeText(buf) {
  const u = new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1251').decode(u); }   // CSV из русского Excel
}
function parseCSV(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const cnt = ch => (first.match(new RegExp('\\' + ch, 'g')) || []).length;
  const sep = [';', ',', '\t'].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"' && f === '') q = true;
    else if (ch === sep) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
// vCard: телефоны (Android, iPhone), Google Контакты, Outlook
function parseVcf(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n'), un = [];
  lines.forEach(l => { if (/^[ \t]/.test(l) && un.length) un[un.length - 1] += l.slice(1); else if (un.length && /=$/.test(un[un.length - 1]) && /QUOTED-PRINTABLE/i.test(un[un.length - 1])) un[un.length - 1] = un[un.length - 1].slice(0, -1) + l; else un.push(l); });
  const qp = s => { const b = []; for (let i = 0; i < s.length; i++) { if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { b.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; } else b.push(s.charCodeAt(i) & 255); } return new TextDecoder().decode(new Uint8Array(b)); };
  const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const out = []; let c = null;
  un.forEach(l => {
    if (/^BEGIN:VCARD/i.test(l)) { c = { phones: [], emails: [] }; return; }
    if (/^END:VCARD/i.test(l)) { if (c) out.push(c); c = null; return; }
    if (!c) return;
    const k = l.indexOf(':'); if (k < 0) return;
    const head = l.slice(0, k), key = head.split(';')[0].replace(/^item\d+\./i, '').toUpperCase();
    let val = l.slice(k + 1); if (/QUOTED-PRINTABLE/i.test(head)) val = qp(val);
    if (key === 'FN') c.name = unesc(val).trim();
    else if (key === 'N') { const [last, first, mid] = val.split(';').map(x => unesc(x).trim()); c.nparts = [last, first, mid].filter(Boolean); c.nfull = [last, first, mid].filter(Boolean).join(' '); }
    else if (key === 'TEL') c.phones.push(unesc(val).trim());
    else if (key === 'EMAIL') c.emails.push(unesc(val).trim());
    else if (key === 'ORG') c.org = unesc(val.split(';')[0]).trim();
    else if (key === 'TITLE') c.role = unesc(val).trim();
    else if (key === 'ADR') c.addr = val.split(';').map(x => unesc(x).trim()).filter(Boolean).join(', ');
    else if (key === 'BDAY') c.bday = val.trim();
    else if (key === 'NOTE') c.note = unesc(val).trim();
  });
  return out.map(c => ({ name: c.name || c.nfull || '', phones: c.phones, emails: c.emails, org: c.org || '', role: c.role || '', addr: c.addr || '', bday: c.bday || '', note: c.note || '' }));
}
// дата: 25.11.1985, 1985-11-25, 19851125, --11-25, --1125, число Excel
function impDate(v) {
  const s = String(v || '').trim(); if (!s) return { d: '' };
  let m;
  if (/^\d{4,5}(\.\d+)?$/.test(s) && +s > 1000 && +s < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5); return { d: d.toISOString().slice(0, 10) }; }
  if ((m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s))) return { d: `${m[1]}-${m[2]}-${m[3]}` };
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s))) return { d: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` };
  if ((m = /^(\d{1,2})[./-](\d{1,2})$/.exec(s))) return { d: `2000-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, noYear: true };
  if ((m = /^--(\d{2})-?(\d{2})$/.exec(s))) return { d: `2000-${m[1]}-${m[2]}`, noYear: true };
  return { d: '' };
}
// ---------- сопоставление столбцов ----------
const IMP_F = [['', '— не загружать'], ['name', 'Имя целиком (ФИО)'], ['last', 'Фамилия'], ['first', 'Имя'], ['mid', 'Отчество'], ['phone', 'Телефон'], ['email', 'Почта'], ['org', 'Организация'], ['role', 'Должность'], ['addr', 'Адрес'], ['bday', 'День рождения'], ['note', 'Заметка'], ['tags', 'Теги'], ['kind', 'Тип: человек или организация']];
function impGuess(h) {
  const s = lnorm(String(h || '')).trim(); if (!s) return '';
  if (/^labels?$|^тег|^метк|групп/.test(s)) return 'tags';
  if (/^тип$|^вид$|^kind$/.test(s)) return 'kind';
  if (/(type|label|тип)$/.test(s)) return '';
  if (/фамил|last ?name|family|surname/.test(s)) return 'last';
  if (/отчеств|middle/.test(s)) return 'mid';
  if (/^имя$|first ?name|given/.test(s)) return 'first';
  if (/фио|ф\.и\.о|full ?name|^name$|^имя |контакт|клиент|^наименование$|^display/.test(s)) return 'name';
  if (/тел|phone|моб|сотов|mobile/.test(s)) return 'phone';
  if (/почт|e-?mail|^mail/.test(s)) return 'email';
  if (/организ|компан|фирм|company|organization ?(1 - )?name|^org/.test(s)) return 'org';
  if (/должн|title|position|job/.test(s)) return 'role';
  if (/адрес|address/.test(s)) return 'addr';
  if (/рожд|birth|bday/.test(s)) return 'bday';
  if (/замет|коммент|примеч|notes?$|описан/.test(s)) return 'note';
  return '';
}
const IMP = { step: 'start', rows: null, head: true, map: [], list: null, sel: new Set(), q: '', dup: 'skip', src: '' };
function impRecsFromRows() {
  const R = IMP.head ? IMP.rows.slice(1) : IMP.rows;
  return R.map(r => {
    const o = { phones: [], emails: [], tags: [] }, parts = {};
    IMP.map.forEach((f, i) => {
      const v = String(r[i] == null ? '' : r[i]).trim(); if (!f || !v) return;
      if (f === 'phone') v.split(/[,;\n]| {2,}/).map(x => x.trim()).filter(x => digitsOf(x).length >= 5).forEach(x => o.phones.push(x));
      else if (f === 'email') v.split(/[,;\s]+/).filter(x => x.includes('@')).forEach(x => o.emails.push(x));
      else if (f === 'tags') v.split(/[,;]+/).map(x => x.trim()).filter(Boolean).forEach(x => o.tags.push(x));
      else if (['last', 'first', 'mid'].includes(f)) parts[f] = v;
      else o[f] = o[f] ? o[f] + ' ' + v : v;
    });
    if (!o.name) o.name = [parts.last, parts.first, parts.mid].filter(Boolean).join(' ');
    if (o.kind && /орг|компан|фирм|org|company/i.test(o.kind) && o.name) { o.org = o.name; o.name = ''; }
    delete o.kind;
    return o;
  });
}
// ---------- поиск дубликатов ----------
function impFind(rec) {
  const P = CR().filter(c => c.kind === 'person' && !c.archived);
  const tails = (rec.phones || []).map(p => digitsOf(phoneFmt(p)).slice(-10)).filter(x => x.length >= 7);
  const mails = (rec.emails || []).map(e => e.toLowerCase());
  return P.find(c => (c.phones || []).some(p => tails.includes(digitsOf(phoneFmt(p)).slice(-10))))
    || (mails.length && P.find(c => (c.emails || []).some(e => mails.includes(e.toLowerCase()))))
    || (rec.name && P.find(c => lnorm(c.name) === lnorm(rec.name)));
}
function impOrg(name, created) {
  const n = String(name || '').trim(); if (!n) return null;
  let o = CR().find(c => c.kind === 'org' && lnorm(c.name) === lnorm(n));
  if (!o) { o = newContact({ kind: 'org', name: n }); CR().push(o); created.org++; }
  return o.id;
}
function impTagIds(names) { return (names || []).map(t => { const n = t.toLowerCase().replace(/^#/, '').trim(); if (!n) return null; let g = D.tags.find(x => x.title.toLowerCase() === n); if (!g) { g = { id: uid(), title: n, color: COLORS[D.tags.length % COLORS.length] }; D.tags.push(g); } return g.id; }).filter(Boolean); }
// добавление записей; mode: skip — дубликаты пропускать, merge — дополнять пустые поля и новые телефоны/почту
function impApply(recs, mode) {
  const st = { add: 0, upd: 0, skip: 0, empty: 0, org: 0 };
  snapU();
  for (const r0 of recs) {
    const r = { ...r0, phones: [...new Set((r0.phones || []).map(phoneFmt).filter(Boolean))], emails: [...new Set((r0.emails || []).filter(Boolean))] };
    const name = String(r.name || '').replace(/\s+/g, ' ').trim();
    if (!name && !r.org) { st.empty++; continue; }
    if (!name) { const had = CR().some(c => c.kind === 'org' && lnorm(c.name) === lnorm(r.org)); impOrg(r.org, st); if (had) st.skip++; continue; }
    const bd = impDate(r.bday), dup = impFind({ ...r, name });
    if (dup) {
      if (mode !== 'merge') { st.skip++; continue; }
      const before = JSON.stringify(dup);
      r.phones.forEach(p => { if (!(dup.phones || []).some(x => digitsOf(phoneFmt(x)).slice(-10) === digitsOf(p).slice(-10))) dup.phones = [...(dup.phones || []), p]; });
      r.emails.forEach(e => { if (!(dup.emails || []).some(x => x.toLowerCase() === e.toLowerCase())) dup.emails = [...(dup.emails || []), e]; });
      if (!dup.role && r.role) dup.role = r.role; if (!dup.addr && r.addr) dup.addr = r.addr;
      if (!dup.org && r.org) dup.org = impOrg(r.org, st);
      if (!dup.bday && bd.d) { dup.bday = bd.d; dup.bdayNoYear = !!bd.noYear; }
      if (r.note && !(dup.note || '').includes(r.note)) dup.note = [dup.note, r.note].filter(Boolean).join('\n');
      if (r.tags && r.tags.length) dup.tags = [...new Set([...(dup.tags || []), ...impTagIds(r.tags)])];
      if (JSON.stringify(dup) !== before) { dup.upd = Date.now(); crmBday(dup); st.upd++; } else st.skip++;
      continue;
    }
    const c = newContact({ name, role: r.role || '', phones: r.phones, emails: r.emails, addr: r.addr || '', note: r.note || '', bday: bd.d, bdayNoYear: !!bd.noYear, tags: impTagIds(r.tags), org: impOrg(r.org, st) });
    CR().push(c); crmBday(c); st.add++;
  }
  save(); LIX = null;
  return st;
}
// год рождения неизвестен — возраст не считаем
{ const bd0 = crmBday; crmBday = function (c) { bd0(c); if (c && c.bdayNoYear) { const x = (D.dates || []).find(d => d.id === 'ct-' + c.id); if (x) x.year = false; } }; }
// ---------- окно импорта ----------
function impOpen() { Object.assign(IMP, { step: 'start', rows: null, list: null, sel: new Set(), q: '', dup: 'skip' }); impDraw(); }
function impDraw() {
  const ph = IS_PHONE && hasApi && window.api.phoneContacts;
  let body = '', foot = '';
  if (IMP.step === 'start') {
    body = `<div class="impsrc">
      <button class="impbtn" data-act="impFile" data-v="table">${ic('upload')}<b>Таблица Excel или CSV</b><span>Список клиентов из Excel, другой CRM, 1С, Google Таблиц. Столбцы сопоставите на следующем шаге.</span></button>
      <button class="impbtn" data-act="impFile" data-v="vcf">${ic('users')}<b>Файл контактов vCard (.vcf)</b><span>Так выгружают контакты телефоны, Google Контакты и Outlook.</span></button>
      ${ph ? `<button class="impbtn" data-act="impPhone">${ic('phone')}<b>Контакты этого телефона</b><span>Отметите, кого перенести. Телефон спросит разрешение — только на чтение.</span></button>` : ''}
    </div>
    <p class="hint">Для таблицы удобно, когда первая строка — названия столбцов: «ФИО», «Телефон», «Почта», «Организация», «Должность», «Адрес», «День рождения», «Заметка». <a href="#" data-act="impTpl">Скачать образец</a></p>
    <input type="file" id="imp-file" hidden accept=".csv,.xlsx,.txt,.vcf,text/csv,text/comma-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/vcard,text/x-vcard">`;
    foot = `<button class="btn ghost" data-act="impExport">${ic('download')} Выгрузить клиентов в Excel</button><span class="spacer"></span><button class="btn" data-act="mclose">Закрыть</button>`;
  } else if (IMP.step === 'map') {
    const R = IMP.rows, head = IMP.head ? R[0] : null, data = IMP.head ? R.slice(1) : R, ncol = Math.max(...R.slice(0, 50).map(r => r.length));
    const recs = impRecsFromRows(), ok = recs.filter(r => r.name || r.org).length, dups = recs.filter(r => (r.name || r.org) && impFind(r)).length;
    body = `<p class="hint">${esc(IMP.src)} · строк с данными: <b>${data.length}</b>. Укажите, что лежит в каждом столбце — Планер угадал по названиям.</p>
      <label class="chk"><input type="checkbox" id="imp-head" ${IMP.head ? 'checked' : ''}> Первая строка — названия столбцов</label>
      <div class="impmap">${[...Array(ncol)].map((_, i) => `<div class="impcol"><div class="impch">${esc(head ? head[i] || 'Столбец ' + (i + 1) : 'Столбец ' + (i + 1))}</div>
        <select class="in" data-impcol="${i}" aria-label="Что в столбце ${i + 1}">${IMP_F.map(([k, l]) => `<option value="${k}" ${IMP.map[i] === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="impsm">${data.slice(0, 3).map(r => `<span>${esc(String(r[i] || '—').slice(0, 40))}</span>`).join('')}</div></div>`).join('')}</div>
      ${dups ? impDupHtml(dups) : ''}
      <p class="hint" id="imp-sum">Будет обработано записей: <b>${ok}</b>${dups ? `, из них уже есть в «Клиентах»: <b>${dups}</b>` : ''}.${IMP.map.some(Boolean) ? '' : ' Выберите хотя бы один столбец.'}</p>`;
    foot = `<button class="btn ghost" data-act="impBack">${ic('left')} Назад</button><span class="spacer"></span><button class="btn pri" data-act="impGoRows" ${ok ? '' : 'disabled'}>Загрузить ${ok || ''}</button>`;
  } else if (IMP.step === 'list') {
    const q = lnorm(IMP.q.trim()), L = IMP.list.map((r, i) => ({ r, i, dup: impFind(r) })).filter(x => !q || lnorm([x.r.name, x.r.org, ...(x.r.phones || [])].join(' ')).includes(q) || (digitsOf(q).length >= 3 && (x.r.phones || []).some(p => digitsOf(p).includes(digitsOf(q)))));
    const nsel = IMP.sel.size, ndup = [...IMP.sel].filter(i => impFind(IMP.list[i])).length;
    body = `<div class="implh"><input class="in" id="imp-q" value="${esc(IMP.q)}" placeholder="Поиск по имени, номеру, организации" autocomplete="off"><button class="btn sm" data-act="impAll" data-v="1">Выбрать новых</button><button class="btn sm ghost" data-act="impAll" data-v="0">Снять все</button></div>
      <p class="hint">${esc(IMP.src)} · всего ${IMP.list.length}, выбрано <b>${nsel}</b>.</p>
      <div class="impl">${L.slice(0, 400).map(({ r, i, dup }) => `<label class="impi ${dup ? 'dup' : ''}"><input type="checkbox" data-impi="${i}" ${IMP.sel.has(i) ? 'checked' : ''}><span class="tx"><b>${esc(r.name || r.org || 'Без имени')}</b><small>${esc([phoneFmt((r.phones || [])[0] || ''), r.name && r.org ? r.org : '', (r.emails || [])[0] || ''].filter(Boolean).join(' · ') || 'нет телефона')}</small></span>${dup ? '<em>уже есть</em>' : ''}</label>`).join('') || '<div class="empty">Ничего не найдено</div>'}${L.length > 400 ? `<p class="hint">Показаны первые 400 — уточните поиск.</p>` : ''}</div>
      ${ndup ? impDupHtml(ndup) : ''}`;
    foot = `<button class="btn ghost" data-act="impBack">${ic('left')} Назад</button><span class="spacer"></span><button class="btn pri" data-act="impGoList" ${nsel ? '' : 'disabled'}>Загрузить ${nsel || ''}</button>`;
  }
  modal(`<div class="mbox ${IMP.step === 'map' ? 'wide' : ''} impbox"><div class="mh"><h2>${ic('upload')} Импорт клиентов</h2><button class="ib" data-act="mclose" aria-label="Закрыть">${ic('x')}</button></div><div class="mb">${body}</div><div class="mf">${foot}</div></div>`);
  UI.form = { kind: 'imp' };
}
const impDupHtml = n => `<div class="f impdup"><span>Если клиент уже есть (совпал телефон, почта или имя) — таких ${n}</span>
  <label class="chk"><input type="radio" name="impdup" value="skip" ${IMP.dup === 'skip' ? 'checked' : ''}> Пропустить</label>
  <label class="chk"><input type="radio" name="impdup" value="merge" ${IMP.dup === 'merge' ? 'checked' : ''}> Дополнить: новые телефоны, почта и пустые поля</label></div>`;
function impDone(st) {
  closeModal(); CRF.tab = 'contacts'; if (UI.view !== 'crm') go('crm'); else render();
  const parts = [st.add ? `добавлено ${st.add}` : '', st.upd ? `дополнено ${st.upd}` : '', st.org ? `новых организаций ${st.org}` : '', st.skip ? `пропущено ${st.skip}` : ''].filter(Boolean);
  toast('Импорт: ' + (parts.join(', ') || 'нечего добавить'), true);
}
async function impReadFile(file, kind) {
  try {
    const buf = await file.arrayBuffer(), name = file.name || 'файл';
    if (kind === 'vcf' || /\.vcf$/i.test(name)) {
      const L = parseVcf(decodeText(buf)).filter(r => r.name || r.org || r.phones.length);
      if (!L.length) return toast('В файле не найдено контактов vCard');
      IMP.list = L; IMP.src = name; IMP.sel = new Set(L.map((r, i) => impFind(r) ? -1 : i).filter(i => i >= 0)); IMP.step = 'list'; IMP.q = '';
    } else {
      const rows = /\.xlsx$/i.test(name) || (new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4b) ? await readXlsx(buf) : parseCSV(decodeText(buf));
      if (!rows.length) return toast('Таблица пустая');
      IMP.rows = rows; IMP.src = name; IMP.head = rows[0].some(h => impGuess(h)); IMP.map = (IMP.head ? rows[0] : rows[0].map(() => '')).map(impGuess);
      if (!IMP.head) { // без заголовков — угадываем по содержимому
        IMP.map = rows[0].map((_, i) => { const v = rows.slice(0, 20).map(r => String(r[i] || '')); if (v.filter(x => digitsOf(x).length >= 10).length > v.length / 2) return 'phone'; if (v.filter(x => x.includes('@')).length > v.length / 2) return 'email'; return ''; });
        const fi = IMP.map.indexOf(''); if (fi >= 0 && !IMP.map.includes('name')) IMP.map[fi] = 'name';
      }
      IMP.step = 'map';
    }
    impDraw();
  } catch (e) { toast('Не удалось прочитать файл: ' + ((e && e.message) || e)); }
}
// ---------- выгрузка ----------
function crmCsv() {
  const q = v => { const s = String(v == null ? '' : v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const H = ['Тип', 'ФИО / название', 'Организация', 'Должность', 'Телефон', 'Ещё телефон', 'Почта', 'Адрес', 'День рождения', 'Теги', 'Заметка'];
  const L = CR().filter(c => !c.archived).sort((a, b) => (a.kind === 'org') - (b.kind === 'org') || a.name.localeCompare(b.name, 'ru'));
  const rows = L.map(c => [c.kind === 'org' ? 'организация' : 'человек', c.name, c.kind === 'person' ? (crmOf(c.org) || {}).name || '' : '', c.role, phoneFmt((c.phones || [])[0] || ''), (c.phones || []).slice(1).map(phoneFmt).join(', '), (c.emails || []).join(', '), c.addr, c.bday ? (c.bdayNoYear ? c.bday.slice(8) + '.' + c.bday.slice(5, 7) : c.bday.split('-').reverse().join('.')) : '', (c.tags || []).map(id => (tagOf(id) || {}).title).filter(Boolean).join(', '), c.note]);
  return '﻿' + [H, ...rows].map(r => r.map(q).join(';')).join('\r\n');
}
document.addEventListener('change', e => {
  if (e.target.id === 'imp-file') { const f = e.target.files && e.target.files[0]; if (f) impReadFile(f, e.target.dataset.kind); e.target.value = ''; }
  if (e.target.id === 'imp-head') { IMP.head = e.target.checked; if (IMP.head) IMP.map = IMP.rows[0].map((h, i) => impGuess(h) || IMP.map[i] || ''); impDraw(); }
  if (e.target.dataset && e.target.dataset.impcol != null) { IMP.map[+e.target.dataset.impcol] = e.target.value; impDraw(); }
  if (e.target.name === 'impdup') IMP.dup = e.target.value;
  if (e.target.dataset && e.target.dataset.impi != null) { const i = +e.target.dataset.impi; e.target.checked ? IMP.sel.add(i) : IMP.sel.delete(i); const sc = $('.impl') ? $('.impl').scrollTop : 0; impDraw(); if ($('.impl')) $('.impl').scrollTop = sc; }
});
document.addEventListener('input', e => { if (e.target.id === 'imp-q') { IMP.q = e.target.value; const p = e.target.selectionStart; impDraw(); const i = $('#imp-q'); if (i) { i.focus(); i.setSelectionRange(p, p); } } });
Object.assign(ACT, {
  impOpen: () => impOpen(),
  impFile: b => { const i = $('#imp-file'); if (!i) return; i.dataset.kind = b.dataset.v; i.accept = b.dataset.v === 'vcf' ? '.vcf,text/vcard,text/x-vcard' : '.csv,.xlsx,.txt,text/csv,text/comma-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; i.click(); },
  impPhone: async () => {
    toast('Читаю контакты телефона…');
    const r = await window.api.phoneContacts();
    if (!r.ok) return toast(r.denied ? 'Без разрешения на контакты импорт невозможен. Разрешение можно дать в настройках Android → Приложения → Планер → Разрешения' : r.error);
    const L = r.list.map(c => ({ name: c.name || '', phones: c.phones || [], emails: c.emails || [], org: c.org || '', role: c.title || '', addr: c.addr || '', bday: c.bday || '', note: c.note || '' })).filter(c => c.name || c.phones.length);
    if (!L.length) return toast('В телефоне нет контактов');
    IMP.list = L; IMP.src = 'Контакты телефона'; IMP.sel = new Set(); IMP.step = 'list'; IMP.q = ''; impDraw();
  },
  impBack: () => { IMP.step = 'start'; impDraw(); },
  impAll: b => { if (b.dataset.v === '1') IMP.list.forEach((r, i) => { if (!impFind(r)) IMP.sel.add(i); }); else IMP.sel.clear(); impDraw(); },
  impGoRows: () => impDone(impApply(impRecsFromRows(), IMP.dup)),
  impGoList: () => impDone(impApply([...IMP.sel].sort((a, b) => a - b).map(i => IMP.list[i]), IMP.dup)),
  impTpl: () => { const ev = window.event; if (ev && ev.preventDefault) ev.preventDefault(); saveFile('﻿ФИО;Телефон;Почта;Организация;Должность;Адрес;День рождения;Заметка\r\nИванов Иван Иванович;+7 (900) 000-00-00;ivanov@example.ru;ООО «Пример»;директор;г. Город, ул. Улица, 1;01.01.1980;\r\n', 'Клиенты-образец', 'csv'); },
  impExport: () => { if (!CR().length) return toast('Клиентов пока нет'); saveFile(crmCsv(), `Клиенты-${today()}`, 'csv'); }
});
// кнопка «Импорт» в разделе «Клиенты» → «Контакты»
{
  const M = MODULES.find(m => m.id === 'crm');
  if (M) {
    const bar0 = M.bar, render0 = M.render;
    M.bar = function () { const h = bar0(); return CRF.tab === 'contacts' ? h.replace('<button class="btn pri" data-act="crmNew"', `<button class="btn ghost" data-act="impOpen" aria-label="Импорт и выгрузка">${ic('upload')}<span class="hm"> Импорт</span></button><button class="btn pri" data-act="crmNew"`) : h; };
    M.render = function () { const h = render0(); return CRF.tab === 'contacts' ? h.replace(`<button class="btn pri" data-act="crmNew">${ic('plus')} Первый контакт</button>`, `<button class="btn pri" data-act="crmNew">${ic('plus')} Первый контакт</button> <button class="btn" data-act="impOpen">${ic('upload')} Импорт из Excel, vCard или телефона</button>`) : h; };
  }
}
