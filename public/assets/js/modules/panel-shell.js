import { qs, qsa } from '../utils.js';

/**
 * Muestra la sección `key` (`data-section` en `.panel-section`) y oculta el
 * resto. No hay routing real (sin cambios de URL/hash) -- las secciones ya
 * existían todas en el DOM, esto solo controla visibilidad. No toca el
 * resaltado del sidebar -- varios links pueden compartir el mismo
 * `data-section` (ej. "Todos"/"Nivel 1"/"Mis tickets" son todos
 * `data-section="tickets"` con distinto filtro), así que qué link queda
 * activo lo decide quien llama (ver `setActiveSidebarLink`).
 *
 * El header es `position: fixed` (ver panels.css), así que el dropdown
 * de usuario sigue visible sin importar cuánto scroll tenga la página --
 * si se cambia de sección estando scrolleado (ej. abajo del todo en una
 * lista larga de tickets) y la sección nueva es más corta, queda fuera
 * de la ventana y parece que el click "no hizo nada". Por eso todo
 * cambio de sección resetea el scroll al tope.
 */
export function showSection(key) {
  qsa('.panel-section').forEach((el) => el.classList.toggle('is-hidden', el.dataset.section !== key));
  window.scrollTo(0, 0);
}

/** Marca `link` como el único ítem activo del sidebar (o ninguno, si se pasa null). */
export function setActiveSidebarLink(link) {
  qsa('.panel-sidebar__link').forEach((el) => el.classList.toggle('is-active', el === link));
}

/**
 * Sidebar como drawer en mobile: mismo patrón que `initMobileMenu` de
 * navbar.js (clase `is-open`, `aria-expanded`, bloqueo de scroll, cierre
 * con Escape), adaptado a los ids propios del panel (no se reutiliza el
 * de navbar.js porque apunta a `#site-header`/`#menu-toggle`/
 * `#menu-principal`, que no existen acá).
 */
export function initMobileDrawer() {
  const toggle = qs('#panel-menu-toggle');
  const sidebar = qs('#panel-sidebar');
  const backdrop = qs('#panel-sidebar-backdrop');
  if (!toggle || !sidebar || !backdrop) return;

  const close = () => {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  };

  const open = () => {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
  };

  toggle.addEventListener('click', () => (sidebar.classList.contains('is-open') ? close() : open()));
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  // Navegar desde el drawer (mobile) lo cierra solo, sin un segundo tap.
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('.panel-sidebar__link')) close();
  });
}

/** Dropdown de "Hola, {nombre}" -- abre/cierra, se cierra al clickear afuera o con Escape. */
export function initUserMenu() {
  const trigger = qs('#panel-user-trigger');
  const menu = qs('#panel-user-menu');
  if (!trigger || !menu) return;

  trigger.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !event.target.closest('.panel-header__user')) menu.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') menu.hidden = true;
  });
}

export function initPanelShell() {
  initMobileDrawer();
  initUserMenu();
}
