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

    function setWinner(slot) {
      player1.classList.toggle('winner-slot', slot === 'p1');
      player2.classList.toggle('winner-slot', slot === 'p2');
      winnerInput.value = slot;
    }

    function updateWinnerFromScores() {
      const left = scoreValue(score1);
      const right = scoreValue(score2);

      if (left === null || right === null || left === right) {
        setWinner('');
        return;
      }

      setWinner(left > right ? 'p1' : 'p2');
    }

    function canAutoSubmit() {
      const left = scoreValue(score1);
      const right = scoreValue(score2);
      const bothEmpty = score1.value === '' && score2.value === '';
      return bothEmpty || (left !== null && right !== null);
    }

    function submitScore(delay) {
      clearTimeout(timer);
      updateWinnerFromScores();

      if (!canAutoSubmit()) return;

      timer = setTimeout(() => {
        form.requestSubmit();
      }, delay);
    }

    score1.addEventListener('input', () => submitScore(700));
    score2.addEventListener('input', () => submitScore(700));
    score1.addEventListener('change', () => submitScore(120));
    score2.addEventListener('change', () => submitScore(120));
  });
})();
