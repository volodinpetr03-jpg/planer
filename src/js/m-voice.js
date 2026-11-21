'use strict';
// ============================================================
//  Этап 7. Голосовой ввод: запись с микрофона → Yandex SpeechKit (API v1, LPCM 16 кГц, до 25 с).
//  Ключ и каталог — те же, что у помощника YandexGPT. Запрос идёт через основной процесс (компьютер)
//  или нативный HTTP (Android); адрес распознавания фиксирован.
// ============================================================
ICONS.mic = '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/>';
const VC = { rec: null, target: null, busy: false };
const V_RATE = 16000, V_MAX = 25;
const voiceOk = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
const voiceReady = () => hasApi && window.api.stt && AIC().key && AIC().folder;
const voiceOn = () => !!D && D.settings.voice !== false && voiceOk();
let vCtx = null;
const vAudio = () => { if (!vCtx) vCtx = new (window.AudioContext || window.webkitAudioContext)(); if (vCtx.state === 'suspended') vCtx.resume().catch(() => {}); return vCtx; };
function vPcm16(chunks, inRate) {
  const len = chunks.reduce((s, c) => s + c.length, 0), all = new Float32Array(len); let o = 0; chunks.forEach(c => { all.set(c, o); o += c.length; });
  const ratio = inRate / V_RATE, n = Math.floor(len / ratio), out = new DataView(new ArrayBuffer(n * 2));
  for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b; j++) s += all[j]; const v = Math.max(-1, Math.min(1, b > a ? s / (b - a) : all[a] || 0)); out.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Uint8Array(out.buffer);
}
// запись сама заканчивается после паузы в речи (1,4 с), через 25 с или по повторному нажатию
async function vRecord(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const ac = vAudio(), src = ac.createMediaStreamSource(stream), proc = ac.createScriptProcessor(4096, 1, 1), chunks = [];
  let total = 0, noise = null, heard = false, quiet = 0, fin = false, res;
  const done = new Promise(r => { res = r; });
  const finish = () => { if (fin) return; fin = true; try { proc.disconnect(); src.disconnect(); } catch (e) {} stream.getTracks().forEach(t => t.stop()); res({ pcm: vPcm16(chunks, ac.sampleRate), sec: total / ac.sampleRate, heard }); };
  proc.onaudioprocess = e => {
    if (fin) return; const d = new Float32Array(e.inputBuffer.getChannelData(0)); chunks.push(d); total += d.length;
    let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; const rms = Math.sqrt(s / d.length), sec = total / ac.sampleRate;
    if (sec < 0.4) noise = noise == null ? rms : Math.min(noise, rms);
    const thr = Math.max(0.012, (noise || 0) * 3); if (rms > thr) { heard = true; quiet = 0; } else quiet += d.length / ac.sampleRate;
    if (onLevel) onLevel(Math.min(1, rms / (thr * 4)));
    if ((heard && quiet > 1.4) || sec >= V_MAX || (!heard && sec > 8)) finish();
  };
  src.connect(proc); proc.connect(ac.destination);
  return { stop: finish, done };
}
function vErr(r) {
  let j = {}; try { j = JSON.parse(r.text || '{}'); } catch (e) {}
  const msg = j.error_message || (j.error && (j.error.message || j.error)) || j.message || '';
  if (r.status === 0) return 'Нет связи с SpeechKit — проверьте интернет.';
  if (r.status === 401 || r.status === 403) return 'SpeechKit не принял ключ. Сервисному аккаунту нужна роль ai.speechkit-stt.user (или ai.editor).';
  if (r.status === 402) return 'В Yandex Cloud закончились средства.';
  if (r.status === 429) return 'Слишком много запросов к SpeechKit — подождите минуту.';
  return `SpeechKit: ошибка ${r.status}${msg ? ': ' + String(msg).slice(0, 140) : ''}.`;
}
async function vRecognize(pcm) {
  if (!pcm || pcm.length < V_RATE * 2 * 0.3) return { ok: false, error: 'Слишком коротко — скажите ещё раз.' };
  const r = await window.api.stt({ key: AIC().key, folder: AIC().folder, audio: pcm.length > 1000000 ? pcm.subarray(0, 1000000) : pcm });
  if (!r || !(r.status >= 200 && r.status < 300)) return { ok: false, error: vErr(r || { status: 0 }) };
  let j = {}; try { j = JSON.parse(r.text); } catch (e) {}
  const text = String(j.result || '').trim();
  return text ? { ok: true, text } : { ok: false, error: 'Не расслышал — скажите ещё раз, ближе к микрофону.' };
}
// вставить распознанный текст в поле (в позицию курсора, с пробелом)
function vInsert(el, text) {
  if (!el) return;
  const v = el.value, s = el.selectionStart != null ? el.selectionStart : v.length, e = el.selectionEnd != null ? el.selectionEnd : v.length;
  const before = v.slice(0, s), sp = before && !/[\s\n]$/.test(before) ? ' ' : '';
  let t = text; if (!before.trim() || /[.!?\n]\s*$/.test(before)) t = t.charAt(0).toUpperCase() + t.slice(1);
  el.focus(); el.setRangeText(sp + t, s, e, 'end'); el.dispatchEvent(new Event('input', { bubbles: true }));
}
const micBtn = (target, cls = '') => voiceOn() ? `<button type="button" class="ib mic ${cls}" data-act="mic" data-t="${target}" title="Сказать голосом" aria-label="Голосовой ввод">${ic('mic')}</button>` : '';
async function micGo(b) {
  if (VC.rec) { VC.rec.stop(); return; }
  if (VC.busy) return;
  if (!voiceReady()) { toast('Голосовой ввод работает через Yandex SpeechKit с ключом помощника: Настройки → Помощник'); return; }
  const el = $('#' + b.dataset.t); if (!el) return;
  try { VC.rec = await vRecord(l => b.style.setProperty('--lv', l.toFixed(2))); }
  catch (e) { VC.rec = null; toast(/denied|NotAllowed|Permission/i.test(String(e && (e.name || e.message))) ? 'Нет доступа к микрофону — разрешите его в настройках' : 'Микрофон недоступен'); return; }
  b.classList.add('rec'); toast('Говорите… Нажмите ещё раз, чтобы закончить');
  const { pcm, heard } = await VC.rec.done; VC.rec = null; b.classList.remove('rec'); b.style.removeProperty('--lv');
  if (!heard) { toast('Ничего не услышал'); return; }
  VC.busy = true; b.classList.add('busy');
  try { const r = await vRecognize(pcm); if (r.ok) { vInsert($('#' + b.dataset.t) || el, r.text); toast('Распознано'); } else toast(r.error); }
  finally { VC.busy = false; b.classList.remove('busy'); }
}
Object.assign(ACT, { mic: b => micGo(b) });
// --- кнопки микрофона в полях ввода ---
const _openQuick = openQuick;
openQuick = function (prefill, base) { _openQuick(prefill, base); const i = $('#qk'); if (i && voiceOn()) i.insertAdjacentHTML('afterend', micBtn('qk')); };
(() => { // заметки: кнопка на панели форматирования
  const m = MODULES.find(x => x.id === 'notes'); if (!m) return; const r = m.render;
  m.render = function () { let h = r.call(this); if (NOF.edit && voiceOn()) h = h.replace('<div class="ntb">', '<div class="ntb">' + micBtn('n-body')); return h; };
})();
// комментарии и вопрос консультации — добавляем кнопку, когда поле появилось
new MutationObserver(() => {
  if (!voiceOn()) return;
  const cm = $('#cm-in'); if (cm && !cm.parentElement.querySelector('.mic')) cm.insertAdjacentHTML('afterend', micBtn('cm-in'));
  const cq = $('#cq'); if (cq && !cq.parentElement.querySelector('.mic')) cq.insertAdjacentHTML('afterend', micBtn('cq', 'cqmic'));
  const ft = $('#f-title'); if (ft && !ft.parentElement.querySelector('.mic')) { ft.parentElement.classList.add('hasmic'); ft.insertAdjacentHTML('afterend', micBtn('f-title', 'inmic')); }
}).observe(document.body, { childList: true, subtree: true });
