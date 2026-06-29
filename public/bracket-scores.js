(function () {
  const timers = new WeakMap();
  const pendingForms = new WeakSet();
  const queuedForms = new WeakSet();

  function scoreValue(input) {
    if (!input || input.value === '') return null;
    const value = Number(input.value);
    return Number.isFinite(value) ? value : null;
  }

  function formParts(form) {
    const score1 = form.querySelector('input[name="score1"]');
    const score2 = form.querySelector('input[name="score2"]');
    const winnerInput = form.querySelector('input[name="winner_override"]');
    const players = form.querySelectorAll('.challonge-player');

    return {
      score1,
      score2,
      winnerInput,
      player1: players[0],
      player2: players[1],
    };
  }

  function effectiveScores(score1, score2) {
    let left = scoreValue(score1);
    let right = scoreValue(score2);

    if (left !== null && right === null && score2.value === '') {
      right = 0;
    } else if (right !== null && left === null && score1.value === '') {
      left = 0;
    }

    return { left, right };
  }

  function setWinner(form, slot) {
    const { winnerInput, player1, player2 } = formParts(form);
    if (!winnerInput || !player1 || !player2) return;

    player1.classList.toggle('winner-slot', slot === 'p1');
    player2.classList.toggle('winner-slot', slot === 'p2');
    winnerInput.value = slot;
  }

  function updateWinnerFromScores(form) {
    const { score1, score2 } = formParts(form);
    if (!score1 || !score2) return;

    const { left, right } = effectiveScores(score1, score2);

    if (left === null || right === null || left === right) {
      setWinner(form, '');
      return;
    }

    setWinner(form, left > right ? 'p1' : 'p2');
  }

  function normalizeBlankOpponentScore(form) {
    const { score1, score2 } = formParts(form);
    const left = scoreValue(score1);
    const right = scoreValue(score2);

    if (left !== null && score2.value === '') {
      score2.value = '0';
    } else if (right !== null && score1.value === '') {
      score1.value = '0';
    }
  }

  function canAutoSubmit(form) {
    const { score1, score2 } = formParts(form);
    const left = scoreValue(score1);
    const right = scoreValue(score2);
    const bothEmpty = score1.value === '' && score2.value === '';
    return bothEmpty || left !== null || right !== null;
  }

  async function refreshBracket() {
    const currentBracket = document.getElementById('bracket-export');
    if (!currentBracket) return;

    const response = await fetch(`${window.location.pathname}?partial=1&bracket=${Date.now()}`, {
      headers: {
        Accept: 'text/html',
        'X-Requested-With': 'fetch',
      },
    });

    if (!response.ok || response.redirected) {
      throw new Error(`Bracket refresh failed with ${response.status}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextBracket = doc.getElementById('bracket-export');

    if (!nextBracket) {
      throw new Error('Bracket refresh did not return bracket markup.');
    }

    currentBracket.innerHTML = nextBracket.innerHTML;
    currentBracket.style.setProperty('--rounds', nextBracket.style.getPropertyValue('--rounds'));
    currentBracket.style.setProperty('--base-matches', nextBracket.style.getPropertyValue('--base-matches'));
    document.dispatchEvent(new CustomEvent('bracket:content-updated'));
    document.dispatchEvent(new CustomEvent('bracket:view-updated'));
  }

  function formActionUrl(form) {
    const action = form.getAttribute('action') || window.location.pathname;
    return new URL(action, window.location.href).toString();
  }

  async function submitForm(form) {
    if (pendingForms.has(form)) {
      queuedForms.add(form);
      return;
    }

    pendingForms.add(form);
    form.classList.add('is-saving');

    try {
      const response = await fetch(formActionUrl(form), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: new URLSearchParams(new FormData(form)),
      });

      if (!response.ok || response.redirected) {
        throw new Error(`Score save failed with ${response.status}`);
      }

      if (queuedForms.has(form)) {
        queuedForms.delete(form);
        pendingForms.delete(form);
        form.classList.remove('is-saving');
        submitForm(form);
        return;
      }

      await refreshBracket();
    } catch (error) {
      console.error(error);
      form.classList.add('save-error');
    } finally {
      pendingForms.delete(form);
      form.classList.remove('is-saving');
    }
  }

  function scheduleSubmit(form, delay) {
    const previousTimer = timers.get(form);
    clearTimeout(previousTimer);
    updateWinnerFromScores(form);

    if (!canAutoSubmit(form)) return;

    const timer = setTimeout(() => {
      normalizeBlankOpponentScore(form);
      updateWinnerFromScores(form);
      submitForm(form);
    }, delay);
    timers.set(form, timer);
  }

  document.addEventListener('input', (event) => {
    if (!event.target.matches('.visual-match .score-input')) return;
    scheduleSubmit(event.target.closest('.visual-match'), 700);
  });

  document.addEventListener('change', (event) => {
    if (!event.target.matches('.visual-match .score-input')) return;
    scheduleSubmit(event.target.closest('.visual-match'), 120);
  });

  document.addEventListener('submit', (event) => {
    if (!event.target.matches('.visual-match')) return;
    event.preventDefault();
    normalizeBlankOpponentScore(event.target);
    updateWinnerFromScores(event.target);
    submitForm(event.target);
  });
})();
