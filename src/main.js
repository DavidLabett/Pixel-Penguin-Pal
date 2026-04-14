const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let tray = null;
let settingsWin = null;
let notesWin = null;

// ---------------------------------------------------------------------------
// Pomodoro settings
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sleepMinutes: 5,
  flipHorizontal: false,
  soundEnabled: true,
};

function pomodoroSettingsPath() {
  return path.join(app.getPath('userData'), 'pomodoro-settings.json');
}

function loadPomodoroSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(pomodoroSettingsPath(), 'utf8'));
    return {
      workMinutes:       Number(data.workMinutes)       || DEFAULT_SETTINGS.workMinutes,
      shortBreakMinutes: Number(data.shortBreakMinutes) || DEFAULT_SETTINGS.shortBreakMinutes,
      longBreakMinutes:  Number(data.longBreakMinutes)  || DEFAULT_SETTINGS.longBreakMinutes,
      sleepMinutes:      Number(data.sleepMinutes)      || DEFAULT_SETTINGS.sleepMinutes,
      flipHorizontal:    data.flipHorizontal === true,
      soundEnabled:      data.soundEnabled !== false,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function normalizeSettingsForSave(s) {
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n)) || lo));
  return {
    workMinutes:       clamp(s.workMinutes, 1, 180),
    shortBreakMinutes: clamp(s.shortBreakMinutes, 1, 120),
    longBreakMinutes:  clamp(s.longBreakMinutes, 1, 120),
    sleepMinutes:      clamp(s.sleepMinutes, 1, 60),
    flipHorizontal:    Boolean(s.flipHorizontal),
    soundEnabled:      s.soundEnabled !== false,
  };
}

function savePomodoroSettingsToDisk(settings) {
  const normalized = normalizeSettingsForSave(settings);
  fs.mkdirSync(path.dirname(pomodoroSettingsPath()), { recursive: true });
  fs.writeFileSync(pomodoroSettingsPath(), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

// ---------------------------------------------------------------------------
// Notes persistence
// ---------------------------------------------------------------------------
let notes = [];

function notesFilePath() {
  return path.join(app.getPath('userData'), 'notes.json');
}

function loadNotes() {
  try {
    const raw = JSON.parse(fs.readFileSync(notesFilePath(), 'utf8'));
    notes = Array.isArray(raw) ? raw : [];
  } catch { notes = []; }
}

function saveNotesToDisk() {
  fs.mkdirSync(path.dirname(notesFilePath()), { recursive: true });
  fs.writeFileSync(notesFilePath(), JSON.stringify(notes, null, 2), 'utf8');
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shouldFire(note, now) {
  if (!note.timer) return false;
  if (note.timer.type === 'once') {
    const target = new Date(note.timer.datetime).getTime();
    return Math.abs(now.getTime() - target) < 60_000;
  }
  if (note.timer.type === 'recurring') {
    if (!note.timer.days.includes(now.getDay())) return false;
    const [hh, mm] = note.timer.time.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return Math.abs(nowMins - (hh * 60 + mm)) <= 1;
  }
  return false;
}

function checkNotes() {
  const now = new Date();
  const todayStr = localDateStr(now);
  let dirty = false;

  notes.forEach(note => {
    if (!note.timer) return;
    if (note.timer.type === 'recurring' && note.lastFiredDate === todayStr) return;
    if (shouldFire(note, now)) {
      if (note.timer.type === 'once') note.timer = null;
      note.lastFiredDate = todayStr;
      dirty = true;
      if (win && !win.isDestroyed()) win.webContents.send('note-alert', { id: note.id, text: note.text });
    }
  });

  if (dirty) saveNotesToDisk();
}

// ---------------------------------------------------------------------------
// Typing speed tracking
// ---------------------------------------------------------------------------
const TYPING_WINDOW_MS = 1000;
const FAST_TYPING_THRESHOLD = 7;
const TYPING_IDLE_TIMEOUT_MS = 900;

let sleepIdleMs = DEFAULT_SETTINGS.sleepMinutes * 60_000; // updated when settings load/save

let keystampBuffer = [];
let typingIdleTimer = null;
let lastTypingState = 'idle';
let sleepTimer = null;
let isSleepingMain = false;

function sendSleepState(sleeping) {
  if (sleeping === isSleepingMain) return;
  isSleepingMain = sleeping;
  if (win && !win.isDestroyed()) win.webContents.send('sleep-update', sleeping);
}

function applySleepMinutes(minutes) {
  sleepIdleMs = Math.max(1, Math.round(Number(minutes) || DEFAULT_SETTINGS.sleepMinutes)) * 60_000;
  // Restart the sleep countdown with the new duration
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => sendSleepState(true), sleepIdleMs);
}

function computeTypingState() {
  const now = Date.now();
  keystampBuffer = keystampBuffer.filter(t => now - t < TYPING_WINDOW_MS);
  const kps = keystampBuffer.length;
  if (kps === 0) return 'idle';
  if (kps >= FAST_TYPING_THRESHOLD) return 'typing_fast';
  return 'typing';
}

function setupKeyboardHook() {
  let uiohook;
  try { uiohook = require('uiohook-napi'); }
  catch (err) { console.error('uiohook-napi failed to load:', err.message); return; }

  uiohook.uIOhook.on('keydown', () => {
    keystampBuffer.push(Date.now());

    // typing idle timeout
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = setTimeout(() => {
      keystampBuffer = [];
      sendTypingState('idle');
    }, TYPING_IDLE_TIMEOUT_MS);

    // sleep detection: any keypress wakes, reset the sleep timer
    if (sleepTimer) clearTimeout(sleepTimer);
    sendSleepState(false);
    sleepTimer = setTimeout(() => sendSleepState(true), sleepIdleMs);

    const state = computeTypingState();
    if (state !== lastTypingState) {
      lastTypingState = state;
      sendTypingState(state);
    }
  });

  uiohook.uIOhook.start();

  // Start sleep timer immediately so going idle after launch eventually sleeps
  sleepTimer = setTimeout(() => sendSleepState(true), sleepIdleMs);
}

function sendTypingState(state) {
  if (win && !win.isDestroyed()) win.webContents.send('typing-update', state);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 128,
    height: 150,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setAlwaysOnTop(true, 'screen-saver');

  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win.setPosition(width - 160, height - 170);
}

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  if (!win || win.isDestroyed()) return;

  settingsWin = new BrowserWindow({
    parent: win,
    modal: true,
    width: 340,
    height: 500,
    resizable: false,
    autoHideMenuBar: true,
    title: 'Settings',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function openNotesWindow() {
  if (notesWin && !notesWin.isDestroyed()) { notesWin.focus(); return; }

  notesWin = new BrowserWindow({
    width: 380,
    height: 500,
    resizable: true,
    autoHideMenuBar: true,
    title: 'Notes',
    webPreferences: {
      preload: path.join(__dirname, 'notes-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  notesWin.loadFile(path.join(__dirname, 'notes.html'));
  notesWin.on('closed', () => { notesWin = null; });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.on('set-ignore-mouse-events', (e, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('move-window', (e, { dx, dy }) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});

let savedYBeforeNoteExpand = null;

ipcMain.on('resize-window', (e, { width, height }) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const [, oldH] = win.getSize();
  let newY;
  if (height > oldH) {
    // Expanding upward — save the current top so we can restore it exactly later
    savedYBeforeNoteExpand = y;
    newY = y - (height - oldH);
  } else if (savedYBeforeNoteExpand !== null) {
    // Collapsing — restore the exact pre-note top position
    newY = savedYBeforeNoteExpand;
    savedYBeforeNoteExpand = null;
  } else {
    newY = y - (height - oldH);
  }
  // Use setBounds for an atomic size+position update (avoids two-step flicker)
  win.setBounds({ x, y: newY, width, height });
});

let pomodoroState = { phase: 'stopped', label: 'Stopped' };

ipcMain.on('pomodoro-state', (e, state) => { pomodoroState = state; rebuildTrayMenu(); });
ipcMain.on('pomodoro-action', (e, action) => {
  if (win && !win.isDestroyed()) win.webContents.send('pomodoro-action', action);
});

ipcMain.handle('get-pomodoro-settings', () => loadPomodoroSettings());
ipcMain.handle('save-pomodoro-settings', (e, settings) => {
  try {
    const saved = savePomodoroSettingsToDisk(settings);
    if (win && !win.isDestroyed()) win.webContents.send('pomodoro-settings-changed', saved);
    applySleepMinutes(saved.sleepMinutes);
    return { ok: true, settings: saved };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.on('close-settings-window', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.close();
});

ipcMain.on('show-context-menu', (e, { x, y }) => {
  if (!win || win.isDestroyed()) return;
  Menu.buildFromTemplate(companionMenuTemplate()).popup({ window: win, x: Math.round(x), y: Math.round(y) });
});

// Notes IPC
ipcMain.handle('get-notes', () => notes);

ipcMain.handle('save-note', (e, note) => {
  try {
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx >= 0) {
      notes[idx] = { ...notes[idx], ...note };
    } else {
      notes.push({ lastFiredDate: null, ...note });
    }
    saveNotesToDisk();
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('delete-note', (e, id) => {
  notes = notes.filter(n => n.id !== id);
  saveNotesToDisk();
  return { ok: true };
});

ipcMain.on('dismiss-note', () => { /* firing/dedup already handled in checkNotes */ });
ipcMain.on('open-notes-window', () => openNotesWindow());

ipcMain.on('close-notes-window', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.close();
});

// ---------------------------------------------------------------------------
// Tray / context menu
// ---------------------------------------------------------------------------
function companionMenuTemplate() {
  const phase = pomodoroState?.phase ?? 'stopped';
  let primaryLabel, primaryAction;
  if (phase === 'working' || phase === 'break') { primaryLabel = 'Pause';  primaryAction = 'pause'; }
  else if (phase === 'paused')                  { primaryLabel = 'Resume'; primaryAction = 'start'; }
  else                                          { primaryLabel = 'Start';  primaryAction = 'start'; }

  return [
    { label: `Pomodoro: ${pomodoroState?.label ?? 'Stopped'}`, enabled: false },
    { type: 'separator' },
    { label: primaryLabel, click: () => sendPomodoroAction(primaryAction) },
    { label: 'Reset',      click: () => sendPomodoroAction('reset') },
    { type: 'separator' },
    { label: 'Notes…',    click: () => openNotesWindow() },
    { label: 'Settings…', click: () => openSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'penguin', 'spritesheets', 'Idle.png');
  let icon;
  try {
    const raw = nativeImage.createFromPath(iconPath);
    icon = raw.crop({ x: 0, y: 0, width: 64, height: 64 }).resize({ width: 16, height: 16 });
  } catch { icon = nativeImage.createEmpty(); }

  tray = new Tray(icon);
  tray.setToolTip('Companion Widget');
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate(companionMenuTemplate()));
}

function sendPomodoroAction(action) {
  if (win && !win.isDestroyed()) win.webContents.send('pomodoro-action', action);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  loadNotes();
  // Apply persisted sleep setting before the keyboard hook starts
  const savedSettings = loadPomodoroSettings();
  sleepIdleMs = savedSettings.sleepMinutes * 60_000;
  createWindow();
  createTray();
  setupKeyboardHook();
  setInterval(checkNotes, 30_000);
});

app.on('window-all-closed', () => app.quit());
