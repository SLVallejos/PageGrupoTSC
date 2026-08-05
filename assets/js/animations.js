import { prefersReducedMotion, qsa } from './utils.js';

/**
 * Reemplaza src/scripts/reveal.js (GSAP + ScrollTrigger) por
 * IntersectionObserver + las transiciones CSS de animations.css. El stagger
 * de 0.08s cada 3 elementos que aplicaba GSAP sólo a `.reveal` (no a los
 * `.reveal-left/right`) se reproduce con transition-delay inline.
 */

const REVEAL_SELECTOR = '.reveal, .reveal-left, .reveal-right';
const STAGGER_STEP_MS = 80;
const STAGGER_GROUP_SIZE = 3;

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function renderCounter(el, value) {
  const prefix = el.dataset.prefix || '';
  const suffix = el.dataset.suffix || '';
  el.textContent = `${prefix}${Math.round(value)}${suffix}`;
}

function animateCounter(el, target, duration = 1800) {
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    renderCounter(el, target * easeOutQuad(progress));
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

export function initScrollReveal() {
  const items = qsa(REVEAL_SELECTOR);
  if (!items.length) return;

  if (prefersReducedMotion()) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  let revealCount = 0;
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.classList.contains('reveal')) {
          el.style.transitionDelay = `${(revealCount % STAGGER_GROUP_SIZE) * STAGGER_STEP_MS}ms`;
          revealCount += 1;
        }
        el.classList.add('is-visible');
        obs.unobserve(el);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.01 }
  );

  items.forEach((el) => observer.observe(el));
}

export function initCounters() {
  const counters = qsa('.stat__num');
  if (!counters.length) return;

  const reduceMotion = prefersReducedMotion();

  counters.forEach((el) => {
    const target = Number(el.dataset.target || '0');

    if (reduceMotion) {
      renderCounter(el, target);
      return;
    }

    renderCounter(el, 0);

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCounter(el, target);
          obs.unobserve(el);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.01 }
    );
    observer.observe(el);
  });
}

export function initAnimations() {
  initScrollReveal();
  initCounters();
}
