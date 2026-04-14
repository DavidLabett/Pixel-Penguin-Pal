const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  // Main → Renderer
  onTypingUpdate:           (cb) => ipcRenderer.on('typing-update',            (_e, s)  => cb(s)),
  onPomodoroAction:         (cb) => ipcRenderer.on('pomodoro-action',           (_e, a)  => cb(a)),
  onPomodoroSettingsChanged:(cb) => ipcRenderer.on('pomodoro-settings-changed', (_e, s)  => cb(s)),
  onSleepUpdate:            (cb) => ipcRenderer.on('sleep-update',              (_e, v)  => cb(v)),
  onNoteAlert:              (cb) => ipcRenderer.on('note-alert',                (_e, n)  => cb(n)),

  // Renderer → Main
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  moveWindow:        (dx, dy)   => ipcRenderer.send('move-window',       { dx, dy }),
  resizeWindow:      (w, h)     => ipcRenderer.send('resize-window',     { width: w, height: h }),
  sendPomodoroState: (state)    => ipcRenderer.send('pomodoro-state',    state),
  showContextMenu:   (x, y)     => ipcRenderer.send('show-context-menu', { x, y }),
  dismissNote:       ()         => ipcRenderer.send('dismiss-note'),
  openNotesWindow:   ()         => ipcRenderer.send('open-notes-window'),

  // Renderer → Main (invoke)
  getPomodoroSettings: () => ipcRenderer.invoke('get-pomodoro-settings'),
});
