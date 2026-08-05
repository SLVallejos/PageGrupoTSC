import { qs, qsa, debounce, prefersReducedMotion } from '../utils.js';
import { attachDragGesture } from './drag-gesture.js';

/**
 * Carrusel de una franja (track con transform: translateX) para Proyectos.
 * Autoplay en loop continuo con arrastre real (mouse/touch/pen vía Pointer
 * Events): el usuario puede seguir el track con el dedo/mouse en tiempo
 * real, y al soltar se decide con qué slide quedarse según el umbral de
 * arrastre. El autoplay sólo se pausa por interacción manual (drag o
 * click en los botones), nunca por simplemente pasar el mouse por encima,
 * y se reanuda solo despues de un breve respiro.
 */

const MD_BREAKPOINT = 768;
const AUTOPLAY_INTERVAL_MS = 4500;
const RESUME_DELAY_MS = 3000;
const DRAG_SNAP_RATIO = 0.18; // % del ancho de un slide que hay que arrastrar para cambiar de slide

export function createCarousel(rootEl, dotsEl) {
  if (!rootEl) return;

  const viewport = qs('.carousel-viewport', rootEl);
  const track = qs('.carousel-track', rootEl);
  const slides = qsa('.carousel-slide', track);
  const prevBtn = qs('.carousel-btn--prev', rootEl);
  const nextBtn = qs('.carousel-btn--next', rootEl);
  if (!viewport || !track || !slides.length || !prevBtn || !nextBtn) return;

  let dotButtons = [];

  slides.forEach((slide, index) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'diapositiva');
    slide.setAttribute('aria-label', `${index + 1} de ${slides.length}`);
  });

  // El carrusel siempre puede avanzar/retroceder (loop), los botones ya
  // no se deshabilitan en los extremos.
  prevBtn.removeAttribute('disabled');

  let activeIndex = 0;
  let autoplayTimer = null;
  let resumeTimer = null;
  let dragBasePercent = 0;

  function slidesPerView() {
    return window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`).matches ? 2 : 1;
  }

  function maxIndex() {
    return Math.max(slides.length - slidesPerView(), 0);
  }

  function wrapIndex(index) {
    const range = maxIndex() + 1;
    return ((index % range) + range) % range;
  }

  function percentForIndex(index) {
    return -(index * (100 / slidesPerView()));
  }

  /** Sincroniza qué punto indicador aparece activo con el slide actual. */
  function syncDots() {
    dotButtons.forEach((dot, index) => dot.setAttribute('aria-current', String(index === activeIndex)));
  }

  /**
   * Reconstruye los puntos indicadores si cambió la cantidad de posiciones
   * posibles (ej. al cruzar el breakpoint md y pasar de 1 a 2 slides por
   * vista). No genera contenido de negocio, sólo controles de navegación.
   */
  function renderDots() {
    if (!dotsEl) return;
    const count = maxIndex() + 1;
    if (dotButtons.length === count) return;

    dotsEl.textContent = '';
    dotButtons = Array.from({ length: count }, (_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Ir al proyecto ${index + 1}`);
      dot.addEventListener('click', () => {
        goTo(index);
        pauseAndScheduleResume();
      });
      dotsEl.appendChild(dot);
      return dot;
    });
    syncDots();
  }

  function update() {
    track.style.transform = `translateX(${percentForIndex(activeIndex)}%)`;
    syncDots();
  }

  function goTo(index) {
    activeIndex = wrapIndex(index);
    update();
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

  prevBtn.addEventListener('click', () => {
    goTo(activeIndex - 1);
    pauseAndScheduleResume();
  });

  nextBtn.addEventListener('click', () => {
    goTo(activeIndex + 1);
    pauseAndScheduleResume();
  });

  attachDragGesture(viewport, {
    onStart() {
      stopAutoplay();
      clearTimeout(resumeTimer);
      dragBasePercent = percentForIndex(activeIndex);
      track.style.transition = 'none';
      viewport.classList.add('is-dragging');
    },
    onMove(deltaX) {
      const deltaPercent = (deltaX / viewport.clientWidth) * 100;
      track.style.transform = `translateX(${dragBasePercent + deltaPercent}%)`;
    },
    onEnd(deltaX, dragged) {
      track.style.transition = '';
      viewport.classList.remove('is-dragging');
      const slideWidthPx = viewport.clientWidth / slidesPerView();
      if (dragged && Math.abs(deltaX) > slideWidthPx * DRAG_SNAP_RATIO) {
        goTo(activeIndex + (deltaX < 0 ? 1 : -1));
      } else {
        update();
      }
      pauseAndScheduleResume();
    },
  });

  window.addEventListener(
    'resize',
    debounce(() => {
      renderDots();
      update();
    }, 150)
  );

  renderDots();
  update();
  startAutoplay();
}
