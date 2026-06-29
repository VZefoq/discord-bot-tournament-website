(function () {
  const tabs = Array.from(document.querySelectorAll('[data-tab-link]'));
  const panels = Array.from(document.querySelectorAll('[data-tab-panel]'));

  if (!tabs.length || !panels.length) return;

  const validTabs = new Set(panels.map((panel) => panel.dataset.tabPanel));

  function currentTab() {
    const hash = window.location.hash.replace('#', '');
    return validTabs.has(hash) ? hash : 'bracket';
  }

  function activate(tabName) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tabLink === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-current', active ? 'page' : 'false');
    });

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tabName;
    });

    if (tabName === 'bracket') {
      document.dispatchEvent(new CustomEvent('bracket:tab-opened'));
      document.dispatchEvent(new CustomEvent('bracket:content-updated'));
      document.dispatchEvent(new CustomEvent('bracket:view-updated'));
    }
  }

  async function copyLink(button) {
    const link = button.dataset.copyLink;
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = 'Copy live link';
      }, 1400);
    } catch (error) {
      const input = document.querySelector('.live-link-input');
      if (!input) return;
      input.focus();
      input.select();
    }
  }

  window.addEventListener('hashchange', () => activate(currentTab()));
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-copy-link]');
    if (button) copyLink(button);
  });

  activate(currentTab());
})();
