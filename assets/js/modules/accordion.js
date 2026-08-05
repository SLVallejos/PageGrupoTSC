import { qsa } from '../utils.js';

/**
 * Acordeón de apertura exclusiva, reemplaza FAQAccordion.jsx. Opera sobre
 * markup ya renderizado (las 6 preguntas y respuestas están en el HTML
 * fuente; sólo se togglea `aria-expanded` + `.is-open`) — mismo motivo que
 * tabs.js: el contenido tiene que existir sin depender de JS.
 */
export function initAccordion(containerEl) {
  if (!containerEl) return;

  const triggers = qsa('.accordion-trigger', containerEl);

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const wasOpen = trigger.getAttribute('aria-expanded') === 'true';

      triggers.forEach((otherTrigger) => {
        const panel = document.getElementById(otherTrigger.getAttribute('aria-controls'));
        const willOpen = otherTrigger === trigger && !wasOpen;
        otherTrigger.setAttribute('aria-expanded', String(willOpen));
        panel?.classList.toggle('is-open', willOpen);
      });
    });
  });
}
