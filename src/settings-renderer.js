const workEl        = document.getElementById('work');
const shortEl       = document.getElementById('shortBreak');
const longEl        = document.getElementById('longBreak');
const sleepEl       = document.getElementById('sleepMinutes');
const flipEl        = document.getElementById('flipHorizontal');
const errEl         = document.getElementById('err');

document.getElementById('cancel').addEventListener('click', () => {
  window.settingsApi.closeWindow();
});

document.getElementById('save').addEventListener('click', async () => {
  errEl.textContent = '';

  const workMinutes       = Number(workEl.value);
  const shortBreakMinutes = Number(shortEl.value);
  const longBreakMinutes  = Number(longEl.value);
  const sleepMinutes      = Number(sleepEl.value);

  if (![workMinutes, shortBreakMinutes, longBreakMinutes, sleepMinutes].every(Number.isFinite)) {
    errEl.textContent = 'Enter valid numbers in all fields.';
    return;
  }

  const result = await window.settingsApi.saveSettings({
    workMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    sleepMinutes,
    flipHorizontal: flipEl.checked,
  });

  if (result?.ok) {
    window.settingsApi.closeWindow();
  } else {
    errEl.textContent = result?.error ?? 'Could not save settings.';
  }
});

(async () => {
  const s = await window.settingsApi.getSettings();
  workEl.value  = String(s.workMinutes);
  shortEl.value = String(s.shortBreakMinutes);
  longEl.value  = String(s.longBreakMinutes);
  sleepEl.value = String(s.sleepMinutes ?? 5);
  flipEl.checked = s.flipHorizontal === true;
})();
