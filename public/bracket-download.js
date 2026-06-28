(function () {
  const button = document.getElementById('download-bracket');
  const bracket = document.getElementById('bracket-export');

  if (!button || !bracket) return;

  function collectStyles() {
    return Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
        } catch (error) {
          return '';
        }
      })
      .join('\n')
      .replace(/<\/style/gi, '<\\/style');
  }

  function replaceElement(element, tagName, className) {
    const replacement = document.createElement(tagName);
    replacement.className = className || element.className || '';
    replacement.id = element.id || '';
    replacement.style.cssText = element.style.cssText;

    while (element.firstChild) {
      replacement.appendChild(element.firstChild);
    }

    element.replaceWith(replacement);
    return replacement;
  }

  function sanitizeClone(root) {
    root.querySelectorAll('.match-report-actions, .visual-match-edit, .win-button').forEach((element) => {
      element.remove();
    });

    root.querySelectorAll('input.score-input').forEach((input) => {
      const score = document.createElement('span');
      score.className = 'score-chip';
      score.textContent = input.value || input.getAttribute('placeholder') || '0';
      input.replaceWith(score);
    });

    root.querySelectorAll('input, select, textarea, button').forEach((element) => {
      element.remove();
    });

    root.querySelectorAll('form').forEach((form) => {
      replaceElement(form, 'div');
    });
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas export returned no image data.'));
        }
      }, 'image/png');
    });
  }

  function makeSvg(clone, width, height) {
    const xhtml = new XMLSerializer().serializeToString(clone);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '<foreignObject width="100%" height="100%">',
      '<div xmlns="http://www.w3.org/1999/xhtml">',
      `<style>${collectStyles()}</style>`,
      xhtml,
      '</div>',
      '</foreignObject>',
      '</svg>',
    ].join('');
  }

  button.addEventListener('click', async () => {
    const previousText = button.textContent;
    let svgUrl = null;
    button.disabled = true;
    button.textContent = 'Preparing image';

    try {
      const clone = bracket.cloneNode(true);
      clone.classList.add('export-image');
      sanitizeClone(clone);
      clone.style.position = '';
      clone.style.left = '';
      clone.style.top = '';
      clone.style.transform = '';
      clone.style.transformOrigin = '';

      const width = Math.max(bracket.offsetWidth, bracket.scrollWidth, 1);
      const height = Math.max(bracket.offsetHeight, bracket.scrollHeight, 1);
      clone.style.width = `${width}px`;
      clone.style.height = `${height}px`;
      clone.style.overflow = 'visible';

      const svg = makeSvg(clone, width, height);
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      svgUrl = URL.createObjectURL(svgBlob);

      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = svgUrl;
      });

      const maxDimension = 12000;
      const maxScale = Math.min(maxDimension / width, maxDimension / height);
      const scale = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, maxScale));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);

      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.fillStyle = '#080b12';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0);

      const pngBlob = await canvasToBlob(canvas);
      downloadBlob(pngBlob, button.dataset.filename || 'bracket.png');
    } catch (error) {
      console.error(error);

      try {
        const clone = bracket.cloneNode(true);
        clone.classList.add('export-image');
        sanitizeClone(clone);
        clone.style.position = '';
        clone.style.left = '';
        clone.style.top = '';
        clone.style.transform = '';
        clone.style.transformOrigin = '';
        const width = Math.max(bracket.offsetWidth, bracket.scrollWidth, 1);
        const height = Math.max(bracket.offsetHeight, bracket.scrollHeight, 1);
        clone.style.width = `${width}px`;
        clone.style.height = `${height}px`;
        const svg = makeSvg(clone, width, height);
        const fallbackName = (button.dataset.filename || 'bracket.png').replace(/\.png$/i, '.svg');
        downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fallbackName);
      } catch (fallbackError) {
        console.error(fallbackError);
        alert('Could not download the bracket image.');
      }
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      button.disabled = false;
      button.textContent = previousText;
    }
  });
})();
