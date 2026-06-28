(function () {
  const viewport = document.getElementById('bracket-viewport');
  const canvas = document.getElementById('bracket-canvas');
  const bracket = document.getElementById('bracket-export');

  if (!viewport || !canvas || !bracket) return;

  const interactiveSelector = 'a, button, input, select, textarea, summary, details, label';
  const minScale = 0.2;
  const maxScale = 1.85;
  let scale = 1;
  let dragStart = null;

  function getBracketSize() {
    return {
      width: bracket.scrollWidth || bracket.offsetWidth || 1,
      height: bracket.scrollHeight || bracket.offsetHeight || 1,
    };
  }

  function updateCanvasSize() {
    const { width, height } = getBracketSize();
    canvas.style.width = `${Math.ceil(width * scale)}px`;
    canvas.style.height = `${Math.ceil(height * scale)}px`;
    canvas.style.transform = `scale(${scale})`;
  }

  function centerBracket() {
    updateCanvasSize();
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = 0;
  }

  function fitBracket() {
    const { width, height } = getBracketSize();
    const availableWidth = Math.max(1, viewport.clientWidth - 28);
    const availableHeight = Math.max(1, viewport.clientHeight - 28);
    const nextScale = Math.min(1, availableWidth / width, availableHeight / height);
    scale = Math.max(minScale, Math.min(maxScale, nextScale));
    updateCanvasSize();
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = 0;
  }

  function setScale(nextScale) {
    const previousScale = scale;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    scale = Math.min(maxScale, Math.max(minScale, nextScale));
    updateCanvasSize();
    viewport.scrollLeft = (centerX / previousScale) * scale - viewport.clientWidth / 2;
    viewport.scrollTop = (centerY / previousScale) * scale - viewport.clientHeight / 2;
  }

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest(interactiveSelector)) return;

    dragStart = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      pointerId: event.pointerId,
    };
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    viewport.scrollLeft = dragStart.scrollLeft - (event.clientX - dragStart.x);
    viewport.scrollTop = dragStart.scrollTop - (event.clientY - dragStart.y);
  });

  function stopDragging(event) {
    if (!dragStart) return;
    viewport.classList.remove('is-dragging');
    if (event.pointerId === dragStart.pointerId && viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    dragStart = null;
  }

  viewport.addEventListener('pointerup', stopDragging);
  viewport.addEventListener('pointercancel', stopDragging);

  document.querySelectorAll('[data-bracket-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.bracketZoom;

      if (action === 'in') {
        setScale(scale + 0.1);
      } else if (action === 'out') {
        setScale(scale - 0.1);
      } else if (action === 'fit') {
        fitBracket();
      } else {
        scale = 1;
        centerBracket();
      }
    });
  });

  window.addEventListener('resize', fitBracket);
  requestAnimationFrame(fitBracket);
})();
