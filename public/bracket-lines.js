(function () {
  const bracket = document.getElementById('bracket-export');

  if (!bracket) return;

  let svg = bracket.querySelector('.bracket-lines');

  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('bracket-lines');
    svg.setAttribute('aria-hidden', 'true');
    bracket.prepend(svg);
  }

  function currentScale() {
    const transform = getComputedStyle(bracket).transform;
    if (!transform || transform === 'none') return 1;

    try {
      return new DOMMatrixReadOnly(transform).a || 1;
    } catch (error) {
      return 1;
    }
  }

  function localRect(element, bracketRect, scale) {
    const rect = element.getBoundingClientRect();
    return {
      left: (rect.left - bracketRect.left) / scale,
      right: (rect.right - bracketRect.left) / scale,
      top: (rect.top - bracketRect.top) / scale,
      bottom: (rect.bottom - bracketRect.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    };
  }

  function drawConnectors() {
    const scale = currentScale();
    const bracketRect = bracket.getBoundingClientRect();
    const width = bracket.scrollWidth || bracket.offsetWidth;
    const height = bracket.scrollHeight || bracket.offsetHeight;
    const matches = Array.from(bracket.querySelectorAll('.visual-match[data-round][data-match]'));

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();

    matches.forEach((match) => {
      const round = Number(match.dataset.round);
      const matchNumber = Number(match.dataset.match);
      const target = bracket.querySelector(
        `.visual-match[data-round="${round + 1}"][data-match="${Math.ceil(matchNumber / 2)}"]`,
      );

      if (!target) return;

      const sourceRect = localRect(match, bracketRect, scale);
      const targetRect = localRect(target, bracketRect, scale);
      const startX = sourceRect.right;
      const startY = sourceRect.top + sourceRect.height / 2;
      const endX = targetRect.left;
      const endY = targetRect.top + targetRect.height / 2;
      const midX = startX + Math.max(20, (endX - startX) / 2);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      path.setAttribute('d', `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`);
      path.setAttribute('class', 'bracket-connector');
      svg.appendChild(path);
    });
  }

  window.addEventListener('resize', drawConnectors);
  window.addEventListener('load', drawConnectors);
  document.addEventListener('bracket:view-updated', drawConnectors);
  requestAnimationFrame(drawConnectors);
})();
