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
      .join('\n');
  }

  function inlineFormValues(root) {
    root.querySelectorAll('input').forEach((input) => {
      input.setAttribute('value', input.value || '');
    });

    root.querySelectorAll('select').forEach((select) => {
      Array.from(select.options).forEach((option) => {
        if (option.selected) {
          option.setAttribute('selected', 'selected');
        } else {
          option.removeAttribute('selected');
        }
      });
    });
  }

  button.addEventListener('click', async () => {
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing image';

    try {
      const clone = bracket.cloneNode(true);
      clone.classList.add('export-image');
      inlineFormValues(clone);

      clone.style.width = `${bracket.scrollWidth}px`;
      clone.style.height = `${bracket.scrollHeight}px`;
      clone.style.overflow = 'visible';

      const width = bracket.scrollWidth;
      const height = bracket.scrollHeight;
      const xhtml = new XMLSerializer().serializeToString(clone);
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">
              <style>${collectStyles()}</style>
              ${xhtml}
            </div>
          </foreignObject>
        </svg>`;

      const image = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });

      const canvas = document.createElement('canvas');
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);

      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.fillStyle = '#080b12';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);

      const link = document.createElement('a');
      link.download = button.dataset.filename || 'bracket.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error(error);
      alert('Could not download the bracket image.');
    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  });
})();
