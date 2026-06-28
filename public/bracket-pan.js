(function () {
  const viewport = document.getElementById('bracket-viewport');
  const canvas = document.getElementById('bracket-canvas');
  const bracket = document.getElementById('bracket-export');

  if (!viewport || !canvas || !bracket) return;

  const interactiveSelector = 'a, button, input, select, textarea, summary, details, label';
  const minScale = 0.2;
  const maxScale = 1.85;
  const minWorldPadding = 900;
  const stateKey = `bracket-view:v2:${window.location.pathname}`;
  let scale = 1;
  let dragStart = null;
  let saveTimer = null;

  function getBracketSize() {
    return {
      width: bracket.offsetWidth || bracket.scrollWidth || 1,
      height: bracket.offsetHeight || bracket.scrollHeight || 1,
    };
  }

  function getWorldPadding() {
    return Math.max(minWorldPadding, Math.ceil(Math.max(viewport.clientWidth, viewport.clientHeight) * 0.85));
  }

  function updateCanvasSize() {
    const { width, height } = getBracketSize();
    const padding = getWorldPadding();
    canvas.style.width = `${Math.ceil((width + padding * 2) * scale)}px`;
    canvas.style.height = `${Math.ceil((height + padding * 2) * scale)}px`;
    canvas.style.transform = 'none';
    bracket.style.position = 'absolute';
    bracket.style.left = `${Math.ceil(padding * scale)}px`;
    bracket.style.top = `${Math.ceil(padding * scale)}px`;
    bracket.style.transform = `scale(${scale})`;
    bracket.style.transformOrigin = '0 0';
    document.dispatchEvent(new CustomEvent('bracket:view-updated'));
    return { width, height, padding };
  }

  function saveState() {
    try {
      sessionStorage.setItem(
        stateKey,
        JSON.stringify({
          scale,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
          windowX: window.scrollX,
          windowY: window.scrollY,
          savedAt: Date.now(),
        }),
      );
    } catch (error) {
      // Ignore storage failures. The bracket still works without persisted view state.
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 120);
  }

  function restoreState() {
    let state = null;

    try {
      state = JSON.parse(sessionStorage.getItem(stateKey) || 'null');
    } catch (error) {
      return false;
    }

    if (!state || typeof state.scale !== 'number') return false;

    scale = Math.min(maxScale, Math.max(minScale, state.scale));
    updateCanvasSize();
    viewport.scrollLeft = Math.max(0, Number(state.scrollLeft) || 0);
    viewport.scrollTop = Math.max(0, Number(state.scrollTop) || 0);

    const windowX = Math.max(0, Number(state.windowX) || 0);
    const windowY = Math.max(0, Number(state.windowY) || 0);
    requestAnimationFrame(() => {
      window.scrollTo(windowX, windowY);
      setTimeout(() => window.scrollTo(windowX, windowY), 0);
    });

    return true;
  }

  function centerBracket() {
    const { width, padding } = updateCanvasSize();
    viewport.scrollLeft = Math.max(0, padding * scale + (width * scale - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, padding * scale - 24);
    scheduleSave();
  }

  function fitBracket() {
    const { width, height } = getBracketSize();
    const availableWidth = Math.max(1, viewport.clientWidth - 28);
    const availableHeight = Math.max(1, viewport.clientHeight - 28);
    const nextScale = Math.min(1, availableWidth / width, availableHeight / height);
    scale = Math.max(minScale, Math.min(maxScale, nextScale));
    const { padding } = updateCanvasSize();
    viewport.scrollLeft = Math.max(0, padding * scale - (viewport.clientWidth - width * scale) / 2);
    viewport.scrollTop = Math.max(0, padding * scale - (viewport.clientHeight - height * scale) / 2);
    scheduleSave();
  }

  function setScale(nextScale) {
    const previousScale = scale;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    scale = Math.min(maxScale, Math.max(minScale, nextScale));
    updateCanvasSize();
    viewport.scrollLeft = (centerX / previousScale) * scale - viewport.clientWidth / 2;
    viewport.scrollTop = (centerY / previousScale) * scale - viewport.clientHeight / 2;
    scheduleSave();
  }

  function zoomAtPoint(nextScale, clientX, clientY) {
    const previousScale = scale;
    const rect = viewport.getBoundingClientRect();
    const viewportX = clientX - rect.left;
    const viewportY = clientY - rect.top;
    const worldX = viewport.scrollLeft + viewportX;
    const worldY = viewport.scrollTop + viewportY;

    scale = Math.min(maxScale, Math.max(minScale, nextScale));
    updateCanvasSize();
    viewport.scrollLeft = (worldX / previousScale) * scale - viewportX;
    viewport.scrollTop = (worldY / previousScale) * scale - viewportY;
    scheduleSave();
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
    saveState();
  }

  viewport.addEventListener('pointerup', stopDragging);
  viewport.addEventListener('pointercancel', stopDragging);
  viewport.addEventListener('scroll', scheduleSave);

  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const zoomStep = event.deltaY > 0 ? -0.1 : 0.1;
      zoomAtPoint(scale + zoomStep, event.clientX, event.clientY);
    },
    { passive: false },
  );

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

  document.addEventListener(
    'submit',
    (event) => {
      if (event.target.closest('.visual-match')) {
        saveState();
      }
    },
    true,
  );

  window.addEventListener('beforeunload', saveState);
  window.addEventListener('resize', fitBracket);
  requestAnimationFrame(() => {
    if (!restoreState()) {
      fitBracket();
    }
  });
})();
