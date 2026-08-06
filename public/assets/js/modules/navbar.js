import { qs, qsa, debounce } from '../utils.js';

const SCROLL_THRESHOLD = 40;
const ACTIVE_LINK_ROOT_MARGIN = '-40% 0px -55% 0px';

function setHeaderHeight(header) {
  document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
}

function initHeaderScrollState(header) {
  const onScroll = () => {
    header.classList.toggle('site-header--scrolled', window.scrollY > SCROLL_THRESHOLD);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initMobileMenu(toggle, menu) {
  const closeMenu = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
    document.body.classList.remove('no-scroll');
  };

  const openMenu = () => {
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Cerrar menú');
    document.body.classList.add('no-scroll');
  };

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.contains('is-open');
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      toggle.focus();
    }
  });

  qsa('a[href^="#"]', menu).forEach((link) => {
    link.addEventListener('click', closeMenu);
  });
}

function initActiveLinkTracking(menu) {
  const links = qsa('a[href^="#"]', menu);
  const sections = qsa('main section[id], section[id]');
  if (!links.length || !sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          link.classList.remove('is-active');
          link.removeAttribute('aria-current');
        });
        const match = links.find((link) => link.getAttribute('href') === `#${entry.target.id}`);
        if (match) {
          match.classList.add('is-active');
          match.setAttribute('aria-current', 'true');
        }
      });
    },
    { rootMargin: ACTIVE_LINK_ROOT_MARGIN }
  );

  sections.forEach((section) => observer.observe(section));
}

export function initNavbar() {
  const header = qs('#site-header');
  const toggle = qs('#menu-toggle');
  const menu = qs('#menu-principal');
  if (!header || !toggle || !menu) return;

  setHeaderHeight(header);
  window.addEventListener('load', () => setHeaderHeight(header));
  window.addEventListener('resize', debounce(() => setHeaderHeight(header), 150));

  initHeaderScrollState(header);
  initMobileMenu(toggle, menu);
  initActiveLinkTracking(menu);
}
