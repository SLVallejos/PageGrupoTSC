import { qs, qsa, clamp, debounce } from '../utils.js';

/**
 * Carrusel de una franja (track con transform: translateX), reemplaza
 * Swiper para Proyectos. Sin loop infinito, igual que la configuración
 * original de Swiper (los botones se deshabilitan en los extremos).
 * Opera sobre markup ya renderizado por pages/home.js — a diferencia de
 * tabs.js/accordion.js no necesita generar IDs dinámicos, así que no hace
 * falta el patrón de renderizado por callback.
 */

const MD_BREAKPOINT = 768;

export function createCarousel(rootEl) {
  if (!rootEl) return;

  const track = qs('.carousel-track', rootEl);
  const slides = qsa('.carousel-slide', track);
  const prevBtn = qs('.carousel-btn--prev', rootEl);
  const nextBtn = qs('.carousel-btn--next', rootEl);
  if (!track || !slides.length || !prevBtn || !nextBtn) return;

  slides.forEach((slide, index) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'diapositiva');
    slide.setAttribute('aria-label', `${index + 1} de ${slides.length}`);
  });

  let activeIndex = 0;

  function slidesPerView() {
    return window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`).matches ? 2 : 1;
  }

  function maxIndex() {
    return Math.max(slides.length - slidesPerView(), 0);
  }

  function update() {
    activeIndex = clamp(activeIndex, 0, maxIndex());
    track.style.transform = `translateX(-${activeIndex * (100 / slidesPerView())}%)`;
    prevBtn.disabled = activeIndex === 0;
    nextBtn.disabled = activeIndex >= maxIndex();
  }

  prevBtn.addEventListener('click', () => {
    activeIndex -= 1;
    update();
  });

  nextBtn.addEventListener('click', () => {
    activeIndex += 1;
    update();
  });

  window.addEventListener('resize', debounce(update, 150));

  update();
}
