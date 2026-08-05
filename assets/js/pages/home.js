import { qs } from '../utils.js';
import { initNavbar } from '../modules/navbar.js';
import { initAnimations } from '../animations.js';
import { initTabs } from '../modules/tabs.js';
import { initAccordion } from '../modules/accordion.js';
import { createCarousel } from '../modules/carousel.js';
import { initContactForm } from '../modules/contact-form.js';

/**
 * Wiring de la home. Todo el contenido de cada sección ya existe en
 * index.html (HTML estático, ver data/*.js para el porqué); acá sólo se
 * conecta el comportamiento de las piezas interactivas.
 */
export function initHomePage() {
  initNavbar();
  initAnimations();
  initTabs(qs('#tech-tablist'), { orientation: 'horizontal' });
  initTabs(qs('#solutions-tablist'), { orientation: 'vertical' });
  initAccordion(qs('#faq-accordion'));
  createCarousel(qs('#projects-carousel'));
  initContactForm(qs('#contact-form'));
}
