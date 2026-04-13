const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesApi', {
  getNotes:    ()       => ipcRenderer.invoke('get-notes'),
  saveNote:    (note)   => ipcRenderer.invoke('save-note', note),
  deleteNote:  (id)     => ipcRenderer.invoke('delete-note', id),
  closeWindow: ()       => ipcRenderer.send('close-notes-window'),
});
