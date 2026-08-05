import { qs } from '../utils.js';
import { initNavbar } from '../modules/navbar.js';
import { initAnimations } from '../animations.js';
import { initHeroNetwork } from '../modules/hero-network.js';
import { initBrandsMarquee } from '../modules/brands-marquee.js';
import { initTabs } from '../modules/tabs.js';
import { initTechShowcase } from '../modules/tech-showcase.js';
import { initAccordion } from '../modules/accordion.js';
import { createCarousel } from '../modules/carousel.js';
import { initCaseCarousel } from '../modules/case-carousel.js';
import { initContactForm } from '../modules/contact-form.js';

/**
 * Wiring de la home. Todo el contenido de cada sección ya existe en
 * index.html (HTML estático, ver data/*.js para el porqué); acá sólo se
 * conecta el comportamiento de las piezas interactivas.
 */
export function initHomePage() {
  initNavbar();
  initAnimations();
  initHeroNetwork(qs('#hero-network'));
  initBrandsMarquee(qs('#brands-track'));
  initTabs(qs('#tech-tablist'), { orientation: 'horizontal' });
  initTechShowcase(qs('#tech-panel-wrap'), qs('#tech-tablist'));
  initAccordion(qs('#faq-accordion'));
  createCarousel(qs('#projects-carousel'), qs('#projects-carousel-dots'));
  initCaseCarousel(qs('#case-carousel'), qs('#case-carousel-dots'));
  initContactForm(qs('#contact-form'));
}
