const CYCLES_BEFORE_LONG = 4;
const RINGING_DURATION_MS = 10000;

export const DEFAULT_POMODORO_MINUTES = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

function minutesToMs(m) {
  return Math.round(Number(m) * 60 * 1000);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeMinutes(partial) {
  return {
    workMinutes: clamp(Math.round(Number(partial.workMinutes) || 25), 1, 180),
    shortBreakMinutes: clamp(Math.round(Number(partial.shortBreakMinutes) || 5), 1, 120),
    longBreakMinutes: clamp(Math.round(Number(partial.longBreakMinutes) || 15), 1, 120),
  };
}

/**
 * Phases:
 *   'stopped'  – not running
 *   'working'  – counting down work period
 *   'paused'   – frozen; was 'working' or 'break'
 *   'ringing'  – work/break just ended, alarm playing
 *   'break'    – counting down break period
 */
export class PomodoroTimer {
  /**
   * @param {(state: object) => void} onChange
   * @param {Partial<typeof DEFAULT_POMODORO_MINUTES>} [settingsMinutes]
   */
  constructor(onChange, settingsMinutes = {}) {
    this.onChange = onChange;
    this.phase = 'stopped';
    this.cycleCount = 0;
    this._pausedPhase = null;
    this._intervalId = null;
    this._ringingTimeout = null;
    this._lastTick = null;

    const m = normalizeMinutes({ ...DEFAULT_POMODORO_MINUTES, ...settingsMinutes });
    this.workDurationMs = minutesToMs(m.workMinutes);
    this.shortBreakMs = minutesToMs(m.shortBreakMinutes);
    this.longBreakMs = minutesToMs(m.longBreakMinutes);
    this.remainingMs = this.workDurationMs;
    this._emit();
  }

  /** @param {Partial<typeof DEFAULT_POMODORO_MINUTES>} partial */
  applySettings(partial) {
    const m = normalizeMinutes({
      workMinutes: partial.workMinutes ?? this.workDurationMs / 60000,
      shortBreakMinutes: partial.shortBreakMinutes ?? this.shortBreakMs / 60000,
      longBreakMinutes: partial.longBreakMinutes ?? this.longBreakMs / 60000,
    });
    this.workDurationMs = minutesToMs(m.workMinutes);
    this.shortBreakMs = minutesToMs(m.shortBreakMinutes);
    this.longBreakMs = minutesToMs(m.longBreakMinutes);

    if (this.phase === 'stopped') {
      this.remainingMs = this.workDurationMs;
      this._emit();
    }
  }

  start() {
    if (this.phase === 'paused') {
      this.resume();
      return;
    }
    if (this.phase === 'working' || this.phase === 'break' || this.phase === 'ringing') return;

    if (this.phase === 'stopped') {
      this.remainingMs = this.workDurationMs;
      this.cycleCount = 0;
    }
    this._setPhase('working');
    this._startTicking();
  }

  pause() {
    if (this.phase !== 'working' && this.phase !== 'break') return;
    this._pausedPhase = this.phase;
    this._stopTicking(false);
    this._setPhase('paused');
  }

  toggle() {
    if (this.phase === 'stopped') {
      this.start();
    } else if (this.phase === 'working' || this.phase === 'break') {
      this.pause();
    } else if (this.phase === 'paused') {
      this.resume();
    }
  }

  resume() {
    if (this.phase !== 'paused' || !this._pausedPhase) return;
    this.phase = this._pausedPhase;
    this._pausedPhase = null;
    this._lastTick = Date.now();
    this._intervalId = setInterval(() => this._tick(), 250);
    this._emit();
  }

  reset() {
    this._stopTicking(true);
    this._pausedPhase = null;
    this.cycleCount = 0;
    this.remainingMs = this.workDurationMs;
    this._setPhase('stopped');
  }

  _startTicking() {
    this._lastTick = Date.now();
    this._intervalId = setInterval(() => this._tick(), 250);
  }

  /** @param {boolean} clearRinging */
  _stopTicking(clearRinging = true) {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (clearRinging && this._ringingTimeout) {
      clearTimeout(this._ringingTimeout);
      this._ringingTimeout = null;
    }
  }

  _tick() {
    if (this.phase !== 'working' && this.phase !== 'break') return;

    const now = Date.now();
    const elapsed = now - this._lastTick;
    this._lastTick = now;

    this.remainingMs = Math.max(0, this.remainingMs - elapsed);

    if (this.remainingMs <= 0) {
      if (this.phase === 'working') {
        this._onWorkEnd();
      } else if (this.phase === 'break') {
        this._onBreakEnd();
      }
    } else {
      this._emit();
    }
  }

  _onWorkEnd() {
    this._stopTicking(true);
    this.cycleCount++;
    this._setPhase('ringing');

    this._ringingTimeout = setTimeout(() => {
      const isLong = this.cycleCount % CYCLES_BEFORE_LONG === 0;
      this.remainingMs = isLong ? this.longBreakMs : this.shortBreakMs;
      this._setPhase('break');
      this._startTicking();
    }, RINGING_DURATION_MS);
  }

  _onBreakEnd() {
    this._stopTicking(true);
    this.remainingMs = this.workDurationMs;
    this._setPhase('ringing');
    this._ringingTimeout = setTimeout(() => {
      this._setPhase('stopped');
      this._emit();
    }, RINGING_DURATION_MS);
  }

  _setPhase(phase) {
    this.phase = phase;
    this._emit();
  }

  _formatClock(ms) {
    const totalSecs = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  _emit() {
    let label;
    if (this.phase === 'stopped') {
      label = this._formatClock(this.workDurationMs);
    } else if (this.phase === 'ringing') {
      label = '—';
    } else {
      label = this._formatClock(this.remainingMs);
    }

    this.onChange({
      phase: this.phase,
      label,
      remainingMs: this.remainingMs,
      cycleCount: this.cycleCount,
    });
  }
}
