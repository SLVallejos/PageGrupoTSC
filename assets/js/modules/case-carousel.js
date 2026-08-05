import { qsa } from '../utils.js';

/**
 * Carrusel central con tarjeta desplegable para Casos de Éxito. Las 4
 * tarjetas ya existen en el HTML (desafío/solución incluidos, para SEO y
 * uso sin JS); acá sólo se reordena visualmente cuál queda al centro
 * (vía CSS `order`) y se togglea el desplegable de la tarjeta activa —
 * mismo patrón que tabs.js/accordion.js: comportamiento, no contenido.
 */
export function initCaseCarousel(rootEl, dotsEl) {
  if (!rootEl) return;

  const cards = qsa('.case-card', rootEl);
  if (!cards.length) return;

  const dots = dotsEl ? qsa('button', dotsEl) : [];
  let activeIndex = 0;
  let expanded = false;

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

  cards.forEach((card, index) => {
    card.addEventListener('click', () => {
      if (index === activeIndex) {
        expanded = !expanded;
      } else {
        activeIndex = index;
        expanded = false;
      }
      render();
    });
  });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      activeIndex = index;
      expanded = false;
      render();
    });
  });

  render();
}
