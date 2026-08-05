import { qsa } from '../utils.js';

/**
 * Controlador de tabs accesible (patrón WAI-ARIA APG), reemplaza
 * TechTabs.jsx y SolutionsTabs.jsx. Opera sobre markup ya renderizado en
 * index.html (todos los paneles existen en el HTML fuente, sólo el activo
 * es visible) — no genera contenido por JS, para que el contenido de cada
 * tab exista siempre, con o sin JavaScript.
 */
export function initTabs(listEl, { orientation = 'horizontal' } = {}) {
  if (!listEl) return;

  const buttons = qsa('[role="tab"]', listEl);
  if (!buttons.length) return;

  const nextKeys = orientation === 'vertical' ? ['ArrowDown', 'ArrowRight'] : ['ArrowRight'];
  const prevKeys = orientation === 'vertical' ? ['ArrowUp', 'ArrowLeft'] : ['ArrowLeft'];

  function activate(button, { focus = false } = {}) {
    buttons.forEach((btn) => {
      const isActive = btn === button;
      btn.setAttribute('aria-selected', String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      panel?.classList.toggle('is-active', isActive);
      if (isActive && focus) btn.focus();
    });
  }

  buttons.forEach((btn, index) => {
    btn.addEventListener('click', () => activate(btn));
    btn.addEventListener('keydown', (event) => {
      if (nextKeys.includes(event.key)) {
        event.preventDefault();
        activate(buttons[(index + 1) % buttons.length], { focus: true });
      } else if (prevKeys.includes(event.key)) {
        event.preventDefault();
        activate(buttons[(index - 1 + buttons.length) % buttons.length], { focus: true });
      } else if (event.key === 'Home') {
        event.preventDefault();
        activate(buttons[0], { focus: true });
      } else if (event.key === 'End') {
        event.preventDefault();
        activate(buttons[buttons.length - 1], { focus: true });
      }
    });
  });
}
