/**
 * Detección de arrastre horizontal (mouse, touch o stylus) mediante Pointer
 * Events, compartida entre carousel.js y case-carousel.js para no duplicar
 * la lógica de threshold + supresión de click accidental en cada carrusel.
 * Pointer Events unifica mouse/touch/pen en una sola API — evita mantener
 * handlers de touchstart/mousedown por separado.
 */

const CLICK_SUPPRESS_THRESHOLD = 6;

/**
 * Conecta un gesto de arrastre horizontal a un elemento.
 * @param {HTMLElement} el - elemento que escucha el gesto.
 * @param {object} handlers
 * @param {() => void} [handlers.onStart] - se dispara al presionar (antes de saber si habrá arrastre).
 * @param {(deltaX: number) => void} [handlers.onMove] - se dispara en cada movimiento con el desplazamiento acumulado en px.
 * @param {(deltaX: number, dragged: boolean) => void} [handlers.onEnd] - se dispara al soltar, con el desplazamiento final y si superó el umbral de "arrastre real".
 * @returns {() => void} función de limpieza para remover los listeners.
 */
export function attachDragGesture(el, { onStart, onMove, onEnd } = {}) {
  let isDragging = false;
  let dragged = false;
  let startX = 0;
  let activePointerId = null;

  function suppressNextClick() {
    const suppress = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    el.addEventListener('click', suppress, { capture: true, once: true });
    // Si finalmente no llega ningún click (ej. el puntero salió del elemento),
    // no dejamos el listener colgado para siempre.
    setTimeout(() => el.removeEventListener('click', suppress, { capture: true }), 400);
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    isDragging = true;
    dragged = false;
    startX = event.clientX;
    activePointerId = event.pointerId;
    onStart?.();
  }

  function onPointerMove(event) {
    if (!isDragging || event.pointerId !== activePointerId) return;
    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) > CLICK_SUPPRESS_THRESHOLD) {
      dragged = true;
      // setPointerCapture puede fallar en casos límite (ej. el pointerId ya
      // no está activo); no debe interrumpir el resto del gesto si eso pasa.
      try {
        el.setPointerCapture?.(activePointerId);
      } catch {
        /* noop */
      }
    }
    onMove?.(deltaX);
  }

  function endDrag(event) {
    if (!isDragging || event.pointerId !== activePointerId) return;
    isDragging = false;
    const deltaX = event.clientX - startX;
    try {
      if (el.hasPointerCapture?.(activePointerId)) el.releasePointerCapture(activePointerId);
    } catch {
      /* noop */
    }
    if (dragged) suppressNextClick();
    onEnd?.(deltaX, dragged);
  }

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', endDrag);
    el.removeEventListener('pointercancel', endDrag);
  };
}
