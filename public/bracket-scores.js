(function () {
  document.querySelectorAll('.visual-match').forEach((form) => {
    const score1 = form.querySelector('input[name="score1"]');
    const score2 = form.querySelector('input[name="score2"]');
    const players = form.querySelectorAll('.challonge-player');
    const player1 = players[0];
    const player2 = players[1];
    const winnerSelect = form.querySelector('select[name="winner_override"]');

    if (!score1 || !score2 || !player1 || !player2 || !winnerSelect) return;

    function setWinner(slot) {
      player1.classList.toggle('winner-slot', slot === 'p1');
      player2.classList.toggle('winner-slot', slot === 'p2');
      winnerSelect.value = slot;
    }

    function updateWinnerFromScores() {
      const left = score1.value === '' ? null : Number(score1.value);
      const right = score2.value === '' ? null : Number(score2.value);

      if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) {
        setWinner('');
        return;
      }

      setWinner(left > right ? 'p1' : 'p2');
    }

    score1.addEventListener('input', updateWinnerFromScores);
    score2.addEventListener('input', updateWinnerFromScores);
  });
})();
