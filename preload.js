// Мост между окном и системой: только нужные функции, без доступа к Node.js
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: d => ipcRenderer.invoke('data:save', d),
  saveSync: d => ipcRenderer.sendSync('data:saveSync', d),
  reset: () => ipcRenderer.invoke('data:reset'),
  info: () => ipcRenderer.invoke('app:info'),
  setAutostart: on => ipcRenderer.invoke('app:autostart', on),
  openFolder: () => ipcRenderer.invoke('data:folder'),
  exportData: json => ipcRenderer.invoke('data:export', json),
  importData: () => ipcRenderer.invoke('data:import'),
  setZoom: f => webFrame.setZoomFactor(f),
  titlebar: o => ipcRenderer.send('app:titlebar', o),
  quit: () => ipcRenderer.send('app:quit'),
  lock: {
    status: () => ipcRenderer.invoke('lock:status'),
    unlock: pw => ipcRenderer.invoke('lock:unlock', pw),
    recover: code => ipcRenderer.invoke('lock:recover', code),
    verify: pw => ipcRenderer.invoke('lock:verify', pw),
    enable: o => ipcRenderer.invoke('lock:enable', o),
    change: o => ipcRenderer.invoke('lock:change', o),
    setAfterRecovery: o => ipcRenderer.invoke('lock:setAfterRecovery', o),
    newCode: pw => ipcRenderer.invoke('lock:newCode', pw),
    disable: pw => ipcRenderer.invoke('lock:disable', pw),
    lockUi: () => ipcRenderer.send('lock:ui')
  },
  ai: req => ipcRenderer.invoke('ai-chat', req),
  netGet: url => ipcRenderer.invoke('net-get', url),
  notify: o => ipcRenderer.send('notify', o),
  docPdf: o => ipcRenderer.invoke('doc-pdf', o),
  docSave: o => ipcRenderer.invoke('doc-save', o),
  files: {
    pick: () => ipcRenderer.invoke('files:pick'),
    setRoot: p => ipcRenderer.invoke('files:setRoot', p),
    list: d => ipcRenderer.invoke('files:list', d),
    read: f => ipcRenderer.invoke('files:read', f),
    write: (f, c) => ipcRenderer.invoke('files:write', f, c),
    mkdir: d => ipcRenderer.invoke('files:mkdir', d),
    hasAccess: async () => true,
    askAccess: async () => {}
  },
  focusAlarm: o => ipcRenderer.send('focus:alarm', o),
  focusCancel: () => ipcRenderer.send('focus:cancel'),
  on: (ch, fn) => {
    if (!['open-task', 'new-task', 'reminder', 'notified', 'open-pay', 'reminder-pay', 'reminder-date', 'reminder-hab', 'lock-now'].includes(ch)) return;
    ipcRenderer.on(ch, (e, arg) => fn(arg));
  }
});
