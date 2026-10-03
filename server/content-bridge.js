// Runs inside the opaque-origin lecture frame; no access to the application's storage.
(() => {
  const parentOrigin = window.location.origin;
  let pending = false;
  let restoreTimer;
  function send(type, data = {}) { window.parent.postMessage({ type, ...data }, parentOrigin); }
  function report() {
    pending = false;
    const top = window.scrollY || document.documentElement.scrollTop;
    const distance = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const headings = [...document.querySelectorAll('h1[id],h2[id],h3[id],h4[id]')];
    const active = headings.reverse().find(item => item.getBoundingClientRect().top <= 120);
    send('toc-active', { anchor: active ? `#${active.id}` : '' });
    send('reading-progress', { progress: Math.max(0, Math.min(100, top / distance * 100)) });
  }
  window.addEventListener('scroll', () => {
    if (!pending) { pending = true; requestAnimationFrame(report); }
  }, { passive: true });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== parentOrigin) return;
    if (event.data?.type === 'restore-progress') {
      const progress = Number(event.data.progress);
      if (!Number.isFinite(progress)) return;
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        const distance = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo(0, distance * Math.max(0, Math.min(100, progress)) / 100);
        report();
      }, 100);
    } else if (event.data?.type === 'scroll-to-anchor' && typeof event.data.anchor === 'string') {
      document.getElementById(event.data.anchor.replace(/^#/, ''))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  if (document.readyState === 'complete') send('reading-ready');
  else window.addEventListener('load', () => send('reading-ready'), { once: true });
})();
