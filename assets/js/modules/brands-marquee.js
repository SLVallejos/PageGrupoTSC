import { debounce, prefersReducedMotion } from '../utils.js';

/**
 * Marquee de marcas con arrastre. Reemplaza el scroll infinito 100% CSS
 * (@keyframes) por un loop en requestAnimationFrame, porque un arrastre
 * interrumpible necesita poder leer y modificar la posición actual en
 * cualquier momento — algo que una animación CSS declarativa no permite
 * sin que la reanudación "salte". El contenido está duplicado en el HTML
 * (mismo truco que ya usaba la versión CSS) para que el loop sea continuo.
 */

const LOOP_DURATION_MS = 30000;
const RESUME_DELAY_MS = 2000;

export function initBrandsMarquee(trackEl) {
  if (!trackEl || prefersReducedMotion()) return;

  const rootEl = trackEl.parentElement;
  let loopWidth = trackEl.scrollWidth / 2;
  let speed = loopWidth / LOOP_DURATION_MS;
  let position = 0;
  let isDragging = false;
  let isFocused = false;
  let isSettling = false;
  let settleTimer = null;
  let dragStartX = 0;
  let dragStartPosition = 0;
  let lastFrameTime = null;

  function wrap(value) {
    let v = value % loopWidth;
    if (v > 0) v -= loopWidth;
    return v;
  }

  function applyTransform() {
    trackEl.style.transform = `translateX(${position}px)`;
  }

  function tick(now) {
    if (lastFrameTime === null) lastFrameTime = now;
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    if (!isDragging && !isFocused && !isSettling) {
      position = wrap(position - speed * dt);
      applyTransform();
    }

    requestAnimationFrame(tick);
  }

  function clearSettleTimer() {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  }

  function scheduleResume() {
    clearSettleTimer();
    isSettling = true;
    settleTimer = setTimeout(() => {
      isSettling = false;
    }, RESUME_DELAY_MS);
  }

  function onPointerDown(event) {
    isDragging = true;
    dragStartX = event.clientX;
    dragStartPosition = position;
    clearSettleTimer();
    isSettling = false;
    trackEl.classList.add('is-dragging');
    // setPointerCapture puede fallar en casos límite (ej. multi-touch);
    // no debe impedir que el arrastre siga funcionando si eso pasa.
    try {
      trackEl.setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  }

  function onPointerMove(event) {
    if (!isDragging) return;
    position = wrap(dragStartPosition + (event.clientX - dragStartX));
    applyTransform();
  }

  function endDrag(event) {
    if (!isDragging) return;
    isDragging = false;
    trackEl.classList.remove('is-dragging');
    try {
      if (trackEl.hasPointerCapture(event.pointerId)) {
        trackEl.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* noop */
    }
    scheduleResume();
  }

  trackEl.addEventListener('pointerdown', onPointerDown);
  trackEl.addEventListener('pointermove', onPointerMove);
  trackEl.addEventListener('pointerup', endDrag);
  trackEl.addEventListener('pointercancel', endDrag);

  // El autoplay NO se pausa por hover — sólo por arrastre real o cuando el
  // usuario navega con teclado hasta un link dentro del marquee (para que
  // pueda leerlo sin que el texto se mueva bajo el foco).
  rootEl.addEventListener('focusin', () => {
    isFocused = true;
  });
  rootEl.addEventListener('focusout', () => {
    isFocused = false;
  });

  window.addEventListener(
    'resize',
    debounce(() => {
      loopWidth = trackEl.scrollWidth / 2;
      speed = loopWidth / LOOP_DURATION_MS;
      position = wrap(position);
    }, 200)
  );

  requestAnimationFrame(tick);
}
