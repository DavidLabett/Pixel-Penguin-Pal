const notesList    = document.getElementById('notes-list');
const emptyMsg     = document.getElementById('empty-msg');
const btnNewNote   = document.getElementById('btn-new-note');
const noteForm     = document.getElementById('note-form');
const noteTextIn   = document.getElementById('note-text-input');
const timerTypeEl  = document.getElementById('timer-type');
const onceFields   = document.getElementById('once-fields');
const onceDatetime = document.getElementById('once-datetime');
const recurFields  = document.getElementById('recurring-fields');
const recurTime    = document.getElementById('recurring-time');
const formErr      = document.getElementById('form-err');
const btnCancel    = document.getElementById('btn-cancel-note');

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let editingId = null; // null = creating; string = editing existing

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function timerDescription(timer) {
  if (!timer) return '';
  if (timer.type === 'once') {
    const d = new Date(timer.datetime);
    return `\u23F0 Once: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (timer.type === 'recurring') {
    const days = (timer.days || []).map(d => DAY_LABELS[d]).join(' ');
    return `\u21BB ${days} at ${timer.time}`;
  }
  return '';
}

async function renderNotes() {
  const notes = await window.notesApi.getNotes();

  // Remove existing cards (keep empty-msg)
  [...notesList.querySelectorAll('.note-card')].forEach(el => el.remove());

  emptyMsg.style.display = notes.length === 0 ? 'block' : 'none';

  notes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';

    const top = document.createElement('div');
    top.className = 'note-card-top';

    const preview = document.createElement('span');
    preview.className = 'note-preview';
    preview.textContent = note.text;

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditForm(note));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.textContent = 'Del';
    delBtn.addEventListener('click', async () => {
      await window.notesApi.deleteNote(note.id);
      renderNotes();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    top.appendChild(preview);
    top.appendChild(actions);
    card.appendChild(top);

    const desc = timerDescription(note.timer);
    if (desc) {
      const timerEl = document.createElement('div');
      timerEl.className = 'note-timer-desc';
      timerEl.textContent = desc;
      card.appendChild(timerEl);
    }

    notesList.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Form handling
// ---------------------------------------------------------------------------
function showForm() {
  noteForm.hidden = false;
  btnNewNote.textContent = '\u2212 Close';
}

function hideForm() {
  noteForm.hidden = true;
  btnNewNote.textContent = '+ New note';
  resetForm();
}

function resetForm() {
  editingId = null;
  noteTextIn.value = '';
  timerTypeEl.value = 'none';
  onceDatetime.value = '';
  recurTime.value = '';
  document.querySelectorAll('#day-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
  formErr.textContent = '';
  updateTimerFields();
}

function updateTimerFields() {
  const type = timerTypeEl.value;
  onceFields.hidden    = type !== 'once';
  recurFields.hidden   = type !== 'recurring';
}

function openEditForm(note) {
  editingId = note.id;
  noteTextIn.value = note.text;

  if (!note.timer) {
    timerTypeEl.value = 'none';
  } else if (note.timer.type === 'once') {
    timerTypeEl.value = 'once';
    // datetime-local requires "YYYY-MM-DDTHH:MM" — stored value is already that format
    onceDatetime.value = note.timer.datetime.slice(0, 16);
  } else if (note.timer.type === 'recurring') {
    timerTypeEl.value = 'recurring';
    recurTime.value = note.timer.time;
    document.querySelectorAll('#day-checkboxes input[type="checkbox"]').forEach(cb => {
      cb.checked = (note.timer.days || []).includes(Number(cb.value));
    });
  }

  updateTimerFields();
  showForm();
  noteTextIn.focus();
}

function buildTimer() {
  const type = timerTypeEl.value;
  if (type === 'none') return null;
  if (type === 'once') {
    if (!onceDatetime.value) return undefined; // validation will catch
    return { type: 'once', datetime: onceDatetime.value };
  }
  if (type === 'recurring') {
    const days = [...document.querySelectorAll('#day-checkboxes input[type="checkbox"]')]
      .filter(cb => cb.checked)
      .map(cb => Number(cb.value));
    if (days.length === 0 || !recurTime.value) return undefined;
    return { type: 'recurring', days, time: recurTime.value };
  }
  return null;
}

timerTypeEl.addEventListener('change', updateTimerFields);

btnNewNote.addEventListener('click', () => {
  if (noteForm.hidden) {
    resetForm();
    showForm();
    noteTextIn.focus();
  } else {
    hideForm();
  }
});

btnCancel.addEventListener('click', hideForm);

noteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formErr.textContent = '';

  const text = noteTextIn.value.trim();
  if (!text) { formErr.textContent = 'Note text is required.'; return; }

  const timer = buildTimer();
  if (timer === undefined) {
    formErr.textContent = timerTypeEl.value === 'once'
      ? 'Please pick a date and time.'
      : 'Pick at least one day and a time.';
    return;
  }

  const note = {
    id:   editingId ?? crypto.randomUUID(),
    text,
    timer,
    lastFiredDate: null,
  };

  const result = await window.notesApi.saveNote(note);
  if (!result.ok) { formErr.textContent = result.error ?? 'Could not save note.'; return; }

  hideForm();
  renderNotes();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
renderNotes();
updateTimerFields();
