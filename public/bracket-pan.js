(function () {
  const viewport = document.getElementById('bracket-viewport');
  const canvas = document.getElementById('bracket-canvas');
  const bracket = document.getElementById('bracket-export');

  if (!viewport || !canvas || !bracket) return;

  const interactiveSelector = 'a, button, input, select, textarea, summary, details, label';
  const edgePadding = 28;
  const stateKey = `bracket-view:v4:${window.location.pathname}`;
  let dragStart = null;
  let saveTimer = null;
  let initialized = false;

  function viewportIsVisible() {
    return viewport.clientWidth > 0 && viewport.clientHeight > 0;
  }

  function getBracketSize() {
    return {
      width: bracket.offsetWidth || bracket.scrollWidth || 1,
      height: bracket.offsetHeight || bracket.scrollHeight || 1,
    };
  }

  function getWorldPadding() {
    // Keep only a small gutter around the real bracket. The old large world
    // padding made the viewport scroll into big empty areas.
    return edgePadding;
  }

  function updateCanvasSize() {
    const { width, height } = getBracketSize();
    const padding = getWorldPadding();
    canvas.style.width = `${Math.ceil(width + padding * 2)}px`;
    canvas.style.height = `${Math.ceil(height + padding * 2)}px`;
    canvas.style.transform = 'none';
    bracket.style.position = 'absolute';
    bracket.style.left = `${Math.ceil(padding)}px`;
    bracket.style.top = `${Math.ceil(padding)}px`;
    bracket.style.transform = 'none';
    document.dispatchEvent(new CustomEvent('bracket:view-updated'));
    return { width, height, padding };
  }

  function saveState() {
    try {
      sessionStorage.setItem(
        stateKey,
        JSON.stringify({
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

    if (!state) return false;

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

  function showBracketStart() {
    updateCanvasSize();
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
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
  window.addEventListener('resize', () => {
    if (!viewportIsVisible()) return;
    updateCanvasSize();
    scheduleSave();
  });
  document.addEventListener('bracket:content-updated', () => {
    if (!viewportIsVisible()) return;
    updateCanvasSize();
    saveState();
  });
  function initializeView() {
    if (!viewportIsVisible()) return;

    initialized = true;
    if (!restoreState()) {
      showBracketStart();
    }
  }

  document.addEventListener('bracket:tab-opened', () => {
    if (!initialized) {
      initializeView();
      return;
    }

    updateCanvasSize();
    if (viewport.scrollLeft < 8 && viewport.scrollTop < 8) {
      showBracketStart();
    } else {
      scheduleSave();
    }
  });

  requestAnimationFrame(initializeView);
})();
