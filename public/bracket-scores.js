(function () {
  document.querySelectorAll('.visual-match').forEach((form) => {
    const score1 = form.querySelector('input[name="score1"]');
    const score2 = form.querySelector('input[name="score2"]');
    const winnerInput = form.querySelector('input[name="winner_override"]');
    const players = form.querySelectorAll('.challonge-player');
    const player1 = players[0];
    const player2 = players[1];
    let timer = null;

    if (!score1 || !score2 || !winnerInput || !player1 || !player2) return;

    function scoreValue(input) {
      if (input.value === '') return null;
      const value = Number(input.value);
      return Number.isFinite(value) ? value : null;
    }

    function effectiveScores() {
      let left = scoreValue(score1);
      let right = scoreValue(score2);

      if (left !== null && right === null && score2.value === '') {
        right = 0;
      } else if (right !== null && left === null && score1.value === '') {
        left = 0;
      }

      return { left, right };
    }

    function setWinner(slot) {
      player1.classList.toggle('winner-slot', slot === 'p1');
      player2.classList.toggle('winner-slot', slot === 'p2');
      winnerInput.value = slot;
    }

    function updateWinnerFromScores() {
      const { left, right } = effectiveScores();

      if (left === null || right === null || left === right) {
        setWinner('');
        return;
      }

      setWinner(left > right ? 'p1' : 'p2');
    }

    function normalizeBlankOpponentScore() {
      const left = scoreValue(score1);
      const right = scoreValue(score2);

      if (left !== null && score2.value === '') {
        score2.value = '0';
      } else if (right !== null && score1.value === '') {
        score1.value = '0';
      }
    }

    function canAutoSubmit() {
      const left = scoreValue(score1);
      const right = scoreValue(score2);
      const bothEmpty = score1.value === '' && score2.value === '';
      const oneScoreEntered = left !== null || right !== null;
      return bothEmpty || oneScoreEntered;
    }

    function submitScore(delay) {
      clearTimeout(timer);
      updateWinnerFromScores();

      if (!canAutoSubmit()) return;

      timer = setTimeout(() => {
        normalizeBlankOpponentScore();
        updateWinnerFromScores();
        form.requestSubmit();
      }, delay);
    }

    score1.addEventListener('input', () => submitScore(700));
    score2.addEventListener('input', () => submitScore(700));
    score1.addEventListener('change', () => submitScore(120));
    score2.addEventListener('change', () => submitScore(120));
  });
})();
