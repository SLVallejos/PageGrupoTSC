import { qsa, prefersReducedMotion } from '../utils.js';
import { attachDragGesture } from './drag-gesture.js';

/**
 * Carrusel central con tarjeta desplegable para Casos de Éxito. Las 4
 * tarjetas ya existen en el HTML (desafío/solución incluidos, para SEO y
 * uso sin JS); acá sólo se reordena visualmente cuál queda al centro (vía
 * CSS `order`) y se togglea el desplegable de la tarjeta activa — mismo
 * patrón que tabs.js/accordion.js: comportamiento, no contenido.
 *
 * Suma autoplay en loop (ya era circular por diseño de roleFor()) y swipe
 * horizontal. El autoplay se pausa únicamente ante interacción manual real
 * (click, arrastre) y se reanuda solo tras un breve respiro — nunca se
 * detiene por sólo pasar el mouse por encima.
 */

const AUTOPLAY_INTERVAL_MS = 5000;
const RESUME_DELAY_MS = 3000;
const SWIPE_THRESHOLD_PX = 50;

export function initCaseCarousel(rootEl, dotsEl) {
  if (!rootEl) return;

  const cards = qsa('.case-card', rootEl);
  if (!cards.length) return;

  const dots = dotsEl ? qsa('button', dotsEl) : [];
  let activeIndex = 0;
  let expanded = false;
  let autoplayTimer = null;
  let resumeTimer = null;

  function roleFor(index) {
    const last = cards.length - 1;
    if (index === activeIndex) return 'active';
    if (index === (activeIndex === 0 ? last : activeIndex - 1)) return 'prev';
    if (index === (activeIndex === last ? 0 : activeIndex + 1)) return 'next';
    return 'hidden';
  }

  function render() {
    cards.forEach((card, index) => {
      const role = roleFor(index);
      card.classList.remove('case-card--active', 'case-card--side', 'case-card--hidden', 'case-card--expanded');
      card.style.order = role === 'prev' ? '0' : role === 'active' ? '1' : role === 'next' ? '2' : '3';

      if (role === 'active') {
        card.classList.add('case-card--active');
        if (expanded) card.classList.add('case-card--expanded');
      } else if (role === 'hidden') {
        card.classList.add('case-card--hidden');
      } else {
        card.classList.add('case-card--side');
      }
    });

    dots.forEach((dot, index) => {
      dot.setAttribute('aria-current', String(index === activeIndex));
    });
  }

  function goTo(index) {
    activeIndex = ((index % cards.length) + cards.length) % cards.length;
    expanded = false;
    render();
  }

  /** Detiene el autoplay (ej. al iniciar una interacción manual). */
  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  /** Arranca el autoplay en loop; no hace nada si el usuario prefiere menos movimiento. */
  function startAutoplay() {
    if (prefersReducedMotion() || autoplayTimer) return;
    autoplayTimer = setInterval(() => goTo(activeIndex + 1), AUTOPLAY_INTERVAL_MS);
  }

  /** Pausa el autoplay y programa su reanudación tras un breve respiro. */
  function pauseAndScheduleResume() {
    stopAutoplay();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(startAutoplay, RESUME_DELAY_MS);
  }

  cards.forEach((card, index) => {
    card.addEventListener('click', () => {
      if (index === activeIndex) {
        expanded = !expanded;
        render();
      } else {
        goTo(index);
      }
      pauseAndScheduleResume();
    });
  });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      goTo(index);
      pauseAndScheduleResume();
    });
  });

  const stageEl = rootEl.parentElement;
  stageEl?.querySelector('[data-case-nav="prev"]')?.addEventListener('click', () => {
    goTo(activeIndex - 1);
    pauseAndScheduleResume();
  });
  stageEl?.querySelector('[data-case-nav="next"]')?.addEventListener('click', () => {
    goTo(activeIndex + 1);
    pauseAndScheduleResume();
  });

  attachDragGesture(rootEl, {
    onStart() {
      stopAutoplay();
      clearTimeout(resumeTimer);
      rootEl.classList.add('is-dragging');
    },
    onEnd(deltaX, dragged) {
      rootEl.classList.remove('is-dragging');
      if (dragged && Math.abs(deltaX) > SWIPE_THRESHOLD_PX) {
        goTo(activeIndex + (deltaX < 0 ? 1 : -1));
      }
      pauseAndScheduleResume();
    },
  });

  render();
  startAutoplay();
}
