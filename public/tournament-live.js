(function () {
  const form = document.getElementById('settings-form');
  const state = document.getElementById('settings-save-state');
  const title = document.getElementById('tournament-title');
  const status = document.getElementById('tournament-status');

  if (!form || !state || form.dataset.liveSave !== 'true') return;

  let timer = null;
  let requestId = 0;
  let lastSerialized = new URLSearchParams(new FormData(form)).toString();

  function setState(text, mode) {
    state.textContent = text;
    state.dataset.mode = mode || '';
  }

  async function saveNow() {
    const formData = new FormData(form);
    const serialized = new URLSearchParams(formData).toString();

    if (serialized === lastSerialized) {
      setState('Saved', 'saved');
      return;
    }

    const currentRequest = ++requestId;
    setState('Saving', 'saving');

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: new URLSearchParams(formData),
      });

      if (!response.ok) {
        throw new Error(`Save failed with ${response.status}`);
      }

      if (currentRequest !== requestId) return;

      lastSerialized = serialized;
      setState('Saved live', 'saved');
    } catch (error) {
      console.error(error);
      setState('Live save failed', 'error');
    }
  }

  function queueSave(delay) {
    clearTimeout(timer);
    setState('Editing', 'editing');
    timer = setTimeout(saveNow, delay);
  }

  function updatePagePreview(target) {
    if (target.name === 'name' && title) {
      title.textContent = target.value.trim() || 'Untitled Tournament';
    }

    if (target.name === 'status' && status) {
      status.textContent = target.selectedOptions?.[0]?.textContent || target.value;
    }
  }

  form.addEventListener('input', (event) => {
    if (!event.target.name) return;
    updatePagePreview(event.target);
    queueSave(event.target.matches('textarea') ? 900 : 500);
  });

  form.addEventListener('change', (event) => {
    if (!event.target.name) return;
    updatePagePreview(event.target);
    queueSave(150);
  });

  form.addEventListener('submit', () => {
    clearTimeout(timer);
  });
})();
