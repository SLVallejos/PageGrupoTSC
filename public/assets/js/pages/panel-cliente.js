import { qs } from '../utils.js';
import { requireAuth, apiFetch, logout } from '../modules/api-client.js';

/**
 * Panel de cliente: crear tickets y hacer seguimiento de los propios (ver
 * estado/prioridad, leer y responder en el hilo de comentarios). Sin
 * controles de administración -- eso vive solo en panel-admin.js.
 */

const ESTADOS = { ABIERTO: 'Abierto', EN_CURSO: 'En curso', RESUELTO: 'Resuelto', CERRADO: 'Cerrado' };
const PRIORIDADES = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' };
const PAGE_SIZE = 10;

let ticketsPage = 1;
let ticketsTotalPages = 1;

/** Escapa texto para insertarlo de forma segura dentro de HTML (evita XSS con datos de tickets/comentarios). */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mostrarAlerta(elId, mensaje, tipo = 'error') {
  const el = qs(`#${elId}`);
  if (!el) return;
  el.textContent = mensaje;
  el.className = `panel-alert is-visible${tipo === 'success' ? ' panel-alert--success' : ''}`;
  if (tipo === 'success') setTimeout(() => el.classList.remove('is-visible'), 4000);
}

/* ====================================
   CREAR TICKET
==================================== */

function initCrearTicket() {
  qs('#crear-ticket-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      titulo: form.titulo.value.trim(),
      descripcion: form.descripcion.value.trim(),
      prioridad: form.prioridad.value,
    };
    const res = await apiFetch('/api/tickets', { method: 'POST', body });
    if (!res.ok) {
      mostrarAlerta('crear-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudo crear el ticket.');
      return;
    }
    mostrarAlerta('crear-alert', 'Ticket creado. Te vamos a avisar por acá cuando tengamos novedades.', 'success');
    form.reset();
    qs('#ticket-prioridad').value = 'MEDIA';
    ticketsPage = 1;
    cargarTickets();
  });
}

/* ====================================
   MIS TICKETS
==================================== */

function ticketCardHtml(t) {
  const estadoClase = `badge--estado-${t.estado.toLowerCase()}`;
  const prioridadClase = `badge--prioridad-${t.prioridad.toLowerCase()}`;
  const asignado = t.asignadoANombre ? `Lo está atendiendo ${escapeHtml(t.asignadoANombre)}` : 'Todavía sin asignar';

  return `
    <article class="glass-card ticket-card" data-id="${t.id}">
      <div class="ticket-card__head" data-action="toggle">
        <span class="ticket-card__id">#${t.id}</span>
        <div style="flex:1; min-width:180px;">
          <div class="ticket-card__titulo">${escapeHtml(t.titulo)}</div>
          <div class="ticket-card__meta">${formatFecha(t.fechaCreacion)} · ${asignado}</div>
        </div>
        <span class="badge badge--estado ${estadoClase}">${ESTADOS[t.estado] || t.estado}</span>
        <span class="badge badge--prioridad ${prioridadClase}">${PRIORIDADES[t.prioridad] || t.prioridad}</span>
        <svg class="ticket-card__toggle" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="ticket-card__body">
        <p class="ticket-card__descripcion">${escapeHtml(t.descripcion)}</p>

        <div class="comment-thread" data-role="comments">
          <p class="panel-status">Cargando comentarios…</p>
        </div>
        <form class="comment-form" data-action="comentar">
          <textarea class="field__input" placeholder="Agregar información o responder…" required maxlength="4000"></textarea>
          <button type="submit" class="btn btn-primary btn--sm" style="align-self:flex-end;">Comentar</button>
        </form>
      </div>
    </article>
  `;
}

async function cargarTickets() {
  const statusEl = qs('#tickets-status');
  const listEl = qs('#tickets-list');
  statusEl.textContent = 'Cargando tickets…';
  statusEl.style.display = 'block';
  listEl.innerHTML = '';

  const res = await apiFetch(`/api/tickets?page=${ticketsPage}&pageSize=${PAGE_SIZE}`);
  if (!res.ok) {
    statusEl.textContent = 'No se pudieron cargar tus tickets.';
    return;
  }

  ticketsTotalPages = res.pagination?.totalPages || 1;
  qs('#tickets-page-info').textContent = `Página ${ticketsPage} de ${ticketsTotalPages}`;
  qs('#tickets-prev').disabled = ticketsPage <= 1;
  qs('#tickets-next').disabled = ticketsPage >= ticketsTotalPages;

  if (!res.data.length) {
    statusEl.textContent = 'Todavía no creaste ningún ticket.';
    return;
  }

  statusEl.style.display = 'none';
  listEl.innerHTML = res.data.map(ticketCardHtml).join('');
}

async function cargarComentarios(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/comentarios`);
  if (!res.ok) {
    container.innerHTML = '<p class="panel-status">No se pudieron cargar los comentarios.</p>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<p class="panel-status">Todavía no hay respuestas.</p>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (c) => `
      <div class="comment-item">
        <div class="comment-item__meta"><span>${escapeHtml(c.usuarioNombre)}</span><span>${formatFecha(c.fechaCreacion)}</span></div>
        <div class="comment-item__texto">${escapeHtml(c.comentario)}</div>
      </div>
    `
    )
    .join('');
}

function initTicketsSection() {
  qs('#tickets-prev').addEventListener('click', () => {
    if (ticketsPage > 1) {
      ticketsPage -= 1;
      cargarTickets();
    }
  });
  qs('#tickets-next').addEventListener('click', () => {
    if (ticketsPage < ticketsTotalPages) {
      ticketsPage += 1;
      cargarTickets();
    }
  });

  const listEl = qs('#tickets-list');

  listEl.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-action="toggle"]')) return;
    const card = event.target.closest('.ticket-card');
    const wasOpen = card.classList.contains('is-open');
    card.classList.toggle('is-open', !wasOpen);
    if (!wasOpen && !card.dataset.comentariosCargados) {
      card.dataset.comentariosCargados = '1';
      await cargarComentarios(card.dataset.id, qs('[data-role="comments"]', card));
    }
  });

  listEl.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-action="comentar"]')) return;
    event.preventDefault();
    const card = event.target.closest('.ticket-card');
    const textarea = qs('textarea', event.target);
    const comentario = textarea.value.trim();
    if (!comentario) return;

    const res = await apiFetch(`/api/tickets/${card.dataset.id}/comentarios`, { method: 'POST', body: { comentario } });
    if (!res.ok) return;

    textarea.value = '';
    await cargarComentarios(card.dataset.id, qs('[data-role="comments"]', card));
  });

  cargarTickets();
}

/* ====================================
   INIT
==================================== */

function initHeader(usuario) {
  qs('#panel-user-name').textContent = usuario.nombre;
  qs('#logout-btn').addEventListener('click', async () => {
    await logout();
    window.location.href = 'login.html';
  });
}

const usuarioActual = await requireAuth(['CLIENTE']);
if (usuarioActual) {
  initHeader(usuarioActual);
  initCrearTicket();
  initTicketsSection();
}
