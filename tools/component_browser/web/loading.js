(() => {
  const root = document.getElementById('loading');
  const status = document.getElementById('loading-status');
  const hint = document.getElementById('loading-hint');
  const retry = document.getElementById('loading-retry');
  let complete = false;
  let failed = false;
  const slow = setTimeout(() => {
    if (complete || failed) return;
    hint.textContent = 'Taking longer than usual. Check your connection, or try again.';
    retry.hidden = false;
  }, 20000);
  retry.addEventListener('click', () => window.location.reload());
  window.componentLoading = {
    stage(message) {
      if (!complete && !failed) status.textContent = message;
    },
    fail() {
      if (complete || failed) return;
      failed = true;
      clearTimeout(slow);
      root.classList.add('failed');
      status.textContent = 'The browser couldn’t load.';
      hint.textContent = 'Check your connection and try again. If it still fails, try another browser.';
      retry.hidden = false;
    },
  };
  window.addEventListener('flutter-first-frame', () => {
    complete = true;
    clearTimeout(slow);
    root.remove();
  }, { once: true });
})();
