import { qs } from '../utils.js';
import { requireAuth, apiFetch, apiUpload, logout, initInactivityLogout } from '../modules/api-client.js';
import { showSection, setActiveSidebarLink, initPanelShell } from '../modules/panel-shell.js';

/**
 * Panel de cliente: crear tickets y hacer seguimiento de los propios (ver
 * estado/prioridad, leer y responder en el hilo de comentarios, subir
 * adjuntos). Sin controles de administración -- eso vive solo en
 * panel-admin.js. Un ticket RESUELTO queda de solo lectura: se muestra la
 * solución y se ocultan los forms de comentar/adjuntar.
 */

const ESTADOS = {
  ABIERTO: 'Abierto',
  PENDIENTE_ASIGNACION: 'Pendiente de asignación',
  EN_PROCESO: 'En proceso',
  ESCALADO: 'Escalado',
  EN_ESPERA: 'En espera',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};
const PRIORIDADES = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' };
const SLA_LABELS = { OK: 'SLA OK', PROXIMO: 'SLA próximo', VENCIDO: 'SLA vencido', CUMPLIDO: 'SLA cumplido', FUERA_PLAZO: 'Fuera de plazo' };
const EVENTO_LABELS = {
  CREADO: 'Ticket creado',
  ASIGNADO: 'Ticket asignado',
  LIBERADO: 'Ticket liberado',
  ESTADO: 'Cambio de estado',
  PRIORIDAD: 'Cambio de prioridad',
  ESCALADO: 'Escalado',
  COMENTARIO: 'Comentario',
  RESUELTO: 'Ticket resuelto',
  PAUSADO: 'Puesto en espera',
  REANUDADO: 'Reanudado',
  DEVUELTO: 'Devuelto al agente original',
  CERRADO: 'Ticket cerrado',
  CANCELADO: 'Ticket cancelado',
};
const PAGE_SIZE = 10;
const ADJUNTOS_ACEPTADOS = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';
const INACTIVIDAD_TIMEOUT_MS = 15 * 60 * 1000;

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

/** Avatar del agente que atiende el ticket: foto si tiene, si no un círculo con su inicial. */
function avatarHtml(fotoUrl, nombre, tamano = 'sm') {
  const claseTamano = `avatar--${tamano}`;
  if (fotoUrl) {
    return `<img src="${fotoUrl}" alt="" class="avatar ${claseTamano}" />`;
  }
  const inicial = (nombre || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="avatar-fallback ${claseTamano}">${escapeHtml(inicial)}</span>`;
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
      categoriaId: form.categoriaId.value,
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

/** Poblar el selector de categoría al crear ticket -- solo activas (el cliente no ve inactivas). Categoría obligatoria, por eso el placeholder queda disabled. */
async function cargarCategoriasSelect() {
  const res = await apiFetch('/api/categorias');
  if (!res.ok) return;

  const select = qs('#ticket-categoria');
  select.innerHTML =
    '<option value="" disabled selected>Seleccioná una categoría…</option>' +
    res.data.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
}

/* ====================================
   MIS TICKETS
==================================== */

function ticketCardHtml(t) {
  const estadoClase = `badge--estado-${t.estado.toLowerCase()}`;
  const prioridadClase = `badge--prioridad-${t.prioridad.toLowerCase()}`;
  const slaClase = `badge--sla-${t.slaEstado.toLowerCase()}`;
  const asignado = t.asignadoANombre
    ? `Lo está atendiendo ${avatarHtml(t.asignadoAFotoUrl, t.asignadoANombre, 'sm')} ${escapeHtml(t.asignadoANombre)}${t.asignadoATitulo ? ` · ${escapeHtml(t.asignadoATitulo)}` : ''}`
    : 'Todavía sin asignar';
  // RESUELTO, CERRADO y CANCELADO quedan de solo lectura por igual.
  const cancelado = t.estado === 'CANCELADO';
  const resuelto = t.estado === 'RESUELTO' || t.estado === 'CERRADO' || cancelado;
  // Nunca fue tomado por soporte -- se puede borrar de verdad, no solo cancelar.
  const puedeEliminar = t.agenteOriginalId === null && !cancelado;

  return `
    <article class="glass-card ticket-card${resuelto ? ' ticket-card--resuelto' : ''}" data-id="${t.id}">
      <div class="ticket-card__head" data-action="toggle">
        <span class="ticket-card__id">#${t.id}</span>
        <div style="flex:1; min-width:180px;">
          <div class="ticket-card__titulo">${escapeHtml(t.titulo)}</div>
          <div class="ticket-card__meta">${formatFecha(t.fechaCreacion)} · ${asignado}</div>
        </div>
        ${t.categoriaNombre ? `<span class="badge badge--categoria">${escapeHtml(t.categoriaNombre)}</span>` : ''}
        <span class="badge badge--estado ${estadoClase}">${ESTADOS[t.estado] || t.estado}</span>
        <span class="badge badge--prioridad ${prioridadClase}">${PRIORIDADES[t.prioridad] || t.prioridad}</span>
        <span class="badge ${slaClase}" title="Vence: ${formatFecha(t.slaVencimiento)}">${SLA_LABELS[t.slaEstado] || t.slaEstado}</span>
        <svg class="ticket-card__toggle" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="ticket-card__body">
        <p class="ticket-card__descripcion">${escapeHtml(t.descripcion)}</p>

        ${
          resuelto && !cancelado
            ? `<div class="solucion-box">
                 <strong>Solución</strong>
                 <p>${escapeHtml(t.solucion)}</p>
                 <span class="ticket-card__meta">Resuelto el ${formatFecha(t.fechaResuelto)}</span>
               </div>`
            : ''
        }
        ${
          cancelado
            ? `<div class="solucion-box">
                 <strong>Ticket cancelado</strong>
                 <p>El motivo queda registrado en el Historial, más abajo.</p>
               </div>`
            : ''
        }

        ${
          resuelto
            ? ''
            : `<div class="ticket-card__controls">
                 <button type="button" class="btn btn-secondary btn--sm" data-action="cancelar-toggle">Cancelar ticket</button>
                 ${puedeEliminar ? '<button type="button" class="btn btn-secondary btn--sm" data-action="eliminar-toggle">Eliminar ticket</button>' : ''}
               </div>
               <div class="resolver-form" data-role="cancelar-form" hidden>
                 <input type="text" class="field__input" placeholder="Motivo de la cancelación…" required maxlength="500" data-role="cancelar-motivo" />
                 <button type="button" class="btn btn-primary btn--sm" data-action="cancelar-confirmar">Confirmar cancelación</button>
               </div>
               ${
                 puedeEliminar
                   ? `<div class="resolver-form" data-role="eliminar-form" hidden>
                        <p class="ticket-card__meta">¿Seguro? Esto borra el ticket por completo y no se puede deshacer.</p>
                        <button type="button" class="btn btn-primary btn--sm" data-action="eliminar-confirmar">Sí, eliminar</button>
                      </div>`
                   : ''
               }`
        }

        <div class="adjuntos-section">
          <strong class="adjuntos-section__title">Adjuntos</strong>
          <ul class="adjuntos-list" data-role="adjuntos"><li class="panel-status">Cargando…</li></ul>
          ${
            resuelto
              ? ''
              : `<form class="adjunto-form" data-action="subir-adjunto">
                   <input type="file" accept="${ADJUNTOS_ACEPTADOS}" required />
                   <button type="submit" class="btn btn-secondary btn--sm">Subir</button>
                 </form>`
          }
        </div>

        <div class="comment-thread" data-role="comments">
          <p class="panel-status">Cargando comentarios…</p>
        </div>
        ${
          resuelto
            ? ''
            : `<form class="comment-form" data-action="comentar">
                 <textarea class="field__input" placeholder="Agregar información o responder…" required maxlength="4000"></textarea>
                 <button type="submit" class="btn btn-primary btn--sm" style="align-self:flex-end;">Comentar</button>
               </form>`
        }

        <div class="adjuntos-section">
          <strong class="adjuntos-section__title">Historial</strong>
          <div class="comment-thread" data-role="eventos">
            <p class="panel-status">Cargando historial…</p>
          </div>
        </div>
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

async function cargarAdjuntos(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/adjuntos`);
  if (!res.ok) {
    container.innerHTML = '<li class="panel-status">No se pudieron cargar los adjuntos.</li>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<li class="panel-status">Todavía no hay adjuntos.</li>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (a) => `
      <li class="adjunto-item">
        <a href="${a.urlDescarga}" target="_blank" rel="noopener">${escapeHtml(a.nombreOriginal)}</a>
        <span class="adjunto-item__meta">${escapeHtml(a.autorNombre)} · ${formatFecha(a.fechaCreacion)}</span>
      </li>
    `
    )
    .join('');
}

/** Texto de detalle de un evento -- mismo criterio que panel-admin.js (ESCALADO arma su texto, ESTADO/PRIORIDAD traducen el código crudo). */
function detalleEventoTexto(e) {
  if (e.tipo === 'ESCALADO') {
    const motivo = e.motivo ? ` — Motivo: ${escapeHtml(e.motivo)}` : '';
    return `Nivel ${e.nivelAnterior} → Nivel ${e.nivelNuevo}${motivo}`;
  }
  if (e.tipo === 'ESTADO') {
    return `Nuevo estado: ${ESTADOS[e.detalle] || e.detalle}`;
  }
  if (e.tipo === 'PRIORIDAD') {
    return `Nueva prioridad: ${PRIORIDADES[e.detalle] || e.detalle}`;
  }
  if (e.tipo === 'CANCELADO') {
    return `Motivo: ${escapeHtml(e.motivo || '')}`;
  }
  return escapeHtml(e.detalle || '');
}

async function cargarEventos(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/eventos`);
  if (!res.ok) {
    container.innerHTML = '<p class="panel-status">No se pudo cargar el historial.</p>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<p class="panel-status">Sin eventos todavía.</p>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (e) => `
      <div class="comment-item">
        <div class="comment-item__meta"><span>${EVENTO_LABELS[e.tipo] || e.tipo} · ${escapeHtml(e.autorNombre)}</span><span>${formatFecha(e.fecha)}</span></div>
        <div class="comment-item__texto">${detalleEventoTexto(e)}</div>
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
    const card = event.target.closest('.ticket-card');
    if (!card) return;

    if (event.target.closest('[data-action="toggle"]')) {
      const wasOpen = card.classList.contains('is-open');
      card.classList.toggle('is-open', !wasOpen);
      if (!wasOpen && !card.dataset.detalleCargado) {
        card.dataset.detalleCargado = '1';
        await Promise.all([
          cargarComentarios(card.dataset.id, qs('[data-role="comments"]', card)),
          cargarAdjuntos(card.dataset.id, qs('[data-role="adjuntos"]', card)),
          cargarEventos(card.dataset.id, qs('[data-role="eventos"]', card)),
        ]);
      }
      return;
    }

    if (event.target.closest('[data-action="cancelar-toggle"]')) {
      const form = qs('[data-role="cancelar-form"]', card);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="cancelar-confirmar"]')) {
      const form = qs('[data-role="cancelar-form"]', card);
      const motivo = qs('[data-role="cancelar-motivo"]', form).value.trim();
      if (!motivo) return;

      const res = await apiFetch(`/api/tickets/${card.dataset.id}/cancelar`, { method: 'PATCH', body: { motivo } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo cancelar el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket cancelado.', 'success');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="eliminar-toggle"]')) {
      const form = qs('[data-role="eliminar-form"]', card);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="eliminar-confirmar"]')) {
      const res = await apiFetch(`/api/tickets/${card.dataset.id}`, { method: 'DELETE' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo eliminar el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket eliminado.', 'success');
      cargarTickets();
    }
  });

  listEl.addEventListener('submit', async (event) => {
    const card = event.target.closest('.ticket-card');
    if (!card) return;

    if (event.target.matches('[data-action="comentar"]')) {
      event.preventDefault();
      const textarea = qs('textarea', event.target);
      const comentario = textarea.value.trim();
      if (!comentario) return;

      const res = await apiFetch(`/api/tickets/${card.dataset.id}/comentarios`, { method: 'POST', body: { comentario } });
      if (!res.ok) return;

      textarea.value = '';
      await cargarComentarios(card.dataset.id, qs('[data-role="comments"]', card));
      return;
    }

    if (event.target.matches('[data-action="subir-adjunto"]')) {
      event.preventDefault();
      const input = qs('input[type="file"]', event.target);
      const archivo = input.files[0];
      if (!archivo) return;

      const formData = new FormData();
      formData.append('archivo', archivo);

      const res = await apiUpload(`/api/tickets/${card.dataset.id}/adjuntos`, formData);
      if (!res.ok) return;

      input.value = '';
      await cargarAdjuntos(card.dataset.id, qs('[data-role="adjuntos"]', card));
    }
  });

  cargarTickets();
}

/* ====================================
   INIT
==================================== */

/** Sidebar simple: solo dos secciones, sin filtros que aplicar (a diferencia del panel admin). */
function initSidebarNav() {
  qs('#panel-sidebar').addEventListener('click', (event) => {
    const link = event.target.closest('.panel-sidebar__link');
    if (!link) return;
    event.preventDefault();

    showSection(link.dataset.section);
    setActiveSidebarLink(link);
  });
}

function initHeader(usuario) {
  qs('#panel-user-name').textContent = usuario.nombre;
  qs('#logout-btn').addEventListener('click', async () => {
    await logout();
    window.location.href = 'login.html';
  });
}

const usuarioActual = await requireAuth(['CLIENTE']);
if (usuarioActual) {
  initPanelShell();
  initHeader(usuarioActual);
  initSidebarNav();
  initInactivityLogout(INACTIVIDAD_TIMEOUT_MS);
  showSection('inicio');
  initCrearTicket();
  cargarCategoriasSelect();
  initTicketsSection();
}
