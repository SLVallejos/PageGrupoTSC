import { qs, qsa, clamp, prefersReducedMotion } from '../utils.js';

/**
 * Anima los mockups visuales de "Nuestras Áreas de Trabajo" (rack, WiFi,
 * accesos, telefonía, help desk) y resuelve el CTA inteligente que
 * precompleta el formulario de contacto. Opera sobre markup ya renderizado
 * (ver data/technologies.js): cada `.tech-visual__body[data-live]` guarda su
 * HTML original al iniciar para poder "reiniciar" la animación cada vez que
 * se vuelve a esa pestaña, en vez de dejarla a mitad de camino.
 */

const ACCESS_NAMES = ['M. Gómez — Oficinas', 'Depósito 09:15', 'R. Torres — Planta', 'Recepción 10:03', 'Desconocido'];

function startRackThroughput(container, registerInterval) {
  const valueEl = qs('[data-role="value"]', container);
  if (!valueEl) return;
  const tick = () => {
    valueEl.textContent = `${Math.round(120 + Math.random() * 360)} Mbps`;
  };
  tick();
  registerInterval(setInterval(tick, 1500));
}

function startWifiCount(container, registerInterval) {
  const valueEl = qs('[data-role="value"]', container);
  if (!valueEl) return;
  let count = 0;
  const target = 9;
  const rampId = setInterval(() => {
    count += 1;
    valueEl.textContent = String(count);
    if (count >= target) {
      clearInterval(rampId);
      registerInterval(
        setInterval(() => {
          count = clamp(count + (Math.random() < 0.5 ? -1 : 1), 6, 14);
          valueEl.textContent = String(count);
        }, 3200)
      );
    }
  }, 180);
  registerInterval(rampId);
}

function scheduleAccessEvent(container, registerInterval, registerTimeout) {
  const reader = qs('[data-role="reader"]', container);
  const log = qs('[data-role="log"]', container);
  if (!reader || !log) return;

  const addEvent = () => {
    const denied = Math.random() < 0.25;
    reader.classList.toggle('is-granting', !denied);
    registerTimeout(setTimeout(() => reader.classList.remove('is-granting'), 900));

    const row = document.createElement('div');
    row.className = `tv-access__row is-new${denied ? ' is-denied' : ''}`;
    const name = ACCESS_NAMES[Math.floor(Math.random() * ACCESS_NAMES.length)];
    row.innerHTML = `<span>${name}</span><span>${denied ? 'Denegado' : 'Concedido'}</span>`;
    log.prepend(row);
    while (log.children.length > 3) log.lastElementChild.remove();
    registerTimeout(setTimeout(() => row.classList.remove('is-new'), 500));
  };

  registerInterval(setInterval(addEvent, 4200));
}

function startCallTimer(container, registerInterval) {
  const timerEl = qs('[data-role="timer"]', container);
  if (!timerEl) return;
  let seconds = 0;
  registerInterval(
    setInterval(() => {
      seconds += 1;
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }, 1000)
  );
}

function scheduleTicketUpdate(container, registerInterval, registerTimeout) {
  const statusEl = qs('[data-role="ticket-status"]', container);
  if (!statusEl) return;

  registerTimeout(
    setTimeout(() => {
      statusEl.textContent = 'En curso';
      statusEl.classList.replace('tv-help__status--open', 'tv-help__status--progress');
    }, 3200)
  );
  registerTimeout(
    setTimeout(() => {
      statusEl.textContent = 'Resuelto';
      statusEl.classList.replace('tv-help__status--progress', 'tv-help__status--done');
    }, 7200)
  );
}

const LIVE_STARTERS = {
  redes: startRackThroughput,
  wifi: startWifiCount,
  acceso: scheduleAccessEvent,
  telefonia: startCallTimer,
  soporte: scheduleTicketUpdate,
};

function initLiveMockups(wrapperEl, tablistEl) {
  const panels = qsa('.tab-panel', wrapperEl);
  if (!panels.length) return;

  const snapshots = new Map();
  panels.forEach((panel) => {
    const visual = qs('[data-live]', panel);
    if (visual) snapshots.set(panel.id, visual.innerHTML);
  });

  let intervalIds = [];
  let timeoutIds = [];
  let isInView = false;
  let currentPanel = panels.find((panel) => panel.classList.contains('is-active')) || panels[0];

  function registerInterval(id) {
    if (id) intervalIds.push(id);
  }
  function registerTimeout(id) {
    if (id) timeoutIds.push(id);
  }
  function clearMockTimers() {
    intervalIds.forEach(clearInterval);
    timeoutIds.forEach(clearTimeout);
    intervalIds = [];
    timeoutIds = [];
  }

  function activate(panel) {
    clearMockTimers();
    currentPanel = panel;
    const visual = qs('[data-live]', panel);
    if (!visual) return;
    const snapshot = snapshots.get(panel.id);
    if (snapshot !== undefined) visual.innerHTML = snapshot;
    if (prefersReducedMotion() || !isInView) return;
    LIVE_STARTERS[visual.dataset.live]?.(visual, registerInterval, registerTimeout);
  }

  qsa('[role="tab"]', tablistEl).forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (panel) activate(panel);
    });
  });

  if (prefersReducedMotion()) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isInView = entry.isIntersecting && document.visibilityState === 'visible';
        if (isInView) {
          activate(currentPanel);
        } else {
          clearMockTimers();
        }
      });
    },
    { threshold: 0.15 }
  );
  observer.observe(wrapperEl);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearMockTimers();
    } else if (isInView) {
      activate(currentPanel);
    }
  });
}

function initTechCta() {
  const ctaLinks = qsa('.tech-cta');
  const typeSelect = qs('#tipo');
  const messageField = qs('#mensaje');
  const contactPanel = qs('.contact-panel--form');
  if (!ctaLinks.length || !typeSelect || !messageField) return;

  ctaLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      if (link.dataset.service) typeSelect.value = link.dataset.service;
      if (link.dataset.message) messageField.value = link.dataset.message;

      qs('#contacto')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });

      if (contactPanel) {
        contactPanel.classList.remove('is-flash');
        void contactPanel.offsetWidth;
        contactPanel.classList.add('is-flash');
        setTimeout(() => contactPanel.classList.remove('is-flash'), 1700);
      }
    });
  });
}

export function initTechShowcase(wrapperEl, tablistEl) {
  if (!wrapperEl || !tablistEl) return;
  initLiveMockups(wrapperEl, tablistEl);
  initTechCta();
}
