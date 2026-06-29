(function () {
  const intervalMs = 4000;

  async function refreshBracket() {
    const currentBracket = document.getElementById('bracket-export');
    const response = await fetch(`${window.location.pathname}?partial=1&v=${Date.now()}`, {
      headers: {
        Accept: 'text/html',
        'X-Requested-With': 'fetch',
      },
    });

    if (!response.ok) return;

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextBracket = doc.getElementById('bracket-export');

    if (!currentBracket && !nextBracket) return;
    if (!currentBracket && nextBracket) {
      window.location.reload();
      return;
    }

    if (!nextBracket) {
      window.location.reload();
      return;
    }

    currentBracket.innerHTML = nextBracket.innerHTML;
    currentBracket.style.setProperty('--rounds', nextBracket.style.getPropertyValue('--rounds'));
    currentBracket.style.setProperty('--base-matches', nextBracket.style.getPropertyValue('--base-matches'));
    document.dispatchEvent(new CustomEvent('bracket:content-updated'));
    document.dispatchEvent(new CustomEvent('bracket:view-updated'));
  }

  setInterval(() => {
    refreshBracket().catch((error) => console.error(error));
  }, intervalMs);
})();
