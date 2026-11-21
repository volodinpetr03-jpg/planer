'use strict';
// ============================================================
//  «Право» → Консультация и Документы.
//  Консультация: вопрос своими словами → термины (словарь синонимов, а с помощником — ещё и подсказки
//  YandexGPT) → поиск по своей библиотеке → самые подходящие фразы статей. Помощник отвечает кратко
//  только по найденным текстам; каждая его цитата сверяется с текстом статьи.
//  Документы: жалоба, заявление, обращение, претензия — поля, основание из консультации,
//  лист А4, Word / PDF / копирование, задача «ждать ответ».
// ============================================================

// ---------- помощник YandexGPT ----------
const AIM = [
  { id: 'aliceai-llm', t: 'Alice AI LLM', d: 'самая умная модель Яндекса', pin: 0.50, pout: 1.20 },
  { id: 'yandexgpt-5.1', t: 'YandexGPT Pro 5.1', d: 'предыдущее поколение', pin: 0.80, pout: 0.80 },
  { id: 'aliceai-llm-flash', t: 'Alice AI LLM Flash', d: 'в 5 раз дешевле, отвечает проще', pin: 0.10, pout: 0.20 }
]; // ₽ за 1000 токенов без НДС, тарифы Yandex AI Studio на октябрь 2026
const AIC = () => { if (!D.ai) D.ai = { on: false, key: '', folder: '', model: AIM[0].id }; return D.ai; };
const aiReady = () => !!(hasApi && window.api.ai && AIC().on && AIC().key && AIC().folder);
const aiCost = (model, u) => { const m = AIM.find(x => x.id === model); return m && u ? ((+u.prompt_tokens || 0) * m.pin + (+u.completion_tokens || 0) * m.pout) / 1000 * 1.22 : null; };
function aiErr(r) {
  let j = {}; try { j = JSON.parse(r.text || '{}'); } catch (e) {}
  const msg = (j.error && (j.error.message || j.error)) || j.message || '';
  if (r.status === 0) return 'Нет связи с YandexGPT. Проверьте интернет.' + (r.error === 'timeout' ? ' (сервер долго не отвечал)' : '');
  if (r.status === 401 || r.status === 403) return 'YandexGPT не принял ключ. Проверьте API-ключ и идентификатор каталога (Настройки → Помощник)' + (r.status === 403 ? ' и что у ключа есть роль ai.languageModels.user' : '') + '.';
  if (r.status === 402) return 'В Yandex Cloud закончились средства или не подключён платёжный аккаунт.';
  if (r.status === 429) return 'Слишком много запросов подряд. Подождите минуту.';
  return `YandexGPT ответил ошибкой ${r.status}${msg ? ': ' + String(msg).slice(0, 200) : ''}.`;
}
async function aiAsk(messages, maxTokens, temperature) {
  const c = AIC(), model = c.model || AIM[0].id;
  const r = await window.api.ai({ key: c.key, folder: c.folder, model: `gpt://${String(c.folder).trim()}/${model}`, messages, temperature: temperature == null ? 0.2 : temperature, maxTokens: maxTokens || 1200 });
  if (!r || r.status !== 200) throw new Error(aiErr(r || { status: 0 }));
  let j; try { j = JSON.parse(r.text); } catch (e) { throw new Error('YandexGPT прислал непонятный ответ'); }
  const text = (((j.choices || [])[0] || {}).message || {}).content || '';
  return { text: String(text).trim(), cost: aiCost(model, j.usage) };
}
async function aiSettingsTab() {
  const c = AIC();
  return `<div class="secbox ${aiReady() ? 'on' : ''}">${ic('spark')}<div><b>Помощник YandexGPT ${aiReady() ? 'подключён' : 'не подключён'}</b><span>Нужен для режима «С помощником» в консультации и для «Улучшить текст» в документах. Без него работает поиск по библиотеке без интернета.</span></div></div>
    ${hasApi && window.api.ai ? `<div class="sline"><div class="tx"><b>Включить помощника</b><span>Вопрос и найденные статьи отправляются в Yandex AI Studio. Запросы не используются для обучения моделей.</span></div><input type="checkbox" class="tog" id="ai-on" ${c.on ? 'checked' : ''}></div>
    <label class="f"><span>API-ключ</span><input class="in" id="ai-key" type="password" autocomplete="off" value="${esc(c.key)}" placeholder="AQVN…"></label>
    <label class="f"><span>Идентификатор каталога</span><input class="in" id="ai-folder" autocomplete="off" value="${esc(c.folder)}" placeholder="b1g…"></label>
    <div class="f"><span>Модель</span>${AIM.map(m => `<label class="airow"><input type="radio" name="ai-model" value="${m.id}" ${c.model === m.id ? 'checked' : ''}><b>${m.t}</b><span>${m.d}</span></label>`).join('')}</div>
    <div><button class="btn" data-act="aiTest">${ic('spark')} Проверить подключение</button> <span class="hint" id="ai-res"></span></div>
    <p class="hint">Где взять ключ: консоль Yandex Cloud → ваш каталог → «Сервисные аккаунты» → создать аккаунт с ролью <b>ai.languageModels.user</b> → «Создать API-ключ». Идентификатор каталога — в адресной строке консоли или на главной странице каталога (начинается с b1g). Подойдёт тот же ключ, что и в других ваших программах с YandexGPT. Один вопрос в консультации обычно стоит меньше рубля.</p>` : '<p class="hint">Помощник работает в программе для Windows и на телефоне.</p>'}`;
}

// ---------- консультация: термины и поиск ----------
const STOP = new Set('и в во на по с со к ко у о об от до за из под над при для или а но же ли бы не ни что как так это то тот эта этот там тут где куда когда если чтобы мне меня мой моя мое мои ему его её ее их им они он она оно мы вы я ты свой свою свои свое быть есть был была были будет можно нужно надо ли кто чем чего уже ещё еще очень просто все всё весь вся какой какая какие какое который которая которые сколько почему зачем ли делать сделать'.split(' '));
// разговорное → как пишут в законах (по началу слова)
const SYN = [
  [['сосед'], ['собственник помещения', 'жилое помещение', 'многоквартирный дом']],
  [['лестниц', 'площадк', 'подъезд', 'коридор', 'тамбур'], ['лестничная клетка', 'пути эвакуации', 'места общего пользования']],
  [['хлам', 'мебел', 'коробк', 'мусор', 'вещи', 'склад', 'загромо', 'захлам'], ['горючие материалы', 'хранение', 'загромождение', 'отходы']],
  [['пожар', 'огонь', 'гори', 'дым', 'огнетуш'], ['пожарная безопасность', 'противопожарный режим', 'первичные средства пожаротушения']],
  [['шум', 'громк', 'музык', 'ремонт ночь', 'тишин'], ['тишина', 'ночное время', 'нарушение покоя граждан']],
  [['жалоб', 'пожаловат', 'обращ', 'написать'], ['обращение', 'жалоба', 'рассмотрение обращения']],
  [['штраф', 'наказ', 'грозит', 'ответствен'], ['административный штраф', 'предупреждение', 'ответственность']],
  [['управляющ', 'ук ', 'жэк', 'тсж'], ['управляющая организация', 'управление многоквартирным домом', 'содержание общего имущества']],
  [['отоплен', 'батаре', 'холодно'], ['отопление', 'коммунальная услуга', 'качество коммунальных услуг']],
  [['затопи', 'протечк', 'залил', 'потоп'], ['залив', 'ущерб', 'возмещение вреда']],
  [['магазин', 'продав', 'купил', 'покупк', 'товар'], ['продавец', 'потребитель', 'товар']],
  [['брак', 'сломал', 'неисправ', 'дефект'], ['недостаток товара', 'товар ненадлежащего качества']],
  [['вернут', 'возврат', 'деньги назад'], ['возврат уплаченной суммы', 'отказ от исполнения договора']],
  [['гаранти'], ['гарантийный срок']],
  [['работодат', 'начальник', 'директор'], ['работодатель', 'трудовой договор']],
  [['уволи', 'увольн', 'сократ'], ['расторжение трудового договора', 'увольнение', 'сокращение']],
  [['зарплат', 'оклад', 'получк'], ['заработная плата', 'оплата труда']],
  [['отпуск'], ['ежегодный оплачиваемый отпуск']],
  [['больничн'], ['временная нетрудоспособность']],
  [['полици', 'участков'], ['полиция', 'участковый уполномоченный']],
  [['собак', 'кошк', 'животн'], ['животные', 'содержание животных']],
  [['машин', 'авто', 'парков', 'стоянк'], ['транспортное средство', 'стоянка', 'парковка']],
  [['дтп', 'авари'], ['дорожно-транспортное происшествие']],
  [['налог'], ['налог', 'налогоплательщик']],
  [['долг', 'задолж'], ['задолженность', 'обязательство']],
  [['суд', 'иск', 'судить'], ['исковое заявление', 'суд']],
  [['срок', 'сколько дней', 'когда ответ'], ['срок рассмотрения', 'срок']],
  [['провер', 'инспекц', 'надзор'], ['проверка', 'контроль (надзор)', 'контрольное (надзорное) мероприятие']],
  [['документ', 'справк'], ['документ']],
  [['ребен', 'детск', 'дети'], ['несовершеннолетний', 'ребенок']]
];
const cstem = w => w.length > 6 ? w.slice(0, w.length - 3) : w.length > 4 ? w.slice(0, w.length - 2) : w;
const cwords = s => lnorm(s).split(/[^a-zа-я0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
function consultTerms(q, extra) {
  const lq = ' ' + lnorm(q) + ' ', toks = cwords(q), stems = [...new Set(toks.map(cstem))], phrases = [];
  SYN.forEach(([trig, legal]) => { if (trig.some(t => t.includes(' ') ? lq.includes(t) : toks.some(w => w.startsWith(t)) || lq.includes(' ' + t))) legal.forEach(p => phrases.push(p)); });
  (extra || []).forEach(p => { p = String(p).trim().replace(/^[-•*\d.)\s]+/, '').replace(/[.«»"]/g, ''); if (p && p.length < 60) phrases.push(p.toLowerCase()); });
  const uniq = [...new Set(phrases)];
  return { stems, phrases: uniq, pstems: uniq.map(p => cwords(p).map(cstem)).filter(a => a.length) };
}
const sentSplit = body => body.split(/\n+/).flatMap(p => p.split(/(?<=[.;:])\s+(?=[А-ЯЁ0-9«(])/)).map(s => s.trim()).filter(s => s.length > 3);
function consultSearch(T, limit = 8) {
  const out = [];
  for (const d of LW().docs) for (const a of lawArts(d.id)) {
    const tt = lnorm(a.t), bb = lnorm(a.body); let sc = 0, hit = 0;
    for (const s of T.stems) { if (tt.includes(s)) { sc += 4; hit++; } else { const c = bb.split(s).length - 1; if (c) { sc += 1.5 + Math.min(c, 4) * 0.25; hit++; } } }
    for (const ps of T.pstems) { if (ps.every(s => tt.includes(s))) sc += 5; else if (ps.every(s => bb.includes(s))) sc += 3; }
    if (!sc) continue;
    sc *= 0.5 + (T.stems.length ? hit / T.stems.length : 0.5);
    out.push({ d, a, sc });
  }
  out.sort((x, y) => y.sc - x.sc);
  const top = out.slice(0, limit), max = top.length ? top[0].sc : 1;
  top.forEach(r => { r.rel = Math.max(0.15, r.sc / max); r.sents = bestSents(r.a.body, T); });
  return top;
}
function bestSents(body, T) {
  const S = sentSplit(body).map((s, i) => { const l = lnorm(s); let v = 0; T.stems.forEach(st => { if (l.includes(st)) v += 1; }); T.pstems.forEach(ps => { if (ps.every(st => l.includes(st))) v += 2; }); return { s, i, v }; });
  const top = S.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 2).sort((a, b) => a.i - b.i);
  return top.length ? top.map(x => x.s) : S.slice(0, 1).map(x => x.s.slice(0, 300));
}
const qnorm = s => lnorm(s).replace(/[«»"“”„]/g, '').replace(/\s+/g, ' ').trim();

// ---------- консультация: состояние и показ ----------
const CS = { q: '', mode: null, busy: false, res: null };
async function consultRun() {
  const q = ($('#cq') ? $('#cq').value : CS.q).trim(); if (!q) return toast('Напишите вопрос');
  CS.q = q; CS.busy = true; CS.res = null; render();
  await lawLoad();
  const useAI = (CS.mode || (aiReady() ? 'ai' : 'local')) === 'ai' && aiReady();
  const res = { q, ai: useAI, terms: [], items: [], answer: null, err: null, cost: 0 };
  try {
    let extra = [];
    if (useAI) {
      try {
        const r = await aiAsk([{ role: 'system', content: 'Ты помогаешь искать нормы в текстах российских законов, кодексов и правил. По вопросу пользователя перечисли через запятую 6–12 юридических терминов и ключевых слов в той форме, как они встречаются в текстах нормативных актов. Только список через запятую, без пояснений и без номеров статей.' }, { role: 'user', content: q }], 200, 0.1);
        extra = r.text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 14); res.cost += r.cost || 0;
      } catch (e) { res.err = e.message; }
    }
    const T = consultTerms(q, extra); res.terms = T.phrases.slice(0, 10); res.T = T;
    res.items = consultSearch(T, useAI ? 8 : 6);
    if (useAI && res.items.length && !res.err) {
      let budget = 16000;
      const src = res.items.map((r, i) => { const head = `[${i + 1}] ${artLabel(r.d, r.a)}${r.a.t && r.d.unit !== 'п' ? ' — ' + r.a.t : ''}${r.d.short && r.d.title ? ' (' + r.d.title + ')' : ''}`; const body = r.a.body.slice(0, Math.max(600, Math.min(3000, budget))); budget -= body.length; return head + '\n' + body; }).join('\n\n');
      const sys = 'Ты помогаешь человеку без юридического образования разобраться в законах. Отвечай ТОЛЬКО на основе ИСТОЧНИКОВ из сообщения пользователя. Если в источниках нет ответа, напиши ровно: «В вашей библиотеке нет норм, которые отвечают на этот вопрос». Не придумывай статьи, суммы штрафов, сроки и органы, которых нет в источниках. Формат: 2–4 коротких предложения простым языком; после каждого утверждения — номер источника в квадратных скобках, например [2]. Затем с новой строки слово ЦИТАТЫ: и для каждого использованного источника отдельная строка вида [n] «дословная цитата из текста этого источника, 5–40 слов». Цитаты копируй точно, без изменений.';
      const r = await aiAsk([{ role: 'system', content: sys }, { role: 'user', content: `Вопрос: ${q}\n\nИСТОЧНИКИ:\n${src}` }], 900, 0.2);
      res.cost += r.cost || 0;
      const cm = r.text.match(/(^|\n)\s*(ЦИТАТЫ|Цитаты)\s*:/), ansRaw = cm ? r.text.slice(0, cm.index) : r.text, quotesRaw = cm ? r.text.slice(cm.index + cm[0].length) : '';
      const qs = [...quotesRaw.matchAll(/\[(\d+)\]\s*[«"“„]([^»"”]{8,600})[»"”]/g)];
      qs.forEach(m => { const it = res.items[+m[1] - 1]; if (!it) return; const nq = qnorm(m[2]); if (nq.length > 8 && qnorm(it.a.body).includes(nq)) it.quote = m[2].trim(); else it.badQuote = true; });
      const used = new Set([...ansRaw.matchAll(/\[(\d+)\]/g)].map(m => +m[1]).filter(n => res.items[n - 1]));
      res.answer = { text: ansRaw.trim(), used: [...used] };
      // источники, на которые сослался помощник, — первыми
      res.items.forEach((it, i) => { it.no = i + 1; }); res.items.sort((a, b) => (used.has(b.no) ? 1 : 0) - (used.has(a.no) ? 1 : 0) || a.no - b.no);
    }
  } catch (e) { res.err = e.message; }
  res.items.forEach((it, i) => { if (!it.no) it.no = i + 1; });
  CS.res = res; CS.busy = false; render();
}
function ansHtml(text, items) {
  return esc(text).replace(/\[(\d+)\]/g, (m0, n) => items.some(x => x.no === +n) ? `<sup><button class="lnk" data-act="csJump" data-v="${n}">${n}</button></sup>` : '').split(/\n+/).map(p => `<p>${p}</p>`).join('');
}
function quoteHtml(it, words) {
  if (it.quote) { const sent = sentSplit(it.a.body).find(s => qnorm(s).includes(qnorm(it.quote).slice(0, 40))) || it.quote; const i = qnorm(sent).indexOf(qnorm(it.quote)); return i >= 0 && sent.length < 900 ? markWords(esc(sent), words).replace(esc(it.quote), `<mark class="q">${esc(it.quote)}</mark>`) : `<mark class="q">${esc(it.quote)}</mark>`; }
  return it.sents.map(s => markWords(esc(s), words)).join(' <span class="dots">…</span> ');
}
function consultView() {
  const R = CS.res, can = aiReady(), mode = CS.mode || (can ? 'ai' : 'local');
  const modes = `<button class="chip ${mode === 'ai' ? 'on' : ''}" data-act="csMode" data-v="ai">${ic('spark')} С помощником${can ? '' : ' — не подключён'}</button><button class="chip ${mode === 'local' ? 'on' : ''}" data-act="csMode" data-v="local">Только поиск, без интернета</button><span class="hint">Ищу в вашей библиотеке: ${LW().docs.length} ${plural(LW().docs.length, ['документ', 'документа', 'документов'])}</span>`;
  let body = '';
  if (!LW().docs.length) body = `<div class="empty">Библиотека пуста — консультации не по чему искать. Добавьте законы и правила на вкладке «Библиотека».</div>`;
  else if (CS.busy) body = `<div class="cbusy"><span class="spin"></span> ${mode === 'ai' ? 'Ищу в библиотеке и спрашиваю помощника…' : 'Ищу в библиотеке…'}</div>`;
  else if (R) {
    const words = [...R.T.stems, ...R.T.pstems.flat()];
    body = `${R.terms.length ? `<div class="kw">Понял как: ${R.terms.map(t => `<i>${esc(t)}</i>`).join('')}</div>` : ''}
      ${R.err ? `<p class="hint warn">${esc(R.err)}${R.ai ? ' Показываю результаты поиска без помощника.' : ''}</p>` : ''}
      ${R.answer ? `<div class="ans"><h3>${ic('spark')} Кратко</h3>${ansHtml(R.answer.text, R.items)}<div class="warn">Ответ составлен только по текстам вашей библиотеки. Цитаты ниже сверены с текстами статей${R.items.some(x => x.badQuote) ? ' — неточные цитаты помощника не показаны' : ''}. Это справка, а не юридическая консультация.${R.cost ? ` · стоимость ≈ ${R.cost < 0.01 ? 'меньше 1 коп.' : NF2.format(R.cost) + ' ₽'}` : ''}</div></div>` : ''}
      ${R.items.length ? `<div class="found">${R.items.map(it => `<div class="fc" id="cs-${it.no}"><div class="fch"><span class="n">${it.no}</span><b>${esc(artLabel(it.d, it.a))}</b><small>${esc(it.a.t && it.d.unit !== 'п' ? it.a.t : it.d.title)}</small><span class="rel">совпадение <i><b style="width:${Math.round(it.rel * 100)}%"></b></i></span></div>
        <div class="qt">${quoteHtml(it, words)}</div>
        <div class="fa"><button class="btn sm" data-act="lawOpen" data-doc="${it.d.id}" data-art="${it.a.id}">${ic('ext')} Открыть статью</button><button class="btn sm" data-act="lawMark" data-doc="${it.d.id}" data-art="${it.a.id}">${ic('bookmark')} ${markOf(it.d.id, it.a.id) ? 'В закладках' : 'В закладки'}</button><button class="btn sm" data-act="lawTask" data-doc="${it.d.id}" data-art="${it.a.id}">${ic('link')} В задачу</button><button class="btn sm pri" data-act="csDoc" data-doc="${it.d.id}" data-art="${it.a.id}">${ic('edit')} Составить документ</button></div></div>`).join('')}</div>`
        : `<div class="empty">В библиотеке не нашлось подходящих статей. Попробуйте другие слова${R.ai ? '' : ' или включите помощника — он подскажет юридические термины'}.</div>`}`;
  } else body = `<p class="hint">Опишите ситуацию своими словами — Планер найдёт подходящие статьи в вашей библиотеке и выделит главное.${can ? ' Помощник ответит коротко и сошлётся на статьи.' : ''}</p>`;
  return `<div class="lmain cwrap" id="lmain"><div class="cq"><form class="cqbox" id="csform"><textarea id="cq" rows="2" placeholder="Например: сосед хранит мебель на лестничной площадке — куда жаловаться и что ему грозит?">${esc(CS.q)}</textarea><button class="btn pri" ${CS.busy ? 'disabled' : ''}>${ic('search')} Найти</button></form><div class="cmodes">${modes}</div></div><div class="cres">${body}</div></div>`;
}

// ---------- документы ----------
const DT = {
  complaint: { acc: 'жалобу', t: 'Жалоба', sub: 'на нарушение, бездействие', icon: 'edit', head: 'ЖАЛОБА', ask: 'На основании изложенного прошу:', ph: { to: 'Начальнику отдела надзорной деятельности по …\nили: В управляющую компанию «…»', body: 'Что произошло, где и когда, кто нарушает, что вы уже предпринимали', asks: 'провести проверку по указанному факту\nпринять меры к устранению нарушения\nо результатах сообщить мне письменно', sub: 'на нарушение требований пожарной безопасности' } },
  statement: { acc: 'заявление', t: 'Заявление', sub: 'просьба о действии или услуге', icon: 'list', head: 'ЗАЯВЛЕНИЕ', ask: 'Прошу:', ph: { to: 'Руководителю …', body: 'Кратко: кто вы, в связи с чем обращаетесь', asks: 'что именно нужно сделать', sub: '' } },
  request: { acc: 'обращение', t: 'Обращение / запрос', sub: 'получить ответ или разъяснение', icon: 'help', head: 'ОБРАЩЕНИЕ', ask: 'Прошу:', ph: { to: 'В администрацию …', body: 'Опишите вопрос и обстоятельства', asks: 'дать разъяснение по существу вопроса\nответ направить по указанному адресу', sub: '' } },
  claim: { acc: 'претензию', t: 'Претензия', sub: 'продавцу, исполнителю, УК', icon: 'coin', head: 'ПРЕТЕНЗИЯ', ask: 'На основании изложенного требую:', ph: { to: 'Генеральному директору ООО «…»\nадрес', body: 'Что, когда и где купили или заказали, сколько заплатили, в чём недостаток', asks: 'вернуть уплаченную сумму …\nили: устранить недостаток …', sub: '' } }
};
const newDraft = (type, keep) => ({ type, to: '', from: '', contacts: '', sub: '', body: '', asks: '', attach: '', sign: '', basis: [], basisText: '', ...(keep || {}), type });
const DR = () => { const L = LW(); if (!L.draft || !DT[L.draft.type]) L.draft = newDraft('complaint'); return L.draft; };
const basisLabel = l => { const d = lawDoc(l.doc), a = d && lawArt(l.doc, l.art); if (!d || !a) return l.label; const generic = !d.short || /^(Пост|Расп|Приказ|Указ)/.test(d.short); return `${unitOf(d)} ${a.n} ${generic ? '«' + d.title + '»' : d.short}`; };
const basisAuto = dr => dr.basis.length ? 'Правовое основание: ' + dr.basis.map(basisLabel).join('; ') + '.' : '';
const lines = s => String(s || '').split('\n').map(x => x.trim().replace(/^[-•\d.)\s]+/, '').replace(/[;.]$/, '')).filter(Boolean);
function docParts(dr) {
  const T = DT[dr.type], asks = lines(dr.asks), att = lines(dr.attach);
  return { T, to: dr.to.trim(), from: dr.from.trim(), contacts: dr.contacts.trim(), head: T.head, sub: dr.sub.trim(), body: dr.body.split(/\n+/).map(s => s.trim()).filter(Boolean), basis: (dr.basisText || basisAuto(dr)).trim(), asks, att, date: today().split('-').reverse().join('.'), sign: dr.sign.trim() };
}
function docHtml(dr, print) {
  const P = docParts(dr), nl = s => esc(s).replace(/\n/g, '<br>');
  return `<div class="a4${print ? ' print' : ''}"><div class="to">${nl(P.to || '…')}${P.from || P.contacts ? `<br><br>от ${nl(P.from)}${P.contacts ? ',<br>' + nl(P.contacts) : ''}` : ''}</div>
    <h1>${P.head}</h1>${P.sub ? `<h2>${esc(P.sub)}</h2>` : ''}
    ${P.body.map(p => `<p>${esc(p)}</p>`).join('') || (print ? '' : '<p class="ph">Суть обращения…</p>')}
    ${P.basis ? `<p class="${print ? '' : 'hl'}">${esc(P.basis)}</p>` : ''}
    ${P.asks.length ? `<p>${P.T.ask}</p><ol>${P.asks.map((a, i) => `<li>${esc(a)}${i < P.asks.length - 1 ? ';' : '.'}</li>`).join('')}</ol>` : ''}
    ${P.att.length ? `<p class="ni">Приложение: ${P.att.length === 1 ? esc(P.att[0]) + '.' : ''}</p>${P.att.length > 1 ? `<ol>${P.att.map(a => `<li>${esc(a)}.</li>`).join('')}</ol>` : ''}` : ''}
    <div class="sig"><span>${P.date}</span><span>__________ ${P.sign ? '/ ' + esc(P.sign) : ''}</span></div></div>`;
}
function docText(dr) {
  const P = docParts(dr), out = [];
  out.push(P.to); if (P.from) out.push('от ' + P.from + (P.contacts ? ',\n' + P.contacts : '')); out.push('', P.head); if (P.sub) out.push(P.sub); out.push('');
  P.body.forEach(p => out.push(p)); if (P.basis) out.push(P.basis);
  if (P.asks.length) { out.push(P.T.ask); P.asks.forEach((a, i) => out.push(`${i + 1}) ${a}${i < P.asks.length - 1 ? ';' : '.'}`)); }
  if (P.att.length) { out.push('', 'Приложение:'); P.att.forEach((a, i) => out.push(`${i + 1}. ${a}.`)); }
  out.push('', `${P.date}    __________ ${P.sign ? '/ ' + P.sign : ''}`);
  return out.join('\n');
}
function docsView() {
  const dr = DR(), T = DT[dr.type], mine = LW().tpls || [];
  const tl = `<aside class="tl"><h4>Шаблоны</h4>${Object.entries(DT).map(([k, t]) => `<button class="tpl ${dr.type === k && !dr.tpl ? 'on' : ''}" data-act="dtType" data-v="${k}"><span class="ti">${ic(t.icon)}</span><div><b>${t.t}</b><small>${t.sub}</small></div></button>`).join('')}
    ${mine.length ? `<h4>Мои шаблоны</h4>${mine.map(m => `<div class="tplw"><button class="tpl ${dr.tpl === m.id ? 'on' : ''}" data-act="dtMine" data-id="${m.id}"><span class="ti">${ic('copy')}</span><div><b>${esc(m.name)}</b><small>${DT[m.type].t}</small></div></button><button class="ib sm" data-act="dtMineDel" data-id="${m.id}" aria-label="Удалить шаблон">${ic('x')}</button></div>`).join('')}` : ''}
    <button class="btn sm ghost" data-act="dtNew">${ic('plus')} Новый документ</button></aside>`;
  const f = (id, label, ph, rows) => `<label class="f"><span>${label}</span>${rows ? `<textarea class="in" data-df="${id}" rows="${rows}" placeholder="${esc(ph || '')}">${esc(dr[id])}</textarea>` : `<input class="in" data-df="${id}" value="${esc(dr[id])}" placeholder="${esc(ph || '')}">`}</label>`;
  const form = `<div class="tf" id="dtform"><h3>${T.t}</h3>
    ${f('to', 'Кому', T.ph.to, 2)}
    <div class="row two">${f('from', 'От кого', 'Иванова Ивана Ивановича')}${f('contacts', 'Адрес и телефон', 'адрес, телефон, e-mail')}</div>
    ${f('sub', 'О чём — подзаголовок, необязательно', T.ph.sub)}
    ${f('body', 'Суть — своими словами', T.ph.body, 5)}
    ${aiReady() ? `<div class="aiw">${ic('spark')}<span>Помощник перепишет «Суть» деловым языком, факты не изменит</span><button class="btn sm" data-act="dtImprove">Улучшить текст</button></div>` : ''}
    <div class="f"><span>Правовое основание</span><div class="lchips"><span id="dt-basis">${dr.basis.map((l, i) => `<span class="lchip"><button type="button" data-act="lawChip" data-doc="${l.doc}" data-art="${l.art}">§ ${esc(l.label)}</button><button type="button" class="x" data-act="dtBasisDel" data-i="${i}" aria-label="Убрать">${ic('x')}</button></span>`).join('')}</span><button type="button" class="btn sm ghost" data-act="dtBasisAdd">${ic('plus')} Статья</button></div>${dr.basisText ? `<p class="hint">Абзац с основанием изменён помощником. <button class="lnk" data-act="dtBasisReset">Вернуть обычный</button></p>` : ''}</div>
    ${f('asks', T.ask.replace(/:$/, '') + ' — каждый пункт с новой строки', T.ph.asks, 3)}
    ${f('attach', 'Приложения — каждое с новой строки', 'фотография — 1 л.', 2)}
    ${f('sign', 'Подпись (Фамилия И. О.)', 'Иванов И. И.')}</div>`;
  const pv = `<div class="pv"><div class="pvb"><button class="btn sm" data-act="dtCopy">${ic('copy')} Копировать</button><button class="btn sm" data-act="dtWord">Word</button>${IS_PHONE ? '' : `<button class="btn sm" data-act="dtPdf">PDF</button>`}<button class="btn sm" data-act="dtSaveTpl">${ic('bookmark')} В мои шаблоны</button><button class="btn sm pri" data-act="dtTask">${ic('list')} Задача «ждать ответ»</button></div><div id="dtpv">${docHtml(dr)}</div><p class="hint" style="max-width:36rem">Шаблон — образец оформления, а не юридическая консультация. Перед отправкой проверьте адресата и требования.</p></div>`;
  return `<div class="split">${tl}${form}${pv}</div>`;
}
// ---------- Word (.docx) без сторонних библиотек ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name), data = enc.encode(text), crc = CRC(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    cd.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + data.length;
  }
  const cdl = cd.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdl, true); e.setUint32(16, off, true);
  const all = [...parts, ...cd, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, x) => s + x.length, 0)); let p = 0; all.forEach(x => { out.set(x, p); p += x.length; }); return out;
}
function docxOf(dr) {
  const P = docParts(dr), x = s => esc(s).replace(/'/g, '&apos;');
  const run = (t, b) => `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${b ? '<w:b/>' : ''}<w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const par = (t, o = {}) => `<w:p><w:pPr>${o.ind ? `<w:ind w:left="${o.ind}"/>` : ''}${o.first ? '<w:ind w:firstLine="709"/>' : ''}<w:jc w:val="${o.jc || 'both'}"/><w:spacing w:after="${o.after == null ? 60 : o.after}" w:line="276" w:lineRule="auto"/></w:pPr>${String(t).split('\n').map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(l, o.b)).join('')}</w:p>`;
  let b = par(P.to + (P.from ? `\n\nот ${P.from}${P.contacts ? ',\n' + P.contacts : ''}` : ''), { ind: 5000, jc: 'left', after: 360 });
  b += par(P.head, { jc: 'center', b: true, after: P.sub ? 0 : 240 }); if (P.sub) b += par(P.sub, { jc: 'center', after: 240 });
  P.body.forEach(t => { b += par(t, { first: true }); }); if (P.basis) b += par(P.basis, { first: true });
  if (P.asks.length) { b += par(P.T.ask, { first: true }); P.asks.forEach((a, i) => { b += par(`${i + 1}) ${a}${i < P.asks.length - 1 ? ';' : '.'}`, { first: true }); }); }
  if (P.att.length) { b += par('Приложение:', { after: 0 }); P.att.forEach((a, i) => { b += par(`${i + 1}. ${a}.`, { jc: 'left', after: 0 }); }); }
  b += `<w:p><w:pPr><w:spacing w:before="480"/><w:tabs><w:tab w:val="right" w:pos="9355"/></w:tabs></w:pPr>${run(P.date)}<w:r><w:tab/></w:r>${run('__________ ' + (P.sign ? '/ ' + P.sign : ''))}</w:p>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${b}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', doc]
  ]);
}
const docName = dr => `${DT[dr.type].t.split(' ')[0]}-${today()}`;
const u8b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const PRINT_CSS = '@page{size:A4;margin:0}body{margin:0}.a4{box-sizing:border-box;width:210mm;min-height:297mm;padding:20mm 15mm 20mm 30mm;font:14pt/1.4 "Times New Roman",serif;color:#000}.a4 .to{margin-left:50%;margin-bottom:12mm}.a4 h1{text-align:center;font-size:14pt;letter-spacing:.15em;margin:0 0 2mm}.a4 h2{text-align:center;font-size:14pt;font-weight:400;margin:0 0 6mm}.a4 p{margin:0 0 2mm;text-indent:12.5mm;text-align:justify}.a4 p.ni{text-indent:0}.a4 ol{margin:0 0 3mm 18mm;padding:0}.a4 .sig{display:flex;justify-content:space-between;margin-top:14mm}';

// ---------- вкладки раздела ----------
const lawTabs = () => `<div class="subtabs ltabs"><button class="${LF.mode === 'lib' || !LF.mode ? 'on' : ''}" data-act="lawMode" data-v="lib">${ic('scale')} Библиотека</button><button class="${LF.mode === 'consult' ? 'on' : ''}" data-act="lawMode" data-v="consult">${ic('spark')} Консультация</button><button class="${LF.mode === 'docs' ? 'on' : ''}" data-act="lawMode" data-v="docs">${ic('edit')} Документы</button></div>`;
(() => { // оборачиваем модуль «Право»: вкладки поверх библиотеки
  const m = MODULES.find(x => x.id === 'law'), libBar = m.bar, libRender = m.render;
  m.bar = () => LF.mode === 'consult' || LF.mode === 'docs' ? `<h1>Право</h1>${lawTabs()}` : libBar().replace('<h1>Право</h1>', `<h1>Право</h1>${lawTabs()}`);
  m.render = () => {
    if (LF.mode === 'consult') { if (!LAWC.size && LW().docs.length) lawLoad().then(() => UI.view === 'law' && render()); return consultView(); }
    if (LF.mode === 'docs') return docsView();
    return libRender();
  };
  const libAfter = m.after; m.after = () => { if (libAfter) libAfter(); if (LF.mode === 'consult' && CS.jump) { const el = $('#cs-' + CS.jump); if (el) el.scrollIntoView({ block: 'start' }); CS.jump = null; } };
})();
let dtT = null;
const dtPreview = () => { clearTimeout(dtT); dtT = setTimeout(() => { const p = $('#dtpv'); if (p) p.innerHTML = docHtml(DR()); save(); }, 120); };
const dtBasisDraw = () => { if (UI.view !== 'law' || LF.mode !== 'docs') return; const f = $('.tf'), y = f ? f.scrollTop : 0, s = $('#main .split'), sy = s ? s.scrollTop : 0; render(); if ($('.tf')) $('.tf').scrollTop = y; if ($('#main .split')) $('#main .split').scrollTop = sy; };
Object.assign(ACT, {
  lawMode: b => { LF.mode = b.dataset.v; render(); },
  csMode: b => { if (b.dataset.v === 'ai' && !aiReady()) { return openSettings('ai'); } CS.mode = b.dataset.v; render(); },
  csJump: b => { const el = $('#cs-' + b.dataset.v); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300); } },
  csDoc: b => {
    const L = lawLink(b.dataset.doc, b.dataset.art); if (!L) return;
    const R = CS.res, extra = R && R.answer ? R.items.filter(it => R.answer.used.includes(it.no) && !(it.d.id === L.doc && it.a.id === L.art)).map(it => lawLink(it.d.id, it.a.id)) : [];
    const cur = DR(), keep = { to: cur.to, from: cur.from, contacts: cur.contacts, sign: cur.sign };
    LW().draft = newDraft('complaint', { ...keep, body: R ? R.q : '', basis: [L, ...extra].filter(Boolean) }); LF.mode = 'docs'; save(); render();
    toast('Основание подставлено. Перепишите «Суть» под адресата — или нажмите «Улучшить текст»');
  },
  dtType: b => { const dr = DR(); dr.type = b.dataset.v; delete dr.tpl; save(); render(); },
  dtNew: () => { const cur = DR(); LW().draft = newDraft(cur.type, { from: cur.from, contacts: cur.contacts, sign: cur.sign }); save(); render(); },
  dtMine: b => { const t = (LW().tpls || []).find(x => x.id === b.dataset.id); if (!t) return; LW().draft = newDraft(t.type, { ...clone(t.fields), tpl: t.id }); save(); render(); },
  dtMineDel: b => { LW().tpls = (LW().tpls || []).filter(x => x.id !== b.dataset.id); save(); render(); },
  dtSaveTpl: () => {
    sheet(`<div class="lpick"><div class="shh"><b>Сохранить как мой шаблон</b><small>Все поля сохранятся — в следующий раз останется поменять детали</small></div><input class="in" id="dt-tname" value="${esc(DT[DR().type].t + (DR().to ? ' — ' + DR().to.split('\n')[0].slice(0, 30) : ''))}"><div class="shf"><span class="spacer"></span><button class="btn" data-act="shClose">Отмена</button><button class="btn pri" data-act="dtSaveTplGo">Сохранить</button></div></div>`);
    setTimeout(() => $('#dt-tname') && $('#dt-tname').select(), 40);
  },
  dtSaveTplGo: () => { const name = $('#dt-tname').value.trim() || DT[DR().type].t, dr = DR(); const { type, tpl, ...fields } = clone(dr); LW().tpls = LW().tpls || []; const id = uid(); LW().tpls.push({ id, name, type, fields }); dr.tpl = id; save(); closeSheet(); render(); toast('Шаблон сохранён'); },
  dtBasisAdd: () => lawPicker(L => { const dr = DR(); if (!dr.basis.some(x => x.doc === L.doc && x.art === L.art)) dr.basis.push(L); save(); dtBasisDraw(); }),
  dtBasisDel: b => { DR().basis.splice(+b.dataset.i, 1); save(); dtBasisDraw(); },
  dtBasisReset: () => { DR().basisText = ''; save(); dtBasisDraw(); },
  dtCopy: () => navigator.clipboard.writeText(docText(DR())).then(() => toast('Текст документа скопирован')).catch(() => toast('Не удалось скопировать')),
  dtWord: async () => {
    const dr = DR(), b64 = u8b64(docxOf(dr));
    if (hasApi && window.api.docSave) { const p = await window.api.docSave({ name: docName(dr), ext: 'docx', b64 }); if (p) toast('Документ Word сохранён'); }
    else { const a = document.createElement('a'); a.href = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + b64; a.download = docName(dr) + '.docx'; a.click(); }
  },
  dtPdf: async () => {
    const dr = DR(), html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${docHtml(dr, true)}</body></html>`;
    if (hasApi && window.api.docPdf) { const p = await window.api.docPdf({ html, name: docName(dr) }); if (p) toast('PDF сохранён'); }
    else { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); } }
  },
  dtTask: () => {
    const dr = DR(), T = DT[dr.type], who = (dr.to.split('\n')[0] || '').replace(/^(в|во)\s+/i, '').slice(0, 50);
    snapU(); const t = newTask({ title: `Ответ на ${T.acc}${who ? ': ' + who : ''}`, desc: `Отправлено ${today().split('-').reverse().join('.')}.\n\n${docText(dr).slice(0, 1500)}`, date: addDays(today(), 30), time: '10:00', remind: 0, laws: clone(dr.basis), col: firstCol().id });
    addTask(t); save(); toast('Задача создана: проверить ответ через 30 дней — срок можно изменить', false, { act: 'openTask', id: t.id, label: 'Открыть' });
  },
  dtImprove: async b => {
    const dr = DR(); if (!dr.body.trim()) return toast('Сначала напишите суть своими словами');
    b.disabled = true; b.textContent = 'Переписываю…';
    try {
      const r = await aiAsk([{ role: 'system', content: `Перепиши текст для официального документа (${DT[dr.type].t.toLowerCase()}) деловым языком от первого лица. Сохрани все факты, ничего не добавляй: никаких новых дат, адресов, имён, норм и требований. 1–3 абзаца. Только текст, без заголовков и обращений.` }, { role: 'user', content: dr.body }], 700, 0.3);
      if (r.text) { const prev = dr.body; dr.body = r.text.replace(/^["«]|["»]$/g, '').trim(); save(); render(); toast('Текст переписан', false, { act: 'dtUndoBody', id: '', label: 'Вернуть мой' }); UI.dtPrevBody = prev; }
    } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Улучшить текст'; }
  },
  dtUndoBody: () => { if (UI.dtPrevBody == null) return; DR().body = UI.dtPrevBody; UI.dtPrevBody = null; save(); render(); },
  aiTest: async () => {
    const out = $('#ai-res'); out.textContent = 'Проверяю…';
    try { const r = await aiAsk([{ role: 'user', content: 'Ответь одним словом: работает' }], 20, 0); out.innerHTML = `<span style="color:var(--ok)">Работает: «${esc(r.text.slice(0, 40))}»</span>`; }
    catch (e) { out.innerHTML = `<span style="color:var(--hi)">${esc(e.message)}</span>`; }
  }
});
document.addEventListener('submit', e => { if (e.target.id === 'csform') { e.preventDefault(); e.stopImmediatePropagation(); consultRun(); } }, true);
document.addEventListener('keydown', e => { if (e.target.id === 'cq' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); consultRun(); } }, true);
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.df) { DR()[t.dataset.df] = t.value; dtPreview(); }
  if (t.id === 'cq') CS.q = t.value;
  if (t.id === 'ai-key' || t.id === 'ai-folder') { AIC()[t.id === 'ai-key' ? 'key' : 'folder'] = t.value.trim(); save(); }
}, true);
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'ai-on') { AIC().on = t.checked; save(); drawSettings(); }
  if (t.name === 'ai-model') { AIC().model = t.value; save(); }
}, true);
