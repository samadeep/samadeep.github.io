// Shared by posts and study chapters: labs, the VM, the contents rail, heading links, folded steps, back-to-top.
import './labs';
import './vm';
// highlight the section currently in view
const links = new Map([...document.querySelectorAll<HTMLAnchorElement>('.toc a')].map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
if (links.size) {
  let current: HTMLAnchorElement | undefined;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      current?.classList.remove('active');
      current = links.get(e.target.id);
      current?.classList.add('active');
    }
  }, { rootMargin: '0px 0px -75% 0px' });
  links.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
}

// every section heading gets a link icon; clicking it copies the section's URL
for (const h of document.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')) {
  const a = document.createElement('a');
  a.className = 'h-anchor'; a.href = `#${h.id}`; a.setAttribute('aria-label', `Copy link to "${h.textContent}"`);
  a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    history.replaceState(null, '', a.hash);
    h.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    try { await navigator.clipboard.writeText(location.href); a.dataset.copied = ''; setTimeout(() => delete a.dataset.copied, 1400); } catch { /* clipboard blocked: the hash is still set */ }
  });
  h.prepend(a);
}

// folded solution steps: one button opens or closes all of them
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-reveal-all]')) {
  const steps = [...document.querySelectorAll<HTMLDetailsElement>('.prose details.step')];
  b.addEventListener('click', () => {
    const open = !steps.every((d) => d.open);
    steps.forEach((d) => (d.open = open));
    b.textContent = open ? 'Fold every step' : 'Open every step';
  });
}
// a link to something inside a folded step opens it
const openTarget = () => { const t = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; t?.closest('details')?.setAttribute('open', ''); };
addEventListener('hashchange', openTarget); openTarget();

// back to top: appears after the first screen, its ring fills as you read
const top = document.querySelector<HTMLAnchorElement>('.to-top');
if (top) {
  const ring = top.querySelector<SVGCircleElement>('.ring')!;
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    const f = max > 0 ? Math.min(1, scrollY / max) : 0;
    ring.style.strokeDashoffset = String(100 - f * 100);
    top.hidden = scrollY < innerHeight * 0.8;
  };
  addEventListener('scroll', () => { raf ||= requestAnimationFrame(update); }, { passive: true });
  update();
  top.addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
}
