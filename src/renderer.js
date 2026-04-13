import { SpriteAnimator } from './animator.js';
import { PomodoroTimer } from './pomodoro.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const canvas       = document.getElementById('sprite-canvas');
const timerLabel   = document.getElementById('timer-label');
const zzzOverlay   = document.getElementById('zzz-overlay');
const noteOverlay  = document.getElementById('note-overlay');
const noteTextEl   = document.getElementById('note-text');
const noteDismiss  = document.getElementById('note-dismiss');

const SPRITES_PATH = '../assets/penguin/spritesheets';
const WINDOW_W     = 128;
const WINDOW_H_DEFAULT = 150;
const WINDOW_H_NOTE    = 260;

const animator = new SpriteAnimator(canvas, SPRITES_PATH);

// ---------------------------------------------------------------------------
// Animation states
// ---------------------------------------------------------------------------
const STATE = {
  IDLE:        'idle',
  TYPING:      'typing',
  TYPING_FAST: 'typing_fast',
  BREAK:       'break',
  RINGING:     'ringing',
  SLEEP:       'sleep',
};

// Top-level flags (each blocks updateAnimState when true)
let noteAlertActive       = false;
let deathJumpSequenceActive = false;
let easterEggActive       = false;

let animState      = null;
let typingState    = 'idle';
let pomodoroPhase  = 'stopped';
let isSleeping     = false;

// ---------------------------------------------------------------------------
// Idle variants
// ---------------------------------------------------------------------------
const IDLE_VARIANTS   = ['Idle', 'Idle', 'Idle', 'Crouch', 'Turn'];
const SHORT_IDLE_MIN  = 1000;
const SHORT_IDLE_MAX  = 3000;
const LONG_IDLE_MIN   = 8000;
const LONG_IDLE_MAX   = 15000;

let idleVariantTimer  = null;
let currentIdleSheet  = 'Idle';

function pickIdleVariant() {
  currentIdleSheet = IDLE_VARIANTS[Math.floor(Math.random() * IDLE_VARIANTS.length)];
  animator.play(currentIdleSheet, true);
  scheduleNextIdleVariant();
}

function scheduleNextIdleVariant() {
  if (idleVariantTimer) clearTimeout(idleVariantTimer);
  const isShort = currentIdleSheet === 'Crouch' || currentIdleSheet === 'Turn';
  const min = isShort ? SHORT_IDLE_MIN : LONG_IDLE_MIN;
  const max = isShort ? SHORT_IDLE_MAX : LONG_IDLE_MAX;
  idleVariantTimer = setTimeout(() => {
    if (animState === STATE.IDLE) pickIdleVariant();
  }, min + Math.random() * (max - min));
}

function clearIdleVariant() {
  if (idleVariantTimer) { clearTimeout(idleVariantTimer); idleVariantTimer = null; }
}

// ---------------------------------------------------------------------------
// zzz overlay
// ---------------------------------------------------------------------------
function setZzz(visible) {
  zzzOverlay.classList.toggle('visible', visible);
}

// ---------------------------------------------------------------------------
// State resolution (priority order)
// ---------------------------------------------------------------------------
function resolveAnimState() {
  // noteAlertActive handled separately (highest priority guard in updateAnimState)
  if (pomodoroPhase === 'ringing') return STATE.RINGING;
  if (pomodoroPhase === 'break')   return STATE.BREAK;
  if (isSleeping)                  return STATE.SLEEP;
  if (typingState === 'typing_fast') return STATE.TYPING_FAST;
  if (typingState === 'typing')      return STATE.TYPING;
  return STATE.IDLE;
}

function applyAnimState(newState) {
  if (newState === animState) return;
  animState = newState;
  clearIdleVariant();
  animator.onCycleComplete = null;
  setZzz(false);

  switch (newState) {
    case STATE.RINGING:
      animator.play('Hurt', true);       // loop for 10 s (RINGING_DURATION_MS)
      break;
    case STATE.BREAK:
      animator.play('Spin_Attack', true);
      break;
    case STATE.SLEEP:
      animator.play('Death', true);
      setZzz(true);
      break;
    case STATE.TYPING_FAST:
      animator.play('Roll', true);
      break;
    case STATE.TYPING:
      animator.play('Walk', true);
      break;
    case STATE.IDLE:
    default:
      pickIdleVariant();
      break;
  }
}

function updateAnimState() {
  if (noteAlertActive)        return;
  if (deathJumpSequenceActive) return;
  if (easterEggActive)        return;
  applyAnimState(resolveAnimState());
}

// ---------------------------------------------------------------------------
// Fast-typing death sequence (7 s → Death 2 s → Jump → resume)
// ---------------------------------------------------------------------------
const FAST_TYPING_STREAK_MS = 7_000;
const DEATH_HOLD_MS         = 2000;

let deathHoldTimeout    = null;
let fastTypingAccumMs   = 0;
let lastFastTypingSample = null;

function cancelDeathJumpSequence() {
  if (!deathJumpSequenceActive && !deathHoldTimeout) return;
  deathJumpSequenceActive = false;
  if (deathHoldTimeout) { clearTimeout(deathHoldTimeout); deathHoldTimeout = null; }
  animator.onCycleComplete = null;
  fastTypingAccumMs = 0;
  lastFastTypingSample = null;
}

function endDeathJumpSequence() {
  deathJumpSequenceActive = false;
  deathHoldTimeout = null;
  animator.onCycleComplete = null;
  fastTypingAccumMs = 0;
  lastFastTypingSample = null;
  animState = null;
  updateAnimState();
}

function startDeathJumpPhase() {
  clearIdleVariant();
  setZzz(false);
  animator.onCycleComplete = null;
  animator.play('Death', true);
  deathHoldTimeout = setTimeout(() => {
    deathHoldTimeout = null;
    animator.play('Jump', false);
    animator.onCycleComplete = () => { animator.onCycleComplete = null; endDeathJumpSequence(); };
  }, DEATH_HOLD_MS);
}

function startDeathJumpSequence() {
  if (deathJumpSequenceActive) return;
  if (resolveAnimState() !== STATE.TYPING_FAST) return;
  deathJumpSequenceActive = true;
  fastTypingAccumMs = 0;
  lastFastTypingSample = null;
  startDeathJumpPhase();
}

setInterval(() => {
  if (deathJumpSequenceActive) return;
  if (resolveAnimState() !== STATE.TYPING_FAST) {
    fastTypingAccumMs = 0;
    lastFastTypingSample = null;
    return;
  }
  const now = performance.now();
  if (lastFastTypingSample === null) lastFastTypingSample = now;
  fastTypingAccumMs += now - lastFastTypingSample;
  lastFastTypingSample = now;
  if (fastTypingAccumMs >= FAST_TYPING_STREAK_MS) {
    fastTypingAccumMs = 0;
    lastFastTypingSample = null;
    startDeathJumpSequence();
  }
}, 100);

// ---------------------------------------------------------------------------
// Easter egg — double-click → Spin_Attack once
// ---------------------------------------------------------------------------
function startEasterEgg() {
  easterEggActive = true;
  clearIdleVariant();
  setZzz(false);
  animator.onCycleComplete = null;
  animState = null; // allow force-play even if break is showing Spin_Attack
  animator.play('Spin_Attack', false, true); // force restart
  animator.onCycleComplete = () => {
    animator.onCycleComplete = null;
    easterEggActive = false;
    animState = null;
    updateAnimState();
  };
}

// ---------------------------------------------------------------------------
// Note alert queue
// ---------------------------------------------------------------------------
let noteAlertQueue = [];

function showNextNote() {
  if (noteAlertQueue.length === 0) {
    noteOverlay.classList.remove('active');
    window.companion.resizeWindow(WINDOW_W, WINDOW_H_DEFAULT);
    noteAlertActive = false;
    animState = null;
    updateAnimState();
    return;
  }

  const note = noteAlertQueue.shift();
  noteTextEl.textContent = note.text;
  noteOverlay.classList.add('active');
  window.companion.resizeWindow(WINDOW_W, WINDOW_H_NOTE);

  noteAlertActive = true;
  clearIdleVariant();
  setZzz(false);
  animator.onCycleComplete = null;
  animState = null;
  animator.play('Jump', true);
}

noteDismiss.addEventListener('click', () => {
  window.companion.dismissNote();
  showNextNote();
});

window.companion.onNoteAlert((note) => {
  noteAlertQueue.push(note);
  if (!noteAlertActive) showNextNote();
});

// ---------------------------------------------------------------------------
// Pomodoro
// ---------------------------------------------------------------------------
let pomodoro = null;

function onPomodoroState(state) {
  pomodoroPhase = state.phase;

  if (state.phase === 'ringing' || state.phase === 'break') {
    cancelDeathJumpSequence();
    animState = null;
  }

  const showTimer =
    state.phase === 'working' ||
    state.phase === 'break'   ||
    state.phase === 'paused'  ||
    state.phase === 'ringing';

  timerLabel.textContent = state.label;
  timerLabel.classList.toggle('visible', state.phase !== 'stopped' && showTimer);
  window.companion.sendPomodoroState({ phase: state.phase, label: state.label });

  updateAnimState();
}

window.companion.onPomodoroAction((action) => {
  if (!pomodoro) return;
  if (action === 'start')      pomodoro.start();
  else if (action === 'pause') pomodoro.pause();
  else if (action === 'reset') pomodoro.reset();
});

// ---------------------------------------------------------------------------
// Typing + sleep IPC
// ---------------------------------------------------------------------------
window.companion.onTypingUpdate((bucket) => {
  typingState = bucket;
  updateAnimState();
});

window.companion.onSleepUpdate((sleeping) => {
  isSleeping = sleeping;
  if (!sleeping && animState === STATE.SLEEP) animState = null;
  updateAnimState();
});

// ---------------------------------------------------------------------------
// Drag + click + double-click
// ---------------------------------------------------------------------------
let dragStart       = null;
let hasDragged      = false;
let singleClickTimer = null;
const DRAG_THRESHOLD = 4;

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragStart  = { x: e.screenX, y: e.screenY };
  hasDragged = false;
});

document.addEventListener('mousemove', (e) => {
  if (!dragStart) return;
  const dx = e.screenX - dragStart.x;
  const dy = e.screenY - dragStart.y;
  if (!hasDragged && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
    hasDragged = true;
  }
  if (hasDragged) {
    window.companion.moveWindow(dx, dy);
    dragStart = { x: e.screenX, y: e.screenY };
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) { dragStart = null; return; }
  if (!hasDragged) {
    // Delay to allow dblclick to cancel if it follows quickly
    if (singleClickTimer) clearTimeout(singleClickTimer);
    singleClickTimer = setTimeout(() => {
      singleClickTimer = null;
      if (pomodoro && !noteAlertActive) pomodoro.toggle();
    }, 280);
  }
  dragStart  = null;
  hasDragged = false;
});

document.addEventListener('dblclick', () => {
  if (singleClickTimer) { clearTimeout(singleClickTimer); singleClickTimer = null; }
  if (!easterEggActive && !noteAlertActive) startEasterEgg();
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.companion.showContextMenu(e.clientX, e.clientY);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async () => {
  await animator.preload();
  const settings = await window.companion.getPomodoroSettings();
  pomodoro = new PomodoroTimer(onPomodoroState, settings);
  window.companion.onPomodoroSettingsChanged((s) => pomodoro?.applySettings(s));
  applyAnimState(STATE.IDLE);
})();
